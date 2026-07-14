import { db } from "@/db";
import { categoryLabels } from "@/db/schema";

const DEFAULTS = [
  { key: "pitch", nameZh: "音高", nameEn: "Pitch", sortOrder: 0 },
  { key: "rhythm", nameZh: "节拍", nameEn: "Rhythm", sortOrder: 1 },
  { key: "technique", nameZh: "技巧", nameEn: "Technique", sortOrder: 2 }
];

/**
 * If the category_labels table is empty, insert the 3 default categories.
 * Idempotent — safe to call on every request.
 */
export function seedDefaultCategories() {
  const existing = db.select().from(categoryLabels).get();
  if (existing) return;
  for (const cat of DEFAULTS) {
    db.insert(categoryLabels).values(cat).run();
  }
}
