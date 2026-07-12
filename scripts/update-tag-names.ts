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

const stmt = sqlite.prepare("UPDATE tags SET name_alt = ? WHERE name = ? AND (name_alt IS NULL OR name_alt = '')");
let updated = 0;
for (const [name, nameAlt] of updates) {
  const info = stmt.run(nameAlt, name);
  if (info.changes > 0) {
    updated += info.changes;
    console.log(`  Updated "${name}" → "${nameAlt}"`);
  }
}

console.log(`\nDone. ${updated} tags updated.`);
sqlite.close();