import { and, eq, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { tags } from "@/db/schema";

/**
 * Check whether another tag in the same category already has a matching name or nameAlt.
 * When `excludeId` is provided, that tag is excluded from the check (for updates).
 */
export function findDuplicateTag(category: string, name: string, nameAlt: string, excludeId?: number) {
  const nameConditions = [eq(tags.name, name)];
  if (nameAlt) {
    nameConditions.push(eq(tags.name, nameAlt));
    nameConditions.push(eq(tags.nameAlt, name));
    nameConditions.push(eq(tags.nameAlt, nameAlt));
  }
  const conditions: any[] = [eq(tags.category, category), or(...nameConditions)];
  if (excludeId !== undefined) {
    conditions.push(ne(tags.id, excludeId));
  }
  return db.select().from(tags).where(and(...conditions)).get();
}
