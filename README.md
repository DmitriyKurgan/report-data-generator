# Gantt Report Data Generator

Browser app built with `Next.js + TypeScript` for generating test datasets for a Power BI Gantt visual.

## Features

- Generates hierarchy data with a configurable number of levels.
- Lets you configure:
  - top-level item count;
  - child count per parent for each level transition.
- Includes all visual bucket fields:
  - `Tasks` (via `Tasks_Level_1..N` and `Tasks`);
  - `StartDate`, `EndDate`, `Duration`, `Progress`, `ProgressBase`;
  - `PlannedStartDate`, `PlannedEndDate`;
  - `Indicators`, `MilestoneDetails`, `MilestoneLegend`;
  - `AdditionalColumns`, `PrimaryConnectTo`, `PrimaryConnectType`;
  - `TooltipFields`, `DataLabel`;
  - `DynamicEvent`, `DynamicEventLabel`, `Conditions`, `Legend`.
- Supports user-defined custom columns (`Add Column`) with types:
  - `string`
  - `number`
  - `date`
- Lets users pick exactly which columns to include using checkboxes.
- Uses a practical default column set instead of enabling all columns by default.
- Shows a preview of generated rows.
- Exports results to `CSV` and `JSON`.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## GitHub Pages Auto-Deploy

This project is configured for static export + GitHub Pages deployment:

- `next.config.ts` uses:
  - `output: "export"`
  - `trailingSlash: true`
  - `images.unoptimized: true`
  - dynamic `basePath` / `assetPrefix` for project repos
- Workflow file:
  - `.github/workflows/deploy-pages.yml`
  - auto-deploy on pushes to `main` or `master`

One-time GitHub setup:

1. `Settings -> Pages -> Build and deployment -> Source: GitHub Actions`
2. If needed: `Settings -> Actions -> General -> Workflow permissions -> Read and write permissions`

## Note

The app enforces a `200,000` row generation limit per run to avoid browser freezes on very large datasets.
