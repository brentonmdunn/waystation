// Manages the throwaway checkouts ui-diff diffs against. Worktrees live outside the repo
// entirely (~/.cache, not .git/worktrees or a repo-local dir) so a run can never collide with
// the user's own working tree, index, stash, or .env, and so `git status` in the real repo never
// changes no matter what a run does.
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const WORKTREE_ROOT = path.join(os.homedir(), '.cache', 'waystation-ui-diff', 'worktrees');

async function git(args, cwd) {
	try {
		return await execFileAsync('git', args, { cwd });
	} catch (err) {
		throw new Error(`git ${args.join(' ')} (in ${cwd}) failed: ${err.stderr || err.message}`);
	}
}

/** @returns {Promise<{ref:string, sha:string, shortSha:string, subject:string}>} */
export async function resolveRef(ref, repoRoot) {
	let sha;
	let shortSha;
	let subject;
	try {
		({ stdout: sha } = await git(['rev-parse', ref], repoRoot));
		({ stdout: shortSha } = await git(['rev-parse', '--short', ref], repoRoot));
		({ stdout: subject } = await git(['log', '-1', '--format=%s', ref], repoRoot));
	} catch (err) {
		throw new Error(`could not resolve ref "${ref}" in ${repoRoot}: ${err.message}`);
	}
	return { ref, sha: sha.trim(), shortSha: shortSha.trim(), subject: subject.trim() };
}

async function pathExists(p) {
	try {
		await fs.access(p);
		return true;
	} catch {
		return false;
	}
}

async function filesIdentical(a, b) {
	try {
		const [bufA, bufB] = await Promise.all([fs.readFile(a), fs.readFile(b)]);
		return bufA.equals(bufB);
	} catch {
		return false;
	}
}

// npm ci is slow (a full install), so we skip it whenever the worktree's lockfile matches the
// repo root's byte-for-byte: a symlinked node_modules is safe because dependency resolution
// only ever depends on the lockfile, not on which ref is checked out.
async function ensureNodeModules({ dir, repoRoot, onProgress }) {
	const worktreeLock = path.join(dir, 'package-lock.json');
	const rootLock = path.join(repoRoot, 'package-lock.json');
	const worktreeModules = path.join(dir, 'node_modules');

	if (await pathExists(worktreeModules)) {
		return;
	}

	if (await filesIdentical(worktreeLock, rootLock)) {
		onProgress?.(`symlinking node_modules into ${dir}`);
		await fs.symlink(path.join(repoRoot, 'node_modules'), worktreeModules, 'dir');
		return;
	}

	onProgress?.(`package-lock.json differs from repo root; running npm ci in ${dir}`);
	try {
		await execFileAsync('npm', ['ci'], { cwd: dir, maxBuffer: 1024 * 1024 * 64 });
	} catch (err) {
		throw new Error(`npm ci failed in worktree ${dir}: ${err.stderr || err.message}`);
	}
}

/** Idempotent. Reuses an existing worktree for the sha; creates it detached if absent.
 *  Ensures node_modules: if the worktree's package-lock.json is byte-identical to repoRoot's,
 *  symlink repoRoot/node_modules into the worktree; otherwise run `npm ci` there.
 *  @returns {Promise<{dir:string, sha:string}>} */
export async function prepareWorktree({ sha, repoRoot, onProgress }) {
	const dir = path.join(WORKTREE_ROOT, sha);

	if (await pathExists(path.join(dir, '.git'))) {
		onProgress?.(`reusing existing worktree at ${dir}`);
	} else {
		await fs.mkdir(WORKTREE_ROOT, { recursive: true });
		onProgress?.(`creating worktree for ${sha} at ${dir}`);
		// `git worktree add --detach` never touches a branch ref, so the same sha checked out in
		// two worktrees (or checked out by the user on their own branch) is never a conflict.
		await git(['worktree', 'add', '--detach', dir, sha], repoRoot);
	}

	await ensureNodeModules({ dir, repoRoot, onProgress });

	return { dir, sha };
}

/** `git worktree remove --force` every worktree under WORKTREE_ROOT, then `git worktree prune`.
 *  @returns {Promise<string[]>} removed dirs */
export async function cleanWorktrees({ repoRoot }) {
	if (!(await pathExists(WORKTREE_ROOT))) {
		return [];
	}

	const entries = await fs.readdir(WORKTREE_ROOT, { withFileTypes: true });
	const dirs = entries.filter((e) => e.isDirectory()).map((e) => path.join(WORKTREE_ROOT, e.name));

	const removed = [];
	for (const dir of dirs) {
		try {
			await git(['worktree', 'remove', '--force', dir], repoRoot);
			removed.push(dir);
		} catch (err) {
			// A dir that's not a registered worktree (e.g. left over from a crashed npm ci) still
			// needs to go; git worktree prune below reconciles git's own bookkeeping afterward.
			await fs.rm(dir, { recursive: true, force: true });
			removed.push(dir);
			void err;
		}
	}

	await git(['worktree', 'prune'], repoRoot);
	return removed;
}
