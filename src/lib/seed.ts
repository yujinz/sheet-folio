import { db } from "@/db";
import { tagCategories } from "@/db/schema";

const DEFAULTS = [
  { key: "pitch", name: "音高", nameAlt: "Pitch", sortOrder: 0 },
  { key: "rhythm", name: "节拍", nameAlt: "Rhythm", sortOrder: 1 },
  { key: "technique", name: "技巧", nameAlt: "Technique", sortOrder: 2 }
];

/**
 * If the tag_categories table is empty, insert the 3 default categories.
 * Idempotent — safe to call on every request.
 */
export function seedDefaultCategories() {
  const existing = db.select().from(tagCategories).get();
  if (existing) return;
  for (const cat of DEFAULTS) {
    db.insert(tagCategories).values(cat).run();
  }
}
