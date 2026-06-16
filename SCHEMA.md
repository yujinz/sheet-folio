# Data Export Schema

This document defines the data exchange format produced by sheet-folio's `scripts/export-data.ts`.

Any downstream tool (static site generator, backup system, migration pipeline) can consume this format.

## Directory Structure

```
export-data/
  manifest.json     # Export metadata
  pieces.json       # Array of pieces with tags, images, links
  tags.json         # Array of all tags
  images/           # Re-encoded images with EXIF stripped
    {pieceId}/
      staff/        # Staff notation images
      numbered/     # Numbered notation images
```

## File: `manifest.json`

```json
{
  "exportedAt": "2026-06-15T21:00:00.000Z",
  "pieceCount": 42,
  "tagCount": 7,
  "imageCount": 156,
  "schemaVersion": 1
}
```

| Field          | Type   | Description                            |
|----------------|--------|----------------------------------------|
| `exportedAt`   | string | ISO 8601 timestamp of export           |
| `pieceCount`   | number | Number of pieces in the export         |
| `tagCount`     | number | Number of tags                         |
| `imageCount`   | number | Number of image files copied           |
| `schemaVersion`| number | Schema version (currently 1)           |

## File: `tags.json`

Array of tag objects:

```json
[
  {
    "id": 1,
    "name": "高音",
    "nameEn": "High notes",
    "color": "#2563eb",
    "category": "pitch"
  }
]
```

| Field    | Type   | Description                                    |
|----------|--------|------------------------------------------------|
| `id`     | number | Unique tag ID                                  |
| `name`   | string | Chinese name (may be empty if only English)    |
| `nameEn` | string | English name (may be empty if only Chinese)    |
| `color`  | string | Hex color code for display                     |
| `category`| string | One of: `"pitch"`, `"technique"`, `"rhythm"` |

## File: `pieces.json`

Array of piece objects:

```json
[
  {
    "id": 1,
    "title": "欢乐颂",
    "titleEn": "Ode to Joy",
    "difficulty": 1,
    "notes": "Some practice notes",
    "tags": {
      "pitch": [],
      "technique": [
        { "id": 3, "name": "连音", "nameEn": "Legato", "color": "#ea580c", "category": "technique" }
      ],
      "rhythm": [
        { "id": 6, "name": "附点", "nameEn": "Dotted", "color": "#c026d3", "category": "rhythm" }
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
| `title`    | string | Chinese title (or English if Chinese unavailable)  |
| `titleEn`  | string | English title (may be empty)                       |
| `difficulty`| number| Difficulty level from 1 to 5                       |
| `notes`    | string | Practice notes (may be empty)                      |

### tags (within piece)

| Field    | Type   | Description                           |
|----------|--------|---------------------------------------|
| `pitch`  | array  | Array of tag objects in pitch category|
| `technique`| array| Array of tag objects in technique     |
| `rhythm` | array  | Array of tag objects in rhythm        |

Each tag object in these arrays has the same structure as in `tags.json`.

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
| `url`  | string | URL (e.g. YouTube link)    |

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

## Schema Version History

| Version | Notes                                       |
|---------|---------------------------------------------|
| 1       | Initial schema                              |