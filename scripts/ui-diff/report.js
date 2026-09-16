// Renders a Run into one self-contained index.html (inline CSS/JS, no CDN, no data-URI images —
// the PNGs are referenced by the relative paths capture.js/diff.js already wrote into runDir) and
// a plain-text summary table for the terminal. Pure: given a Run and a runDir, writes exactly one
// file and returns its path.

import { writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Writes `${runDir}/index.html`.
 * @param {{runDir: string, run: import('./CONTRACT.md').Run}} args
 * @returns {Promise<string>}
 */
export async function writeReport({ runDir, run }) {
	const outPath = path.join(runDir, 'index.html');
	await writeFile(outPath, renderHtml(run), 'utf8');
	return outPath;
}

/**
 * Plain-text table for the terminal, e.g. printed by index.js after a run.
 * @param {import('./CONTRACT.md').Run} run
 * @returns {string}
 */
export function summaryTable(run) {
	const rows = sortScenarios(run.scenarios).map((s) => [
		s.status === 'failed' ? 'FAILED' : `${s.pct.toFixed(2)}%`,
		s.id,
		s.title,
		s.status === 'failed' ? s.error : s.sizeChanged ? 'size changed' : ''
	]);
	const header = ['RESULT', 'ID', 'TITLE', 'NOTE'];
	const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
	const line = (cols) => cols.map((c, i) => c.padEnd(widths[i])).join('  ');
	const changed = run.scenarios.filter((s) => s.status === 'failed' || s.pct > 0).length;
	return [
		line(header),
		widths.map((w) => '-'.repeat(w)).join('  '),
		...rows.map(line),
		'',
		`${changed} of ${run.scenarios.length} scenarios changed`
	].join('\n');
}

// Failed scenarios first (nothing to rank them against each other, so original order among
// themselves), then by descending pct — the point of the report is "look at the worst thing
// first", and a failed capture is worse than any pixel diff.
function sortScenarios(scenarios) {
	return [...scenarios].sort((a, b) => {
		const af = a.status === 'failed';
		const bf = b.status === 'failed';
		if (af !== bf) return af ? -1 : 1;
		if (af && bf) return 0;
		return b.pct - a.pct;
	});
}

function renderHtml(run) {
	const scenarios = sortScenarios(run.scenarios);
	const changed = run.scenarios.filter((s) => s.status === 'failed' || s.pct > 0).length;
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ui-diff report</title>
<style>${css}</style>
</head>
<body>
<header class="run-header">
	<h1>ui-diff</h1>
	<div class="refs">
		<div class="ref"><span class="ref-label">base</span> <code>${esc(run.base.shortSha)}</code> ${esc(run.base.subject)}</div>
		<div class="ref"><span class="ref-label">head</span> <code>${esc(run.head.shortSha)}</code> ${esc(run.head.subject)}</div>
	</div>
	<div class="meta">
		<span>${esc(run.startedAt)}</span>
		<span>${formatDuration(run.durationMs)}</span>
		<span class="changed-count">${changed} of ${run.scenarios.length} scenarios changed</span>
	</div>
</header>
<main>
${scenarios.map(renderScenario).join('\n')}
</main>
<script>${js}</script>
</body>
</html>
`;
}

function renderScenario(s) {
	if (s.status === 'failed') {
		return `<section class="scenario failed">
	<div class="scenario-head">
		<h2>${esc(s.title)}</h2>
		<span class="id">${esc(s.id)}</span>
		<span class="badge badge-fail">capture failed</span>
	</div>
	<pre class="error">${esc(s.error ?? 'unknown error')}</pre>
</section>`;
	}

	const badges = [
		`<span class="badge ${s.pct > 0 ? 'badge-changed' : 'badge-clean'}">${s.pct.toFixed(2)}%</span>`,
		`<span class="counts">${s.changedPixels.toLocaleString()} / ${s.totalPixels.toLocaleString()} px</span>`
	];
	if (s.sizeChanged) badges.push('<span class="badge badge-size">size changed</span>');

	return `<section class="scenario" data-view="side-by-side">
	<div class="scenario-head">
		<h2>${esc(s.title)}</h2>
		<span class="id">${esc(s.id)}</span>
		${badges.join('\n\t\t')}
		<div class="view-toggle" role="group" aria-label="view mode">
			<button type="button" data-mode="side-by-side" class="active">side-by-side</button>
			<button type="button" data-mode="diff">diff</button>
			<button type="button" data-mode="onion">onion-skin</button>
		</div>
	</div>
	<div class="view view-side-by-side">
		<figure class="checker"><figcaption>base</figcaption><img src="${esc(s.files.base)}" alt="base capture" /></figure>
		<figure class="checker"><figcaption>head</figcaption><img src="${esc(s.files.head)}" alt="head capture" /></figure>
	</div>
	<div class="view view-diff">
		<figure class="checker"><img src="${esc(s.files.diff)}" alt="diff" /></figure>
	</div>
	<div class="view view-onion">
		<figure class="checker onion-stack">
			<img src="${esc(s.files.base)}" alt="base capture" class="onion-base" />
			<img src="${esc(s.files.head)}" alt="head capture" class="onion-head" style="opacity: 0.5" />
		</figure>
		<label class="onion-slider">
			head opacity
			<input type="range" min="0" max="100" value="50" />
		</label>
	</div>
</section>`;
}

function formatDuration(ms) {
	const s = ms / 1000;
	return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

function esc(str) {
	return String(str).replace(/[&<>"']/g, (c) => escapeMap[c]);
}

const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// A checkerboard behind every image so a fully-transparent diff region (nothing changed there)
// reads as "no diff data" rather than as an unstyled white/black gap.
const css = `
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body {
	margin: 0;
	background: #14161a;
	color: #e6e8eb;
	font: 14px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
	padding: 24px 32px 64px;
}
h1, h2 { margin: 0; font-weight: 600; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: #23262c; padding: 1px 5px; border-radius: 4px; }
.run-header { margin-bottom: 32px; padding-bottom: 20px; border-bottom: 1px solid #2a2d34; }
.run-header h1 { font-size: 20px; letter-spacing: 0.02em; color: #9fb4ff; }
.refs { display: flex; flex-direction: column; gap: 4px; margin-top: 12px; }
.ref { color: #c6cad2; }
.ref-label { display: inline-block; width: 44px; color: #7a8090; text-transform: uppercase; font-size: 11px; letter-spacing: 0.06em; }
.meta { display: flex; gap: 16px; margin-top: 12px; color: #9aa0ac; font-size: 13px; flex-wrap: wrap; }
.changed-count { color: #e6e8eb; font-weight: 600; }
main { display: flex; flex-direction: column; gap: 28px; }
.scenario { background: #1a1c21; border: 1px solid #2a2d34; border-radius: 10px; padding: 16px 20px 20px; }
.scenario.failed { border-color: #5a2a2a; }
.scenario-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
.scenario-head h2 { font-size: 15px; }
.id { color: #6f7580; font-size: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.badge { font-size: 11px; padding: 2px 8px; border-radius: 999px; font-weight: 600; letter-spacing: 0.02em; }
.badge-clean { background: #16332a; color: #6fd7a8; }
.badge-changed { background: #3a2a12; color: #e8b464; }
.badge-fail { background: #3a1616; color: #e88a8a; }
.badge-size { background: #22243d; color: #9aa4f5; }
.counts { color: #7a8090; font-size: 12px; }
.error { background: #241414; color: #e8a0a0; padding: 12px 14px; border-radius: 6px; margin: 0; white-space: pre-wrap; font-size: 13px; }
.view-toggle { margin-left: auto; display: flex; gap: 2px; background: #101216; border-radius: 7px; padding: 2px; }
.view-toggle button { all: unset; cursor: pointer; padding: 5px 11px; font-size: 12px; border-radius: 5px; color: #9aa0ac; }
.view-toggle button.active { background: #2c3040; color: #e6e8eb; }
.view-toggle button:hover:not(.active) { color: #c6cad2; }
.view { display: none; gap: 16px; }
.scenario[data-view='side-by-side'] .view-side-by-side { display: flex; flex-wrap: wrap; }
.scenario[data-view='diff'] .view-diff { display: flex; }
.scenario[data-view='onion'] .view-onion { display: flex; flex-direction: column; align-items: flex-start; }
.checker {
	margin: 0;
	background-image: linear-gradient(45deg, #26282e 25%, transparent 25%), linear-gradient(-45deg, #26282e 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #26282e 75%), linear-gradient(-45deg, transparent 75%, #26282e 75%);
	background-size: 20px 20px;
	background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
	background-color: #1c1e23;
	border-radius: 6px;
	overflow: hidden;
	flex: 1 1 420px;
	min-width: 0;
}
.checker img { display: block; width: 100%; height: auto; }
.checker figcaption { padding: 6px 10px; font-size: 11px; color: #8a909c; text-transform: uppercase; letter-spacing: 0.05em; }
.onion-stack { position: relative; width: 100%; max-width: 960px; }
.onion-stack .onion-base { position: relative; }
.onion-stack .onion-head { position: absolute; inset: 0; }
.onion-slider { display: flex; align-items: center; gap: 10px; margin-top: 12px; font-size: 12px; color: #9aa0ac; }
.onion-slider input { width: 240px; }
`;

// Vanilla DOM wiring for the per-scenario view toggle and the onion-skin opacity slider. No
// framework: this file has to run as a plain inline script with no bundler and no network.
const js = `
document.querySelectorAll('.scenario[data-view]').forEach((section) => {
	const buttons = section.querySelectorAll('.view-toggle button');
	buttons.forEach((btn) => {
		btn.addEventListener('click', () => {
			section.dataset.view = btn.dataset.mode;
			buttons.forEach((b) => b.classList.toggle('active', b === btn));
		});
	});
	const slider = section.querySelector('.onion-slider input');
	const headImg = section.querySelector('.onion-head');
	if (slider && headImg) {
		slider.addEventListener('input', () => {
			headImg.style.opacity = String(Number(slider.value) / 100);
		});
	}
});
`;
