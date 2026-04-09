# Edge RTSP Start Commands (Copy-Paste)

## RUN THIS NOW (LATEST)

### Status from live checks (already executed)

- MediaMTX is up and listening on `:8554`.
- UFW allows `8554/tcp`.
- Edge can reach `443` and `80` on the same host, but `8554` times out.
- Packet trace on droplet (`tcpdump` on `eth0`) captured zero inbound packets to `8554` during edge `nc` test.

Conclusion: traffic is blocked before it reaches the droplet host firewall/container, typically by DigitalOcean Cloud Firewall or upstream network policy.

### One Manual Action I Cannot Execute From CLI Here

I cannot edit your DigitalOcean Cloud Firewall without API credentials, so do this in the DO dashboard now:

1. Networking -> Firewalls -> pick the firewall attached to this droplet.
2. Add inbound rule:
	- Protocol: TCP
	- Port range: 8554
	- Sources: 0.0.0.0/0 and ::/0
3. Save and wait 20-60 seconds for propagation.

Then run this from edge immediately:

```bash
nc -vz -w 5 prisma-atlas.duckdns.org 8554
nc -vz -w 5 152.42.165.239 8554
```

If either succeeds, start:

```bash
cd /Users/arcelmacasling/prisma-atlas/pig-ai-watch/edge/headless_proxy
source /Users/arcelmacasling/prisma-atlas/.venv/bin/activate
python edge_pusher.py
```

### Cloud droplet

```bash
cd /opt/prisma-atlas/pig-ai-watch

docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --force-recreate mediamtx

docker ps | grep mediamtx
docker logs pig-ai-watch-mediamtx --tail 120

ss -ltnp | grep 8554 || echo "NO 8554 LISTENER ON HOST"
docker port pig-ai-watch-mediamtx

sudo ufw allow 8554/tcp
sudo ufw reload
sudo ufw status
```

If this all looks good but edge still times out, allow inbound TCP 8554 in DigitalOcean Cloud Firewall for this droplet, then retest from edge.

DigitalOcean Cloud Firewall rule to add:

- Inbound TCP, Port range `8554`, Sources `0.0.0.0/0` and `::/0`, applied to this droplet.

### Edge machine

```bash
nc -vz -w 5 prisma-atlas.duckdns.org 8554
nc -vz -w 5 152.42.165.239 8554
```

If both fail, open DigitalOcean Cloud Firewall inbound TCP 8554, then retest.

### Start edge services after port check passes

```bash
cd /Users/arcelmacasling/prisma-atlas/pig-ai-watch/edge
source /Users/arcelmacasling/prisma-atlas/.venv/bin/activate
python agent.py
```

```bash
cd /Users/arcelmacasling/prisma-atlas/pig-ai-watch/edge/headless_proxy
source /Users/arcelmacasling/prisma-atlas/.venv/bin/activate
python edge_pusher.py
```

Use this when camera setup says:

- `Waiting for edge publisher on this path. Start your edge proxy and try again.`
- edge pusher logs `Cannot reach cloud RTSP ...:8554 (timed out)`

### Edge publish smoke test (after both nc checks pass)

```bash
ffmpeg -re -stream_loop -1 -i /Users/arcelmacasling/prisma-atlas/pig-ai-watch/edge/headless_proxy/demo.mp4 -c copy -f rtsp rtsp://prisma-atlas.duckdns.org:8554/pen_1
```

If this connects, your network path is fixed and `python edge_pusher.py` should also publish.

## 1) Cloud Droplet: Start/Check MediaMTX

```bash
cd /path/to/pig-ai-watch

docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d mediamtx

docker ps | grep mediamtx

docker logs pig-ai-watch-mediamtx --tail 80

ss -ltnp | grep 8554
```

## 2) Cloud Droplet: Open Firewall Ports (UFW)

```bash
sudo ufw allow 8554/tcp
sudo ufw allow 8888/tcp
sudo ufw allow 8889/tcp
sudo ufw allow 9997/tcp
sudo ufw reload
sudo ufw status
```

If DigitalOcean Cloud Firewall is enabled, also allow inbound TCP `8554` there.

## 3) Edge Machine: Verify Cloud RTSP Reachability

```bash
nc -vz prisma-atlas.duckdns.org 8554
```

If timeout continues, set cloud target to droplet public IP in `edge/headless_proxy/.env`:

```env
CLOUD_IP=<YOUR_DROPLET_PUBLIC_IP>
CLOUD_RTSP_PORT=8554
```

## 4) Edge Machine: Start Edge Agent (detections -> cloud)

```bash
cd /Users/arcelmacasling/prisma-atlas/pig-ai-watch/edge
source /Users/arcelmacasling/prisma-atlas/.venv/bin/activate
python agent.py
```

## 5) Edge Machine: Start Headless Proxy (RTSP publish -> cloud)

```bash
cd /Users/arcelmacasling/prisma-atlas/pig-ai-watch/edge/headless_proxy
source /Users/arcelmacasling/prisma-atlas/.venv/bin/activate
python edge_pusher.py
```

Expected line when publishing is healthy:

- stream starts without repeated `Cannot reach cloud RTSP ... timed out`.

## 6) Quick Validation Checklist

- Cloud: `ss -ltnp | grep 8554` shows listener.
- Edge: `nc -vz ... 8554` succeeds.
- UI Camera Setup: no longer shows waiting for edge publisher.
- Edge pusher: no repeating timeout errors.

## 7) If Still Failing, Collect These Outputs

Run and save output:

```bash
# cloud droplet
docker logs pig-ai-watch-mediamtx --tail 120
sudo ufw status
ss -ltnp | grep -E '8554|8888|8889|9997'

# edge machine
nc -vz prisma-atlas.duckdns.org 8554
```

Then troubleshoot using those exact outputs.

---

## Cloud Testing Readiness (Step-by-Step)

Use this checklist before doing full cloud tests.

### 1) Deploy latest backend/frontend changes

You need the latest code that includes:

- `edge_camera_source` support
- edge worker auto add/remove/restart from cloud config
- camera setup wizard updates for Edge Node Stream local source fields

### 2) Run DB migration on cloud backend

```bash
cd /opt/prisma-atlas/pig-ai-watch/backend
alembic upgrade head
```

Expected: migration applies successfully (adds `pens.edge_camera_source`).

### 3) Restart cloud app services

```bash
cd /opt/prisma-atlas/pig-ai-watch
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build backend frontend mediamtx
docker ps
```

### 4) Confirm cloud RTSP is reachable externally

```bash
sudo ufw status
```

Required open ports: `80`, `443`, `8554`.

Also verify DigitalOcean Cloud Firewall allows inbound TCP `8554`.

### 5) Ensure edge device auto-start is enabled

Edge machine should auto-run after reboot/power return:

- BIOS power restore: ON
- edge agent service: enabled + restart always

### 6) Add camera in dashboard (no edge .env edit per camera)

In Dashboard -> Camera Setup -> Add New Camera:

1. Brand: `Edge Node Stream`
2. Stream Path: `pen_<id>` (example `pen_2`)
3. Edge Local Camera Source fields:
	- Camera IP
	- Username
	- Password
	- Local RTSP Path (example `stream1`)
4. Save

This stores both:

- cloud stream path (`camera_source`)
- edge local pull URL (`edge_camera_source`)

### 7) Validate end-to-end behavior

1. Wait 30-60 seconds for edge config refresh.
2. Open Pen Monitoring page.
3. Verify camera stream is live.
4. Verify detections continue posting.
5. Remove camera in dashboard and confirm stream/worker stops.
6. Re-add/replace camera details and confirm worker restarts cleanly.

### 8) Replay/storage proof

1. Let camera run for a few minutes.
2. Open `/behavior-logs` and verify rows increase.
3. Open `/replay` for same pen and click `Load Simulation`.
4. Open Replay `Video Recordings` tab and verify clips/storage.

If all steps pass, your cloud test environment is good for acceptance testing.

---

## ReplayPage Test Commands (Frontend + Backend)

### 1) Start local stack

```bash
cd /Users/arcelmacasling/prisma-atlas/pig-ai-watch
./start-dev.sh
```

Expected:

- Frontend at `http://localhost:3000`
- Backend at `http://localhost:8000`

### 2) Open replay page

```text
http://localhost:3000/replay
```

### 3) Backend API quick health checks (authenticated)

Use browser DevTools Console on the frontend page:

```javascript
const t = localStorage.getItem('access_token');
await fetch('/api/farrowing/replay/1?hours=24', { headers: { Authorization: `Bearer ${t}` } }).then(r => r.json());
await fetch('/api/recording/clips/1', { headers: { Authorization: `Bearer ${t}` } }).then(r => r.json());
await fetch('/api/recording/storage', { headers: { Authorization: `Bearer ${t}` } }).then(r => r.json());
```

### 4) UI validation checklist

- In `Telemetry Simulation` tab:
	- Set Pen and Hours.
	- Click `Load Simulation`.
	- Verify timeline slider, play/pause, step, speed, and metric cards update.
	- If no data in selected window, expect `No behavior data recorded...`.
- In `Video Recordings` tab:
	- Verify clip table loads from `/api/recording/clips/{pen_id}`.
	- Verify storage widget loads from `/api/recording/storage`.
	- Click `Download` and confirm `/api/recording/download/{clip_id}` returns MP4.

### 5) What controls data availability

- Replay simulation frames come from `behavior_logs` via `/api/farrowing/replay/{pen_id}?hours=...`.
- Recordings list comes from `recording_clips`.
- Storage bar comes from latest `storage_status` per pen.

If replay shows empty for all pens/hours, feed behavior logs first from live detection/edge agent, then reload Replay.
