"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, Calendar, Heart, Pencil, Plus, RotateCcw, Search, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import LocaleSwitch from "@/components/LocaleSwitch";
import TagPicker, { pickDefaultColor } from "@/components/TagPicker";
import { useLocale } from "@/lib/useLocale";
import { categoryKey, canAddCategory } from "@/lib/category";
import type { CategoryEntry, Song, Tag, TagCategory } from "@/lib/types";
import { PITCH_CATEGORY_KEY } from "@/lib/types";
import { useSingleSelectFilter } from "@/lib/useSingleSelectFilter";

type UserCategory = { key: string; labelZh: string; labelAlt: string };

function categoryDisplayName(cat: UserCategory, locale: string): string {
  return locale === "en-US" ? cat.labelAlt : cat.labelZh;
}

function getCategoryLabel(categories: UserCategory[], key: string, locale: string): string {
  const found = categories.find((c) => c.key === key);
  return found ? categoryDisplayName(found, locale) : key;
}

type SortKey = "title" | "difficulty" | "pitch" | "technique" | "rhythm" | "notes" | "createdAt";

const STORAGE_KEY = "sheet-folio-directory-state";
const DIFFICULTY_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

function getFavorites(): number[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem("sheet-folio-favorites");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

const DIFFICULTY_COLORS = [
	"#ecc484", // 1  maple
  "#e5b86a", // 2  birch
  "#dba55e", // 3  pine
  "#c98e46", // 4  spruce
  "#c47a30", // 5  oak
  "#a8774b", // 6  teak
  "#8c5a3c", // 7  walnut
  "#6e422a", // 8  mahogany
  "#4a2a18", // 9  rosewood
  "#1a0e06", // 10 ebony
];

export default function Directory() {
  const { locale, t } = useLocale();
  const [pieces, setPieces] = useState<Song[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [query, setQuery] = useState(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.query === "string") return parsed.query;
      }
    } catch {}
    return "";
  });
  const [filters, setFilters] = useState<Record<string, number[]>>(() => ({}));
  const difficultyFilter = useSingleSelectFilter<number>();
  const [editingTags, setEditingTags] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "createdAt", dir: "desc" });
  const [titleSortDir, setTitleSortDir] = useState<"asc" | "desc">("asc");
  const [createdAtSortDir, setCreatedAtSortDir] = useState<"asc" | "desc">("desc");
  const [defaultColor, setDefaultColor] = useState("#9e6aba");

  useEffect(() => {
    void refresh();
  }, []);

  // Restore saved state from sessionStorage after hydration
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.query === "string") setQuery(parsed.query);
        if (parsed.filters) setFilters(parsed.filters);
        if (typeof parsed.difficultyFilter === "number") difficultyFilter.setValue(parsed.difficultyFilter);
        if (parsed.sort) setSort(parsed.sort);
        if (parsed.titleSortDir) setTitleSortDir(parsed.titleSortDir);
        if (parsed.createdAtSortDir) setCreatedAtSortDir(parsed.createdAtSortDir);
      }
    } catch {}
  }, []);

  const [singleSelectCategories, setSingleSelectCategories] = useState<Set<string>>(new Set());

  const [showScrollTop, setShowScrollTop] = useState(false);
  const [userCategories, setUserCategories] = useState<UserCategory[]>([]);
  /** Computed: ordered list of all category keys (from server labels + tags). */
  const allCategoryKeys = useMemo(() => {
    const keys = new Set(userCategories.map((c) => c.key));
    // Also include tag categories that don't have labels yet
    for (const tag of tags) {
      keys.add(tag.category);
    }
    return [...keys];
  }, [tags, userCategories]);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryNameZh, setNewCategoryNameZh] = useState("");
  const [newCategoryNameAlt, setNewCategoryNameAlt] = useState("");
  const [newCategorySingleSelect, setNewCategorySingleSelect] = useState(false);

  // Category rename state
  const [renamingCategory, setRenamingCategory] = useState<string | null>(null);
  const [renameZh, setRenameZh] = useState("");
  const [renameAlt, setRenameAlt] = useState("");
  const renameZhRef = useRef<HTMLInputElement>(null);
  const renameAltRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingCategory) {
      const uc = userCategories.find((c) => c.key === renamingCategory);
      if (uc) {
        setRenameZh(uc.labelZh);
        setRenameAlt(uc.labelAlt);
      } else {
        setRenameZh(renamingCategory);
        setRenameAlt(renamingCategory);
      }
      setTimeout(() => renameZhRef.current?.focus(), 50);
    }
  }, [renamingCategory]);

  // Restore userCategories from sessionStorage after mount (avoids hydration mismatch)
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.userCategories)) {
          setUserCategories(parsed.userCategories);
        }
        // Restore filters too
        if (parsed.filters) {
          setFilters(parsed.filters);
        }
      }
    } catch {}
  }, []);
  useEffect(() => {
    if (!editingTags) {
      setShowNewCategory(false);
      setNewCategoryNameZh("");
      setNewCategoryNameAlt("");
      setRenamingCategory(null);
    }
  }, [editingTags]);
  const newCategoryNameZhRef = useRef<HTMLInputElement>(null);
  const newCategoryNameAltRef = useRef<HTMLInputElement>(null);

  // Recalculate default color when tags are loaded
  useEffect(() => {
    if (tags.length === 0) return;
    setDefaultColor((prev) => pickDefaultColor(tags, prev));
  }, [tags]);

  // Save sort/query/filters to sessionStorage whenever they change (merging with existing data to preserve scrollY etc.)
  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    const existing = saved ? JSON.parse(saved) : {};
    const state = { ...existing, sort, query, filters, difficultyFilter: difficultyFilter.value, titleSortDir, createdAtSortDir, userCategories };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [sort, query, filters, difficultyFilter.value, titleSortDir, createdAtSortDir, userCategories]);

  // Save scroll position on pagehide (bfcache / browser close).
  // For SPA navigation, scrollY is flushed to sessionStorage by the onMouseDown
  // handler on piece links, which fires before Next.js scrolls to top.
  // We use an in-memory ref for tracking (not sessionStorage on every scroll)
  // to avoid Next.js's synthetic scroll-to-top during navigation overwriting
  // the correct value.
  const scrollYRef = useRef(0);

  useEffect(() => {
    const flush = () => {
      try {
        const saved = sessionStorage.getItem(STORAGE_KEY);
        const state = saved ? JSON.parse(saved) : {};
        state.scrollY = scrollYRef.current;
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {}
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  // Restore scroll position after pieces load.
  // useLayoutEffect fires synchronously after DOM mutations but before the
  // browser paints, so the page appears at the saved position immediately.
  useLayoutEffect(() => {
    if (pieces.length === 0) return;
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.scrollY === "number" && parsed.scrollY > 0) {
          window.scrollTo(0, parsed.scrollY);
        }
      }
    } catch {}
  }, [pieces]);

  async function refresh() {
    const [pieceRows, tagRows, ssRows, catLabelRows] = await Promise.all([
      fetch("/api/pieces").then((res) => res.json()),
      fetch("/api/tags").then((res) => res.json()),
      fetch("/api/single-select-categories").then((res) => res.json()),
      fetch("/api/categories").then((res) => res.json())
    ]);
    setPieces(pieceRows);
    setTags(tagRows);
    setSingleSelectCategories(new Set(ssRows as string[]));
    if (Array.isArray(catLabelRows)) {
      setUserCategories(catLabelRows.map((r: { key: string; name: string; nameAlt: string }) => ({
        key: r.key,
        labelZh: r.name || r.nameAlt,
        labelAlt: r.nameAlt || r.name
      })));
    }
  }

  async function createPiece() {
    const res = await fetch("/api/pieces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        title: locale === "zh-CN" ? t.newPieceTitle : "",
        titleAlt: locale === "en-US" ? t.newPieceTitle : ""
      })
    });
    if (!res.ok) {
      alert(`Error creating piece: ${res.status} ${res.statusText}`);
      return;
    }
    const row = await res.json();
    if (!row.id) {
      alert(`Error: no id returned. Response: ${JSON.stringify(row)}`);
      return;
    }
    location.href = `/piece/${row.id}`;
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
    // Rotate default color based on all tags including the new one
    setDefaultColor((prev) => pickDefaultColor([...tags, created], prev));
    return created;
  }

  async function deleteTag(tag: Tag) {
    await fetch(`/api/tags/${tag.id}`, { method: "DELETE" });
    await refresh();
  }

  async function updateTag(tag: Tag) {
    await fetch(`/api/tags/${tag.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: tag.name, nameAlt: tag.nameAlt, color: tag.color })
    });
    setTags((value) => value.map((t) => t.id === tag.id ? { ...t, ...tag } : t));
  }

  async function updatePiece(piece: Song, patch: Record<string, unknown>) {
    const updated = await fetch(`/api/pieces/${piece.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    }).then((res) => res.json());
    setPieces((rows) => rows.map((row) => (row.id === piece.id ? updated : row)));
  }

  // Track scroll position in-memory (ref) for show/hide of scroll-to-top button.
  // We deliberately do NOT write to sessionStorage here — Next.js's synthetic
  // scroll-to-top during navigation would overwrite the correct value.
  useEffect(() => {
    const onScroll = () => {
      setShowScrollTop(window.scrollY > window.innerHeight);
      scrollYRef.current = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /** Extra category keys from DB tags not yet in userCategories. */
  const extraCategoryKeys = useMemo(() => {
    const known = new Set(userCategories.map((c) => c.key));
    const keys = new Set<string>();
    for (const tag of tags) {
      if (!known.has(tag.category)) {
        keys.add(tag.category);
      }
    }
    return [...keys].sort();
  }, [tags, userCategories]);

  /** Lookup a user-created category by key. */
  function getUserCategory(key: string): UserCategory | undefined {
    return userCategories.find((c) => c.key === key);
  }

  /** Check whether a category key is the pitch category (has special color sorting). */
  function isPitchKey(key: string): boolean {
    return key === PITCH_CATEGORY_KEY;
  }

  // Ensure filters has entries for extra categories
  useEffect(() => {
    setFilters((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const key of extraCategoryKeys) {
        if (!(key in next)) {
          next[key] = [];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [extraCategoryKeys]);

  async function addCategory(zh: string, en: string) {
    const trimmedZh = zh.trim();
    const trimmedAlt = en.trim();
    const key = categoryKey(trimmedZh, trimmedAlt);
    if (!key) return;
    const keyCheck = canAddCategory(key, allCategoryKeys);
    if (!keyCheck.valid) {
      alert(keyCheck.reason!);
      return;
    }
    setUserCategories((prev) => [...prev, { key, labelZh: trimmedZh || trimmedAlt, labelAlt: trimmedAlt || trimmedZh }]);
    setFilters((prev) => ({ ...prev, [key]: [] }));
    const catRes = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, name: trimmedZh, nameAlt: trimmedAlt })
    });
    if (!catRes.ok) {
      const err = await catRes.json().catch(() => ({}));
      alert(err.error || "Failed to save category");
      return;
    }
    if (newCategorySingleSelect) {
      fetch("/api/single-select-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: key })
      });
      setSingleSelectCategories((prev) => new Set([...prev, key]));
    }
    setNewCategoryNameZh("");
    setNewCategoryNameAlt("");
    setNewCategorySingleSelect(false);
    setShowNewCategory(false);
  }

  async function removeCategory(key: string) {
    const catTags = tags.filter((t) => t.category === key);
    const tagCount = catTags.length;
    const label = getUserCategory(key)?.labelAlt || key;
    const msg = tagCount > 0
      ? `Delete category "${label}" and its ${tagCount} tag${tagCount > 1 ? "s" : ""}? Tags will be removed from all pieces.`
      : `Remove "${label}" from the filter area?`;
    if (!confirm(msg)) return;
    if (tagCount > 0) {
      await fetch(`/api/tags?category=${encodeURIComponent(key)}`, { method: "DELETE" });
    }
    setUserCategories((prev) => prev.filter((c) => c.key !== key));
    setFilters((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    const delRes = await fetch(`/api/categories?key=${encodeURIComponent(key)}`, { method: "DELETE" });
    if (!delRes.ok) {
      const err = await delRes.json().catch(() => ({}));
      alert(err.error || "Failed to delete category labels");
    }
    await refresh();
  }

  async function renameCategory(oldKey: string, zh: string, en: string) {
    const trimmedZh = zh.trim();
    const trimmedAlt = en.trim();
    if (!trimmedZh && !trimmedAlt) return;
    const newKey = (trimmedAlt || trimmedZh).toLowerCase().replace(/\s+/g, "-");
    if (!newKey || newKey === oldKey) {
      // Labels-only update
      setUserCategories((prev) => {
        const existing = prev.findIndex((c) => c.key === oldKey);
        const updated = { key: oldKey, labelZh: trimmedZh || trimmedAlt, labelAlt: trimmedAlt || trimmedZh };
        if (existing >= 0) {
          return prev.map((c) => c.key === oldKey ? updated : c);
        }
        return [...prev, updated];
      });
      const patchRes = await fetch("/api/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: oldKey, name: trimmedZh, nameAlt: trimmedAlt })
      });
      if (!patchRes.ok) {
        const err = await patchRes.json().catch(() => ({}));
        alert(err.error || "Failed to save category labels");
      }
      setRenamingCategory(null);
      return;
    }
    if (allCategoryKeys.includes(newKey)) {
      alert("A category with this name already exists.");
      return;
    }
    // Key changed — move all tags in DB to new key
    await fetch("/api/tags", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldCategory: oldKey, newCategory: newKey })
    });
    // Update filters state
    setFilters((prev) => {
      const next = { ...prev };
      next[newKey] = next[oldKey] || [];
      if (oldKey !== newKey) delete next[oldKey];
      return next;
    });
    // Update userCategories
    setUserCategories((prev) => {
      const existing = prev.findIndex((c) => c.key === oldKey);
      const updated = { key: newKey, labelZh: trimmedZh || trimmedAlt, labelAlt: trimmedAlt || trimmedZh };
      if (existing >= 0) {
        return prev.map((c) => c.key === oldKey ? updated : c);
      }
      return [...prev, updated];
    });
    // Update server: rename key preserving sortOrder
    const renameRes = await fetch("/api/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: newKey, oldKey, name: trimmedZh, nameAlt: trimmedAlt })
    });
    if (!renameRes.ok) {
      const err = await renameRes.json().catch(() => ({}));
      alert(err.error || "Failed to rename category");
    }
    setRenamingCategory(null);
    await refresh();
  }

  const availableDifficulties = useMemo(() => {
    const used = new Set(pieces.map((p) => p.difficulty));
    return DIFFICULTY_LEVELS.filter((level) => used.has(level));
  }, [pieces]);

  const visible = useMemo(() => {
    const filtered = pieces.filter((piece) => {
      if (query) {
        const titleForSearch = locale === "en-US" ? (piece.titleAlt || piece.title) : (piece.title || piece.titleAlt);
        if (!titleForSearch.toLowerCase().includes(query.toLowerCase())) return false;
      }
      if (difficultyFilter.value !== null && difficultyFilter.value !== piece.difficulty) {
        return false;
      }
      const allFilterCats = Object.keys(filters);
      return allFilterCats.every((category) =>
        filters[category]!.length === 0 || (filters[category]?.every((id) => piece.tags[category]?.some((tag) => tag.id === id)) ?? true)
      );
    });
    return [...filtered].sort((a, b) => {
      // When sorting by title, favorites come first (primary sort)
      if (sort.key === "title") {
        const isFavA = getFavorites().includes(a.id) ? 0 : 1;
        const isFavB = getFavorites().includes(b.id) ? 0 : 1;
        if (isFavA !== isFavB) return isFavA - isFavB;
        const getTitle = (piece: Song) => locale === "en-US" ? (piece.titleAlt || piece.title) : (piece.title || piece.titleAlt);
        const titleResult = getTitle(a).localeCompare(getTitle(b), locale, { numeric: true });
        return titleSortDir === "asc" ? titleResult : -titleResult;
      }
      if (sort.key === "createdAt") {
        const result = a.createdAt.localeCompare(b.createdAt);
        if (result !== 0) return createdAtSortDir === "asc" ? result : -result;
        // Tiebreaker: piece id (same as creation order)
        return createdAtSortDir === "asc" ? a.id - b.id : b.id - a.id;
      }
      const read = (piece: Song): string | number => {
        if (sort.key === "difficulty") return piece.difficulty;
        if (sort.key === "notes") return piece.notes;
        return piece.tags[sort.key as TagCategory].map((tag) => locale === "en-US" ? (tag.nameAlt || tag.name) : (tag.name || tag.nameAlt)).join(",");
      };
      const aVal = read(a);
      const bVal = read(b);
      const primary = typeof aVal === "number" && typeof bVal === "number"
        ? aVal - bVal
        : String(aVal).localeCompare(String(bVal), locale, { numeric: true });
      if (primary !== 0) return sort.dir === "asc" ? primary : -primary;
      // Secondary: favorites within the same sort-key value
      const isFavA = getFavorites().includes(a.id) ? 0 : 1;
      const isFavB = getFavorites().includes(b.id) ? 0 : 1;
      if (isFavA !== isFavB) return isFavA - isFavB;
      // Tertiary sort by title using user's last title sort direction
      const getTitle = (piece: Song) => locale === "en-US" ? (piece.titleAlt || piece.title) : (piece.title || piece.titleAlt);
      const titleResult = getTitle(a).localeCompare(getTitle(b), locale, { numeric: true });
      return titleSortDir === "asc" ? titleResult : -titleResult;
    });
  }, [filters, locale, pieces, query, sort, titleSortDir, createdAtSortDir, difficultyFilter.value]);

  function sortBy(key: SortKey) {
    setSort((value) => {
      const dir = value.key === key && value.dir === "asc" ? "desc" : "asc";
      if (key === "title") setTitleSortDir(dir);
      if (key === "createdAt") setCreatedAtSortDir(dir);
      return { key, dir };
    });
  }

  return (
    <main className="sheet-page">
      <header className="flex flex-col sm:flex-row items-center gap-3 border-b border-[var(--line)] bg-white px-4 py-3">
        <div className="flex items-center justify-end gap-3 order-1 sm:order-last sm:ml-auto w-full sm:w-auto">
          <span className="text-[var(--muted)]" style={{ fontSize: "14px" }}>{t.appTitle}</span>
          <span style={{ fontSize: "14px" }}><LocaleSwitch /></span>
        </div>
        <div className="flex items-center gap-3 flex-1 order-2 sm:order-first w-full sm:w-auto">
          <button className="text-button primary-button shrink-0" type="button" style={{ fontSize: "14px" }} onClick={createPiece}>
            <Plus size={16} /> {t.addPiece}
          </button>
          <div className="relative min-w-20 sm:min-w-48 flex-1">
            <Search className="absolute left-3 top-2.5 text-[var(--muted)]" size={16} />
            <input
              className="input"
              style={{ paddingLeft: 36, fontSize: "14px" }}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t.searchTitle}
            />
          </div>
        </div>
      </header>

      <div className="table-shell">
        <section className="relative px-4 py-4">
        <div className="mb-3 flex flex-col sm:flex-row sm:flex-wrap items-start justify-between gap-3 sm:gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5 order-2 sm:order-first">
          <span className="text-xs font-semibold text-[var(--foreground)] shrink-0 w-[4.5rem]">{t.difficulty}</span>
          {availableDifficulties.map((level) => {
            const isActive = difficultyFilter.value === level;
            const color = DIFFICULTY_COLORS[level - 1];
            return (
              <button
                key={level}
                className="difficulty-pill"
                style={{
                  background: color,
                  opacity: isActive ? 1 : 0.35,
                }}
                onClick={() => difficultyFilter.toggle(level)}
                aria-pressed={isActive}
              >
                {level}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1 order-1 sm:order-last sm:ml-auto self-end sm:self-auto">
          <button className={`text-button !min-h-0 !h-auto !py-0.5 !px-2 ${(Object.values(filters).some((ids) => ids.length > 0) || difficultyFilter.value !== null) ? "primary-button" : ""}`} type="button" style={{ fontSize: 12 }} onClick={() => {
            setFilters(Object.fromEntries(Object.keys(filters).map((k) => [k, []])));
            difficultyFilter.reset();
          }}>
            <RotateCcw size={12} /> {t.resetFilters}
          </button>
          <button className={`text-button !min-h-0 !h-auto !py-0.5 !px-2 ${editingTags ? "primary-button" : ""}`} type="button" style={{ fontSize: 12 }} onClick={() => setEditingTags((value) => !value)}>
            <Pencil size={12} /> {editingTags ? t.doneEditingTags : t.editTags}
          </button>
        </div>
      </div>
      <div className="grid gap-2 lg:grid-cols-3">
          {allCategoryKeys.map((category) => {
            const userCat = userCategories.find((c) => c.key === category);
            return (
            <div key={category}>
              {editingTags && renamingCategory === category ? (
                <div className="flex flex-wrap items-center gap-1 p-1">
                  <input
                    ref={renameZhRef}
                    className="input"
                    style={{ width: "7rem", fontSize: "12px" }}
                    placeholder={t.categoryNameZh}
                    value={renameZh}
                    onChange={(e) => setRenameZh(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") renameAltRef.current?.focus();
                      if (e.key === "Escape") setRenamingCategory(null);
                    }}
                  />
                  <input
                    ref={renameAltRef}
                    className="input"
                    style={{ width: "7rem", fontSize: "12px" }}
                    placeholder={t.categoryNameEn}
                    value={renameAlt}
                    onChange={(e) => setRenameAlt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { renameCategory(category, renameZh, renameAlt); }
                      if (e.key === "Escape") setRenamingCategory(null);
                    }}
                  />
                  <button className="text-button primary-button" type="button" style={{ fontSize: "12px" }} onClick={() => renameCategory(category, renameZh, renameAlt)}>{t.save}</button>
                  <button className="text-button" type="button" style={{ fontSize: "12px" }} onClick={() => setRenamingCategory(null)}>{t.cancel}</button>
                </div>
              ) : (
                <TagPicker
                  category={category}
                  isPitchCategory={isPitchKey(category)}
                  label={userCat ? categoryDisplayName(userCat, locale) : getCategoryLabel(userCategories, category, locale)}
                  tags={tags.filter((tag) => tag.category === category)}
                  selected={filters[category] ?? []}
                  onChange={(ids) => setFilters((value) => ({ ...value, [category]: ids }))}
                  onCreate={createTag}
                  onDelete={deleteTag}
                  onUpdate={updateTag}
                  editingTags={editingTags}
                  singleSelect={singleSelectCategories.has(category)}
                  defaultColor={defaultColor}
                  onDefaultColorChange={setDefaultColor}
                  onRenameCategory={() => setRenamingCategory(category)}
                  onDeleteCategory={() => removeCategory(category)}
                />
              )}
            </div>
          );}
        )}
        </div>
          {editingTags && (
          <div className="mt-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-semibold text-[var(--foreground)]">{t.newCategory}</span>
                <button
                  className="icon-button"
                  style={{ width: 24, height: 24, minWidth: 24, minHeight: 24 }}
                  type="button"
                  title="New category"
                  onClick={() => {
                    setShowNewCategory(true);
                    setNewCategoryNameZh("");
                    setNewCategoryNameAlt("");
                    setTimeout(() => newCategoryNameZhRef.current?.focus(), 50);
                  }}
                >
                  <Plus size={14} />
                </button>
            </div>
            {showNewCategory && (
              <div className="mb-2 flex items-center gap-1">
                <input
                  ref={newCategoryNameZhRef}
                  className="input"
                  style={{ width: "8rem", fontSize: "12px" }}
                  placeholder={t.categoryNameZh}
                  value={newCategoryNameZh}
                  onChange={(e) => setNewCategoryNameZh(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") newCategoryNameAltRef.current?.focus();
                    if (e.key === "Escape") { setShowNewCategory(false); setNewCategoryNameZh(""); setNewCategoryNameAlt(""); }
                  }}
                />
                <input
                  ref={newCategoryNameAltRef}
                  className="input"
                  style={{ width: "8rem", fontSize: "12px" }}
                  placeholder={t.categoryNameEn}
                  value={newCategoryNameAlt}
                  onChange={(e) => setNewCategoryNameAlt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addCategory(newCategoryNameZh, newCategoryNameAlt);
                    if (e.key === "Escape") { setShowNewCategory(false); setNewCategoryNameZh(""); setNewCategoryNameAlt(""); }
                  }}
                  onBlur={() => {
                    if (!newCategoryNameZh.trim() && !newCategoryNameAlt.trim()) setShowNewCategory(false);
                  }}
                />
                <label className="inline-flex items-center gap-1 cursor-pointer" style={{ fontSize: "11px" }}>
                  <div
                    className={`relative h-4 w-7 rounded-full transition-colors ${newCategorySingleSelect ? 'bg-[var(--accent)]' : 'bg-gray-300'}`}
                    onClick={() => setNewCategorySingleSelect((v) => !v)}
                  >
                    <div
                      className={`absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${newCategorySingleSelect ? 'translate-x-3' : ''}`}
                    />
                  </div>
                  <span className="text-[var(--muted)] select-none">{t.single}</span>
                </label>
                <button
                  className="text-button primary-button"
                  type="button"
                  style={{ fontSize: "13px" }}
                  onClick={() => addCategory(newCategoryNameZh, newCategoryNameAlt)}
                >
                  <Plus size={14} /> {t.add}
                </button>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => { setShowNewCategory(false); setNewCategoryNameZh(""); setNewCategoryNameAlt(""); setNewCategorySingleSelect(false); }}
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
          )}
        </section>
        <table className="song-table">
          <thead>
            <tr>
              <th className="sticky-col-first" style={{ width: 60 }}><button onClick={() => sortBy("difficulty")}>{t.difficulty} {sort.key === "difficulty" ? (sort.dir === "asc" ? <ArrowUp size={14} className="inline" /> : <ArrowDown size={14} className="inline" />) : <ArrowUpDown size={14} className="inline text-[var(--muted)]" />}</button></th>
              <th className="sticky-col-second" style={{ width: 200 }}>
                <div className="flex items-center justify-between">
                  <button onClick={() => sortBy("title")}>
                    {t.title} {sort.key === "title" ? (sort.dir === "asc" ? <ArrowUp size={14} className="inline" /> : <ArrowDown size={14} className="inline" />) : <ArrowUpDown size={14} className="inline text-[var(--muted)]" />}
                  </button>
                  <button className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] flex items-center gap-0.5" onClick={() => sortBy("createdAt")}>
                    <Calendar size={12} /> {sort.key === "createdAt" ? (sort.dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} />}
                  </button>
                </div>
              </th>
              {allCategoryKeys.map((key) => <th key={key} style={{ width: 170 }}>{getCategoryLabel(userCategories, key, locale)}</th>)}
              <th style={{ width: 170 }}><button onClick={() => sortBy("notes")}>{t.notes}</button></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((piece) => {
              function buildTagIds(category: string, ids: number[]) {
                return allCategoryKeys.flatMap((cat) =>
                  cat === category ? ids : (piece.tags[cat]?.map((tag) => tag.id) ?? [])
                );
              }
              return (
              <tr key={piece.id}>
                <td className="sticky-col-first">
                  <select className="select tag-add-select" style={{ width: "3.5rem" }} value={piece.difficulty} onChange={(event) => updatePiece(piece, { difficulty: Number(event.target.value) })}>
                    {DIFFICULTY_LEVELS.map((score) => <option key={score}>{score}</option>)}
                  </select>
                </td>
                <td className="sticky-col-second font-semibold" style={{ fontSize: 15 }}>
                  <span className="inline-flex items-center gap-1">
                    {getFavorites().includes(piece.id) && <Heart size={13} fill="var(--accent)" style={{ color: "var(--accent)" }} />}
                    <Link
                      href={`/piece/${piece.id}`}
                      onMouseDown={() => {
                        // Flush in-memory scrollY to sessionStorage before Next.js
                        // processes the click and scrolls to top for the new page.
                        try {
                          const saved = sessionStorage.getItem(STORAGE_KEY);
                          const state = saved ? JSON.parse(saved) : {};
                          state.scrollY = scrollYRef.current;
                          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
                        } catch {}
                      }}
                    >{locale === "en-US" ? (piece.titleAlt || piece.title) : (piece.title || piece.titleAlt)}</Link>
                  </span>
                </td>
                {allCategoryKeys.map((category) => (
                  <td key={category}>
                    <TagPicker
                      compact
                      selectedOnly
                      isPitchCategory={isPitchKey(category)}
                      singleSelect={singleSelectCategories.has(category)}
                      category={category}
                      tags={tags.filter((tag) => tag.category === category)}
                      selected={piece.tags[category]?.map((tag) => tag.id) ?? []}
                      onCreate={createTag}
                      onChange={(ids) => updatePiece(piece, { tagIds: buildTagIds(category, ids) })}
                      defaultColor={defaultColor}
                      onDefaultColorChange={setDefaultColor}
                    />
                  </td>
                ))}
                <td><textarea className="textarea min-h-20" value={piece.notes} onChange={(event) => updatePiece(piece, { notes: event.target.value })} /></td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showScrollTop && (
        <button
          className="fixed bottom-4 right-4 z-30 icon-button bg-white/80 backdrop-blur-sm shadow-md hover:bg-white"
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Scroll to top"
        >
          <ArrowUp size={16} />
        </button>
      )}
    </main>
  );
}