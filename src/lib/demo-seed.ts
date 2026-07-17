/**
 * Seed data for the demo site — preloaded pieces, tags, and categories.
 *
 * This file is imported both at build time (for generateStaticParams) and
 * at runtime (to hydrate an empty sessionStorage store on first visit).
 *
 * 🔄 DEMO SYNC: Keep in sync with the real site's seeds:
 *   - src/lib/seed.ts (seedDefaultCategories)
 *   - src/db/index.ts (7 preset tags)
 *
 * ⚠️ All imports must be safe for both Node.js (build) and browser (runtime).
 */

import type { CategoryEntry, Tag } from "@/lib/types";

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

export interface SeedData {
  pieces: SeedPiece[];
  tags: Tag[];
  categories: CategoryEntry[];
  singleSelectCategories: string[];
}

export const SEED_PIECE_IDS: number[] = [1];

const SEED_TAGS: Tag[] = [
  // Pitch
  { id: 1, name: "高音", nameAlt: "High notes", color: "#2563eb", category: "pitch" },
  { id: 2, name: "低音", nameAlt: "Low notes", color: "#0891b2", category: "pitch" },
  // Technique
  { id: 3, name: "连音", nameAlt: "Legato", color: "#ea580c", category: "technique" },
  { id: 4, name: "颤音", nameAlt: "Trill", color: "#dc2626", category: "technique" },
  { id: 5, name: "装饰音", nameAlt: "Ornament", color: "#b45309", category: "technique" },
  // Rhythm
  { id: 6, name: "附点", nameAlt: "Dotted", color: "#c026d3", category: "rhythm" },
  { id: 7, name: "三连音", nameAlt: "Triplet", color: "#7c3aed", category: "rhythm" },
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
      updatedAt: "2026-06-26T22:40:00.000Z",
      tagIds: [1, 3], // High notes + Legato
    },
  ],
  tags: SEED_TAGS,
  categories: [
    { key: "pitch", name: "音高", nameAlt: "Pitch", sortOrder: 0 },
    { key: "rhythm", name: "节拍", nameAlt: "Rhythm", sortOrder: 1 },
    { key: "technique", name: "技巧", nameAlt: "Technique", sortOrder: 2 },
  ],
  singleSelectCategories: [],
};
