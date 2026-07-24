"use client";

import { Music, Palette, Pencil, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale } from "@/lib/useLocale";
import { type Locale, messages } from "@/lib/i18n";
import { getLocalizedField } from "@/lib/i18n-utils";
import { PITCH_RE, pitchOctaveInfo, pitchSortKey, pitchColorFromName, getEnharmonicEquivalent, normalizeAccidentals } from "@/lib/pitch-utils";
import { TAG_COLORS, nextTagColor, pickDefaultColor } from "@/lib/color-utils";
import type { Tag, TagCategory } from "@/lib/types";

export function tagDisplayName(tag: Tag, locale: Locale): string {
  return getLocalizedField(locale, tag.name, tag.nameAlt);
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
  isPitchCategory?: boolean;
  defaultColor?: string;
  onDefaultColorChange?: (color: string) => void;
  onRenameCategory?: () => void;
  onDeleteCategory?: () => void;
};

export default function TagPicker({ category, label, tags, selected, onChange, onCreate, onDelete, onUpdate, editingTags, selectedOnly, compact, singleSelect, defaultColor, onDefaultColorChange, onRenameCategory, onDeleteCategory, isPitchCategory }: Props) {
  const { locale, t } = useLocale();
  const otherLocale: Locale = locale === "zh-CN" ? "en-US" : "zh-CN";
  const [localTags, setLocalTags] = useState(tags);
  useEffect(() => setLocalTags(tags), [tags]);
  // Sort pitch tags by pitch value (low→high) for rainbow ordering
  const sortedLocalTags = useMemo(() => {
    if (!isPitchCategory) return localTags;
    return [...localTags].sort((a, b) => pitchSortKey(a) - pitchSortKey(b));
  }, [localTags, isPitchCategory]);
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
    if (!isPitchCategory) return null;
    const name = (createName || createNameAlt).trim();
    const m = name.match(PITCH_RE);
    return m ? m[0] : null;
  }, [createName, createNameAlt, isPitchCategory]);

  // Auto-fill the other pitch field when a valid pitch is detected
  // Uses an equality guard (createNameAlt !== trimmed) instead of a one-shot ref
  // to ensure subsequent edits to the same field still re-sync.
  useEffect(() => {
    if (!isPitchCategory) return;

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
  }, [createName, createNameAlt, isPitchCategory]);

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
  const [activeEditInput, setActiveEditInput] = useState<"name" | "nameAlt">("name");
  const editNameInputRef = useRef<HTMLInputElement>(null);
  const editNameAltInputRef = useRef<HTMLInputElement>(null);
  const editDialogRef = useRef<HTMLDivElement>(null);
  const editAutoFillSourceRef = useRef<"name" | "nameAlt" | null>(null);

  // Whether the current edit-dialog input is a recognized pitch
  const editDetectedPitch = useMemo(() => {
    if (!isPitchCategory) return null;
    const name = (editName || editNameAlt).trim();
    const m = name.match(PITCH_RE);
    return m ? m[0] : null;
  }, [editName, editNameAlt, isPitchCategory]);

  useEffect(() => {
    if (editTag) {
      editNameInputRef.current?.focus();
    }
  }, [editTag]);

  // Auto-fill the other edit pitch field when a valid pitch is detected
  useEffect(() => {
    if (!isPitchCategory) return;

    const source = editAutoFillSourceRef.current;
    editAutoFillSourceRef.current = null;

    if (!source) return;

    if (source === "name") {
      const trimmed = editName.trim();
      if (PITCH_RE.test(trimmed) && editNameAlt !== trimmed) {
        setEditNameAlt(trimmed);
      }
    } else {
      const trimmed = editNameAlt.trim();
      if (PITCH_RE.test(trimmed) && editName !== trimmed) {
        setEditName(trimmed);
      }
    }
  }, [editName, editNameAlt, isPitchCategory]);

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
      if (compact) {
        onChange(singleSelect ? [created.id] : [...selected, created.id]);
      }
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
    if (!onDelete) return;
    const hasSongs = (tag as Tag & { songCount?: number }).songCount;
    if (hasSongs && !confirm(t.deleteTagConfirm)) return;
    await onDelete(tag);
    onChange(selected.filter((id) => id !== tag.id));
  }

  // ── Dialog fragments (shared between compact & normal layouts) ──
  const editDialog = editingTags && editTag && onUpdate && (
    <div ref={editDialogRef} className="fixed inset-0 z-[999] flex items-center justify-center bg-black/30" onClick={() => setEditTag(null)}>
      <div data-testid="edit-dialog" className="mx-4 w-full max-w-xs rounded-lg bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-3 text-sm font-semibold">{t.editTags}</div>
        <div className="grid gap-2">
          <input ref={editNameInputRef} className="input w-full" placeholder={(t as any)[category]} value={editName} onChange={(e) => { setEditName(e.target.value); editAutoFillSourceRef.current = "name"; }} onFocus={() => setActiveEditInput("name")} onKeyDown={(e) => { if (e.key === "Enter") handleEditSave(); if (e.key === "Escape") setEditTag(null); }} />
          <input ref={editNameAltInputRef} className="input w-full" placeholder={(messages[otherLocale] as any)[category]} value={editNameAlt} onChange={(e) => { setEditNameAlt(e.target.value); editAutoFillSourceRef.current = "nameAlt"; }} onFocus={() => setActiveEditInput("nameAlt")} onKeyDown={(e) => { if (e.key === "Enter") handleEditSave(); if (e.key === "Escape") setEditTag(null); }} />
          <div className="flex items-center gap-2">
            {isPitchCategory && (
              <>
                {["♭", "♯"].map((mark) => (
                  <button key={mark} className="pill-add-button" type="button" onClick={() => { const setter = activeEditInput === "nameAlt" ? setEditNameAlt : setEditName; setter((value) => mark + value); editAutoFillSourceRef.current = activeEditInput; const ref = activeEditInput === "nameAlt" ? editNameAltInputRef : editNameInputRef; ref.current?.focus(); }}>{mark}</button>
                ))}
                {(() => {
                  const name = (editName || editNameAlt).trim();
                  const alreadyFormatted = name.includes(' ') || name.includes('|');
                  const hasAccidental = editDetectedPitch && pitchOctaveInfo(editDetectedPitch)?.accidental !== 0;
                  const isDisabled = !hasAccidental && !alreadyFormatted;
                  const isActive = hasAccidental && !alreadyFormatted;
                  return (
                    <button
                      className={`inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[10px] whitespace-nowrap ${isDisabled ? "opacity-40 cursor-default border-[var(--line)] bg-white" : isActive ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)] cursor-pointer" : "border-[var(--line)] bg-white cursor-pointer"}`}
                      disabled={isDisabled}
                      type="button"
                      onClick={() => {
                        if (isDisabled) return;
                        const rawName = (editName || editNameAlt).trim();
                        if (rawName.includes(' ') || rawName.includes('|')) return;
                        const pitchName = normalizeAccidentals(rawName);
                        const info = pitchOctaveInfo(pitchName);
                        if (info && info.accidental !== 0) {
                          const sharp = info.accidental > 0 ? pitchName : getEnharmonicEquivalent(pitchName)!;
                          const flat  = info.accidental < 0 ? pitchName : getEnharmonicEquivalent(pitchName)!;
                          const formatted = `${sharp} ${flat}`;
                          setEditName(formatted);
                          setEditNameAlt(formatted);
                        }
                      }}
                    >
                      {t.formatEnharmonic}
                    </button>
                  );
                })()}
              </>
            )}
            <span className="ml-auto inline-flex items-center gap-2">
              {isPitchCategory ? (() => {
                const editPitchName = (editName || editNameAlt).trim();
                const pc = pitchColorFromName(editPitchName);
                const colorMatches = pc === editColor;
                const isDisabled = !pc;
                const isActive = !!pc && !colorMatches;
                return (
                  <button aria-label="Assign pitch color" className={`inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[10px] whitespace-nowrap ${isDisabled ? "opacity-40 cursor-default border-[var(--line)] bg-white" : isActive ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)] cursor-pointer" : "border-[var(--line)] bg-white cursor-pointer"}`} type="button" title={pc ? `Assign color for ${editPitchName}` : "Assign color based on pitch octave"} disabled={isDisabled} onClick={() => { if (isDisabled) return; const c = pitchColorFromName(editPitchName); if (c) setEditColor(c); }}><Music size={12} /> {t.assignPitchColor}</button>
                );
              })() : (
                <button aria-label="Cycle tag color" className="inline-flex h-6 items-center gap-1 rounded-full border border-[var(--line)] bg-white px-2 text-[10px] whitespace-nowrap cursor-pointer" type="button" title="Next palette color" onClick={() => setEditColor(nextTagColor(editColor))}><Palette size={12} /> Cycle color</button>
              )}
              <input aria-label={t.tagColor} className="h-6 w-6 rounded-full overflow-hidden cursor-pointer border-0 p-0" type="color" value={editColor} onChange={(e) => setEditColor(e.target.value)} style={{ background: "none", WebkitAppearance: "none" }} />
            </span>
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
    <div ref={createDialogRef} className="fixed inset-0 z-[999] flex items-center justify-center bg-black/30" onClick={() => setShowCreateDialog(false)}>
      <div data-testid="create-dialog" className="mx-4 w-full max-w-sm rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-4 text-sm font-semibold">{t.addTag}</div>
        <div className="grid gap-3">
          <input ref={createNameInputRef} className="input w-full" placeholder={(t as any)[category]} value={createName} onChange={(e) => { setCreateName(e.target.value); autoFillSourceRef.current = "name"; }} onFocus={() => setActiveCreateInput("name")} onKeyDown={(e) => { if (e.key === "Enter") { if (createNameAltInputRef.current && !createNameAlt.trim()) { createNameAltInputRef.current.focus(); e.preventDefault(); } else { handleCreateFromDialog(); } } if (e.key === "Escape") setShowCreateDialog(false); }} />
          <input ref={createNameAltInputRef} className="input w-full" placeholder={(messages[otherLocale] as any)[category]} value={createNameAlt} onChange={(e) => { setCreateNameAlt(e.target.value); autoFillSourceRef.current = "nameAlt"; }} onFocus={() => setActiveCreateInput("nameAlt")} onKeyDown={(e) => { if (e.key === "Enter") handleCreateFromDialog(); if (e.key === "Escape") setShowCreateDialog(false); }} />
          <div className="flex items-center gap-1.5">
            {isPitchCategory && (
              <>
                {["♭", "♯"].map((mark) => (
                  <button key={mark} className="pill-add-button" type="button" onClick={() => { const ref = activeCreateInput === "nameAlt" ? createNameAltInputRef : createNameInputRef; const input = ref.current; const setter = activeCreateInput === "nameAlt" ? setCreateNameAlt : setCreateName; setter((value) => mark + value); autoFillSourceRef.current = activeCreateInput; input?.focus(); }}>{mark}</button>
                ))}
                {(() => {
                  const name = (createName || createNameAlt).trim();
                  const alreadyFormatted = name.includes(' ') || name.includes('|');
                  const hasAccidental = detectedPitch && pitchOctaveInfo(detectedPitch)?.accidental !== 0;
                  const isDisabled = !hasAccidental && !alreadyFormatted;
                  const isActive = hasAccidental && !alreadyFormatted;
                  return (
                    <button
                      className={`inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[10px] whitespace-nowrap ${isDisabled ? "opacity-40 cursor-default border-[var(--line)] bg-white" : isActive ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)] cursor-pointer" : "border-[var(--line)] bg-white cursor-pointer"}`}
                      disabled={isDisabled}
                      type="button"
                      onClick={() => {
                        if (isDisabled) return;
                        const rawName = (createName || createNameAlt).trim();
                        if (rawName.includes(' ') || rawName.includes('|')) return;
                        const pitchName = normalizeAccidentals(rawName);
                        const info = pitchOctaveInfo(pitchName);
                        if (info && info.accidental !== 0) {
                          const sharp = info.accidental > 0 ? pitchName : getEnharmonicEquivalent(pitchName)!;
                          const flat  = info.accidental < 0 ? pitchName : getEnharmonicEquivalent(pitchName)!;
                          const formatted = `${sharp} ${flat}`;
                          setCreateName(formatted);
                          setCreateNameAlt(formatted);
                        }
                      }}
                    >
                      {t.formatEnharmonic}
                    </button>
                  );
                })()}
              </>
            )}
            <span className="ml-auto inline-flex items-center gap-2">
              {isPitchCategory ? (() => {
                const createPitchName = (createName || createNameAlt).trim();
                const pc = pitchColorFromName(createPitchName);
                const colorMatches = pc === createColor;
                const isDisabled = !pc;
                const isActive = !!pc && !colorMatches;
                return (
                  <button aria-label="Assign pitch color" className={`inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[10px] whitespace-nowrap ${isDisabled ? "opacity-40 cursor-default border-[var(--line)] bg-white" : isActive ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)] cursor-pointer" : "border-[var(--line)] bg-white cursor-pointer"}`} type="button" title={pc ? `Assign color for ${createPitchName}` : "Assign color based on pitch octave"} disabled={isDisabled} onClick={() => { if (isDisabled) return; const c = pitchColorFromName(createPitchName); if (c) setCreateColor(c); }}><Music size={12} /> {t.assignPitchColor}</button>
                );
              })() : (
                <button aria-label="Cycle tag color" className="inline-flex h-6 items-center gap-1 rounded-full border border-[var(--line)] bg-white px-2 text-[10px] whitespace-nowrap cursor-pointer" type="button" title="Next palette color" onClick={() => setCreateColor(nextTagColor(createColor))}><Palette size={12} /> Cycle color</button>
              )}
              <input aria-label={t.tagColor} className="h-6 w-6 rounded-full overflow-hidden cursor-pointer border-0 p-0" type="color" value={createColor} onChange={(e) => setCreateColor(e.target.value)} style={{ background: "none", WebkitAppearance: "none" }} />
            </span>
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
      const selectedTag = selected.length > 0
        ? localTags.find((t) => t.id === selected[0])
        : undefined;
      return (
        <>
          <span className="inline-flex flex-wrap items-center gap-1">
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
              <option value="" disabled hidden>{label || t.choose}</option>
              {localTags.map((tag) => (
                <option key={tag.id} value={tag.id}>{tagDisplayName(tag, locale)}</option>
              ))}
              <option value="__new__">+ {t.addTag}</option>
            </select>
            {selectedTag && (
              <span
                className="inline-block rounded-full shrink-0"
                style={{
                  width: 24,
                  height: 24,
                  minWidth: 24,
                  backgroundColor: selectedTag.color,
                }}
              />
            )}
          </span>
          {editDialog && createPortal(editDialog, document.body)}
          {createDialog && createPortal(createDialog, document.body)}
        </>
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
            <option value="" disabled hidden>{label ?? t.add}</option>
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
        {editDialog && createPortal(editDialog, document.body)}
        {createDialog && createPortal(createDialog, document.body)}
      </>
    );
  }

  const labelColumnWidth = editingTags && onRenameCategory ? "auto" : "4.5rem";

  return (
    <div className="grid gap-x-1.5 gap-y-1 items-start" style={{ gridTemplateColumns: `${labelColumnWidth} 1fr` }}>
      <span className="text-xs font-semibold text-[var(--foreground)] inline-flex items-center gap-0.5">
        <span className="truncate">{categoryLabel}</span>
        {isPitchCategory && <span title={t.pitch}><Music size={12} className="shrink-0 text-[var(--muted)]" /></span>}
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
      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
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
      </div>
      {editDialog && createPortal(editDialog, document.body)}

      {createDialog && createPortal(createDialog, document.body)}
    </div>
  );
}