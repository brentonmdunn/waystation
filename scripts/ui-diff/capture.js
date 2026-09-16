// Turns one ScenarioSpec into one PNG. This is the determinism-critical layer: everything here
// exists to make two captures of the same scenario byte-identical, run to run.
import fs from 'node:fs/promises';

import { PNG } from 'pngjs';
import { chromium } from 'playwright';

import { setMockMode } from './servers.js';

// A fixed instant (not "now") so departure minutes, the clock, and the footer's "updated Ns
// ago" text are the same on every run. Installed as the browser clock before the first
// navigation in captureScenario, below.
export const EPOCH_MS = Date.parse('2026-01-15T09:00:00-08:00');

export const VIEWPORT = { width: 1920, height: 1080 };

// animation/transition: none kills the empty-board sweep and the board-empty-rise/pulse CSS
// animations that would otherwise land captures mid-frame. caret-color: transparent covers any
// stray focus caret. #board-stage's transform is set by fitStage() to scale the 1920x1080 stage
// to the viewport; forcing it to `none` makes the stage exactly 1920x1080 in the DOM regardless
// of that scale, so the screenshot below never carries sub-pixel scaling blur.
const FREEZE_STYLE =
	'*,*::before,*::after{animation:none!important;transition:none!important;' +
	'caret-color:transparent!important} #board-stage{transform:none!important}';

// Matches DepartureRow's `.row` (single-stop board.svelte) and StopRow's
// `data-testid="minutes-group"` (multi-stop-board.svelte) -- the two components never share a
// selector, so `expect: 'rows'` has to check for either.
const ROWS_SELECTOR = '#board-stage .row, #board-stage [data-testid="minutes-group"]';

// EmptyBoard is the only component in src/components/board that renders role="status"; its
// `head` text is unique per mode and comes from messages/en.json ('en' is the base locale and
// no locale cookie is ever set here, so this is always the rendered copy).
const STATUS_SELECTOR = '#board-stage [role="status"]';
const EMPTY_HEAD_TEXT = { empty: 'NO DEPARTURES', error: 'NO DATA' };

// board.svelte's footer prefixes the last-updated time with this text only when isStale (or the
// data has aged out); it never appears otherwise, so it's a safe, unambiguous stale signal.
const STALE_TEXT = 'STALE';

/** Launches chromium headless. Calls fn(browser), always closes. */
export async function withBrowser(fn) {
	const browser = await chromium.launch();
	try {
		return await fn(browser);
	} finally {
		await browser.close();
	}
}

/**
 * One scenario against one dev server. Never throws; failures come back as {ok:false,error}.
 * @returns {Promise<import('./scenarios.js').CaptureResult>}
 */
export async function captureScenario({
	browser,
	scenario,
	baseUrl,
	mockBaseUrl,
	outFile,
	timeoutMs = 45000
}) {
	let context;
	try {
		await setMockMode(mockBaseUrl, scenario.mock);

		context = await browser.newContext({
			viewport: VIEWPORT,
			deviceScaleFactor: 1,
			colorScheme: 'dark',
			reducedMotion: 'reduce',
			locale: 'en-US',
			timezoneId: 'America/Los_Angeles'
		});

		// Must happen before the first navigation: it freezes Date, the 1s clock tick, the 8s
		// alert rotation, and the fetch-refresh interval in one move, so nothing ticks between
		// this capture and the next run's capture of the same scenario.
		await context.clock.install({ time: EPOCH_MS });
		// install() leaves the clock running, so Date.now() still creeps forward with wall time
		// and the footer's "LAST 9:00:0Ns" drifts by a second or two between the base and head
		// captures. pauseAt stops it dead at EPOCH_MS; the initial fetch is real network, not a
		// timer, so nothing the board needs to render depends on time advancing.
		await context.clock.pauseAt(EPOCH_MS);

		// Every prelude entry primes the dev-server-side /api/oba/* cache with real data (the
		// only reason a scenario has a prelude today: warming a cache before `stale` flips the
		// mock to 'fail'), so it always settles the same way a plain successful load would.
		for (const step of scenario.prelude ?? []) {
			await setMockMode(mockBaseUrl, step.mock);
			const preludePage = await context.newPage();
			try {
				await preludePage.goto(baseUrl + step.path, { waitUntil: 'domcontentloaded' });
				await waitSettled(preludePage, 'rows', timeoutMs);
			} finally {
				await preludePage.close();
			}
		}
		if (scenario.prelude?.length) await setMockMode(mockBaseUrl, scenario.mock);

		const page = await context.newPage();
		await page.goto(baseUrl + scenario.path, { waitUntil: 'domcontentloaded' });
		await page.addStyleTag({ content: FREEZE_STYLE });
		await waitSettled(page, scenario.expect, timeoutMs);
		await page.evaluate(() => document.fonts.ready);

		await page.locator('#board-stage').screenshot({ path: outFile, animations: 'disabled' });
		const { width, height } = await readPngSize(outFile);
		return { ok: true, file: outFile, width, height };
	} catch (err) {
		// A hung initial fetch (fetchStop has no AbortController) is a known app bug, so a
		// timeout here is an ordinary per-scenario failure, not a reason to crash the run.
		return { ok: false, error: err?.message ?? String(err) };
	} finally {
		if (context) await context.close();
	}
}

/** @param {import('playwright').Page} page @param {ScenarioSpec['expect']} expect */
async function waitSettled(page, expect, timeoutMs) {
	if (expect === 'rows') {
		await page.locator(ROWS_SELECTOR).first().waitFor({ state: 'visible', timeout: timeoutMs });
		return;
	}
	if (expect === 'empty' || expect === 'error') {
		await statusTextLocator(page, EMPTY_HEAD_TEXT[expect]).waitFor({
			state: 'visible',
			timeout: timeoutMs
		});
		return;
	}
	if (expect === 'stale') {
		// A cached-but-stale response still carries rows, so both signals are required to tell
		// it apart from a plain `rows` settle.
		await page.locator(ROWS_SELECTOR).first().waitFor({ state: 'visible', timeout: timeoutMs });
		await page
			.getByText(STALE_TEXT, { exact: false })
			.first()
			.waitFor({ state: 'visible', timeout: timeoutMs });
		return;
	}
	throw new Error(`captureScenario: unknown expect "${expect}"`);
}

function statusTextLocator(page, text) {
	return page.locator(STATUS_SELECTOR).filter({ hasText: text }).first();
}

async function readPngSize(file) {
	const buf = await fs.readFile(file);
	const png = PNG.sync.read(buf);
	return { width: png.width, height: png.height };
}
