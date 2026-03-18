# IP Camera Quick Reference Card

## 🎯 Quick Setup Commands

```bash
# 1. Copy and edit environment file
cd backend
cp .env.example .env
nano .env  # or use your preferred editor

# 2. Test your camera connection
python test_camera.py "rtsp://admin:password@192.168.1.100:554/stream1"

# 3. Start the backend server
uvicorn app.main:app --reload
```

## 📝 Common Camera URL Formats

| Brand | RTSP URL Format |
|-------|----------------|
| **Hikvision** | `rtsp://user:pass@IP:554/Streaming/Channels/101` |
| **Dahua** | `rtsp://user:pass@IP:554/cam/realmonitor?channel=1&subtype=0` |
| **Axis** | `rtsp://user:pass@IP/axis-media/media.amp` |
| **Foscam** | `rtsp://user:pass@IP:554/videoMain` |
| **TP-Link** | `rtsp://user:pass@IP:554/stream1` |
| **Reolink** | `rtsp://user:pass@IP:554/h264Preview_01_main` |
| **Amcrest** | `rtsp://user:pass@IP:554/cam/realmonitor?channel=1&subtype=0` |
| **Wyze** | `rtsp://user:pass@IP/live` |

## ⚙️ .env Configuration Examples

### Example 1: Three RTSP Cameras
```bash
CAMERA_PEN_1=rtsp://admin:password123@192.168.1.100:554/stream1
CAMERA_PEN_2=rtsp://admin:password123@192.168.1.101:554/stream1
CAMERA_PEN_3=rtsp://admin:password123@192.168.1.102:554/stream1
```

### Example 2: Mixed (RTSP + HTTP + USB)
```bash
CAMERA_PEN_1=rtsp://admin:pass@192.168.1.100:554/stream1
CAMERA_PEN_2=http://192.168.1.101:8080/video
CAMERA_PEN_3=0
```

### Example 3: Using Sub-Streams (Lower Bandwidth)
```bash
# Hikvision sub-streams (channel 102 = sub-stream)
CAMERA_PEN_1=rtsp://admin:pass@192.168.1.100:554/Streaming/Channels/102
CAMERA_PEN_2=rtsp://admin:pass@192.168.1.101:554/Streaming/Channels/102

# Dahua sub-streams (subtype=1 = sub-stream)
CAMERA_PEN_3=rtsp://admin:pass@192.168.1.102:554/cam/realmonitor?channel=1&subtype=1
```

## 🔧 Connection Settings (Optional)

```bash
# Optimize for low latency
CAMERA_BUFFER_SIZE=1

# Timeouts (in milliseconds)
CAMERA_OPEN_TIMEOUT_MS=10000    # 10 seconds
CAMERA_READ_TIMEOUT_MS=5000     # 5 seconds

# Reconnection
CAMERA_RECONNECT_ATTEMPTS=3
CAMERA_RECONNECT_DELAY_SEC=2
```

## 🔍 Finding Your Camera IP

### Method 1: Router Admin Panel
1. Open `http://192.168.1.1` (or your router's IP)
2. Login to admin panel
3. Check "Connected Devices" or "DHCP Client List"
4. Find camera by name or MAC address

### Method 2: Camera Mobile App
1. Open camera manufacturer's app
2. Go to camera settings
3. Look for "Network" or "Device Info"
4. Note the IP address

### Method 3: Network Scanner
```bash
# Install nmap (if not installed)
brew install nmap  # macOS
sudo apt install nmap  # Linux

# Scan your network
nmap -sn 192.168.1.0/24

# Look for devices on common camera ports
nmap -p 554,80,8000,8080 192.168.1.0/24
```

## 🧪 Testing Commands

### Test Connection
```bash
# Basic test (10 seconds)
python test_camera.py "rtsp://admin:pass@192.168.1.100:554/stream1"

# Extended test (30 seconds)
python test_camera.py "rtsp://admin:pass@192.168.1.100:554/stream1" 30

# Test USB camera
python test_camera.py 0

# Interactive mode
python test_camera.py
```

### Test with VLC Media Player
```bash
# macOS
open -a VLC "rtsp://admin:pass@192.168.1.100:554/stream1"

# Linux
vlc "rtsp://admin:pass@192.168.1.100:554/stream1"

# Windows (Command Prompt)
"C:\Program Files\VideoLAN\VLC\vlc.exe" "rtsp://admin:pass@192.168.1.100:554/stream1"
```

### Test Port Connectivity
```bash
# Check if RTSP port (554) is open
nc -zv 192.168.1.100 554

# Or using telnet
telnet 192.168.1.100 554

# Or using curl (for HTTP cameras)
curl -I http://192.168.1.100:8080
```

### Get Camera Stream Info (ffmpeg)
```bash
# Install ffmpeg if needed
brew install ffmpeg  # macOS
sudo apt install ffmpeg  # Linux

# Get stream information
ffprobe -i "rtsp://admin:pass@192.168.1.100:554/stream1"

# Test if stream is working
ffmpeg -i "rtsp://admin:pass@192.168.1.100:554/stream1" -frames:v 1 test.jpg
```

## 🐛 Troubleshooting Quick Fixes

### Problem: "Failed to open camera source"
```bash
# 1. Test with ping
ping 192.168.1.100

# 2. Verify credentials by accessing web interface
open http://192.168.1.100

# 3. Try in VLC
vlc "rtsp://admin:pass@192.168.1.100:554/stream1"

# 4. Check firewall
sudo ufw status  # Linux
```

### Problem: "Connection timeout"
```bash
# Increase timeouts in .env
CAMERA_OPEN_TIMEOUT_MS=15000
CAMERA_READ_TIMEOUT_MS=10000
```

### Problem: "Lots of frame drops"
```bash
# Use sub-stream instead of main stream
# Change from /stream1 to /stream2 or /Streaming/Channels/102

# Or reduce buffer size
CAMERA_BUFFER_SIZE=1
```

### Problem: "Camera disconnects frequently"
```bash
# Increase reconnection attempts
CAMERA_RECONNECT_ATTEMPTS=5
CAMERA_RECONNECT_DELAY_SEC=3
```

## 📊 System Status Commands

### Check if backend is running
```bash
# Check process
ps aux | grep uvicorn

# Check port 8000
lsof -i :8000
netstat -an | grep 8000
```

### View backend logs
```bash
cd backend
tail -f logs/app.log  # if logging to file

# Or check console output where uvicorn is running
```

### Test API endpoints
```bash
# Check stream status (requires auth token)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/api/stream/pen_1/status

# Health check
curl http://localhost:8000/health  # if endpoint exists
```

## 🎬 Full Startup Sequence

```bash
# 1. Navigate to project
cd /path/to/pig-ai-watch

# 2. Configure cameras
cd backend
nano .env  # Add your CAMERA_PEN_X URLs

# 3. Test first camera
python test_camera.py "$CAMERA_PEN_1"

# 4. Start backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 5. In another terminal, start frontend (if needed)
cd ../frontend
npm run dev
```

## 💡 Pro Tips

1. **Use sub-streams** for better performance (lower resolution)
2. **Test with VLC first** before configuring in .env
3. **Use wired Ethernet** for critical cameras when possible
4. **Keep camera firmware updated** for security and stability
5. **Use strong passwords** - never use defaults
6. **Document your camera IPs** - keep a list of camera locations and IPs
7. **Reserve IP addresses** - set static IPs or DHCP reservations in router

## 📱 Mobile App RTSP URLs

Most camera apps don't show RTSP URLs directly. Try these:

### Tapo/TP-Link Cameras
1. Enable RTSP in Tapo app (Device Settings → Advanced Settings → RTSP)
2. URL: `rtsp://username:password@IP:554/stream1`

### Wyze Cameras
1. Install RTSP firmware (available from Wyze website)
2. URL: `rtsp://username:password@IP/live`

### Reolink Cameras
1. Enable RTSP in app (Device Settings → Network → Advanced)
2. URL: `rtsp://username:password@IP:554/h264Preview_01_main`

---

**Save this reference card for quick access!** 🚀
