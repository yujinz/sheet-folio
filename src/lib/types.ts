export type TagCategory = string;

/** The three built-in core tag categories with special i18n labels and UI. */
export const CORE_CATEGORIES = ["pitch", "rhythm", "technique"] as const;
export type ImageKind = "staff" | "numbered";

export type Tag = {
  id: number;
  name: string;
  nameAlt: string;
  color: string;
  category: TagCategory;
};

export type SongImage = {
  id: number;
  songId: number;
  kind: ImageKind;
  url: string;
  filename: string;
  sortOrder: number;
  sourceUrl: string | null;
  createdAt: string;
};

export type VideoLink = {
  id: number;
  songId: number;
  label: string;
  url: string;
  sortOrder: number;
};

export type Song = {
  id: number;
  title: string;
  titleAlt: string;
  difficulty: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
  tags: Record<string, Tag[]>;
  images?: Record<ImageKind, SongImage[]>;
  links?: VideoLink[];
};
