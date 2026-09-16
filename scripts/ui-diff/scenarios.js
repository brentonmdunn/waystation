// Scenario catalog for `npm run ui-diff`. Each scenario is one board state, captured against
// both the base and head dev servers and diffed. See CONTRACT.md §4 for the authoritative table.

/** @type {import('./capture.js').ScenarioSpec[]} */
export const SCENARIOS = [
	{
		id: 'normal',
		title: 'Normal — multiple rows',
		path: '/stops/1_1',
		mock: { mode: 'normal' },
		expect: 'rows'
	},
	{
		id: 'single-row',
		title: 'Single row',
		path: '/stops/1_2',
		mock: { mode: 'normal' },
		expect: 'rows'
	},
	{
		id: 'multi-stop',
		title: 'Multi-stop board',
		path: '/stops/1_1+1_2',
		mock: { mode: 'normal' },
		expect: 'rows'
	},
	{
		// Shares 1_1's data with `normal` on purpose: the capture layer freezes the clock before
		// the first navigation, which also freezes the 8s alert rotation, so today this scenario
		// renders identically to `normal`. It exists so a future change to alert display (e.g. a
		// badge that shows regardless of rotation) has a scenario that will catch it.
		id: 'alerts',
		title: 'Service alert',
		path: '/stops/1_1',
		mock: { mode: 'normal' },
		expect: 'rows'
	},
	{
		id: 'empty',
		title: 'No scheduled departures',
		// Any stop id besides '1'/'2' falls back to scenario.js's `departures.default`, but mode
		// 'empty' makes the mock answer `"data": null` regardless, so the fixture never matters.
		path: '/stops/1_90',
		mock: { mode: 'empty' },
		expect: 'empty'
	},
	{
		// A stop id no other scenario visits: /api/oba/* caches per dev-server process with no
		// TTL, so if this shared a stop with an earlier scenario, that scenario's successful
		// response would still be cached and the 500 here would come back stale instead of as
		// the plain error the `error` scenario is meant to exercise.
		id: 'error',
		title: 'Upstream failure, no cache',
		path: '/stops/1_91',
		mock: { mode: 'fail' },
		expect: 'error'
	},
	{
		// Must run last, and must own a stop id no earlier scenario touches, for the same
		// per-process-cache reason as `error` above — this scenario needs the *opposite* effect
		// (a warm cache) and would corrupt an earlier scenario's cache if it ran before it, or
		// have its own cache pre-warmed by an earlier scenario reusing the same stop id.
		id: 'stale',
		title: 'Upstream failure, cached fallback',
		path: '/stops/1_92',
		mock: { mode: 'fail' },
		prelude: [{ path: '/stops/1_92', mock: { mode: 'normal' } }],
		expect: 'stale'
	}
];

/**
 * @param {string|undefined} only comma-separated ids; undefined/'' = all
 * @returns {import('./capture.js').ScenarioSpec[]} in SCENARIOS order
 */
export function selectScenarios(only) {
	if (!only) return SCENARIOS;

	const ids = only
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	const known = new Set(SCENARIOS.map((s) => s.id));
	const unknown = ids.filter((id) => !known.has(id));
	if (unknown.length > 0) {
		throw new Error(
			`Unknown scenario id(s): ${unknown.join(', ')}. Valid ids: ${[...known].join(', ')}`
		);
	}

	const wanted = new Set(ids);
	return SCENARIOS.filter((s) => wanted.has(s.id));
}
