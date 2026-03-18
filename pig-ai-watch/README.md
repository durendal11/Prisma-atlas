# Pig AI Watch 🐷

AI-powered pig farrowing monitoring dashboard with real-time YOLO detection.

## Features

- **Real-time Video Monitoring**: MJPEG streams from multiple pens with YOLO detection overlay
- **AI-Powered Detection**: Piglet counting, sow posture detection, and crushing risk assessment
- **Live Alerts**: WebSocket-based real-time alerts for critical events
- **Dashboard Analytics**: Comprehensive statistics and visualizations
- **Sow Management**: Complete CRUD for sow profiles
- **Event Logging**: Track all detection events and system activities

## Tech Stack

### Backend
- FastAPI (Python 3.11)
- SQLAlchemy + PostgreSQL
- Ultralytics YOLOv8
- OpenCV for video processing
- WebSockets for real-time updates
- JWT Authentication
- Alembic migrations

### Frontend
- React 18 + TypeScript
- Tailwind CSS
- React Router v6
- Axios + React Query
- Zustand for state management
- Recharts for visualizations

## Project Structure

```
pig-ai-watch/
├── backend/
│   ├── app/
│   │   ├── api/           # API routes
│   │   ├── core/          # Config, DB, security
│   │   ├── models/        # SQLAlchemy models
│   │   ├── schemas/       # Pydantic schemas
│   │   ├── services/      # YOLO, camera services
│   │   └── main.py        # FastAPI app
│   ├── alembic/           # Database migrations
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/           # API client
│   │   ├── components/    # React components
│   │   ├── hooks/         # Custom hooks
│   │   ├── pages/         # Page components
│   │   ├── store/         # Zustand stores
│   │   └── types/         # TypeScript types
│   └── package.json
└── docker-compose.yml
```

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL 15+
- (Optional) NVIDIA GPU with CUDA for faster YOLO inference

### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy environment file
cp .env.example .env

# Edit .env with your settings

# Run database migrations
alembic upgrade head

# Start the server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

### Using Docker

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f
```

## IP Camera / CCTV Setup 📹

This system supports wireless IP cameras, CCTV systems, and USB cameras for pen monitoring.

### Quick Setup

1. **Find your camera's RTSP URL** (see [CAMERA_SETUP.md](CAMERA_SETUP.md) for brand-specific URLs)
2. **Configure in `.env` file:**
   ```bash
   CAMERA_PEN_1=rtsp://admin:password@192.168.1.100:554/stream1
   CAMERA_PEN_2=rtsp://admin:password@192.168.1.101:554/stream1
   CAMERA_PEN_3=0  # USB camera
   ```
3. **Test your camera connection:**
   ```bash
   cd backend
   python test_camera.py "rtsp://admin:password@192.168.1.100:554/stream1"
   ```
4. **Start the backend** - cameras will automatically connect

### Scan for Cameras on Network

```bash
cd backend
python scan_cameras.py          # Auto-detect network
python scan_cameras.py 192.168.1.0/24  # Specific network
```

### Documentation

- 📖 **[Complete Camera Setup Guide](CAMERA_SETUP.md)** - Detailed setup instructions, troubleshooting, and optimization
- 📋 **[Quick Reference Card](CAMERA_QUICK_REF.md)** - Common camera URLs, commands, and examples

### Supported Camera Types

- ✅ RTSP IP Cameras (Hikvision, Dahua, Axis, Foscam, TP-Link, Reolink, etc.)
- ✅ HTTP/MJPEG Cameras
- ✅ USB Cameras (built-in or external webcams)
- ✅ Mixed configurations

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login and get JWT token
- `POST /api/auth/register` - Register new user
- `GET /api/auth/me` - Get current user

### Sows
- `GET /api/sows` - List all sows
- `POST /api/sows` - Create sow
- `GET /api/sows/{id}` - Get sow details
- `PUT /api/sows/{id}` - Update sow
- `DELETE /api/sows/{id}` - Delete sow

### Alerts
- `GET /api/alerts` - List alerts with filters
- `POST /api/alerts` - Create alert
- `PATCH /api/alerts/{id}` - Update alert status

### Events
- `GET /api/events` - List event logs

### Video Stream
- `GET /api/stream/{pen_id}` - MJPEG video stream
- `GET /api/stream/{pen_id}/snapshot` - Single frame

### WebSocket
- `WS /ws/detections` - Real-time detection updates

## YOLO Integration

Place your custom pig detection model at `models/pig_detection.pt`. The model should detect:
- Class 0: piglet
- Class 1: sow_standing
- Class 2: sow_lying_lateral
- Class 3: sow_lying_sternal
- Class 4: sow_sitting
- Class 5: sow_nursing

If no custom model is found, the system falls back to YOLOv8n for demo purposes.

## Environment Variables

```env
# Database
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/pig_ai_watch

# JWT
SECRET_KEY=your-secret-key
ACCESS_TOKEN_EXPIRE_MINUTES=10080

# Camera Sources (IP/RTSP/USB)
CAMERA_PEN_1=rtsp://admin:password@192.168.1.100:554/stream1
CAMERA_PEN_2=rtsp://admin:password@192.168.1.101:554/stream1
CAMERA_PEN_3=0  # USB camera

# Camera Connection Settings
CAMERA_BUFFER_SIZE=1
CAMERA_OPEN_TIMEOUT_MS=10000
CAMERA_READ_TIMEOUT_MS=5000
CAMERA_RECONNECT_ATTEMPTS=3

# YOLO
YOLO_WEIGHTS_PATH=models/pig_detection.pt
YOLO_CONFIDENCE_THRESHOLD=0.5

# Alert Thresholds
CRUSHING_RISK_THRESHOLD=0.7
```

See [.env.example](backend/.env.example) for complete configuration options.

## License

MIT
