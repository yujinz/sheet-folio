# Implementation Roadmap

> Related: [Project Overview](project-overview.md) · [Design Decisions](design-decisions.md) · [Known Issues](known-issues.md)

_What's been built, what's in progress, what's planned. For the "why" behind these decisions, see [Design Decisions](design-decisions.md)._

---

## ✅ Completed

### i18n cleanup (Session A)

All done:
- Tag sort fallback, placeholder cleanup, Cancel→t.cancel, server COALESCE sort
- #2 (createPiece) replaced with auto-mirror: locale-dependent single fill on create, then Detail `scheduleSave` mirrors the typed title to the other field if empty
- Also fixed hardcoded strings in Directory rename dialog + new-category form (placeholders, save/cancel buttons)

### Custom Tag Categories (Session B)

All 7 items done. `_en` → `_alt` rename across schema/types/components. `category === "pitch"` replaced with `isPitchKey()` / `isPitchCategory` prop.

### Category Label Persistence (Session F, 2026-07-14)

- Removed hardcoded `CORE_CATEGORIES` — categories are now fully dynamic
- Created `tag_categories` table (`key`, `name`, `name_alt`, `sort_order`)
- API routes: GET/POST/PATCH/DELETE `/api/categories`
- Seed function: auto-creates pitch/rhythm/technique defaults on empty DB
- Cross-device sync: labels are persisted server-side, no more sessionStorage-only
- Sort order: seeded defaults get 0/1/2, new categories get `max+1`
- Key rename preserves sortOrder (PATCH with `oldKey`)
- All API calls now awaited with error handling (fixed silent-fail bug)
- Removed: `CORE_CATEGORIES` constant, `isCoreCategoryLabel()`, `hiddenCoreCategories`, `isCore`/`restoringCore` rename logic

### Unified Demo Layer on `main` (2026-07-18)

Ported demo data layer from `demo` branch into `src/demo/`. See [Design Decisions](design-decisions.md) for rationale and file mapping.

### Directory first-load performance (2026-08-12)

**sheet-folio** (production + demo):
- **Server-side initial fetch** — `src/app/page.tsx` is now an async Server Component; production fetches `getSongs/getTags/getCategories/getSingleSelectCategories` and passes `initialData` to `Directory` (kills the 4 client round-trips + empty-table flash). Demo mode returns `<Directory/>` unchanged (fetch interceptor). Route is marked dynamic via `await connection()` in the non-demo branch (NOT `export const dynamic = …` — route-segment config must be a static literal, see known-issues).
- New shared getters in `src/lib/data.ts`: `getTags`, `getCategories` (centralizes `seedDefaultCategories`), `getSingleSelectCategories`. `GET /api/tags`, `/api/categories`, `/api/single-select-categories` now wrap them; all four GETs set `Cache-Control: private, no-store`.
- **Rendering** — `Directory.tsx` rows extracted into a memoized `DirectoryRow` (stable callbacks via `useCallback`); `TagPicker` default export wrapped in `React.memo`.
- **Deferred (approved scope)**: virtualization, slim `/api/pieces` payload to tag-id arrays, deep TagPicker hook-split.

### Rollback snapshot preview card (2026-08-12)

- Settings → Rollback now shows a "Snapshot overview" preview card (date + piece/tag/image counts) when a snapshot exists, mirroring the zip import preview.
- `ExportStatus` gained `snapshotCounts: { pieces, tags, images } | null`.
- Server (`src/lib/export-import.ts`): `readSnapshotCounts()` opens the snapshot DB read-only and COUNTs `songs` / `tags` / `song_images`.
- Demo (`src/demo/store.ts`): reads the counts already stored in the snapshot `meta` row.
- New i18n keys: `rollbackPreviewTitle`, `rollbackPreviewDate` (zh + en).
- E2E: settings spec scopes "Total pieces" assertions to the "Current Status" card — the preview card adds a second "Total pieces" row.

---

## 🚧 In Progress

### Single-Select Categories (Session C — partial)

| # | Item | Status |
|---|------|--------|
| 1 | `single_select_categories` table + migration 0001 | ✅ |
| 2 | `song_categories` table — DB-level "one per category" constraint | ❌ |
| 3 | API routes GET/POST/DELETE `/api/single-select-categories` | ✅ |
| 4 | TagPicker handles `singleSelect` prop (compact: `<select>`, non-compact: radio-group toggle) | ✅ |
| 5 | `getSong()`/`getSongs()` don't include `song_categories` data | ❌ |

**Current workaround**: single-select filtering works in Directory (pure UI in sessionStorage). Detail page enforces single-select via UI but stores everything in `song_tags`. No DB-level constraint yet.

**Remaining (#2 + #5)**: `song_categories` table with proper DB-level constraint, wired into data layer (`getSong`, `getSongs`). This is a **standalone data-integrity improvement** — the PK `(song_id, category)` prevents accidental double-assignment at the DB level. It does NOT block grid view (grid view only reads, and can query `song_tags JOIN single_select_categories` directly).

---

## 🔜 Planned

### Import/Export UI + Data Layer (Session G) — ✅ DONE (2026-08-05)

New `/settings` page with export (zip), import (zip, merge or replace), and rollback from snapshot.

- **Export**: `GET /api/export` → `jszip` bundle (manifest + pieces + tags + images) → zip download
- **Import**: `POST /api/import?mode=merge|replace` → accepts multipart zip, validates, imports
- **Status**: `GET /api/export/status` → counts, last export time, hasSnapshot, storage method
- **Rollback**: `POST /api/export/rollback` → restores from snapshot; snapshot created on export + before import
- **Snapshot**: Server: `data/snapshots/{dbBase}.db` via `sqlite.backup()` (async — must await). Demo: Dexie `snapshots` table `[snapshotId, kind, subId?]`, images as individual rows
- **Merge dedup**: ① `WHERE id = ?` + titles match → skip. ② `WHERE title=? AND titleAlt=?` → skip. ③ INSERT new. Tags deduped by `(category, name)` via `Map<exportTagId, targetTagId>`
- **Dependency**: `jszip`
- **New files**: `src/lib/export-import.ts` (server), `src/lib/export-validation.ts` (Zod, browser-safe), `src/app/api/export/*` (3 routes), `src/app/api/import/route.ts`, `src/components/Settings.tsx`, `src/app/settings/page.tsx`, `tests/lib/export-import.test.ts`, `e2e/settings.spec.ts`
- **Modified**: `src/components/Directory.tsx` (gear nav), `src/lib/i18n.ts` (~40 keys), `src/db/index.ts` (`getSqliteConnection()`), `src/demo/{store,fetch,db}.ts`
- **No schema changes**

### Grid View (Session D)

1. View toggle (table/grid) persisted in sessionStorage
2. Group-by chips: [Difficulty] [Genre] [... N more]
3. Only single-select categories as grouping options
4. Multi-select categories stay filter-only
5. Blog-style grouped sections: header + compact entries
6. Secondary sort: alphabetical by title
7. Overflow chips for many categories

_Reads from existing `song_tags JOIN single_select_categories`. Does NOT require `song_categories` table — grid view is read-only, and the UI already enforces single-select via radio buttons / `<select>`._

### Multi-Instrument Support (Session E — optional)

**Alternative (zero-code):** Run separate Docker instances on different ports with fresh DB volumes. Pros: perfect isolation, works today, no code changes. Cons: no cross-instrument browsing or piece duplication, N containers to maintain.

**Built-in approach (if cross-instrument duplication is needed):**

1. `instruments` table + `instrument_id` FK on songs
2. Auto-migrate existing songs to default instrument
3. `POST /api/pieces/:id/duplicate?toInstrumentId=X`
   - Copy: title/titleAlt, song_tags, song_images (shared files), video_links, pitch, rhythm
   - Reset: difficulty→1, notes→""
   - Skip: technique tags
4. Image deletion: DB only. `npm run gc-images` for orphan files.

---

## Current DB Schema

| Table | Purpose | Status |
|-------|---------|--------|
| `songs` | Pieces (title, title_alt, difficulty, notes, timestamps) | ✅ |
| `tags` | Tag definitions (name, name_alt, color, category) | ✅ |
| `song_tags` | M2M piece↔tag (multi-select categories) | ✅ |
| `song_images` | Images per piece (staff/numbered) | ✅ |
| `video_links` | External links per piece (label, url) | ✅ |
| `device_zoom` | Per-device zoom persistence | ✅ |
| `single_select_categories` | Declares which categories are single-select | ✅ |
| `tag_categories` | Category display names (key, name, name_alt, sort_order) | ✅ |
| `song_categories` | DB-level "one per category" constraint (integrity guard, not needed for grid view) | ❌ |

---

## Migration notes

- All schema changes are additive / backward-compatible for existing data
- Drizzle migrations handle schema changes automatically
- New users: `docker compose up` → drizzle `migrate()` creates full schema from scratch
- Existing users: run migration, existing pieces go under default instrument, tags keep their categories