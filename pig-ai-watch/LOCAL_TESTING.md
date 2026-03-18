# Local Testing Guide — No Pi, No DigitalOcean Needed

Your Mac plays both roles: **"cloud"** (Docker Compose) and **"Pi"** (edge agent / mock script).

---

## Quick Start (3 terminals)

### Terminal 1 — Start the "cloud" (backend + DB + frontend)

```bash
cd pig-ai-watch

# Start only the services you need (skip landing if you want)
docker compose up db backend frontend --build
```

Wait until you see:
```
pig-ai-watch-backend  | INFO:     Application startup complete.
```

Dashboard → http://localhost:3000  
API docs  → http://localhost:8000/docs

---

### Terminal 2 — Simulate the Pi with fake detections (no camera needed)

```bash
cd pig-ai-watch/edge

# Install dependencies into a local venv
python3 -m venv .venv
source .venv/bin/activate
pip install httpx python-dotenv

# Run the mock agent — sends a detection every 2 seconds
python mock_push.py
```

You'll see output like:
```
2026-03-12 10:00:02  INFO     Mock agent started → http://localhost:8000
2026-03-12 10:00:02  INFO     Pens: ['pen-1', 'pen-2', 'pen-3']  |  Interval: 2.0s

2026-03-12 10:00:04  INFO     [pen-1] cycle=1  piglets=11  posture=lying       risk=0.12  HTTP 200
2026-03-12 10:00:06  INFO     [pen-2] cycle=2  piglets=9   posture=standing    risk=0.81  HTTP 200  ⚠️  HIGH RISK
```

Open the dashboard and watch detections and alerts appear in real time.

---

### Terminal 3 — (optional) Watch the database

```bash
# Open a psql shell inside the DB container
docker compose exec db psql -U postgres pig_ai_watch

# Then in psql:
\watch 2   SELECT pen_id, piglet_count, sow_posture, crushing_risk, timestamp
           FROM detections ORDER BY timestamp DESC LIMIT 10;
```

---

## Testing with a real video file (no camera required)

If you have any `.mp4` / `.avi` video file, you can use it as a "camera".  
The edge agent loops it automatically.

1. Edit `edge/.env`:
   ```
   CAMERA_PEN_1=/Users/you/Downloads/any_video.mp4
   ```

2. Install full edge dependencies:
   ```bash
   pip install ultralytics onnxruntime opencv-python-headless httpx python-dotenv numpy
   ```

3. Run the full agent (not the mock):
   ```bash
   python agent.py
   ```

---

## Testing with your Mac's camera (FaceTime / USB)

```
CAMERA_PEN_1=0   # built-in camera
CAMERA_PEN_2=1   # external USB camera (if attached)
```

Then run `python agent.py`.  
The model will try to detect pigs — it'll just see your face, but the API flow is fully tested.

---

## Environment Variables Summary

| File | Key | Value for local testing |
|------|-----|-------------------------|
| `pig-ai-watch/.env` | `EDGE_API_KEY` | `test-key-local` |
| `pig-ai-watch/.env` | `LOCAL_CAMERAS_ENABLED` | `false` |
| `edge/.env` | `CLOUD_API_URL` | `http://localhost:8000` |
| `edge/.env` | `EDGE_API_KEY` | `test-key-local` |

Both keys **must match** or you'll get HTTP 403.

---

## What each test validates

| Test | What is verified |
|------|-----------------|
| `mock_push.py` runs and gets HTTP 200 | Edge API auth, Detection model write, Event creation |
| Dashboard shows new events live | WebSocket broadcast from `ws_manager` |
| Alert appears in dashboard | Crushing-risk threshold logic in `edge.py` |
| `mock_push.py` gets HTTP 403 | Change `EDGE_API_KEY` in one file — confirms auth works |
| Stop backend, run mock — HTTP errors logged | Confirm offline buffer (`sync_buffer.py`) stores to SQLite |
| Restart backend — buffered rows appear | Confirm `flush_buffer()` sync loop drains SQLite |

---

## Troubleshooting

**`Cannot connect to http://localhost:8000`**  
→ Backend container not started yet. Run `docker compose up db backend`.

**HTTP 403 from edge API**  
→ `EDGE_API_KEY` in `edge/.env` and `pig-ai-watch/.env` don't match.

**`pen_id not found` error in API response**  
→ The backend expects pens to exist in the DB. Either:
  - Use the seed script: `docker compose run --rm seeder` (if it exists), or
  - Use `POST /api/pens` from the API docs (http://localhost:8000/docs) to create pen-1, pen-2, pen-3.

**`Import "httpx" could not be resolved`** (in VS Code)  
→ VS Code points to the main venv, not the edge venv. This is expected — ignore it. The edge scripts run fine in their own venv.

**Frontend build very slow the first time**  
→ Normal. Docker is building the React app. Subsequent `docker compose up` will be much faster.
