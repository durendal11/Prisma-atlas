# Pig AI Watch - System Mechanics Documentation

## Overview

This document explains the technical mechanics of the Pig AI Watch system, including how crushing detection works, health vitals calculation, statistics computation, and the overall data flow.

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Detection Pipeline](#detection-pipeline)
3. [Crushing Risk Detection](#crushing-risk-detection)
4. [Health Score & Vitals](#health-score--vitals)
5. [Behavior Logging System](#behavior-logging-system)
6. [Statistics & Analytics](#statistics--analytics)
7. [Model Classes](#model-classes)
8. [Data Flow Diagram](#data-flow-diagram)
9. [Configuration Parameters](#configuration-parameters)
10. [Scientific & Veterinary Foundations](#scientific--veterinary-foundations)
11. [How to Start Services (Backend, Frontend, Edge)](#how-to-start-services-backend-frontend-edge)

---

## System Architecture

### Edge-Assisted Recording
To optimize localized network bandwidth and preserve hard drive space, continuous recording has been deprecated. CCTV integration is instead bridged via an Edge pipeline:
1. **CameraWorker:** Captures live OpenCV buffers and runs `pig_detection.onnx` locally on edge nodes.
2. **RecordingWorker:** An asynchronous daemon that listens exclusively for localized high-risk (> 40% crushing likelihood) telemetry drops. When triggered, it spawns a highly compressed 5-minute `.mp4` ffmpeg slice stored locally without bloating the main Cloud APIs.



```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Frontend (React + ONNX Runtime)               │
├─────────────────────────────────────────────────────────────────────────┤
│  Camera/Video Input → ONNX Detector → Detection Results → UI Display   │
│                              ↓                                          │
│                     Behavior Logger (12s intervals)                     │
│                              ↓                                          │
│                     POST /api/behavior/log                              │
└─────────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Backend (FastAPI + PostgreSQL)                   │
├─────────────────────────────────────────────────────────────────────────┤
│  API Endpoints → YOLO Detector → Database Storage → Analytics          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Detection Pipeline

### 1. Image Preprocessing

```typescript
// Input: Video frame or image (any resolution)
// Output: Normalized tensor [1, 3, 640, 640]

Steps:
1. Resize image to 640x640 pixels
2. Extract RGB channels
3. Normalize pixel values to [0, 1] range
4. Format as NCHW tensor (batch, channels, height, width)
```

### 2. ONNX Model Inference

```typescript
// Model: YOLOv8s-seg (segmentation model)
// Input: 'images' tensor [1, 3, 640, 640]
// Outputs:
//   - output0: [1, 42, 8400] - Detection boxes + classes + mask coefficients
//   - output1: [1, 32, 160, 160] - Segmentation prototype masks

Output format breakdown:
- 4 values: bounding box (xc, yc, width, height)
- 6 values: class scores (piglet, sow-sit, sow-sleep, sow-sleep-lactate, sow-stand, sow-stand-feed)
- 32 values: mask prototype coefficients
```

### 3. Post-Processing

```typescript
// Non-Maximum Suppression (NMS)
confidenceThreshold = 0.25  // Minimum detection confidence
iouThreshold = 0.45         // Overlap threshold for duplicate removal

Steps:
1. Filter detections by confidence threshold
2. Apply NMS to remove overlapping boxes
3. Extract class IDs and confidence scores
4. Calculate bounding box coordinates
```

---

## Crushing Risk Detection

### Overview

Crushing risk is calculated based on **three main factors**:

1. **Sow Posture Base Risk** - Different postures have different inherent risk levels
2. **Proximity Risk** - Distance between piglets and sow
3. **Historical Smoothing** - Averaging with recent detection history

### Risk Calculation Formula

```typescript
// Step 1: Base Risk by Posture
const POSTURE_BASE_RISK = {
  sleeping: 0.45,      // Highest - sow may roll onto piglets
  nursing: 0.35,       // High - piglets close during feeding
  sitting: 0.25,       // Moderate - transition posture
  standing: 0.15,      // Lower - sow is alert
  feeding: 0.10,       // Lowest - sow is occupied
  unknown: 0.20,       // Default
};

// Step 2: Calculate Proximity Alerts
function calculateProximityAlerts(sows, piglets) {
  for each sow:
    sowSize = max(sow.width, sow.height)
    dangerZone = sowSize * 0.5    // 50% of sow size
    warningZone = sowSize * 0.8   // 80% of sow size
    
    for each piglet:
      distance = euclideanDistance(sow.center, piglet.center)
      
      if distance < warningZone:
        if distance < dangerZone:
          riskContribution = 0.30  // High risk
        else:
          riskContribution = 0.15 * (1 - (distance - dangerZone) / (warningZone - dangerZone))
        
        alerts.push({ pigletIndex, sowIndex, distance, riskContribution })
  
  return alerts.sort(by: riskContribution DESC)
}

// Step 3: Combine All Risk Factors
function calculateCrushingRisk(posture, proximityAlerts, pigletCount, detections) {
  // Start with posture base risk
  risk = POSTURE_BASE_RISK[posture] || 0.1
  
  // Add proximity risk (capped at 0.4)
  proximityRisk = sum(alerts.map(a => a.riskContribution))
  risk += min(proximityRisk, 0.4)
  
  // Additional risk for many piglets
  if (pigletCount > 3) {
    risk += (pigletCount - 3) * 0.05
  }
  
  // Historical smoothing (30% weight to recent average)
  if (detectionHistory.length > 5) {
    recentAvgRisk = average(last5Detections.crushingRisk)
    risk = risk * 0.7 + recentAvgRisk * 0.3
  }
  
  // Clamp to [0, 1]
  risk = clamp(risk, 0, 1.0)
  
  return risk
}
```

### Risk Level Classification

| Risk Value | Level    | UI Color | Action              |
|------------|----------|----------|---------------------|
| 0.00-0.24  | Low      | Green    | Normal monitoring   |
| 0.25-0.49  | Medium   | Yellow   | Increased attention |
| 0.50-0.74  | High     | Orange   | Alert caregiver     |
| 0.75-1.00  | Critical | Red      | Immediate response  |

### Backend Risk Calculation (Python)

```python
def _calculate_crushing_risk(self, sow_posture, sow_box, piglet_boxes, frame_shape):
    """Calculate the risk of piglet crushing based on positions and postures."""
    
    if not piglet_boxes or sow_box is None:
        return 0.0
    
    # Base risk by posture
    posture_risk = {
        "standing": 0.1,
        "sitting": 0.2,
        "lying_sternal": 0.3,
        "lying_lateral": 0.5,   # Highest risk when lying on side
        "nursing": 0.4,
        "unknown": 0.2
    }
    risk = posture_risk.get(sow_posture, 0.2)
    
    # Calculate proximity risk
    sow_center = center_of(sow_box)
    PIGLET_PROXIMITY_THRESHOLD = 50  # pixels
    DANGER_ZONE_MARGIN = 30  # pixels
    
    for piglet_box in piglet_boxes:
        piglet_center = center_of(piglet_box)
        
        # Check if piglet is within sow's bounding box (danger zone)
        in_danger_zone = piglet_center within expanded_sow_box(DANGER_ZONE_MARGIN)
        
        if in_danger_zone:
            distance = euclidean_distance(sow_center, piglet_center)
            proximity_factor = max(0, 1 - distance / 200)
            risk = min(1.0, risk + proximity_factor * 0.3)
    
    return round(risk, 2)
```

---

## Health Score & Vitals

### Health Score Calculation (0-100)

```typescript
function calculateHealthScore(posture, crushingRisk, isNursing, isFeeding, pigletCount) {
  let healthScore = 70  // Base score
  
  // Positive indicators
  if (isNursing) healthScore += 15      // Nursing is healthy behavior
  if (isFeeding) healthScore += 10      // Feeding is healthy behavior
  if (pigletCount > 0 && crushingRisk < 0.3) healthScore += 5  // Safe piglets
  
  // Negative indicators
  if (crushingRisk > 0.6) healthScore -= 20  // High risk
  if (crushingRisk > 0.8) healthScore -= 10  // Critical risk (additional penalty)
  
  // Clamp to 0-100
  return clamp(healthScore, 0, 100)
}
```

### Activity Level Detection

```typescript
function determineActivityLevel(posture, isNursing, isFeeding) {
  if (isNursing) return 'nursing'
  if (isFeeding) return 'feeding'
  if (posture === 'standing' || posture === 'sitting') return 'active'
  return 'resting'  // sleeping, lying
}
```

### Movement Estimation

```typescript
function estimateMovement(detectionHistory) {
  if (history.length < 10) return 'stationary'
  
  // Calculate center of mass movement between frames
  const movements = []
  for (i = 1; i < 10; i++) {
    prevCenter = history[i-1].centerOfMass
    currCenter = history[i].centerOfMass
    movements.push(euclideanDistance(prevCenter, currCenter))
  }
  
  avgMovement = average(movements)
  
  if (avgMovement > 0.05) return 'high'
  if (avgMovement > 0.02) return 'moderate'
  if (avgMovement > 0.005) return 'low'
  return 'stationary'
}
```

### Environment Scores (Placeholder)

```typescript
// Cleanliness Score (0-1): Estimated based on detection density
cleanlinessScore = max(0, min(1, 1 - detectionDensity / 5))

// Wetness Score (0-1): Placeholder heuristic
wetnessScore = (movementLevel === 'stationary') ? 0.1 : 0.2

// Note: These are placeholder values until dedicated vision classifiers are implemented
```

---

## Behavior Logging System

### Logging Interval

- **Frequency**: Every 12 seconds
- **Trigger**: Automatic interval while detection is active
- **Storage**: PostgreSQL `behavior_logs` table

### Data Captured Per Log

```typescript
interface BehaviorLogPayload {
  // Identification
  pen_id: number
  sow_id?: number
  
  // Detection counts
  piglet_count: number
  sow_count: number
  total_detections: number
  
  // Behavior state
  sow_posture: string         // standing, sitting, sleeping, nursing, feeding
  posture_confidence: number  // 0-1 confidence score
  is_nursing: boolean
  is_feeding: boolean
  is_sleeping: boolean
  activity_level: string      // resting, active, feeding, nursing
  
  // Risk metrics
  crushing_risk: number       // 0-1 risk score
  health_score: number        // 0-100 health score
  
  // Analytics
  avg_confidence: number      // Average detection confidence
  detection_density: number   // Total detection area / frame area
  movement_level: string      // stationary, low, moderate, high
  
  // Environment
  cleanliness_score: number   // 0-1 (placeholder)
  wetness_score: number       // 0-1 (placeholder)
  
  // Timestamp
  logged_at: string           // ISO timestamp
}
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/behavior/log` | POST | Log behavior data |
| `/api/behavior/logs/{pen_id}` | GET | Get logs for a pen |
| `/api/behavior/analytics/{pen_id}` | GET | Get analytics for a pen |
| `/api/behavior/health-summary` | GET | Get health summary across all pens |
| `/api/behavior/farrowing-likelihood/{pen_id}` | GET | Get farrowing prediction |

---

## Statistics & Analytics

### Detection Analytics

```typescript
interface AnalyticsData {
  avgConfidence: number        // Average detection confidence
  detectionDensity: number     // Total detected area / image area
  centerOfMass: { x, y }       // Weighted center of all detections
  spreadRadius: number         // How spread out detections are
  movementEstimate: string     // Based on frame-to-frame changes
}

function calculateAnalytics(detections) {
  // Average confidence
  avgConfidence = average(detections.map(d => d.confidence))
  
  // Detection density
  totalArea = sum(detections.map(d => d.area))
  detectionDensity = totalArea / (640 * 640)  // Normalized to input size
  
  // Center of mass (weighted by detection area)
  totalWeight = sum(detections.map(d => d.area))
  centerOfMass = {
    x: sum(detections.map(d => d.centerX * d.area)) / totalWeight / 640,
    y: sum(detections.map(d => d.centerY * d.area)) / totalWeight / 640
  }
  
  // Spread radius (standard deviation from center)
  spreadRadius = sqrt(
    average(detections.map(d => {
      dx = d.centerX/640 - centerOfMass.x
      dy = d.centerY/640 - centerOfMass.y
      return dx*dx + dy*dy
    }))
  )
  
  return { avgConfidence, detectionDensity, centerOfMass, spreadRadius }
}
```

### Farrowing Likelihood Prediction

```typescript
interface FarrowingLikelihood {
  pen_id: number
  score: number                  // 0-1 likelihood score
  likelihood: string             // "Low" | "Moderate" | "High"
  expected_window_hours: number  // Estimated hours until farrowing
  changes_per_hour: number       // Posture change frequency
  nursing_ratio: number          // % of time nursing
  sleeping_ratio: number         // % of time sleeping
  restlessness_index: number     // Activity variation metric
  period_hours: number           // Analysis period
}

// Farrowing indicators:
// - Increased restlessness (frequent posture changes)
// - Nesting behavior (lying on side more)
// - Reduced feeding
// - Increased nursing preparation behaviors
```

---

## Model Classes

### Finetuned Model Classes (6 classes)

| Class ID | Name | Category | Display Name | Health Indicator |
|----------|------|----------|--------------|------------------|
| 0 | piglet | piglet | Piglet | Neutral |
| 1 | sow-sit | sow | Sow (Sitting) | Neutral |
| 2 | sow-sleep | sow | Sow (Sleeping) | Positive |
| 3 | sow-sleep-lactate | sow | Sow (Nursing) | Positive |
| 4 | sow-stand | sow | Sow (Standing) | Neutral |
| 5 | sow-stand-feed | sow | Sow (Feeding) | Positive |

### Category-Based Colors

```typescript
const CATEGORY_COLORS = {
  sow: '#E91E63',      // Pink
  piglet: '#4CAF50',   // Green
  unknown: '#9E9E9E',  // Gray
}

const CLASS_COLORS = {
  'piglet': '#4CAF50',           // Green
  'sow-sit': '#FF9800',          // Orange
  'sow-sleep': '#2196F3',        // Blue
  'sow-sleep-lactate': '#9C27B0', // Purple (nursing)
  'sow-stand': '#607D8B',        // Gray-blue
  'sow-stand-feed': '#8BC34A',   // Light green (feeding)
}
```

### Size-Based Category Inference (Fallback)

```typescript
const SIZE_THRESHOLDS = {
  pigletMaxArea: 0.08,   // < 8% of frame = piglet
  sowMinArea: 0.10,      // > 10% of frame = sow
}

function inferCategory(detection) {
  relativeArea = detection.area / (640 * 640)
  
  if (relativeArea < 0.08) return 'piglet'
  if (relativeArea > 0.10) return 'sow'
  
  // Ambiguous size - use aspect ratio
  if (detection.aspectRatio > 1.3) return 'sow'
  return 'piglet'
}
```

---

## Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              VIDEO/IMAGE INPUT                               │
│                         (Camera, File Upload, Stream)                        │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           PREPROCESSING                                      │
│  1. Resize to 640x640                                                        │
│  2. Normalize pixels [0,1]                                                   │
│  3. Convert to NCHW tensor                                                   │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         ONNX MODEL INFERENCE                                 │
│  Model: pig_detection.onnx (YOLOv8s-seg)                                    │
│  Input: [1, 3, 640, 640]                                                    │
│  Output: [1, 42, 8400] + [1, 32, 160, 160]                                  │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                          POST-PROCESSING                                     │
│  1. Filter by confidence (> 0.25)                                           │
│  2. Apply NMS (IoU threshold 0.45)                                          │
│  3. Extract bounding boxes + class IDs                                       │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │
                                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                       DETECTION ENRICHMENT                                   │
│  1. Calculate area, aspect ratio, center point                              │
│  2. Assign category (sow/piglet) based on class or size                     │
│  3. Map posture from class name                                             │
└─────────────────────────────────────┬────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        STATISTICS CALCULATION                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────┐    ┌─────────────────────┐   ┌──────────────────┐ │
│  │   Count Animals     │    │   Infer Posture     │   │  Calc Analytics  │ │
│  │  - Piglet count     │    │  - From class ID    │   │  - Avg conf      │ │
│  │  - Sow count        │    │  - Or aspect ratio  │   │  - Density       │ │
│  │  - Total count      │    │  - Confidence       │   │  - Movement      │ │
│  └─────────────────────┘    └─────────────────────┘   └──────────────────┘ │
│                                      │                                      │
│                                      ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    PROXIMITY ALERTS                                  │   │
│  │  For each piglet near sow:                                           │   │
│  │    - Danger zone: 50% of sow size                                   │   │
│  │    - Warning zone: 80% of sow size                                  │   │
│  │    - Calculate risk contribution per piglet                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                      │
│                                      ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    CRUSHING RISK                                     │   │
│  │  risk = postureBaseRisk                                             │   │
│  │       + min(proximityRisk, 0.4)                                     │   │
│  │       + (pigletCount > 3 ? (pigletCount-3)*0.05 : 0)               │   │
│  │       + 0.3 * historicalAverage                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                      │
│                                      ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    HEALTH SCORE                                      │   │
│  │  score = 70 (base)                                                  │   │
│  │        + 15 (nursing) + 10 (feeding) + 5 (safe piglets)            │   │
│  │        - 20 (high risk) - 10 (critical risk)                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DETECTION RESULT                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  {                                                                          │
│    detections: [...],          // All detected objects                     │
│    pigletCount: 8,             // Number of piglets                        │
│    sowCount: 1,                // Number of sows                           │
│    sowPosture: "sleeping",     // Primary sow posture                      │
│    sowPostureConfidence: 0.92, // Posture confidence                       │
│    crushingRisk: 0.45,         // Risk score 0-1                           │
│    crushingRiskLevel: "medium",// low/medium/high/critical                 │
│    proximityAlerts: [...],     // Piglets near sow                         │
│    inferenceTimeMs: 45,        // Processing time                          │
│    analytics: {...},           // Statistical data                         │
│    behaviorSummary: {...}      // Behavior state for logging               │
│  }                                                                          │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
                    ▼                                   ▼
┌───────────────────────────────────┐    ┌─────────────────────────────────────┐
│         UI RENDERING              │    │      BEHAVIOR LOGGING               │
├───────────────────────────────────┤    ├─────────────────────────────────────┤
│  • Draw bounding boxes            │    │  Every 12 seconds:                  │
│  • Show detection labels          │    │  • Capture current state            │
│  • Display risk gauge             │    │  • POST to /api/behavior/log        │
│  • Stats footer                   │    │  • Store in PostgreSQL              │
│  • Proximity alerts               │    │                                     │
└───────────────────────────────────┘    └─────────────────────────────────────┘
```

---

## Configuration Parameters

### Environment Variables

```bash
# Detection thresholds
YOLO_CONFIDENCE_THRESHOLD=0.25    # Minimum detection confidence
YOLO_WEIGHTS_PATH=app/models/pig_detection.onnx

# Risk thresholds
CRUSHING_RISK_THRESHOLD=0.7       # Alert trigger threshold
PIGLET_PROXIMITY_THRESHOLD=50     # Pixels for proximity detection
```

### Frontend Configuration

```typescript
// In onnxDetector.ts
confidenceThreshold = 0.25  // Minimum confidence to keep detection
iouThreshold = 0.45         // NMS overlap threshold
inputWidth = 640            // Model input dimensions
inputHeight = 640
maxHistoryLength = 30       // Frames to keep in memory

// In behaviorLogger.ts
LOG_INTERVAL = 12000        // 12 seconds between logs
```

---

## Scientific & Veterinary Foundations

While the codebase implements technical thresholds, these values map directly to rigorous veterinary science and Precision Livestock Farming (PLF) studies:

### 1. Gestation Timelines (The 114-Day Rule)
The hardcoded 114-day gestation period used in tracking is the universal standard in swine husbandry (3 months, 3 weeks, 3 days), as documented by the **Merck Veterinary Manual**.

### 2. Behavior-Based Farrowing Prediction
The system monitors >6 posture transitions (e.g., `sow-stand` to `sow-sleep`) within 30 minutes. This mirrors scientific observations detailed in **Applied Animal Behaviour Science**, which show a severe spike in restlessness and nest-building behavior 12–24 hours prior to farrowing. Changes in feeding duration (`sow-stand-feed`) provide a secondary confirmation metric.

### 3. Crushing Risk & Roll Postures
The `POSTURE_BASE_RISK` heavily penalizes `lying_lateral` (0.50). Peer-reviewed veterinary studies (e.g., Weary et al., *Sow body movements that crush piglets*) confirm that the vast majority of fatal crushing events happen when a sow transitions from sternal lying (on her belly) to lateral lying (on her side).

### 4. Bounding Box & YOLO Proximity
The backend's use of a 50-pixel `PIGLET_PROXIMITY_THRESHOLD` and Euclidean distancing is grounded in modern computer vision studies explicitly addressing YOLO's efficacy in real-time pig detection and sow-piglet overlap heuristics.

---

## Summary

The Pig AI Watch system uses a multi-stage pipeline to:

1. **Detect** pigs and their postures using a finetuned YOLOv8 segmentation model
2. **Calculate** crushing risk based on sow posture + piglet proximity + historical data
3. **Assess** health scores based on nursing/feeding behavior and risk levels
4. **Log** behavior data every 12 seconds for long-term analytics
5. **Display** real-time visualizations including risk gauges and proximity alerts

The crushing risk algorithm prioritizes safety by:
- Assigning higher base risk to lying/sleeping postures
- Detecting dangerous proximity between piglets and sow
- Smoothing risk over time to avoid false alarms
- Providing clear visual indicators (green → yellow → orange → red)


---

## How to Start Services (Backend, Frontend, Edge)

This section provides step-by-step instructions for running the complete Pig AI Watch ecosystem locally or across distributed edge nodes and cloud droplets.

### Architecture Overview of Services

| Component | Default Port / Protocol | Runtime | Primary Role |
| :--- | :--- | :--- | :--- |
| **Backend API** | `8000` (HTTP/REST & WebSockets) | Python / FastAPI / Uvicorn | Database persistence, auth, analytics, telemetry ingestion, live alerts |
| **Frontend Dashboard** | `3000` (or `5173`) (HTTP) | Node.js / React / Vite | Web monitoring interface, posture gauges, alert feed, live camera player |
| **Edge Agent** | Local daemon / HTTP client | Python 3.11+ / YOLO / OpenCV | CCTV/RTSP capture, edge inference, crushing analysis, alert telemetry push |
| **Edge Pusher** | `8554` (RTSP outbound) | Python / FFmpeg | Transcodes local RTSP/USB camera to Cloud MediaMTX gateway (`rtsp://<host>:8554/<pen_id>`) |
| **MediaMTX** *(Optional/Cloud)* | `8554` (RTSP), `8889` (WebRTC), `8888` (HLS) | Go / MediaMTX | RTSP stream proxy bridging Edge camera streams to web browsers |

---

### Method 1: All-in-One Quick Start (Local Development)

To launch both the **Backend** and **Frontend** simultaneously with a single command from the project root:

```bash
# From pig-ai-watch/
./start-dev.sh
```

- Automatically activates virtual environments (`venv` or `.venv`).
- Boots the FastAPI backend on port `8000`.
- Boots the Vite React dashboard on port `3000`.
- Gracefully handles port conflicts and kills all services on `Ctrl + C`.

---

### Method 2: Running Services Individually (Manual Setup)

#### 1. Backend (FastAPI Server)

**Prerequisites**: Python 3.10+ installed.

1. Navigate to the backend directory:
   ```bash
   cd pig-ai-watch/backend
   ```

2. Create and activate a Python virtual environment:
   ```bash
   # Linux / macOS
   python3 -m venv venv
   source venv/bin/activate

   # Windows (PowerShell)
   python -m venv venv
   .\venv\Scripts\Activate.ps1

   # Windows (Command Prompt)
   venv\Scripts\activate.bat
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Configure environment variables (if not already set):
   ```bash
   cp .env.example .env
   # Verify database credentials, JWT secret, and port settings
   ```

5. Run database migrations (if required):
   ```bash
   alembic upgrade head
   ```

6. Start the FastAPI server:
   ```bash
   # Development mode with hot-reload:
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```

7. **Verify Backend Health**:
   - Swagger / OpenAPI Docs: `http://localhost:8000/docs`
   - Healthcheck: `http://localhost:8000/api/health`

---

#### 2. Frontend (React + Vite Web Dashboard)

**Prerequisites**: Node.js 18+ and `npm` or `pnpm`.

1. Navigate to the frontend directory:
   ```bash
   cd pig-ai-watch/frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   pnpm install
   ```
   *(Note: The postinstall script automatically synchronizes ONNX runtime web assets).*

3. Start the Vite development server:
   ```bash
   npm run dev -- --port 3000
   ```

4. **Verify Frontend**:
   - Main Web Dashboard: `http://localhost:3000`
   - Welcome / Landing Page: `http://localhost:3000/welcome`

*(Optional) Desktop App (Electron)*:
If running the desktop application wrapper:
```bash
cd pig-ai-watch/desktop
npm install
NODE_ENV=development npx electron .
```

---

#### 3. Edge Device (Edge Agent & RTSP Pusher)

Edge devices (e.g., Raspberry Pi 4/5, Jetson Orin Nano, or local edge PC) operate in one of two configurations:
1. **`agent.py`**: Runs local YOLO/ONNX posture inference and uploads behavior/crushing telemetry to the Backend API.
2. **`edge_pusher.py`**: Reads local camera streams (or demo videos) and streams them via RTSP to MediaMTX.

##### Step 1: Install Edge Dependencies & FFmpeg

Ensure `ffmpeg` is installed on the edge machine:
```bash
# Ubuntu / Raspberry Pi OS
sudo apt-get update && sudo apt-get install -y ffmpeg

# macOS (Homebrew)
brew install ffmpeg

# Windows
winget install Gyan.FFmpeg
```

Setup virtual environment:
```bash
cd pig-ai-watch/edge
python3 -m venv venv

# Linux / Raspberry Pi / macOS
source venv/bin/activate

# Windows
venv\Scripts\activate

pip install -r requirements.txt
```

##### Step 2: Configure Edge Environment (`edge/.env`)

Create or update `pig-ai-watch/edge/.env`:
```env
# Point to your central Backend API (local host or cloud droplet IP/domain)
CLOUD_API_URL=http://YOUR_SERVER_IP:8000

# Edge Authentication key matching EDGE_API_KEY in backend .env
EDGE_API_KEY=your_secure_edge_key

# YOLO / ONNX Model path
MODEL_PATH=models/pig_detection.onnx

# Input cameras per pen (RTSP URL, USB device index e.g. 0, or file path)
CAMERA_PEN_1=rtsp://192.168.1.100:554/stream
# CAMERA_PEN_1=0                                  # Webcam
# CAMERA_PEN_1=headless_proxy/demo.mp4            # Local video loop
```

##### Step 3: Run Edge Services

**Option A: Automated Combined Script (Recommended)**
```bash
cd pig-ai-watch
./start-edge.sh
```
This starts both `agent.py` and `headless_proxy/edge_pusher.py` in background jobs with auto-restart/health supervision and clean shutdown on `Ctrl + C`.

**Option B: Manual Terminal Execution**

- **Terminal 1 — Edge AI Inference Agent**:
  ```bash
  cd pig-ai-watch/edge
  source venv/bin/activate
  python agent.py
  ```
  *Expected Output:*
  `INFO Edge agent starting...`
  `INFO YOLO model loaded: models/pig_detection.onnx`
  `INFO Starting inference loop (2.0s interval)...`

- **Terminal 2 — Headless RTSP Stream Pusher**:
  ```bash
  cd pig-ai-watch/edge/headless_proxy
  source ../venv/bin/activate
  python edge_pusher.py
  ```
  *Expected Output:*
  `INFO Edge pusher started. Publishing pen feeds to rtsp://...:8554/pen_1`

##### Step 4: Run as Unattended 24/7 Systemd Services (Raspberry Pi / Linux)

For unattended production installations on edge nodes:
```bash
# Copy provided service definitions
sudo cp pig-ai-watch/edge/edge-agent.service /etc/systemd/system/
sudo cp pig-ai-watch/edge/edge-pusher.service /etc/systemd/system/

# Reload systemd and enable on boot
sudo systemctl daemon-reload
sudo systemctl enable --now edge-agent.service
sudo systemctl enable --now edge-pusher.service

# Inspect service logs
journalctl -u edge-agent.service -f
journalctl -u edge-pusher.service -f
```

---

### Method 3: Containerized Deployment (Docker Compose)

To run the complete cloud stack (FastAPI Backend, Frontend, MediaMTX, PostgreSQL, Redis) via Docker:

```bash
# Linux / macOS
cd pig-ai-watch
./start-docker.sh

# Windows
cd pig-ai-watch
.\start-docker.bat
```

Or manually:
```bash
docker compose up -d --build
```

---

### Verification & End-to-End Health Checks

1. **Backend Connectivity**: Check `curl http://localhost:8000/api/health` returns `{"status": "healthy"}`.
2. **Frontend UI**: Open `http://localhost:3000` in your browser and check that pen cards load.
3. **Edge Ingestion**: Inspect backend logs:
   ```bash
   # If running direct uvicorn:
   # Observe logs for: "POST /api/behavior/log HTTP/1.1 200 OK"
   # Or in Docker:
   docker logs pig-ai-watch-backend --tail 50
   ```
4. **RTSP Stream Check**: Verify MediaMTX stream path connectivity:
   ```bash
   # Test port 8554 reachable from edge
   nc -vz -w 5 <SERVER_HOST> 8554
   ```