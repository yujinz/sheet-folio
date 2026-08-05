# Agent Instructions — Sheet Folio

## Memory: `.github/memories/` is the single source of truth

**All sheet-folio project knowledge lives in `.github/memories/`** — version-controlled and shared across clones. There are NO sheet-folio duplicates in `/memories/`. When this project's knowledge changes, update the file in `.github/memories/` and commit it. (Other projects' memory files in `/memories/` are unrelated; leave them alone.)

| File | Purpose |
|------|---------|
| `.github/memories/project-overview.md` | Tech stack, commands, key files, architecture |
| `.github/memories/known-issues.md` | Bugs, workarounds, fixes |
| `.github/memories/design-decisions.md` | Architecture rationale, schema decisions |
| `.github/memories/demo-architecture.md` | Sync rules between server/demo layers |
| `.github/memories/ui-patterns.md` | i18n requirements, CSS conventions |
| `.github/memories/terminal-tips.md` | Wrapper scripts, build gotchas |
| `.github/memories/implementation-roadmap.md` | Completed features + planned work |

Avoid the VS Code repo-memory location `/memories/repo/` (workspace storage ID can change on WSL reconnect, causing data loss).

## Before taking ANY action, read the relevant section below

> These checklists apply to **all** agent actions — running commands, editing code, debugging, investigating. Do not skip them. If you don't read the right file before acting, you risk wrong ports, wrong commands, or missed known issues.

### Before running ANY command

Read these files **before** running terminal commands, tests, builds, scripts, or dev servers:

| File | What to check |
|------|---------------|
| `.github/memories/project-overview.md` → Commands (line ~65) | Correct pnpm commands (`pnpm test:e2e`, not raw `playwright test`) |
| `.github/memories/project-overview.md` → E2E test setup (line ~73) | Port 3002, cold-start workflow, `reuseExistingServer` config |
| `.github/memories/terminal-tips.md` | Use `pnpm build:demo` wrapper (avoids manual-approval prompt for env vars) |
| `.github/memories/known-issues.md` → Demo build (line ~9) | Always use `pnpm build:demo`, not raw `next build` |

### Before editing code

Read these files **before** writing or modifying any source file:

| Order | File | Why |
|-------|------|-----|
| 1 | `README.md` | Project overview, constraints, build/run instructions |
| 2 | `.github/memories/project-overview.md` → Key files (line ~47) | Tech stack, key files, demo architecture |
| 3 | `src/db/schema.ts` | Drizzle schema — data model source of truth |
| 4 | `src/lib/data.ts` | Server-side data layer (route handlers wrap this) |
| 5 | `src/app/api/**/route.ts` | API route handlers |
| 6 | `.github/memories/known-issues.md` | Bugs, workarounds, fixes |
| 7 | `.github/memories/ui-patterns.md` | i18n requirements, CSS class conventions |
| 8 | `.github/memories/demo-architecture.md` | Sync rules between server layer and demo layer |

### Before debugging or investigating

Read these files **before** analyzing errors, investigating behavior, or troubleshooting:

| File | What to check |
|------|---------------|
| `.github/memories/known-issues.md` | Known bugs, past fixes, workarounds (may save hours of debugging) |
| `.github/memories/project-overview.md` → E2E test setup (line ~73) | Port, config, cold-start issues |
| `.github/memories/design-decisions.md` | Architecture rationale, schema decisions that explain "why" |
| `.github/memories/project-overview.md` → Demo architecture (line ~119) | Which data layer is active and how they relate |
