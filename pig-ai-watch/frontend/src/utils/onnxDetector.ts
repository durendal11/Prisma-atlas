import * as ort from 'onnxruntime-web';

// Add log level to suppress harmless "Unknown CPU vendor" warnings in browser
ort.env.logLevel = 'error';

// Configure ONNX Runtime for optimal performance
ort.env.wasm.numThreads = 4;
ort.env.wasm.simd = true;
// In Vite dev, ORT dynamically imports .mjs with '?import'.
// Those URLs resolve correctly from /node_modules, while production should use
// static assets copied into /public.
ort.env.wasm.wasmPaths = import.meta.env.DEV
  ? '/node_modules/onnxruntime-web/dist/'
  : '/';

export interface Detection {
  classId: number;
  className: string;
  displayName: string;
  category: 'sow' | 'piglet' | 'unknown';
  posture?: string;
  confidence: number;
  bbox: [number, number, number, number];
  area: number;
  aspectRatio: number;
  centerX: number;
  centerY: number;
}

export interface DetectionResult {
  detections: Detection[];
  pigletCount: number;
  sowCount: number;
  totalPigCount: number;
  sowPosture: string;
  sowPostureConfidence: number;
  crushingRisk: number;
  crushingRiskLevel: 'low' | 'medium' | 'high' | 'critical';
  proximityAlerts: ProximityAlert[];
  inferenceTimeMs: number;
  frameTimestamp: number;
  analytics: AnalyticsData;
  behaviorSummary: BehaviorSummary;
}

export interface ProximityAlert {
  pigletIndex: number;
  sowIndex: number;
  distance: number;
  riskContribution: number;
}

export interface AnalyticsData {
  avgConfidence: number;
  detectionDensity: number;
  centerOfMass: { x: number; y: number };
  spreadRadius: number;
  movementEstimate: 'stationary' | 'low' | 'moderate' | 'high';
}

// Behavior summary for health analytics logging
export interface BehaviorSummary {
  timestamp: number;
  sowPosture: string;
  sowPostureConfidence: number;
  pigletCount: number;
  sowCount: number;
  crushingRisk: number;
  isNursing: boolean;
  isFeeding: boolean;
  isSleeping: boolean;
  activityLevel: 'resting' | 'active' | 'feeding' | 'nursing';
  healthScore: number; // 0-100 based on behavior patterns
}

// =============================================================================
// MODEL CLASS MAPPING - Finetuned model with sow posture detection
// =============================================================================
interface ClassConfig {
  name: string;
  category: 'sow' | 'piglet' | 'auto' | 'unknown';
  displayName: string;
  posture?: string;
  healthIndicator?: 'positive' | 'neutral' | 'concern';
}

const MODEL_CLASS_CONFIG: Record<number, ClassConfig> = {
  // YOLOv11 trained model classes
  // [0] piglet  [1] sow-sleep  [2] sow-sleep-lactating  [3] sow-stand-feed  [4] sow-stand-lactating
  0: { name: 'piglet',               category: 'piglet', displayName: 'Piglet',                   healthIndicator: 'neutral' },
  1: { name: 'sow-sleep',            category: 'sow',    displayName: 'Sow (Sleeping)',            posture: 'sleeping',          healthIndicator: 'positive' },
  2: { name: 'sow-sleep-lactating',  category: 'sow',    displayName: 'Sow (Nursing/Sleeping)',    posture: 'nursing',           healthIndicator: 'positive' },
  3: { name: 'sow-stand-feed',       category: 'sow',    displayName: 'Sow (Feeding)',             posture: 'feeding',           healthIndicator: 'positive' },
  4: { name: 'sow-stand-lactating',  category: 'sow',    displayName: 'Sow (Standing/Nursing)',    posture: 'standing',          healthIndicator: 'neutral' },
};

const POSTURE_THRESHOLDS = {
  lying: { minAspectRatio: 1.4, maxAspectRatio: 4.0 },
  standing: { minAspectRatio: 0.4, maxAspectRatio: 0.9 },
  sitting: { minAspectRatio: 0.9, maxAspectRatio: 1.2 },
};

const SIZE_THRESHOLDS = {
  pigletMaxArea: 0.08,
  sowMinArea: 0.10,
};

const RISK_WEIGHTS = {
  postureBase: {
    sleeping: 0.45,      // Higher risk when sleeping near piglets
    nursing: 0.35,       // Moderate-high risk during nursing
    sitting: 0.25,       // Moderate risk when sitting
    standing: 0.15,      // Lower risk when standing
    feeding: 0.10,       // Low risk when feeding
    unknown: 0.20,
    detected: 0.20,
  } as Record<string, number>,
  maxRisk: 1.0,
};

class ONNXDetector {
  private session: ort.InferenceSession | null = null;
  private loadingPromise: Promise<void> | null = null;
  private inputWidth = 640;
  private inputHeight = 640;
  private confidenceThreshold = 0.25;
  private iouThreshold = 0.45;
  private detectionHistory: DetectionResult[] = [];
  private maxHistoryLength = 30;

  // Reusable canvases for preprocessing - CRITICAL for performance
  private preprocessCanvas: HTMLCanvasElement | null = null;
  private preprocessCtx: CanvasRenderingContext2D | null = null;
  private tempCanvas: HTMLCanvasElement | null = null;
  private tempCtx: CanvasRenderingContext2D | null = null;

  async loadModel(modelPath: string = '/models/pig_detection.onnx'): Promise<void> {
    // If model already loaded, return immediately
    if (this.session) return;

    // If currently loading, wait for the existing load operation
    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    // Start loading and store the promise so other callers can await it
    this.loadingPromise = this._loadModelInternal(modelPath);

    try {
      await this.loadingPromise;
    } finally {
      this.loadingPromise = null;
    }
  }

  private async _loadModelInternal(modelPath: string): Promise<void> {
    console.log('Loading ONNX model...');
    console.log('ONNX wasm paths:', ort.env.wasm.wasmPaths);

    try {
      const response = await fetch(modelPath, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Model fetch failed: HTTP ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || 'unknown';
      const modelBuffer = await response.arrayBuffer();
      const modelBytes = new Uint8Array(modelBuffer);

      // Catch common deployment issue where SPA fallback returns index.html (200) instead of model bytes.
      const head = new TextDecoder().decode(modelBytes.slice(0, 128));
      if (head.includes('<!DOCTYPE html') || head.includes('<html')) {
        throw new Error(
          `Model URL returned HTML instead of ONNX binary (content-type=${contentType}). ` +
          `Check frontend deployment and static /models path.`
        );
      }

      const options: ort.InferenceSession.SessionOptions = {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      };

      this.session = await ort.InferenceSession.create(modelBytes, options);
      console.log('✅ ONNX model loaded successfully');
      console.log('Input names:', this.session.inputNames);
      console.log('Output names:', this.session.outputNames);

      // Log which backend is actually being used
      const backend = ort.env.webgl?.contextId ? 'WebGL' : 'WASM';
      console.log(`🚀 Execution Provider: ${backend}`);
      console.log(`⚙️ WASM threads: ${ort.env.wasm.numThreads}, SIMD: ${ort.env.wasm.simd}`);

    } catch (error) {
      console.error('Failed to load ONNX model:', error);
      this.session = null; // Reset on error so retry is possible
      throw error;
    }
  }
  
  /**
   * Optimize for live streaming - reduce input resolution for faster inference
   * Call this before starting live detection
   */
  setLiveStreamMode(_enabled: boolean = true): void {
    // Current ONNX export is statically fixed to 640x640. 
    // We cannot change this down to 416x416 unless we re-export the YOLO model 
    // with dynamic axes (dynamic_axes={'images': {2: 'height', 3: 'width'}}).
    // For now, always use 640x640 to prevent dimension mismatch crashes.
    this.inputWidth = 640;
    this.inputHeight = 640;
    console.log(`📸 setLiveStreamMode called but Model is fixed - using ${this.inputWidth}x${this.inputHeight} input`);
    
    // Reset canvases
    this.preprocessCanvas = null;
    this.preprocessCtx = null;
    this.tempCanvas = null;
    this.tempCtx = null;
  }

  async detect(imageData: ImageData | HTMLCanvasElement | HTMLVideoElement): Promise<DetectionResult> {
    if (!this.session) {
      throw new Error('Model not loaded. Call loadModel() first.');
    }

    const startTime = performance.now();
    const frameTimestamp = Date.now();

    const inputTensor = await this.preprocess(imageData);
    const outputs = await this.session.run({ images: inputTensor });
    
    const output0 = outputs[this.session.outputNames[0]];
    const output1 = outputs[this.session.outputNames[1]];
    const rawDetections = await this.postprocess(output0, output1);
    
    const detections = this.enrichDetections(rawDetections);
    const inferenceTimeMs = performance.now() - startTime;
    const result = this.calculateStatistics(detections, inferenceTimeMs, frameTimestamp);
    this.updateHistory(result);

    return result;
  }

  private enrichDetections(rawDetections: Detection[]): Detection[] {
    const imageArea = this.inputWidth * this.inputHeight;
    
    return rawDetections.map(det => {
      const width = det.bbox[2] - det.bbox[0];
      const height = det.bbox[3] - det.bbox[1];
      const area = width * height;
      const aspectRatio = width / height;
      const relativeArea = area / imageArea;
      
      const classConfig = MODEL_CLASS_CONFIG[det.classId] || {
        name: `class_${det.classId}`,
        category: 'unknown' as const,
        displayName: `Class ${det.classId}`,
      };

      let category: 'sow' | 'piglet' | 'unknown' = 'unknown';
      
      if (classConfig.category === 'sow') {
        category = 'sow';
      } else if (classConfig.category === 'piglet') {
        category = 'piglet';
      } else if (classConfig.category === 'auto') {
        if (relativeArea < SIZE_THRESHOLDS.pigletMaxArea) {
          category = 'piglet';
        } else if (relativeArea > SIZE_THRESHOLDS.sowMinArea) {
          category = 'sow';
        } else {
          category = aspectRatio > 1.3 ? 'sow' : 'piglet';
        }
      }

      return {
        ...det,
        displayName: classConfig.displayName,
        category,
        posture: classConfig.posture,
        area,
        aspectRatio,
        centerX: (det.bbox[0] + det.bbox[2]) / 2,
        centerY: (det.bbox[1] + det.bbox[3]) / 2,
      };
    });
  }

  private calculateStatistics(
    detections: Detection[],
    inferenceTimeMs: number,
    frameTimestamp: number
  ): DetectionResult {
    const sows = detections.filter(d => d.category === 'sow');
    const piglets = detections.filter(d => d.category === 'piglet');
    
    const pigletCount = piglets.length;
    const sowCount = sows.length;
    const totalPigCount = detections.length;

    const { posture, confidence } = this.inferSowPosture(sows);
    const proximityAlerts = this.calculateProximityAlerts(sows, piglets);
    const { risk, level } = this.calculateCrushingRisk(posture, proximityAlerts, pigletCount, detections);
    const analytics = this.calculateAnalytics(detections);
    const behaviorSummary = this.calculateBehaviorSummary(
      posture, confidence, pigletCount, sowCount, risk, sows
    );

    return {
      detections,
      pigletCount,
      sowCount,
      totalPigCount,
      sowPosture: posture,
      sowPostureConfidence: confidence,
      crushingRisk: risk,
      crushingRiskLevel: level,
      proximityAlerts,
      inferenceTimeMs,
      frameTimestamp,
      analytics,
      behaviorSummary,
    };
  }

  private calculateBehaviorSummary(
    posture: string,
    postureConfidence: number,
    pigletCount: number,
    sowCount: number,
    crushingRisk: number,
    sows: Detection[]
  ): BehaviorSummary {
    const isNursing = posture === 'nursing' || sows.some(s => s.className === 'sow-sleep-lactating' || s.className === 'sow-stand-lactating');
    const isFeeding = posture === 'feeding' || sows.some(s => s.className === 'sow-stand-feed');
    const isSleeping = posture === 'sleeping' || sows.some(s => s.className === 'sow-sleep' || s.className === 'sow-sleep-lactating');

    // Determine activity level
    let activityLevel: 'resting' | 'active' | 'feeding' | 'nursing' = 'resting';
    if (isNursing) activityLevel = 'nursing';
    else if (isFeeding) activityLevel = 'feeding';
    else if (posture === 'standing' || posture === 'sitting') activityLevel = 'active';

    // Calculate health score (0-100)
    // Positive indicators: nursing, feeding, normal posture changes
    // Negative indicators: high crushing risk, prolonged inactivity
    let healthScore = 70; // Base score

    if (isNursing) healthScore += 15;
    if (isFeeding) healthScore += 10;
    if (pigletCount > 0 && crushingRisk < 0.3) healthScore += 5;
    if (crushingRisk > 0.6) healthScore -= 20;
    if (crushingRisk > 0.8) healthScore -= 10;
    
    // Clamp to 0-100
    healthScore = Math.max(0, Math.min(100, healthScore));

    return {
      timestamp: Date.now(),
      sowPosture: posture,
      sowPostureConfidence: postureConfidence,
      pigletCount,
      sowCount,
      crushingRisk,
      isNursing,
      isFeeding,
      isSleeping,
      activityLevel,
      healthScore,
    };
  }

  private inferSowPosture(sows: Detection[]): { posture: string; confidence: number } {
    if (sows.length === 0) {
      return { posture: 'unknown', confidence: 0 };
    }

    const primarySow = sows.reduce((largest, current) => 
      current.area > largest.area ? current : largest
    );

    const classConfig = MODEL_CLASS_CONFIG[primarySow.classId];
    if (classConfig?.posture) {
      return { posture: classConfig.posture, confidence: primarySow.confidence };
    }

    const ar = primarySow.aspectRatio;
    
    if (ar >= POSTURE_THRESHOLDS.lying.minAspectRatio && ar <= POSTURE_THRESHOLDS.lying.maxAspectRatio) {
      const isLateral = ar > 2.0;
      return { posture: isLateral ? 'lying_lateral' : 'lying', confidence: Math.min(0.85, primarySow.confidence) };
    }
    
    if (ar >= POSTURE_THRESHOLDS.standing.minAspectRatio && ar <= POSTURE_THRESHOLDS.standing.maxAspectRatio) {
      return { posture: 'standing', confidence: Math.min(0.8, primarySow.confidence) };
    }
    
    if (ar >= POSTURE_THRESHOLDS.sitting.minAspectRatio && ar <= POSTURE_THRESHOLDS.sitting.maxAspectRatio) {
      return { posture: 'sitting', confidence: Math.min(0.7, primarySow.confidence) };
    }

    return { posture: 'detected', confidence: primarySow.confidence * 0.5 };
  }

  private calculateProximityAlerts(sows: Detection[], piglets: Detection[]): ProximityAlert[] {
    const alerts: ProximityAlert[] = [];
    if (sows.length === 0 || piglets.length === 0) return alerts;

    const inputSize = 640;

    sows.forEach((sow, sowIndex) => {
      const sowW = sow.bbox[2] - sow.bbox[0];
      const sowH = sow.bbox[3] - sow.bbox[1];
      const sowWidthNorm = sowW / inputSize;
      const sowHeightNorm = sowH / inputSize;
      const halfDangerW = sowWidthNorm * 0.25;
      const halfDangerH = sowHeightNorm * 0.25;
      const halfWarningW = halfDangerW * 1.6;
      const halfWarningH = halfDangerH * 1.6;

      const sowXNorm = sow.centerX / inputSize;
      const sowYNorm = sow.centerY / inputSize;

      piglets.forEach((piglet, pigletIndex) => {
        const pigletXNorm = piglet.centerX / inputSize;
        const pigletYNorm = piglet.centerY / inputSize;
        const dx = Math.abs(pigletXNorm - sowXNorm);
        const dy = Math.abs(pigletYNorm - sowYNorm);

        const inDangerZone = dx <= halfDangerW && dy <= halfDangerH;
        const inWarningZone = dx <= halfWarningW && dy <= halfWarningH;

        if (inDangerZone || inWarningZone) {
          let riskContribution = 0;
          if (inDangerZone) {
            riskContribution = 0.3;
          } else {
            const dxRatio = halfWarningW > 0 ? dx / halfWarningW : 1;
            const dyRatio = halfWarningH > 0 ? dy / halfWarningH : 1;
            const normalizedDist = Math.sqrt(dxRatio * dxRatio + dyRatio * dyRatio);
            riskContribution = Math.max(0, 0.15 * (1 - normalizedDist));
          }

          const distance = Math.sqrt(dx * dx + dy * dy);
          alerts.push({ pigletIndex, sowIndex, distance, riskContribution });
        }
      });
    });

    return alerts.sort((a, b) => b.riskContribution - a.riskContribution);
  }

  private calculateCrushingRisk(
    posture: string,
    proximityAlerts: ProximityAlert[],
    pigletCount: number,
    detections: Detection[]
  ): { risk: number; level: 'low' | 'medium' | 'high' | 'critical' } {
    if (detections.length === 0) return { risk: 0, level: 'low' };

    let risk = RISK_WEIGHTS.postureBase[posture] || 0.1;
    const proximityRisk = proximityAlerts.reduce((sum, alert) => sum + alert.riskContribution, 0);
    risk += Math.min(proximityRisk, 0.4);

    if (pigletCount > 3) {
      risk += (pigletCount - 3) * 0.05;
    }

    if (this.detectionHistory.length > 5) {
      const recentRisks = this.detectionHistory.slice(-5).map(r => r.crushingRisk);
      const avgRecentRisk = recentRisks.reduce((a, b) => a + b, 0) / recentRisks.length;
      risk = risk * 0.7 + avgRecentRisk * 0.3;
    }

    risk = Math.max(0, Math.min(RISK_WEIGHTS.maxRisk, risk));
    risk = Math.round(risk * 100) / 100;

    let level: 'low' | 'medium' | 'high' | 'critical';
    if (risk >= 0.75) level = 'critical';
    else if (risk >= 0.5) level = 'high';
    else if (risk >= 0.25) level = 'medium';
    else level = 'low';

    return { risk, level };
  }

  private calculateAnalytics(detections: Detection[]): AnalyticsData {
    if (detections.length === 0) {
      return {
        avgConfidence: 0,
        detectionDensity: 0,
        centerOfMass: { x: 0.5, y: 0.5 },
        spreadRadius: 0,
        movementEstimate: 'stationary',
      };
    }

    const avgConfidence = detections.reduce((sum, d) => sum + d.confidence, 0) / detections.length;
    const totalArea = detections.reduce((sum, d) => sum + d.area, 0);
    const imageArea = this.inputWidth * this.inputHeight;
    const detectionDensity = totalArea / imageArea;

    const totalWeight = detections.reduce((sum, d) => sum + d.area, 0);
    const centerOfMass = {
      x: detections.reduce((sum, d) => sum + d.centerX * d.area, 0) / totalWeight / this.inputWidth,
      y: detections.reduce((sum, d) => sum + d.centerY * d.area, 0) / totalWeight / this.inputHeight,
    };

    const spreadRadius = Math.sqrt(
      detections.reduce((sum, d) => {
        const dx = d.centerX / this.inputWidth - centerOfMass.x;
        const dy = d.centerY / this.inputHeight - centerOfMass.y;
        return sum + dx * dx + dy * dy;
      }, 0) / detections.length
    );

    let movementEstimate: 'stationary' | 'low' | 'moderate' | 'high' = 'stationary';
    if (this.detectionHistory.length >= 10) {
      const recent = this.detectionHistory.slice(-10);
      const centerMovements = recent.map((r, i) => {
        if (i === 0) return 0;
        const prev = recent[i - 1].analytics.centerOfMass;
        const curr = r.analytics.centerOfMass;
        return Math.sqrt(Math.pow(curr.x - prev.x, 2) + Math.pow(curr.y - prev.y, 2));
      });
      const avgMovement = centerMovements.reduce((a, b) => a + b, 0) / centerMovements.length;
      
      if (avgMovement > 0.05) movementEstimate = 'high';
      else if (avgMovement > 0.02) movementEstimate = 'moderate';
      else if (avgMovement > 0.005) movementEstimate = 'low';
    }

    return {
      avgConfidence: Math.round(avgConfidence * 100) / 100,
      detectionDensity: Math.round(detectionDensity * 1000) / 1000,
      centerOfMass,
      spreadRadius: Math.round(spreadRadius * 1000) / 1000,
      movementEstimate,
    };
  }

  private updateHistory(result: DetectionResult): void {
    this.detectionHistory.push(result);
    if (this.detectionHistory.length > this.maxHistoryLength) {
      this.detectionHistory.shift();
    }
  }

  private async preprocess(source: ImageData | HTMLCanvasElement | HTMLVideoElement): Promise<ort.Tensor> {
    // Initialize reusable canvases if not exists
    if (!this.preprocessCanvas) {
      this.preprocessCanvas = document.createElement('canvas');
      this.preprocessCanvas.width = this.inputWidth;
      this.preprocessCanvas.height = this.inputHeight;
      this.preprocessCtx = this.preprocessCanvas.getContext('2d', { 
        alpha: false,
        willReadFrequently: true 
      })!;
    }
    
    if (!this.tempCanvas && source instanceof ImageData) {
      this.tempCanvas = document.createElement('canvas');
      this.tempCtx = this.tempCanvas.getContext('2d', { alpha: false })!;
    }

    const ctx = this.preprocessCtx!;

    // Resize image to input dimensions
    if (source instanceof ImageData) {
      if (this.tempCanvas && this.tempCtx) {
        this.tempCanvas.width = source.width;
        this.tempCanvas.height = source.height;
        this.tempCtx.putImageData(source, 0, 0);
        ctx.drawImage(this.tempCanvas, 0, 0, this.inputWidth, this.inputHeight);
      }
    } else {
      ctx.drawImage(source, 0, 0, this.inputWidth, this.inputHeight);
    }

    // Get pixel data
    const imageData = ctx.getImageData(0, 0, this.inputWidth, this.inputHeight);
    const { data } = imageData;

    // Optimize: Use single loop and preallocated array
    const numPixels = this.inputWidth * this.inputHeight;
    const inputData = new Float32Array(3 * numPixels);
    
    // Single pass pixel normalization - MUCH faster than 3 separate loops
    for (let i = 0; i < numPixels; i++) {
      const pixelIndex = i * 4;
      inputData[i] = data[pixelIndex] / 255.0;                    // R
      inputData[i + numPixels] = data[pixelIndex + 1] / 255.0;    // G
      inputData[i + numPixels * 2] = data[pixelIndex + 2] / 255.0; // B
    }

    return new ort.Tensor('float32', inputData, [1, 3, this.inputHeight, this.inputWidth]);
  }

  private async postprocess(output0: ort.Tensor, _output1?: ort.Tensor): Promise<Detection[]> {
    const data = output0.data as Float32Array;
    const [, numFeatures, numAnchors] = output0.dims;
    // Detection-only model: numFeatures = 4 (bbox) + numClasses
    // Do NOT subtract 32 (that was for old segmentation models)
    const numClasses = Math.max(1, numFeatures - 4);
    
    console.log(`Postprocess - Dims: [${output0.dims}], Features: ${numFeatures}, Anchors: ${numAnchors}, Classes: ${numClasses}`);
    
    const detections: Detection[] = [];
    const boxes: number[][] = [];
    const scores: number[] = [];
    const classIds: number[] = [];

    for (let i = 0; i < numAnchors; i++) {
      const xc = data[0 * numAnchors + i];
      const yc = data[1 * numAnchors + i];
      const w = data[2 * numAnchors + i];
      const h = data[3 * numAnchors + i];

      let maxScore = 0;
      let maxClassId = 0;
      for (let c = 0; c < numClasses; c++) {
        const score = data[(4 + c) * numAnchors + i];
        if (score > maxScore) {
          maxScore = score;
          maxClassId = c;
        }
      }

      if (maxScore > this.confidenceThreshold) {
        boxes.push([xc - w / 2, yc - h / 2, xc + w / 2, yc + h / 2]);
        scores.push(maxScore);
        classIds.push(maxClassId);
      }
    }

    console.log(`Boxes before NMS: ${boxes.length} (threshold: ${this.confidenceThreshold})`);
    const nmsIndices = this.nms(boxes, scores, this.iouThreshold);
    console.log(`Boxes after NMS: ${nmsIndices.length}`);

    for (const idx of nmsIndices) {
      const classConfig = MODEL_CLASS_CONFIG[classIds[idx]];
      detections.push({
        classId: classIds[idx],
        className: classConfig?.name || `class_${classIds[idx]}`,
        displayName: classConfig?.displayName || `Class ${classIds[idx]}`,
        category: 'unknown',
        confidence: scores[idx],
        bbox: boxes[idx] as [number, number, number, number],
        area: 0,
        aspectRatio: 0,
        centerX: 0,
        centerY: 0,
      });
    }

    return detections;
  }

  private nms(boxes: number[][], scores: number[], iouThreshold: number): number[] {
    const indices = scores.map((score, idx) => ({ score, idx })).sort((a, b) => b.score - a.score).map(item => item.idx);
    const selected: number[] = [];
    const active = new Array(indices.length).fill(true);

    for (let i = 0; i < indices.length; i++) {
      if (!active[i]) continue;
      selected.push(indices[i]);
      for (let j = i + 1; j < indices.length; j++) {
        if (!active[j]) continue;
        if (this.calculateIoU(boxes[indices[i]], boxes[indices[j]]) > iouThreshold) {
          active[j] = false;
        }
      }
    }
    return selected;
  }

  private calculateIoU(box1: number[], box2: number[]): number {
    const x1 = Math.max(box1[0], box2[0]);
    const y1 = Math.max(box1[1], box2[1]);
    const x2 = Math.min(box1[2], box2[2]);
    const y2 = Math.min(box1[3], box2[3]);
    const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const area1 = (box1[2] - box1[0]) * (box1[3] - box1[1]);
    const area2 = (box2[2] - box2[0]) * (box2[3] - box2[1]);
    return intersection / (area1 + area2 - intersection);
  }

  isReady(): boolean {
    return this.session !== null;
  }

  getInputSize(): { width: number; height: number } {
    return { width: this.inputWidth, height: this.inputHeight };
  }

  setConfidenceThreshold(threshold: number): void {
    this.confidenceThreshold = Math.max(0.1, Math.min(0.9, threshold));
  }

  setIoUThreshold(threshold: number): void {
    this.iouThreshold = Math.max(0.1, Math.min(0.9, threshold));
  }

  getDetectionHistory(): DetectionResult[] {
    return [...this.detectionHistory];
  }

  clearHistory(): void {
    this.detectionHistory = [];
  }
}

export const onnxDetector = new ONNXDetector();

/**
 * Draw pulsing highlight bounding boxes on piglets that are at high crushing risk.
 * Call this AFTER drawing normal detections so the highlights render on top.
 *
 * @param ctx        - Canvas 2D rendering context (the overlay canvas)
 * @param detections - The full detections array from DetectionResult
 * @param alerts     - The proximityAlerts array from DetectionResult
 * @param scaleX     - X scale factor from model input coords to display coords
 * @param scaleY     - Y scale factor from model input coords to display coords
 */
export function drawRiskHighlights(
  ctx: CanvasRenderingContext2D,
  detections: Detection[],
  alerts: ProximityAlert[],
  scaleX: number,
  scaleY: number,
): void {
  if (!alerts || alerts.length === 0) return;

  const piglets = detections.filter(d => d.category === 'piglet');
  if (piglets.length === 0) return;

  // Pulsing animation driven by wall-clock time
  const t = performance.now();
  const pulse = 0.45 + 0.55 * Math.abs(Math.sin(t * 0.004)); // 0.45-1.0 oscillation

  ctx.save();

  for (const alert of alerts) {
    const piglet = piglets[alert.pigletIndex];
    if (!piglet) continue;

    const [x1, y1, x2, y2] = piglet.bbox;
    const sx1 = x1 * scaleX;
    const sy1 = y1 * scaleY;
    const w = (x2 - x1) * scaleX;
    const h = (y2 - y1) * scaleY;

    const isCritical = alert.riskContribution >= 0.3;
    const color = isCritical ? 'rgba(249, 115, 22,' : 'rgba(245, 158, 11,'; // orange-500 / amber-500

    // Glow effect
    ctx.shadowColor = isCritical ? '#f97316' : '#f59e0b';
    ctx.shadowBlur = 8 * pulse;

    // Highlighted bounding box
    ctx.strokeStyle = `${color}${pulse.toFixed(2)})`;
    ctx.lineWidth = isCritical ? 2.5 : 1.8;
    ctx.strokeRect(sx1, sy1, w, h);

    // Reset shadow for label
    ctx.shadowBlur = 0;

    // Risk label above the box
    const label = isCritical ? 'HIGH RISK' : 'NEARBY';
    ctx.font = 'bold 9px Arial';
    const tw = ctx.measureText(label).width;
    const pad = 3;
    const lh = 11;

    ctx.fillStyle = `${color}${(pulse * 0.85).toFixed(2)})`;
    ctx.fillRect(sx1, sy1 - lh - pad, tw + pad * 2, lh + pad);
    ctx.fillStyle = 'white';
    ctx.fillText(label, sx1 + pad, sy1 - pad - 1);
  }

  ctx.restore();
}
