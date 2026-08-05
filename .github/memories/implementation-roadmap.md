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