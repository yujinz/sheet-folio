"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, Heart, Pencil, Plus, RotateCcw, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import LocaleSwitch from "@/components/LocaleSwitch";
import TagPicker, { pickDefaultColor } from "@/components/TagPicker";
import { useLocale } from "@/lib/useLocale";
import { messages } from "@/lib/i18n";
import { CORE_CATEGORIES } from "@/lib/types";
import { categoryKey, canAddCategory, isCoreCategoryLabel } from "@/lib/category";
import type { Song, Tag, TagCategory } from "@/lib/types";
import { useSingleSelectFilter } from "@/lib/useSingleSelectFilter";

type UserCategory = { key: string; labelZh: string; labelAlt: string };

function categoryDisplayName(cat: UserCategory, locale: string): string {
  return locale === "en-US" ? cat.labelAlt : cat.labelZh;
}

function getCategoryLabel(categories: UserCategory[], key: string, locale: string): string {
  const found = categories.find((c) => c.key === key);
  return found ? categoryDisplayName(found, locale) : key;
}

type SortKey = "title" | "difficulty" | "pitch" | "technique" | "rhythm" | "notes";

const categories = [...CORE_CATEGORIES];

const STORAGE_KEY = "sheet-folio-directory-state";
const DIFFICULTY_LEVELS = [1, 2, 3, 4, 5] as const;

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
  const [filters, setFilters] = useState<Record<string, number[]>>(
    () => Object.fromEntries(CORE_CATEGORIES.map((c) => [c, []]))
  );
  const difficultyFilter = useSingleSelectFilter<number>();
  const [editingTags, setEditingTags] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "difficulty", dir: "asc" });
  const [titleSortDir, setTitleSortDir] = useState<"asc" | "desc">("asc");
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
      }
    } catch {}
  }, []);

  const [singleSelectCategories, setSingleSelectCategories] = useState<Set<string>>(new Set());

  const [userCategories, setUserCategories] = useState<UserCategory[]>([]);
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
  const [hiddenCoreCategories, setHiddenCoreCategories] = useState<string[]>([]);

  useEffect(() => {
    if (renamingCategory) {
      const uc = userCategories.find((c) => c.key === renamingCategory);
      if (uc) {
        setRenameZh(uc.labelZh);
        setRenameAlt(uc.labelAlt);
      } else {
        // Core category — use bilingual i18n labels as defaults
        const zhLabels = messages["zh-CN"] as Record<string, string>;
        const altLabels = messages["en-US"] as Record<string, string>;
        setRenameZh(zhLabels[renamingCategory] || renamingCategory);
        setRenameAlt(altLabels[renamingCategory] || renamingCategory);
      }
      setTimeout(() => renameZhRef.current?.focus(), 50);
    }
  }, [renamingCategory]);

  // Restore userCategories and filters from sessionStorage after mount (avoids hydration mismatch)
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.userCategories)) {
          setUserCategories(parsed.userCategories);
        }
        if (Array.isArray(parsed.hiddenCoreCategories)) {
          setHiddenCoreCategories(parsed.hiddenCoreCategories);
        }
        // Restore filters too, in case extra categories were previously saved
        if (parsed.filters) {
          const hasExtras = Object.keys(parsed.filters).some((k) => !CORE_CATEGORIES.includes(k as typeof CORE_CATEGORIES[number]));
          if (hasExtras) {
            setFilters(parsed.filters);
          }
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
    const state = { ...existing, sort, query, filters, difficultyFilter: difficultyFilter.value, titleSortDir, userCategories, hiddenCoreCategories };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [sort, query, filters, difficultyFilter.value, titleSortDir, userCategories, hiddenCoreCategories]);

  // Save scroll position on unmount (SPA navigation) and on pagehide (bfcache/unload)
  useEffect(() => {
    const saveScroll = () => {
      try {
        const saved = sessionStorage.getItem(STORAGE_KEY);
        const state = saved ? JSON.parse(saved) : {};
        state.scrollY = window.scrollY;
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {}
    };
    window.addEventListener("pagehide", saveScroll);
    return () => {
      window.removeEventListener("pagehide", saveScroll);
      saveScroll(); // Save on unmount (link click navigation)
    };
  }, []);

  // Restore scroll position after data loads
  useEffect(() => {
    if (pieces.length === 0) return;
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.scrollY === "number") {
          requestAnimationFrame(() => {
            window.scrollTo(0, parsed.scrollY);
          });
        }
      }
    } catch {}
  }, [pieces]);

  async function refresh() {
    const [pieceRows, tagRows, ssRows] = await Promise.all([
      fetch("/api/pieces").then((res) => res.json()),
      fetch("/api/tags").then((res) => res.json()),
      fetch("/api/single-select-categories").then((res) => res.json())
    ]);
    setPieces(pieceRows);
    setTags(tagRows);
    setSingleSelectCategories(new Set(ssRows as string[]));
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

  /** All extra category keys (from user-created categories + auto-detected from DB tags). */
  const extraCategoryKeys = useMemo(() => {
    const keys = new Set(userCategories.map((c) => c.key));
    for (const tag of tags) {
      if (!CORE_CATEGORIES.includes(tag.category as typeof CORE_CATEGORIES[number])) {
        keys.add(tag.category);
      }
    }
    return [...keys].sort();
  }, [tags, userCategories]);

  /** Lookup a user-created category by key. */
  function getUserCategory(key: string): UserCategory | undefined {
    return userCategories.find((c) => c.key === key);
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

  function addCategory(zh: string, en: string) {
    const trimmedZh = zh.trim();
    const trimmedAlt = en.trim();
    const key = categoryKey(trimmedZh, trimmedAlt);
    if (!key) return;
    const keyCheck = canAddCategory(key, extraCategoryKeys);
    if (!keyCheck.valid) {
      alert(keyCheck.reason!);
      return;
    }
    if (isCoreCategoryLabel(trimmedZh) || isCoreCategoryLabel(trimmedAlt)) {
      alert("This name matches a built-in category. Use a different name.");
      return;
    }
    setUserCategories((prev) => [...prev, { key, labelZh: trimmedZh || trimmedAlt, labelAlt: trimmedAlt || trimmedZh }]);
    setFilters((prev) => ({ ...prev, [key]: [] }));
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
    await refresh();
  }

  async function renameCategory(oldKey: string, zh: string, en: string) {
    const isCore = CORE_CATEGORIES.includes(oldKey as typeof CORE_CATEGORIES[number]);
    const trimmedZh = zh.trim();
    const trimmedAlt = en.trim();
    if (!trimmedZh && !trimmedAlt) return;
    // For core categories, rename the key itself so it becomes a custom category
    const newKey = (trimmedAlt || trimmedZh).toLowerCase().replace(/\s+/g, "-");
    if (!newKey || newKey === oldKey) {
      // Update labels for any category (core or custom)
      setUserCategories((prev) => {
        const existing = prev.findIndex((c) => c.key === oldKey);
        const updated = { key: oldKey, labelZh: trimmedZh || trimmedAlt, labelAlt: trimmedAlt || trimmedZh };
        if (existing >= 0) {
          return prev.map((c) => c.key === oldKey ? updated : c);
        }
        return [...prev, updated];
      });
      setRenamingCategory(null);
      return;
    }
    if (CORE_CATEGORIES.includes(newKey as typeof CORE_CATEGORIES[number])) {
      // Allow if the core category was previously renamed away (hidden)
      if (!hiddenCoreCategories.includes(newKey)) {
        alert("This name conflicts with a built-in category.");
        return;
      }
    }
    if (extraCategoryKeys.includes(newKey) && newKey !== oldKey) {
      alert("A category with this name already exists.");
      return;
    }
    // Update DB: move all tags from oldKey to newKey
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
    const restoringCore = (CORE_CATEGORIES as readonly string[]).includes(newKey);
    if (restoringCore) {
      // Renaming back to a built-in category — remove the old userCategory entry and unhide
      setUserCategories((prev) => prev.filter((c) => c.key !== oldKey));
      setHiddenCoreCategories((prev) => prev.filter((k) => k !== newKey));
    } else if (!isCore) {
      setUserCategories((prev) => prev.map((c) => c.key === oldKey ? { key: newKey, labelZh: trimmedZh || trimmedAlt, labelAlt: trimmedAlt || trimmedZh } : c));
    } else {
      setUserCategories((prev) => [...prev, { key: newKey, labelZh: trimmedZh || trimmedAlt, labelAlt: trimmedAlt || trimmedZh }]);
      setHiddenCoreCategories((prev) => [...prev, oldKey]);
    }
    setRenamingCategory(null);
    await refresh();
  }

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
  }, [filters, locale, pieces, query, sort, titleSortDir, difficultyFilter.value]);

  function sortBy(key: SortKey) {
    setSort((value) => {
      const dir = value.key === key && value.dir === "asc" ? "desc" : "asc";
      if (key === "title") setTitleSortDir(dir);
      return { key, dir };
    });
  }

  return (
    <main className="sheet-page">
      <header className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] bg-white px-4 py-3">
        <button className="text-button primary-button shrink-0" type="button" style={{ fontSize: "14px" }} onClick={createPiece}>
          <Plus size={16} /> {t.addPiece}
        </button>
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-3 top-2.5 text-[var(--muted)]" size={16} />
          <input
            className="input"
            style={{ paddingLeft: 36, fontSize: "14px" }}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.searchTitle}
          />
        </div>
        <span className="text-[var(--muted)]" style={{ fontSize: "14px" }}>{t.appTitle}</span>
        <span style={{ fontSize: "14px" }}><LocaleSwitch /></span>
      </header>

      <section className="relative px-4 py-4">
        <div className="absolute top-3 right-4 -mt-2 flex items-center gap-1">
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
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-[var(--foreground)] shrink-0 w-[4.5rem]">{t.difficulty}</span>
          {DIFFICULTY_LEVELS.map((level) => {
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
        <div className="grid gap-2 lg:grid-cols-3">
          {[...categories.filter((cat) => !hiddenCoreCategories.includes(cat)), ...extraCategoryKeys].map((category) => {
            const isCore = CORE_CATEGORIES.includes(category as typeof CORE_CATEGORIES[number]);
            const userCat = isCore ? userCategories.find((c) => c.key === category) : undefined;
            return (
            <div key={category}>
              {editingTags && renamingCategory === category ? (
                <div className="flex flex-wrap items-center gap-1 p-1">
                  <input
                    ref={renameZhRef}
                    className="input"
                    style={{ width: "7rem", fontSize: "12px" }}
                    placeholder="分类名称 (中文)"
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
                    placeholder="Category (English)"
                    value={renameAlt}
                    onChange={(e) => setRenameAlt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { renameCategory(category, renameZh, renameAlt); }
                      if (e.key === "Escape") setRenamingCategory(null);
                    }}
                  />
                  <button className="text-button primary-button" type="button" style={{ fontSize: "12px" }} onClick={() => renameCategory(category, renameZh, renameAlt)}>{locale === "zh-CN" ? "保存" : "Save"}</button>
                  <button className="text-button" type="button" style={{ fontSize: "12px" }} onClick={() => setRenamingCategory(null)}>{locale === "zh-CN" ? "取消" : "Cancel"}</button>
                </div>
              ) : (
                <TagPicker
                  category={category}
                  label={userCat ? categoryDisplayName(userCat, locale) : (isCore ? undefined : getCategoryLabel(userCategories, category, locale))}
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
                  onDeleteCategory={isCore ? undefined : () => removeCategory(category)}
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
                  placeholder="分类名称 (中文)"
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
                  placeholder="Category name (English)"
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
                  <Plus size={14} /> Add
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

      <div className="table-shell">
        <table className="song-table">
          <thead>
            <tr>
              <th style={{ width: 60 }}><button onClick={() => sortBy("difficulty")}>{t.difficulty} {sort.key === "difficulty" ? (sort.dir === "asc" ? <ArrowUp size={14} className="inline" /> : <ArrowDown size={14} className="inline" />) : <ArrowUpDown size={14} className="inline text-[var(--muted)]" />}</button></th>
              <th style={{ width: 200 }}><button onClick={() => sortBy("title")}>{t.title} {sort.key === "title" ? (sort.dir === "asc" ? <ArrowUp size={14} className="inline" /> : <ArrowDown size={14} className="inline" />) : <ArrowUpDown size={14} className="inline text-[var(--muted)]" />}</button></th>
              {categories.map((category) => <th key={category} style={{ width: 170 }}><button onClick={() => sortBy(category)}>{t[category]}</button></th>)}
              {extraCategoryKeys.map((key) => <th key={key} style={{ width: 170 }}>{getCategoryLabel(userCategories, key, locale)}</th>)}
              <th style={{ width: 170 }}><button onClick={() => sortBy("notes")}>{t.notes}</button></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((piece) => {
              function buildTagIds(category: string, ids: number[]) {
                return [...categories, ...extraCategoryKeys].flatMap((cat) =>
                  cat === category ? ids : (piece.tags[cat]?.map((tag) => tag.id) ?? [])
                );
              }
              return (
              <tr key={piece.id}>
                <td>
                  <select className="select tag-add-select" style={{ width: "3.5rem" }} value={piece.difficulty} onChange={(event) => updatePiece(piece, { difficulty: Number(event.target.value) })}>
                    {[1, 2, 3, 4, 5].map((score) => <option key={score}>{score}</option>)}
                  </select>
                </td>
                <td className="font-semibold" style={{ fontSize: 15 }}>
                  <span className="inline-flex items-center gap-1">
                    {getFavorites().includes(piece.id) && <Heart size={13} fill="var(--accent)" style={{ color: "var(--accent)" }} />}
                    <Link href={`/piece/${piece.id}`}>{locale === "en-US" ? (piece.titleAlt || piece.title) : (piece.title || piece.titleAlt)}</Link>
                  </span>
                </td>
                {categories.map((category) => (
                  <td key={category}>
                    <TagPicker
                      compact
                      selectedOnly
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
                {extraCategoryKeys.map((key) => (
                  <td key={key}>
                    <TagPicker
                      compact
                      selectedOnly
                      singleSelect={singleSelectCategories.has(key)}
                      category={key}
                      label={getCategoryLabel(userCategories, key, locale)}
                      tags={tags.filter((tag) => tag.category === key)}
                      selected={piece.tags[key]?.map((tag) => tag.id) ?? []}
                      onCreate={createTag}
                      onChange={(ids) => updatePiece(piece, { tagIds: buildTagIds(key, ids) })}
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
    </main>
  );
}