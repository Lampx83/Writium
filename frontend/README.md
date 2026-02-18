# Writium – Frontend (React + Next.js)

Writium UI uses **React** and **Next.js** (static export).

## Scripts

- `npm run dev` – Run Next dev server at http://localhost:3003 (frontend only).
- `npm run build` – Build static export to `out/`.
- `npm run start` – Run Next production server (rarely used; usually use Express from project root).

## Build and package (from project root)

- **Run standalone:**  
  `npm run build:frontend` – Build frontend and copy `out/` → `public/`. Then `npm run start` (Express) serves `public/`.

- **Package zip for Portal:**  
  `npm run pack` – Build backend + frontend with `BUILD_FOR=embed` (assetPrefix `/embed/write`) and create `dist/writium-package.zip`.

## Structure

- `app/` – Next App Router (layout, page).
- `components/` – React components (WriteView, ui).
- `lib/` – config (API base), API client (write-articles).

API base: when running standalone it is same origin (`/api/write-articles`); when embedded in Portal, Portal injects `window.__WRITE_API_BASE__` and the client uses that base.
