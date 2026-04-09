# 🏭 Edge Device Setup — RTSP to Cloud

Quick guide to start the edge agent and simulate edge-to-cloud detections with RTSP streams.

---

## Prerequisites

1. ✅ Backend deployed and running on your server
2. ✅ YOLO model downloaded at `/Users/arcelmacasling/prisma-atlas/models/pig_detection.pt`
3. ✅ Python 3.11+ with virtualenv
4. ✅ `ffmpeg` installed (required for RTSP publishing via `edge_pusher.py`)

---

## Quick Start (Connect to Production Server)

### 1. Update Edge Configuration

Edit `/Users/arcelmacasling/prisma-atlas/pig-ai-watch/edge/.env`:

```bash
nano .env
```

Change these lines:

```env
# Point to your production server
CLOUD_API_URL=http://YOUR_DROPLET_IP:8000

# Must match EDGE_API_KEY in your production .env
EDGE_API_KEY=your-edge-api-key-from-server

# Model path (relative to edge/ directory)
MODEL_PATH=../../models/pig_detection.pt
```

### 2. Configure Cameras

Choose one option:

#### **Option A: RTSP Cameras** (Recommended for production simulation)

If using MediaMTX or real IP cameras:

```env
CAMERA_PEN_1=rtsp://192.168.1.100:554/stream
CAMERA_PEN_2=rtsp://192.168.1.101:554/stream
CAMERA_PEN_3=rtsp://192.168.1.102:554/stream
```

#### **Option B: Webcam** (Quick local test)

```env
CAMERA_PEN_1=0    # Built-in webcam
# CAMERA_PEN_2=1  # USB camera
```

#### **Option C: Video File** (Looped playback)

```env
CAMERA_PEN_1=/path/to/pig-video.mp4
```

### 3. Install Dependencies

```bash
cd /Users/arcelmacasling/prisma-atlas/pig-ai-watch/edge

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install requirements
pip install -r requirements.txt
```

### 4. Run the Edge Agent

```bash
# Make sure you're in the edge directory with venv activated
python agent.py
```

You should see:

```
2026-03-23 12:00:00  edge-agent         INFO      Edge agent starting...
2026-03-23 12:00:01  edge-agent         INFO      Fetching camera config from cloud...
2026-03-23 12:00:01  edge-agent         INFO      Starting camera worker for pen-1 (rtsp://...)
2026-03-23 12:00:02  camera-pen-1       INFO      YOLO model loaded: ../../models/pig_detection.pt
2026-03-23 12:00:02  camera-pen-1       INFO      Camera opened successfully
2026-03-23 12:00:02  camera-pen-1       INFO      Starting inference loop (2.0s interval)...
```

---

## Testing the Pipeline

### Verify Edge → Cloud Communication

On your **local machine** (running edge agent):

```bash
# Edge agent logs should show successful pushes
# Look for: "Pushed detection to cloud: 200 OK"
```

On your **production server**:

```bash
# Check backend logs for incoming detections
docker logs pig-ai-watch-backend --tail 50 | grep edge

# Should see:
# "Edge detection received for pen-1"
```

### View Detections in the Web UI

1. Open your app: `http://YOUR_DROPLET_IP:3000`
2. Navigate to **Dashboard** or **Pens** page
3. Select a pen that has a camera configured
4. You should see:
   - Real-time detections appearing
   - Live video feed (if RTSP proxy is enabled)
   - Detection counts updating

---

## Troubleshooting

### "Connection refused" to cloud

**Problem:** Edge agent can't reach the production server.

**Solution:**
```bash
# Test connectivity from your local machine
curl http://YOUR_DROPLET_IP:8000/health

# If this fails, check firewall:
# - Port 8000 must be open on your droplet
# - Or use nginx reverse proxy (port 80/443)
```

### Repeated "timed out" warnings (cloud push / schedule fetch / buffer flush)

**Problem:** Edge camera connects locally, but cloud calls intermittently time out.

**Solution:**
1. Use HTTPS endpoint (recommended):
   - `CLOUD_API_URL=https://prisma-atlas.duckdns.org`
2. Increase edge HTTP timeouts + retries in `edge/.env`:

```env
# Agent cloud calls (config/model/schedule/buffer flush)
EDGE_HTTP_CONNECT_TIMEOUT=5
EDGE_HTTP_READ_TIMEOUT=30
EDGE_HTTP_WRITE_TIMEOUT=30
EDGE_HTTP_POOL_TIMEOUT=5
EDGE_HTTP_RETRIES=3

# Per-frame detection push
EDGE_PUSH_CONNECT_TIMEOUT=5
EDGE_PUSH_READ_TIMEOUT=20
EDGE_PUSH_WRITE_TIMEOUT=20
EDGE_PUSH_POOL_TIMEOUT=5
EDGE_PUSH_RETRIES=3
```

3. Restart the edge worker:

```bash
cd /Users/arcelmacasling/prisma-atlas/pig-ai-watch/edge
source venv/bin/activate
python agent.py
```

4. If using RTSP camera URLs, confirm subnet/IP typo (use `192.168.x.x`, not `92.168.x.x`).

### "Unauthorized" / 403 errors

**Problem:** `EDGE_API_KEY` mismatch.

**Solution:**
1. Check the key on your server:
   ```bash
   ssh root@YOUR_DROPLET_IP
   cat /opt/prisma-atlas/pig-ai-watch/.env | grep EDGE_API_KEY
   ```
2. Update your local edge `.env` to match exactly

### Camera not opening

**Problem:** RTSP stream unreachable or invalid.

**Solution:**
```bash
# Test RTSP stream with ffmpeg
ffmpeg -i rtsp://192.168.1.100:554/stream -frames:v 1 test.jpg

# Or use VLC to verify the stream works
```

### Model not found

**Problem:** `pig_detection.pt` not at the expected path.

**Solution:**
```bash
# Check if model exists
ls -lh /Users/arcelmacasling/prisma-atlas/models/pig_detection.pt

# Download if missing (placeholder - replace with actual download link)
# wget https://your-model-host.com/pig_detection.pt -O ../../models/pig_detection.pt
```

---

## Local Edge Recording Mechanics
The edge node also houses the `recording_worker.py`. This worker no longer records continuously to prevent drive bloat. When the `agent.py` processes an ONNX risk frame with `crushing_risk >= 0.4`, a callback activates the worker to encode a 300-second (5 minute) `ffmpeg` slice out of the RTSP buffer. The files are securely stashed locally on the edge disk. Users download them remotely via the cloud dashboard using `X-Edge-Key` file proxies.


## Production Auto-Start (No Manual `./start-edge.sh`)

Run both edge processes as OS-managed background services:

- `agent.py` for detection, schedule sync, and recording control
- `headless_proxy/edge_pusher.py` for RTSP publishing to cloud

### macOS Laptop (recommended for your current setup)

Use the bundled installer to register LaunchAgents for both processes:

```bash
cd /Users/arcelmacasling/prisma-atlas/pig-ai-watch/edge
./setup-macos-launchd.sh
```

Optional (non-technical client control app):

```bash
cd /Users/arcelmacasling/prisma-atlas/pig-ai-watch/edge
./install-edge-control-app.sh
```

This installs a clickable app at:

- `~/Applications/PRISMA Edge Control.app`

The app has simple buttons for:

- Start Edge
- Stop Edge
- Status
- Open Logs

Verify:

```bash
launchctl list | grep com.prisma.edge
tail -f /Users/arcelmacasling/prisma-atlas/pig-ai-watch/edge/logs/edge-agent.out.log
tail -f /Users/arcelmacasling/prisma-atlas/pig-ai-watch/edge/logs/edge-pusher.out.log
```

Notes:

- These LaunchAgents auto-start at user login and auto-restart on crash.
- Set macOS power settings to prevent sleep while on charger.

### Linux / Raspberry Pi (systemd)

```bash
cd /path/to/prisma-atlas/pig-ai-watch/edge

# Install both service units
sudo cp edge-agent.service /etc/systemd/system/
sudo cp edge-pusher.service /etc/systemd/system/

# Update paths/user in both files for your machine
sudo nano /etc/systemd/system/edge-agent.service
sudo nano /etc/systemd/system/edge-pusher.service

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable --now edge-agent edge-pusher

# Check status
sudo systemctl status edge-agent edge-pusher

# View logs
sudo journalctl -u edge-agent -u edge-pusher -f
```

---

## Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `CLOUD_API_URL` | `http://localhost:8000` | Backend API URL |
| `EDGE_API_KEY` | - | Shared secret for authentication |
| `MODEL_PATH` | `../../models/pig_detection.pt` | YOLO model path |
| `CAMERA_PEN_1` | - | Camera source for pen 1 (RTSP/file/index) |
| `INFERENCE_INTERVAL_SEC` | `2` | Seconds between inferences |
| `SYNC_INTERVAL_SEC` | `30` | Seconds between cloud syncs |
| `FRAME_WIDTH` | `1280` | Capture width |
| `FRAME_HEIGHT` | `720` | Capture height |
| `FRAME_FPS` | `15` | Target FPS |
| `CONFIDENCE_THRESHOLD` | `0.5` | YOLO confidence threshold |

---

## Next Steps

Once your edge agent is running successfully:

1. **Monitor Performance**
   - Check detection latency in logs
   - Monitor CPU/memory usage (`htop`)
   - Verify detections appear in web UI

2. **Add More Cameras**
   - Copy `CAMERA_PEN_1` config for additional pens
   - Edge agent auto-discovers cameras on restart

3. **Production Deployment**
   - Deploy on Raspberry Pi or edge device
   - Set up systemd service for auto-restart
   - Configure log rotation

---

Need help? Check the main project README or open an issue.
