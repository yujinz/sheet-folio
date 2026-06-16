"use client";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Images, Plus, Trash2, Upload, X, X as XIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import LocaleSwitch from "@/components/LocaleSwitch";
import TagPicker from "@/components/TagPicker";
import { useLocale } from "@/lib/useLocale";
import type { ImageKind, Song, SongImage, Tag, TagCategory, YoutubeLink } from "@/lib/types";

const categories: TagCategory[] = ["pitch", "technique", "rhythm"];

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
  const [tab, setTab] = useState<ImageKind>("staff");
  const [editingImages, setEditingImages] = useState(false);
  const [pageIndex, setPageIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState(100);
  const clampZoom = (z: number) => Math.min(130, Math.max(25, z));
  const [dragId, setDragId] = useState<number | null>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const titleEnRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef(false);

  useEffect(() => {
    void refresh();
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
    const created = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tag)
    }).then((res) => res.json());
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

  async function moveImage(targetId: number) {
    if (!piece || dragId === null || dragId === targetId) return;
    const current = piece.images?.[tab] ?? [];
    const from = current.findIndex((image) => image.id === dragId);
    const to = current.findIndex((image) => image.id === targetId);
    const next = [...current];
    next.splice(to, 0, next.splice(from, 1)[0]);
    setPiece({ ...piece, images: { ...piece.images!, [tab]: next } });
    await fetch(`/api/pieces/${songId}/images`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: tab, ids: next.map((image) => image.id) })
    });
  }

  async function saveLinks(links: YoutubeLink[]) {
    const clean = links.filter((link) => link.label.trim() && link.url.trim());
    const updated = await fetch(`/api/pieces/${songId}/links`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ links: clean })
    }).then((res) => res.json());
    setPiece(updated);
  }

  async function deletePiece() {
    if (!confirm(t.deletePieceConfirm)) return;
    await fetch(`/api/pieces/${songId}`, { method: "DELETE" });
    location.href = "/";
  }

  // Debounced save — reads values from refs (uncontrolled inputs)
  function scheduleSave() {
    isDirtyRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const notes = notesRef.current?.value ?? "";
      const body: Record<string, string> = { notes };
      // Only one title input is rendered (based on locale); preserve the other from current piece state
      if (locale === "en-US") {
        body.title = piece?.title ?? "";
        body.titleEn = titleEnRef.current?.value ?? "";
      } else {
        body.title = titleRef.current?.value ?? "";
        body.titleEn = piece?.titleEn ?? "";
      }
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

  const images = useMemo(() => piece?.images?.[tab] ?? [], [piece, tab]);

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
          <Link className="icon-button" href="/" aria-label={t.backToDirectory}><ArrowLeft size={16} /></Link>
          <input
            ref={locale === "en-US" ? titleEnRef : titleRef}
            key={`title-${songId}-${locale}`}
            className="input max-w-lg text-xl font-semibold"
            defaultValue={locale === "en-US" ? piece.titleEn : piece.title}
            onChange={scheduleSave}
          />
          <button className="text-button" type="button" onClick={() => setEditingImages((value) => !value)}>
            {editingImages ? <X size={16} /> : <Images size={16} />} {editingImages ? t.viewImages : t.editImages}
          </button>
          <button className="icon-button danger-button ml-auto" type="button" onClick={deletePiece} aria-label={t.deletePiece}><Trash2 size={15} /></button>
          <LocaleSwitch />
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
            {[1, 2, 3, 4, 5].map((score) => <option key={score}>{score}</option>)}
          </select>
          {categories.map((category) => (
            <TagPicker
              key={category}
              compact
              category={category}
              tags={tags.filter((tag) => tag.category === category)}
              selected={piece.tags[category].map((tag) => tag.id)}
              onCreate={createTag}
              onChange={(ids) => patch({ tagIds: categories.flatMap((cat) => cat === category ? ids : piece.tags[cat].map((tag) => tag.id)) })}
            />
          ))}
        </div>
      </header>

      <div className="sticky top-0 z-20 pointer-events-none">
        {!editingImages && (
          <label className="pointer-events-auto absolute left-2 top-2 flex items-center gap-1 rounded-md bg-white/70 px-2 py-1 text-xs shadow-sm backdrop-blur-sm">
            {t.zoom}
            <input type="range" min="25" max="130" value={zoom} onChange={(event) => setZoom(clampZoom(Number(event.target.value)))} className="w-20" />
          </label>
        )}
        <div className="pointer-events-auto absolute right-2 top-2 flex gap-1">
          {(["staff", "numbered"] as ImageKind[]).map((kind) => (
            <button key={kind} className={`rounded-md px-2 py-1 text-xs shadow-sm backdrop-blur-sm ${tab === kind ? "bg-[var(--accent)] text-white" : "bg-white/70 text-[var(--foreground)]"}`} type="button" onClick={() => setTab(kind)}>
              {t[kind]}
            </button>
          ))}
        </div>
      </div>

      {editingImages ? (
        <ImageEditor images={images} dragId={dragId} setDragId={setDragId} upload={upload} deleteImage={deleteImage} moveImage={moveImage} />
      ) : (
        <Browser images={images} zoom={zoom} onOpen={setPageIndex} links={piece.links ?? []} setLinks={saveLinks} />
      )}

      {pageIndex !== null && (
        <Pager images={images} tab={tab} setTab={setTab} index={pageIndex} setIndex={setPageIndex} zoom={zoom} />
      )}
    </main>
  );
}

function ImageEditor({ images, dragId, setDragId, upload, deleteImage, moveImage }: {
  images: SongImage[];
  dragId: number | null;
  setDragId: (id: number | null) => void;
  upload: (files: FileList | null) => void;
  deleteImage: (id: number) => void;
  moveImage: (id: number) => void;
}) {
  const { t } = useLocale();

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
        {images.map((image) => (
          <div key={image.id} draggable onDragStart={() => setDragId(image.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => moveImage(image.id)} className="relative border border-[var(--line)] bg-white p-2">
            <img src={image.url} alt="" className="aspect-[3/4] w-full object-contain" />
            <button className="icon-button danger-button absolute right-2 top-2" type="button" onClick={() => deleteImage(image.id)}><Trash2 size={14} /></button>
            <input
              className="input mt-2 w-full text-xs"
              placeholder={t.sourceUrl}
              defaultValue={image.sourceUrl ?? ""}
              onBlur={(event) => {
                const value = event.target.value.trim() || null;
                fetch(`/api/pieces/${image.songId}/images/${image.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ sourceUrl: value })
                });
              }}
            />
          </div>
        ))}
      </div>
      {dragId !== null && <div className="sr-only">{t.dragging}</div>}
    </section>
  );
}

function Browser({ images, zoom, onOpen, links, setLinks }: {
  images: SongImage[];
  zoom: number;
  onOpen: (index: number) => void;
  links: YoutubeLink[];
  setLinks: (links: YoutubeLink[]) => void;
}) {
  const { t } = useLocale();
  const [draft, setDraft] = useState(links);
  useEffect(() => setDraft(links), [links]);
  const scrollRef = useRef<HTMLDivElement>(null);
  return (
    <section className="px-3 py-4">
      {images.length === 0 && (
        <p className="py-8 text-center text-sm text-[var(--muted)]">{t.noImages}</p>
      )}
      <div ref={scrollRef} className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scroll-smooth">
        {images.map((image, index) => (
          <div key={image.id} className="flex-shrink-0 snap-start" style={{ width: `${zoom}vw`, maxWidth: "95vw" }}>
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
            <input className="input" value={link.url} onChange={(event) => setDraft(draft.map((item, i) => i === index ? { ...item, url: event.target.value } : item))} placeholder={t.youtubeLink} />
            <a className="text-button" href={link.url} target="_blank">{t.open}</a>
          </div>
        ))}
        <div className="flex gap-2">
          <button className="text-button" type="button" onClick={() => setDraft([...draft, { id: 0, songId: 0, label: "", url: "", sortOrder: draft.length }])}><Plus size={16} /> {t.link}</button>
          <button className="text-button primary-button" type="button" onClick={() => setLinks(draft)}>{t.saveLinks}</button>
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
      <div className="absolute right-3 top-3 z-20 flex gap-2">
        {(["staff", "numbered"] as ImageKind[]).map((kind) => (
          <button key={kind} className={`rounded-md bg-white/20 px-2 py-1 text-sm text-white backdrop-blur-sm ${tab === kind ? "bg-white/60 text-black" : "hover:bg-white/40"}`} type="button" onClick={() => { setTab(kind); setIndex(0); }}>{t[kind]}</button>
        ))}
      </div>
      <button className="absolute left-3 top-3 z-30 rounded-md bg-white/20 px-3 py-2 text-white backdrop-blur-sm hover:bg-white/40 transition-colors" aria-label={t.exitPager} onClick={() => setIndex(null)}>
        <XIcon size={24} />
      </button>
      <button className="absolute inset-0 left-0 right-1/2 z-10" aria-label={t.previousPage} onClick={() => setIndex(Math.max(0, index - 1))}>
        <div className="flex h-full w-16 items-center justify-center opacity-30 hover:opacity-70 transition-opacity">
          <ChevronLeft size={40} />
        </div>
      </button>
      <button className="absolute inset-0 left-1/2 right-0 z-10" aria-label={t.nextPage} onClick={() => setIndex(Math.min(images.length - 1, index + 1))}>
        <div className="flex h-full w-16 items-center justify-center opacity-30 hover:opacity-70 transition-opacity ml-auto">
          <ChevronRight size={40} />
        </div>
      </button>
      <div className="absolute inset-0 flex items-center justify-center">
        {image && <img src={image.url} alt="" className="block max-h-full max-w-full object-contain" />}
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
    </div>
  );
}