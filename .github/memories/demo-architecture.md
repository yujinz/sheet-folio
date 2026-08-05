# Demo Architecture (Unified on `main`)

## Two data layers, one codebase

Both the server-side and client-side (demo) data layers live on the **`main` branch**:

- **Server layer**: `src/lib/data.ts` + `src/app/api/**` — SQLite via Drizzle ORM, used in production and self-hosted Docker
- **Demo layer**: `src/demo/` — IndexedDB/Dexie, used when `NEXT_PUBLIC_DEMO_MODE=true`
  - `src/demo/store.ts` — data operations (mirrors `src/lib/data.ts`)
  - `src/demo/fetch.ts` — fetch interceptor (mirrors `src/app/api/**`)
  - `src/demo/db.ts` — Dexie schema (mirrors `src/db/schema.ts`)
  - `src/demo/seed.ts` — seed data (mirrors `src/lib/seed.ts`)
  - `src/demo/init.tsx` — client-side initializer, mounted in layout
- Both layers share identical UI/UX components (Directory, Detail, TagPicker, etc.)

## Why unify?

- **e2e tests** can run on `main` against demo mode without branch switching
- **Sync is simpler**: update both layers in the same PR
- **No drift**: both layers are always visible in the same codebase

## Demo mode activation
- Build: `pnpm build:demo` → runs `scripts/build-demo.mjs` which temporarily renames `src/app/api/` out of the way, then builds with `NEXT_PUBLIC_DEMO_MODE=true`
- Local dev: `NEXT_PUBLIC_DEMO_MODE=true pnpm dev` — no api/ rename needed (not a static export)
- Runtime: `DemoInit.tsx` installs `window.fetch` interceptor → routes `/api/*` to `src/demo/store.ts`
- Seed: `src/demo/seed.ts` provides initial data (2 pieces + 11 tags)

## Sync points (same branch, same PR)

When a feature/change is made, update these files in the same PR:

| Server file | Demo file | What to sync |
|---|---|---|
| `src/lib/data.ts` | `src/demo/store.ts` | Every data operation function |
| `src/app/api/**/route.ts` | `src/demo/fetch.ts` ROUTES array | Every API route needs a matching pattern + method handler |
| `src/db/schema.ts` | `src/demo/db.ts` (Dexie schema) | Table/column changes must be mirrored |
| `src/lib/types.ts` | (shared) | Types are shared, no sync needed |
| `src/lib/seed.ts` | `src/demo/seed.ts` | Seed data should reflect same categories/tags |

## Safety nets

1. **Route coverage check** (`pnpm check:demo-routes`): Verifies every `src/app/api/**/route.ts` has a matching entry in `demo/fetch.ts` ROUTES
2. **Build-time catch**: `pnpm build:demo` fails at compile time if a function referenced in `demo/store.ts` or `demo/fetch.ts` is missing
3. **Demo CI / build check**: `pnpm build:demo` fails if the demo layer is out of sync
