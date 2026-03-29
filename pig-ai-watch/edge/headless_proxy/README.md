# Prisma Atlas Windows Edge Proxy

This folder contains a simple, headless Python script designed to run on a farm's local Windows laptop. It reads local camera streams (`192.168.x.x`) and explicitly proxies them up to the DigitalOcean Cloud server using `ffmpeg`.

## Why is there no UI here?
You do not need a UI on the edge node! The edge proxy is meant to be set up once and forgotten about. The actual visualization and camera management is handled safely on the Cloud Dashboard.

### Prerequisites (Windows)
1. Install Python 3.10+
2. Install FFmpeg (and ensure it is in your system PATH).
3. Install the required package:
   ```cmd
   pip install python-dotenv
   ```

### Setup
1. Copy `.env.example` to `.env`.
2. Edit `.env` with your actual local network camera RTSP feeds:
   ```env
   CLOUD_IP=134.199.152.118
   CLOUD_RTSP_PORT=8554
   PUBLISH_RETRY_SEC=5
   TCP_CHECK_TIMEOUT_SEC=5
   FARM_CAM_1=rtsp://admin:admin123@192.168.1.100:554/stream1
   FARM_CAM_2=rtsp://admin:admin123@192.168.1.101:554/stream1
   ```

### Running the Proxy
Open a terminal and run:
```cmd
python edge_pusher.py
```
This will capture the local video feeds and effortlessly push them to the cloud at `rtsp://134.199.152.118:8554/pen_1` and `pen_2` respectively.

### If you see "Connection to ...:8554 failed: Operation timed out"

This usually means the cloud RTSP port is not reachable from your edge network.

1. Verify connectivity from edge machine:
   ```bash
   python - <<'PY'
   import socket
   h='prisma-atlas.duckdns.org'; p=8554
   s=socket.socket(); s.settimeout(5)
   try:
      s.connect((h,p)); print('OK')
   except Exception as e:
      print('FAIL:', e)
   finally:
      s.close()
   PY
   ```
2. On cloud server, ensure MediaMTX is listening and firewall allows TCP 8554.
3. Keep `CLOUD_IP` as a public host/domain (not local LAN IP) in edge `.env`.

### Adding cameras to Dashboard
Once this script is running, open your DigitalOcean Cloud Dashboard (`http://134.199.152.118:3000`), click **Add New Camera**, choose **Edge Node Stream**, and specify `pen_1` (or whatever ID was configured). The stream proxy configuration will automatically map to your local video feed!
