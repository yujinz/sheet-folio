"use client";

import { Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocale } from "@/lib/useLocale";
import type { Tag, TagCategory } from "@/lib/types";

const TAG_COLORS = [
  "#2563eb", // blue
  "#0891b2", // cyan
  "#0d9488", // teal
  "#15803d", // green
  "#65a30d", // lime
  "#4d7c0f", // olive
  "#7c3aed", // purple
  "#9333ea", // violet
  "#c026d3", // fuchsia
  "#db2777", // pink
  "#be123c", // rose
  "#b91c1c", // red
  "#ea580c", // orange
  "#d97706", // amber
  "#a16207", // dark yellow
  "#92400e", // brown
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
  const { t } = useLocale();
  const [name, setName] = useState("");
  const [color, setColor] = useState(() => pickDefaultColor(tags, "#0d9488"));
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const visibleTags = selectedOnly ? tags.filter((tag) => selectedSet.has(tag.id)) : tags;
  const selectedTags = tags.filter((tag) => selectedSet.has(tag.id));
  const availableTags = tags.filter((tag) => !selectedSet.has(tag.id));

  function toggle(id: number) {
    onChange(selectedSet.has(id) ? selected.filter((value) => value !== id) : [...selected, id]);
  }

  async function createTag() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const tag = await onCreate({ name: trimmed, color, category });
    onChange([...selected, tag.id]);
    setName("");
    setColor(pickDefaultColor([...tags, tag], color));
  }

  async function deleteTag(tag: Tag) {
    if (!onDelete || !confirm(t.deleteTagConfirm)) return;
    await onDelete(tag);
    onChange(selected.filter((id) => id !== tag.id));
  }

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {selectedTags.map((tag) => (
          <span key={tag.id} className="tag-pill-group inline-flex overflow-hidden rounded-full">
            <span
              className="tag-pill rounded-r-none"
              style={{ background: tag.color }}
            >
              {tag.name}
            </span>
            <button
              aria-label={`${t.removeTag}: ${tag.name}`}
              className="tag-pill tag-pill-remove px-2"
              style={{ background: tag.color, borderBottomLeftRadius: 0, borderTopLeftRadius: 0, opacity: 0.85 }}
              type="button"
              onClick={() => onChange(selected.filter((id) => id !== tag.id))}
            >
              <X size={13} />
            </button>
          </span>
        ))}
        {availableTags.length > 0 && (
          <select
            aria-label={t.addTag}
            className="select tag-add-select"
            defaultValue=""
            onChange={(event) => {
              const id = Number(event.target.value);
              if (id) onChange([...selected, id]);
              event.target.value = "";
            }}
          >
            <option value="" disabled hidden></option>
            {availableTags.map((tag) => (
              <option key={tag.id} value={tag.id}>{tag.name}</option>
            ))}
          </select>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <div className="text-sm font-semibold">{t[category]}</div>
      <div className="flex flex-wrap gap-2">
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
              {tag.name}
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
      </div>
      <div className="flex gap-2">
        <input className="input min-w-0" value={name} onChange={(event) => setName(event.target.value)} placeholder={t.newTag} />
        {category === "pitch" && (
          <div className="flex gap-1">
            {["♭", "♯", "♮"].map((mark) => (
              <button key={mark} className="icon-button" type="button" onClick={() => setName((value) => `${value}${mark}`)}>
                {mark}
              </button>
            ))}
          </div>
        )}
        <input aria-label={t.tagColor} className="h-9 w-10" type="color" value={color} onChange={(event) => setColor(event.target.value)} />
        <button aria-label={t.addTag} className="icon-button" type="button" onClick={createTag}>
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}
