"use client";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, Heart, House, Images, Plus, Trash2, Upload, X, X as XIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import LocaleSwitch from "@/components/LocaleSwitch";
import TagPicker from "@/components/TagPicker";
import { useLocale } from "@/lib/useLocale";
import { messages } from "@/lib/i18n";
import { CORE_CATEGORIES } from "@/lib/types";
import type { ImageKind, Song, SongImage, Tag, VideoLink } from "@/lib/types";

const categories = [...CORE_CATEGORIES];

function generateId() {
  // crypto.randomUUID() requires secure context (HTTPS), use fallback for HTTP
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function getDeviceId() {
  const key = "sheet-folio-device-id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const next = generateId();
  localStorage.setItem(key, next);
  return next;
}

export default function Detail({ songId }: { songId: number }) {
  const { t, locale } = useLocale();
  const [piece, setPiece] = useState<Song | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [singleSelectCategories, setSingleSelectCategories] = useState<Set<string>>(new Set());
  const [categoryLabelsMap, setCategoryLabelsMap] = useState<Record<string, { zh: string; en: string }>>({});
  const [tab, setTab] = useState<ImageKind>("staff");
  const [editingImages, setEditingImages] = useState(false);
  const [pageIndex, setPageIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState(100);
  const clampZoom = (z: number) => Math.min(130, Math.max(25, z));
  const headerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const titleAltRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef(false);
  const isComposingRef = useRef(false);
  const imagesSectionRef = useRef<HTMLDivElement>(null);
  const hasScrolledToImages = useRef(false);
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("sheet-folio-favorites");
      if (raw) setFavoriteIds(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    void refresh();
    fetch("/api/single-select-categories")
      .then((res) => res.json())
      .then((rows) => setSingleSelectCategories(new Set(rows as string[])));
    fetch("/api/categories")
      .then((res) => res.json())
      .then((rows) => {
        if (Array.isArray(rows)) {
          const map: Record<string, { zh: string; en: string }> = {};
          for (const r of rows) {
            map[r.key] = { zh: r.nameZh, en: r.nameEn };
          }
          setCategoryLabelsMap(map);
        }
      });
    const deviceId = getDeviceId();
    fetch(`/api/device-zoom?deviceId=${deviceId}&songId=${songId}`)
      .then((res) => res.json())
      .then((row) => setZoom(clampZoom(row.zoom ?? 100)));
  }, [songId]);

  useEffect(() => {
    const deviceId = getDeviceId();
    const timer = window.setTimeout(() => {
      void fetch("/api/device-zoom", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, songId, zoom })
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [songId, zoom]);

  async function refresh() {
    const [pieceRow, tagRows] = await Promise.all([
      fetch(`/api/pieces/${songId}`).then((res) => res.json()),
      fetch("/api/tags").then((res) => res.json())
    ]);
    setPiece(pieceRow);
    setTags(tagRows);
    isDirtyRef.current = false;
  }

  async function patch(body: Record<string, unknown>) {
    const updated = await fetch(`/api/pieces/${songId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then((res) => res.json());
    setPiece(updated);
  }

  async function createTag(tag: Omit<Tag, "id">) {
    const res = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tag)
    });
    const created = await res.json();
    if (!res.ok) throw new Error(created.error ?? "Failed to create tag");
    setTags((value) => [...value.filter((item) => item.id !== created.id), created]);
    return created;
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const form = new FormData();
    form.set("kind", tab);
    Array.from(files).forEach((file) => form.append("files", file));
    const updated = await fetch(`/api/pieces/${songId}/images`, { method: "POST", body: form }).then((res) => res.json());
    setPiece(updated);
  }

  async function deleteImage(id: number) {
    const updated = await fetch(`/api/pieces/${songId}/images`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] })
    }).then((res) => res.json());
    setPiece(updated);
  }

  async function moveImage(imageId: number, direction: "left" | "right") {
    if (!piece) return;
    const current = piece.images?.[tab] ?? [];
    const index = current.findIndex((image) => image.id === imageId);
    if (direction === "left" && index === 0) return;
    if (direction === "right" && index === current.length - 1) return;
    const targetIndex = direction === "left" ? index - 1 : index + 1;
    const next = [...current];
    next.splice(targetIndex, 0, next.splice(index, 1)[0]);
    setPiece({ ...piece, images: { ...piece.images!, [tab]: next } });
    await fetch(`/api/pieces/${songId}/images`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: tab, ids: next.map((image) => image.id) })
    });
  }

  async function saveLinks(links: VideoLink[]) {
    const clean = links
      .filter((link) => link.label.trim() && link.url.trim())
      .map((link) => ({
        ...link,
        url: link.url.match(/^https?:\/\//) ? link.url : `https://${link.url}`
      }));
    try {
      const res = await fetch(`/api/pieces/${songId}/links`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ links: clean })
      });
      if (res.ok) {
        setPiece(await res.json());
      } else {
        console.error("saveLinks failed", res.status, await res.text());
      }
    } catch (err) {
      console.error("saveLinks error", err);
    }
  }

  async function deletePiece() {
    if (!confirm(t.deletePieceConfirm)) return;
    await fetch(`/api/pieces/${songId}`, { method: "DELETE" });
    location.href = "/";
  }

  function toggleFavorite() {
    const next = favoriteIds.includes(songId)
      ? favoriteIds.filter((id) => id !== songId)
      : [...favoriteIds, songId];
    setFavoriteIds(next);
    localStorage.setItem("sheet-folio-favorites", JSON.stringify(next));
  }

  // Debounced save — reads values from refs (uncontrolled inputs)
  function scheduleSave() {
    // Skip if user is in the middle of IME composition (e.g. typing pinyin)
    if (isComposingRef.current) return;
    isDirtyRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const notes = notesRef.current?.value ?? "";
      const body: Record<string, string> = { notes };
      // Only one title input is rendered (based on locale); preserve the other from current piece state
      if (locale === "en-US") {
        const titleAlt = titleAltRef.current?.value ?? "";
        body.title = piece?.title ?? "";
        body.titleAlt = titleAlt;
        // Auto-mirror: if primary title is empty, copy the alt title
        if (!body.title.trim() && titleAlt.trim()) {
          body.title = titleAlt;
        }
      } else {
        const title = titleRef.current?.value ?? "";
        body.title = title;
        body.titleAlt = piece?.titleAlt ?? "";
        // Auto-mirror: if alt title is empty, copy the primary title
        if (!body.titleAlt.trim() && title.trim()) {
          body.titleAlt = title;
        }
      }
      // Safety net: don't save if both titles would be empty
      if (body.title.trim() === "" && body.titleAlt.trim() === "") return;
      void fetch(`/api/pieces/${songId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }).then((res) => res.ok ? res.json() : null).then((updated) => {
        if (updated) setPiece(updated);
        isDirtyRef.current = false;
      });
    }, 500);
  }

  function flushSave() {
    // Flush any pending debounced save immediately
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (isDirtyRef.current) {
      isDirtyRef.current = false;
      const notes = notesRef.current?.value ?? "";
      const body: Record<string, string> = { notes };
      if (locale === "en-US") {
        const titleAlt = titleAltRef.current?.value ?? "";
        body.title = piece?.title ?? "";
        body.titleAlt = titleAlt;
        if (!body.title.trim() && titleAlt.trim()) {
          body.title = titleAlt;
        }
      } else {
        const title = titleRef.current?.value ?? "";
        body.title = title;
        body.titleAlt = piece?.titleAlt ?? "";
        if (!body.titleAlt.trim() && title.trim()) {
          body.titleAlt = title;
        }
      }
      if (body.title.trim() === "" && body.titleAlt.trim() === "") return;
      void fetch(`/api/pieces/${songId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }).then((res) => res.ok ? res.json() : null).then((updated) => {
        if (updated) setPiece(updated);
      });
    }
  }

  function handleTitleBlur() {
    flushSave();
    const currentValue = (titleRef.current ?? titleAltRef.current)?.value ?? "";
    const newTitle = locale === "en-US" ? (piece?.title ?? "") : currentValue;
    const newTitleAlt = locale === "en-US" ? currentValue : (piece?.titleAlt ?? "");
    if (newTitle.trim() === "" && newTitleAlt.trim() === "") {
      // Revert the input to its previous valid value
      const fallback = piece?.title || piece?.titleAlt || "";
      if (titleRef.current) titleRef.current.value = fallback;
      if (titleAltRef.current) titleAltRef.current.value = fallback;
      alert(t.titleRequired);
    }
  }

  const images = useMemo(() => piece?.images?.[tab] ?? [], [piece, tab]);

  // Auto-scroll to images section if there are images (only on initial load)
  useEffect(() => {
    if (!piece || hasScrolledToImages.current) return;
    const hasImages = Object.values(piece.images ?? {}).some((arr) => arr.length > 0);
    if (hasImages) {
      hasScrolledToImages.current = true;
      // Small delay to ensure DOM is rendered
      requestAnimationFrame(() => {
        imagesSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, [piece]);

  // Auto-switch tab if current one is empty but the other has images.
  // Only runs when piece data changes (initial load / after upload), not on manual tab switch.
  useEffect(() => {
    if (!piece?.images) return;
    const other: ImageKind = tab === "staff" ? "numbered" : "staff";
    if ((piece.images[tab]?.length ?? 0) === 0 && (piece.images[other]?.length ?? 0) > 0) {
      setTab(other);
    }
  }, [piece]);

  if (!piece) return <main className="p-6">{t.loading}</main>;

  return (
    <main className="sheet-page">
      <header ref={headerRef} className="grid gap-3 border-b border-[var(--line)] bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 flex-1">
            <Link className="icon-button shrink-0" href="/" aria-label={t.backToDirectory}><House size={16} /></Link>
            <input
              ref={locale === "en-US" ? titleAltRef : titleRef}
              key={`title-${songId}-${locale}`}
              className="input max-w-lg min-w-[100px] flex-1 text-base font-semibold"
              defaultValue={locale === "en-US" ? (piece.titleAlt || piece.title) : (piece.title || piece.titleAlt)}
              onChange={scheduleSave}
              onBlur={handleTitleBlur}
              onCompositionStart={() => { isComposingRef.current = true; }}
              onCompositionEnd={() => { isComposingRef.current = false; scheduleSave(); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            />
          </div>
          <button className="icon-button" type="button" onClick={toggleFavorite} aria-label={favoriteIds.includes(songId) ? t.removeFromFavorites : t.addToFavorites}>
            <Heart size={15} fill={favoriteIds.includes(songId) ? "currentColor" : "none"} style={favoriteIds.includes(songId) ? { color: "var(--accent)" } : undefined} />
          </button>
          <button className="icon-button danger-button" type="button" onClick={deletePiece} aria-label={t.deletePiece}><Trash2 size={15} /></button>
          <LocaleSwitch className="ml-auto" />
        </div>
        <textarea
          ref={notesRef}
          key={`notes-${songId}`}
          className="textarea"
          rows={1}
          defaultValue={piece.notes}
          onChange={scheduleSave}
          placeholder={t.notes}
        />
        <div className="flex flex-nowrap items-center gap-3 overflow-x-auto">
          <select className="select tag-add-select text-center" style={{ width: "3.5rem" }} value={piece.difficulty} onChange={(event) => patch({ difficulty: Number(event.target.value) })}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => <option key={score}>{score}</option>)}
          </select>
          {(() => {
            const allCats = [...categories, ...tags.reduce<string[]>((acc, tag) => {
              if (!CORE_CATEGORIES.includes(tag.category as typeof CORE_CATEGORIES[number]) && !acc.includes(tag.category)) acc.push(tag.category);
              return acc;
            }, [])];
            function isPitchKey(key: string): boolean {
              if (!key) return false;
              const lower = key.toLowerCase();
              return (messages["zh-CN"] as Record<string, string>).pitch === lower
                  || (messages["en-US"] as Record<string, string>).pitch.toLowerCase() === lower;
            }
            function buildTagIds(category: string, ids: number[]) {
              return allCats.flatMap((cat) =>
                cat === category ? ids : (piece!.tags[cat]?.map((tag) => tag.id) ?? [])
              );
            }
            return allCats.map((category) => (
              <TagPicker
                key={category}
                compact
                isPitchCategory={isPitchKey(category)}
                singleSelect={singleSelectCategories.has(category)}
                label={CORE_CATEGORIES.includes(category as typeof CORE_CATEGORIES[number]) ? undefined : (categoryLabelsMap[category] ? (locale === "en-US" ? categoryLabelsMap[category].en || categoryLabelsMap[category].zh : categoryLabelsMap[category].zh || categoryLabelsMap[category].en) : undefined)}
                category={category}
                tags={tags.filter((tag) => tag.category === category)}
                selected={piece.tags[category]?.map((tag) => tag.id) ?? []}
                onCreate={createTag}
                onChange={(ids) => patch({ tagIds: buildTagIds(category, ids) })}
              />
            ));
          })()}
        </div>
      </header>

      <div className="sticky top-0 z-20 pointer-events-none flex items-start justify-between px-2 py-2">
        <div className="pointer-events-auto flex gap-1">
          {(["staff", "numbered"] as ImageKind[]).map((kind) => (
            <button key={kind} className={`rounded-md px-2 py-1 text-xs shadow-sm backdrop-blur-sm ${tab === kind ? "bg-[var(--accent)] text-white" : "bg-white/70 text-[var(--foreground)]"}`} type="button" onClick={() => setTab(kind)}>
              {t[kind]}
            </button>
          ))}
        </div>
        <div className="pointer-events-auto flex items-center gap-1">
          <button className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs shadow-sm backdrop-blur-sm ${!editingImages ? "bg-[var(--accent)] text-white" : "bg-white/70 text-[var(--foreground)]"}`} type="button" onClick={() => setEditingImages((value) => !value)}>
            <Images size={14} /> {editingImages ? t.viewImages : t.editImages}
          </button>
          {!editingImages && (
            <label className="flex items-center gap-1 rounded-md bg-white/70 px-2 py-1 text-xs shadow-sm backdrop-blur-sm">
              {t.zoom}
              <input type="range" min="25" max="130" value={zoom} onChange={(event) => setZoom(clampZoom(Number(event.target.value)))} className="w-20 accent-[var(--accent)]" />
            </label>
          )}
        </div>
      </div>

      <div ref={imagesSectionRef}>
        {editingImages ? (
          <ImageEditor images={images} upload={upload} deleteImage={deleteImage} moveImage={moveImage} onUpdatePiece={setPiece} />
        ) : (
          <Browser images={images} zoom={zoom} onOpen={setPageIndex} links={piece.links ?? []} setLinks={saveLinks} />
        )}
      </div>
      <Link className="fixed bottom-4 right-4 z-30 icon-button bg-white/80 backdrop-blur-sm shadow-md hover:bg-white" href="/" aria-label={t.backToDirectory}>
        <House size={16} />
      </Link>

      {pageIndex !== null && (
        <Pager images={images} tab={tab} setTab={setTab} index={pageIndex} setIndex={setPageIndex} zoom={zoom} />
      )}
    </main>
  );
}

function ImageEditor({ images, upload, deleteImage, moveImage, onUpdatePiece }: {
  images: SongImage[];
  upload: (files: FileList | null) => void;
  deleteImage: (id: number) => void;
  moveImage: (imageId: number, direction: "left" | "right") => void;
  onUpdatePiece: (piece: Song) => void;
}) {
  const { t } = useLocale();
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  function setDraft(id: number, value: string) {
    setDrafts((prev) => ({ ...prev, [id]: value }));
  }

  async function saveSourceUrl(image: SongImage) {
    const value = drafts[image.id]?.trim() || null;
    const res = await fetch(`/api/pieces/${image.songId}/images/${image.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceUrl: value })
    });
    if (res.ok) {
      const updated = await res.json() as Song;
      onUpdatePiece(updated);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[image.id];
        return next;
      });
    }
  }

  return (
    <section className="p-4">
      <label className="text-button primary-button mb-4">
        <Upload size={16} /> {t.upload}
        <input className="hidden" type="file" multiple accept="image/*" onChange={(event) => upload(event.target.files)} />
      </label>
      {images.length === 0 && (
        <p className="py-8 text-center text-sm text-[var(--muted)]">{t.noImages}</p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {images.map((image) => {
          const draft = drafts[image.id];
          const hasDraft = draft !== undefined;
          const currentValue = hasDraft ? draft : (image.sourceUrl ?? "");
          const isDirty = hasDraft && draft !== (image.sourceUrl ?? "");
          const currentIndex = images.findIndex((img) => img.id === image.id);
          const isFirst = currentIndex === 0;
          const isLast = currentIndex === images.length - 1;
          return (
            <div key={image.id} className="relative border border-[var(--line)] bg-white p-2">
              <img src={image.url} alt="" className="aspect-[3/4] w-full object-contain" />
              <button className="icon-button danger-button absolute right-2 top-2" type="button" onClick={() => deleteImage(image.id)}><Trash2 size={14} /></button>
              <div className="mt-2 flex gap-1">
                <input
                  className="input w-full text-xs"
                  placeholder={t.sourceUrl}
                  value={currentValue}
                  onChange={(event) => setDraft(image.id, event.target.value)}
                />
                <button
                  className={`shrink-0 rounded-md border px-2 text-xs ${isDirty ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--line)] bg-[#eef2ef] text-[var(--muted)] opacity-60"}`}
                  type="button"
                  disabled={!isDirty}
                  onClick={() => saveSourceUrl(image)}
                >{t.save}</button>
              </div>
              <div className="mt-2 flex justify-center gap-1">
                <button
                  className={`rounded-md px-2 py-1 text-xs ${isFirst ? "border border-[var(--line)] bg-[#eef2ef] text-[var(--muted)] opacity-60 cursor-not-allowed" : "border border-[var(--accent)] bg-[var(--accent)] text-white hover:opacity-80"}`}
                  type="button"
                  disabled={isFirst}
                  onClick={() => moveImage(image.id, "left")}
                ><ChevronLeft size={14} /></button>
                <button
                  className={`rounded-md px-2 py-1 text-xs ${isLast ? "border border-[var(--line)] bg-[#eef2ef] text-[var(--muted)] opacity-60 cursor-not-allowed" : "border border-[var(--accent)] bg-[var(--accent)] text-white hover:opacity-80"}`}
                  type="button"
                  disabled={isLast}
                  onClick={() => moveImage(image.id, "right")}
                ><ChevronRight size={14} /></button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Browser({ images, zoom, onOpen, links, setLinks }: {
  images: SongImage[];
  zoom: number;
  onOpen: (index: number) => void;
  links: VideoLink[];
  setLinks: (links: VideoLink[]) => void;
}) {
  const { t } = useLocale();
  const [draft, setDraft] = useState(links);
  const isDirty = useMemo(() => {
    if (draft.length !== links.length) return true;
    return draft.some((link, i) => link.label !== links[i].label || link.url !== links[i].url);
  }, [draft, links]);
  useEffect(() => setDraft(links), [links]);
  const scrollRef = useRef<HTMLDivElement>(null);
  return (
    <section className="px-3 py-4">
      {images.length === 0 && (
        <p className="py-40 text-center text-sm text-[var(--muted)]">{t.noImages}</p>
      )}
      <div ref={scrollRef} className="flex gap-4 overflow-x-auto pb-4">
        {images.map((image, index) => (
          <div key={image.id} className="flex-shrink-0" style={{ width: `${zoom}vw`, maxWidth: "95vw" }}>
            <button className="border-0 bg-transparent p-0 block w-full" style={{ touchAction: "manipulation" }} onClick={() => onOpen(index)}>
              <img src={image.url} alt="" className="block w-full h-auto" />
            </button>
            {image.sourceUrl && (
              <a href={image.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block truncate text-xs text-[var(--accent)] hover:underline" onClick={(e) => e.stopPropagation()}>
                {image.sourceUrl}
              </a>
            )}
          </div>
        ))}
      </div>
      <div className="mx-auto grid w-full max-w-3xl gap-2 pb-8">
        {draft.map((link, index) => (
          <div key={index} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
            <input className="input" value={link.label} onChange={(event) => setDraft(draft.map((item, i) => i === index ? { ...item, label: event.target.value } : item))} placeholder={t.linkTitle} />
            <input className="input" value={link.url} onChange={(event) => setDraft(draft.map((item, i) => i === index ? { ...item, url: event.target.value } : item))} placeholder={t.videoLink} />
            <a className="text-button" href={link.url} target="_blank">{t.open}</a>
          </div>
        ))}
        <div className="flex gap-2">
          <button className="text-button" type="button" onClick={() => setDraft([...draft, { id: 0, songId: 0, label: "", url: "", sortOrder: draft.length }])}><Plus size={16} /> {t.link}</button>
          <button className={`text-button ${isDirty ? "primary-button" : "disabled-button"}`} type="button" disabled={!isDirty} onClick={() => setLinks(draft)}>{t.saveLinks}</button>
        </div>
      </div>
    </section>
  );
}

export function Pager({ images, tab, setTab, index, setIndex, zoom }: {
  images: SongImage[];
  tab: ImageKind;
  setTab: (kind: ImageKind) => void;
  index: number;
  setIndex: (value: number | null) => void;
  zoom: number;
}) {
  const { t } = useLocale();
  const image = images[index];

  return (
    <div className="fullscreen-view">
      <div className="absolute right-3 top-3 z-40 flex gap-2">
        {(["staff", "numbered"] as ImageKind[]).map((kind) => (
          <button key={kind} className={`select-none rounded-md bg-white/20 px-2.5 py-1.5 text-sm text-white backdrop-blur-sm transition-colors ${tab === kind ? "bg-white/60 text-black" : "hover:bg-white/40"}`} type="button" onClick={() => { setTab(kind); setIndex(0); }}>{t[kind]}</button>
        ))}
      </div>
      <div className="absolute left-3 top-3 z-40 flex gap-2 select-none">
        <button className="rounded-md bg-white/20 px-2.5 py-1.5 text-white backdrop-blur-sm hover:bg-white/40 transition-colors" aria-label={t.exitPager} onClick={() => setIndex(null)}>
          <XIcon size={24} />
        </button>
        <button
          className="rounded-md bg-white/20 px-2.5 py-1.5 text-white backdrop-blur-sm hover:bg-white/40 transition-colors"
          aria-label={t.saveImage}
          onClick={() => {
            const a = document.createElement("a");
            a.href = image.url;
            a.download = image.filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          }}
        >
          <Download size={24} />
        </button>
      </div>
      <button className="absolute inset-y-0 left-0 w-1/3 z-30 select-none" aria-label={t.previousPage} onClick={() => setIndex(Math.max(0, index - 1))}>
        <div className="flex h-full items-center justify-start pl-2 opacity-30 hover:opacity-70 transition-opacity">
          <ChevronLeft size={40} />
        </div>
      </button>
      <button className="absolute inset-y-0 right-0 w-1/3 z-30 select-none" aria-label={t.nextPage} onClick={() => setIndex(Math.min(images.length - 1, index + 1))}>
        <div className="flex h-full items-center justify-end pr-2 opacity-30 hover:opacity-70 transition-opacity">
          <ChevronRight size={40} />
        </div>
      </button>
      {/* Image at z-20 above background, below nav buttons at z-30.
          Tap center to exit, long-press to trigger iOS "Save to Photos". */}
      <div
        className="absolute inset-0 z-20 flex items-center justify-center"
        style={{ userSelect: "none", WebkitTouchCallout: "default" }}
        onClick={() => setIndex(null)}
      >
        {image && <img src={image.url} alt="" className="block max-h-full max-w-full object-contain" style={{ WebkitTouchCallout: "default" }} />}
      </div>
      {image?.sourceUrl && (
        <a
          href={image.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 max-w-[80vw] truncate rounded-md bg-black/50 px-3 py-1 text-xs text-white backdrop-blur-sm hover:bg-black/70"
        >
          {t.source}: {image.sourceUrl}
        </a>
      )}
      <Link
        href="/"
        className="absolute bottom-3 right-3 z-40 flex items-center justify-center rounded-md bg-white/20 px-2.5 py-1.5 text-white backdrop-blur-sm hover:bg-white/40 transition-colors"
        aria-label={t.backToDirectory}
      >
        <House size={24} />
      </Link>
    </div>
  );
}