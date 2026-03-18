# RTSP End-to-End Debug Guide (No Docker, No Raspberry Pi)

Use this when you want to verify that the full flow works:

Dashboard Camera Setup -> Backend Config API -> Edge Agent -> RTSP Capture -> Inference -> Detection Push -> Dashboard Updates

## 1) What happens in the flow

1. You save an RTSP camera URL for a pen in the dashboard UI.
2. Backend stores that URL in the pen camera field.
3. Edge agent calls `GET /api/edge/config` and receives `pen_id + camera_url` list.
4. Edge starts one worker per configured camera.
5. Worker opens RTSP stream, runs model inference, posts to `POST /api/edge/detections`.
6. Backend stores detections and frontend receives updated monitoring data.

## 2) Prerequisites

- Python venv exists at `/Users/arcelmacasling/prisma-atlas/.venv`
- Frontend dependencies installed in `frontend`
- Backend dependencies installed in `backend`
- Same `EDGE_API_KEY` in both files:
  - `.env` (project root)
  - `edge/.env`

## 3) Start services (local, non-docker)

### Terminal A: Backend

```bash
cd /Users/arcelmacasling/prisma-atlas/pig-ai-watch/backend
source /Users/arcelmacasling/prisma-atlas/.venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Terminal B: Frontend

```bash
cd /Users/arcelmacasling/prisma-atlas/pig-ai-watch/frontend
pnpm dev --host --port 3000
```

Open:
- Dashboard: http://localhost:3000
- API docs: http://localhost:8000/docs

## 4) Configure edge env

Edit `edge/.env`:

```env
CLOUD_API_URL=http://localhost:8000
EDGE_API_KEY=<same-value-as-root-.env>
MODEL_PATH=models/pig_detection.onnx
```

## 5) Add camera in dashboard UI

1. Go to camera setup page in dashboard.
2. Assign RTSP URL to a pen.
3. Save.

Important: Edge agent reads cloud config at startup. If you change camera URL later, restart edge agent.

## 6) Start edge agent

### Terminal C: Edge

```bash
cd /Users/arcelmacasling/prisma-atlas/pig-ai-watch/edge
source /Users/arcelmacasling/prisma-atlas/.venv/bin/activate
python agent.py
```

Expected logs:
- `Loaded X camera(s) from cloud config`
- `Starting camera worker`
- `Camera connected`

## 7) Verify each hop quickly

### A. Verify backend has camera config

```bash
curl -s -H "X-Edge-Key: <EDGE_API_KEY>" http://localhost:8000/api/edge/config
```

Expected: JSON with cameras array containing your pen and RTSP URL.

### B. Verify RTSP connection alone

```bash
cd /Users/arcelmacasling/prisma-atlas/pig-ai-watch/backend
source /Users/arcelmacasling/prisma-atlas/.venv/bin/activate
python test_rtsp_connection.py "rtsp://user:pass@ip:554/stream1"
```

Expected: successful frame capture and snapshot.

### C. Verify edge push path

Watch backend logs for detections arriving when edge agent is running.

## 8) If you do not have a real RTSP camera yet

Use local RTSP simulation via MediaMTX and a video file.

```bash
RTSP_SOURCE=/absolute/path/to/video.mp4 mediamtx /Users/arcelmacasling/prisma-atlas/pig-ai-watch/edge/mediamtx_test.yml
```

Then set dashboard camera URL to:

```text
rtsp://localhost:8554/pen-1
```

Restart edge agent and test.

## 9) Common failures and fixes

1. `403` on edge endpoints:
- `EDGE_API_KEY` mismatch between root `.env` and `edge/.env`.

2. `No cameras configured` in edge logs:
- Camera source not saved in dashboard for active pen.

3. Camera URL changed but edge still uses old one:
- Restart `edge/agent.py`.

4. RTSP opens in VLC but not in app:
- Run `backend/test_rtsp_connection.py` first.
- Confirm exact URL/credentials/port.

5. Frontend build fails before testing:
- Ensure latest fix in `frontend/src/components/RTSPVideoFeed.tsx` is present (timeout ref type).

## 10) Minimum green checklist

- Backend running on :8000
- Frontend running on :3000
- Dashboard camera saved
- `/api/edge/config` returns camera URL
- Edge logs show camera worker connected
- Backend receives detection posts
- Dashboard monitoring reflects detections
