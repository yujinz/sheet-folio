# UI consistency patterns

## Search & filter collapse (directory)
- Filter-area visibility is driven by the **search query**, never by focus/blur (focus/blur-driven layout changes shift the table under taps on iOS and break piece navigation).
- Rules: empty query → filter area visible and no "Filters" toggle; non-empty query → auto-collapse + show a header "Filters" toggle; clearing the query reopens the area. Only the first search focus clears filters.
- Track the previous empty/non-empty state with a ref so the collapse toggles only on the empty↔non-empty transition (not on every keystroke — otherwise a manually opened panel snaps shut while typing).

## i18n
- All user-facing text must have both zh-CN and en-US entries in `src/lib/i18n.ts`
- Custom category labels accept separate zh/en names stored as `{ key, labelZh, labelEn }`
- Tag create/edit dialogs (`TagPicker.tsx`) show a small muted language label above each name input: `{localeLabels["zh-CN"]}` (中文) and `{localeLabels["en-US"]}` (English). First input is always the Chinese name, second is English. New-category dialog in `Directory.tsx` uses `t.categoryNameZh` / `t.categoryNameEn` placeholders instead.
- Use `.input`, `.text-button`, `.icon-button` CSS classes for consistent sizing
- Avoid `!h-*` / `!py-*` overrides — use the standard class sizing instead
- If custom font size is needed, use inline `style={{ fontSize: "12px" }}` (consistent with tag area) or `fontSize: "14px"` (consistent with header)

## Fullscreen pager (`Pager` in `src/components/Detail.tsx`)
- Uses `.fullscreen-view` (`position: fixed; width: 100dvw; height: 100dvh; z-index: 50; bg: #111`)
- A `.fullscreen-active` class is toggled on `<html>` while the pager is open (`background: #111; min-height: 100dvh`)
- **Known issue**: iPad Safari shows a thin non-black strip at the bottom — see `known-issues.md`. Multiple CSS and JS approaches (dvh, -webkit-fill-available, portal, pixel dimensions) all failed.
- Flip-mode prev/next arrows dim to `opacity-15` + `pointer-events-none` at the first/last image; otherwise `opacity-40 hover:opacity-80`
- Exit (X) button sits top-left at `left-6`; save-image button was removed from fullscreen (users long-press / right-click instead)
