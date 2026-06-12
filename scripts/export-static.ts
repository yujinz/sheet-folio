#!/usr/bin/env npx tsx
/**
 * Static export script for sheet-folio.
 *
 * Reads the SQLite database and uploads directory, then generates a
 * self-contained static HTML site that can be deployed to any static host
 * (Codeberg Pages, GitHub Pages, etc.).
 *
 * Usage:
 *   npx tsx scripts/export-static.ts
 *
 * Options (env vars):
 *   DB_PATH       – path to SQLite database (default: data/sheet-folio.db)
 *   UPLOAD_DIR    – path to uploads directory (default: data/uploads)
 *   OUTPUT_DIR    – path to write static export (default: static-export)
 */

import Database from "better-sqlite3";
import sharp from "sharp";
import path from "node:path";
import fs from "node:fs";

// ---------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data", "sheet-folio.db");
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "data", "uploads");
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.join(process.cwd(), "static-export");

const IMG_OUT = path.join(OUTPUT_DIR, "images");

// ---------------------------------------------------------------
// Types (mirroring src/lib/types.ts)
// ---------------------------------------------------------------
type TagCategory = "pitch" | "technique" | "rhythm";
type ImageKind = "staff" | "numbered";

interface TagRow {
  id: number;
  name: string;
  name_en: string;
  color: string;
  category: TagCategory;
}

interface SongRow {
  id: number;
  title: string;
  title_en: string;
  difficulty: number;
  notes: string;
  created_at: string;
  updated_at: string;
}

interface SongImageRow {
  id: number;
  song_id: number;
  kind: ImageKind;
  url: string;
  filename: string;
  sort_order: number;
  source_url: string | null;
  created_at: string;
}

interface YoutubeLinkRow {
  id: number;
  song_id: number;
  label: string;
  url: string;
  sort_order: number;
}

// ---------------------------------------------------------------
// Read data from SQLite
// ---------------------------------------------------------------
function readData() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`Database not found at ${DB_PATH}`);
    console.error("Run the app first to create the database, or set DB_PATH.");
    process.exit(1);
  }

  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");

  const songs = sqlite.prepare("SELECT * FROM songs ORDER BY id").all() as SongRow[];
  const tags = sqlite.prepare("SELECT * FROM tags ORDER BY id").all() as TagRow[];
  const songTags = sqlite.prepare("SELECT * FROM song_tags").all() as { song_id: number; tag_id: number }[];
  const images = sqlite.prepare("SELECT * FROM song_images ORDER BY sort_order, id").all() as SongImageRow[];
  const links = sqlite.prepare("SELECT * FROM youtube_links ORDER BY sort_order, id").all() as YoutubeLinkRow[];

  // Build tag map
  const tagMap = new Map(tags.map((t) => [t.id, t]));

  // Group tags per piece per category
  const songTagMap = new Map<number, Record<TagCategory, TagRow[]>>();
  for (const st of songTags) {
    const tag = tagMap.get(st.tag_id);
    if (!tag) continue;
    if (!songTagMap.has(st.song_id)) {
      songTagMap.set(st.song_id, { pitch: [], technique: [], rhythm: [] });
    }
    songTagMap.get(st.song_id)![tag.category].push(tag);
  }

  // Group images per piece per kind
  const songImageMap = new Map<number, Record<ImageKind, SongImageRow[]>>();
  for (const img of images) {
    if (!songImageMap.has(img.song_id)) {
      songImageMap.set(img.song_id, { staff: [], numbered: [] });
    }
    songImageMap.get(img.song_id)![img.kind].push(img);
  }

  // Group links per piece
  const songLinkMap = new Map<number, YoutubeLinkRow[]>();
  for (const link of links) {
    if (!songLinkMap.has(link.song_id)) {
      songLinkMap.set(link.song_id, []);
    }
    songLinkMap.get(link.song_id)!.push(link);
  }

  sqlite.close();

  return { songs, tags, songTagMap, songImageMap, songLinkMap };
}

// ---------------------------------------------------------------
// Copy & strip EXIF from images
// ---------------------------------------------------------------
async function copyImages(songImageMap: Map<number, Record<ImageKind, SongImageRow[]>>) {
  let count = 0;

  for (const [songId, kinds] of songImageMap) {
    for (const [kind, images] of Object.entries(kinds)) {
      for (const img of images) {
        const srcPath = path.join(UPLOAD_DIR, String(songId), kind, img.filename);
        if (!fs.existsSync(srcPath)) {
          console.warn(`  ⚠ Image not found: ${srcPath}`);
          continue;
        }

        const dstDir = path.join(IMG_OUT, String(songId), kind);
        fs.mkdirSync(dstDir, { recursive: true });
        const dstPath = path.join(dstDir, img.filename);

        // Use sharp to strip EXIF metadata (sharp strips metadata by default)
        try {
          await sharp(srcPath).toFile(dstPath);
        } catch {
          // If sharp fails (e.g. unsupported format), fall back to raw copy
          console.warn(`  ⚠ sharp failed for ${srcPath}, falling back to raw copy`);
          fs.copyFileSync(srcPath, dstPath);
        }
        count++;
      }
    }
  }
  return count;
}

// ---------------------------------------------------------------
// Escape helpers for HTML/JSON embedding
// ---------------------------------------------------------------
function h(s: string) {
  return s.replace(/[&<>"]/g, function (m) {
    if (m === "&") return "&" + "amp;";
    if (m === "<") return "&" + "lt;";
    if (m === ">") return "&" + "gt;";
    if (m === '"') return "&" + "quot;";
    return m;
  });
}

// ---------------------------------------------------------------
// Shared CSS (derived from globals.css)
// ---------------------------------------------------------------
const SHARED_CSS = `
:root {
  --background: #f7f7f4;
  --foreground: #1f2933;
  --muted: #68737d;
  --line: #d9ded8;
  --panel: #ffffff;
  --accent: #0f766e;
}
* { box-sizing: border-box; }
html, body { min-height: 100%; }
body {
  margin: 0;
  background: var(--background);
  color: var(--foreground);
  font-family: Arial, "Noto Sans SC", sans-serif;
}
button, input, select, textarea { font: inherit; }
button { cursor: pointer; -webkit-tap-highlight-color: transparent; }
.sheet-page { min-height: 100vh; }

.input, .select, .textarea {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #fff;
  color: var(--foreground);
  padding: 8px 10px;
  outline: none;
}
.input:focus, .select:focus, .textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.14);
}

.icon-button, .text-button {
  min-height: 36px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #fff;
  color: var(--foreground);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 7px 10px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}
.icon-button { width: 36px; padding: 0; font-size: 12px; }
.primary-button {
  border-color: #0f766e;
  background: #0f766e;
  color: #fff;
}

.tag-pill {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  border-radius: 999px;
  padding: 3px 9px;
  color: #fff;
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
}

.table-shell {
  overflow: auto;
  border-top: 1px solid var(--line);
  background: var(--panel);
}
.song-table {
  width: 100%;
  min-width: 770px;
  border-collapse: collapse;
}
.song-table th, .song-table td {
  border-bottom: 1px solid var(--line);
  padding: 10px;
  text-align: left;
  vertical-align: top;
  font-size: 12px;
}
.song-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #eef2ef;
  color: #344047;
  font-size: 12px;
  white-space: nowrap;
}
.song-table th button {
  white-space: nowrap;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: inherit;
  font: inherit;
}
.song-table th button:hover { color: var(--accent); }

.select-mini {
  width: 3.5rem;
  padding: 3px 4px;
  font-size: 12px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #fff;
  color: var(--foreground);
}

.link-button {
  color: var(--accent);
  text-decoration: none;
  font-weight: 600;
}
.link-button:hover { text-decoration: underline; }

.fullscreen-view {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: #111;
  color: #fff;
}
.fullscreen-view button {
  cursor: pointer;
  touch-action: manipulation;
}
`;

// ---------------------------------------------------------------
// Directory page (index.html)
// ---------------------------------------------------------------
function generateIndexHtml(data: {
  songs: SongRow[];
  tags: TagRow[];
  songTagMap: Map<number, Record<TagCategory, TagRow[]>>;
  songImageMap: Map<number, Record<ImageKind, SongImageRow[]>>;
}) {
  const { songs, tags, songTagMap, songImageMap } = data;

  // Build JSON data for client-side rendering
  const piecesJson = songs.map((s) => {
    const pieceTags = songTagMap.get(s.id) ?? { pitch: [], technique: [], rhythm: [] };
    const pieceImages = songImageMap.get(s.id) ?? { staff: [], numbered: [] };
    return {
      id: s.id,
      title: s.title,
      titleEn: s.title_en,
      difficulty: s.difficulty,
      notes: s.notes,
      tags: pieceTags,
      hasImages: pieceImages.staff.length > 0 || pieceImages.numbered.length > 0
    };
  });

  const tagsJson = tags.map((t) => ({
    id: t.id,
    name: t.name,
    nameEn: t.name_en,
    color: t.color,
    category: t.category
  }));

  const categories: TagCategory[] = ["pitch", "technique", "rhythm"];

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Gin&rsquo;s Sheet Music Collection for Alto Recorder</title>
<style>${SHARED_CSS}</style>
</head>
<body>
<main class="sheet-page">
  <header class="flex flex-wrap items-center gap-3 border-b border-[var(--line)] bg-white px-4 py-3" style="display:flex;flex-wrap:wrap;align-items:center;gap:12px;border-bottom:1px solid var(--line);background:#fff;padding:12px 16px;">
    <a href="./about/" class="text-button" style="font-size:13px;text-decoration:none;">About</a>
    <div class="relative" style="position:relative;min-width:192px;flex:1;">
      <svg style="position:absolute;left:12px;top:10px;color:var(--muted);" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input class="input" id="search-input" style="padding-left:36px;font-size:14px;" placeholder="Search titles" oninput="filter()">
    </div>
    <span style="font-size:14px;color:var(--muted);flex-shrink:0;">Gin&rsquo;s Sheet Music Collection for Alto Recorder</span>
    <button class="text-button" style="font-size:12px;" onclick="toggleLocale()" id="locale-btn">English</button>
  </header>

  <section style="padding:16px;">
    <div style="display:grid;grid-template-columns:1fr;gap:8px;" class="tag-filters-lg" id="tag-filters">
      ${categories.map((cat) => `
      <div>
        <div style="font-size:11px;font-weight:600;color:var(--muted);margin-bottom:4px;"><span data-zh="${cat === "pitch" ? "音高" : cat === "technique" ? "技巧" : "节拍"}" data-en="${cat.charAt(0).toUpperCase()+cat.slice(1)}">${cat === "pitch" ? "音高" : cat === "technique" ? "技巧" : "节拍"}</span></div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;" id="filters-${cat}">
          ${tags.filter((t) => t.category === cat).map((t) => `
          <label class="tag-pill" style="background:${t.color};cursor:pointer;opacity:0.5;transition:opacity 0.15s;" data-tag-id="${t.id}" data-category="${cat}" onclick="toggleTag('${cat}',${t.id})">
            <span data-zh="${h(t.name)}" data-en="${h(t.name_en)}">${h(t.name)}</span>
          </label>
          `).join("")}
        </div>
      </div>
      `).join("")}
    </div>
  </section>

  <div class="table-shell">
    <table class="song-table">
      <thead>
        <tr>
          <th style="width:60px;"><button onclick="sortBy('difficulty')" id="th-difficulty"><span data-zh="难度" data-en="Difficulty">难度</span><span id="ind-difficulty"></span></button></th>
          <th style="width:200px;"><button onclick="sortBy('title')" id="th-title"><span data-zh="曲名" data-en="Title">曲名</span><span id="ind-title"></span></button></th>
          ${categories.map((c) => `<th style="width:170px;"><span data-zh="${c === "pitch" ? "音高" : c === "technique" ? "技巧" : "节拍"}" data-en="${c.charAt(0).toUpperCase()+c.slice(1)}">${c === "pitch" ? "音高" : c === "technique" ? "技巧" : "节拍"}</span></th>`).join("")}
          <th style="width:170px;"><span data-zh="备注" data-en="Notes">备注</span></th>
        </tr>
      </thead>
      <tbody id="pieces-tbody"></tbody>
    </table>
  </div>
</main>

<script>
// ---- Data ----
const PIECES = ${JSON.stringify(piecesJson)};
const TAGS = ${JSON.stringify(tagsJson)};
const CATEGORIES = ${JSON.stringify(categories)};

// ---- State ----
let locale = "zh-CN";
let query = "";
let filters = { pitch: [], technique: [], rhythm: [] };
let sortKey = "title";
let sortDir = "asc";

// ---- Locale messages ----
const MSG = {
  "zh-CN": {
    search: "搜索曲名",
    title: "曲名",
    difficulty: "难度",
    notes: "备注",
    pitch: "音高",
    technique: "技巧",
    rhythm: "节拍",
    view: "查看"
  },
  "en-US": {
    search: "Search titles",
    title: "Title",
    difficulty: "Difficulty",
    notes: "Notes",
    pitch: "Pitch",
    technique: "Technique",
    rhythm: "Rhythm",
    view: "View"
  }
};

function m(key) {
  return MSG[locale] && MSG[locale][key] ? MSG[locale][key] : key;
}

// ---- HTML escape (mirrors the server-side h() function) ----
function h(s) {
  return String(s).replace(/[&<>"]/g, function (m) {
    if (m === "&") return "&#38;";
    if (m === "<") return "&#60;";
    if (m === ">") return "&#62;";
    if (m === '"') return "&#34;";
    return m;
  });
}

// ---- Locale toggle ----
function toggleLocale() {
  locale = locale === "zh-CN" ? "en-US" : "zh-CN";
  document.getElementById("locale-btn").textContent = locale === "zh-CN" ? "English" : "中文";
  document.getElementById("search-input").placeholder = m("search");
  renderTagLabels();
  renderTable();
}

function renderTagLabels() {
  document.querySelectorAll("[data-zh][data-en]").forEach(function(el) {
    el.textContent = locale === "zh-CN" ? el.getAttribute("data-zh") : el.getAttribute("data-en");
  });
  updateSortIndicators();
}

function updateSortIndicators() {
  document.querySelectorAll("[id^='ind-']").forEach(function(ind) {
    var key = ind.id.replace("ind-","");
    if (key === sortKey) {
      ind.textContent = sortDir === "asc" ? " \u2191" : " \u2193";
      ind.style.color = "var(--accent)";
    } else {
      ind.textContent = "";
    }
  });
}

// ---- Filtering ----
function toggleTag(category, tagId) {
  var arr = filters[category];
  var idx = arr.indexOf(tagId);
  if (idx >= 0) { arr.splice(idx, 1); } else { arr.push(tagId); }
  var label = document.querySelector('[data-tag-id="'+tagId+'"][data-category="'+category+'"]');
  if (label) {
    label.style.opacity = arr.indexOf(tagId) >= 0 ? "1" : "0.5";
  }
  filter();
}

function filter() {
  query = document.getElementById("search-input").value.toLowerCase();
  renderTable();
}

// ---- Sorting ----
function sortBy(key) {
  if (sortKey === key) {
    sortDir = sortDir === "asc" ? "desc" : "asc";
  } else {
    sortKey = key;
    sortDir = "asc";
  }
  renderTable();
  updateSortIndicators();
}

// ---- Render ----
function pieceName(p) {
  return locale === "en-US" ? (p.titleEn || p.title) : p.title;
}

function renderTable() {
  var filtered = PIECES.filter(function(p) {
    if (query) {
      var name = pieceName(p).toLowerCase();
      if (name.indexOf(query) === -1) return false;
    }
    return CATEGORIES.every(function(cat) {
      return filters[cat].every(function(tagId) {
        return p.tags[cat].some(function(t) { return t.id === tagId; });
      });
    });
  });

  // Sort
  filtered.sort(function(a, b) {
    var va, vb;
    if (sortKey === "difficulty") { va = a.difficulty; vb = b.difficulty; }
    else if (sortKey === "title") { va = a.id; vb = b.id; }
    else {
      va = a.tags[sortKey].map(function(t){return locale==="zh-CN"?t.name:t.nameEn;}).join(",");
      vb = b.tags[sortKey].map(function(t){return locale==="zh-CN"?t.name:t.nameEn;}).join(",");
    }
    var result = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), locale, {numeric:true});
    return sortDir === "asc" ? result : -result;
  });

  var tbody = document.getElementById("pieces-tbody");
  tbody.innerHTML = filtered.map(function(p) {
    var name = pieceName(p);
    return "<tr>" +
      '<td><span class="select-mini" style="display:inline-block;text-align:center;">'+p.difficulty+'</span></td>' +
      '<td style="font-weight:600;font-size:15px;"><a class="link-button" href="./piece/'+p.id+'/">'+h(name)+'</a></td>' +
      CATEGORIES.map(function(cat) {
        var pts = p.tags[cat];
        if (pts.length === 0) return "<td></td>";
        return '<td><div style="display:flex;flex-wrap:wrap;gap:3px;">' +
          pts.map(function(t) {
            var label = locale === "zh-CN" ? t.name : (t.nameEn || t.name);
            return '<span class="tag-pill" style="background:'+t.color+'">'+h(label)+'</span>';
          }).join('') +
        '</div></td>';
      }).join('') +
      '<td><span style="font-size:11px;">'+h(p.notes)+'</span></td>' +
    "</tr>";
  }).join('');
}

// ---- Init ----
renderTagLabels();
renderTable();
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------
// Detail page (piece/{id}/index.html)
// ---------------------------------------------------------------
function generateDetailHtml(
  song: SongRow,
  pieceTags: Record<TagCategory, TagRow[]>,
  pieceImages: Record<ImageKind, SongImageRow[]>,
  pieceLinks: YoutubeLinkRow[],
) {
  const pieceJson = {
    id: song.id,
    title: song.title,
    titleEn: song.title_en,
    difficulty: song.difficulty,
    notes: song.notes,
    tags: pieceTags,
    images: pieceImages,
    links: pieceLinks
  };

  const categories: TagCategory[] = ["pitch", "technique", "rhythm"];

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${h(song.title)} – Sheet Music Collection</title>
<style>${SHARED_CSS}
.gallery-scroll { display:flex; gap:16px; overflow-x:auto; padding-bottom:16px; scroll-snap-type:x mandatory; scroll-behavior:smooth; }
.gallery-scroll > .page { flex-shrink:0; scroll-snap-align:start; max-width:95vw; }
.gallery-scroll > .page img { display:block; width:100%; height:auto; }
.zoom-label { position:absolute; left:8px; top:8px; display:flex; align-items:center; gap:4px; border-radius:6px; background:rgba(255,255,255,0.7); padding:4px 8px; font-size:12px; box-shadow:0 1px 3px rgba(0,0,0,0.1); backdrop-filter:blur-sm; }
.kind-tabs { position:absolute; right:8px; top:8px; display:flex; gap:4px; }
.kind-tabs button { border-radius:6px; padding:4px 8px; font-size:12px; box-shadow:0 1px 3px rgba(0,0,0,0.1); backdrop-filter:blur-sm; border:1px solid transparent; cursor:pointer; }
.kind-tabs .active { background:var(--accent); color:#fff; }
.kind-tabs .inactive { background:rgba(255,255,255,0.7); color:var(--foreground); }
</style>
</head>
<body>
<main class="sheet-page">
  <header style="display:grid;gap:12px;border-bottom:1px solid var(--line);background:#fff;padding:12px 16px;">
    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;">
      <a class="icon-button" href="../../" style="text-decoration:none;color:var(--foreground);" aria-label="Back">&larr;</a>
      <h1 style="margin:0;font-size:20px;font-weight:600;" id="piece-title">${h(song.title)}</h1>
      <span style="font-size:12px;color:var(--muted);margin-left:auto;" id="piece-title-en">${h(song.title_en)}</span>
      <button class="text-button" style="font-size:12px;" onclick="toggleLocale()" id="locale-btn">English</button>
    </div>
    <div style="font-size:12px;color:var(--foreground);" id="piece-notes">${h(song.notes)}</div>
    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:12px;overflow-x:auto;">
      <span style="font-size:12px;font-weight:600;">Difficulty: ${song.difficulty}</span>
      ${categories.map((cat) => `
      <div style="display:flex;flex-wrap:wrap;gap:3px;">
        ${pieceTags[cat].map((t) => `<span class="tag-pill" style="background:${t.color}"><span data-zh="${h(t.name)}" data-en="${h(t.name_en)}">${h(t.name)}</span></span>`).join("")}
      </div>
      `).join("")}
    </div>
  </header>

  <div style="position:relative;padding:16px;">
    <div class="zoom-label">
      Zoom
      <input type="range" min="25" max="130" value="100" id="zoom-slider" style="width:80px;" oninput="setZoom(this.value)">
      <span id="zoom-value">100%</span>
    </div>
    <div class="kind-tabs">
      ${(["staff","numbered"] as ImageKind[]).map((kind) => `
      <button class="${kind === "staff" ? "active" : "inactive"}" data-kind="${kind}" onclick="switchKind('${kind}')">${kind === "staff" ? "Staff" : "Numbered"}</button>
      `).join("")}
    </div>
  </div>

  <section style="padding:12px 12px 0;" id="gallery-section">
    <p style="padding:32px 0;text-align:center;font-size:14px;color:var(--muted);" id="no-images-msg">No images</p>
    <div class="gallery-scroll" id="gallery-scroll"></div>
  </section>

  ${pieceLinks.length > 0 ? `
  <section style="padding:0 12px 24px;max-width:768px;margin:0 auto;">
    <h2 style="font-size:14px;font-weight:600;margin:0 0 8px;">Links</h2>
    <div style="display:grid;gap:8px;">
      ${pieceLinks.map((link) => `
      <div style="display:flex;gap:8px;align-items:center;">
        <span style="font-size:12px;font-weight:600;min-width:60px;">${h(link.label)}</span>
        <a href="${h(link.url)}" target="_blank" rel="noopener noreferrer" style="font-size:12px;color:var(--accent);word-break:break-all;">${h(link.url)}</a>
      </div>
      `).join("")}
    </div>
  </section>
  ` : ""}

  <!-- Fullscreen viewer -->
  <div class="fullscreen-view" id="fullscreen" style="display:none;">
    <button style="position:absolute;left:12px;top:12px;z-index:30;border-radius:6px;background:rgba(255,255,255,0.2);padding:8px 12px;color:#fff;border:none;font-size:20px;cursor:pointer;" onclick="closeFullscreen()">&times;</button>
    <button style="position:absolute;left:0;top:0;bottom:0;right:50%;z-index:10;background:transparent;border:none;cursor:pointer;" onclick="prevPage()">
      <div style="display:flex;height:100%;width:64px;align-items:center;justify-content:center;opacity:0.3;transition:opacity 0.15s;">&#8249;</div>
    </button>
    <button style="position:absolute;left:50%;top:0;bottom:0;right:0;z-index:10;background:transparent;border:none;cursor:pointer;" onclick="nextPage()">
      <div style="display:flex;height:100%;width:64px;align-items:center;justify-content:center;opacity:0.3;transition:opacity 0.15s;margin-left:auto;">&#8250;</div>
    </button>
    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
      <img id="fullscreen-img" src="" alt="" style="display:block;max-height:100%;max-width:100%;object-fit:contain;">
    </div>
    <a id="fullscreen-source" href="" target="_blank" rel="noopener noreferrer" style="position:absolute;bottom:16px;left:50%;z-index:20;transform:translateX(-50%);max-width:80vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-radius:6px;background:rgba(0,0,0,0.5);padding:4px 12px;font-size:12px;color:#fff;text-decoration:none;backdrop-filter:blur-sm;display:none;">Source</a>
  </div>
</main>

<script>
// ---- Data ----
var PIECE = ${JSON.stringify(pieceJson)};
var CATEGORIES = ${JSON.stringify(categories)};

// ---- State ----
var locale = "zh-CN";
var kind = "staff";
var zoom = 100;
var fullscreenIndex = -1;

var MSG = {
  "zh-CN": {
    staff: "五线谱",
    numbered: "简谱",
    noImages: "暂无图片",
    zoom: "缩放",
    back: "返回"
  },
  "en-US": {
    staff: "Staff",
    numbered: "Numbered notation",
    noImages: "No images",
    zoom: "Zoom",
    back: "Back"
  }
};

function toggleLocale() {
  locale = locale === "zh-CN" ? "en-US" : "zh-CN";
  document.getElementById("locale-btn").textContent = locale === "zh-CN" ? "English" : "中文";
  renderTagLabels();
  renderTitle();
  renderGallery();
}

function renderTagLabels() {
  document.querySelectorAll("[data-zh][data-en]").forEach(function(el) {
    el.textContent = locale === "zh-CN" ? el.getAttribute("data-zh") : el.getAttribute("data-en");
  });
}

function renderTitle() {
  var titleEl = document.getElementById("piece-title");
  var titleEnEl = document.getElementById("piece-title-en");
  titleEl.textContent = locale === "en-US" && PIECE.titleEn ? PIECE.titleEn : PIECE.title;
  titleEnEl.textContent = locale === "zh-CN" && PIECE.titleEn ? PIECE.titleEn : "";
}

// ---- Gallery ----
function switchKind(newKind) {
  kind = newKind;
  document.querySelectorAll(".kind-tabs button").forEach(function(btn) {
    btn.className = btn.getAttribute("data-kind") === kind ? "active" : "inactive";
  });
  renderGallery();
}

function setZoom(val) {
  zoom = Number(val);
  document.getElementById("zoom-value").textContent = zoom + "%";
  renderGallery();
}

function renderGallery() {
  var images = PIECE.images[kind] || [];
  var scroll = document.getElementById("gallery-scroll");
  var noMsg = document.getElementById("no-images-msg");

  if (images.length === 0) {
    noMsg.style.display = "block";
    scroll.innerHTML = "";
    return;
  }
  noMsg.style.display = "none";

  scroll.innerHTML = images.map(function(img, idx) {
    var src = "../../images/" + PIECE.id + "/" + kind + "/" + img.filename;
    return '<div class="page" style="width:' + zoom + 'vw;">' +
      '<button style="border:0;background:transparent;padding:0;display:block;width:100%;touch-action:manipulation;cursor:pointer;" onclick="openFullscreen(' + idx + ')">' +
        '<img src="' + src + '" alt="" style="display:block;width:100%;height:auto;">' +
      '</button>' +
      (img.sourceUrl ? '<a href="' + img.sourceUrl + '" target="_blank" rel="noopener noreferrer" style="display:block;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:var(--accent);text-decoration:none;">' + img.sourceUrl + '</a>' : '') +
    '</div>';
  }).join("");
}

// ---- Fullscreen ----
function openFullscreen(idx) {
  fullscreenIndex = idx;
  var images = PIECE.images[kind] || [];
  var img = images[idx];
  if (!img) return;
  document.getElementById("fullscreen").style.display = "block";
  updateFullscreenImage();
}

function closeFullscreen() {
  document.getElementById("fullscreen").style.display = "none";
  fullscreenIndex = -1;
}

function updateFullscreenImage() {
  var images = PIECE.images[kind] || [];
  var img = images[fullscreenIndex];
  if (!img) { closeFullscreen(); return; }
  var src = "../../images/" + PIECE.id + "/" + kind + "/" + img.filename;
  document.getElementById("fullscreen-img").src = src;
  var sourceLink = document.getElementById("fullscreen-source");
  if (img.sourceUrl) {
    sourceLink.href = img.sourceUrl;
    sourceLink.textContent = "Source: " + img.sourceUrl;
    sourceLink.style.display = "block";
  } else {
    sourceLink.style.display = "none";
  }
}

function prevPage() {
  var images = PIECE.images[kind] || [];
  if (fullscreenIndex > 0) {
    fullscreenIndex--;
    updateFullscreenImage();
  }
}

function nextPage() {
  var images = PIECE.images[kind] || [];
  if (fullscreenIndex < images.length - 1) {
    fullscreenIndex++;
    updateFullscreenImage();
  }
}

// Keyboard shortcuts
document.addEventListener("keydown", function(e) {
  if (fullscreenIndex >= 0) {
    if (e.key === "Escape") { closeFullscreen(); e.preventDefault(); }
    else if (e.key === "ArrowLeft") { prevPage(); e.preventDefault(); }
    else if (e.key === "ArrowRight") { nextPage(); e.preventDefault(); }
  }
});

// ---- Init ----
renderTagLabels();
renderTitle();
renderGallery();
</script>
</body>
</html>`;
}

// ---------------------------------------------------------------
// About page (about/index.html)
// ---------------------------------------------------------------
function generateAboutHtml() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>About – Gin&rsquo;s Sheet Music Collection</title>
<style>${SHARED_CSS}</style>
</head>
<body>
<main class="sheet-page" style="min-height:100vh;background:var(--background);color:var(--foreground);font-family:Arial,'Noto Sans SC',sans-serif;">
  <div style="max-width:620px;margin:0 auto;padding:48px 24px;">
    <a class="text-button" href="../" style="text-decoration:none;margin-bottom:24px;display:inline-flex;align-items:center;gap:6px;">&larr; Back</a>
    <h1 style="font-size:24px;font-weight:600;margin:0 0 8px;">About</h1>
    <p style="font-size:14px;line-height:1.7;margin:0 0 16px;">
      This is a personal sheet music library for alto recorder, maintained for my own practice and reference.
    </p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 16px;">
      I started learning the alto recorder in May 2026, coming to it as an adult beginner. Ready-made arrangements can be hard to come by, and I&rsquo;ve been inspired by Sarah Jeffery (Team Recorder) and her joy in making the recorder accessible and fun. This site is where I collect and organize the pieces I&rsquo;m working on or want to try someday.
    </p>
    <p style="font-size:14px;line-height:1.7;margin:0 0 16px;">
      The repertoire ranges from game and animation OSTs to folk and classical pieces &mdash; whatever catches my interest, and will keep growing as I progress and come across more sheets.
    </p>
    <p style="font-size:13px;line-height:1.7;margin:0 0 24px;color:var(--muted);">
      All sheet music here is shared for personal, non-commercial study purposes only. Copyright belongs to the respective original rights holders. If you are a rights holder and wish to have content removed, please contact me.
    </p>
  </div>
</main>
</body>
</html>`;
}

// ---------------------------------------------------------------
// Main
// ---------------------------------------------------------------
async function main() {
  console.log("📖 Reading data from", DB_PATH);
  const { songs, tags, songTagMap, songImageMap, songLinkMap } = readData();
  console.log(`   Found ${songs.length} pieces, ${tags.length} tags`);

  // Prepare output directories
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const pieceOutDir = path.join(OUTPUT_DIR, "piece");
  fs.mkdirSync(pieceOutDir, { recursive: true });
  const aboutOutDir = path.join(OUTPUT_DIR, "about");
  fs.mkdirSync(aboutOutDir, { recursive: true });

  // Copy images with EXIF stripping
  console.log("🖼️  Copying images with EXIF stripping...");
  const imageCount = await copyImages(songImageMap);
  console.log(`   Copied ${imageCount} images`);

  // Generate about page
  console.log("📄 Generating about/index.html...");
  const aboutHtml = generateAboutHtml();
  fs.writeFileSync(path.join(aboutOutDir, "index.html"), aboutHtml, "utf-8");

  // Generate directory page
  console.log("📄 Generating index.html...");
  const indexHtml = generateIndexHtml({ songs, tags, songTagMap, songImageMap });
  fs.writeFileSync(path.join(OUTPUT_DIR, "index.html"), indexHtml, "utf-8");

  // Generate detail pages
  console.log("📄 Generating piece pages...");
  for (const song of songs) {
    const pieceTags = songTagMap.get(song.id) ?? { pitch: [], technique: [], rhythm: [] };
    const pieceImages = songImageMap.get(song.id) ?? { staff: [], numbered: [] };
    const pieceLinks = songLinkMap.get(song.id) ?? [];

    const outDir = path.join(pieceOutDir, String(song.id));
    fs.mkdirSync(outDir, { recursive: true });

    const html = generateDetailHtml(song, pieceTags, pieceImages, pieceLinks);
    fs.writeFileSync(path.join(outDir, "index.html"), html, "utf-8");
    console.log(`   ✓ piece/${song.id}/index.html – ${song.title}`);
  }

  console.log(`\n✅ Export complete! Output: ${OUTPUT_DIR}`);
  console.log(`   Total pieces: ${songs.length}`);
  console.log(`   Total images (with EXIF stripped): ${imageCount}`);
}

main().catch((err) => {
  console.error("Export failed:", err);
  process.exit(1);
});