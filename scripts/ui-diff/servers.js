// Spawns and tears down the two long-lived processes a ui-diff run needs: the mock OBA backend
// and a vite dev server per ref. Both follow the same shape: spawn detached (so we own the whole
// process group and can kill vite's esbuild/node children), stream output to a log file plus an
// optional callback, and resolve readiness by polling rather than trusting stdout text.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const POLL_INTERVAL_MS = 250;

function httpOnce(url) {
	return new Promise((resolve, reject) => {
		const req = http.get(url, { timeout: 5000 }, (res) => {
			res.resume(); // drain so the socket frees even when the caller ignores the body
			resolve(res);
		});
		req.on('timeout', () => req.destroy(new Error('timeout')));
		req.on('error', reject);
	});
}

async function waitForHttp(url, { timeoutMs, isReady }) {
	const deadline = Date.now() + timeoutMs;
	let lastErr;
	while (Date.now() < deadline) {
		try {
			const res = await httpOnce(url);
			if (!isReady || isReady(res)) return;
		} catch (err) {
			lastErr = err;
		}
		await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
	}
	throw lastErr ?? new Error(`timed out waiting for ${url}`);
}

// Idempotent, process-group kill shared by both server types: SIGTERM the group, give it 5s to
// exit on its own (vite forks esbuild/rollup workers that ignore a plain child.kill), then
// SIGKILL. detached:true at spawn is what makes `-pid` address the whole group instead of just
// the immediate child.
function makeStopper(child) {
	let stopped = false;
	return function stop() {
		if (stopped || child.exitCode !== null || child.signalCode !== null) {
			stopped = true;
			return Promise.resolve();
		}
		stopped = true;
		return new Promise((resolve) => {
			const onExit = () => resolve();
			child.once('exit', onExit);
			try {
				process.kill(-child.pid, 'SIGTERM');
			} catch {
				// already gone
				child.off('exit', onExit);
				resolve();
				return;
			}
			const killTimer = setTimeout(() => {
				try {
					process.kill(-child.pid, 'SIGKILL');
				} catch {
					// already gone
				}
			}, 5000);
			child.once('exit', () => clearTimeout(killTimer));
		});
	};
}

// logPath is optional: startMockServer has no logDir/label in its contract signature, so it
// only forwards lines to onLog and keeps an in-memory tail for error messages.
function pipeToLogAndCallback(child, logPath, onLog) {
	if (logPath) fs.mkdirSync(path.dirname(logPath), { recursive: true });
	const logStream = logPath ? fs.createWriteStream(logPath, { flags: 'a' }) : null;
	const tail = [];
	const onChunk = (chunk) => {
		logStream?.write(chunk);
		const text = chunk.toString('utf8');
		for (const line of text.split('\n')) {
			if (line.length === 0) continue;
			tail.push(line);
			if (tail.length > 200) tail.shift();
			onLog?.(line);
		}
	};
	child.stdout.on('data', onChunk);
	child.stderr.on('data', onChunk);
	child.once('exit', () => logStream?.end());
	return tail;
}

/** Spawns `node scripts/mock-oba/server.js` from repoRoot. Resolves once GET /__control answers.
 *  @returns {Promise<{port:number, baseUrl:string, stop():Promise<void>}>} */
export async function startMockServer({ repoRoot, port, onLog }) {
	const baseUrl = `http://127.0.0.1:${port}`;
	const child = spawn('node', ['scripts/mock-oba/server.js'], {
		cwd: repoRoot,
		env: { ...process.env, MOCK_OBA_PORT: String(port) },
		detached: true,
		stdio: ['ignore', 'pipe', 'pipe']
	});
	const tail = pipeToLogAndCallback(child, undefined, onLog);

	try {
		await waitForHttp(`${baseUrl}/__control`, { timeoutMs: 30000 });
	} catch {
		const stop = makeStopper(child);
		await stop();
		throw new Error(
			`mock OBA server on port ${port} never answered GET /__control. Log tail:\n${tail.join('\n')}`
		);
	}

	return { port, baseUrl, stop: makeStopper(child) };
}

/** POST /__control. @param {Partial<{mode:string, delay:number, now:number|null}>} patch
 *  @returns {Promise<{mode:string, delay:number, now:number|null}>} */
export async function setMockMode(mockBaseUrl, patch) {
	const body = JSON.stringify(patch ?? {});
	return new Promise((resolve, reject) => {
		const req = http.request(
			`${mockBaseUrl}/__control`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
			},
			(res) => {
				const chunks = [];
				res.on('data', (c) => chunks.push(c));
				res.on('end', () => {
					const text = Buffer.concat(chunks).toString('utf8');
					let parsed;
					try {
						parsed = JSON.parse(text);
					} catch {
						reject(new Error(`POST ${mockBaseUrl}/__control returned non-JSON: ${text}`));
						return;
					}
					if (res.statusCode !== 200) {
						reject(new Error(`POST ${mockBaseUrl}/__control -> ${res.statusCode}: ${text}`));
						return;
					}
					resolve(parsed);
				});
			}
		);
		req.on('error', reject);
		req.write(body);
		req.end();
	});
}

/** Spawns `npx vite dev --port <port> --strictPort --host 127.0.0.1` with cwd=dir.
 *  Resolves once the port serves HTTP. Rejects after `timeoutMs` (default 120000) with the
 *  tail of the captured log in the message.
 *  @returns {Promise<{port:number, baseUrl:string, logPath:string, stop():Promise<void>}>} */
export async function startDevServer({
	dir,
	port,
	metricsPort,
	mockBaseUrl,
	label,
	logDir,
	onLog,
	timeoutMs = 120000
}) {
	const baseUrl = `http://127.0.0.1:${port}`;
	// Fixed identically across base/head so the only thing that can make a screenshot differ is
	// the code under test, not stray branding or a real upstream credential.
	const env = {
		...process.env,
		PUBLIC_OBA_SERVER_URL: `${mockBaseUrl}/`,
		PRIVATE_OBA_API_KEY: 'test',
		PUBLIC_OBA_REGION_NAME: 'Mock Transit',
		PUBLIC_OBA_LOGO_URL: '',
		METRICS_PORT: String(metricsPort),
		NODE_ENV: 'development',
		TZ: 'America/Los_Angeles'
	};

	const child = spawn(
		'npx',
		['vite', 'dev', '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
		{ cwd: dir, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] }
	);
	const logPath = path.join(logDir, `${label}.log`);
	const tail = pipeToLogAndCallback(child, logPath, onLog);

	try {
		// Any response at all — even a SvelteKit 404 — means vite is up; we don't require 200
		// because the app's own routing behavior isn't this function's concern.
		await waitForHttp(baseUrl, { timeoutMs });
	} catch {
		const stop = makeStopper(child);
		await stop();
		throw new Error(
			`dev server "${label}" on port ${port} never came up within ${timeoutMs}ms. Log tail:\n${tail.join('\n')}`
		);
	}

	return { port, baseUrl, logPath, stop: makeStopper(child) };
}
