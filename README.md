# Kaif Abbas — Illustrations

Illustration showcase hosted on Netlify (`public/` is the published site).

```
public/
  index.html
  assets/brand/kaif-abbas.png      logo (falls back to a "KA" monogram)
  assets/css/site.css
  assets/js/site.js
  data/collection.json             generated: image index + fallback sheet rows
  illustrations/**/*.png           original artwork (any folder layout)
netlify/functions/illustrations.mjs  /api/illustrations: live sheet rows
lib/sheet.mjs                      shared sheet reader
data/illustrations.snapshot.json   last good copy of the sheet
scripts/build-collection.mjs       Netlify build step
netlify.toml
```

## Content comes from the Google Sheet

Everything shown is managed in the **Illustrations** tab of the content sheet. The sheet must stay shared as "Anyone with the link can view".

The sheet is configured only through environment variables (never in code):

| Variable | Value |
| --- | --- |
| `SHEET_ID` | The long ID in the sheet URL: `/spreadsheets/d/<ID>/edit` |
| `SHEET_GID` | The tab ID: `#gid=<GID>` in the URL when the Illustrations tab is open |

Set them in Netlify under **Site configuration → Environment variables** (scopes: Builds and Functions). For local runs, copy `.env.example` to `.env` (git-ignored); `netlify dev` loads it. The browser never sees these values: it only calls `/api/illustrations`.

Sheet edits go live without a redeploy: the page reads the sheet through `/api/illustrations`, which Netlify caches for about a minute. Only new image files need a deploy.

| Column | Meaning | If blank |
| --- | --- | --- |
| `id` | Unique row id | Row number is used |
| `file` | Image name, with or without extension (e.g. `elephant-waterhole`) | Row is skipped |
| `title` / `subtitle` | Card text | Title from file name / no subtitle |
| `category` | One or more categories, separated by commas (e.g. `editorial, nature`) | Uncategorized |
| `alt` | Image description for screen readers | Title |
| `aiGenerated` | `1` shows the AI-generated label, `0` doesn't | AI-generated |
| `featured` | `1` shows it in the hero, `0` doesn't | Not featured |
| `flag` | `1` visible, `0` hidden | Visible |

Categories come only from the sheet; folders don't matter. An image is matched by file name anywhere under `public/illustrations/`, so keep file names unique. Several rows can use the same image. Rows whose image is missing are skipped. Images not in the sheet are not shown.

To add an illustration: put the image anywhere under `public/illustrations/`, deploy, and add a row to the sheet.

## Build and preview

```
npm install
npm run preview   # builds, then runs Netlify dev (site + live sheet function) on http://localhost:8888
```

If the live sheet can't be reached, the page uses the rows saved at build time, and the build uses `data/illustrations.snapshot.json`; commit that file. `public/data/collection.json`, `public/previews/`, and the small logo are generated and git-ignored.