# Local UI diff tool (`npm run ui-diff`)

## Context

`feat/ui-diff-tool` currently holds one commit — the standalone mock OBA server
(`scripts/mock-oba/`) — which was the prerequisite for this work. The repo has no browser
automation at all (vitest + jsdom only), so today the only way to know whether a board change
moved pixels is to eyeball it, and `CONTRIBUTING.md` asks for before/after screenshots on every
visual PR.

The goal: one local command that boots `main` and the current branch side by side against the
same mock backend, drives the same set of board scenarios through both, and produces per-scenario
before/after/diff PNGs plus an HTML report highlighting changed pixels. Confirmed requirements:
git worktrees (never touch the working tree), stop-board scenarios only, HTML report + diff PNGs,
1920×1080 capture clipped to the board stage.

## Design

```
npm run ui-diff -- [--base main] [--head HEAD] [--only normal,alerts] [--open]

 mock OBA server :4010  ◄── shared by both, control endpoint flips modes
        ▲                        ▲
  worktree(base) :5273     worktree(head) :5274
        └──────── Playwright chromium ────────┘
                         │
              .ui-diff/<run>/<scenario>/{base,head,diff}.png + index.html
```

Both refs run at once against **one** mock server, so the fixture data is identical by
construction. The tool always runs from the real repo root (the mock server and the tool itself
only exist on the branch; the worktrees only ever run `vite dev`).

### Determinism (the hard part)

Sources of noise in `src/routes/stops/[stopID]/+page.svelte`: the 1s clock tick (`:156`), the 8s
alert rotation (`ALERT_ROTATE_MS`, `:158`), `lastUpdatedAt` "x seconds ago", the `fitStage()`
transform (`:130`), and the mock server deriving departure times from `Date.now()`.

- **Pin both clocks to the same instant.** Add a `now` override to the mock server (see below) and
  call Playwright's `page.clock.install({ time: EPOCH })` before navigation. `EPOCH` is a fixed
  constant (e.g. `2026-01-15T09:00:00-08:00`, inside agency-timezone business hours). Installed
  clocks don't auto-advance, so the clock block, the alert rotation and the refresh interval all
  freeze after the first paint.
- **Neutralise the stage transform.** After load, inject `#board-stage { transform: none !important }`
  so the element is exactly 1920×1080 at a 1920×1080 viewport, guaranteeing equal-sized PNGs.
- **Kill animation.** Inject `*, *::before, *::after { animation: none !important; transition: none !important;
  caret-color: transparent !important }`.
- **Wait for readiness**: `await page.evaluate(() => document.fonts.ready)` plus a wait for the
  board's first row (or empty/error state) to exist, then `deviceScaleFactor: 1` element
  screenshot of `#board-stage`.
- **Fixed env per worktree** so branding can't drift: `PUBLIC_OBA_REGION_NAME`, `PUBLIC_OBA_LOGO_URL`,
  `PRIVATE_OBA_API_KEY=test`, `PUBLIC_OBA_SERVER_URL=http://127.0.0.1:4010/`. Worktrees get the
  **committed** `src/lib/config/settings.json`, not the dirty working-tree copy.

### Scenarios

Driven by mock-server mode + URL, all on `/stops/...`:

| id | setup | asserts |
| --- | --- | --- |
| `normal` | stop `1_1` | 4 departures, mixed occupancy/late/canceled |
| `single-row` | stop `1_2` | one departure |
| `multi-stop` | `1_1+1_2` | `MultiStopBoard` grid |
| `alerts` | stop `1_1` | SEVERE detour banner (rotation frozen on index 0) |
| `empty` | mode `empty` on stop `1_3` | board empty state |
| `error` | mode `fail` on a **fresh** stop id (no proxy cache) | 503 → error state |
| `stale` | load `1_1` normal, flip to `fail`, reload | proxy serves cached + `stale: true` banner |

Order matters: `stale` runs last per ref, and `error` uses an id nothing else touched, because the
`/api/oba/*` proxy cache is per-dev-server-process and has no TTL (BUG_AUDIT #4).

## Files

**`scripts/mock-oba/server.js`** (modify) — replace the process-wide `FAIL`/`EMPTY`/`DELAY` consts
with a mutable `state` object still seeded from those env vars, and add a control seam:
`POST /__control` with `{ mode: 'normal'|'empty'|'fail', delay, now }` → mutates `state`, returns
it; `GET /__control` reads it. Everywhere the server currently calls `Date.now()` uses
`state.now ?? Date.now()`. This is what lets one mock server, one dev server per ref, serve every
scenario without restarts. Documented in the file's existing header comment block and in
`docs/development.md`.

**`scripts/ui-diff/index.js`** — CLI entry (`npm run ui-diff`). Parses flags, resolves `--base`/
`--head` to SHAs, starts the mock server as a child process, prepares both worktrees, starts both
dev servers, launches one chromium, runs every scenario against base then head, diffs, writes the
report, tears everything down (always, via a single `finally` + signal handlers).

**`scripts/ui-diff/worktrees.js`** — `git worktree add --detach ~/.cache/waystation-ui-diff/wt/<sha> <sha>`,
keyed by SHA so repeat runs are instant. Dependency install: if the ref's `package-lock.json`
hashes equal the repo root's, symlink the root `node_modules` into the worktree; otherwise
`npm ci`. Worktrees live outside the repo and are reused, not deleted, between runs
(`--clean` prunes them).

**`scripts/ui-diff/servers.js`** — spawns `npx vite dev --port <p> --strictPort` per worktree with
the fixed env above plus a **unique `METRICS_PORT`** per worktree (9219/9220) — `src/hooks.server.js`
binds the metrics server at init and the default 9119 would collide between the two. Polls the port
until it answers, with a timeout.

**`scripts/ui-diff/scenarios.js`** — the table above as data: `{ id, path, mode, prelude }`.

**`scripts/ui-diff/capture.js`** — per-scenario: `POST /__control`, new incognito context
(1920×1080, `deviceScaleFactor: 1`, `colorScheme` fixed so the `system` theme is stable), clock
install, navigate, inject CSS, wait for fonts + board state, screenshot `#board-stage`. Hard
per-scenario timeout so BUG_AUDIT #2 (a hung initial fetch bricks the board — no `AbortController`
on `fetchStop`) fails one scenario instead of wedging the run.

**`scripts/ui-diff/diff.js`** — `pngjs` + `pixelmatch` (`threshold: 0.1`, `includeAA: false`,
`diffColor: [255, 0, 255]`, `alpha: 0.15` so unchanged pixels show ghosted). Returns
`{ changedPixels, totalPixels, pct }`. Mismatched dimensions are reported as a size change rather
than crashing.

**`scripts/ui-diff/report.js`** — self-contained `index.html` in the run dir: scenarios sorted
worst-diff-first, each with base/head/diff thumbnails, a % changed figure, and a per-scenario
toggle (side-by-side / diff overlay / onion-skin slider). Plus a terminal summary table.

**`package.json`** — add `"ui-diff": "node scripts/ui-diff/index.js"`; devDeps `playwright`,
`pixelmatch`, `pngjs`. **`.gitignore`** — add `.ui-diff/`. **`docs/development.md`** — a short
section on running it.

Output: `.ui-diff/<ISO-timestamp>/<scenario>/{base,head,diff}.png` + `index.html` + `run.json`
(SHAs, scenario results, timings), with `.ui-diff/latest` symlinked to it.

## Verification

1. `npm run mock` in one terminal; `curl -X POST localhost:4010/__control -d '{"mode":"fail"}'`
   then `curl localhost:4010/api/where/stop/1_1.json` → 500; `{"mode":"normal"}` → 200. Confirms
   the control seam without touching the app.
2. `npm run ui-diff` on a clean branch (no UI change relative to `main` beyond the tooling commits):
   every scenario should report **0.00%** changed. Any nonzero result here is nondeterminism to fix
   before trusting the tool.
3. Run it twice back to back — byte-identical PNGs (`shasum` the output dirs).
4. Introduce a deliberate one-line style change (e.g. bump a padding in
   `src/components/board/board.svelte`), commit, rerun → that scenario shows a small nonzero diff
   with the changed region highlighted; unaffected scenarios stay at 0.00%.
5. `git status` after a run is unchanged, and `git worktree list` shows only the cache worktrees
   (removed by `--clean`).
6. `npm run lint` passes on the new scripts.
