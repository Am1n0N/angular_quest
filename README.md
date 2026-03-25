# Angular Quest

Interactive Angular quiz game built with React + Vite.

## 3D race mode

- Racing mode now uses Three.js via React Three Fiber for real-time 3D rendering.
- Vehicle model sources (online assets): Buggy + ToyCar (glTF sample models).
- Model license: CC BY 4.0.
- Trademark note: Cesium trademark terms apply per model README.
- Asset reference:
	- https://github.com/KhronosGroup/glTF-Sample-Models/tree/main/2.0/Buggy
	- https://github.com/KhronosGroup/glTF-Sample-Models/tree/main/2.0/ToyCar

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

## Run PvP (Socket mode)

In a second terminal, start the socket server:

```bash
npm run socket
```

Then run the app as usual with `npm run dev`.

Optional: point the app to another socket host by creating `.env`:

```bash
VITE_SOCKET_SERVER_URL=http://localhost:3001
```

## Deploy Socket Server on Render

This repo includes a Render blueprint file at [render.yaml](render.yaml) for the Socket.IO server.

### Quick steps

1. Push this repo to GitHub.
2. In Render, create a **Blueprint** from the repo.
3. Render will create service `angular-quest-socket` using `npm run socket`.
4. Set env var `ALLOWED_ORIGINS` in Render dashboard, for example:

```bash
https://your-app.vercel.app,https://your-preview.vercel.app
```

5. Copy your Render service URL (for example `https://angular-quest-socket.onrender.com`).
6. In Vercel project settings, set:

```bash
VITE_SOCKET_SERVER_URL=https://angular-quest-socket.onrender.com
```

7. Redeploy Vercel.

### Health check

Render uses `/health`, which returns:

```json
{"ok":true,"service":"angular-quest-socket"}
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
