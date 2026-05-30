import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

type DbCache = {
  db: ReturnType<typeof drizzle<typeof schema>>;
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
    ["pitch", "临时升降号", "#7c3aed"],
    ["technique", "吐音", "#dc2626"],
    ["technique", "连音", "#ea580c"],
    ["technique", "换气", "#16a34a"],
    ["rhythm", "切分", "#9333ea"],
    ["rhythm", "附点", "#c026d3"],
    ["rhythm", "三连音", "#0284c7"]
  ] as const;

  const insertPreset = sqlite.prepare("INSERT OR IGNORE INTO tags (category, name, color) VALUES (?, ?, ?)");
  for (const preset of presets) {
    insertPreset.run(preset[0], preset[1], preset[2]);
  }

  return { db };
}

export const db = globalThis.sheetFolioDb?.db ?? (globalThis.sheetFolioDb = createDb()).db;
export type Db = typeof db;
