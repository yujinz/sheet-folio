"use client";

import { Music, Palette, Pencil, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "@/lib/useLocale";
import { type Locale, messages } from "@/lib/i18n";
import type { Tag, TagCategory } from "@/lib/types";

export function tagDisplayName(tag: Tag, locale: Locale): string {
  if (locale === "en-US") return tag.nameAlt || tag.name;
  // locale === "en-US": prefer nameAlt, fall back to name
  // locale === "zh-CN": prefer name, fall back to nameAlt
  return tag.name || tag.nameAlt;
}

// --- Pitch color helpers ---
// Match pitch notation: optional accidental + letter + optional octave (1-8)
// e.g. C4, ♯C4, F#5, ♭B3, bB3, A♯6, G♮2, D1, C, ♯F
const PITCH_RE = /^([♯♭♮#bn]?)([A-Ga-g])([1-8])?$/;

const NOTE_INDEX: Record<string, number> = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

function pitchOctaveInfo(name: string): { octave: number; note: number; accidental: number } | null {
  const match = name.trim().match(PITCH_RE);
  if (!match) return null;
  const note = NOTE_INDEX[match[2].toUpperCase()] ?? 0;
  const acc = match[1];
  const accMap: Record<string, number> = { '♯': 0.5, '#': 0.5, '♭': -0.5, 'b': -0.5, '♮': 0, 'n': 0, '': 0 };
  return { octave: match[3] ? parseInt(match[3]) : 4, note, accidental: accMap[acc] ?? 0 };
}

/** Numeric sort key for pitch tags — lower = lower pitch (rainbow order). */
function pitchSortKey(tag: Tag): number {
  const info = pitchOctaveInfo(tag.name) ?? pitchOctaveInfo(tag.nameAlt);
  if (!info) return -1;
  const { octave, note, accidental } = info;
  // octave spans 100, note spans 10, accidental adjusts within note
  return octave * 100 + note * 10 + Math.round(accidental * 10);
}

function hslToHex(h: number, s: number, l: number): string {
  // Normalize: h ∈ [0, 360), s,l ∈ [0, 100]
  h = ((h % 360) + 360) % 360;
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Compute a hex color from a pitch name (e.g. "C4", "F♯5").
 *  The full range octave 1→8 spans hue 0→300 (red→violet).
 *  Within each octave, C→B also spreads across the octave's hue range,
 *  so A4 and F4 get different colors. Accidentals shift hue ±15°. */
function pitchColorFromName(name: string): string | null {
  const info = pitchOctaveInfo(name);
  if (!info) return null;
  const { octave, note, accidental } = info;
  // Each octave occupies 1/7 of the 300° range. Within that, 7 notes spread evenly.
  const octaveSpan = 300 / 7;
  const noteStep = octaveSpan / 7;
  const hue = (octave - 1) * octaveSpan + note * noteStep + accidental * 30;
  return hslToHex(hue, 40, 65);
}

// Default tag colors: ordered by hue (purple → pink → red → orange → gold → olive → green)
// Avoiding greens/blues since pitch tags will use those hues.
const TAG_COLORS = [
  "#9e6aba", // lavender-purple
  "#c46a9e", // magenta-purple
  "#c45a8a", // pink-magenta
  "#b85a7a", // wine
  "#d46a7a", // rose
  "#d47a6a", // salmon
  "#d46a4a", // vermilion
  "#c47a5a", // clay
  "#b87a6a", // tawny
  "#d48a4a", // amber
  "#d49a5a", // goldenrod
  "#d4aa4a", // gold
  "#d4c04a", // yellow
  "#a8b44a", // olive-chartreuse
  "#9c8c6b", // sandalwood
  "#8a9a6a", // olive-green
];

/** Return the next color in the TAG_COLORS palette, wrapping around. */
function nextTagColor(currentColor: string): string {
  const index = TAG_COLORS.indexOf(currentColor);
  if (index === -1 || index === TAG_COLORS.length - 1) {
    return TAG_COLORS[0];
  }
  return TAG_COLORS[index + 1];
}

export function pickDefaultColor(tags: Tag[], currentColor: string): string {
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
  /** Optional display label (e.g. for i18n of custom categories). Falls back to `t[category]` then `category`. */
  label?: string;
  tags: Tag[];
  selected: number[];
  onChange: (ids: number[]) => void;
  onCreate: (tag: Omit<Tag, "id">) => Promise<Tag>;
  onDelete?: (tag: Tag) => Promise<void>;
  onUpdate?: (tag: Tag) => Promise<void>;
  editingTags?: boolean;
  selectedOnly?: boolean;
  compact?: boolean;
  singleSelect?: boolean;
  defaultColor?: string;
  onDefaultColorChange?: (color: string) => void;
  onRenameCategory?: () => void;
  onDeleteCategory?: () => void;
};

export default function TagPicker({ category, label, tags, selected, onChange, onCreate, onDelete, onUpdate, editingTags, selectedOnly, compact, singleSelect, defaultColor, onDefaultColorChange, onRenameCategory, onDeleteCategory }: Props) {
  const { locale, t } = useLocale();
  const otherLocale: Locale = locale === "zh-CN" ? "en-US" : "zh-CN";
  const [localTags, setLocalTags] = useState(tags);
  useEffect(() => setLocalTags(tags), [tags]);
  // Sort pitch tags by pitch value (low→high) for rainbow ordering
  const sortedLocalTags = useMemo(() => {
    if (category !== "pitch") return localTags;
    return [...localTags].sort((a, b) => pitchSortKey(a) - pitchSortKey(b));
  }, [localTags, category]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const visibleTags = selectedOnly ? sortedLocalTags.filter((tag) => selectedSet.has(tag.id)) : sortedLocalTags;
  const selectedTags = sortedLocalTags.filter((tag) => selectedSet.has(tag.id));
  const availableTags = sortedLocalTags.filter((tag) => !selectedSet.has(tag.id));
  const categoryLabel = label ?? (t as any)[category] ?? category;
  const [selectValue, setSelectValue] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createNameAlt, setCreateNameAlt] = useState("");
  const [createColor, setCreateColor] = useState(defaultColor ?? pickDefaultColor(tags, "#4a6fa5"));
  const createDialogRef = useRef<HTMLDivElement>(null);
  const createNameInputRef = useRef<HTMLInputElement>(null);
  const createNameAltInputRef = useRef<HTMLInputElement>(null);
  const [activeCreateInput, setActiveCreateInput] = useState<"name" | "nameAlt">("name");
  const autoFillSourceRef = useRef<"name" | "nameAlt" | null>(null);

  // Whether the current create-dialog input is a recognized pitch
  const detectedPitch = useMemo(() => {
    if (category !== "pitch") return null;
    const name = (createName || createNameAlt).trim();
    const m = name.match(PITCH_RE);
    return m ? m[0] : null;
  }, [createName, createNameAlt, category]);

  // Auto-fill the other pitch field when a valid pitch is detected
  // Uses an equality guard (createNameAlt !== trimmed) instead of a one-shot ref
  // to ensure subsequent edits to the same field still re-sync.
  useEffect(() => {
    if (category !== "pitch") return;

    const source = autoFillSourceRef.current;
    autoFillSourceRef.current = null;

    if (!source) return;

    if (source === "name") {
      const trimmed = createName.trim();
      if (PITCH_RE.test(trimmed) && createNameAlt !== trimmed) {
        setCreateNameAlt(trimmed);
      }
    } else {
      const trimmed = createNameAlt.trim();
      if (PITCH_RE.test(trimmed) && createName !== trimmed) {
        setCreateName(trimmed);
      }
    }
  }, [createName, createNameAlt, category]);

  // Sync defaultColor from parent when it changes
  useEffect(() => {
    if (defaultColor !== undefined) {
      setCreateColor(defaultColor);
    }
  }, [defaultColor]);

  // Edit dialog state
  const [editTag, setEditTag] = useState<Tag | null>(null);
  const [editName, setEditName] = useState("");
  const [editNameAlt, setEditNameAlt] = useState("");
  const [editColor, setEditColor] = useState("");
  const editNameInputRef = useRef<HTMLInputElement>(null);
  const editDialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editTag) {
      editNameInputRef.current?.focus();
    }
  }, [editTag]);

  function openEditDialog(tag: Tag) {
    setEditTag(tag);
    setEditName(tag.name);
    setEditNameAlt(tag.nameAlt);
    setEditColor(tag.color);
  }

  async function handleEditSave() {
    if (!editTag || !onUpdate) return;
    const trimmed = editName.trim();
    const trimmedAlt = editNameAlt.trim();
    if (!trimmed && !trimmedAlt) return;
    const original = editTag;
    const newName = trimmed || trimmedAlt;
    const newNameAlt = trimmedAlt;
    // Client-side duplicate check: same category, any name field matches
    const dup = localTags.find((t) => {
      if (t.id === original.id || t.category !== original.category) return false;
      return (
        t.name === newName ||
        t.name === newNameAlt ||
        (newNameAlt && (t.nameAlt === newName || t.nameAlt === newNameAlt)) ||
        (t.nameAlt && t.nameAlt === newName)
      );
    });
    if (dup) {
      alert(t.tagExists);
      return;
    }
    // Update local state optimistically
    const updated: Tag = { ...original, name: newName, nameAlt: trimmedAlt, color: editColor };
    setLocalTags((prev) => prev.map((t) => t.id === updated.id ? updated : t));
    setEditTag(null);
    // Trigger parent update — the parent will PATCH the API and refresh
    try {
      await onUpdate(updated);
    } catch {
      alert(t.tagExists);
      setLocalTags((prev) => prev.map((t) => t.id === original.id ? original : t));
    }
  }

  // Focus the first input when dialog opens
  useEffect(() => {
    if (showCreateDialog) {
      createNameInputRef.current?.focus();
    }
  }, [showCreateDialog]);

  async function handleCreateFromDialog() {
    const trimmed = createName.trim();
    const trimmedAlt = createNameAlt.trim();
    if (!trimmed && !trimmedAlt) return;
    try {
      const created = await onCreate({ name: trimmed || trimmedAlt, nameAlt: trimmedAlt, color: createColor, category });
      setLocalTags((prev) => [...prev, created]);
      if (compact) onChange([...selected, created.id]);
      setShowCreateDialog(false);
      setCreateName("");
      setCreateNameAlt("");
    } catch {
      alert(t.tagExists);
    }
  }

  function toggle(id: number) {
    if (singleSelect) {
      onChange(selectedSet.has(id) ? [] : [id]);
    } else {
      onChange(selectedSet.has(id) ? selected.filter((value) => value !== id) : [...selected, id]);
    }
  }

  async function deleteTag(tag: Tag) {
    if (!onDelete || !confirm(t.deleteTagConfirm)) return;
    await onDelete(tag);
    onChange(selected.filter((id) => id !== tag.id));
  }

  // ── Dialog fragments (shared between compact & normal layouts) ──
  const editDialog = editingTags && editTag && onUpdate && (
    <div ref={editDialogRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setEditTag(null)}>
      <div className="mx-4 w-full max-w-xs rounded-lg bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 text-sm font-semibold">{t.editTags}</div>
        <div className="grid gap-2">
          <input ref={editNameInputRef} className="input w-full" placeholder={(t as any)[category]} value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleEditSave(); if (e.key === "Escape") setEditTag(null); }} />
          <input className="input w-full" placeholder={(messages[otherLocale] as any)[category]} value={editNameAlt} onChange={(e) => setEditNameAlt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleEditSave(); if (e.key === "Escape") setEditTag(null); }} />
          <div className="flex items-center gap-2">
            {category === "pitch" && (
              <>
                {["♭", "♯", "♮"].map((mark) => (
                  <button key={mark} className="pill-add-button" type="button" onClick={() => { if (editNameAlt && !editName) { setEditNameAlt(mark + editNameAlt); } else { setEditName(mark + editName); } editNameInputRef.current?.focus(); }}>{mark}</button>
                ))}
                <button aria-label="Assign pitch color" className="h-6 w-auto rounded-full overflow-hidden cursor-pointer border-0 p-0 flex items-center justify-center gap-1 text-[8px] leading-none whitespace-nowrap" style={{ background: "none" }} type="button" title="Assign color based on pitch octave" onClick={() => { const pitchName = locale === "en-US" ? (editNameAlt || editName) : (editName || editNameAlt); const c = pitchColorFromName(pitchName); if (c) setEditColor(c); }}><Music size={12} /> Assign color by pitch</button>
              </>
            )}
            {category !== "pitch" && (
              <button aria-label="Cycle tag color" className="h-6 w-auto rounded-full overflow-hidden cursor-pointer border-0 p-0 flex items-center justify-center gap-1 text-[8px] leading-none whitespace-nowrap" style={{ background: "none" }} type="button" title="Next palette color" onClick={() => setEditColor(nextTagColor(editColor))}><Palette size={12} /> Cycle color</button>
            )}
            <input aria-label={t.tagColor} className="h-6 w-6 rounded-full overflow-hidden cursor-pointer border-0 p-0" type="color" value={editColor} onChange={(e) => setEditColor(e.target.value)} style={{ background: "none", WebkitAppearance: "none" }} />
          </div>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button className="text-button" type="button" onClick={() => setEditTag(null)}>{t.cancel}</button>
          <button className="text-button primary-button" type="button" onClick={handleEditSave}>{t.save}</button>
        </div>
      </div>
    </div>
  );

  const createDialog = showCreateDialog && (
    <div ref={createDialogRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowCreateDialog(false)}>
      <div className="mx-4 w-full max-w-sm rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 text-sm font-semibold">{t.addTag}</div>
        <div className="grid gap-3">
          <input ref={createNameInputRef} className="input w-full" placeholder={(t as any)[category]} value={createName} onChange={(e) => { setCreateName(e.target.value); autoFillSourceRef.current = "name"; }} onFocus={() => setActiveCreateInput("name")} onKeyDown={(e) => { if (e.key === "Enter") { if (createNameAltInputRef.current && !createNameAlt.trim()) { createNameAltInputRef.current.focus(); e.preventDefault(); } else { handleCreateFromDialog(); } } if (e.key === "Escape") setShowCreateDialog(false); }} />
          <input ref={createNameAltInputRef} className="input w-full" placeholder={(messages[otherLocale] as any)[category]} value={createNameAlt} onChange={(e) => { setCreateNameAlt(e.target.value); autoFillSourceRef.current = "nameAlt"; }} onFocus={() => setActiveCreateInput("nameAlt")} onKeyDown={(e) => { if (e.key === "Enter") handleCreateFromDialog(); if (e.key === "Escape") setShowCreateDialog(false); }} />
          {category === "pitch" && (
            <div className="flex items-center gap-1.5">
              {["♭", "♯", "♮"].map((mark) => (
                <button key={mark} className="pill-add-button" type="button" onClick={() => { const setter = activeCreateInput === "nameAlt" ? setCreateNameAlt : setCreateName; setter((value) => `${mark}${value}`); autoFillSourceRef.current = activeCreateInput === "nameAlt" ? "nameAlt" : "name"; if (activeCreateInput === "nameAlt") { createNameAltInputRef.current?.focus(); } else { createNameInputRef.current?.focus(); } }}>{mark}</button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            {category === "pitch" ? (
              <button aria-label="Assign pitch color" className={`inline-flex h-7 items-center gap-1 rounded-full border px-3 text-xs whitespace-nowrap cursor-pointer transition-colors ${detectedPitch ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--line)] bg-white"}`} type="button" title={detectedPitch ? `Assign color for ${detectedPitch}` : "Assign color based on pitch octave"} onClick={() => { const pitchName = locale === "en-US" ? (createNameAlt || createName) : (createName || createNameAlt); const c = pitchColorFromName(pitchName); if (c) setCreateColor(c); }}><Music size={12} /> Assign color by pitch</button>
            ) : (
              <button aria-label="Cycle tag color" className="inline-flex h-7 items-center gap-1 rounded-full border border-[var(--line)] bg-white px-3 text-xs whitespace-nowrap cursor-pointer" type="button" title="Next palette color" onClick={() => setCreateColor(nextTagColor(createColor))}><Palette size={12} /> Cycle color</button>
            )}
            <div className="ml-auto flex items-center gap-1">
              <span className="text-xs text-[var(--muted)]">{t.tagColor}</span>
              <input aria-label={t.tagColor} className="h-7 w-7 rounded-full overflow-hidden cursor-pointer border-0 p-0" type="color" value={createColor} onChange={(e) => setCreateColor(e.target.value)} style={{ background: "none", WebkitAppearance: "none" }} />
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="text-button" type="button" onClick={() => setShowCreateDialog(false)}>{t.cancel}</button>
          <button className="text-button primary-button" type="button" onClick={handleCreateFromDialog}>{t.addTag}</button>
        </div>
      </div>
    </div>
  );

  if (compact) {
    if (singleSelect) {
      return (
        <span className="inline-flex flex-wrap items-start gap-2">
          <select
            key={localTags.map(t => t.id).join(',')}
            aria-label={categoryLabel}
            className="select tag-add-select"
            value={selected.length > 0 ? String(selected[0]) : ""}
            onChange={async (event) => {
              const val = event.target.value;
              if (val === "__new__") {
                setCreateName("");
                setCreateNameAlt("");
                setShowCreateDialog(true);
              } else if (val === "") {
                onChange([]);
              } else {
                const id = Number(val);
                if (id) onChange([id]);
              }
            }}
          >
            <option value="">{t.choose}</option>
            {localTags.map((tag) => (
              <option key={tag.id} value={tag.id}>{tagDisplayName(tag, locale)}</option>
            ))}
            <option value="__new__">+ {t.addTag}</option>
          </select>
        </span>
      );
    }
    return (
      <>
        <span className="inline-flex flex-wrap items-start gap-2">
          <select
            key={availableTags.map(t => t.id).join(',')}
            aria-label={t.addTag}
            className="select tag-add-select"
            value={selectValue}
            onChange={async (event) => {
              const val = event.target.value;
              setSelectValue("");
              if (val === "__new__") {
                setCreateName("");
                setCreateNameAlt("");
                setShowCreateDialog(true);
              } else {
                const id = Number(val);
                if (id) onChange([...selected, id]);
              }
            }}
          >
            <option value="" disabled hidden>{label ?? (t as any)[category] ?? category}</option>
            {availableTags.map((tag) => (
              <option key={tag.id} value={tag.id}>{tagDisplayName(tag, locale)}</option>
            ))}
            <option value="__new__">+ {t.addTag}</option>
          </select>
          {selectedTags.length > 0 && (
            <span className="flex flex-wrap items-center gap-2">
              {selectedTags.map((tag) => (
                <span key={tag.id} className="tag-pill-group inline-flex rounded-full">
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
        {editDialog}
        {createDialog}
      </>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-semibold shrink-0 text-[var(--foreground)] inline-flex items-center gap-0.5" style={{ width: editingTags && onRenameCategory ? "auto" : "4.5rem" }}>
        <span className="truncate">{categoryLabel}</span>
        {singleSelect && <span className="text-[10px] text-[var(--muted)] font-normal">({t.single})</span>}
        {editingTags && onRenameCategory && (
          <button
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white"
            type="button"
            title="Rename category"
            onClick={(e) => { e.stopPropagation(); onRenameCategory(); }}
          >
            <Pencil size={9} />
          </button>
        )}
        {editingTags && onDeleteCategory && (
          <button
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-500 text-white"
            type="button"
            title="Delete category"
            onClick={(e) => { e.stopPropagation(); onDeleteCategory(); }}
          >
            <X size={10} />
          </button>
        )}
      </span>
        {visibleTags.map((tag) => (
          <span key={tag.id} className="tag-pill-group inline-flex rounded-full">
            <button
              className="tag-pill rounded-r-none"
              style={{
                background: tag.color,
                opacity: selectedSet.has(tag.id) ? 1 : 0.35,
                borderBottomRightRadius: editingTags && onDelete ? 0 : undefined,
                borderTopRightRadius: editingTags && onDelete ? 0 : undefined
              }}
              type="button"
              onClick={() => toggle(tag.id)}
            >
              {tagDisplayName(tag, locale)}
            </button>
            {editingTags && onUpdate && (
              <button
                aria-label={`Edit ${tagDisplayName(tag, locale)}`}
                className="tag-pill tag-delete-button px-2"
                style={{ background: tag.color, borderBottomLeftRadius: 0, borderTopLeftRadius: 0, opacity: 0.85, fontSize: "11px" }}
                type="button"
                onClick={(e) => { e.stopPropagation(); openEditDialog(tag); }}
              >
                ✎
              </button>
            )}
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
        <button
          aria-label={t.addTag}
          className="icon-button pill-add-button"
          type="button"
          onClick={() => {
            setCreateName("");
            setCreateNameAlt("");
            setShowCreateDialog(true);
          }}
        >
          <Plus size={14} />
        </button>
      {editDialog}

      {createDialog}
    </div>
  );
}