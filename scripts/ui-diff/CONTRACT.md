# ui-diff — interface contract

Authoritative module boundaries for `npm run ui-diff`. Every module below is written
independently; **only the signatures and shapes in this file may be relied on across module
boundaries**. Do not import one ui-diff module from another except as listed under "Imports".

Plain ESM (`"type": "module"`), Node 20+, no TypeScript. JSDoc typedefs welcome, no `.d.ts`.
Repo style: tabs, single quotes, no trailing commas, 100-col (`.prettierrc`).

---

## 0. Shared shapes

```js
/** @typedef {'normal'|'empty'|'fail'} MockMode */

/** @typedef {object} MockState
 *  @property {MockMode} mode
 *  @property {number}   delay   ms added to every data response (0 = none)
 *  @property {number|null} now  epoch ms the server pretends it is; null = real clock
 */

/** @typedef {object} ScenarioSpec
 *  @property {string}  id       kebab-case, used as the output subdirectory name
 *  @property {string}  title    human label for the report
 *  @property {string}  path     app path to visit, e.g. '/stops/1_1'
 *  @property {Partial<MockState>} mock  control patch applied before the capture navigation
 *  @property {{ path: string, mock: Partial<MockState> }[]} [prelude]
 *           pages loaded (and discarded) before the capture, in order, to prime the
 *           dev-server-side proxy cache. Same browser context as the capture.
 *  @property {'rows'|'empty'|'error'|'stale'} expect  what the board should settle into
 */

/** @typedef {object} CaptureResult
 *  @property {boolean} ok
 *  @property {string}  file     absolute path to the written PNG (only when ok)
 *  @property {number}  width
 *  @property {number}  height
 *  @property {string}  [error]  message when !ok
 */

/** @typedef {object} DiffResult
 *  @property {number}  changedPixels
 *  @property {number}  totalPixels
 *  @property {number}  pct            0..100, changedPixels/totalPixels*100
 *  @property {boolean} sizeChanged    true when the two PNGs differ in dimensions
 *  @property {{width:number,height:number}} baseSize
 *  @property {{width:number,height:number}} headSize
 */

/** @typedef {object} ScenarioResult
 *  @property {string} id
 *  @property {string} title
 *  @property {'ok'|'failed'} status   'failed' = a capture errored; diff fields are then absent
 *  @property {number}  [pct]
 *  @property {number}  [changedPixels]
 *  @property {number}  [totalPixels]
 *  @property {boolean} [sizeChanged]
 *  @property {{base:string, head:string, diff:string}} [files]  paths RELATIVE to runDir
 *  @property {string}  [error]
 */

/** @typedef {object} Run
 *  @property {string} startedAt        ISO 8601
 *  @property {number} durationMs
 *  @property {{ref:string, sha:string, shortSha:string, subject:string}} base
 *  @property {{ref:string, sha:string, shortSha:string, subject:string}} head
 *  @property {ScenarioResult[]} scenarios
 */
```

Ports (fixed defaults, all overridable by `index.js` only):
mock `4010`, base dev `5273`, head dev `5274`, base metrics `9219`, head metrics `9220`.

---

## 1. `scripts/mock-oba/server.js` — control seam (MODIFY EXISTING FILE)

The only change to existing behaviour: `FAIL`/`EMPTY`/`DELAY` module consts become one mutable
`state` object, still seeded from `MOCK_OBA_FAIL`/`MOCK_OBA_EMPTY`/`MOCK_OBA_DELAY` so the
documented manual workflow is unchanged.

```
GET  /__control            -> 200 {"mode","delay","now"}          (current MockState)
POST /__control  <json>    -> 200 {"mode","delay","now"}          (state after merge)
```

- Body is a partial `MockState`. Absent keys are left alone. `"now": null` clears the pin.
- Invalid `mode` / non-numeric `delay` -> `400 {"error": "..."}`, state unchanged.
- `/__control` is handled **before** the delay and before the fail check: it must always answer
  immediately with 200/400 regardless of `state.mode` or `state.delay`.
- `state.mode === 'fail'` -> the existing 500 body. `'empty'` -> existing `"data": null`.
- Every `Date.now()` used to build response payloads (`arrivalsForStop`, the envelope's
  `currentTime`, situation/trip times) reads `state.now ?? Date.now()` instead, via one helper
  `function nowMs() { ... }`. This is what makes departure minutes reproducible.
- Update the header comment block in `server.js` and the "Mock OBA server" section of
  `docs/development.md` to document `/__control`.

## 2. `scripts/ui-diff/worktrees.js`

```js
export const WORKTREE_ROOT; // string: `${os.homedir()}/.cache/waystation-ui-diff/worktrees`

/** @returns {Promise<{ref:string, sha:string, shortSha:string, subject:string}>} */
export async function resolveRef(ref, repoRoot);

/** Idempotent. Reuses an existing worktree for the sha; creates it detached if absent.
 *  Ensures node_modules: if the worktree's package-lock.json is byte-identical to repoRoot's,
 *  symlink repoRoot/node_modules into the worktree; otherwise run `npm ci` there.
 *  @returns {Promise<{dir:string, sha:string}>} */
export async function prepareWorktree({ sha, repoRoot, onProgress });

/** `git worktree remove --force` every worktree under WORKTREE_ROOT, then `git worktree prune`.
 *  @returns {Promise<string[]>} removed dirs */
export async function cleanWorktrees({ repoRoot });
```

- `onProgress` is an optional `(msg: string) => void`; never write to stdout directly.
- Worktrees are created **detached** (`git worktree add --detach <dir> <sha>`) so no branch is
  checked out twice and the user's branch is never locked.
- Never touch the user's working tree, index, stash, or `.env`.
- Throw an `Error` with an actionable message on failure; do not `process.exit`.

## 3. `scripts/ui-diff/servers.js`

```js
/** Spawns `node scripts/mock-oba/server.js` from repoRoot. Resolves once GET /__control answers. */
export async function startMockServer({ repoRoot, port, onLog }):
  Promise<{ port:number, baseUrl:string, stop():Promise<void> }>;

/** POST /__control. @param {Partial<MockState>} patch @returns {Promise<MockState>} */
export async function setMockMode(mockBaseUrl, patch);

/** Spawns `npx vite dev --port <port> --strictPort --host 127.0.0.1` with cwd=dir.
 *  Resolves once the port serves HTTP. Rejects after `timeoutMs` (default 120000) with the
 *  tail of the captured log in the message. */
export async function startDevServer({ dir, port, metricsPort, mockBaseUrl, label, logDir, onLog }):
  Promise<{ port:number, baseUrl:string, logPath:string, stop():Promise<void> }>;
```

Dev-server env — set EXACTLY these on top of a copy of `process.env`, so branding and config can
never drift between the two refs:

```
PUBLIC_OBA_SERVER_URL  = `${mockBaseUrl}/`      // trailing slash required by the SDK
PRIVATE_OBA_API_KEY    = 'test'
PUBLIC_OBA_REGION_NAME = 'Mock Transit'
PUBLIC_OBA_LOGO_URL    = ''
METRICS_PORT           = String(metricsPort)    // MUST differ per server; 9119 collides
NODE_ENV               = 'development'
TZ                     = 'America/Los_Angeles'  // matches the mock agency timezone
```

- `baseUrl` has no trailing slash (`http://127.0.0.1:5273`).
- `stop()` is idempotent: SIGTERM the process group, wait up to 5s, then SIGKILL; resolve either
  way. Spawn with `detached: true` and kill `-pid` so vite's child esbuild/node processes die too.
- Stream child stdout/stderr to `${logDir}/${label}.log` and to the optional `onLog(line)`.
- Readiness poll: 250ms interval; any HTTP response (even 404/500) counts as up.

## 4. `scripts/ui-diff/scenarios.js`

```js
/** @type {ScenarioSpec[]} */
export const SCENARIOS;

/** @param {string|undefined} only comma-separated ids; undefined/'' = all
 *  @returns {ScenarioSpec[]} in SCENARIOS order
 *  @throws on an unknown id, listing the valid ones */
export function selectScenarios(only);
```

Exactly these seven, in this order. Fixtures come from `scripts/mock-oba/scenario.js` (stops `1`
and `2` exist; any other id falls back to `departures.default`), served agency-prefixed as `1_1`:

| id | path | mock | prelude | expect |
| --- | --- | --- | --- | --- |
| `normal` | `/stops/1_1` | `{mode:'normal'}` | — | `rows` |
| `single-row` | `/stops/1_2` | `{mode:'normal'}` | — | `rows` |
| `multi-stop` | `/stops/1_1+1_2` | `{mode:'normal'}` | — | `rows` |
| `alerts` | `/stops/1_1` | `{mode:'normal'}` | — | `rows` |
| `empty` | `/stops/1_90` | `{mode:'empty'}` | — | `empty` |
| `error` | `/stops/1_91` | `{mode:'fail'}` | — | `error` |
| `stale` | `/stops/1_92` | `{mode:'fail'}` | `[{path:'/stops/1_92', mock:{mode:'normal'}}]` | `stale` |

Ordering rules that MUST hold, with a comment in the file saying why:
- `error` and `stale` use stop ids no other scenario visits, because `/api/oba/*` caches per
  dev-server process with no TTL — a warm cache would turn the 503 into a stale hit.
- `stale` must be last, and its prelude warms the cache before the mode flips to `fail`.
- `alerts` shares `/stops/1_1` with `normal` on purpose: same data, but the capture layer freezes
  alert rotation, so today the two look alike. Give it `mock:{mode:'normal'}` anyway.

## 5. `scripts/ui-diff/capture.js`

```js
export const EPOCH_MS;   // Date.parse('2026-01-15T09:00:00-08:00') — exported for index.js
export const VIEWPORT;   // { width: 1920, height: 1080 }

/** Launches chromium headless. Calls fn(browser), always closes. */
export async function withBrowser(fn);

/** One scenario against one dev server. Never throws; failures come back as {ok:false,error}.
 *  @returns {Promise<CaptureResult>} */
export async function captureScenario({
  browser, scenario, baseUrl, mockBaseUrl, outFile, timeoutMs = 45000
});
```

`captureScenario` steps, in order:

1. `setMockMode(mockBaseUrl, scenario.mock)` — import `setMockMode` from `./servers.js` (the one
   allowed cross-import). For each `prelude` entry: set its mock patch, load the page in the same
   context, wait for it to settle, then re-apply `scenario.mock`.
2. `browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: 'dark',
   reducedMotion: 'reduce', locale: 'en-US', timezoneId: 'America/Los_Angeles' })`, closed in a
   `finally`. `colorScheme` is pinned because `settings.json` ships `theme: 'system'`.
3. `await context.clock.install({ time: EPOCH_MS })` BEFORE the first navigation — this freezes
   `Date`, the 1s clock tick, the 8s alert rotation, and the refresh interval in one move.
4. `page.goto(baseUrl + scenario.path, { waitUntil: 'domcontentloaded' })`.
5. `page.addStyleTag` with:
   `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}`
   and `#board-stage{transform:none!important}` — the second makes the element exactly
   1920x1080 regardless of `fitStage()`.
6. Wait for the expected settled state, per `scenario.expect` — assert on rendered text/DOM, not
   on a timer. Inspect `src/routes/stops/[stopID]/+page.svelte` and
   `src/components/board/board.svelte` to pick stable selectors; prefer roles/text over
   Tailwind classes. Every wait is bounded by `timeoutMs`.
7. `await page.evaluate(() => document.fonts.ready)`.
8. `page.locator('#board-stage').screenshot({ path: outFile, animations: 'disabled' })`, then read
   the written PNG's dimensions for the result.

Non-negotiable: never `waitForTimeout` as the primary settle signal, and never leak a context.
A timeout is a normal `{ok:false, error}`, because a hung initial fetch is a known app bug
(`fetchStop` has no AbortController) and must fail one scenario, not the run.

## 6. `scripts/ui-diff/diff.js`

```js
/** Reads two PNGs, writes the diff PNG to outPath, returns the stats.
 *  @returns {Promise<DiffResult>} */
export async function diffPngs({ basePath, headPath, outPath });
```

- `pngjs` to read/write, `pixelmatch` with
  `{ threshold: 0.1, includeAA: false, alpha: 0.15, diffColor: [255, 0, 255] }`.
- Different dimensions: do NOT throw. Compare over the intersection, count every pixel outside it
  as changed, size the diff PNG to the union (uncovered area filled magenta), and return
  `sizeChanged: true`.
- `pct` is rounded to 4 decimals. `totalPixels` is the union area when sizes differ.
- Pure: no logging, no process state, no knowledge of run dirs.

## 7. `scripts/ui-diff/report.js`

```js
/** Writes `${runDir}/index.html`. @param {{runDir:string, run:Run}} @returns {Promise<string>} */
export async function writeReport({ runDir, run });

/** Plain-text table for the terminal. Pure, no ANSI required. @returns {string} */
export function summaryTable(run);
```

- Self-contained single HTML file: inline CSS + JS, **no CDN, no network**. Images are referenced
  by the relative paths in `ScenarioResult.files`, never inlined as data URIs (they are 1920x1080).
- Scenarios sorted worst `pct` first; `status:'failed'` entries sort to the very top and render
  their `error` instead of images.
- Per scenario: title, id, `pct` to 2dp, changed/total pixel counts, a `sizeChanged` badge when
  set, and a three-way view toggle — **side-by-side** (base | head), **diff** (the diff PNG), and
  **onion-skin** (base and head stacked with an opacity range input).
- Header: both refs with shortSha + subject, `startedAt`, `durationMs`, and an overall
  "N of M scenarios changed" line. Dark background; images on a neutral checkerboard.
- Assume nothing about `runDir`'s parent. Do not create subdirectories.

## 8. `scripts/ui-diff/index.js` — OWNED BY THE LEAD, do not write or edit

Orchestrates everything above; also owns `package.json` scripts/devDeps, `.gitignore`, and
`.ui-diff/` layout. Provided here only so the modules know their caller:

```js
const run = { startedAt, base, head, scenarios: [] };
const mock = await startMockServer({ repoRoot, port: 4010 });
const baseWt = await prepareWorktree({ sha: base.sha, repoRoot });
const headWt = await prepareWorktree({ sha: head.sha, repoRoot });
const baseSrv = await startDevServer({ dir: baseWt.dir, port: 5273, metricsPort: 9219, ... });
const headSrv = await startDevServer({ dir: headWt.dir, port: 5274, metricsPort: 9220, ... });
await withBrowser(async (browser) => {
  for (const scenario of selectScenarios(only)) {
    const b = await captureScenario({ browser, scenario, baseUrl: baseSrv.baseUrl, ... });
    const h = await captureScenario({ browser, scenario, baseUrl: headSrv.baseUrl, ... });
    if (b.ok && h.ok) run.scenarios.push({ ...await diffPngs({ ... }), ... });
  }
});
await writeReport({ runDir, run });
```

Output layout: `.ui-diff/<ISO-timestamp>/<scenario-id>/{base,head,diff}.png`, plus `index.html`,
`run.json`, and `logs/{base,head,mock}.log`; `.ui-diff/latest` symlinks to the newest run.

---

## Imports

- `capture.js` may import `setMockMode` from `./servers.js`. That is the **only** permitted
  cross-import among ui-diff modules.
- `index.js` imports from all of them.
- Everything else: Node builtins and the three new devDeps (`playwright`, `pixelmatch`, `pngjs`).
  The lead adds those to `package.json`; write the imports as if they are installed.

## House rules

- `npm run lint` (prettier + eslint) must pass. Tabs, single quotes, no trailing commas, 100 cols.
- Comments explain *why*, at the density of `scripts/mock-oba/server.js`. No banner comments, no
  restating the signature above the function.
- No `process.exit`, no `console.log` outside `index.js` — use the `onLog`/`onProgress` callbacks.
- Absolute paths in, absolute paths out, except `ScenarioResult.files`, which are relative to
  `runDir`.
