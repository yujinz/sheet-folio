/**
 * Build script for demo (static export) mode.
 *
 * Temporarily renames src/app/api/ out of the way so Next.js's static export
 * doesn't try to bundle better-sqlite3 (a native module that can't be bundled
 * for the browser). Restores the folder after the build completes, even on
 * Ctrl+C (SIGINT/SIGTERM handlers).
 *
 * If something goes wrong despite the signal handlers (e.g. SIGKILL, power
 * outage), restore with:
 *   git restore src/app/api
 *   mv src/app.api.bak src/app/api   (if backup file still exists)
 */

import { existsSync, renameSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const apiDir = join(root, "src/app/api");
const backupDir = join(root, "src/app.api.bak");

function restore() {
  if (existsSync(backupDir)) {
    try {
      renameSync(backupDir, apiDir);
      console.log("[build-demo] Restored src/app/api");
    } catch (err) {
      console.error("[build-demo] Failed to restore src/app/api:", err.message);
    }
  }
}

// Register signal handlers — catch Ctrl+C and still restore
["SIGINT", "SIGTERM", "SIGHUP"].forEach((sig) => {
  process.on(sig, () => {
    console.log(`\n[build-demo] Caught ${sig}, restoring src/app/api...`);
    restore();
    process.exit(1);
  });
});

// ── Build ──────────────────────────────────────────────────────────────────

if (!existsSync(apiDir)) {
  console.error("[build-demo] src/app/api not found — are you in the project root?");
  process.exit(1);
}

console.log("[build-demo] Moving src/app/api out of the way...");
renameSync(apiDir, backupDir);

try {
  execSync("pnpm exec next build", {
    cwd: root,
    env: { ...process.env, NEXT_PUBLIC_DEMO_MODE: "true" },
    stdio: "inherit",
  });
  console.log("[build-demo] Build complete.");
} finally {
  restore();
}
