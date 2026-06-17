"use client";

import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, Pencil, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import LocaleSwitch from "@/components/LocaleSwitch";
import TagPicker from "@/components/TagPicker";
import { useLocale } from "@/lib/useLocale";
import type { Song, Tag, TagCategory } from "@/lib/types";

type SortKey = "title" | "difficulty" | "pitch" | "technique" | "rhythm" | "notes";

const categories: TagCategory[] = ["pitch", "technique", "rhythm"];

export default function Directory() {
  const { locale, t } = useLocale();
  const [pieces, setPieces] = useState<Song[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Record<TagCategory, number[]>>({ pitch: [], technique: [], rhythm: [] });
  const [editingTags, setEditingTags] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "difficulty", dir: "asc" });

  useEffect(() => {
    void refresh();
  }, []);

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
    const created = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tag)
    }).then((res) => res.json());
    setTags((value) => [...value.filter((item) => item.id !== created.id), created]);
    return created;
  }

  async function deleteTag(tag: Tag) {
    await fetch(`/api/tags/${tag.id}`, { method: "DELETE" });
    await refresh();
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
      return categories.every((category) =>
        filters[category].every((id) => piece.tags[category].some((tag) => tag.id === id))
      );
    });
    return [...filtered].sort((a, b) => {
      const read = (piece: Song): string | number => {
        if (sort.key === "difficulty") return piece.difficulty;
        if (sort.key === "notes") return piece.notes;
        if (sort.key === "title") return piece.id;
        return piece.tags[sort.key].map((tag) => locale === "en-US" ? (tag.nameEn || tag.name) : tag.name).join(",");
      };
      const aVal = read(a);
      const bVal = read(b);
      const result = typeof aVal === "number" && typeof bVal === "number"
        ? aVal - bVal
        : String(aVal).localeCompare(String(bVal), locale, { numeric: true });
      return sort.dir === "asc" ? result : -result;
    });
  }, [filters, locale, pieces, query, sort]);

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

      <section className="relative px-4 py-4">
        <button className={`text-button !min-h-0 !h-auto !py-0.5 !px-2 absolute top-3 right-4 -mt-2 ${editingTags ? "primary-button" : ""}`} type="button" style={{ fontSize: 12 }} onClick={() => setEditingTags((value) => !value)}>
          <Pencil size={12} /> {editingTags ? t.doneEditingTags : t.editTags}
        </button>
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
              editingTags={editingTags}
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