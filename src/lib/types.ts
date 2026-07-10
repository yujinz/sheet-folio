export type TagCategory = "pitch" | "technique" | "rhythm";
export type ImageKind = "staff" | "numbered";

export type Tag = {
  id: number;
  name: string;
  nameEn: string;
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
  titleEn: string;
  difficulty: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
  tags: Record<TagCategory, Tag[]>;
  images?: Record<ImageKind, SongImage[]>;
  links?: VideoLink[];
};
