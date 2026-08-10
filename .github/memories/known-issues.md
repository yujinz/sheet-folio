# Known Issues

> Related: [Project Overview](project-overview.md) · [Design Decisions](design-decisions.md) · [Implementation Roadmap](implementation-roadmap.md)

## Turbopack NFT warning "whole project traced" + next.config.ts in trace (2026-08-06) — ✅ FIXED
- **Symptom**: `pnpm build` printed `Encountered unexpected file in NFT list` flagging `next.config.ts` (import trace: `export-import.ts` → `api/import/route.ts`). The `.nft.json` swept the whole project root (726 files incl. `next.config.ts`, `drizzle.config.ts`, `Dockerfile`, `tsconfig.json`…).
- **Root cause**: `src/lib/export-import.ts` / `src/db/index.ts` / `src/lib/upload.ts` do `path.join(process.cwd(), "data", …)` (DB path, uploads dir, drizzle migrations folder). Turbopack can't statically scope `process.cwd()` → traces the entire project. Matters because the Dockerfile deploys with `output: standalone`, so traced files get copied into the standalone folder.
- **Key insight (upstream bug [vercel/next.js#95125](https://github.com/vercel/next.js/issues/95125))**: the `/* turbopackIgnore: true */` comment does NOT work in Next.js 16.2.x for `fs(path.join(...))` shapes. Fixed upstream in PR #95144 → released in **16.3.0**. Also: the comment must go on the **flagged `fs`/`path` call itself**, not just on `process.cwd()` — Turbopack can't track the annotation through a function return value (e.g. `uploadsDir()`), so downstream calls still get flagged.
- **Fix (2026-08-06)**: upgraded `next` → 16.3.0 and added `/* turbopackIgnore: true */` at the exact flagged call sites: `fs.existsSync`, `fs.readFileSync`, `fs.writeFileSync(path.join(...))`, and the `path.join(uploadsDir(), …)` calls in `export-import.ts`; plus the `process.cwd()` calls in `db/index.ts` and `upload.ts`. NFT trace dropped to 140 files with zero root config files.

## Next 16.3.0 type-checks test files during `next build` (2026-08-06) — ✅ FIXED
- 16.3.0 now type-checks everything in tsconfig `include` (incl. `tests/`, `e2e/`); 16.2.6 did not. This surfaced two classes of issues:
  1. Stale test types: `tests/lib/data.test.ts` still used `nameEn` (type is `nameAlt`); `tests/lib/export-import.test.ts` assigned an invalid `ExportedImage` shape (`{filename, sourceUrl, sortOrder}` — needs `id`, no `sortOrder`). Fixed both.
  2. `tests/lib/schemas.test.ts` imports `@/app/api/*` routes → **demo build** (`pnpm build:demo`, which renames `src/app/api` out of the way) failed type-check.
- **Fix**: added `tsconfig.build.json` (extends `tsconfig.json`, `exclude: ["node_modules","scripts","tests","e2e","out"]`, separate `tsBuildInfoFile` under `node_modules/.cache/`) and set `typescript: { tsconfigPath: "tsconfig.build.json" }` in `next.config.ts`. IDE keeps `tsconfig.json` (tests still type-checked in editor); builds skip tests.


## Zip import stored image URLs as `/uploads/…` → images 404 (2026-08-05) — ✅ FIXED
- `src/lib/export-import.ts` `importData()` wrote the image file to disk correctly (`data/uploads/{id}/{kind}/{filename}`) but stored the DB row's `url` as `/uploads/{id}/{kind}/{filename}` — no such route exists.
- The route that serves uploaded files is `src/app/api/uploads/[...path]` (matches `/api/uploads/*`), so `<img src>` got a 404. Normal upload (`POST /api/pieces/[id]/images`, `src/app/api/pieces/[id]/images/route.ts`) correctly uses `/api/uploads/…`.
- **Fix (2026-08-05)**: changed `url` to `/api/uploads/{newId}/{kind}/{filename}` in `src/lib/export-import.ts` (~line 334). Also fixed the same (dead-code) fallback in `src/demo/store.ts` `importData` for consistency. Added regression test in `tests/lib/export-import.test.ts` asserting the URL prefix. All 135 tests pass.
- Demo-mode import was NOT affected — `src/demo/fetch.ts` converts image blobs to inline data URLs, so demo import never hits the broken path.

## E2E tests broken by demo EN default (2026-08-05) — ✅ FIXED
- Commit `a900bbe` ("load EN demo by default", 2026-07-24) made demo mode default to English, but `e2e/directory.spec.ts` and `e2e/i18n.spec.ts` still assume a Chinese default → they fail in demo mode (e.g. `a:has-text('欢乐颂')` shows "Ode to Joy").
- Confirmed pre-existing: the simplest directory test fails even with all import/export changes stashed.
- `e2e/settings.spec.ts` avoids this by forcing `localStorage["sheet-folio-locale"] = "en-US"` via `addInitScript`.
- **Fix (2026-08-05)**: Added `forceLocale(page, locale)` helper to `e2e/fixtures/seed.ts` (`page.addInitScript` that sets `sheet-folio-locale`). Specs that assume a Chinese default (`directory`, `detail`, `tags`, `images`, `enharmonic`) call `forceLocale(page, "zh-CN")` in `beforeEach`. `e2e/i18n.spec.ts` uses a **conditional** `addInitScript` (only sets `zh-CN` if no locale is already stored) so the "persists across reload" test's English setting survives `page.reload()` — an unconditional `addInitScript` would re-force zh-CN on reload and break it. Also fixed a stale directory test that clicked a non-existent difficulty "5" pill (seed difficulties are 1/2/4; 空之境界 M18 is 4) and the `settings.spec.ts` "Import successful" assertion (app now shows the "Added: N pieces …" merge-result breakdown instead). Full suite: 55 passed.

## `better-sqlite3.backup()` is ASYNC (2026-08-05)
- `db.backup(dest)` returns a Promise and completes page transfers asynchronously via `setImmediate`.
- Must `await` it. Calling it without await writes the snapshot file lazily → immediate `fs.existsSync` checks report false.
- `src/lib/export-import.ts` `createSnapshot()` awaits it. (Note: `src/db/index.ts` migration auto-backup does NOT await — pre-existing, best-effort only.)

## Snapshot/rollback implementation notes (2026-08-05)
- Snapshot path is per-DB: `data/snapshots/{dbBasename}.db` (isolates the vitest test DB from the real one). `last-export.json` → `data/{dbBasename}.last-export.json`.
- `restoreSnapshot()` copies rows through a second read-only connection (better-sqlite3 `backup()` + row copy). Keeps the live connection open; no server restart needed. Deletes children before parents, inserts parents before children (FK order).
- Rollback restores DB rows only — image files added to `data/uploads/` after the snapshot remain (orphans; handled by gc-images).

## Merge dedup can "hide" deleted pieces with duplicate titles (2026-08-05) — by design, surfaced in UI
- Merge dedup step ② (by `title + titleAlt`) means a **deleted** piece whose `(title, titleAlt)` matches a **still-existing** piece is treated as a duplicate and NOT re-added. So "export → delete a piece → merge-import the old zip" does NOT restore it when other pieces share the same title (e.g. many pieces titled "新曲子").
- This dedup was designed for cross-device imports (IDs differ, avoid dupes). It conflicts with the "restore deleted pieces" use case, which is inherent — a same-titled survivor is indistinguishable from the deleted piece by content.
- "Replace whole DB" DOES restore deleted pieces (it clears then re-inserts with original IDs) — confirmed by user.
- Fix (2026-08-05): the `/settings` import UI now shows a zip preview (export date + counts) on file select and a merge result breakdown ("Added: X … Skipped: Y existing pieces") so users can see what merge did. The Replace confirmation no longer says "cannot be undone" — the import route snapshots before replacing, so Rollback CAN undo a replace.

## Demo build
- Always use `pnpm build:demo` (not raw env vars) — the script handles the api/ folder rename, signal handlers for Ctrl+C, and auto-approval.
- The `build:demo` script lives at `scripts/build-demo.mjs` and runs `next build` internally with `NEXT_PUBLIC_DEMO_MODE=true`.
- For dev mode: `pnpm dev:demo` — no script needed, just the env var wrapper.
- ⚠️ **Stale `.next/dev/types` after running `next dev` breaks `pnpm build:demo`** (2026-08-10): if you run the dev server (`NEXT_PUBLIC_DEMO_MODE=true pnpm dev -p 3002`) and then run `pnpm build:demo` in the same working tree, the build fails with `TS2307 Cannot find module '../../src/app/api/*/route.js'` errors in `.next/dev/types/validator.ts`. Root cause: the dev server generates `.next/dev/types` referencing the `src/app/api/**` routes; `build-demo.mjs` renames `src/app/api` away (so the static export can't bundle better-sqlite3), leaving stale type references that fail type-check. **Fix**: `rm -rf .next` before `pnpm build:demo`. The build-demo script does NOT clean `.next` itself.

## Demo images — strip EXIF before deploy (REMINDER, 2026-08-02)
- Before deploying/exporting the demo, strip EXIF/IPTC/XMP from images so they don't leak into the demo/exported data.
- Tool: `node scripts-local/strip-image-metadata.mjs <dir-or-file> [...]` — lossless (no recompression), handles JPEG/PNG/GIF.
- Where images live: `data/uploads/` (real server masters, `UPLOAD_DIR`), `public/uploads/` (demo served pics), `export-data/` (export output — already stripped by `scripts/export-data.ts` via sharp).
- After stripping, re-verify with `sharp` that `exif/iptc/xmp` lengths are all 0.

## export-data.ts fails with custom tag categories (2026-07-08) — ✅ FIXED in v1.1
- `scripts/export-data.ts` now dynamically builds `songTagMap` instead of
  hardcoding three categories. Works with arbitrary category names.

## Database data loss when switching branches (2026-07-18) — ✅ FIXED
- **Root cause**: Exact trigger unknown, but likely `pnpm build:demo` on demo
  branch triggered `createDb()` which opened/migrated the SQLite DB, and
  subsequent branch switching caused DB state issues. Migration files are
  identical between branches, so hash mismatch is ruled out.
- **Fix**: `src/db/index.ts` now returns a stub immediately when
  `NEXT_PUBLIC_DEMO_MODE=true`, preventing any SQLite file access during
  demo builds (`pnpm build:demo`).
- **Safety net**: Auto-backup (`sqlite.backup()`) is created before each migration
  run, keeping the 5 most recent backups in `data/`.
- **Restore**: Run `node scripts/restore-from-dump.mjs` to re-import data from
  `data/dump.sql` into the current schema.

## WAL mode export bug (2026-06-29) — ✅ FIXED

### Problem
`scripts/export-data.sh` used `docker exec ... cat sheet-folio.db` to copy the SQLite DB.
The app uses `journal_mode = WAL`, so recent writes may only exist in `sheet-folio.db-wal`.
Copying only the main `.db` file misses uncheckpointed transactions → stale exports.

### Fix
Use `docker cp` instead, and also copy the WAL and SHM files:
```bash
docker cp "$CONTAINER":/app/data/sheet-folio.db /tmp/sheet-folio.db
docker cp "$CONTAINER":/app/data/sheet-folio.db-wal /tmp/sheet-folio.db-wal 2>/dev/null || true
docker cp "$CONTAINER":/app/data/sheet-folio.db-shm /tmp/sheet-folio.db-shm 2>/dev/null || true
```
Since the export container mounts `/tmp` as `/app/data`, `better-sqlite3` finds all three files and correctly reads uncheckpointed data.

### Why cron vs manual differed
Not deterministic — manual runs happened to hit times when the WAL was already checkpointed (or empty).
The cron job at 3 AM happened to catch a WAL file with uncheckpointed data.

## Plus button icon shifts during horizontal scroll (2026-07-19)

### Problem
The `+` (Plus) icon inside `.pill-add-button` moves slightly relative to its circular button border when the tag filter row is scrolled horizontally. The button border stays in place, but the icon drifts by 1–2px.

### Attempted fixes (none worked)
- `flex-shrink: 0` — prevented button compression but didn't fix icon jitter
- `display: inline-flex` → `display: flex` + `transform: translateZ(0)` (GPU layer promotion) — no effect

### Suspected cause
Chrome sub-pixel rendering bug with flexbox centering (`align-items: center; justify-content: center`) inside a scrollable container. The flex centering calculation produces fractional pixel positions that vary with scroll offset.

### Potential future fixes
- Absolute positioning: `position: relative` on button, `position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%)` on icon — avoids flex centering entirely
- SVG `shape-rendering: crispEdges` on the icon

### Additional detail (2026-07-19)
The edit icon `✎` (Unicode text) inside `.tag-delete-button` also jitters, but the delete icon `<X size={13} />` (Lucide SVG) does **not**. This confirms the issue is worse with text glyphs than explicit-size SVGs. A partial fix: replace the `✎` text with a `<Pencil size={13} />` Lucide SVG — may fix the edit button independently.

## `next-env.d.ts`
- Auto-generated by Next.js, tracked in git (default Next.js template).
- The import path flips between `.next/dev/types/routes.d.ts` (dev mode) and `.next/types/routes.d.ts` (build).
- Since `.next/` is gitignored, this is just a local reference — irrelevant for others.
- **Conclusion**: Harmless to commit, but not meaningful. Can be committed or reverted with `git checkout -- next-env.d.ts`.

## iOS tap-status-bar doesn't scroll to top (2026-07-26)

### Problem
On iOS, tapping the status bar should scroll the page to top. This doesn't work in our app.

### Root cause
`globals.css` sets `overflow: hidden` on `html, body`. iOS only fires the scroll-to-top gesture on the document's native scrollable element (`document.scrollingElement`). With `overflow: hidden`, there is no scrollable document element, so the gesture does nothing.

Both pages use custom scroll containers instead:
- **Directory**: `<div className="table-shell">` with `overflow: auto`
- **Detail**: `<main className="sheet-page" style={{ overflowY: "auto" }}>`

### Fix direction
Switch from custom scroll containers to document body scrolling:

1. `globals.css`: Remove `overflow: hidden` from `html, body`, change `.sheet-page` from `height: 100dvh` to `min-height: 100dvh`, remove `overflow: auto` from `.table-shell`
2. `Directory.tsx`: Switch scroll tracking from `shellRef.current.scrollTop` to `window.scrollY`, update scroll restoration and scroll-to-top button to use `window.scrollTo`
3. `Detail.tsx`: Remove `style={{ overflowY: "auto" }}` from `<main>`

### Impact
- Directory header (search bar, add button) will scroll with content instead of staying fixed — acceptable tradeoff, tap status bar to instantly return to it
- Scroll position save/restore and scroll-to-top floating button need updating to use `window` instead of `shellRef`

## Fullscreen pager: tiny non-black strip at bottom on iPad (2026-08-02)

### Problem
When the fullscreen image pager is open on iPad (Safari), a narrow strip at the very bottom of the screen shows the page content underneath instead of the black overlay background. Does NOT reproduce on desktop browsers or iPhone — iPad-only.

### What was tried (none worked)
1. `inset: 0` — the original CSS
2. `width: 100dvw; height: 100dvh;` — dynamic viewport units
3. `-webkit-fill-available` cascade (`height: 100%; height: 100dvh; height: -webkit-fill-available;`)
4. `html.fullscreen-active` class setting `html`/`body` background to `#111` with `min-height: 100dvh`
5. Moving `<Pager>` outside `<main>` into a sibling Fragment (to escape `overflow-y: auto`)
6. JavaScript pixel dimensions: `window.innerWidth` / `window.innerHeight` / `window.visualViewport.height` set as inline styles on `html`, `body`, and `.fullscreen-view`
7. Setting all four edges (`top/left/right/bottom: 0`) via inline styles
8. Removing `overflow: hidden` from `html`/`body` while pager is open
9. React `createPortal` rendering Pager directly into `document.body`
10. Combined several of the above

### Suspected cause
iPadOS Safari constrains `position: fixed` elements to the "layout viewport" rather than the true physical screen dimensions. The browser calculates the layout viewport slightly differently than the visual viewport on iPad, leaving a gap at the bottom. This may be a hardware-level limitation — the iPad renders its own UI chrome (toolbar/home indicator) within the viewport area, and Safari's `position: fixed` can't paint over it.

### Current state
- CSS uses `width: 100dvw; height: 100dvh;` on `.fullscreen-view`
- `fullscreen-active` class toggled on `<html>` sets `background: #111; min-height: 100dvh`
- Pager is rendered inside `<main>` (not portaled)
- Strip remains visible on iPad