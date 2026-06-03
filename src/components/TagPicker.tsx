"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
  action?: React.ReactNode;
};

export default function TagPicker({ category, tags, selected, onChange, onCreate, onDelete, editingTags, selectedOnly, compact, action }: Props) {
  const { t } = useLocale();
  const [name, setName] = useState("");
  const [color, setColor] = useState(() => pickDefaultColor(tags, "#0d9488"));
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
    const tag = await onCreate({ name: trimmed, color, category });
    setLocalTags((prev) => [...prev, tag]);
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
      <span className="inline-flex flex-wrap items-start gap-2">
        <select
          aria-label={t.addTag}
          className="select tag-add-select"
          defaultValue=""
          onChange={async (event) => {
            const val = event.target.value;
            if (val === "__new__") {
              const name = prompt(t[category]);
              if (name?.trim()) {
                const created = await onCreate({ name: name.trim(), color: pickDefaultColor(localTags, "#0d9488"), category });
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
            <option key={tag.id} value={tag.id}>{tag.name}</option>
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
          </span>
        )}
      </span>
    );
  }

  return (
    <div className="grid gap-0.5">
      <div className="flex items-start gap-0.5">
        <span className="text-[12px] font-semibold">{t[category]}</span>
        {action}
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
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {category === "pitch" && (
            <div className="flex gap-1">
              {["♭", "♯", "♮"].map((mark) => (
                <button key={mark} className="icon-button" type="button" onClick={() => setName((value) => `${value}${mark}`)}>
                  {mark}
                </button>
              ))}
            </div>
          )}
          <input className="flex-none" style={{ width: "5rem", fontSize: "12px", border: "1px solid var(--line)", borderRadius: "6px", background: "#fff", color: "var(--foreground)", padding: "8px 10px", outline: "none" }} value={name} onChange={(event) => setName(event.target.value)} placeholder={t.newTag} />
          <input aria-label={t.tagColor} className="h-9 w-10" type="color" value={color} onChange={(event) => setColor(event.target.value)} />
          <button aria-label={t.addTag} className="icon-button" type="button" onClick={createTag}>
            <Plus size={16} />
          </button>
        </span>
      </div>
    </div>
  );
}
