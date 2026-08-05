import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

type DbCache = {
  db: ReturnType<typeof drizzle<typeof schema>>;
  sqlite: Database.Database;
};

declare global {
  var sheetFolioDb: DbCache | undefined;
}

/**
 * File-based mutex using atomic mkdir.
 *
 * `fs.mkdirSync` succeeds only if the directory doesn't exist, making it an
 * atomic test-and-set on Linux (including Docker's overlayfs). Workers that
 * don't acquire the lock spin-wait with Atomics.wait (which yields the CPU
 * without burning it) and retry up to `retries` times at `delayMs` intervals.
 *
 * If all retries are exhausted, the caller skips migration and proceeds with
 * an open connection — safe because the lock holder will have finished by then
 * (usually in <100ms). In the worst case (lock holder crashed), the stale lock
 * directory is ephemeral and won't persist across container restarts.
 */
const MIGRATION_LOCK = ".migrate.lock";

function acquireLock(lockDir: string, retries: number, delayMs: number): boolean {
  for (let i = 0; i < retries; i++) {
    try {
      fs.mkdirSync(lockDir);
      return true;
    } catch {
      if (i < retries - 1) {
        // Yield CPU; another worker may be holding the lock while migrating.
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
      }
    }
  }
  return false;
}

function releaseLock(lockDir: string) {
  try {
    fs.rmdirSync(lockDir);
  } catch {
    // Directory may have already been cleaned up — nothing to do.
  }
}

function createDb() {
  const dbPath = process.env.DB_PATH || path.join(process.cwd(), "data", "sheet-folio.db");
  const dataDir = path.dirname(dbPath);
  fs.mkdirSync(dataDir, { recursive: true });

  // ── Demo mode guard ────────────────────────────────────────────────
  //
  // When NEXT_PUBLIC_DEMO_MODE=true (used by pnpm build:demo for the
  // static-site demo), the app uses IndexedDB in the browser via Dexie.
  // The server-side SQLite database should not be opened or migrated.
  // Return a stub so the module compiles on both branches.
  //
  // ────────────────────────────────────────────────────────────────────
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    return { db: undefined as unknown as ReturnType<typeof drizzle<typeof schema>>, sqlite: null as unknown as Database.Database };
  }

  // ── Migration lock ──────────────────────────────────────────────────
  //
  // WHY THIS IS NEEDED:
  // During `next build`, the "Collecting page data" phase runs multiple
  // worker threads in parallel. Each worker evaluates server modules
  // independently, so `globalThis` — used below to cache the DB connection
  // — is NOT shared across workers. Every worker that imports @/db calls
  // `createDb()`, opening its own better-sqlite3 connection to the same
  // SQLite file. The first worker's `migrate()` then runs DDL (ALTER TABLE,
  // CREATE TABLE) which needs an exclusive SQLite lock. Meanwhile another
  // worker holds its own connection open, causing SQLITE_BUSY.
  //
  // This only manifests on a fresh database (no prior __drizzle_migrations
  // table). On an already-migrated DB, `migrate()` is a fast no-op and the
  // race window is too narrow to trigger.
  //
  // WHY NOT OTHER APPROACHES:
  // • Move migrate() to docker-entrypoint.sh → requires sqlite3 CLI in
  //   the slim container, couples infra to schema changes.
  // • Lazy-init on first query → race just moves to the first query.
  // • PRAGMA locking_mode = EXCLUSIVE → serializes ALL access, defeats
  //   WAL mode entirely.
  // • Modify migration SQL to use IF NOT EXISTS → only works for CREATE,
  //   not ALTER TABLE RENAME. Breaks on re-generate.
  //
  // The file-based lock via atomic mkdir is a self-contained, predictable
  // fix with no external dependencies. mkdir is atomic on the overlayfs
  // used by Docker, and the lock directory is auto-cleaned on container
  // restart (ephemeral filesystem).
  //
  // ──────────────────────────────────────────────────────────────────────
  const lockDir = path.join(dataDir, MIGRATION_LOCK);
  const hasLock = acquireLock(lockDir, 60, 100);

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });

  if (hasLock) {
    // Auto-backup before migrating, so we can recover if something goes wrong
    try {
      const backupPath = path.join(dataDir, `sheet-folio.backup-${Date.now()}.db`);
      sqlite.backup(backupPath);
      // Keep only the 5 most recent backups
      const backups = fs.readdirSync(dataDir)
        .filter((f) => f.startsWith("sheet-folio.backup-") && f.endsWith(".db"))
        .map((f) => ({ name: f, mtime: fs.statSync(path.join(dataDir, f)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
      for (const old of backups.slice(5)) {
        fs.rmSync(path.join(dataDir, old.name), { force: true });
      }
    } catch {
      // Backup is best-effort; don't block migration if it fails
    }

    try {
      migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
    } finally {
      releaseLock(lockDir);
    }
  }

  const presets = [
    ["pitch", "高音", "High notes", "#2563eb"],
    ["pitch", "低音", "Low notes", "#0891b2"],
    ["technique", "连音", "Legato", "#ea580c"],
    ["technique", "颤音", "Trill", "#dc2626"],
    ["technique", "装饰音", "Ornament", "#b45309"],
    ["rhythm", "附点", "Dotted", "#c026d3"],
    ["rhythm", "三连音", "Triplet", "#7c3aed"]
  ] as const;

  const insertPreset = sqlite.prepare("INSERT OR IGNORE INTO tags (category, name, name_alt, color) VALUES (?, ?, ?, ?)");
  const updatePresetNameAlt = sqlite.prepare("UPDATE tags SET name_alt = ? WHERE name = ? AND (name_alt IS NULL OR name_alt = '')");
  for (const preset of presets) {
    insertPreset.run(preset[0], preset[1], preset[2], preset[3]);
    updatePresetNameAlt.run(preset[2], preset[1]);
  }

  return { db, sqlite };
}

export const db = globalThis.sheetFolioDb?.db ?? (globalThis.sheetFolioDb = createDb()).db;

/**
 * Returns the raw better-sqlite3 connection used by the app (or null in
 * demo mode). Used by snapshot/rollback in src/lib/export-import.ts.
 */
export function getSqliteConnection(): Database.Database | null {
  return globalThis.sheetFolioDb?.sqlite ?? null;
}


// Graceful shutdown: close the database connection on SIGTERM/SIGINT
if (typeof process !== "undefined") {
  const handleShutdown = () => {
    const cache = globalThis.sheetFolioDb;
    if (cache) {
      cache.sqlite.close();
      globalThis.sheetFolioDb = undefined;
    }
    process.exit(0);
  };
  process.on("SIGTERM", handleShutdown);
  process.on("SIGINT", handleShutdown);
}

export type Db = typeof db;
