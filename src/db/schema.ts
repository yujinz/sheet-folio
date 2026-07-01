import { integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const songs = sqliteTable("songs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  titleEn: text("title_en").notNull().default(""),
  difficulty: integer("difficulty").notNull(),
  notes: text("notes").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const tags = sqliteTable(
  "tags",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    nameEn: text("name_en").notNull().default(""),
    color: text("color").notNull(),
    category: text("category").notNull()
  },
  (table) => ({
    uniqueName: uniqueIndex("tags_category_name_idx").on(table.category, table.name)
  })
);

export const songTags = sqliteTable(
  "song_tags",
  {
    songId: integer("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" })
  },
  (table) => ({
    uniqueSongTag: uniqueIndex("song_tags_song_tag_idx").on(table.songId, table.tagId)
  })
);

export const songImages = sqliteTable("song_images", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  songId: integer("song_id")
    .notNull()
    .references(() => songs.id, { onDelete: "cascade" }),
  kind: text("kind", { enum: ["staff", "numbered"] }).notNull(),
  url: text("url").notNull(),
  filename: text("filename").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  sourceUrl: text("source_url"),
  createdAt: text("created_at").notNull()
});

export const youtubeLinks = sqliteTable("youtube_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  songId: integer("song_id")
    .notNull()
    .references(() => songs.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  url: text("url").notNull(),
  sortOrder: integer("sort_order").notNull().default(0)
});

export const singleSelectCategories = sqliteTable("single_select_categories", {
  category: text("category").primaryKey()
});

export const deviceZoom = sqliteTable(
  "device_zoom",
  {
    deviceId: text("device_id").notNull(),
    songId: integer("song_id")
      .notNull()
      .references(() => songs.id, { onDelete: "cascade" }),
    zoom: integer("zoom").notNull().default(100),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    uniqueDeviceSong: uniqueIndex("device_zoom_device_song_idx").on(table.deviceId, table.songId)
  })
);
