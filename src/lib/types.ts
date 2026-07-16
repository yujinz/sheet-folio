export type TagCategory = string;

/** Categories are stored in the tag_categories table. The "pitch" key has special sorting/color behavior. */
export const PITCH_CATEGORY_KEY = "pitch";

/** Convenience helper — checks whether a category key is the pitch category. */
export function isPitchKey(key: string): boolean {
  return key === PITCH_CATEGORY_KEY;
}

export type ImageKind = "staff" | "numbered";

/** A category entry as returned by GET /api/tag-categories. */
export type CategoryEntry = {
  key: string;
  name: string;
  nameAlt: string;
  sortOrder: number;
};

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
