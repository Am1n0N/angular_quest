# Angular Quest

Interactive Angular quiz game built with React + Vite.

## 3D race mode

- Racing mode now uses Three.js via React Three Fiber for real-time 3D rendering.
- Vehicle model source (online asset): Cesium Milk Truck (glTF sample).
- Model license: CC BY 4.0.
- Trademark note: Cesium trademark terms apply per model README.
- Asset reference:
	- https://github.com/KhronosGroup/glTF-Sample-Models/tree/main/2.0/CesiumMilkTruck

## Data persistence

- Game levels and questions are stored in SQLite tables (`levels`, `questions`).
- Leaderboard data is stored in SQLite key-value storage.
- The SQLite database file is persisted in IndexedDB on the client.
- App source has no hardcoded level/question dataset.
- On first run, DB is seeded from `public/seed-levels.json`, then all reads come from SQLite.

## Content admin

- From the intro screen you can export levels/questions to JSON.
- You can import a JSON file to replace levels/questions in SQLite.

## Branding

- Company badge (logo + name) is shown in the game UI.
- Logo asset path: `public/company-logo.svg`.

## Requirements

- Node.js 18+
- npm

## Run locally

```bash
npm install
npm run dev
```

## Build for hosting

```bash
npm run build
```

Build output is created in `dist/`.

## Hosting options

### Vercel

- Import this repository in Vercel.
- Build command: `npm run build`
- Output directory: `dist`

### Netlify

- Import this repository in Netlify.
- Build command: `npm run build`
- Publish directory: `dist`

### GitHub Pages (manual)

- Run `npm run build`
- Deploy the content of `dist/` using your preferred Pages workflow.

## Git setup

Repository is initialized locally. To connect remote:

```bash
git remote add origin <your-repo-url>
git branch -M main
git push -u origin main
```
