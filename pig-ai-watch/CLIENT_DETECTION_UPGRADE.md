# Live Monitoring Client-Side Detection Upgrade

## Overview
Enhanced Live Monitoring page to use the same client-side ONNX detection system as Test Pen Page, providing consistent detection capabilities across the application.

## What Changed

### 1. **RTSPVideoFeed Component Enhancement**
**File**: `frontend/src/components/RTSPVideoFeed.tsx`

Added client-side ONNX detection capabilities:

#### New Features:
- ✅ **Client-side ONNX detection** - Runs YOLOv8 ONNX model in the browser
- ✅ **Canvas overlay** - Draws bounding boxes with styled corners (same as TestPenPage)
- ✅ **FPS counter** - Shows real-time frames per second
- ✅ **Inference time display** - Shows detection processing time in milliseconds
- ✅ **Confidence threshold control** - Adjustable detection threshold
- ✅ **Detection debugging** - Console logs for detection counts and performance
- ✅ **Dual detection mode** - Can use either client-side or backend detection
- ✅ **Model loading indicator** - Visual feedback when loading ONNX model

#### New Props:
```typescript
interface RTSPVideoFeedProps {
  penId: string;
  penName?: string;          // NEW: Display name for pen
  sowTag?: string;           // NEW: Sow tag/ID
  className?: string;
  showStats?: boolean;
  onFullscreen?: () => void; // NEW: Fullscreen callback
  confidenceThreshold?: number; // NEW: Detection confidence (default 0.25)
  useClientDetection?: boolean; // NEW: Toggle client vs backend detection (default true)
}
```

#### Detection Visualization:
- **Colored bounding boxes** based on category (sows: pink, piglets: green)
- **Styled corner indicators** for modern look
- **Confidence percentage** displayed on each detection
- **Category labels** (Sow/Piglet) with class name
- **Real-time FPS** and inference time overlay

#### Detection Flow:
1. MJPEG stream loads from backend
2. Frames are captured to hidden canvas every animation frame
3. ONNX model processes the captured frame
4. Detections are drawn on transparent overlay canvas
5. Statistics are updated (FPS, counts, risk)

### 2. **Live Monitoring Page Enhancement**
**File**: `frontend/src/pages/LiveMonitoringPage.tsx`

Added detection controls and settings:

#### New Features:
- ✅ **Detection settings panel** - Collapsible settings UI
- ✅ **Client detection toggle** - Switch between client-side and backend detection
- ✅ **Confidence threshold slider** - Adjust detection sensitivity (0.1 - 0.9)
- ✅ **Settings button** - Toggle detection settings visibility
- ✅ **Real-time configuration** - Changes apply immediately to all camera feeds

#### Settings UI:
```typescript
{showSettings && (
  <div className="bg-white dark:bg-slate-800/50 rounded-xl border ...">
    <h3>Detection Settings</h3>
    
    {/* Toggle: Client-Side Detection */}
    <button onClick={() => setUseClientDetection(!useClientDetection)}>
      {/* Toggle switch UI */}
    </button>
    
    {/* Slider: Confidence Threshold (0.1 - 0.9) */}
    <input type="range" min="0.1" max="0.9" step="0.05" />
  </div>
)}
```

#### Updated RTSPVideoFeed Usage:
```typescript
<RTSPVideoFeed
  penId={pen.pen_id.toString()}
  penName={pen.pen_name}
  sowTag={pen.sow_tag}
  onFullscreen={() => setSelectedPen(pen.pen_id.toString())}
  confidenceThreshold={confidenceThreshold}  // NEW
  useClientDetection={useClientDetection}    // NEW
/>
```

## Features Comparison

### Before (Backend Detection Only):
| Feature | Available |
|---------|-----------|
| Real-time detection | ✅ |
| Bounding boxes | ✅ (drawn on backend) |
| Adjustable confidence | ❌ |
| FPS display | ❌ |
| Inference time | ❌ |
| Detection debugging | ❌ |
| Client-side control | ❌ |
| Category visualization | ❌ |

### After (Client + Backend Detection):
| Feature | Available |
|---------|-----------|
| Real-time detection | ✅ |
| Bounding boxes | ✅ (client or backend) |
| Adjustable confidence | ✅ (0.1 - 0.9) |
| FPS display | ✅ |
| Inference time | ✅ |
| Detection debugging | ✅ |
| Client-side control | ✅ |
| Category visualization | ✅ |
| Toggle detection mode | ✅ |
| Same as TestPenPage | ✅ |

## Detection Modes

### Client-Side Detection (Default)
- **Pros**:
  - Full control over confidence threshold
  - Live FPS and inference time metrics
  - Debugging console logs
  - Same experience as Test Pen Page
  - No backend processing load
  - Can customize detection parameters per user

- **Cons**:
  - Uses browser resources (CPU/GPU)
  - Requires ONNX model download (~10-50MB)
  - Performance depends on client device

### Backend Detection
- **Pros**:
  - No client processing required
  - Consistent performance across devices
  - Server-side optimization possible
  - Lower bandwidth (pre-drawn bounding boxes)

- **Cons**:
  - Fixed confidence threshold (configured on backend)
  - No real-time metrics (FPS, inference time)
  - No debugging output
  - Cannot customize per user

## Usage Guide

### For Users:

1. **Access Live Monitoring page**
2. **Click Settings button** (slider icon) to open detection settings
3. **Toggle Client-Side Detection**:
   - ON: Use browser ONNX detection (same as Test Pen Page)
   - OFF: Use backend detection
4. **Adjust Confidence Threshold** (when client detection enabled):
   - Lower (0.1-0.3): More detections, more false positives
   - Medium (0.3-0.5): Balanced (recommended)
   - Higher (0.5-0.9): Fewer detections, higher confidence

### Visual Indicators:

- **Top-left badge**:
  - "Client Detection Active" (green) - Using browser detection
  - "Loading detection model..." (yellow) - Model loading
- **Bottom-right overlay**:
  - FPS: Frames per second
  - Inf: Inference time in milliseconds
- **Detection stats panel** (right side):
  - "Client Detection" or "Backend Detection" badge

### Bounding Box Colors:

- **Pink (#E91E63)**: Sows
- **Green (#4CAF50)**: Piglets
- **Gray (#9E9E9E)**: Unknown

## Technical Details

### ONNX Model:
- **Location**: `/public/models/pig_detection.onnx`
- **Input Size**: 640x640 pixels
- **Classes**: 6 (piglet, sow-sit, sow-sleep, sow-sleep-lactate, sow-stand, sow-stand-feed)
- **Backend**: ONNX Runtime Web (WebAssembly)

### Performance:
- **Frame Capture**: Every animation frame (~60fps attempt)
- **Detection Processing**: Varies by device (20-200ms typical)
- **Actual FPS**: Usually 5-30 FPS depending on device
- **Memory Usage**: ~100-200MB additional for model

### Frame Processing Pipeline:
```
MJPEG Stream (Backend)
  ↓
<img> element (visible to user)
  ↓
Frame capture to hidden <canvas>
  ↓
ONNX inference (640x640)
  ↓
Post-processing & NMS
  ↓
Draw on overlay <canvas>
  ↓
Display to user
```

## Configuration

### Default Settings:
```typescript
const defaultConfig = {
  useClientDetection: true,      // Enable client-side detection
  confidenceThreshold: 0.25,     // 25% confidence minimum
  detectionFrameRate: 'auto',    // As fast as device allows
};
```

### Environment Variables:
No new environment variables needed. Uses existing:
- `VITE_API_URL` - Backend API endpoint (already configured)

## Debugging

### Console Logs (when useClientDetection=true):
```
📦 Loading ONNX model for Pen 1...
✅ ONNX model loaded successfully for Pen 1
▶️ Starting client-side detection for Pen 1
🔍 Pen 1: 12 objects (8 piglets, 1 sows)
🔍 Pen 1: 11 objects (7 piglets, 1 sows)
...
```

### Performance Monitoring:
- Check FPS overlay (bottom-right of video)
- Check inference time (should be < 200ms for good performance)
- Open browser DevTools → Performance tab for detailed profiling

## Troubleshooting

### Model Not Loading:
```
❌ Failed to load ONNX model for Pen X
```
**Solution**: 
- Check `/public/models/pig_detection.onnx` exists
- Verify file permissions
- Check browser console for CORS errors

### Low FPS (<5 FPS):
**Solutions**:
- Switch to Backend Detection mode (toggle off Client-Side Detection)
- Close other browser tabs
- Use a more powerful device
- Reduce number of simultaneous camera feeds

### No Detections Showing:
**Solutions**:
- Lower confidence threshold to 0.1-0.2
- Check console logs for detection counts
- Verify model loaded successfully (check "Client Detection Active" badge)

### High CPU Usage:
**Solutions**:
- Switch to Backend Detection mode
- Reduce number of simultaneous feeds
- Lower confidence threshold (fewer boxes to draw)

## Future Enhancements

### Potential Improvements:
- [ ] GPU acceleration (WebGL backend for ONNX)
- [ ] Worker threads for detection (non-blocking UI)
- [ ] Caching/reusing detections across similar frames
- [ ] Batch processing multiple cameras
- [ ] WebAssembly SIMD optimization
- [ ] Model quantization for smaller file size
- [ ] Progressive model loading (load while viewing)

## Rollback

To revert to backend-only detection:

1. Set default `useClientDetection = false` in LiveMonitoringPage:
```typescript
const [useClientDetection, setUseClientDetection] = useState<boolean>(false);
```

2. Or remove the client detection toggle from UI entirely

## Summary

✅ Live Monitoring now has **full parity** with Test Pen Page detection capabilities
✅ Users can toggle between client-side and backend detection modes
✅ Real-time metrics: FPS, inference time, detection counts
✅ Adjustable confidence threshold for fine-tuning
✅ Same visual styling and debugging features
✅ Zero breaking changes to existing functionality

The Live Monitoring page now provides the same powerful detection debugging and control features as the Test Pen Page, while maintaining backward compatibility with backend detection.
