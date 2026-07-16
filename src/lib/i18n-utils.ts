/**
 * Return the localized version of a bilingual field pair.
 *
 * When `locale` is "en-US": prefer `alt`, fall back to `primary`.
 * When `locale` is "zh-CN": prefer `primary`, fall back to `alt`.
 */
export function getLocalizedField(locale: string, primary: string, alt: string): string {
  return locale === "en-US" ? (alt || primary) : (primary || alt);
}
