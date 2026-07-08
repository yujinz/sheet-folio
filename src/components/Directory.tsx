"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, Pencil, Plus, RotateCcw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import LocaleSwitch from "@/components/LocaleSwitch";
import TagPicker, { pickDefaultColor } from "@/components/TagPicker";
import { useLocale } from "@/lib/useLocale";
import type { Song, Tag, TagCategory } from "@/lib/types";
import { useSingleSelectFilter } from "@/lib/useSingleSelectFilter";

type SortKey = "title" | "difficulty" | "pitch" | "technique" | "rhythm" | "notes";

const categories: TagCategory[] = ["pitch", "technique", "rhythm"];

const STORAGE_KEY = "sheet-folio-directory-state";
const DIFFICULTY_LEVELS = [1, 2, 3, 4, 5] as const;

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
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Record<TagCategory, number[]>>({ pitch: [], technique: [], rhythm: [] });
  const difficultyFilter = useSingleSelectFilter<number>();
  const [editingTags, setEditingTags] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "difficulty", dir: "asc" });
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
      }
    } catch {}
  }, []);

  // Recalculate default color when tags are loaded
  useEffect(() => {
    if (tags.length === 0) return;
    setDefaultColor((prev) => pickDefaultColor(tags, prev));
  }, [tags]);

  // Save sort/query/filters to sessionStorage whenever they change (merging with existing data to preserve scrollY etc.)
  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    const existing = saved ? JSON.parse(saved) : {};
    const state = { ...existing, sort, query, filters, difficultyFilter: difficultyFilter.value };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [sort, query, filters, difficultyFilter.value]);

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
    const [pieceRows, tagRows] = await Promise.all([
      fetch("/api/pieces").then((res) => res.json()),
      fetch("/api/tags").then((res) => res.json())
    ]);
    setPieces(pieceRows);
    setTags(tagRows);
  }

  async function createPiece() {
    const res = await fetch("/api/pieces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        title: locale === "zh-CN" ? t.newPieceTitle : "",
        titleEn: locale === "en-US" ? t.newPieceTitle : ""
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
      body: JSON.stringify({ name: tag.name, nameEn: tag.nameEn, color: tag.color })
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

  const visible = useMemo(() => {
    const filtered = pieces.filter((piece) => {
      if (query) {
        const titleForSearch = locale === "en-US" ? (piece.titleEn || piece.title) : (piece.title || piece.titleEn);
        if (!titleForSearch.toLowerCase().includes(query.toLowerCase())) return false;
      }
      if (difficultyFilter.value !== null && difficultyFilter.value !== piece.difficulty) {
        return false;
      }
      return categories.every((category) =>
        filters[category].every((id) => piece.tags[category].some((tag) => tag.id === id))
      );
    });
    // When any filter is active, sort by title order instead of the current sort key.
    // This keeps filtered lists intuitive (e.g. filtering by difficulty = all same value).
    // TODO: When adding new single-select filters (useSingleSelectFilter), add them to the condition below.
    const hasActiveFilters = difficultyFilter.value !== null
      || filters.pitch.length > 0 || filters.technique.length > 0 || filters.rhythm.length > 0;
    if (hasActiveFilters) {
      return [...filtered].sort((a, b) => {
        const getTitle = (piece: Song) => locale === "en-US" ? (piece.titleEn || piece.title) : (piece.title || piece.titleEn);
        const result = getTitle(a).localeCompare(getTitle(b), locale, { numeric: true });
        return sort.dir === "asc" ? result : -result;
      });
    }
    return [...filtered].sort((a, b) => {
      const read = (piece: Song): string | number => {
        if (sort.key === "difficulty") return piece.difficulty;
        if (sort.key === "notes") return piece.notes;
        if (sort.key === "title") return piece.id;
        return piece.tags[sort.key].map((tag) => locale === "en-US" ? (tag.nameEn || tag.name) : tag.name).join(",");
      };
      const aVal = read(a);
      const bVal = read(b);
      const primary = typeof aVal === "number" && typeof bVal === "number"
        ? aVal - bVal
        : String(aVal).localeCompare(String(bVal), locale, { numeric: true });
      if (primary !== 0) return sort.dir === "asc" ? primary : -primary;
      // Secondary sort by title for tie-breaking — respects sort.dir
      const getTitle = (piece: Song) => locale === "en-US" ? (piece.titleEn || piece.title) : (piece.title || piece.titleEn);
      const titleResult = getTitle(a).localeCompare(getTitle(b), locale, { numeric: true });
      return sort.dir === "asc" ? titleResult : -titleResult;
    });
  }, [filters, locale, pieces, query, sort, difficultyFilter.value]);

  function sortBy(key: SortKey) {
    setSort((value) => ({ key, dir: value.key === key && value.dir === "asc" ? "desc" : "asc" }));
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

      <section className="px-4 py-4">
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
          <div className="flex items-center gap-1 ml-auto">
            <button className={`text-button !min-h-0 !h-auto !py-0.5 !px-2 ${(filters.pitch.length > 0 || filters.technique.length > 0 || filters.rhythm.length > 0 || difficultyFilter.value !== null) ? "primary-button" : ""}`} type="button" style={{ fontSize: 12 }} onClick={() => {
              setFilters({ pitch: [], technique: [], rhythm: [] });
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
          {categories.map((category) => (
            <TagPicker
              key={category}
              category={category}
              tags={tags.filter((tag) => tag.category === category)}
              selected={filters[category]}
              onChange={(ids) => setFilters((value) => ({ ...value, [category]: ids }))}
              onCreate={createTag}
              onDelete={deleteTag}
              onUpdate={updateTag}
              editingTags={editingTags}
              defaultColor={defaultColor}
              onDefaultColorChange={setDefaultColor}
            />
          ))}
        </div>
      </section>

      <div className="table-shell">
        <table className="song-table">
          <thead>
            <tr>
              <th style={{ width: 60 }}><button onClick={() => sortBy("difficulty")}>{t.difficulty} {sort.key === "difficulty" ? (sort.dir === "asc" ? <ArrowUp size={14} className="inline" /> : <ArrowDown size={14} className="inline" />) : <ArrowUpDown size={14} className="inline text-[var(--muted)]" />}</button></th>
              <th style={{ width: 200 }}><button onClick={() => sortBy("title")}>{t.title} {sort.key === "title" ? (sort.dir === "asc" ? <ArrowUp size={14} className="inline" /> : <ArrowDown size={14} className="inline" />) : <ArrowUpDown size={14} className="inline text-[var(--muted)]" />}</button></th>
              {categories.map((category) => <th key={category} style={{ width: 170 }}><button onClick={() => sortBy(category)}>{t[category]}</button></th>)}
              <th style={{ width: 170 }}><button onClick={() => sortBy("notes")}>{t.notes}</button></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((piece) => (
              <tr key={piece.id}>
                <td>
                  <select className="select tag-add-select" style={{ width: "3.5rem" }} value={piece.difficulty} onChange={(event) => updatePiece(piece, { difficulty: Number(event.target.value) })}>
                    {[1, 2, 3, 4, 5].map((score) => <option key={score}>{score}</option>)}
                  </select>
                </td>
                <td className="font-semibold" style={{ fontSize: 15 }}>
                  <Link href={`/piece/${piece.id}`}>{locale === "en-US" ? (piece.titleEn || piece.title) : (piece.title || piece.titleEn)}</Link>
                </td>
                {categories.map((category) => (
                  <td key={category}>
                    <TagPicker
                      compact
                      selectedOnly
                      category={category}
                      tags={tags.filter((tag) => tag.category === category)}
                      selected={piece.tags[category].map((tag) => tag.id)}
                      onCreate={createTag}
                      onChange={(ids) => updatePiece(piece, { tagIds: categories.flatMap((cat) => cat === category ? ids : piece.tags[cat].map((tag) => tag.id)) })}
                      defaultColor={defaultColor}
                      onDefaultColorChange={setDefaultColor}
                    />
                  </td>
                ))}
                <td><textarea className="textarea min-h-20" value={piece.notes} onChange={(event) => updatePiece(piece, { notes: event.target.value })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}