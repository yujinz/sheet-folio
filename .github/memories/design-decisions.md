# Design Decisions

> Related: [Project Overview](project-overview.md) · [Implementation Roadmap](implementation-roadmap.md) · [Known Issues](known-issues.md)

_This file records architecture and schema decisions. For what's built vs. planned, see [Implementation Roadmap](implementation-roadmap.md)._

---

## Import/Export (Session G, planned)

**Goal:** UI-based data backup/restore via zip files, with rollback safety net.

**Export format:** Matches the existing `SCHEMA.md` export structure:
- `manifest.json`, `pieces.json`, `tags.json`, `single-select-categories.json`, `tag-categories.json`
- `images/{pieceId}/{kind}/{filename}` for each image (stripped of EXIF, matching `scripts/export-data.ts`)
- Packaged as a `.zip` via `jszip` (single dependency for both server and demo)

**Merge dedup algorithm:**
- ① Fast path: `SELECT WHERE id = ?` — if the same ID exists and titles match → skip (O(1) for same-DB re-imports)
- ② Full search: `SELECT WHERE title = ? AND titleAlt = ?` — catches cross-device imports where IDs differ
- ③ Otherwise → INSERT as new with auto-increment ID
- Tags deduped by `(category, name)` via `Map<exportTagId, targetTagId>` remapping

**Snapshot strategy:**
- One snapshot slot (latest only, overwritten each time)
- Created on export and before import (safety net for rollback)
- Server: `data/snapshots/sheet-folio.db` — raw SQLite file copy (+ WAL/SHM)
- Demo: Dexie `snapshots` table keyed `[snapshotId, kind, subId?]` — images stored as individual rows (one per image) to avoid giant JSON blobs; metadata tables as single JSON array rows
- Rollback: close DB connection, copy snapshot over live files, reopen; demo restores by clearing all tables and re-inserting from snapshot rows

**Timestamp storage:** Server: `data/last-export.json`. Demo: `localStorage` key `"sheet-folio-last-export"`.

**Exclusions:** CSV/Excel support, cloud backup (R2 via `backup.sh` is separate).

---

## Single-select filter hook (`useSingleSelectFilter`, 2026-07-08)

- Created `src/lib/useSingleSelectFilter.ts` for reusable single-select filter toggles.
- When a value is active and another is clicked, it **switches** to the new value (no manual deselect needed).
- Clicking the same value again deselects it.
- Applied to the difficulty filter in `Directory.tsx`.
- SessionStorage key changed from `difficultyFilters` (number[]) to `difficultyFilter` (number | null).
- To add new single-select filters later: create another `useSingleSelectFilter<T>()` instance, wire into `visible` computation, sessionStorage save/restore, and reset button.

---

## Grid View

**Goal:** Compact blog-style grouped view for browsing pieces at a glance.

**Decisions:**
- **View toggle**: Table ↔ Grid, persisted in `sessionStorage` under `sheet-folio-directory-state`
- **Group-by chips**: [Difficulty] [Genre] [... N more] — toggle buttons (NOT a dropdown). Auto-detect single-select categories from DB. Overflow with `[... N more]` if many.
- **Grid rendering**: Blog-style grouped sections
  - Section header: group name + piece count (e.g. "Baroque — 4 pieces")
  - Entries: `[difficulty badge] Title` — one compact line per piece, links to `/piece/{id}`
  - Secondary sort within sections: alphabetical by title (fixed, no user config)
- **Only single-select categories** appear as grouping options: Difficulty (built-in), Genre, and any future user-defined single-select categories
- **Multi-select categories** (pitch/technique/rhythm) stay filter-only in table view — no grid grouping for them (would cause duplicate entries)

---

## Single-Select Categories (`song_categories` table)

**Goal:** Model categories where each piece picks exactly one value (Genre, Era, Mood, etc.).

**Motivation:** Grid view only makes sense for single-select categories (no duplicates). Multi-select categories (pitch/technique/rhythm) remain filter-only.

**Decisions:**
- New `song_categories` table:
  ```sql
  CREATE TABLE song_categories (
    song_id   INTEGER NOT NULL REFERENCES songs(id),
    category  TEXT    NOT NULL,         -- "genre", "era", etc.
    tag_id    INTEGER NOT NULL REFERENCES tags(id),
    PRIMARY KEY (song_id, category)     -- enforces one value per category per song
  );
  ```
- New `single_select_categories` table (declares which categories are single-select):
  ```sql
  CREATE TABLE single_select_categories (
    category TEXT PRIMARY KEY
  );
  ```
- The actual tag values (name, color, etc.) live in the existing `tags` table — `song_categories` only stores the relation
- **Default behavior**: every new tag category (e.g. "mood", "dynamics") is **multi-select** via `song_tags` — no config needed, checkbox pickers work automatically
- **Opt-in to single-select**: user adds the category name to `single_select_categories` table (e.g. `INSERT INTO single_select_categories VALUES ('genre')`). The app then knows to:
  - Render radio-group picker instead of checkbox picker
  - Use `song_categories` for storage instead of `song_tags`
  - Show the category as a grouping option in the grid view
- No schema changes needed when adding new single-select categories — just insert into `single_select_categories` and `tags`

---

## Custom tag categories

**Goal:** Allow user to create new tag categories (e.g. "genre") beyond the current three.

**Decisions:**
- Make `tags.category` a free-text field (`text("category").notNull()`) instead of enum
- Backend `groupTags()` groups by whatever categories actually exist in DB
- Frontend keeps `pitch` / `technique` / `rhythm` as three core categories with i18n labels
- Any extra categories (genre, dynamics, etc.) render in a generic "Other" fallback area
- `pitch` keeps its special UI (♭♯♮ buttons, pitch-based auto-color)
- Category rename in edit mode: core categories can be renamed → key changes in DB → becomes custom category (pitch UI disappears)
- Custom categories: can edit zh/en labels or rename the key
- Bulk category rename via `PATCH /api/tags { oldCategory, newCategory }`
- Individual tag PATCH also accepts `category` field
- Zod validation for tag creation changes from `z.enum([...])` to `z.string().min(1)`
- `TagCategory` type becomes `string` (or union with `(string & {})` trick)

---

## Multi-instrument support

**Goal:** Each instrument has its own set of pieces; can duplicate a piece across instruments.

**Decisions:**
- New `instruments` table: `id`, `name`, `name_en`, `sort_order`, `created_at`
- `songs` gets `instrument_id` FK → `instruments(id)`, NOT NULL
- Existing songs → auto-migrate under a default instrument (configurable via env `DEFAULT_INSTRUMENT_NAME`, fallback `"Instrument 1"`)
- Duplicate creates independent copy (not shared reference):
  - ✅ Copy `title`, `titleEn`
  - ✅ Copy all `song_tags` associations
  - ✅ Copy `song_images` rows (share physical file on disk, no file copy)
  - ✅ Copy `youtube_links`
  - ❌ Reset `difficulty` to default (1)
  - ❌ Reset `notes` to empty
  - ✅ Copy `pitch` and `rhythm` tags
  - ✅ Copy `genre` tags (custom categories)
  - ❌ Do NOT copy `technique` tags (technique differs per instrument)
- Image deletion: only deletes DB row, not physical file. Separate `npm run gc-images` script to clean up orphaned files.
- API: `POST /api/pieces/:id/duplicate?toInstrumentId=X`

---

## Unified demo layer on `main` (2026-07-18)

**Decision:** Ported the demo data layer from the `demo` branch to `main`, under `src/demo/`.

**Rationale:**
- Enables e2e tests (Playwright) to run on `main` against demo mode
- Eliminates branch-to-branch sync — both data layers are updated in the same PR
- Both layers visible in the same codebase

**Files moved:**
| From (`demo` branch) | To (`main` branch) |
|---|---|
| `src/lib/demo-db.ts` | `src/demo/db.ts` |
| `src/lib/demo-store.ts` | `src/demo/store.ts` |
| `src/lib/demo-fetch.ts` | `src/demo/fetch.ts` |
| `src/lib/demo-seed.ts` | `src/demo/seed.ts` |
| `src/components/DemoInit.tsx` | `src/demo/init.tsx` |
| `scripts/check-demo-routes.ts` | `scripts/check-demo-routes.ts` (updated path) |

**Build script:** `scripts/build-demo.mjs` replaces the old `NEXT_PUBLIC_DEMO_MODE=true next build` — it temporarily moves `src/app/api/` to `src/app.api.bak/` during the build (so better-sqlite3 isn't bundled), then restores it. Signal handlers for SIGINT/SIGTERM/SIGHUP ensure cleanup on Ctrl+C. Fallback: `git restore src/app/api`.

**Demo mode activation (unchanged):**
- Local dev: `NEXT_PUBLIC_DEMO_MODE=true pnpm dev`
- Static export: `pnpm build:demo`
- GitHub Pages deploys from `main` via the deploy-demo workflow

**The `demo` branch is no longer needed** for code — it was deleted after the port. The deploy workflow was moved to `main`.
