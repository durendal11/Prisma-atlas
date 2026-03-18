# IP Camera Setup Guide

This guide will help you connect wireless IP cameras or CCTV systems to the Pig AI Watch monitoring system.

## Quick Start

### 1. Find Your Camera's RTSP URL

**Option A: Check Camera Documentation**
- Look for "RTSP URL" or "Stream URL" in your camera's manual
- Common format: `rtsp://username:password@IP_ADDRESS:554/path`

**Option B: Use ONVIF Device Manager** (Recommended)
1. Download [ONVIF Device Manager](https://sourceforge.net/projects/onvifdm/)
2. Scan your network
3. Select your camera
4. Find "Live Video" → "Profile" → Copy the RTSP URL

**Option C: Camera Web Interface**
- Log into your camera's web interface
- Look for "Network Settings" or "Streaming"
- Find RTSP or stream URL

**Option D: Test with VLC Media Player**
1. Open VLC
2. Media → Open Network Stream
3. Try: `rtsp://username:password@CAMERA_IP:554/stream1`
4. Adjust the path until video plays

### 2. Configure Your Cameras

Edit the `.env` file in the `backend/` directory:

```bash
# Copy the example configuration
cp .env.example .env

# Edit the .env file
nano .env
```

Add your camera URLs:

```bash
# Example: 3 RTSP cameras
CAMERA_PEN_1=rtsp://admin:password123@192.168.1.100:554/stream1
CAMERA_PEN_2=rtsp://admin:password123@192.168.1.101:554/stream1
CAMERA_PEN_3=rtsp://admin:password123@192.168.1.102:554/stream1
```

### 3. Test Your Camera

Use the test utility to verify the connection:

```bash
cd backend

# Test a specific camera
python test_camera.py "rtsp://admin:password@192.168.1.100:554/stream1"

# Test USB camera
python test_camera.py 0

# Interactive mode (will prompt for URL)
python test_camera.py
```

The test will:
- ✅ Verify connection
- 📊 Show camera resolution and FPS
- 📸 Save a test snapshot
- 📈 Provide connection statistics

### 4. Start the System

```bash
# Start the backend
cd backend
uvicorn app.main:app --reload

# The system will automatically connect to configured cameras
```

## Supported Camera Types

### RTSP IP Cameras (Most Common)
```bash
CAMERA_PEN_1=rtsp://username:password@192.168.1.100:554/stream1
```

### HTTP/MJPEG Cameras
```bash
CAMERA_PEN_1=http://192.168.1.100:8080/video
CAMERA_PEN_2=http://username:password@192.168.1.101/mjpg/video.mjpg
```

### USB Cameras
```bash
CAMERA_PEN_1=0  # First USB camera
CAMERA_PEN_2=1  # Second USB camera
```

### Mixed Configuration
```bash
CAMERA_PEN_1=rtsp://admin:pass@192.168.1.100:554/stream1  # IP Camera
CAMERA_PEN_2=0                                              # USB Camera
CAMERA_PEN_3=http://192.168.1.102:8080/video              # HTTP Camera
```

## Brand-Specific RTSP URLs

### Hikvision
```
rtsp://username:password@IP:554/Streaming/Channels/101
rtsp://username:password@IP:554/Streaming/Channels/102  (sub-stream)
```

### Dahua
```
rtsp://username:password@IP:554/cam/realmonitor?channel=1&subtype=0  (main)
rtsp://username:password@IP:554/cam/realmonitor?channel=1&subtype=1  (sub)
```

### Axis
```
rtsp://username:password@IP/axis-media/media.amp
rtsp://username:password@IP/axis-media/media.amp?videocodec=h264
```

### Foscam
```
rtsp://username:password@IP:554/videoMain
rtsp://username:password@IP:554/videoSub
```

### TP-Link / Tapo
```
rtsp://username:password@IP:554/stream1
rtsp://username:password@IP:554/stream2  (lower quality)
```

### Reolink
```
rtsp://username:password@IP:554/h264Preview_01_main
rtsp://username:password@IP:554/h264Preview_01_sub
```

### Amcrest
```
rtsp://username:password@IP:554/cam/realmonitor?channel=1&subtype=0
```

### Wyze (with RTSP firmware)
```
rtsp://username:password@IP/live
```

## Network Setup

### WiFi Connection
1. Connect camera to your WiFi network using camera's app or web interface
2. Note the camera's IP address (usually in camera settings or router admin panel)
3. Ensure camera and server are on the same network or have network access

### Find Camera IP Address

**Method 1: Router Admin Panel**
- Log into your router (usually http://192.168.1.1)
- Check connected devices list
- Find your camera by MAC address or device name

**Method 2: Network Scanner**
- Use [Angry IP Scanner](https://angryip.org/)
- Scan your network range (e.g., 192.168.1.1-254)
- Check ports 80, 554, 8000, 8080 for cameras

**Method 3: Camera App**
- Most IP cameras have mobile apps
- App usually shows the camera's IP address in settings

## Troubleshooting

### Camera Won't Connect

**Check 1: Can you ping the camera?**
```bash
ping 192.168.1.100
```

**Check 2: Test with VLC Media Player**
```
1. Open VLC
2. Media → Open Network Stream
3. Enter your RTSP URL
4. If it works in VLC, the URL is correct
```

**Check 3: Verify credentials**
- Wrong username/password is the most common issue
- Try accessing camera's web interface with same credentials

**Check 4: Firewall**
```bash
# Temporarily disable firewall to test
sudo ufw disable  # Linux
# Or check Windows/Mac firewall settings
```

**Check 5: Network connectivity**
```bash
# Test if port 554 (RTSP) is accessible
telnet 192.168.1.100 554

# Or use nc (netcat)
nc -zv 192.168.1.100 554
```

### Poor Video Quality / Lag

**Solution 1: Lower the resolution**
- Use camera's sub-stream instead of main stream
- Usually ends with `/stream2` or `/videoSub`

**Solution 2: Adjust buffer settings**
```bash
# In .env file
CAMERA_BUFFER_SIZE=1  # Lower = less latency (try 1-3)
```

**Solution 3: Network bandwidth**
- Ensure strong WiFi signal
- Use 5GHz WiFi instead of 2.4GHz if available
- Consider wired Ethernet connection for critical cameras

### Frequent Disconnections

**Solution 1: Increase timeouts**
```bash
# In .env file
CAMERA_OPEN_TIMEOUT_MS=15000
CAMERA_READ_TIMEOUT_MS=10000
CAMERA_RECONNECT_ATTEMPTS=5
```

**Solution 2: Check camera power**
- Ensure stable power supply
- Some cameras disconnect when overheating

**Solution 3: Network stability**
- Check router logs for disconnections
- Update camera firmware
- Consider using PoE (Power over Ethernet) cameras

### "No camera source" - Demo Mode

If you see demo frames instead of real video:
1. Check `.env` file has `CAMERA_PEN_X` variables set
2. Verify URL format is correct
3. Run `python test_camera.py` to debug

## Advanced Configuration

### Multiple Cameras (Up to 10)
```bash
CAMERA_PEN_1=rtsp://admin:pass@192.168.1.100:554/stream1
CAMERA_PEN_2=rtsp://admin:pass@192.168.1.101:554/stream1
CAMERA_PEN_3=rtsp://admin:pass@192.168.1.102:554/stream1
CAMERA_PEN_4=rtsp://admin:pass@192.168.1.103:554/stream1
CAMERA_PEN_5=rtsp://admin:pass@192.168.1.104:554/stream1
# ... up to CAMERA_PEN_10
```

### Custom Connection Settings
```bash
# Minimize latency (default: 1)
CAMERA_BUFFER_SIZE=1

# Connection timeout in milliseconds (default: 10000)
CAMERA_OPEN_TIMEOUT_MS=10000

# Read timeout in milliseconds (default: 5000)
CAMERA_READ_TIMEOUT_MS=5000

# Number of reconnection attempts (default: 3)
CAMERA_RECONNECT_ATTEMPTS=3

# Delay between reconnections in seconds (default: 2)
CAMERA_RECONNECT_DELAY_SEC=2
```

### Using Sub-Streams for Better Performance
Most IP cameras offer multiple streams:
- **Main Stream**: High resolution (1080p, 4K) - higher bandwidth
- **Sub Stream**: Lower resolution (720p, 480p) - better for monitoring

For monitoring multiple cameras, use sub-streams:
```bash
# Hikvision sub-stream
CAMERA_PEN_1=rtsp://admin:pass@192.168.1.100:554/Streaming/Channels/102

# Dahua sub-stream
CAMERA_PEN_2=rtsp://admin:pass@192.168.1.101:554/cam/realmonitor?channel=1&subtype=1
```

## Security Best Practices

1. **Change default passwords**
   - Never use admin/admin or admin/12345
   - Use strong, unique passwords

2. **Network isolation**
   - Put cameras on separate VLAN if possible
   - Use firewall rules to restrict camera internet access

3. **Keep firmware updated**
   - Regularly check for camera firmware updates
   - Update fixes security vulnerabilities

4. **Use HTTPS for web access**
   - Enable HTTPS in camera settings if available
   - Use VPN for remote access instead of port forwarding

## Performance Tips

1. **Optimal Settings for Pig Monitoring**
   - Resolution: 720p (1280x720) is sufficient
   - FPS: 15-30 fps
   - Codec: H.264 (most compatible)

2. **Network Optimization**
   - Use wired Ethernet when possible
   - WiFi: Place cameras within good signal range
   - Use PoE switches to power cameras via network cable

3. **Processing Load**
   - Lower resolution = faster AI processing
   - Sub-streams = less bandwidth, lower latency
   - Consider dedicated camera per pen

## Getting Help

If you're still having issues:

1. Run the camera test utility:
   ```bash
   python test_camera.py "your_camera_url"
   ```

2. Check backend logs:
   ```bash
   tail -f logs/app.log
   ```

3. Verify camera works in VLC Media Player

4. Check camera manufacturer's documentation for correct RTSP URL format

## Example Complete Setup

```bash
# .env file configuration
DEBUG=True

# PostgreSQL Database
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/pig_ai_watch

# Security
SECRET_KEY=your-secret-key-here

# Camera Configuration - 3 RTSP cameras
CAMERA_PEN_1=rtsp://admin:farm2024@192.168.1.100:554/stream1
CAMERA_PEN_2=rtsp://admin:farm2024@192.168.1.101:554/stream1
CAMERA_PEN_3=rtsp://admin:farm2024@192.168.1.102:554/stream1

# Camera Optimization
CAMERA_BUFFER_SIZE=1
CAMERA_OPEN_TIMEOUT_MS=10000
CAMERA_READ_TIMEOUT_MS=5000
CAMERA_RECONNECT_ATTEMPTS=3

# YOLO Detection
YOLO_CONFIDENCE_THRESHOLD=0.5

# Alerts
CRUSHING_RISK_THRESHOLD=0.7
```

---

**Ready to deploy?** Your IP cameras are now configured and optimized for pig monitoring! 🐷📹
