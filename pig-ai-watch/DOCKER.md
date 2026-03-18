# Docker Setup — PRISMA ATLAS (Pig AI Watch)

Run the entire stack (database + backend + frontend) in Docker containers.
**Works on macOS, Windows, and Linux** — no Python/Node.js installation required.

---

## Prerequisites

| Platform | Install |
|----------|---------|
| **Windows** | [Docker Desktop for Windows](https://docs.docker.com/desktop/install/windows-install/) (enable WSL 2 backend) |
| **macOS** | [Docker Desktop for Mac](https://docs.docker.com/desktop/install/mac-install/) |
| **Linux** | `sudo apt install docker.io docker-compose-plugin` (or equivalent) |

> Make sure Docker Desktop is **running** before proceeding.

---

## Quick Start

### macOS / Linux
```bash
cd pig-ai-watch
./start-docker.sh
```

### Windows
```powershell
cd pig-ai-watch
start-docker.bat
```

### Or manually
```bash
cd pig-ai-watch
cp .env.example .env          # create env file (edit as needed)
docker compose up --build -d  # build & start all services
```

---

## Services

| Service | URL | Description |
|---------|-----|-------------|
| **Frontend** | http://localhost:3000 | React app (dashboard + integrated landing page) |
| **Landing Route** | http://localhost:3000/welcome | Marketing / login page route |
| **Backend API** | http://localhost:8000 | FastAPI + YOLO detection |
| **Database** | localhost:5432 | PostgreSQL 15 |

---

## First-Time Setup (Seed Database)

After the first `docker compose up`, seed the admin user and pens:

```bash
docker compose --profile seed up seed
```

This creates:
- **Admin user** — `admin` / `admin123`
- **5 default pens** — Pen 1–5

---

## Common Commands

```bash
# Start everything
docker compose up --build -d

# View live logs
docker compose logs -f

# View logs for a specific service
docker compose logs -f backend

# Stop everything (keeps data)
docker compose down

# Stop and DELETE all data (fresh start)
docker compose down -v

# Rebuild only backend
docker compose build backend && docker compose up -d backend

# Open a shell inside the backend container
docker compose exec backend sh

# Run alembic migrations manually
docker compose exec backend python -m alembic upgrade head
```

---

## Environment Variables

Edit `.env` (copied from `.env.example`) to configure:

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_USER` | `postgres` | DB username |
| `POSTGRES_PASSWORD` | `postgres` | DB password |
| `POSTGRES_DB` | `pig_ai_watch` | DB name |
| `DB_PORT` | `5432` | Exposed DB port |
| `SECRET_KEY` | `change-me...` | JWT signing key |
| `FRONTEND_PORT` | `3000` | Dashboard port |
| `CAMERA_PEN_1` … `CAMERA_PEN_10` | *(empty)* | RTSP URLs or USB indices |
| `YOLO_WEIGHTS_PATH` | `models/pig_detection.pt` | Path to YOLO weights |
| `DEBUG` | `false` | Enable debug logging |

---

## Architecture

```
┌──────────────┐       ┌──────────────┐     ┌──────────────┐
│   Frontend   │──────▶│   Backend    │────▶│  PostgreSQL  │
│ (nginx:80)   │
│  React SPA   │       │ (uvicorn:8000│     │   (:5432)    │
│ + /welcome   │       │  FastAPI+YOLO│     │              │
└──────────────┘
     :3000                :8000               :5432

Frontend nginx proxies /api/* to backend.
```

> **Desktop App (Electron):** The `desktop/` folder contains a native Electron
> wrapper. It **cannot** run inside Docker (needs a GUI). Build it separately
> with `cd desktop && npm install && npm run make`. It connects to the backend
> at `localhost:8000` automatically.

---

## Troubleshooting

### Port already in use
```bash
# Check what's using port 3000
# macOS/Linux
lsof -i :3000
# Windows
netstat -ano | findstr :3000
```
Change ports in `.env` (`FRONTEND_PORT`, `DB_PORT`) to avoid conflicts.

### Backend won't start
```bash
docker compose logs backend    # check for errors
docker compose restart backend # restart just the backend
```

### Fresh restart (nuke everything)
```bash
docker compose down -v         # remove containers + volumes
docker compose up --build -d   # rebuild from scratch
docker compose --profile seed up seed  # re-seed database
```

### Windows-specific: WSL 2 not enabled
Docker Desktop on Windows requires WSL 2. Open PowerShell as admin:
```powershell
wsl --install
# Restart your computer, then start Docker Desktop
```
