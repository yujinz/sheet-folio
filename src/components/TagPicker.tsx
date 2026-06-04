"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocale } from "@/lib/useLocale";
import type { Locale } from "@/lib/i18n";
import type { Tag, TagCategory } from "@/lib/types";

function tagDisplayName(tag: Tag, locale: Locale): string {
  if (locale === "en-US" && tag.nameEn) return tag.nameEn;
  if (locale === "en-US") return tag.name;
  // zh-CN: prefer Chinese name, fall back to English
  if (tag.name) return tag.name;
  return tag.nameEn;
}

const TAG_COLORS = [
  "#4a6fa5", // dusty blue
  "#5b8c7a", // sage
  "#7a6f9c", // muted lavender
  "#8c6b8c", // dusty mauve
  "#9e7b6b", // warm taupe
  "#6b8e6b", // moss
  "#7a8c8c", // slate
  "#a57c6b", // terracotta
  "#6b7a9c", // steel blue
  "#8c7a6b", // warm gray
  "#5b7a6b", // pine
  "#9c7a8c", // dusty rose
  "#7a7a9c", // periwinkle
  "#8c8c6b", // olive gray
  "#6b8c9c", // teal slate
  "#9c8c6b", // sandalwood
];

function pickDefaultColor(tags: Tag[], currentColor: string): string {
  const counts = new Map<string, number>();
  for (const c of TAG_COLORS) counts.set(c, 0);
  for (const tag of tags) {
    const existing = counts.get(tag.color);
    if (existing !== undefined) counts.set(tag.color, existing + 1);
  }
  // prefer a color different from the previous default
  let best = TAG_COLORS[0];
  let bestCount = Infinity;
  for (const c of TAG_COLORS) {
    const cnt = counts.get(c)!;
    if (cnt < bestCount || (cnt === bestCount && c !== currentColor && best === currentColor)) {
      best = c;
      bestCount = cnt;
    }
  }
  return best;
}

type Props = {
  category: TagCategory;
  tags: Tag[];
  selected: number[];
  onChange: (ids: number[]) => void;
  onCreate: (tag: Omit<Tag, "id">) => Promise<Tag>;
  onDelete?: (tag: Tag) => Promise<void>;
  editingTags?: boolean;
  selectedOnly?: boolean;
  compact?: boolean;
};

export default function TagPicker({ category, tags, selected, onChange, onCreate, onDelete, editingTags, selectedOnly, compact }: Props) {
  const { locale, t } = useLocale();
  const [name, setName] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [color, setColor] = useState(() => pickDefaultColor(tags, "#4a6fa5"));
  const [localTags, setLocalTags] = useState(tags);
  useEffect(() => setLocalTags(tags), [tags]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const visibleTags = selectedOnly ? localTags.filter((tag) => selectedSet.has(tag.id)) : localTags;
  const selectedTags = localTags.filter((tag) => selectedSet.has(tag.id));
  const availableTags = localTags.filter((tag) => !selectedSet.has(tag.id));

  function toggle(id: number) {
    onChange(selectedSet.has(id) ? selected.filter((value) => value !== id) : [...selected, id]);
  }

  async function createTag() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const tag = await onCreate({ name: trimmed, nameEn: nameEn.trim(), color, category });
    setLocalTags((prev) => [...prev, tag]);
    setName("");
    setNameEn("");
    setColor(pickDefaultColor([...tags, tag], color));
  }

  async function deleteTag(tag: Tag) {
    if (!onDelete || !confirm(t.deleteTagConfirm)) return;
    await onDelete(tag);
    onChange(selected.filter((id) => id !== tag.id));
  }

  if (compact) {
    return (
      <span className="inline-flex flex-wrap items-start gap-2">
        <select
          aria-label={t.addTag}
          className="select tag-add-select"
          defaultValue=""
          onChange={async (event) => {
            const val = event.target.value;
            if (val === "__new__") {
              const name = prompt(t[category] + " (中文)");
              if (name?.trim()) {
                const nameEn = prompt(t[category] + " (English)");
                const created = await onCreate({ name: name.trim(), nameEn: nameEn?.trim() ?? "", color: pickDefaultColor(localTags, "#4a6fa5"), category });
                setLocalTags((prev) => [...prev, created]);
                onChange([...selected, created.id]);
              }
            } else {
              const id = Number(val);
              if (id) onChange([...selected, id]);
            }
            event.target.value = "";
          }}
        >
          <option value="" disabled hidden>{t[category]}</option>
          {availableTags.map((tag) => (
            <option key={tag.id} value={tag.id}>{tagDisplayName(tag, locale)}</option>
          ))}
          <option value="__new__">+ {t.addTag}</option>
        </select>
        {selectedTags.length > 0 && (
          <span className="flex flex-wrap items-center gap-2">
            {selectedTags.map((tag) => (
              <span key={tag.id} className="tag-pill-group inline-flex overflow-hidden rounded-full">
                <span
                  className="tag-pill rounded-r-none"
                  style={{ background: tag.color }}
                >
                  {tagDisplayName(tag, locale)}
                </span>
                <button
                  aria-label={`${t.removeTag}: ${tagDisplayName(tag, locale)}`}
                  className="tag-pill tag-pill-remove px-2"
                  style={{ background: tag.color, borderBottomLeftRadius: 0, borderTopLeftRadius: 0, opacity: 0.85 }}
                  type="button"
                  onClick={() => onChange(selected.filter((id) => id !== tag.id))}
                >
                  <X size={13} />
                </button>
              </span>
            ))}
          </span>
        )}
      </span>
    );
  }

  return (
    <div className="grid gap-0.5">
      <div className="flex items-start gap-0.5">
        <span className="text-[12px] font-semibold">{t[category]}</span>
      </div>
      <div className="flex flex-wrap items-center gap-0.5">
        {visibleTags.map((tag) => (
          <span key={tag.id} className="tag-pill-group inline-flex overflow-hidden rounded-full">
            <button
              className="tag-pill rounded-r-none"
              style={{
                background: tag.color,
                opacity: selectedSet.has(tag.id) ? 1 : 0.35,
                outline: selectedSet.has(tag.id) ? "2px solid #111827" : "0",
                borderBottomRightRadius: editingTags && onDelete ? 0 : undefined,
                borderTopRightRadius: editingTags && onDelete ? 0 : undefined
              }}
              type="button"
              onClick={() => toggle(tag.id)}
            >
              {tagDisplayName(tag, locale)}
            </button>
            {editingTags && onDelete && (
              <button
                aria-label={t.deleteTag}
                className="tag-pill tag-delete-button px-2"
                style={{ background: tag.color, borderBottomLeftRadius: 0, borderTopLeftRadius: 0, opacity: 0.85 }}
                type="button"
                onClick={() => deleteTag(tag)}
              >
                <X size={13} />
              </button>
            )}
          </span>
        ))}
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {category === "pitch" && (
            <div className="flex gap-1">
              {["♭", "♯", "♮"].map((mark) => (
                <button key={mark} className="pill-add-button" type="button" onClick={() => setName((value) => `${value}${mark}`)}>
                  {mark}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1">
            <input
              className="flex-none"
              style={{ width: "5rem", fontSize: "12px", border: "1px solid var(--line)", borderRadius: "999px", background: "#fff", color: "var(--foreground)", padding: "3px 8px", minHeight: "24px", outline: "none" }}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={locale === "en-US" ? "Chinese name" : "中文名"}
            />
            <input
              className="flex-none"
              style={{ width: "5rem", fontSize: "12px", border: "1px solid var(--line)", borderRadius: "999px", background: "#fff", color: "var(--foreground)", padding: "3px 8px", minHeight: "24px", outline: "none" }}
              value={nameEn}
              onChange={(event) => setNameEn(event.target.value)}
              placeholder={locale === "en-US" ? "English name" : "英文名"}
            />
            <input aria-label={t.tagColor} className="h-6 w-6 rounded-full overflow-hidden cursor-pointer border-0 p-0" type="color" value={color} onChange={(event) => setColor(event.target.value)} style={{ background: "none", WebkitAppearance: "none" }} />
            <button aria-label={t.addTag} className="icon-button pill-add-button" type="button" onClick={createTag}>
              <Plus size={14} />
            </button>
          </div>
        </span>
      </div>
    </div>
  );
}