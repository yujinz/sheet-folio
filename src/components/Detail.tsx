"use client";
import Link from "next/link";
import { BookOpen, ChevronLeft, ChevronRight, Heart, House, Images, Plus, ScrollText, Trash2, Upload, X, X as XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LocaleSwitch from "@/components/LocaleSwitch";
import TagPicker from "@/components/TagPicker";
import { messages, type Locale } from "@/lib/i18n";
import { useLocale } from "@/lib/useLocale";
import { usePitchCategory } from "@/lib/useIsPitchCategory";
import { getLocalizedField } from "@/lib/i18n-utils";
import { STORAGE_KEYS, DIFFICULTY_LEVELS, ZOOM_MIN, ZOOM_MAX, DEBOUNCE_MS } from "@/lib/constants";
import { useCreateTag } from "@/lib/useTagMutations";
import { useFavorites } from "@/lib/useFavorites";
import { useAutoSave } from "@/lib/useAutoSave";
import { type ImageKind, type Song, SongImage, type Tag, type VideoLink } from "@/lib/types";

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
  const existing = localStorage.getItem(STORAGE_KEYS.deviceId);
  if (existing) return existing;
  const next = generateId();
  localStorage.setItem(STORAGE_KEYS.deviceId, next);
  return next;
}

type PagerViewMode = "flip" | "scroll";

export default function Detail({ songId }: { songId: number }) {
  const { t, locale } = useLocale();
  const [piece, setPiece] = useState<Song | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [singleSelectCategories, setSingleSelectCategories] = useState<Set<string>>(new Set());
  const [categoryLabelsMap, setCategoryLabelsMap] = useState<Record<string, { zh: string; en: string }>>({});
  const { isPitch: isPitchCategory } = usePitchCategory();
  const [tab, setTab] = useState<ImageKind>("staff");
  const [editingImages, setEditingImages] = useState(false);
  const [pageIndex, setPageIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState(100);
  const [viewMode, setViewMode] = useState<PagerViewMode>("flip");
  // Restore the saved pager view mode after hydration (avoids hydration mismatch).
  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_KEYS.pagerViewMode);
    if (saved === "flip" || saved === "scroll") setViewMode(saved);
  }, []);
  const toggleViewMode = () => {
    const next: PagerViewMode = viewMode === "flip" ? "scroll" : "flip";
    setViewMode(next);
    sessionStorage.setItem(STORAGE_KEYS.pagerViewMode, next);
  };
  const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
  const headerRef = useRef<HTMLDivElement>(null);
  const { titleRef, titleAltRef, notesRef, scheduleSave, handleTitleBlur, isComposingRef, isDirtyRef } = useAutoSave(songId, piece, setPiece);
  const imagesSectionRef = useRef<HTMLDivElement>(null);
  const hasScrolledToImages = useRef(false);
  const { favoriteIds, toggleFavorite } = useFavorites();

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
            map[r.key] = { zh: r.name, en: r.nameAlt };
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
    }, DEBOUNCE_MS.zoom);
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

  const createTag = useCreateTag(setTags);

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

  const handleToggleFavorite = () => toggleFavorite(songId);

  const images = useMemo(() => piece?.images?.[tab] ?? [], [piece, tab]);

  // Auto-scroll to images section if there are images (only on initial load).
  // Also auto-switches to the correct tab ("staff" vs "numbered") so scrolling
  // only happens after the tab is settled — no flash of the wrong tab content.
  useEffect(() => {
    if (!piece || hasScrolledToImages.current) return;

    // Auto-switch tab if current one is empty but the other has images
    if (!piece.images) return;
    const other: ImageKind = tab === "staff" ? "numbered" : "staff";
    if ((piece.images[tab]?.length ?? 0) === 0 && (piece.images[other]?.length ?? 0) > 0) {
      setTab(other);
      return; // don't scroll yet — wait for the next render with the correct tab
    }

    const hasImages = Object.values(piece.images ?? {}).some((arr) => arr.length > 0);
    if (hasImages) {
      hasScrolledToImages.current = true;
      const target = imagesSectionRef.current;
      if (target) {
        // Wait for images to load before scrolling, so the layout is stable.
        // On first visit (cold cache), images load asynchronously; scrolling
        // before they load produces an incorrect scroll position.
        const imgs = Array.from(target.querySelectorAll("img"));
        const unloaded = imgs.filter((img) => !img.complete);
        if (unloaded.length === 0) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        } else {
          let remaining = unloaded.length;
          const onLoad = () => {
            if (--remaining === 0) {
              requestAnimationFrame(() => {
                target.scrollIntoView({ behavior: "smooth", block: "start" });
              });
            }
          };
          unloaded.forEach((img) => {
            img.addEventListener("load", onLoad, { once: true });
            img.addEventListener("error", onLoad, { once: true });
          });
        }
      }
    }
  }, [piece, tab]);

  // Auto-switch tab after uploads / piece data changes (not during initial load).
  // Initial-load tab switching is handled above; the guard on hasScrolledToImages
  // prevents double-toggling since by then the tab is already correct.
  useEffect(() => {
    if (!piece?.images || hasScrolledToImages.current) return;
    const other: ImageKind = tab === "staff" ? "numbered" : "staff";
    if ((piece.images[tab]?.length ?? 0) === 0 && (piece.images[other]?.length ?? 0) > 0) {
      setTab(other);
    }
  }, [piece]);

  return (
    <main className="sheet-page" style={{ overflowY: "auto" }}>
      {!piece ? (
        <div className="p-6">{t.loading}</div>
      ) : (
        <>
      <header ref={headerRef} className="grid gap-3 border-b border-[var(--line)] bg-white px-4 py-3">
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-center gap-2">
          <LocaleSwitch className="order-1 sm:order-last self-end sm:self-auto" />
          <div className="flex flex-wrap items-center gap-2 flex-1 order-2 sm:order-first w-full sm:w-auto">
            <div className="flex items-center gap-2 flex-1">
              <Link className="icon-button shrink-0" href="/" aria-label={t.backToDirectory}><House size={16} /></Link>
              <input
                ref={locale === "en-US" ? titleAltRef : titleRef}
                key={`title-${songId}-${locale}`}
                className="input max-w-lg min-w-[100px] flex-1 text-base font-semibold"
                defaultValue={getLocalizedField(locale, piece.title, piece.titleAlt)}
                onFocus={(e) => {
                  const len = (e.target as HTMLInputElement).value.length;
                  setTimeout(() => (e.target as HTMLInputElement).setSelectionRange(len, len), 0);
                }}
                onChange={scheduleSave}
                onBlur={handleTitleBlur}
                onCompositionStart={() => { isComposingRef.current = true; }}
                onCompositionEnd={() => { isComposingRef.current = false; scheduleSave(); }}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              />
            </div>
              <button className="icon-button" type="button" onClick={handleToggleFavorite} aria-label={favoriteIds.includes(songId) ? t.removeFromFavorites : t.addToFavorites}>
              <Heart size={15} fill={favoriteIds.includes(songId) ? "currentColor" : "none"} style={favoriteIds.includes(songId) ? { color: "var(--accent)" } : undefined} />
            </button>
            <button className="icon-button danger-button" type="button" onClick={deletePiece} aria-label={t.deletePiece}><Trash2 size={15} /></button>
          </div>
        </div>
        <textarea
          ref={notesRef}
          key={`notes-${songId}`}
          className="textarea"
          rows={1}
          defaultValue={piece.notes}
          onFocus={(e) => {
            const len = (e.target as HTMLTextAreaElement).value.length;
            setTimeout(() => (e.target as HTMLTextAreaElement).setSelectionRange(len, len), 0);
          }}
          onChange={scheduleSave}
          placeholder={t.notes}
        />
        <div className="flex flex-nowrap items-center gap-3 overflow-x-auto">
          <select className="select tag-add-select text-center" style={{ width: "3.5rem" }} value={piece.difficulty} onChange={(event) => patch({ difficulty: Number(event.target.value) })}>
              {DIFFICULTY_LEVELS.map((score) => <option key={score}>{score}</option>)}
          </select>
          {(() => {
            const allCats = [...new Set([...Object.keys(categoryLabelsMap), ...tags.map((tag) => tag.category)])];

            function buildTagIds(category: string, ids: number[]) {
              return allCats.flatMap((cat) =>
                cat === category ? ids : (piece!.tags[cat]?.map((tag) => tag.id) ?? [])
              );
            }
            function getLabel(key: string): string | undefined {
              const lbl = categoryLabelsMap[key];
              if (!lbl) return undefined;
              return getLocalizedField(locale, lbl.zh, lbl.en);
            }
            return allCats.map((category) => {
              const label = getLabel(category);
              const isPitch = isPitchCategory(category, label);
              return (
              <TagPicker
                key={category}
                compact
                isPitchCategory={isPitch}
                singleSelect={singleSelectCategories.has(category)}
                label={label}
                category={category}
                tags={tags.filter((tag) => tag.category === category)}
                selected={piece.tags[category]?.map((tag) => tag.id) ?? []}
                onCreate={createTag}
                onChange={(ids) => patch({ tagIds: buildTagIds(category, ids) })}
              />
            )});
          })()}
        </div>
      </header>

      <div className="sticky top-0 z-20 pointer-events-none flex flex-wrap items-start gap-x-2 gap-y-1 px-2 py-2">
        <div className="pointer-events-auto flex gap-1">
          {(["staff", "numbered"] as ImageKind[]).map((kind) => (
            <button key={kind} className={`rounded-md px-2 py-1 text-xs shadow-sm backdrop-blur-sm ${tab === kind ? "bg-[var(--accent)] text-white" : "bg-white/70 text-[var(--foreground)]"}`} type="button" onClick={() => setTab(kind)}>
              {t[kind]}
            </button>
          ))}
        </div>
        <button className={`pointer-events-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs shadow-sm backdrop-blur-sm ${!editingImages ? "bg-[var(--accent)] text-white" : "bg-white/70 text-[var(--foreground)]"}`} type="button" onClick={() => setEditingImages((value) => !value)}>
          <Images size={14} /> <span className="break-keep">{editingImages ? t.viewImages : t.editImages}</span>
        </button>
        {!editingImages && (
          <label className="pointer-events-auto flex items-center gap-1 rounded-md bg-white/70 px-2 py-1 text-xs shadow-sm backdrop-blur-sm ml-auto">
            {t.zoom}
            <input type="range" min={ZOOM_MIN} max={ZOOM_MAX} value={zoom} onChange={(event) => setZoom(clampZoom(Number(event.target.value)))} className="w-20 accent-[var(--accent)]" />
          </label>
        )}
      </div>
        </>
      )}

      {/* imagesSectionRef is always rendered so the auto-scroll ref is valid from mount */}
      <div ref={imagesSectionRef}>
        {piece && (editingImages ? (
          <ImageEditor images={images} upload={upload} deleteImage={deleteImage} moveImage={moveImage} onUpdatePiece={setPiece} />
        ) : (
          <Browser images={images} zoom={zoom} onOpen={setPageIndex} links={piece.links ?? []} setLinks={saveLinks} />
        ))}
      </div>
      {piece && (
      <Link className="fixed bottom-6 right-6 z-30 icon-button bg-white/80 backdrop-blur-sm shadow-md hover:bg-white" href="/" aria-label={t.backToDirectory}>
        <House size={16} />
      </Link>
      )}

      {pageIndex !== null && piece && (
        <Pager images={images} tab={tab} setTab={setTab} index={pageIndex} setIndex={setPageIndex} viewMode={viewMode} toggleViewMode={toggleViewMode} />
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
  const prevZoom = useRef(zoom);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || prevZoom.current === zoom) return;
    // Keep the center content visually stable as zoom changes.
    const ratio = zoom / prevZoom.current;
    el.scrollLeft = el.scrollLeft * ratio + (el.clientWidth * (ratio - 1)) / 2;
    prevZoom.current = zoom;
  }, [zoom]);
  // On initial load, if the first image is wider than the viewport,
  // scroll horizontally so its center is visible.
  const hasCenteredFirst = useRef(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || images.length === 0 || hasCenteredFirst.current) return;
    const first = el.firstElementChild as HTMLElement | null;
    if (!first) return;
    if (first.offsetWidth > el.clientWidth) {
      el.scrollLeft = (first.offsetWidth - el.clientWidth) / 2;
    }
    hasCenteredFirst.current = true;
  }, [images]);

  const [activeIndex, setActiveIndex] = useState(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showDots, setShowDots] = useState(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || images.length <= 1) return;
    function onScroll() {
      const children = Array.from(el!.children) as HTMLElement[];
      const center = el!.scrollLeft + el!.clientWidth / 2;
      let closestIndex = 0;
      let closestDist = Infinity;
      children.forEach((child, i) => {
        const dist = Math.abs(child.offsetLeft + child.offsetWidth / 2 - center);
        if (dist < closestDist) {
          closestDist = dist;
          closestIndex = i;
        }
      });
      setActiveIndex(closestIndex);
      setShowDots(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => setShowDots(false), 2000);
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [images]);

  return (
    <section className="px-3 py-4">
      {images.length === 0 && (
        <p className="py-40 text-center text-sm text-[var(--muted)]">{t.noImages}</p>
      )}
      <div ref={scrollRef} className="flex gap-2 overflow-x-auto pb-4 snap-x snap-mandatory" style={{ WebkitOverflowScrolling: "touch" }}>
        {images.map((image, index) => (
          <div key={image.id} className="flex-shrink-0 snap-center" style={{ width: `${zoom}vw` }}>
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
      {images.length > 1 && showDots && (
        <div className="fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 gap-2 rounded-full bg-black/20 px-3 py-1.5 backdrop-blur-sm">
          {images.map((_, index) => (
            <button
              key={index}
              type="button"
              className={`h-2.5 w-2.5 rounded-full border-0 p-0 transition-colors ${
                index === activeIndex ? "bg-[var(--accent)]" : "bg-white/60"
              }`}
              onClick={() => {
                const el = scrollRef.current;
                const child = el?.children[index] as HTMLElement | null;
                if (child && el) {
                  const left = child.offsetLeft + child.offsetWidth / 2 - el.clientWidth / 2;
                  el.scrollTo({ left, behavior: "smooth" });
                }
              }}
              aria-label={`Go to image ${index + 1}`}
            />
          ))}
        </div>
      )}
      <div className="mx-auto grid w-full max-w-3xl gap-2 pb-8">
        {draft.map((link, index) => (
          <div key={index} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto_auto]">
            <input className="input" value={link.label} onChange={(event) => setDraft(draft.map((item, i) => i === index ? { ...item, label: event.target.value } : item))} placeholder={t.linkTitle} />
            <input className="input" value={link.url} onChange={(event) => setDraft(draft.map((item, i) => i === index ? { ...item, url: event.target.value } : item))} placeholder={t.videoLink} />
            <a className="text-button" href={link.url} target="_blank">{t.open}</a>
            <button className="icon-button" type="button" onClick={() => {
              if (!confirm(t.removeLinkConfirm)) return;
              const next = draft.filter((_, i) => i !== index);
              setDraft(next);
              setLinks(next);
            }} aria-label={t.removeLink}><X size={14} /></button>
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

export function Pager({ images, tab, setTab, index, setIndex, viewMode, toggleViewMode }: {
  images: SongImage[];
  tab: ImageKind;
  setTab: (kind: ImageKind) => void;
  index: number;
  setIndex: (value: number | null) => void;
  viewMode: PagerViewMode;
  toggleViewMode: () => void;
}) {
  const { t } = useLocale();
  const isFlip = viewMode === "flip";

  // --- Mode indicator toast (shown on open and on every mode switch) ---
  const [toast, setToast] = useState<string | { label: string; hint: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((content: string | { label: string; hint: string }) => {
    setToast(content);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1000);
  }, []);
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    if (clickTimer.current) clearTimeout(clickTimer.current);
  }, []);

  // Keep the page background black while fullscreen, so no sub-pixel gap shows at the bottom.
  useEffect(() => {
    document.documentElement.classList.add("fullscreen-active");
    return () => document.documentElement.classList.remove("fullscreen-active");
  }, []);

  // Read locale directly from localStorage for toast labels.
  // This avoids the stale initial state of useLocale (always "zh-CN" on first render).
  const getLocale = (): Locale => {
    if (typeof window === "undefined") return "zh-CN";
    const stored = localStorage.getItem(STORAGE_KEYS.locale);
    return stored === "en-US" ? "en-US" : "zh-CN";
  };
  const modeLabel = (mode: PagerViewMode) =>
    mode === "flip" ? messages[getLocale()].flipView : messages[getLocale()].scrollView;

  const prevMode = useRef<PagerViewMode | null>(null);
  const hintShown = useRef(false);
  useEffect(() => {
    if (prevMode.current !== viewMode) {
      prevMode.current = viewMode;
      const label = modeLabel(viewMode);
      const hint = hintShown.current ? "" : messages[getLocale()].doubleClickHint;
      hintShown.current = true;
      showToast({ label, hint });
    }
  }, [viewMode, showToast]);

  // --- Vertical scroll mode ---
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeScrollIndex, setActiveScrollIndex] = useState(index);
  const activeScrollIndexRef = useRef(index);
  const [showCounter, setShowCounter] = useState(true);
  const counterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the viewed page in sync with the parent index when leaving scroll mode.
  const handleToggleMode = () => {
    if (!isFlip && activeScrollIndexRef.current !== index) {
      setIndex(activeScrollIndexRef.current);
    }
    toggleViewMode();
  };

  // Single-click exits (flip mode only); double-click toggles the view mode.
  const handleCenterClick = () => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      handleToggleMode();
      return;
    }
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      if (isFlip) setIndex(null);
    }, 300);
  };

  // When in scroll mode, jump to the current index (on mode switch or tab switch).
  useEffect(() => {
    if (isFlip || !scrollRef.current || images.length === 0) return;
    const el = scrollRef.current;
    const child = el.children[index] as HTMLElement | undefined;
    if (child) {
      const top = child.offsetTop - (el.clientHeight - child.offsetHeight) / 2;
      el.scrollTop = top;
    }
  }, [isFlip, index, images.length]);

  // Track the image closest to the viewport center while scrolling; auto-hide counter.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || isFlip || images.length <= 1) return;
    function onScroll() {
      const children = Array.from(el!.children) as HTMLElement[];
      const center = el!.scrollTop + el!.clientHeight / 2;
      let closest = 0;
      let closestDist = Infinity;
      children.forEach((child, i) => {
        const dist = Math.abs(child.offsetTop + child.offsetHeight / 2 - center);
        if (dist < closestDist) {
          closestDist = dist;
          closest = i;
        }
      });
      activeScrollIndexRef.current = closest;
      setActiveScrollIndex(closest);
      setShowCounter(true);
      if (counterTimer.current) clearTimeout(counterTimer.current);
      counterTimer.current = setTimeout(() => setShowCounter(false), 2000);
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (counterTimer.current) clearTimeout(counterTimer.current);
    };
  }, [isFlip, images.length]);

  // The image currently in view: parent index in flip mode, scroll position in scroll mode.
  const currentImage = images[isFlip ? index : activeScrollIndex];

  return (
    <div className="fullscreen-view">
      <div className="absolute right-3 top-3 z-40 flex gap-2">
        <button
          type="button"
          className="rounded-md bg-black/10 px-2 py-1.5 text-white backdrop-blur-sm hover:bg-white/20 transition-colors"
          aria-label={isFlip ? t.scrollView : t.flipView}
          onClick={handleToggleMode}
        >
          {isFlip
            ? <ScrollText size={24} className="drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]" />
            : <BookOpen size={24} className="drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]" />}
        </button>
        {(["staff", "numbered"] as ImageKind[]).map((kind) => (
          <button key={kind} className={`select-none rounded-md bg-black/10 px-2 py-1 text-sm text-white backdrop-blur-sm transition-colors ${tab === kind ? "bg-white/60 text-black" : "hover:bg-white/20"}`} type="button" onClick={() => { setTab(kind); setIndex(0); }}><span className="drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">{t[kind]}</span></button>
        ))}
      </div>
      <div className="absolute left-6 top-3 z-40 flex gap-2 select-none">
        <button className="rounded-md bg-black/10 px-2 py-1.5 text-white backdrop-blur-sm hover:bg-white/20 transition-colors" aria-label={t.exitPager} onClick={() => setIndex(null)}>
          <XIcon size={24} className="drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]" />
        </button>
      </div>
      {isFlip ? (
        <>
          <button className={`absolute inset-y-0 left-0 w-1/3 z-30 select-none ${index === 0 ? "pointer-events-none" : ""}`} aria-label={t.previousPage} onClick={() => setIndex(Math.max(0, index - 1))}>
            <div className={`flex h-full items-center justify-start pl-2 transition-opacity ${index === 0 ? "opacity-15" : "opacity-40 hover:opacity-80"}`}>
              <ChevronLeft size={40} className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" />
            </div>
          </button>
          <button className={`absolute inset-y-0 right-0 w-1/3 z-30 select-none ${index === images.length - 1 ? "pointer-events-none" : ""}`} aria-label={t.nextPage} onClick={() => setIndex(Math.min(images.length - 1, index + 1))}>
            <div className={`flex h-full items-center justify-end pr-2 transition-opacity ${index === images.length - 1 ? "opacity-15" : "opacity-40 hover:opacity-80"}`}>
              <ChevronRight size={40} className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" />
            </div>
          </button>
          {/* Image at z-20 above background, below nav buttons at z-30.
              Single click center to exit, double-click to switch view mode.
              Long-press triggers iOS "Save to Photos". */}
          <div
            className="absolute inset-0 z-20 flex items-center justify-center"
            style={{ userSelect: "none", WebkitTouchCallout: "default" }}
            onClick={handleCenterClick}
          >
            {currentImage && <img src={currentImage.url} alt="" className="block max-h-full max-w-full object-contain" style={{ WebkitTouchCallout: "default" }} />}
          </div>
        </>
      ) : (
        <div
          ref={scrollRef}
          className="absolute inset-0 z-20 overflow-y-auto"
          style={{ WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", userSelect: "none" }}
          onClick={handleCenterClick}
        >
          {images.map((img) => (
            <div key={img.id} className="flex w-full flex-col items-center justify-center">
              <img src={img.url} alt="" className="block w-full h-auto" style={{ WebkitTouchCallout: "default" }} />
              {img.sourceUrl && (
                <a
                  href={img.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="my-2 max-w-[90vw] truncate rounded-md bg-black/30 px-3 py-1 text-xs text-white backdrop-blur-sm hover:bg-black/50 drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]"
                >
                  {t.source}: {img.sourceUrl}
                </a>
              )}
            </div>
          ))}
        </div>
      )}
      {/* Mode indicator toast */}
      {toast && (
        <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-1">
          <span
            className="text-4xl font-medium text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]"
            style={{ textShadow: "1px 0 0 rgba(0,0,0,0.5), -1px 0 0 rgba(0,0,0,0.5), 0 1px 0 rgba(0,0,0,0.5), 0 -1px 0 rgba(0,0,0,0.5)" }}
          >
            {typeof toast === "string" ? toast : toast.label}
          </span>
          {typeof toast !== "string" && toast.hint && (
            <span
              className="text-sm text-white/90 drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]"
              style={{ textShadow: "1px 0 0 rgba(0,0,0,0.4), -1px 0 0 rgba(0,0,0,0.4), 0 1px 0 rgba(0,0,0,0.4), 0 -1px 0 rgba(0,0,0,0.4)" }}
            >
              {toast.hint}
            </span>
          )}
        </div>
      )}
      {/* Page counter for scroll mode */}
      {!isFlip && images.length > 1 && showCounter && (
        <div className="pointer-events-none absolute bottom-4 left-4 z-30 select-none rounded-md bg-black/10 px-2 py-1.5 text-sm text-white backdrop-blur-sm">
          {activeScrollIndex + 1} / {images.length}
        </div>
      )}
      {isFlip && currentImage?.sourceUrl && (
        <a
          href={currentImage.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 max-w-[80vw] truncate rounded-md bg-black/30 px-3 py-1 text-xs text-white backdrop-blur-sm hover:bg-black/50 drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]"
        >
          {t.source}: {currentImage.sourceUrl}
        </a>
      )}
      <Link
        href="/"
        className="absolute bottom-6 right-6 z-40 flex items-center justify-center rounded-md bg-black/10 px-2 py-1.5 text-white backdrop-blur-sm hover:bg-white/20 transition-colors"
        aria-label={t.backToDirectory}
      >
        <House size={24} className="drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]" />
      </Link>
    </div>
  );
}