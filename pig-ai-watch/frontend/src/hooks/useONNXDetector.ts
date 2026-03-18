import { useState, useEffect, useRef, useCallback } from 'react';
import * as ort from 'onnxruntime-web';

// Configure ONNX Runtime for WebGL/WASM backend
ort.env.wasm.numThreads = 4;
ort.env.wasm.simd = true;

export interface Detection {
  classId: number;
  className: string;
  confidence: number;
  bbox: [number, number, number, number]; // x1, y1, x2, y2
  mask?: Float32Array; // For segmentation
}

export interface DetectionResult {
  detections: Detection[];
  pigletCount: number;
  sowPosture: string;
  crushingRisk: number;
  inferenceTime: number;
}

// Class names from your model - adjust based on your actual classes
const CLASS_NAMES = [
  'pig',          // 0
  'sow',          // 1
  'piglet',       // 2
  'sow_lying',    // 3
  'sow_standing', // 4
  'sow_nursing',  // 5
  'sow_sitting',  // 6
  // Add more classes as per your model
];

export function useONNXDetector(modelPath: string = '/models/pig_detection.onnx') {
  const [isLoading, setIsLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelInfo, setModelInfo] = useState<{ inputShape: number[]; outputNames: string[] } | null>(null);
  
  const sessionRef = useRef<ort.InferenceSession | null>(null);
  const inputNameRef = useRef<string>('images');

  // Initialize the ONNX model
  useEffect(() => {
    async function loadModel() {
      try {
        setIsLoading(true);
        setError(null);

        console.log('Loading ONNX model from:', modelPath);

        // Create inference session with WebGL or WASM backend
        const session = await ort.InferenceSession.create(modelPath, {
          executionProviders: ['webgl', 'wasm'],
          graphOptimizationLevel: 'all',
        });

        sessionRef.current = session;

        // Get input/output info
        const inputNames = session.inputNames;
        const outputNames = session.outputNames;
        
        inputNameRef.current = inputNames[0];
        
        console.log('Model loaded successfully');
        console.log('Input names:', inputNames);
        console.log('Output names:', outputNames);

        setModelInfo({
          inputShape: [1, 3, 416, 416],
          outputNames: [...outputNames],
        });

        setIsReady(true);
      } catch (err) {
        console.error('Failed to load ONNX model:', err);
        setError(err instanceof Error ? err.message : 'Failed to load model');
      } finally {
        setIsLoading(false);
      }
    }

    loadModel();

    return () => {
      if (sessionRef.current) {
        sessionRef.current.release();
      }
    };
  }, [modelPath]);

  // Preprocess image for YOLO (resize, normalize, transpose)
  const preprocessImage = useCallback((
    imageData: ImageData,
    targetSize: number = 416
  ): Float32Array => {
    const { data: _data, width, height } = imageData;
    
    // Create a temporary canvas for resizing
    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d')!;
    
    // Create ImageBitmap from the original data
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.putImageData(imageData, 0, 0);
    
    // Resize
    ctx.drawImage(tempCanvas, 0, 0, width, height, 0, 0, targetSize, targetSize);
    const resizedData = ctx.getImageData(0, 0, targetSize, targetSize);
    
    // Convert to float32 and normalize (0-255 -> 0-1)
    // Also transpose from HWC to CHW format
    const float32Data = new Float32Array(3 * targetSize * targetSize);
    
    for (let y = 0; y < targetSize; y++) {
      for (let x = 0; x < targetSize; x++) {
        const srcIdx = (y * targetSize + x) * 4;
        const dstIdx = y * targetSize + x;
        
        // RGB channels normalized to 0-1
        float32Data[0 * targetSize * targetSize + dstIdx] = resizedData.data[srcIdx] / 255.0;     // R
        float32Data[1 * targetSize * targetSize + dstIdx] = resizedData.data[srcIdx + 1] / 255.0; // G
        float32Data[2 * targetSize * targetSize + dstIdx] = resizedData.data[srcIdx + 2] / 255.0; // B
      }
    }
    
    return float32Data;
  }, []);

  // Non-maximum suppression
  const nms = useCallback((
    boxes: number[][],
    scores: number[],
    iouThreshold: number = 0.45
  ): number[] => {
    const indices: number[] = [];
    const sorted = scores
      .map((score, idx) => ({ score, idx }))
      .sort((a, b) => b.score - a.score);
    
    const used = new Set<number>();
    
    for (const { idx } of sorted) {
      if (used.has(idx)) continue;
      
      indices.push(idx);
      used.add(idx);
      
      const boxA = boxes[idx];
      
      for (const { idx: otherIdx } of sorted) {
        if (used.has(otherIdx)) continue;
        
        const boxB = boxes[otherIdx];
        const iou = calculateIoU(boxA, boxB);
        
        if (iou > iouThreshold) {
          used.add(otherIdx);
        }
      }
    }
    
    return indices;
  }, []);

  // Calculate Intersection over Union
  const calculateIoU = (boxA: number[], boxB: number[]): number => {
    const [x1A, y1A, x2A, y2A] = boxA;
    const [x1B, y1B, x2B, y2B] = boxB;
    
    const xLeft = Math.max(x1A, x1B);
    const yTop = Math.max(y1A, y1B);
    const xRight = Math.min(x2A, x2B);
    const yBottom = Math.min(y2A, y2B);
    
    if (xRight < xLeft || yBottom < yTop) return 0;
    
    const intersection = (xRight - xLeft) * (yBottom - yTop);
    const areaA = (x2A - x1A) * (y2A - y1A);
    const areaB = (x2B - x1B) * (y2B - y1B);
    
    return intersection / (areaA + areaB - intersection);
  };

  // Process YOLO output
  const processOutput = useCallback((
    output: ort.Tensor,
    originalWidth: number,
    originalHeight: number,
    confThreshold: number = 0.25
  ): Detection[] => {
    const data = output.data as Float32Array;
    const [_batch, features, numBoxes] = output.dims;
    
    const detections: Detection[] = [];
    const boxes: number[][] = [];
    const scores: number[] = [];
    const classIds: number[] = [];
    
    // YOLOv8 output format: [batch, 4 + num_classes + 32, num_boxes]
    // First 4 values are cx, cy, w, h
    // Next num_classes values are class probabilities
    const numClasses = features - 4 - 32; // 32 for segmentation mask coefficients
    
    for (let i = 0; i < numBoxes; i++) {
      // Find best class
      let maxConf = 0;
      let maxClassId = 0;
      
      for (let c = 0; c < numClasses; c++) {
        const conf = data[(4 + c) * numBoxes + i];
        if (conf > maxConf) {
          maxConf = conf;
          maxClassId = c;
        }
      }
      
      if (maxConf < confThreshold) continue;
      
      // Get box coordinates (cx, cy, w, h)
      const cx = data[0 * numBoxes + i];
      const cy = data[1 * numBoxes + i];
      const w = data[2 * numBoxes + i];
      const h = data[3 * numBoxes + i];
      
      // Convert to x1, y1, x2, y2 and scale to original image size
      const scaleX = originalWidth / 416;
      const scaleY = originalHeight / 416;
      
      const x1 = (cx - w / 2) * scaleX;
      const y1 = (cy - h / 2) * scaleY;
      const x2 = (cx + w / 2) * scaleX;
      const y2 = (cy + h / 2) * scaleY;
      
      boxes.push([x1, y1, x2, y2]);
      scores.push(maxConf);
      classIds.push(maxClassId);
    }
    
    // Apply NMS
    const keepIndices = nms(boxes, scores);
    
    for (const idx of keepIndices) {
      detections.push({
        classId: classIds[idx],
        className: CLASS_NAMES[classIds[idx]] || `class_${classIds[idx]}`,
        confidence: scores[idx],
        bbox: boxes[idx] as [number, number, number, number],
      });
    }
    
    return detections;
  }, [nms]);

  // Calculate crushing risk
  const calculateRisk = useCallback((detections: Detection[]): { risk: number; posture: string } => {
    let risk = 0;
    let posture = 'unknown';
    
    const sowDetections = detections.filter(d => 
      d.className.includes('sow') || d.className === 'pig'
    );
    const pigletDetections = detections.filter(d => 
      d.className.includes('piglet')
    );
    
    // Determine sow posture
    for (const det of sowDetections) {
      if (det.className.includes('lying')) posture = 'lying';
      else if (det.className.includes('standing')) posture = 'standing';
      else if (det.className.includes('nursing')) posture = 'nursing';
      else if (det.className.includes('sitting')) posture = 'sitting';
      else posture = 'detected';
    }
    
    // Calculate risk based on proximity
    if (sowDetections.length > 0 && pigletDetections.length > 0) {
      const sow = sowDetections[0];
      const sowCenter = [
        (sow.bbox[0] + sow.bbox[2]) / 2,
        (sow.bbox[1] + sow.bbox[3]) / 2,
      ];
      const sowSize = Math.max(
        sow.bbox[2] - sow.bbox[0],
        sow.bbox[3] - sow.bbox[1]
      );
      
      // Base risk from posture
      if (posture === 'lying') risk = 0.3;
      else if (posture === 'nursing') risk = 0.25;
      else if (posture === 'standing') risk = 0.4; // Might lie down
      else risk = 0.2;
      
      // Add proximity risk
      for (const piglet of pigletDetections) {
        const pigletCenter = [
          (piglet.bbox[0] + piglet.bbox[2]) / 2,
          (piglet.bbox[1] + piglet.bbox[3]) / 2,
        ];
        
        const distance = Math.sqrt(
          Math.pow(sowCenter[0] - pigletCenter[0], 2) +
          Math.pow(sowCenter[1] - pigletCenter[1], 2)
        );
        
        if (distance < sowSize * 0.4) {
          risk = Math.min(risk + 0.25, 1.0);
        } else if (distance < sowSize * 0.7) {
          risk = Math.min(risk + 0.1, 1.0);
        }
      }
    }
    
    return { risk, posture };
  }, []);

  // Main detection function
  const detect = useCallback(async (
    imageData: ImageData,
    originalWidth: number,
    originalHeight: number
  ): Promise<DetectionResult | null> => {
    if (!sessionRef.current || !isReady) {
      return null;
    }

    const startTime = performance.now();

    try {
      // Preprocess
      const inputData = preprocessImage(imageData);
      
      // Create tensor
      const inputTensor = new ort.Tensor('float32', inputData, [1, 3, 416, 416]);
      
      // Run inference
      const feeds: Record<string, ort.Tensor> = {};
      feeds[inputNameRef.current] = inputTensor;
      
      const results = await sessionRef.current.run(feeds);
      
      // Get the main detection output (first output)
      const outputNames = Object.keys(results);
      const output = results[outputNames[0]];
      
      // Process detections
      const detections = processOutput(output, originalWidth, originalHeight);
      
      // Calculate stats
      const pigletCount = detections.filter(d => 
        d.className.includes('piglet') || d.className === 'pig'
      ).length;
      
      const { risk, posture } = calculateRisk(detections);
      
      const inferenceTime = performance.now() - startTime;

      return {
        detections,
        pigletCount,
        sowPosture: posture,
        crushingRisk: risk,
        inferenceTime,
      };
    } catch (err) {
      console.error('Detection error:', err);
      return null;
    }
  }, [isReady, preprocessImage, processOutput, calculateRisk]);

  return {
    detect,
    isLoading,
    isReady,
    error,
    modelInfo,
  };
}
