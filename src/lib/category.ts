import { CORE_CATEGORIES } from "./types";
import { messages } from "./i18n";

/**
 * Check whether a label matches a built-in category's display name in either locale.
 */
export function isCoreCategoryLabel(label: string): boolean {
  if (!label) return false;
  const lower = label.toLowerCase();
  for (const cat of CORE_CATEGORIES) {
    if (messages["zh-CN"][cat].toLowerCase() === lower) return true;
    if (messages["en-US"][cat].toLowerCase() === lower) return true;
  }
  return false;
}

/**
 * Generate a URL-safe category key from bilingual names.
 * Uses the English name, falling back to Chinese, lowercased with spaces replaced by hyphens.
 */
export function categoryKey(zh: string, en: string): string {
  return (en.trim() || zh.trim()).toLowerCase().replace(/\s+/g, "-");
}

/**
 * Validate whether a new category can be created with the given key.
 */
export function canAddCategory(key: string, existingKeys: string[]): { valid: boolean; reason?: string } {
  if (!key) return { valid: false, reason: "Key is empty" };
  if ((CORE_CATEGORIES as readonly string[]).includes(key)) {
    return { valid: false, reason: "Conflicts with a built-in category" };
  }
  if (existingKeys.includes(key)) {
    return { valid: false, reason: "A category with this key already exists" };
  }
  return { valid: true };
}

/**
 * Validate whether a category can be renamed from oldKey to newKey.
 * Returns `isNoop: true` when the key hasn't changed (labels-only update).
 */
export function canRenameCategory(oldKey: string, newKey: string, existingKeys: string[]): { valid: boolean; reason?: string; isNoop?: boolean } {
  if (!newKey) return { valid: false, reason: "New key is empty" };
  if (newKey === oldKey) return { valid: true, isNoop: true };
  if ((CORE_CATEGORIES as readonly string[]).includes(newKey)) {
    return { valid: false, reason: "Conflicts with a built-in category" };
  }
  if (existingKeys.includes(newKey)) {
    return { valid: false, reason: "A category with this name already exists" };
  }
  return { valid: true };
}
