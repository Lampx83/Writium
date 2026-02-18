# Writium

Document writing app: compose articles, manage references, citations (APA/IEEE), share links, version history, comments, export to Word/BibTeX.

---

## Run locally (without Docker)

Requirements: **PostgreSQL** installed and running on your machine.

**1. Environment configuration**

```bash
cp env.example .env
```

Edit `.env` as needed: `DATABASE_URL` (PostgreSQL user/password), `OPENAI_API_KEY`, `WRITIUM_URL`.

**2. Install dependencies and run**

**Production (build then start):**

```bash
npm run install:all   # install root + frontend deps (or: npm install && cd frontend && npm install)
npm run build
npm run build:frontend
npm start
```

Open http://localhost:3002.

**Development (backend + frontend live reload):**

Use **two terminals**. Backend serves the API; the frontend dev server serves the UI with HMR.

- **Terminal 1** — backend:
  ```bash
  npm install
  npm run dev
  ```
- **Terminal 2** — frontend:
  ```bash
  cd frontend && npm install && npm run dev
  ```

**Open the app at http://localhost:3003** (frontend). Backend API is at http://localhost:3002. If you only run Terminal 1, http://localhost:3002 will show a short message asking you to run the frontend or build it.

**Frontend build error (EACCES):** clear cache and rebuild:
```bash
rm -rf frontend/.next frontend/out public && npm run build:frontend
```

---

## Run dev with Docker

One command starts PostgreSQL + backend + frontend; edit code on your machine and the app in the container updates automatically.

**First time or after changing dependencies:** build images once.

```bash
docker compose -f docker-compose.dev.yml build
```

**Start dev (one command):**

```bash
npm run docker:dev
```

Or: `docker compose -f docker-compose.dev.yml up`

- **Frontend:** http://localhost:3003  
- **Backend API:** http://localhost:3002  

Then open http://localhost:3002 (or run frontend on host: `cd frontend && npm run dev` → http://localhost:3003).

**Production with Docker (no dev):**

```bash
cp env.example .env   # optional: set OPENAI_API_KEY, WRITIUM_URL
docker compose up -d
```

Open http://localhost:3002. PostgreSQL data is stored in volume `writium_pgdata`.

---

## Schema and API

- Single schema file: `schema/schema.sql` (Part 1 = standalone, Part 2 = portal). Create DB manually: `createdb writium && npm run db:schema`.
- API: `/api/write-articles` (CRUD, versions, comments, share), `/api/write_agent` (writing agent).

---

Can be embedded in AI Portal — see [docs/INSTALL-INTO-PORTAL.md](docs/INSTALL-INTO-PORTAL.md).
