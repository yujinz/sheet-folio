"use client";

import Link from "next/link";
import { Pencil, Plus, Search } from "lucide-react";
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
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "title", dir: "asc" });

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
    const row = await fetch("/api/pieces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: t.newPieceTitle })
    }).then((res) => res.json());
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
      if (query && !piece.title.toLowerCase().includes(query.toLowerCase())) return false;
      return categories.every((category) =>
        filters[category].every((id) => piece.tags[category].some((tag) => tag.id === id))
      );
    });
    return [...filtered].sort((a, b) => {
      const read = (piece: Song) => {
        if (sort.key === "difficulty") return piece.difficulty;
        if (sort.key === "notes") return piece.notes;
        if (sort.key === "title") return piece.title;
        return piece.tags[sort.key].map((tag) => tag.name).join(",");
      };
      const result = String(read(a)).localeCompare(String(read(b)), locale, { numeric: true });
      return sort.dir === "asc" ? result : -result;
    });
  }, [filters, locale, pieces, query, sort]);

  function sortBy(key: SortKey) {
    setSort((value) => ({ key, dir: value.key === key && value.dir === "asc" ? "desc" : "asc" }));
  }

  return (
    <main className="sheet-page">
      <header className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] bg-white px-4 py-3">
        <h1 className="text-xl font-semibold">{t.appTitle}</h1>
        <div className="relative min-w-64 flex-1">
          <Search className="absolute left-3 top-2.5 text-[var(--muted)]" size={16} />
          <input
            className="input"
            style={{ paddingLeft: 36 }}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t.searchTitle}
          />
        </div>
        <LocaleSwitch />
        <button className="text-button primary-button" type="button" onClick={createPiece}>
          <Plus size={16} /> {t.addPiece}
        </button>
      </header>

      <section className="grid gap-3 px-4 py-4">
        <div className="flex justify-end">
          <button className={`text-button ${editingTags ? "primary-button" : ""}`} type="button" onClick={() => setEditingTags((value) => !value)}>
            <Pencil size={16} /> {editingTags ? t.doneEditingTags : t.editTags}
          </button>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
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
              <th><button onClick={() => sortBy("title")}>{t.title}</button></th>
              <th><button onClick={() => sortBy("difficulty")}>{t.difficulty}</button></th>
              {categories.map((category) => <th key={category}><button onClick={() => sortBy(category)}>{t[category]}</button></th>)}
              <th><button onClick={() => sortBy("notes")}>{t.notes}</button></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((piece) => (
              <tr key={piece.id}>
                <td className="font-semibold"><Link href={`/piece/${piece.id}`}>{piece.title}</Link></td>
                <td>
                  <select className="select w-20" value={piece.difficulty} onChange={(event) => updatePiece(piece, { difficulty: Number(event.target.value) })}>
                    {[1, 2, 3, 4, 5].map((score) => <option key={score}>{score}</option>)}
                  </select>
                </td>
                {categories.map((category) => (
                  <td key={category} className="min-w-56">
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
