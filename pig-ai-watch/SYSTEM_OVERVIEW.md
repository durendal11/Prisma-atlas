# Pig AI Watch — System Overview

An **AI-powered pig farrowing monitoring system** that uses real-time computer vision (YOLOv8) to detect pigs, monitor behavior, and alert farm workers to critical events like piglet crushing risk and difficult births.

---

## Table of Contents

1. [Real-Time AI Detection](#1-real-time-ai-detection-dual-pipeline)
2. [Crushing Risk Assessment](#2-crushing-risk-assessment)
3. [Farrowing Lifecycle Engine](#3-farrowing-lifecycle-engine-client-side-state-machine)
4. [Server-Side Farrowing Inference](#4-server-side-farrowing-inference)
5. [Sow Lifecycle Management](#5-sow-lifecycle-management)
6. [Farrowing Records & Piglet Tracking](#6-farrowing-records--piglet-tracking)
7. [Live Multi-Camera Monitoring](#7-live-multi-camera-monitoring)
8. [Camera Setup Wizard](#8-camera-setup-wizard)
9. [Dashboard & Analytics](#9-dashboard--analytics)
10. [Pre / Post Farrowing Comparison](#9a-pre--post-farrowing-comparison)
11. [Replay / Simulation Mode](#9b-replay--simulation-mode)
12. [Behavior Logging System](#10-behavior-logging-system)
11. [Task & Cleaning Schedule Manager](#11-task--cleaning-schedule-manager)
12. [Real-Time Alerts & Events](#12-real-time-alerts--events)
13. [Authentication & Security](#13-authentication--security)
14. [Internationalization](#14-internationalization)
15. [Desktop App](#15-desktop-app-electron)
16. [Deployment](#16-deployment)
17. [Tech Stack Summary](#17-tech-stack-summary)
18. [Scientific & Veterinary Foundations](#18-scientific--veterinary-foundations)

---

## 1. Real-Time AI Detection (Dual Pipeline)

- **Browser-side ONNX inference** — YOLOv8s-seg model runs directly in the browser via ONNX Runtime for zero-latency detection on video feeds
- **Server-side YOLO inference** — Python backend with Ultralytics YOLOv8 for server-processed frames
- **6 detection classes**: `piglet`, `sow-sit`, `sow-sleep`, `sow-sleep-lactate`, `sow-stand`, `sow-stand-feed`
- Post-processing: NMS (IoU 0.45), confidence filtering (0.25), bounding box + segmentation mask output

---

## 2. Crushing Risk Assessment

- Multi-factor risk score (0–1.0) combining:
  - **Sow posture base risk** (lateral lying = highest at 0.5)
  - **Proximity detection** — danger zone (50% of sow size) and warning zone (80%)
  - **Historical smoothing** — 30% weight to recent detection average
- 4-tier classification: Low / Medium / High / Critical with color-coded UI
- Backend inference: alerts when >50% piglet visibility drop sustained for 20 min while sow is lying

| Risk Value | Level    | UI Color | Action              |
|------------|----------|----------|---------------------|
| 0.00–0.24  | Low      | Green    | Normal monitoring   |
| 0.25–0.49  | Medium   | Yellow   | Increased attention |
| 0.50–0.74  | High     | Orange   | Alert caregiver     |
| 0.75–1.00  | Critical | Red      | Immediate response  |

---

## 3. Farrowing Lifecycle Engine (Client-Side State Machine)

A 956-line browser-side engine tracking the full farrowing lifecycle:

| State                  | Description                                                                 |
|------------------------|-----------------------------------------------------------------------------|
| `NORMAL_MONITORING`    | Baseline monitoring, collecting behavior patterns                           |
| `PREDICTION_HIGH`      | Pre-farrowing signs detected (posture switching >20/hr, lying time >50%)    |
| `FARROWING_STARTED`    | First piglet birth confirmed (confidence >0.80, visible for 10s)            |
| `FARROWING_ACTIVE`     | Active birthing — piglet counting with rolling buffers                      |
| `FARROWING_COMPLETED`  | No new piglet for 45 min → auto-completes                                  |

### Key Modules

1. **Pre-farrowing prediction** — posture transition counting (>20/hr), posture switching frequency inference (>5 events/hr), lying-time analysis (>50%), activity increase (>30%)
2. **Birth event detection** — piglet confidence >0.80, visibility for 10 seconds / 20 frames
3. **Farrowing active mode** — piglet counting with rolling buffers, 45-min no-new-piglet completion trigger
4. **Safety checks** — crushing risk via IoU overlap (0.6 threshold), motionless piglet detection (60s), abrupt posture changes (<2s)
5. **State transitions & data logging**

---

## 4. Server-Side Farrowing Inference

Rule-based alert engine (`farrowing_inference.py`) with biologically accurate thresholds:

| Alert Type                | Threshold / Logic                                                    |
|---------------------------|----------------------------------------------------------------------|
| **Crushing risk**         | Sow lying + >50% piglet count drop sustained for 20 min             |
| **Prolonged inactivity**  | No posture change for >45 min                                       |
| **Piglet missing**        | No piglets visible for >20 min                                      |
| **Dystocia**              | No new piglet for >45 min during active farrowing                   |
| **Pre-farrowing**         | >6 posture changes in 30 min                                        |

- 2-hour rolling detection history with alert cooldowns to prevent spam

---

## 5. Sow Lifecycle Management

Full lifecycle tracking through statuses:

```
active → pregnant → farrowing → lactating → weaned → active
```

### Gestation Milestones

| Day Range | Milestone                | Action                                              |
|-----------|--------------------------|-----------------------------------------------------|
| Day 12–18 | Embryo implantation      | Minimize stress, avoid regrouping                   |
| Day 18–24 | Return-to-heat check     | Watch for estrus signs, confirm pregnancy held      |
| Day 24–30 | Ultrasound confirmation  | Verify viable pregnancy via ultrasound              |
| Day ~114  | Expected farrowing       | Move to farrowing crate, begin close monitoring     |

- CRUD sow profiles with breed, weight, pen assignment, last breeding date, expected farrowing date

---

## 6. Farrowing Records & Piglet Tracking

- **Farrowing records**: total born, born alive, stillborn, mummified, sow condition, abnormalities
- **Individual piglet management**: birth weight (avg 1.2–1.5 kg, at-risk <1.0 kg), birth order, sex, status
- **Cross-fostering** — transfer piglets between sows with full audit trail
- **Wean endpoint** — transition sow from lactating to weaned status
- **Due-sow urgency tracking** (critical / high / normal) with configurable lookahead window
- **30-day statistics**: avg litter size, stillborn rate, intervention count, total piglets born

---

## 6b. Advanced Local Edge Recording
Instead of continuous cloud recording, the system utilizes "Smart Edge Recording". Video chunking runs natively on edge devices and triggers **only** when crushing risk spikes (>= 40%) are detected by the dual-pipeline ONNX YOLO worker. 
- **Local Storage:** Chunks (.mp4) are saved directly on the edge, bypassing heavy cloud/VRAM bandwidth.
- **UI Gating:** Frontend continuous recording functionality has been deprecated explicitly in favor of "Detection Only" to maximize disk retention dynamically.

## 7. Live Multi-Camera Monitoring

- **Multi-layout grid**: 1×1, 2×2, 3×2 camera views
- RTSP, HTTP/MJPEG, and USB camera support
- Real-time bounding box overlays with configurable confidence threshold
- Per-pen **RiskGauge** widget with WebSocket live updates
- **IntersectionObserver** — only processes visible camera feeds for performance
- Adjustable frame skip for client-side ONNX detection

---

## 8. Camera Setup Wizard

- Multi-brand camera database (Hikvision, Dahua, Axis, TP-Link, Reolink, Foscam, etc.)
- Guided RTSP URL construction with per-brand templates
- Connection testing with status indicators (`untested` → `testing` → `connected` / `failed`)
- Camera-to-pen assignment
- Network camera auto-scanning (`scan_cameras.py`)

### Supported Camera Types

- ✅ RTSP IP Cameras (Hikvision, Dahua, Axis, Foscam, TP-Link, Reolink, etc.)
- ✅ HTTP/MJPEG Cameras
- ✅ USB Cameras (built-in or external webcams)
- ✅ Mixed configurations

---

## 9. Dashboard & Analytics

- **Dashboard stats**: total pens, total sows, lactating sows, active alerts, recent events
- **Per-pen status** overview across all pens
- **Behavior analytics per pen**: avg confidence, detection density, movement estimation, farrowing likelihood score
- **Farrowing likelihood (0–100)** — 5-component composite score (posture switching, movement, lying time, feeding reduction, activity) displayed with component breakdown bars and 48h trend sparkline
- **Auto-alert** when farrowing likelihood ≥ 70
- **30-day farrowing statistics**: avg litter size, stillborn rate, intervention count
- **Health scores** (0–100) based on lactation/feeding behavior and risk levels
- **Recharts visualizations** for trend analysis

---

## 9a. Pre / Post Farrowing Comparison

- Compare sow behavior **before vs after** a completed farrowing event
- **Timeline chart**: health score, crushing risk, and nursing % bucketed into 4h intervals spanning the comparison window
- **Activity distribution bar chart**: nursing, feeding, sleeping percentages — pre vs post side-by-side
- **Summary cards**: health score, nursing %, crushing risk, piglet count change (pre → post with diff)
- **Farrowing outcome line**: born alive, total, stillborn, duration, sow condition
- **API**: `GET /api/farrowing/pre-post-comparison/{sow_id}?window_hours=48`

---

## 9b. Replay / Simulation Mode

- **Replay recorded behavior data** from any pen through the same analytics pipeline
- **Transport controls**: play / pause / step-forward / step-back / fast-forward (1× 2× 4× 8×)
- **Timeline scrubber**: drag to any frame in the dataset
- **Per-frame metrics display**: posture, piglet count, crushing risk, health score, nursing status, movement level
- **Rolling chart**: health, risk, and piglet count in a ±25 frame window around the current position
- **Configurable**: pen selection, 6h–168h window
- **API**: `GET /api/farrowing/replay/{pen_id}?hours=24`

---

## 10. Behavior Logging System

- Automatic logging every **12 seconds** while detection is active
- Storage: PostgreSQL `behavior_logs` table

### Data Captured Per Log

| Field                | Description                                |
|----------------------|--------------------------------------------|
| `piglet_count`       | Number of piglets detected                 |
| `sow_posture`        | standing, sitting, sleeping, lactating, feeding |
| `posture_confidence` | 0–1 confidence score                      |
| `activity_level`     | resting, active, feeding, lactating        |
| `crushing_risk`      | 0–1 risk score                             |
| `health_score`       | 0–100 health score                         |
| `movement_level`     | stationary, low, moderate, high            |
| `cleanliness_score`  | 0–1 (environment estimate)                 |
| `wetness_score`      | 0–1 (environment estimate)                 |

- Historical analytics: posture distribution, lactation rate, restlessness index, sleeping ratio

---

## 11. Task & Cleaning Schedule Manager

### Task Management (19 API endpoints)

- Full CRUD with categories, priorities, assignees, due dates
- **Checklist support** per task with completion progress tracking
- **Task templates** with estimated duration and trigger types
- **Auto-generate farrowing tasks** for a specific sow
- **Dashboard summary**: total, pending, in-progress, completed, overdue, due-today

### Pen Cleaning Schedule

- Cleanliness/wetness scoring per pen
- Configurable cleaning intervals
- Overdue tracking and alerts
- Mark-as-cleaned workflow

---

## 12. Real-Time Alerts & Events

- **WebSocket-based** push notifications (`/ws/detections`, `/ws/detections/{pen_id}`)
- Alert types:
  - 🔴 Crushing risk
  - 🟠 Prolonged inactivity (no posture change >45 min)
  - 🟡 Piglet missing (not visible >20 min)
  - 🔴 Dystocia (no new piglet >45 min during active farrowing)
  -  Posture switching anomaly (>6 changes in 30 min)
- Event logging with type classification
- Configurable alert thresholds via environment variables

---

## 13. Authentication & Security

- **JWT-based authentication** (login, register, token refresh)
- Protected frontend routes via `ProtectedRoute` component
- Role-based access (admin seeding via `seed_admin.py`)
- Configurable token expiry (`ACCESS_TOKEN_EXPIRE_MINUTES`)

---

## 14. Internationalization

- **Bilingual UI**: English (`en`) and Filipino/Tagalog (`fil`)
- Type-safe translation keys covering:
  - Dashboard labels and statistics
  - Sow/piglet terminology
  - Alert text and severity levels
  - Farrowing likelihood descriptions
  - Health and cleanliness scores

---

## 15. Desktop App (Electron)

- Electron wrapper with custom splash screen
- Bundles the React frontend for offline/desktop deployment
- Configured via `forge.config.js`
- Platform-independent (macOS, Windows, Linux)

---

## 16. Deployment

### Docker Compose (4 services + optional seed profile)

| Service    | Image / Build          | Port | Purpose                              |
|------------|------------------------|------|--------------------------------------|
| `db`       | `postgres:15-alpine`   | 5432 | PostgreSQL database with healthchecks|
| `backend`  | `./backend/Dockerfile` | 8000 | FastAPI API server (asyncpg)         |
| `frontend` | `./frontend/Dockerfile`| 3000 | React app (dashboard + `/welcome`, nginx proxies `/api`) |
| `seed`     | `./backend/Dockerfile` | —    | One-shot migrations + seed data      |

- Persistent volumes: `postgres_data` (DB), `model_cache` (YOLO weights)
- Health-check dependencies, `restart: unless-stopped`
- **Alembic migrations** for schema management (6 versions)

### Manual Start

```bash
# Full stack
cd pig-ai-watch && ./start-dev.sh

# Backend only
cd backend && uvicorn app.main:app --host 127.0.0.1 --port 8000

# Desktop (Electron)
cd desktop && NODE_ENV=development npx electron .
```

---

## 17. Tech Stack Summary

| Layer      | Technology                                                    |
|------------|---------------------------------------------------------------|
| Backend    | FastAPI, Python 3.11, SQLAlchemy + asyncpg, PostgreSQL 15     |
| AI / ML    | YOLOv8s-seg (ONNX Runtime + Ultralytics), OpenCV              |
| Frontend   | React 18, TypeScript, Tailwind CSS, Zustand, Recharts         |
| Real-time  | WebSockets, MJPEG streaming                                   |
| Desktop    | Electron                                                      |
| Deployment | Docker Compose, Alembic, nginx                                |
| i18n       | English + Filipino (Tagalog)                                   |

---

## 18. Scientific & Veterinary Foundations

The algorithms and heuristics in Pig AI Watch are based on established veterinary science and Precision Livestock Farming (PLF) research:

- **Gestation & Physical Timelines:** The system enforces the standard **114-day** (3 months, 3 weeks, 3 days) gestation cycle, a universal veterinary standard documented in resources like the *Merck Veterinary Manual*.
- **Time-to-Farrow Behavior Detection:** Farrowing likelihood increases based on postural changes (e.g., rapid standing-to-lying transitions). Research indicates a significant spike in restlessness 12–24 hours prior to farrowing (*Applied Animal Behaviour Science*).
- **Crushing Risk Postures:** The `POSTURE_BASE_RISK` explicitly weights `lying_lateral` (laying on the side) as the highest risk. Veterinary behavioral studies uniformly show most crushing events occur when a sow rolls from a sternal to a lateral posture.
- **Deep Learning for PLF:** Using YOLOv8 and Euclidean distance bounding box tracking for detecting spatial proximity between sows and piglets is widely validated in modern Precision Livestock Farming literature.

---

## API Endpoint Summary

### Authentication
| Method | Endpoint              | Description            |
|--------|-----------------------|------------------------|
| POST   | `/api/auth/login`     | Login and get JWT token|
| POST   | `/api/auth/register`  | Register new user      |
| GET    | `/api/auth/me`        | Get current user       |

### Dashboard
| Method | Endpoint              | Description            |
|--------|-----------------------|------------------------|
| GET    | `/api/dashboard/stats`| Overall farm statistics|
| GET    | `/api/dashboard/pen-status` | All pen statuses |

### Sows
| Method | Endpoint              | Description            |
|--------|-----------------------|------------------------|
| GET    | `/api/sows`           | List all sows          |
| POST   | `/api/sows`           | Create sow             |
| GET    | `/api/sows/{id}`      | Get sow details        |
| PUT    | `/api/sows/{id}`      | Update sow             |
| DELETE | `/api/sows/{id}`      | Delete sow             |

### Pens
| Method | Endpoint                   | Description         |
|--------|----------------------------|---------------------|
| GET    | `/api/pens`                | List all pens       |
| POST   | `/api/pens`                | Create pen          |
| GET    | `/api/pens/{id}`           | Get pen details     |
| PUT    | `/api/pens/{id}`           | Update pen          |
| POST   | `/api/pens/test-camera`    | Test camera connection |

### Farrowing
| Method | Endpoint                              | Description                    |
|--------|---------------------------------------|--------------------------------|
| GET    | `/api/farrowing/records`              | List farrowing records         |
| POST   | `/api/farrowing/records`              | Create farrowing record        |
| GET    | `/api/farrowing/records/{id}`         | Get farrowing record           |
| PUT    | `/api/farrowing/records/{id}`         | Update farrowing record        |
| POST   | `/api/farrowing/records/{id}/complete`| Complete farrowing             |
| POST   | `/api/farrowing/records/{id}/wean`    | Wean sow (lactating → weaned) |
| POST   | `/api/farrowing/records/{id}/piglets` | Add piglet to record           |
| GET    | `/api/farrowing/piglets/{id}`         | Get piglet details             |
| PUT    | `/api/farrowing/piglets/{id}`         | Update piglet                  |
| POST   | `/api/farrowing/piglets/{id}/cross-foster` | Cross-foster piglet      |
| GET    | `/api/farrowing/statistics`           | 30-day farrowing stats         |
| GET    | `/api/farrowing/due-sows`             | Sows due to farrow             |
| GET    | `/api/farrowing/pre-post-comparison/{sow_id}` | Pre/post behavior comparison |
| GET    | `/api/farrowing/replay/{pen_id}`      | Replay data for simulation     |
| POST   | `/api/farrowing/ai-monitor/state`     | Push AI monitoring state       |

### Behavior & Analytics
| Method | Endpoint                                    | Description                 |
|--------|---------------------------------------------|-----------------------------|
| POST   | `/api/behavior/log`                         | Log behavior data           |
| GET    | `/api/behavior/logs/{pen_id}`               | Get logs for a pen          |
| GET    | `/api/behavior/analytics/{pen_id}`          | Pen behavior analytics      |
| GET    | `/api/behavior/farrowing-likelihood/{pen_id}`| Farrowing prediction (0-100)  |
| GET    | `/api/behavior/farrowing-likelihood-trend/{pen_id}`| 48h trend data         |
| GET    | `/api/behavior/health-summary`              | Cross-pen health summary    |
| GET    | `/api/behavior/pen-environment/{pen_id}`    | Pen environment metrics     |

### Detection
| Method | Endpoint              | Description               |
|--------|-----------------------|---------------------------|
| POST   | `/api/detect/frame`   | Server-side YOLO detection|

### Alerts & Events
| Method | Endpoint              | Description            |
|--------|-----------------------|------------------------|
| GET    | `/api/alerts`         | List alerts            |
| POST   | `/api/alerts`         | Create alert           |
| PATCH  | `/api/alerts/{id}`    | Update alert status    |
| GET    | `/api/events`         | List event logs        |
| POST   | `/api/events`         | Create event           |
| GET    | `/api/events/types`   | Get event types        |

### Video Streaming
| Method | Endpoint                       | Description            |
|--------|--------------------------------|------------------------|
| GET    | `/api/stream/{pen_id}`         | MJPEG video stream     |
| GET    | `/api/stream/{pen_id}/snapshot`| Single frame capture   |

### WebSocket
| Protocol | Endpoint                     | Description              |
|----------|------------------------------|--------------------------|
| WS       | `/ws/detections`             | All real-time detections |
| WS       | `/ws/detections/{pen_id}`    | Per-pen detections       |

### Tasks & Cleaning
| Method | Endpoint                                           | Description                  |
|--------|----------------------------------------------------|------------------------------|
| GET    | `/api/tasks`                                       | List all tasks               |
| POST   | `/api/tasks`                                       | Create task                  |
| GET    | `/api/tasks/my-tasks`                              | Current user's tasks         |
| GET    | `/api/tasks/dashboard-summary`                     | Task counts summary          |
| GET    | `/api/tasks/{id}`                                  | Get task                     |
| PUT    | `/api/tasks/{id}`                                  | Update task                  |
| DELETE | `/api/tasks/{id}`                                  | Delete task                  |
| POST   | `/api/tasks/{id}/start`                            | Begin task                   |
| POST   | `/api/tasks/{id}/complete`                         | Complete task                |
| GET    | `/api/tasks/templates`                             | List task templates          |
| POST   | `/api/tasks/templates`                             | Create template              |
| POST   | `/api/tasks/templates/{id}/create-task`            | Instantiate from template    |
| POST   | `/api/tasks/generate-farrowing-tasks/{sow_id}`     | Auto-generate farrowing tasks|
| GET    | `/api/tasks/farrowing-schedule`                    | Farrowing task schedule      |
| GET    | `/api/tasks/cleaning-schedule`                     | All pen cleaning schedules   |
| GET    | `/api/tasks/cleaning-schedule/{pen_id}`            | Single pen schedule          |
| POST   | `/api/tasks/cleaning-schedule/{pen_id}/create-task`| Create cleaning task         |
| PUT    | `/api/tasks/cleaning-schedule/{pen_id}/interval`   | Set cleaning interval        |
| POST   | `/api/tasks/cleaning-schedule/{pen_id}/mark-cleaned`| Record cleaning             |
