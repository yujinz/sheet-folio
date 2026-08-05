# Known Issues

> Related: [Project Overview](project-overview.md) · [Design Decisions](design-decisions.md) · [Implementation Roadmap](implementation-roadmap.md)

## E2E tests broken by demo EN default (2026-08-05) — PRE-EXISTING, NOT import/export
- Commit `a900bbe` ("load EN demo by default", 2026-07-24) made demo mode default to English, but `e2e/directory.spec.ts` and `e2e/i18n.spec.ts` still assume a Chinese default → they fail in demo mode (e.g. `a:has-text('欢乐颂')` shows "Ode to Joy").
- Confirmed pre-existing: the simplest directory test fails even with all import/export changes stashed.
- `e2e/settings.spec.ts` avoids this by forcing `localStorage["sheet-folio-locale"] = "en-US"` via `addInitScript`.
- Fix direction: update the old specs to force `zh-CN`, or update their selectors to be locale-agnostic.

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