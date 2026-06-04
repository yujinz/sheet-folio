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

function createDb() {
  const dbPath = process.env.DB_PATH || path.join(process.cwd(), "data", "sheet-folio.db");
  const dataDir = path.dirname(dbPath);
  fs.mkdirSync(dataDir, { recursive: true });

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });

  const presets = [
    ["pitch", "高音", "#2563eb"],
    ["pitch", "低音", "#0891b2"],
    ["technique", "连音", "#ea580c"],
    ["technique", "颤音", "#dc2626"],
    ["technique", "装饰音", "#16a34a"],
    ["rhythm", "附点", "#c026d3"],
    ["rhythm", "三连音", "#0284c7"]
  ] as const;

  const insertPreset = sqlite.prepare("INSERT OR IGNORE INTO tags (category, name, color) VALUES (?, ?, ?)");
  for (const preset of presets) {
    insertPreset.run(preset[0], preset[1], preset[2]);
  }

  return { db, sqlite };
}

export const db = globalThis.sheetFolioDb?.db ?? (globalThis.sheetFolioDb = createDb()).db;

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
