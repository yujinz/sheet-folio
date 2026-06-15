import Database from "better-sqlite3";
import path from "node:path";

const dbPath = path.resolve(process.argv[2] || path.join(process.cwd(), "data", "sheet-folio.db"));
console.log(`Updating tags in: ${dbPath}`);

const sqlite = new Database(dbPath);

// Update preset tags with English names
const updates: [string, string][] = [
  ["高音", "High notes"],
  ["低音", "Low notes"],
  ["连音", "Legato"],
  ["颤音", "Trill"],
  ["装饰音", "Ornament"],
  ["附点", "Dotted"],
  ["三连音", "Triplet"],
];

const stmt = sqlite.prepare("UPDATE tags SET name_en = ? WHERE name = ? AND (name_en IS NULL OR name_en = '')");
let updated = 0;
for (const [name, nameEn] of updates) {
  const info = stmt.run(nameEn, name);
  if (info.changes > 0) {
    updated += info.changes;
    console.log(`  Updated "${name}" → "${nameEn}"`);
  }
}

console.log(`\nDone. ${updated} tags updated.`);
sqlite.close();