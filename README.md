# Sabores de Filipinas

A responsive Spanish-first recipe website featuring 12 Filipino savory dishes and 12 desserts adapted for ingredients available in Costa Rica. The site includes full English translations, recipe search and filters, saved ingredient checklists, deep links, print support, and verified source links.

## Run locally

Requirements: Node.js 20.19+ or 22.12+ and npm.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173`.

## Validate and build

```bash
npm run check
npm run build
npm run preview
```

The production build is generated in `dist/`.

## Deploy to Vercel

1. Push this project to a Git provider supported by Vercel.
2. Import the repository in Vercel.
3. Vercel reads `vercel.json`, runs `npm run build`, and publishes `dist/`.

No environment variables, database, or server API are required.
