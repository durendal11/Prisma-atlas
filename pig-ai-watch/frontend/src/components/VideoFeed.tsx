import { useEffect, useRef, useState, useCallback } from 'react';
import { VideoOff, Maximize2, AlertTriangle, Camera, CameraOff, Loader2, Cpu } from 'lucide-react';
import RiskGauge from './RiskGauge';
import { onnxDetector, DetectionResult, Detection, drawRiskHighlights } from '@/utils/onnxDetector';
import type { ProximityAlert } from '@/utils/onnxDetector';
import { behaviorLogger } from '@/services/behaviorLogger';
import clsx from 'clsx';

interface VideoFeedProps {
  penId: string;
  penName: string;
  sowId?: number;
  sowTag?: string | null;
  isLive?: boolean;
  showStats?: boolean;
  enableLogging?: boolean;
  className?: string;
  onFullscreen?: () => void;
}

type CameraStatus = 'idle' | 'loading-model' | 'requesting' | 'active' | 'denied' | 'error';

// Colors for different detection classes (finetuned model)
const CLASS_COLORS: Record<string, string> = {
  'piglet': '#4CAF50',           // Green
  'sow-sit': '#FF9800',          // Orange
  'sow-sleep': '#2196F3',        // Blue
  'sow-sleep-lactate': '#9C27B0', // Purple (lactating)
  'sow-stand': '#607D8B',        // Gray-blue
  'sow-stand-feed': '#8BC34A',   // Light green (feeding)
  default: '#4CAF50',
};

// Colors for inferred categories
const CATEGORY_COLORS: Record<string, string> = {
  sow: '#E91E63',      // Pink
  piglet: '#4CAF50',   // Green
  unknown: '#9E9E9E',  // Gray
};

export default function VideoFeed({
  penId,
  penName,
  sowId,
  sowTag,
  isLive: _isLive = true,
  showStats = true,
  enableLogging = true,
  className,
  onFullscreen,
}: VideoFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [fps, setFps] = useState<number>(0);
  const [modelLoaded, setModelLoaded] = useState<boolean>(false);
  
  const fpsHistoryRef = useRef<number[]>([]);
  const isDetectingRef = useRef<boolean>(false);

  // Load ONNX model
  const loadModel = useCallback(async () => {
    if (modelLoaded || onnxDetector.isReady()) {
      setModelLoaded(true);
      return true;
    }

    setCameraStatus('loading-model');
    try {
      await onnxDetector.loadModel('/models/pig_detection.onnx');
      setModelLoaded(true);
      return true;
    } catch (error) {
      console.error('Failed to load model:', error);
      setErrorMessage('Failed to load AI model. Please refresh the page.');
      setCameraStatus('error');
      return false;
    }
  }, [modelLoaded]);

  // Draw detections on overlay canvas
  const drawDetections = useCallback((detections: Detection[], inferenceTime: number, proximityAlerts?: ProximityAlert[]) => {
    const overlay = overlayRef.current;
    const video = videoRef.current;
    if (!overlay || !video) return;

    const ctx = overlay.getContext('2d');
    if (!ctx) return;

    // Match overlay to video display size
    const rect = video.getBoundingClientRect();
    overlay.width = rect.width;
    overlay.height = rect.height;

    ctx.clearRect(0, 0, overlay.width, overlay.height);

    // Scale factors
    const { width: inputW, height: inputH } = onnxDetector.getInputSize();
    const scaleX = overlay.width / inputW;
    const scaleY = overlay.height / inputH;

    // Draw each detection
    detections.forEach((det) => {
      const [x1, y1, x2, y2] = det.bbox;
      const sx1 = x1 * scaleX;
      const sy1 = y1 * scaleY;
      const sx2 = x2 * scaleX;
      const sy2 = y2 * scaleY;
      const width = sx2 - sx1;
      const height = sy2 - sy1;

      // Use category-based colors for better visualization
      const color = CATEGORY_COLORS[det.category] || CLASS_COLORS[det.className] || CLASS_COLORS.default;

      // Draw bounding box
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.6;
      ctx.strokeRect(sx1, sy1, width, height);

      // Draw filled corners for style
      const cornerSize = 8;
      ctx.fillStyle = color;
      // Top-left
      ctx.fillRect(sx1, sy1, cornerSize, 1);
      ctx.fillRect(sx1, sy1, 1, cornerSize);
      // Top-right
      ctx.fillRect(sx2 - cornerSize, sy1, cornerSize, 1);
      ctx.fillRect(sx2 - 1, sy1, 1, cornerSize);
      // Bottom-left
      ctx.fillRect(sx1, sy2 - 1, cornerSize, 1);
      ctx.fillRect(sx1, sy2 - cornerSize, 1, cornerSize);
      // Bottom-right
      ctx.fillRect(sx2 - cornerSize, sy2 - 1, cornerSize, 1);
      ctx.fillRect(sx2 - 1, sy2 - cornerSize, 1, cornerSize);

      // Draw label with category
      const categoryLabel = det.category !== 'unknown' ? det.category.charAt(0).toUpperCase() + det.category.slice(1) : '';
      const label = `${categoryLabel ? categoryLabel + ' • ' : ''}${det.displayName} ${(det.confidence * 100).toFixed(0)}%`;
      ctx.font = '8px Arial';
      const textMetrics = ctx.measureText(label);
      const textHeight = 10;
      const padding = 3;

      // Label background
      ctx.fillStyle = color;
      ctx.fillRect(sx1, sy1 - textHeight - padding, textMetrics.width + padding * 2, textHeight + padding);

      // Label text
      ctx.fillStyle = 'white';
      ctx.fillText(label, sx1 + padding, sy1 - padding);
    });

    // Highlight at-risk piglets
    if (proximityAlerts && proximityAlerts.length > 0) {
      drawRiskHighlights(ctx, detections, proximityAlerts, scaleX, scaleY);
    }

    // Draw FPS and inference time overlay
    ctx.font = 'bold 16px monospace';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(overlay.width - 160, 10, 150, 60);
    ctx.fillStyle = '#00ff00';
    ctx.fillText(`FPS: ${fps}`, overlay.width - 150, 32);
    ctx.fillStyle = '#00ffff';
    ctx.fillText(`Inference: ${inferenceTime.toFixed(0)}ms`, overlay.width - 150, 55);
  }, [fps]);

  // Main detection loop - runs non-blocking on every animation frame
  const runDetection = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !onnxDetector.isReady()) {
      animationFrameRef.current = requestAnimationFrame(runDetection);
      return;
    }

    // Request next frame immediately so video rendering is never blocked
    animationFrameRef.current = requestAnimationFrame(runDetection);

    if (isDetectingRef.current) return;
    isDetectingRef.current = true;

    try {
      // Run detection
      const result = await onnxDetector.detect(video);
      setDetection(result);

      // Calculate FPS
      const now = performance.now();
      fpsHistoryRef.current.push(now);
      fpsHistoryRef.current = fpsHistoryRef.current.filter(t => now - t < 1000);
      setFps(fpsHistoryRef.current.length);

      // Update behavior logger with latest detection (logged every 12 seconds)
      if (result.behaviorSummary) {
        behaviorLogger.updateBehavior(
          result.behaviorSummary,
          result.totalPigCount,
          result.analytics.avgConfidence,
          result.analytics.detectionDensity,
          result.analytics.movementEstimate,
          result.detections
        );
      }

      // Draw detections on overlay
      drawDetections(result.detections, result.inferenceTimeMs, result.proximityAlerts);

    } catch (error) {
      console.error('Detection error:', error);
    } finally {
      isDetectingRef.current = false;
    }
  }, [drawDetections]);

  // Request camera permission and start stream
  const startCamera = useCallback(async () => {
    // First load the model
    const loaded = await loadModel();
    if (!loaded) return;

    setCameraStatus('requesting');
    setErrorMessage('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
          facingMode: 'environment',
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play()
            .then(() => {
              setCameraStatus('active');
              // Start behavior logging if enabled
              if (enableLogging) {
                behaviorLogger.startLogging(parseInt(penId), sowId);
              }
              // Start detection loop
              animationFrameRef.current = requestAnimationFrame(runDetection);
            })
            .catch(console.error);
        };
      }

    } catch (error) {
      console.error('Camera access error:', error);
      
      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError') {
          setCameraStatus('denied');
          setErrorMessage('Camera permission denied. Please allow camera access.');
        } else if (error.name === 'NotFoundError') {
          setCameraStatus('error');
          setErrorMessage('No camera found. Please connect a webcam.');
        } else {
          setCameraStatus('error');
          setErrorMessage(`Camera error: ${error.message}`);
        }
      } else {
        setCameraStatus('error');
        setErrorMessage('Failed to access camera.');
      }
    }
  }, [loadModel, runDetection, enableLogging, penId, sowId]);

  // Stop camera stream
  const stopCamera = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    // Stop behavior logging
    behaviorLogger.stopLogging();
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    // Clear overlay
    const overlay = overlayRef.current;
    if (overlay) {
      const ctx = overlay.getContext('2d');
      ctx?.clearRect(0, 0, overlay.width, overlay.height);
    }
    
    setDetection(null);
    setFps(0);
    setCameraStatus('idle');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Get risk color
  const getRiskColor = (risk: number) => {
    if (risk >= 0.7) return 'text-red-500';
    if (risk >= 0.4) return 'text-yellow-500';
    return 'text-green-500';
  };

  const getRiskBgColor = (risk: number) => {
    if (risk >= 0.7) return 'bg-red-600/90';
    if (risk >= 0.4) return 'bg-yellow-600/90';
    return 'bg-green-600/90';
  };

  return (
    <div className={clsx('bg-gray-900 rounded-xl overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800">
        <div className="flex items-center gap-2">
          {cameraStatus === 'active' ? (
            <span className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
              <span className="text-xs text-red-400 font-medium">LIVE</span>
            </span>
          ) : (
            <VideoOff className="h-4 w-4 text-gray-500" />
          )}
          <span className="text-sm font-medium text-white">{penName}</span>
          {sowTag && (
            <span className="text-xs text-gray-400">• {sowTag}</span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {cameraStatus === 'active' && (
            <>
              <span className="flex items-center gap-1 text-xs text-green-400 bg-green-900/30 px-2 py-1 rounded">
                <Cpu className="h-3 w-3" />
                {fps} FPS
              </span>
              <span className="text-xs text-cyan-400 bg-cyan-900/30 px-2 py-1 rounded">
                {detection?.inferenceTimeMs.toFixed(0)}ms
              </span>
            </>
          )}
          {cameraStatus === 'active' && (
            <button
              onClick={stopCamera}
              className="p-1.5 hover:bg-red-600/20 rounded-lg transition-colors"
              title="Stop Camera"
            >
              <CameraOff className="h-4 w-4 text-red-400" />
            </button>
          )}
          {onFullscreen && (
            <button
              onClick={onFullscreen}
              className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <Maximize2 className="h-4 w-4 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {/* Video container */}
      <div className="relative aspect-video bg-gray-950">
        {/* Hidden canvas for preprocessing */}
        <canvas ref={canvasRef} className="hidden" />
        
        {/* Video element */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={clsx(
            'w-full h-full object-cover',
            cameraStatus !== 'active' && 'hidden'
          )}
        />

        {/* Detection overlay canvas */}
        <canvas
          ref={overlayRef}
          className={clsx(
            'absolute top-0 left-0 w-full h-full pointer-events-none',
            cameraStatus !== 'active' && 'hidden'
          )}
        />

        {cameraStatus === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <Camera className="h-16 w-16 text-gray-600 mb-4" />
            <p className="text-gray-400 text-sm mb-2 text-center px-4">
              Real-time AI detection runs directly in your browser
            </p>
            <p className="text-gray-500 text-xs mb-4 text-center px-4">
              No data sent to server • 30+ FPS • Privacy-first
            </p>
            <button
              onClick={startCamera}
              className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              <Camera className="h-5 w-5" />
              Start AI Detection
            </button>
          </div>
        )}

        {cameraStatus === 'loading-model' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <Loader2 className="h-12 w-12 text-green-500 animate-spin mb-4" />
            <p className="text-gray-400 text-sm">Loading AI model...</p>
            <p className="text-gray-500 text-xs mt-2">This may take a few seconds</p>
          </div>
        )}

        {cameraStatus === 'requesting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-600 border-t-green-500 mb-4" />
            <p className="text-gray-400 text-sm">Requesting camera permission...</p>
          </div>
        )}

        {cameraStatus === 'denied' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
            <CameraOff className="h-16 w-16 text-red-500 mb-4" />
            <p className="text-red-400 font-medium mb-2">Camera Access Denied</p>
            <p className="text-gray-400 text-sm mb-4">{errorMessage}</p>
            <button
              onClick={startCamera}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg"
            >
              Try Again
            </button>
          </div>
        )}

        {cameraStatus === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
            <AlertTriangle className="h-16 w-16 text-yellow-500 mb-4" />
            <p className="text-yellow-400 font-medium mb-2">Error</p>
            <p className="text-gray-400 text-sm mb-4">{errorMessage}</p>
            <button
              onClick={startCamera}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Crushing risk overlay */}
        {detection && detection.crushingRisk >= 0.4 && (
          <div className={clsx(
            'absolute top-2 right-2 flex items-center gap-1 text-white px-2 py-1 rounded-lg',
            getRiskBgColor(detection.crushingRisk)
          )}>
            <AlertTriangle className="h-4 w-4" />
            <span className="text-xs font-medium">
              {detection.crushingRisk >= 0.7 ? 'HIGH RISK' : 'CAUTION'}
            </span>
          </div>
        )}

        {/* Detection count overlay */}
        {detection && detection.detections.length > 0 && (
          <div className="absolute top-2 left-2 bg-black/70 text-white px-2 py-1 rounded-lg text-xs">
            {detection.detections.length} detection{detection.detections.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Stats footer */}
      {showStats && cameraStatus === 'active' && (
        <div className="px-4 py-3 bg-gray-800 grid grid-cols-4 gap-3">
          <div className="text-center">
            <p className="text-2xl font-bold text-white">
              {detection?.totalPigCount ?? 0}
            </p>
            <p className="text-xs text-gray-400">Total Pigs</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-2">
              <div>
                <p className="text-lg font-bold text-pink-400">
                  {detection?.sowCount ?? 0}
                </p>
                <p className="text-xs text-gray-500">Sow</p>
              </div>
              <span className="text-gray-600">/</span>
              <div>
                <p className="text-lg font-bold text-green-400">
                  {detection?.pigletCount ?? 0}
                </p>
                <p className="text-xs text-gray-500">Piglets</p>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">By Size</p>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-white capitalize">
              {detection?.sowPosture?.replace('_', ' ') ?? 'Unknown'}
            </p>
            {detection?.sowPostureConfidence ? (
              <p className="text-xs text-gray-500">
                {Math.round(detection.sowPostureConfidence * 100)}% conf
              </p>
            ) : null}
            <p className="text-xs text-gray-400">Sow Posture</p>
          </div>
          <div className="flex flex-col items-center justify-center">
            {detection ? (
              <>
                <RiskGauge value={detection.crushingRisk} size="sm" showLabel={false} />
                <p className={clsx('text-xs font-medium mt-1', getRiskColor(detection.crushingRisk))}>
                  {Math.round(detection.crushingRisk * 100)}% Risk
                </p>
              </>
            ) : (
              <p className="text-gray-500 text-sm">--</p>
            )}
          </div>
        </div>
      )}

      {/* Detection details panel */}
      {showStats && detection && detection.detections.length > 0 && (
        <div className="px-4 py-2 bg-gray-850 border-t border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-400">Detected Objects:</p>
            {detection.analytics && (
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span>Avg: {Math.round(detection.analytics.avgConfidence * 100)}%</span>
                <span>Move: {detection.analytics.movementEstimate}</span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {detection.detections.slice(0, 8).map((det, idx) => {
              const categoryColor = det.category === 'sow' ? '#E91E63' : det.category === 'piglet' ? '#4CAF50' : '#9E9E9E';
              return (
                <span
                  key={idx}
                  className="text-xs px-2 py-1 rounded-full flex items-center gap-1"
                  style={{ 
                    backgroundColor: `${categoryColor}20`,
                    color: categoryColor,
                    border: `1px solid ${categoryColor}40`
                  }}
                >
                  <span className="font-medium capitalize">{det.category}</span>
                  <span className="text-gray-500">•</span>
                  <span>{det.displayName}</span>
                  <span className="text-gray-500">({Math.round(det.confidence * 100)}%)</span>
                </span>
              );
            })}
            {detection.detections.length > 8 && (
              <span className="text-xs px-2 py-1 text-gray-500">
                +{detection.detections.length - 8} more
              </span>
            )}
          </div>
          {detection.proximityAlerts.length > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-700">
              <p className="text-xs text-yellow-500 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {detection.proximityAlerts.length} piglet{detection.proximityAlerts.length !== 1 ? 's' : ''} near sow
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
