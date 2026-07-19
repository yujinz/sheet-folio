# Sheet Folio

A sheet music manager with a web UI accessible from both PC and mobile device. Built exclusively for **image-based sheet music (JPEG/PNG)**. Does not support PDFs or XMLs.


## Why Sheet Folio?

As a casual music lover, most of my sheet music isn't neatly formatted PDFs. Instead, they are screenshots from social media, photos taken during practice, or images saved from forums. Eventually, these sheets end up **scattered all over my photo gallery**, mixed with daily photos.

Existing music managers are built around PDFs. They force you to convert your photos into a PDF file just to import them. Once converted, adding a new photo or changing the image order becomes a chore.

I built this app to treat images as first-class citizens. You can throw your image sheets in here and have a clean, dedicated space to navigate and practice.


## Features

### Reading & Practice
- **Cross-Device Access:** Responsive UI polished across PC, iPad, and phone. Data syncs between devices for the self-hosting version.

<ul>
<details>
<summary><b>Note:</b> Self-hosted version is HTTP-only, LAN-only</summary>

 - The self-hosted version (Docker/pnpm) is designed for local LAN use over plain HTTP. No HTTPS, no authentication, no WAN exposure. If you want to deploy it on the open web, fork the repo and add your own auth/reverse-proxy layer.
</details>
</ul>

- **Image Stacking:** Group multiple images into a single piece for continuous scrolling or page-flipping views.
- **Reading Enhancements:** Per-device zoom persistence and favorite pieces.

### Library Management
- **Directory Management:** Create, edit, and delete pieces. Browse, search, filter, and sort your collection.
- **Tagging & Filtering:** Assign color-coded tags to your pieces and use them to filter the main directory. Pitch tags receive rainbow colors by octave, sorted low→high. Supports adding custom tag categories.
- **Notes and External Links:** Write practice notes and attach links for videos or sheet sources to your pieces.

### ⚙️ Technical Highlights

- **Two-Step Data Preservation Workflow:** Built-in scripts to keep your data secure and portable:
  1. **Data Export:** Export your collection into human-readable JSON metadata alongside your image files (see [SCHEMA.md](SCHEMA.md)). It also automatically strips all EXIF metadata from images to protect your privacy.
  2. **Backup & Cloud Sync:** Compress Docker volumes and the exported data into `.tar.gz` archives. Utilize SHA deduplication to reduce storage footprint, with native support for pruning old files and syncing to Cloudflare R2
- **Comprehensive Logging:** Milestones and error traces of the export and backup process are logged. Making it easy to manage with cron and monitor.
- **Easy Self-Hosting:** Designed for straightforward deployment on your home network. The backend is intentionally HTTP-only and LAN-only to keep setup simple. For a zero-server alternative, a static Demo mode runs the complete application entirely through your browser's IndexedDB.

### Language & Localization

* **UI**
  * **Built-in Languages:** Natively supports English (`en-US`) and 简体中文 (`zh-CN`).
  * **Easy Extension:** Extend beyond the two currently implemented languages by writing your own i18n JSON.

* **User Data**
  * **No Language Limits:** Song titles, tags, and descriptions support arbitrary languages.
  * **Alternative Bilingual Fields:** You can manage your library in a single language, or use the optional alternate name fields to display titles and tags in two languages .




## Quick Start

### Option 1: Static Site Demo
Deployed at https://yujinz.github.io/sheet-folio/

Offers the exact same UI/UX but utilizes the browser's IndexedDB to replace the backend database.

**Pros**: 
- Zero setup. Instantly test the UI and features directly in your browser. 
- Accessible from WAN.

(Note: If you encounter errors after loading a newly deployed version, clear your browser cache and IndexedDB).

**Cons** (⚠️Why it's not recommended for real use):

- Browsers may automatically clear your data after 7 days of inactivity.

- **Safari/iOS Auto-Deletion:** Safari automatically wipes local browser storage after 7 days of inactivity. To prevent data loss on Apple devices, you could use the "Add to Home Screen" feature to request persistent storage.

- Maximum storage size limits depend heavily on your specific browser.

- Data is sandboxed and does not sync between your devices.

(Roadmap: Add import/export zip interface on the app).



### Option 2: Self-Hosting (Recommended)

```bash
git clone https://github.com/yujinz/sheet-folio.git
cd sheet-folio
docker compose up -d

# To rebuild after pulling code changes: 
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

R2 is chosen over other S3-compatible providers for its free tier: 10 GB of storage and 1 million writes per month, with zero egress fees (as of July 2026). For a backup archive that's a few hundred MB and updated daily, this keeps the cost at $0.

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

A browser-only demo of sheet-folio — the same UI/UX, but all data lives in the browser. Uses client-side **IndexedDB** (via Dexie.js) instead of server-side SQLite database. Data persists after tab/browser close.

The demo data layer lives on **`main`** alongside the server code, under `src/demo/`:
- `src/demo/store.ts` — IndexedDB data operations (mirrors `src/lib/data.ts`)
- `src/demo/fetch.ts` — fetch interceptor that routes `/api/*` to the demo store
- `src/demo/db.ts` — Dexie schema (mirrors `src/db/schema.ts`)
- `src/demo/seed.ts` — initial seed data
- `src/demo/init.tsx` — client-side initializer

Deployed to GitHub Pages — see the [workflow](.github/workflows/deploy-demo.yml).

```bash
# Run demo mode locally (no SQLite, no Docker):
pnpm dev:demo

# Build static export (for GitHub Pages deployment):
NEXT_PUBLIC_BASE_PATH="/sheet-folio" pnpm build:demo   # or without BASE_PATH for local preview
pnpm build:demo
npx serve out -p 3456   # http://localhost:3456
```

Two starter pieces and a couple preset tags are auto-loaded on first visit.

<details>
<summary><b>Note:</b> Clearing IndexedDB after updating</summary>

After pulling demo changes that modify the database schema (new tables, new columns, etc.), you may need to clear the IndexedDB database for the new schema to take effect. Old data stored under a previous schema version can cause errors.

| Browser | Steps |
|---|---|
| Chrome / Edge | **DevTools** → **Application** → **Storage** → **IndexedDB** → right-click `sheet-folio-demo` → **Delete**, then refresh |
| Firefox | **DevTools** → **Storage** → **IndexedDB** → right-click `sheet-folio-demo` → **Delete All**, then refresh |
| Safari | **Developer** → **Show Web Inspector** → **Storage** → **IndexedDB** → select `sheet-folio-demo` → **Clear**, then refresh |

Alternatively, clear all site data for the demo domain at once: DevTools → **Application** → **Storage** → **Clear site data** (Chrome/Edge), or the equivalent **Clear storage** in other browsers.

</details>

#### Adding features: remember to sync the demo layer

Both data layers now live on **`main`**. When you change the server-side data layer, update the demo layer in the **same PR**.

**UI-only changes** (components, styles, i18n) — no sync needed. Both layers share the same UI code.

**Backend/data layer changes** (new API routes, data operations, schema):

1. Implement the server side in `src/lib/data.ts` and `src/app/api/**`.
2. Implement the demo side in `src/demo/store.ts`.
3. Add route handlers in `src/demo/fetch.ts`.
4. Mirror schema changes in `src/demo/db.ts` (Dexie).
5. Run `pnpm check:demo-routes` + `pnpm build:demo` to verify.

| Server file | Demo file | What to sync |
|---|---|---|
| `src/lib/data.ts` | `src/demo/store.ts` | Every data operation |
| `src/app/api/**/route.ts` | `src/demo/fetch.ts` ROUTES | Every API route |
| `src/db/schema.ts` | `src/demo/db.ts` | Table/column changes |
| `src/lib/seed.ts` | `src/demo/seed.ts` | Seed data |

> **Safety net**: If you implement the server side but forget the demo side, `pnpm build:demo` will fail at compile time (missing functions), and the route checker (`pnpm check:demo-routes`) catches missing handlers.



### Reference

<details>
<summary>Environment Variables, Database Migrations, Health Check</summary>

#### Environment Variables

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

#### Database Migrations

Migrations run automatically on container startup. To generate new migrations during development:

```bash
pnpm db:generate
```

To manually apply migrations:

```bash
pnpm db:migrate
```

#### Health Check

The app exposes `/api/health` for container health checks. Docker Compose and orchestrators will monitor this endpoint.

</details>

## License

[AGPLv3](LICENSE) - you may use, modify, and distribute this software freely,
but if you run it as a network service or distribute modified versions, you
must make your changes available under the same license.

