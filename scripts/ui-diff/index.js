#!/usr/bin/env node
// Visual regression runner: boots two git refs side by side against one mock OBA backend,
// screenshots the same board scenarios through both, and writes a pixel diff report.
//
//   npm run ui-diff                         main vs HEAD, every scenario
//   npm run ui-diff -- --only normal,stale  just those scenarios
//   npm run ui-diff -- --base v1.2.0 --open compare against a tag, open the report
//   npm run ui-diff -- --clean              drop the cached worktrees and exit
//
// See CONTRACT.md in this directory for the module boundaries this file orchestrates.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

import { captureScenario, EPOCH_MS, withBrowser } from './capture.js';
import { diffPngs } from './diff.js';
import { writeReport, summaryTable } from './report.js';
import { selectScenarios } from './scenarios.js';
import { setMockMode, startDevServer, startMockServer } from './servers.js';
import { cleanWorktrees, prepareWorktree, resolveRef } from './worktrees.js';

const PORTS = {
	mock: 4010,
	base: { dev: 5273, metrics: 9219 },
	head: { dev: 5274, metrics: 9220 }
};

function parseArgs(argv) {
	const args = { base: 'main', head: 'HEAD', only: '', open: false, clean: false };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === '--open') args.open = true;
		else if (arg === '--clean') args.clean = true;
		else if (arg === '--base' || arg === '--head' || arg === '--only')
			args[arg.slice(2)] = argv[++i];
		else if (arg.startsWith('--')) throw new Error(`Unknown flag: ${arg}`);
	}
	if (!args.base || !args.head) throw new Error('--base and --head need a value');
	return args;
}

function log(msg) {
	console.log(`[ui-diff] ${msg}`);
}

async function git(repoRoot, args) {
	const { execFile } = await import('node:child_process');
	const { promisify } = await import('node:util');
	const { stdout } = await promisify(execFile)('git', args, { cwd: repoRoot });
	return stdout.trim();
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const repoRoot = await git(process.cwd(), ['rev-parse', '--show-toplevel']);

	if (args.clean) {
		const removed = await cleanWorktrees({ repoRoot });
		log(removed.length ? `removed ${removed.length} worktree(s)` : 'no cached worktrees');
		return 0;
	}

	const scenarios = selectScenarios(args.only);
	const startedAt = new Date();
	const runDir = path.join(repoRoot, '.ui-diff', startedAt.toISOString().replace(/[:.]/g, '-'));
	const logDir = path.join(runDir, 'logs');
	await fs.mkdir(logDir, { recursive: true });

	const base = await resolveRef(args.base, repoRoot);
	const head = await resolveRef(args.head, repoRoot);
	if (base.sha === head.sha) {
		log(`warning: ${args.base} and ${args.head} are the same commit — every diff will be 0%`);
	}
	log(`base ${base.shortSha} ${base.subject}`);
	log(`head ${head.shortSha} ${head.subject}`);

	/** @type {{stop: () => Promise<void>}[]} */
	const running = [];
	const run = { startedAt: startedAt.toISOString(), durationMs: 0, base, head, scenarios: [] };

	try {
		const mock = await startMockServer({ repoRoot, port: PORTS.mock });
		running.push(mock);
		// Pin the backend's clock to the same instant the browser clock is frozen at, so the
		// departure minutes it computes can't shift under a run that straddles a minute boundary.
		await setMockMode(mock.baseUrl, { now: EPOCH_MS });
		log(`mock backend on ${mock.baseUrl} (clock pinned to ${new Date(EPOCH_MS).toISOString()})`);

		// Worktrees serially: two concurrent `npm ci` runs fight over the same npm cache.
		const worktrees = {};
		for (const [role, ref] of [
			['base', base],
			['head', head]
		]) {
			log(`preparing ${role} worktree (${ref.shortSha})…`);
			worktrees[role] = await prepareWorktree({
				sha: ref.sha,
				repoRoot,
				onProgress: (msg) => log(`  ${msg}`)
			});
		}

		const servers = {};
		for (const role of ['base', 'head']) {
			servers[role] = await startDevServer({
				dir: worktrees[role].dir,
				port: PORTS[role].dev,
				metricsPort: PORTS[role].metrics,
				mockBaseUrl: mock.baseUrl,
				label: role,
				logDir
			});
			running.push(servers[role]);
			log(`${role} dev server on ${servers[role].baseUrl}`);
		}

		await withBrowser(async (browser) => {
			for (const scenario of scenarios) {
				const outDir = path.join(runDir, scenario.id);
				await fs.mkdir(outDir, { recursive: true });
				process.stdout.write(`[ui-diff] ${scenario.id} … `);

				// Both refs are captured back to back so any machine-level drift (font cache,
				// CPU contention) lands on both sides of the comparison rather than one.
				const shots = {};
				for (const role of ['base', 'head']) {
					shots[role] = await captureScenario({
						browser,
						scenario,
						baseUrl: servers[role].baseUrl,
						mockBaseUrl: mock.baseUrl,
						outFile: path.join(outDir, `${role}.png`)
					});
				}

				if (!shots.base.ok || !shots.head.ok) {
					const error = [
						shots.base.ok ? null : `base: ${shots.base.error}`,
						shots.head.ok ? null : `head: ${shots.head.error}`
					]
						.filter(Boolean)
						.join('; ');
					run.scenarios.push({ id: scenario.id, title: scenario.title, status: 'failed', error });
					console.log(`FAILED (${error})`);
					continue;
				}

				const diff = await diffPngs({
					basePath: shots.base.file,
					headPath: shots.head.file,
					outPath: path.join(outDir, 'diff.png')
				});
				run.scenarios.push({
					id: scenario.id,
					title: scenario.title,
					status: 'ok',
					pct: diff.pct,
					changedPixels: diff.changedPixels,
					totalPixels: diff.totalPixels,
					sizeChanged: diff.sizeChanged,
					files: {
						base: path.join(scenario.id, 'base.png'),
						head: path.join(scenario.id, 'head.png'),
						diff: path.join(scenario.id, 'diff.png')
					}
				});
				console.log(`${diff.pct.toFixed(2)}% changed${diff.sizeChanged ? ' (size changed)' : ''}`);
			}
		});
	} finally {
		// Teardown runs even on a crash or Ctrl-C; a leaked vite holds the port for the next run.
		for (const proc of running.reverse()) await proc.stop().catch(() => {});
	}

	run.durationMs = Date.now() - startedAt.getTime();
	await fs.writeFile(path.join(runDir, 'run.json'), `${JSON.stringify(run, null, 2)}\n`);
	const reportPath = await writeReport({ runDir, run });

	const latest = path.join(repoRoot, '.ui-diff', 'latest');
	await fs.rm(latest, { force: true });
	await fs.symlink(runDir, latest, 'dir');

	console.log(`\n${summaryTable(run)}\n`);
	log(`report: ${reportPath}`);
	if (args.open) spawn('open', [reportPath], { detached: true, stdio: 'ignore' }).unref();

	const failed = run.scenarios.filter((s) => s.status === 'failed').length;
	return failed ? 1 : 0;
}

// A signal has to tear the child servers down too, so route it through main()'s finally.
for (const signal of ['SIGINT', 'SIGTERM']) {
	process.on(signal, () => {
		console.log(`\n[ui-diff] ${signal} — shutting down`);
		process.exitCode = 130;
	});
}

main().then(
	(code) => {
		process.exitCode = code;
	},
	(err) => {
		console.error(`[ui-diff] ${err.message}`);
		process.exitCode = 1;
	}
);
