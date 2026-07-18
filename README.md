# Sheet Folio

A sheet music manager with a web UI accessible from both PC and mobile device. Built exclusively for **image-based sheet music (JPEG/PNG)**. Does not support PDFs or XMLs.


The interface is available in Chinese (zh-CN) and English (en-US), but the data model supports arbitrary languages via primary and alternate name fields. Designed for easy extension beyond the two currently implemented UI languages.

App features:
- Create, edit, and delete pieces
- Browse, search, filter, and sort a directory of pieces
- Upload, delete, and reorder sheet images
- Scroll and page-flip sheet views
- Color-coded difficulty/technique/pitch/rhythm tags with support for adding custom tag categories (pitch tags get rainbow colors by octave, sorted low→high)
- Per-device zoom persistence and favorite pieces
- Sheet source link and video links
- Responsive UI polished across PC, iPad, and phone (frozen table headers, adaptive layouts, and touch-friendly interactions)
- Automated backup with SHA dedup, pruning, and Cloudflare R2 sync (fully logged)

<details>
<summary><b>Note:</b> Self-hosted version is HTTP-only, LAN-only</summary>

The self-hosted version (Docker/pnpm) is designed for local LAN use over plain HTTP - no HTTPS, no authentication, no WAN exposure. If you want to deploy it on the open web, fork the repo and add your own auth/reverse-proxy layer. A few things to be aware of if you go that route:

- `crypto.randomUUID()` requires a secure context (HTTPS). The `Math.random`-based fallback in `generateId()` exists so LAN testing over plain HTTP works. If you add HTTPS, you can drop the fallback.
- No CSRF protection, no rate limiting, no session management. Remember to add them.

(The [demo branch](https://github.com/yujinz/sheet-folio/tree/demo) is a different beast — it's a self-contained static site where all data lives in the browser. None of the above applies.)

</details>


## Why Sheet Folio?

As a casual music lover, most of my sheet music isn't neatly formatted PDFs. Instead, they are screenshots from social media, quick photos taken during practice, or images saved from forums. 

Eventually, these scores end up **scattered all over my photo gallery**, mixed with daily photos and memes. Existing sheet music managers are traditionally architected around the PDF format. When you import photos, they force a conversion into a rigid PDF file. 

I built this app to treat images as first-class citizens. You can throw your image scores in here, stack multiple photos into a single song, and have a clean, dedicated space to navigate scores and practice on your tablets.

## Quick Start

### Option 1: Self Hosting with Docker

```bash
git clone https://github.com/yujinz/sheet-folio.git
cd sheet-folio
docker compose up -d

# To rebuild after code changes: 
docker compose up -d --build
```

Open `http://localhost:8888` in your browser. Stop with `docker compose down`. Data persists in Docker volumes. 

<details>
<summary><b>Note:</b> WSL2 setup</summary>

If running inside WSL2, add the below to `%USERPROFILE%\.wslconfig`:

```ini
[wsl2]
networkingMode=mirrored
firewall=false
```

Then restart WSL2 with `wsl --shutdown`, reopen your WSL2 terminal, and start docker.

</details>

<details>
<summary><b>Note: <code>network_mode: host</code></b></summary>

The `docker-compose.yml` uses `network_mode: host` instead of the more common `ports:` mapping, so that browsers on Windows can access the docker running inside WSL. This makes the container share the host's network stack directly without Docker's NAT/bridge layer. This is okay because:

- Sheet-folio is a LAN-only app with no reverse proxy or HTTPS requirement
- No inter-container communication is needed (no database or other companion containers)
- No other Docker container on the same machine is using the same 8888 port

If you later add containers that need to talk to each other (e.g., a database), switch to bridge networking with explicit `ports:` mapping.

</details>

### Option 2: Static Site Demo
Deployed at https://yujinz.github.io/sheet-folio/

WIP

## Demo

A browser-only demo of sheet-folio with the full UI. All data is stored in `sessionStorage` and lost when you close the tab — not meant for real use.

<details>
<summary><b>Build & run locally</b></summary>

```bash
pnpm build:demo
npx serve out -p 3456
```

Open `http://localhost:3456` in your browser.
</details>

<details>
<summary><b>Auto-deploy to GitHub Pages</b></summary>

1. In your repo **Settings → Pages → Build and deployment**, set **Source** to **"GitHub Actions"**.
2. Push to `main`. The `.github/workflows/deploy-demo.yml` workflow builds with `NEXT_PUBLIC_DEMO_MODE=true` and deploys.
3. If your repo name differs from `sheet-folio`, update the `NEXT_PUBLIC_BASE_PATH` env in `.github/workflows/deploy-demo.yml` to match.

The demo will be live at `https://<user>.github.io/<repo>/`.
</details>

<details>
<summary><b>How it works</b></summary>

- **`NEXT_PUBLIC_DEMO_MODE=true`** switches the build to `output: "export"` (static HTML/JS, no server).
- **`src/lib/demo-fetch.ts`** intercepts all `fetch("/api/*")` calls and routes them to a `sessionStorage`-based data store.
- **`src/lib/demo-store.ts`** mirrors every DB operation (pieces, tags, images, zoom, etc.) using JSON in `sessionStorage`.
- **`src/lib/demo-seed.ts`** contains the built-in tags, categories, and seed pieces — no SQLite needed.
- **Zero changes** to any UI component. The fetch interceptor is transparent to the app.

To add seed pieces or images, edit `src/lib/demo-seed.ts` and rebuild.

> **Keeping the demo in sync:** When `main` gets new features or API changes, merge into `demo`:
> ```bash
> git checkout demo
> git merge main
> # Resolve any conflicts in demo-only files, then push
> git push
> ```
> If the real API adds a new route, add a handler in `src/lib/demo-fetch.ts` and the corresponding operation in `src/lib/demo-store.ts` — the build will fail with a clear error if something is missing.
</details>

## Data Export

```bash
./scripts/export-data.sh
```
Exports the database from the running container, builds the export image, and outputs to `export-data/`. Requires the sheet-folio container to be running.

Output goes to `export-data/` (see [SCHEMA.md](SCHEMA.md) for the format):
- `pieces.json` — all pieces with tags, images, and links
- `tags.json` — all tags
- `images/{id}/{kind}/` — re-encoded images with EXIF metadata stripped
- `manifest.json` — export metadata

Logs milestones to `$HOME/logs/sheet-folio-export-data.log`. On failure, the last 20 lines of output are appended to the log.

## Data Backup

Creates compressed, SHA-deduplicated backups of both docker app volumes and exported data, with optional upload to object storage. Archives are named `<prefix>-<timestamp>-<sha12>.tar.gz` - identical data reuses the same file. Keeps the last 5 unique-SHA backups both locally and on cloud.

> **Note:**  Run `./scripts/export-data.sh` first to get fresh data, or use `--with-export` to do both in one step.

```bash
# Local backup (saves to ~/backups/sheet-folio/{volumes,exports}/)
./backup.sh
./backup.sh --export-dir <path>  # custom export source (default: export-data/)

# Run export first, then backup
./backup.sh --with-export
./backup.sh --with-export --r2-bucket <bucket-name>

# Also upload export to Cloudflare R2 (requires awscli)
./backup.sh --r2-bucket <bucket-name>

# Custom retention
./backup.sh --keep 10            # keep last 10 local archives (default: 5)
./backup.sh --r2-keep 20         # keep last 20 on R2 (default: same as --keep)
```

Logs milestones to `$HOME/logs/sheet-folio-backup.log` - created archives, SHA dedup events, and pruned file names are recorded. On failure, the last 20 lines of output are appended.

### Automation (cron)

Run `crontab -e` and add a daily job to run export + backup together:

```cron
# Runs at 3 AM every day - export fresh data, then backup and upload to R2
0 3 * * * cd /path/to/sheet-folio && ./backup.sh --with-export --r2-bucket <bucket-name>
```

Check the logs by:

```bash
tail -n 6  $HOME/logs/sheet-folio-export-data.log
tail -n 10 $HOME/logs/sheet-folio-backup.log
```


**Setup for Cloudflare R2:**

> **Note:**  R2 is chosen over other S3-compatible providers for its free tier - 10 GB of storage and 1 million writes per month, with zero egress fees (as of July 2026). For a backup archive that's a few hundred MB and updated daily, this keeps the cost at $0.

1. Create a bucket in the [R2 dashboard](https://dash.cloudflare.com/) → R2 → Create Bucket (e.g. `sheet-folio-backup`)
2. Get R2 credentials from **Manage R2 API Tokens** → Create API Token (Object Read & Write)
3. Add to `.env` in the project root:
   ```bash
   AWS_ACCESS_KEY_ID="your-access-key-id"
   AWS_SECRET_ACCESS_KEY="your-secret-key"
   AWS_ENDPOINT_URL_S3="https://<account-id>.r2.cloudflarestorage.com"
   ```
   The `.env` file is auto-loaded by `backup.sh`. Then pass the bucket name with `--r2-bucket`:

   ```bash
   ./backup.sh --r2-bucket sheet-folio-backup
   ```

## Development

For local development and testing outside Docker, run with pnpm.

### Quick start 

Requires Node.js and pnpm.

```bash
pnpm install
pnpm build
pnpm start

# To rebuild after code changes: 
pnpm build && pnpm start
```

Open `http://localhost:3000` in your browser. Data persists in `./data/sheet-folio.db`.

<details>
<summary><b>Note:</b> <code>pnpm start</code> vs <code>pnpm dev</code></summary>

`pnpm start` is used instead of `pnpm dev` so the app is accessible from other devices on the same LAN (see LAN testing below).

</details>

<details>
<summary><b>Note:</b> Docker standalone output</summary>

Docker needs `output: "standalone"` while `pnpm start` needs to run without it. The `next.config.ts` only enables standalone when `NEXT_OUTPUT_STANDALONE=true` (set in the Dockerfile's builder stage), so no manual toggling is needed between LAN testing and Docker builds.

</details>

### LAN testing

Develop on PC and test on mobile devices under the same LAN. Useful for verifying the responsive UI and touch interactions on real phones/tablets.


#### 1. Build and start

Make sure the server is running (`pnpm build && pnpm start` from the quick start above).

#### 2. Find your PC's LAN IP

The production server already listens on `0.0.0.0` (`--hostname 0.0.0.0` in `package.json`), so it's reachable from LAN devices without extra config.

| OS | Command |
|---|---|
| Linux / macOS | `hostname -I` or `ip addr show` |
| Windows (native) | `ipconfig` |
| WSL2 | `hostname -I` (see WSL2 notes below) |

#### 3. Access from mobile

Open `http://<lan-ip>:3000` in your mobile browser.

If the page loads but features relying on device IDs behave oddly, check that `crypto.randomUUID()` isn't throwing in an HTTPS-only context - the `Math.random` fallback in `generateId()` should be in place for plain HTTP.

---

<details>
<summary><b>Note:</b> WSL2 setup</summary>

If you are developing from WSL2, WSL2 runs on a virtual network not directly reachable from the LAN. Two approaches to fix this:

**A — Mirrored networking (recommended):**

Add to `%USERPROFILE%\.wslconfig` on Windows:

```ini
[wsl2]
networkingMode=mirrored
```

Then restart WSL2 (`wsl --shutdown`, reopen terminal). Your WSL services now share the Windows host IP directly.

**B — Port proxy (if mirrored networking doesn't work):**

Run in **PowerShell as Administrator**:

```powershell
$wslIP = (wsl hostname -I).Trim().Split()[0]
netsh interface portproxy add v4tov4 listenport=3000 listenaddress=0.0.0.0 connectport=3000 connectaddress=$wslIP
New-NetFirewallRule -DisplayName "WSL Next.js 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

> WSL2 IP changes after restart. Re-check with `hostname -I` and update the port proxy if needed.

</details>





### Data export

```bash
pnpm export-data
```

### Demo

A browser-only demo of sheet-folio on the [`demo`](https://github.com/yujinz/sheet-folio/tree/demo) branch — the same UI/UX, but all data lives in the browser. Uses client-side **IndexedDB** (via Dexie.js) instead of server-side database in the main branch. Data still persists after tab/browser close.

Deployed to GitHub Pages — see the [workflow](.github/workflows/deploy-demo.yml).

```bash
git checkout demo
pnpm install
pnpm build:demo
```

Open `out/index.html` in your browser. (WIP) A starter piece ("Ode to Joy") + 7 preset tags are auto-loaded on first visit.

#### Adding features on `main`: remember to sync `demo`

**UI-only changes** (components, styles, i18n) — no sync needed. Just merge:

```bash
git checkout demo
git merge main
```


 - UI files (`src/components/*`, `src/lib/types.ts`, `src/app/**/*.tsx`, `src/lib/i18n*`) merge cleanly
 - Files only exist on `demo` (`src/lib/demo-*` and `DemoInit.tsx`) are ignored during the merge from `main`
 - `src/db/*` and server-side `src/app/api/*` only meaningfully exist on `main` (demo replaces them with the fetch interceptor)
 - `src/lib/data-layer.ts` and `package.json` may have merge conflicts that need resolving.


**Backend/data layer changes** (new API routes, data operations, schema):

You're on `main` and you add a new backend feature. What about `demo`?

1. Add the new operation to the shared `DataLayer` interface (`src/lib/data-layer.ts`) in `main`. This file is a contract between `main` and `demo`.
   >  Note: If you forget this step, there's nothing to catch — main doesn't enforce it. But if you do update the interface and forget to implement the demo side as in step 5-6, `pnpm build:demo` will fail — that's the safety net.
2. Build passes. Commit on `main`.
3. Switch to `demo`, `git merge main`. The `DataLayer` interface changes come with the merge.
4. Implement the new `DataLayer` methods in `src/lib/demo-store.ts`
5. Add route handlers in `src/lib/demo-fetch.ts`
6. Mirror schema changes in `src/lib/demo-db.ts`
7. Run `pnpm check:demo-routes` + `pnpm build:demo` to verify
   > Note:  Update `scripts/check-demo-routes.ts` if route patterns changed



## Reference

<details>
<summary>Environment Variables, Database Migrations, Health Check</summary>

### Environment Variables

| Variable      | Default                        | Description                  |
|---------------|--------------------------------|------------------------------|
| `DB_PATH`     | `./data/sheet-folio.db`        | SQLite database file path    |
| `UPLOAD_DIR`  | `./data/uploads`               | Sheet music image upload dir |
| `PORT`        | `3000`                         | Internal server port         |
| `HOSTNAME`    | `0.0.0.0`                     | Bind to all network interfaces |

<details>
<summary><b>Note:</b> Docker Compose PORT</summary>

Docker Compose overrides `PORT` to `8888` — the app is accessible at `http://localhost:8888` when run via Docker.

</details>

### Database Migrations

Migrations run automatically on container startup. To generate new migrations during development:

```bash
pnpm db:generate
```

To manually apply migrations:

```bash
pnpm db:migrate
```

### Health Check

The app exposes `/api/health` for container health checks. Docker Compose and orchestrators will monitor this endpoint.

</details>

## License

[AGPLv3](LICENSE) - you may use, modify, and distribute this software freely,
but if you run it as a network service or distribute modified versions, you
must make your changes available under the same license.

