/**
 * Seed data for the demo site — preloaded pieces, tags, and categories.
 *
 * 🔄 DEMO SYNC: Keep in sync with the real site's seeds:
 *   - src/lib/seed.ts (seedDefaultCategories)
 *   - src/db/index.ts (7 preset tags)
 *
 * ⚠️ All imports must be safe for both Node.js (build) and browser (runtime).
 */

import type { CategoryEntry, Tag } from "@/lib/types";

/**
 * Base path for image URLs. On GitHub Pages (demo deploy) this is "/sheet-folio".
 * Locally it's empty string. Using NEXT_PUBLIC_* ensures it's available at runtime
 * in the browser (Next.js inlines public env vars).
 */
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export interface SeedPiece {
  id: number;
  title: string;
  titleAlt: string;
  difficulty: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
  tagIds: number[];
}

export interface SeedImage {
  songId: number;
  kind: "staff" | "numbered";
  url: string;
  filename: string;
}

export interface SeedData {
  pieces: SeedPiece[];
  tags: Tag[];
  categories: CategoryEntry[];
  singleSelectCategories: string[];
  images: SeedImage[];
}

export const SEED_PIECE_IDS: number[] = [1, 2];

const SEED_TAGS: Tag[] = [
  // Pitch
  { id: 1, name: "高音", nameAlt: "High notes", color: "#2563eb", category: "pitch" },
  { id: 2, name: "低音", nameAlt: "Low notes", color: "#0891b2", category: "pitch" },
  { id: 8, name: "C4", nameAlt: "C4", color: "#82c98c", category: "pitch" },
  { id: 9, name: "G3", nameAlt: "G3", color: "#8ec982", category: "pitch" },
  { id: 10, name: "D5", nameAlt: "D5", color: "#82c9c7", category: "pitch" },
  // Technique
  { id: 3, name: "连音", nameAlt: "Legato", color: "#ea580c", category: "technique" },
  { id: 4, name: "颤音", nameAlt: "Trill", color: "#dc2626", category: "technique" },
  { id: 5, name: "装饰音", nameAlt: "Ornament", color: "#b45309", category: "technique" },
  // Rhythm
  { id: 6, name: "附点", nameAlt: "Dotted", color: "#c026d3", category: "rhythm" },
  { id: 7, name: "三连音", nameAlt: "Triplet", color: "#7c3aed", category: "rhythm" },
  { id: 11, name: "十六分音符", nameAlt: "Sixteenth Note", color: "#9e6aba", category: "rhythm" },
];

export const SEED_DATA: SeedData = {
  pieces: [
    {
      id: 1,
      title: "欢乐颂",
      titleAlt: "Ode to Joy",
      difficulty: 1,
      notes: "",
      createdAt: "2026-06-26T22:40:00.000Z",
      updatedAt: "2026-07-18T02:32:59.549Z",
      tagIds: [6, 8, 9], // Dotted + C4 + G3
    },
    {
      id: 2,
      title: "空之境界 M18",
      titleAlt: "Garden of Sinners M18",
      difficulty: 5,
      notes: "",
      createdAt: "2026-07-18T02:33:16.637Z",
      updatedAt: "2026-07-18T02:45:26.097Z",
      tagIds: [3, 6, 10, 11], // Legato + Dotted + D5 + Sixteenth Note
    },
  ],
  tags: SEED_TAGS,
  categories: [
    { key: "pitch", name: "音高", nameAlt: "Pitch", sortOrder: 0 },
    { key: "rhythm", name: "节拍", nameAlt: "Rhythm", sortOrder: 1 },
    { key: "technique", name: "技巧", nameAlt: "Technique", sortOrder: 2 },
  ],
  singleSelectCategories: [],
  images: [
    { songId: 1, kind: "staff", url: `${BASE}/uploads/1/staff/Screenshot%202026-07-16%20225039.png`, filename: "Screenshot 2026-07-16 225039.png" },
    { songId: 2, kind: "staff", url: `${BASE}/uploads/2/staff/Screenshot_2026-07-17_222554.png`, filename: "Screenshot_2026-07-17_222554.png" },
    { songId: 2, kind: "staff", url: `${BASE}/uploads/2/staff/Screenshot_2026-07-17_222623.png`, filename: "Screenshot_2026-07-17_222623.png" },
    { songId: 2, kind: "staff", url: `${BASE}/uploads/2/staff/Screenshot_2026-07-17_222700.png`, filename: "Screenshot_2026-07-17_222700.png" },
  ],
};
