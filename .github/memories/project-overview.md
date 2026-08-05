# Project Overview

> ⚠️ **README is the live source of truth** for project description, features, build/run instructions, export/backup, and constraints. This file only captures developer-specific knowledge that isn't in README. Update README first when things change.

## Related files

- [Implementation Roadmap](implementation-roadmap.md) — what's done, what's next
- [Design Decisions](design-decisions.md) — future schema, grid view, multi-instrument
- [Known Issues](known-issues.md) — bugs, workarounds, fixes

## Tech Stack

- **Framework**: Next.js (App Router)
- **Runtime**: Node.js in Docker
- **Database**: SQLite via `better-sqlite3` + Drizzle ORM
- **Package manager**: pnpm (with pnpm workspaces)
- **Styling**: Tailwind CSS + PostCSS
- **Testing**: Vitest (unit/integration), Playwright (e2e)

## Project description → README

See [README.md → top] for:
- What Sheet Folio is, why it exists, image-first philosophy
- Feature list (reading, practice, library management)
- Technical highlights (export, backup, logging, localization)

## Build & run → README

See [README.md → Quick Start] for:
- Option 1: Static site demo (GitHub Pages link)
- Option 2: Self-hosting (`docker compose up`)
- WSL2 setup notes, `network_mode: host` rationale
- Dev server (`pnpm dev`)

## Export & backup → README

See [README.md → Data Export] and [README.md → Data Backup] for:
- `./scripts/export-data.sh` usage
- `./backup.sh` usage (local, R2, cron automation)
- `.env` credentials setup

## Key constraints (not in README directly)

- **Image only** — JPEG/PNG. No PDF, no MusicXML.
- **Two-branch strategy** (archive): demo layer was ported to `main` under `src/demo/`. The `demo` branch was deleted. See [Design Decisions → Session 5](design-decisions.md#5-unified-demo-layer-on-main-decided-2026-07-18) for details.

## Key files to check first

When making changes, always start by understanding these files:

| File | Purpose |
|------|---------|
| `src/db/schema.ts` | Drizzle schema — source of truth for data model |
| `src/lib/data.ts` | Server-side data layer (CRUD operations) |
| `src/lib/types.ts` | Shared TypeScript types |
| `src/app/api/**/route.ts` | API route handlers (thin wrappers around data.ts) |
| `src/components/Directory.tsx` | Main list/table view |
| `src/components/Detail.tsx` | Piece detail/edit view |
| `src/components/TagPicker.tsx` | Tag selection UI |
| `src/components/Settings.tsx` | Import/export backup & restore UI |
| `src/lib/export-import.ts` | Server-side export/import data layer |
| `src/app/api/import/route.ts` | Import zip endpoint (merge/replace) |
| `src/app/api/export/route.ts` | Export zip endpoint |
| `src/app/api/export/status/route.ts` | Export status endpoint |
| `src/app/api/export/rollback/route.ts` | Rollback to snapshot endpoint |
| `src/lib/i18n.ts` | i18n translations (zh-CN, en-US) |
| `SCHEMA.md` | Export data format (mirrors DB schema) |
| `playwright.config.ts` | E2E test config (runs demo mode on port 3002) |
| `e2e/` | E2E test files (directory, detail, tags, images, i18n) |

## Commands

```bash
pnpm test          # Unit/integration tests (Vitest)
pnpm test:e2e      # E2E tests (Playwright — auto-starts demo mode on :3002)
pnpm test:e2e:ui   # E2E tests with Playwright UI mode
```

## E2E test setup

- Uses `playwright.config.ts` with a `webServer` config that auto-starts `NEXT_PUBLIC_DEMO_MODE=true next dev -p 3002`
- `reuseExistingServer: !process.env.CI` — reuses an already-running dev server locally
- Test files live in `e2e/`:
  - `directory.spec.ts` — browse, search, filter, create/rename/delete pieces
  - `detail.spec.ts` — piece detail page, edit fields
  - `tags.spec.ts` — tag picker, add/remove tags
  - `images.spec.ts` — image upload and management
  - `i18n.spec.ts` — language switching
  - `enharmonic.spec.ts` — enharmonic format button behavior
- Fixtures in `e2e/fixtures/` include seed data (`seed.ts`) and test images (`test-staff.png`, `test-numbered.png`)
- Retries: 0 locally, 2 on CI. Workers: unlimited locally, 1 on CI.
- Reports: HTML output to `playwright-report/`, screenshots on failure
- Runs against **demo mode** (no server needed). For server-side tests, would need a different baseURL.

### Running e2e tests efficiently

The Playwright `webServer` config auto-starts the dev server, but the **first cold start (Next.js Turbopack compilation) can take 30s+**, causing `page.goto("/")` to hit the default 30s test timeout.

**Recommended workflow to avoid timeouts:**

1. Start the dev server manually first, let it finish compiling:
   ```bash
   cd /home/yujinz/sheet-folio
   NEXT_PUBLIC_DEMO_MODE=true pnpm exec next dev -p 3002
   # Wait for "✓ Ready in ..." message
   ```
2. In another terminal, kill any stale port-3002 process if needed:
   ```bash
   fuser -k 3002/tcp
   ```
3. Run the tests — they reuse the already-running server:
   ```bash
   pnpm exec playwright test <file> --reporter=line
   ```

Using `mode: "async"` for the dev server + `mode: "sync"` for the tests in separate terminals is the most reliable approach.

## Testing strategy

- **Unit tests** (Vitest) for: utility functions, hooks, pure logic, DB operations, component rendering logic
- **E2E tests** (Playwright) for: browser interactions, real UI flows, cross-component behavior
- Prefer unit tests whenever possible — they are faster and more reliable.
- Example: `pitch-utils.ts` functions (getEnharmonicEquivalent, etc.) → unit tests. TagPicker dialog interactions → e2e.

## Demo mode architecture

- `NEXT_PUBLIC_DEMO_MODE=true` triggers static export with no server
- `src/demo/init.tsx` installs `window.fetch` interceptor → routes `/api/*` to demo-store
- `src/demo/seed.ts` provides initial demo data
- `src/db/index.ts` returns a stub when `NEXT_PUBLIC_DEMO_MODE=true` (prevents SQLite file access during demo builds)
- **Sync rule**: changes to `src/lib/data.ts` must be mirrored in `src/lib/demo-store.ts`; changes to API routes must be mirrored in `src/lib/demo-fetch.ts`