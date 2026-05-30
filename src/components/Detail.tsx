"use client";

import Link from "next/link";
import { ArrowLeft, Images, Plus, Trash2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import LocaleSwitch from "@/components/LocaleSwitch";
import TagPicker from "@/components/TagPicker";
import { useLocale } from "@/lib/useLocale";
import type { ImageKind, Song, SongImage, Tag, TagCategory, YoutubeLink } from "@/lib/types";

const categories: TagCategory[] = ["pitch", "technique", "rhythm"];

function getDeviceId() {
  const key = "sheet-folio-device-id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const next = crypto.randomUUID();
  localStorage.setItem(key, next);
  return next;
}

export default function Detail({ songId }: { songId: number }) {
  const { t } = useLocale();
  const [piece, setPiece] = useState<Song | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [tab, setTab] = useState<ImageKind>("staff");
  const [editingImages, setEditingImages] = useState(false);
  const [pageIndex, setPageIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState(100);
  const [dragId, setDragId] = useState<number | null>(null);

  useEffect(() => {
    void refresh();
    const deviceId = getDeviceId();
    fetch(`/api/device-zoom?deviceId=${deviceId}&songId=${songId}`)
      .then((res) => res.json())
      .then((row) => setZoom(row.zoom ?? 100));
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

  const images = useMemo(() => piece?.images?.[tab] ?? [], [piece, tab]);
  if (!piece) return <main className="p-6">{t.loading}</main>;

  return (
    <main className="sheet-page">
      <header className="sticky top-0 z-10 grid gap-3 border-b border-[var(--line)] bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link className="icon-button" href="/" aria-label={t.backToDirectory}><ArrowLeft size={16} /></Link>
          <input className="input max-w-lg text-xl font-semibold" value={piece.title} onChange={(event) => patch({ title: event.target.value })} />
          <select className="select w-20" value={piece.difficulty} onChange={(event) => patch({ difficulty: Number(event.target.value) })}>
            {[1, 2, 3, 4, 5].map((score) => <option key={score}>{score}</option>)}
          </select>
          <button className="text-button" type="button" onClick={() => setEditingImages((value) => !value)}>
            {editingImages ? <X size={16} /> : <Images size={16} />} {editingImages ? t.viewImages : t.editImages}
          </button>
          <label className="flex items-center gap-2 text-sm">
            {t.zoom}
            <input type="range" min="25" max="220" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
          </label>
          <LocaleSwitch />
          <button className="icon-button danger-button ml-auto" type="button" onClick={deletePiece} aria-label={t.deletePiece}><Trash2 size={15} /></button>
        </div>
        <textarea className="textarea" rows={1} value={piece.notes} onChange={(event) => patch({ notes: event.target.value })} placeholder={t.notes} />
        <div className="grid gap-3 lg:grid-cols-3">
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
        <div className="flex gap-2">
          {(["staff", "numbered"] as ImageKind[]).map((kind) => (
            <button key={kind} className={`text-button ${tab === kind ? "primary-button" : ""}`} type="button" onClick={() => setTab(kind)}>
              {t[kind]}
            </button>
          ))}
        </div>
      </header>

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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {images.map((image) => (
          <div key={image.id} draggable onDragStart={() => setDragId(image.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => moveImage(image.id)} className="relative border border-[var(--line)] bg-white p-2">
            <img src={image.url} alt="" className="aspect-[3/4] w-full object-contain" />
            <button className="icon-button danger-button absolute right-2 top-2" type="button" onClick={() => deleteImage(image.id)}><Trash2 size={14} /></button>
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
  return (
    <section className="image-stage grid gap-6 px-3 py-4">
      {images.map((image, index) => (
        <button key={image.id} className="mx-auto block w-full border-0 bg-transparent p-0" style={{ maxWidth: `${zoom}vw` }} onClick={() => onOpen(index)}>
          <img src={image.url} alt="" />
        </button>
      ))}
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

function Pager({ images, tab, setTab, index, setIndex, zoom }: {
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
      <div className="absolute left-3 top-3 z-10 flex gap-2">
        {(["staff", "numbered"] as ImageKind[]).map((kind) => (
          <button key={kind} className={`text-button ${tab === kind ? "primary-button" : ""}`} type="button" onClick={() => setTab(kind)}>{t[kind]}</button>
        ))}
      </div>
      <button className="absolute inset-y-0 left-0 w-1/3" aria-label={t.previousPage} onClick={() => setIndex(Math.max(0, index - 1))} />
      <button className="absolute inset-y-0 left-1/3 w-1/3" aria-label={t.exitPager} onClick={() => setIndex(null)} />
      <button className="absolute inset-y-0 right-0 w-1/3" aria-label={t.nextPage} onClick={() => setIndex(Math.min(images.length - 1, index + 1))} />
      {image && <img src={image.url} alt="" className="h-full w-full object-contain" style={{ transform: `scale(${zoom / 100})` }} />}
    </div>
  );
}
