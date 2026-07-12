# Data Export Schema

This document defines the data exchange format produced by sheet-folio's `scripts/export-data.ts`.

Any downstream tool (static site generator, backup system, migration pipeline) can consume this format.

## Directory Structure

```
export-data/
  manifest.json                    # Export metadata
  pieces.json                      # Array of pieces with tags, images, links
  tags.json                        # Array of all tags
  single-select-categories.json    # Array of single-select category names (v2+)
  images/                          # Re-encoded images with EXIF stripped
    {pieceId}/
      staff/                       # Staff notation images
      numbered/                    # Numbered notation images
```

## File: `manifest.json`

```json
{
  "exportedAt": "2026-06-15T21:00:00.000Z",
  "pieceCount": 42,
  "tagCount": 7,
  "imageCount": 156,
  "schemaVersion": 2
}
```

| Field          | Type   | Description                            |
|----------------|--------|----------------------------------------|
| `exportedAt`   | string | ISO 8601 timestamp of export           |
| `pieceCount`   | number | Number of pieces in the export         |
| `tagCount`     | number | Number of tags                         |
| `imageCount`   | number | Number of image files copied           |
| `schemaVersion`| number | Schema version (currently 2)           |

## File: `tags.json`

Array of tag objects:

```json
[
  {
    "id": 1,
    "name": "高音",
    "nameAlt": "High notes",
    "color": "#2563eb",
    "category": "pitch"
  }
]
```

| Field    | Type   | Description                                    |
|----------|--------|------------------------------------------------|
| `id`     | number | Unique tag ID                                  |
| `name`   | string | Primary name (e.g. Chinese) — may be empty if only alternate |
| `nameAlt` | string | Alternate name (e.g. English) — may be empty if only primary |
| `color`  | string | Hex color code for display                     |
| `category`| string | Any category name (free-text). Core: `"pitch"`, `"technique"`, `"rhythm"`. User-defined: e.g. `"genre"`, `"mood"`. |

> The three core categories (`pitch`, `technique`, `rhythm`) are seeded automatically when the app is first created. They can be renamed or deleted like any other category.

## File: `pieces.json`

Array of piece objects:

```json
[
  {
    "id": 1,
    "title": "欢乐颂",
    "titleAlt": "Ode to Joy",
    "difficulty": 1,
    "notes": "Some practice notes",
    "tags": {
      "pitch": [],
      "technique": [
        { "id": 3, "name": "连音", "nameAlt": "Legato", "color": "#ea580c", "category": "technique" }
      ],
      "rhythm": [
        { "id": 6, "name": "附点", "nameAlt": "Dotted", "color": "#c026d3", "category": "rhythm" }
      ]
    },
    "images": {
      "staff": [
        { "id": 1, "filename": "sheet1.jpg", "sourceUrl": "https://example.com/source" }
      ],
      "numbered": []
    },
    "links": [
      { "id": 1, "label": "Tutorial", "url": "https://youtube.com/watch?v=abc" }
    ]
  }
]
```

### Piece Fields

| Field      | Type   | Description                                        |
|------------|--------|----------------------------------------------------|
| `id`       | number | Unique piece ID                                    |
| `title`    | string | Primary title (e.g. Chinese) — may be empty if only alternate |
| `titleAlt`  | string | Alternate title (e.g. English) — may be empty if only primary |
| `difficulty`| number| Difficulty level from 1 to 5                       |
| `notes`    | string | Practice notes (may be empty)                      |

### tags (within piece)

Tags are grouped by category into `Record<string, Tag[]>`. Each key is a category name, and the value is an array of tag objects in that category (can be empty).

Categories registered in `single_select_categories` are single-select — a piece can have at most one tag from that category (enforced by the API on write).

```json
{
  "technique": [{ "id": 3, "name": "连音", "nameAlt": "Legato", "color": "#ea580c", "category": "technique" }],
  "rhythm": [{ "id": 6, "name": "附点", "nameAlt": "Dotted", "color": "#c026d3", "category": "rhythm" }],
  "genre": [{ "id": 10, "name": "巴洛克", "nameAlt": "Baroque", "color": "#059669", "category": "genre" }]
}
```

Each tag object has the same structure as in `tags.json`.

### images (within piece)

| Field     | Type  | Description                                |
|-----------|-------|--------------------------------------------|
| `staff`   | array | Staff notation images for this piece       |
| `numbered`| array | Numbered notation images for this piece    |

Each image object:

| Field      | Type   | Description                           |
|------------|--------|---------------------------------------|
| `id`       | number | Unique image ID                       |
| `filename` | string | Filename (used to construct the image path) |
| `sourceUrl`| string or null | Optional URL to the original source    |

The image file is located at `images/{pieceId}/{kind}/{filename}` relative to the export root.

### links (within piece)

Each link object:

| Field  | Type   | Description                |
|--------|--------|----------------------------|
| `id`   | number | Unique link ID             |
| `label`| string | Display label (e.g. "Tutorial") |
| `url`  | string | URL (e.g. Video link)    |

## Image Paths

Images are stored at:

```
images/{pieceId}/{kind}/{filename}
```

Where `{kind}` is either `"staff"` or `"numbered"`. The site generator should reference images relative to the output directory:

```
images/{pieceId}/{kind}/{filename}
```

All images have EXIF metadata stripped using sharp during export.

## File: `single-select-categories.json`

Array of category names that are configured as single-select (optional — absent if none):

```json
["genre", "mood"]
```

Each entry is a category key from the `tags` table. When a category appears here, a piece may have at most one tag from that category. The frontend renders radio buttons instead of checkboxes for these categories.

## Schema Version History

| Version | Notes                                       |
|---------|---------------------------------------------|
| 2       | Added `single-select-categories.json`.      |
| 1       | Initial schema                              |