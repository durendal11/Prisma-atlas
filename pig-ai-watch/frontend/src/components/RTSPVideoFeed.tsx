import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useAuthStore, useDetectionStore } from '@/store';
import { Camera, RefreshCw, AlertCircle, Wifi, WifiOff, Activity, AlertTriangle, Cpu, VideoOff } from 'lucide-react';
import { onnxDetector, DetectionResult, Detection, drawRiskHighlights } from '@/utils/onnxDetector';
import type { ProximityAlert } from '@/utils/onnxDetector';
import { WebRTCVideoPlayer } from './WebRTCVideoPlayer';

// ── Connection status type ──────────────────────────────────────────────────
export type CameraConnectionStatus = 'probing' | 'connected' | 'disconnected' | 'error';

interface CameraInfo {
  source: string;
  is_network_camera: boolean;
  resolution?: string;
  fps?: number;
  codec?: string;
  connection_type?: string;
  status?: string;
}

interface DetectionData {
  piglet_count: number;
  sow_posture: string;
  crushing_risk: number;
  timestamp: string;
}

interface RTSPVideoFeedProps {
  penId: string;
  penName?: string;
  sowTag?: string;
  className?: string;
  showStats?: boolean;
  onFullscreen?: () => void;
  confidenceThreshold?: number;
  useClientDetection?: boolean; // Toggle between backend and client-side detection
  showBoundingBoxes?: boolean; // Toggle bounding box visibility (default true)
  detectionFrameSkip?: number; // Process every Nth frame (default 5)
  isVisible?: boolean; // If false, pause detection to save resources
  onConnectionStatus?: (status: CameraConnectionStatus) => void; // Notify parent of status changes
  onDetectionResult?: (result: DetectionResult) => void; // Notify parent of each detection result
}

// Colors for detection visualization (same as TestPenPage)
const CATEGORY_COLORS: Record<string, string> = {
  sow: '#E91E63',      // Pink
  piglet: '#4CAF50',   // Green
  unknown: '#9E9E9E',  // Gray
};

export const RTSPVideoFeed: React.FC<RTSPVideoFeedProps> = ({ 
  penId,
  penName,
  sowTag,
  className = '',
  showStats = true,
  onFullscreen,
  confidenceThreshold = 0.25,
  useClientDetection = true, // Enable client-side detection by default
  showBoundingBoxes = true, // Show bounding boxes by default
  detectionFrameSkip = 5, // Process every 5th frame - smoother video, less frequent detection
  isVisible = true, // Assume visible by default
  onConnectionStatus,
  onDetectionResult,
}) => {
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationRef = useRef<number | null>(null);
  const isDetectingRef = useRef(false);
  const fpsHistoryRef = useRef<number[]>([]);
  const frameCountRef = useRef<number>(0); // Use ref for immediate frame counting
  
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [streamUrl, setStreamUrl] = useState<string>('');
  const [cameraInfo, setCameraInfo] = useState<CameraInfo | null>(null);
  const [detectionData, setDetectionData] = useState<DetectionData | null>(null);
  const [clientDetection, setClientDetection] = useState<DetectionResult | null>(null);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [fps, setFps] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(!isVisible);
  const [connectionStatus, setConnectionStatus] = useState<CameraConnectionStatus>('probing');
  const [useWebRTC, setUseWebRTC] = useState<boolean>(true);
  const { token } = useAuthStore();
  const setDetection = useDetectionStore((s) => s.setDetection);

  // Notify parent when connection status changes
  const prevStatusRef = useRef<CameraConnectionStatus>('probing');
  useEffect(() => {
    if (prevStatusRef.current !== connectionStatus) {
      prevStatusRef.current = connectionStatus;
      onConnectionStatus?.(connectionStatus);
    }
  }, [connectionStatus, onConnectionStatus]);

  // ── Probe camera status FIRST, then decide whether to stream ──────────────
  useEffect(() => {
    if (!token) {
      setConnectionStatus('error');
      setError('Authentication required');
      setLoading(false);
      return;
    }

    let cancelled = false;
    const probeCamera = async () => {
      try {
        const response = await fetch(`/api/stream/${penId}/status`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (cancelled) return;

        if (response.ok) {
          const data = await response.json();

          if (data.camera_info) {
            setCameraInfo(data.camera_info);
          }
          if (data.has_last_detection && data.last_detection) {
            setDetectionData(data.last_detection);
          }

          // Determine if camera is actually reachable
          const isRunning = data.is_running === true;
          const hasSource = data.camera_info?.source && data.camera_info.source !== 'Not configured';

          if (isRunning && hasSource) {
            // Camera is running — safe to connect stream
            setConnectionStatus('connected');
            const url = `/api/stream/${penId}?token=${token}&t=${Date.now()}`;
            setStreamUrl(url);
            setLoading(false);
            setReconnectAttempts(0);
          } else if (hasSource && !isRunning) {
            // Source configured but stream not running — try to connect anyway
            // (backend may start on first request)
            setConnectionStatus('connected');
            const url = `/api/stream/${penId}?token=${token}&t=${Date.now()}`;
            setStreamUrl(url);
            setLoading(false);
            setReconnectAttempts(0);
          } else {
            // No camera configured
            setConnectionStatus('disconnected');
            setStreamUrl('');
            setLoading(false);
            setError(null);
          }
        } else {
          if (!cancelled) {
            setConnectionStatus('error');
            setError('Failed to check camera');
            setLoading(false);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setConnectionStatus('disconnected');
          setError('Camera unavailable');
          setLoading(false);
        }
      }
    };

    setConnectionStatus('probing');
    setLoading(true);
    probeCamera();

    return () => {
      cancelled = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [penId, token]);

  // ── Poll status only when connected (not when disconnected) ───────────────
  useEffect(() => {
    if (!token || connectionStatus !== 'connected') return;

    const fetchStatus = async () => {
      try {
        const response = await fetch(`/api/stream/${penId}/status`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          if (data.camera_info) setCameraInfo(data.camera_info);
          if (data.has_last_detection && data.last_detection) setDetectionData(data.last_detection);

          // If camera went away while connected, mark disconnected
          if (!data.is_running && (!data.camera_info?.source || data.camera_info.source === 'Not configured')) {
            setConnectionStatus('disconnected');
            setStreamUrl('');
          }
        }
      } catch {
        // network blip — don't immediately disconnect
      }
    };

    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [penId, token, connectionStatus]);

  const handleImageLoad = () => {
    setLoading(false);
    setError(null);
    setReconnectAttempts(0);
    setConnectionStatus('connected');
  };

  const handleImageError = () => {
    // If we're already disconnected, don't retry — avoids loops
    if (connectionStatus === 'disconnected') return;

    setError('Failed to load camera stream');
    setLoading(false);

    // Auto-reconnect up to 3 times with exponential backoff
    if (reconnectAttempts < 3) {
      const delay = Math.min(2000 * Math.pow(2, reconnectAttempts), 10000);
      reconnectTimeoutRef.current = setTimeout(() => {
        setReconnectAttempts(prev => prev + 1);
        handleRefresh();
      }, delay);
    } else {
      // Max retries — mark as disconnected so we stop all loops
      setConnectionStatus('disconnected');
      setStreamUrl('');
    }
  };

  const handleRefresh = () => {
    // Clear any pending reconnection attempts
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setLoading(true);
    setError(null);
    
    // Force reload by changing src with fresh timestamp
    if (imgRef.current && token) {
      imgRef.current.src = '';
      setTimeout(() => {
        if (imgRef.current) {
          imgRef.current.src = `/api/stream/${penId}?token=${token}&t=${Date.now()}`;
        }
      }, 100);
    }
  };

  // Handle page visibility changes to refresh stream when returning to tab/page
  // Only refresh if camera is connected
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && connectionStatus === 'connected' && streamUrl && !loading) {
        handleRefresh();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [streamUrl, loading, penId, connectionStatus]);

  // Load ONNX model for client-side detection
  useEffect(() => {
    if (!useClientDetection) return;
    
    const loadModel = async () => {
      if (onnxDetector.isReady()) {
        setModelLoaded(true);
        return;
      }
      
      console.log(`📦 Loading ONNX model for Pen ${penId}...`);
      try {
        // Lower input size for live streams to reduce client inference latency.
        onnxDetector.setLiveStreamMode(true);
        await onnxDetector.loadModel('/models/pig_detection.onnx');
        onnxDetector.setConfidenceThreshold(confidenceThreshold);
        setModelLoaded(true);
        console.log(`✅ ONNX model loaded for Pen ${penId}`);
      } catch (err) {
        console.error(`❌ Failed to load ONNX model for Pen ${penId}:`, err);
      }
    };

    loadModel();
  }, [useClientDetection, penId, confidenceThreshold]);

  // Draw detections on canvas overlay (same as TestPenPage)
  const drawDetections = useCallback((detections: Detection[], inferenceTime: number, proximityAlerts?: ProximityAlert[]) => {
    const overlay = overlayRef.current;
    const img = imgRef.current;
    if (!overlay || !img) return;
    
    const ctx = overlay.getContext('2d');
    if (!ctx) return;

    // Match canvas size to image display size
    const rect = img.getBoundingClientRect();
    overlay.width = rect.width;
    overlay.height = rect.height;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    // If bounding boxes are disabled, only show FPS/metrics, skip drawing boxes
    if (!showBoundingBoxes) {
      // Only draw FPS/inference overlay
      if (fps > 0 || inferenceTime > 0) {
        ctx.font = 'bold 14px monospace';
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(overlay.width - 150, overlay.height - 60, 140, 50);
        ctx.fillStyle = '#00ff00';
        ctx.fillText(`FPS: ${fps}`, overlay.width - 140, overlay.height - 38);
        ctx.fillStyle = '#00ffff';
        ctx.fillText(`Inf: ${inferenceTime.toFixed(0)}ms`, overlay.width - 140, overlay.height - 18);
      }
      return;
    }

    const { width: inputW, height: inputH } = onnxDetector.getInputSize();
    const scaleX = overlay.width / inputW;
    const scaleY = overlay.height / inputH;

    detections.forEach((det) => {
      const [x1, y1, x2, y2] = det.bbox;
      const sx1 = x1 * scaleX;
      const sy1 = y1 * scaleY;
      const sx2 = x2 * scaleX;
      const sy2 = y2 * scaleY;
      const w = sx2 - sx1;
      const h = sy2 - sy1;
      
      const color = CATEGORY_COLORS[det.category] || '#4CAF50';

      // Draw bounding box
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.6;
      ctx.strokeRect(sx1, sy1, w, h);

      // Draw styled corners
      const cornerSize = 8;
      ctx.fillStyle = color;
      ctx.fillRect(sx1, sy1, cornerSize, 1);
      ctx.fillRect(sx1, sy1, 1, cornerSize);
      ctx.fillRect(sx2 - cornerSize, sy1, cornerSize, 1);
      ctx.fillRect(sx2 - 1, sy1, 1, cornerSize);
      ctx.fillRect(sx1, sy2 - 1, cornerSize, 1);
      ctx.fillRect(sx1, sy2 - cornerSize, 1, cornerSize);
      ctx.fillRect(sx2 - cornerSize, sy2 - 1, cornerSize, 1);
      ctx.fillRect(sx2 - 1, sy2 - cornerSize, 1, cornerSize);

      // Draw label
      const categoryLabel = det.category !== 'unknown' ? det.category.charAt(0).toUpperCase() + det.category.slice(1) : '';
      const label = `${categoryLabel ? categoryLabel + ' • ' : ''}${det.displayName} ${(det.confidence * 100).toFixed(0)}%`;
      ctx.font = '8px Arial';
      const text = ctx.measureText(label);
      const pad = 3;
      const textH = 10;
      ctx.fillStyle = color;
      ctx.fillRect(sx1, sy1 - textH - pad, text.width + pad * 2, textH + pad);
      ctx.fillStyle = 'white';
      ctx.fillText(label, sx1 + pad, sy1 - pad);
    });

    // Highlight at-risk piglets
    if (proximityAlerts && proximityAlerts.length > 0) {
      drawRiskHighlights(ctx, detections, proximityAlerts, scaleX, scaleY);
    }

    // FPS/inference overlay (bottom right)
    if (fps > 0 || inferenceTime > 0) {
      ctx.font = 'bold 14px monospace';
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(overlay.width - 150, overlay.height - 60, 140, 50);
      ctx.fillStyle = '#00ff00';
      ctx.fillText(`FPS: ${fps}`, overlay.width - 140, overlay.height - 38);
      ctx.fillStyle = '#00ffff';
      ctx.fillText(`Inf: ${inferenceTime.toFixed(0)}ms`, overlay.width - 140, overlay.height - 18);
    }
  }, [fps, showBoundingBoxes]);

  // Client-side detection loop with frame skipping
  const runClientDetection = useCallback(() => {
    // Schedule next check IMMEDIATELY to keep loop smooth
    animationRef.current = requestAnimationFrame(runClientDetection);
    
    // Don't run detection if disconnected, paused, or model not ready
    if (!useClientDetection || !modelLoaded || !onnxDetector.isReady() || isPaused || connectionStatus === 'disconnected') {
      return;
    }

    const img = imgRef.current;
    const canvas = canvasRef.current;
    
    if (!img || !img.complete || img.naturalWidth === 0) {
      return;
    }

    // Avoid overlapping inference calls; overlap causes stale frames and latency growth.
    if (isDetectingRef.current) {
      return;
    }

    // Frame skipping for performance - only process every Nth frame
    frameCountRef.current += 1;
    
    if (frameCountRef.current % detectionFrameSkip !== 0) {
      // Skip this frame, keep video smooth
      return;
    }

    // Run detection asynchronously without blocking video playback
    const canvas2d = canvas;
    if (!canvas2d) return;
    
    const ctx = canvas2d.getContext('2d');
    if (!ctx) return;

    // Capture current frame from MJPEG stream
    canvas2d.width = img.naturalWidth || img.width;
    canvas2d.height = img.naturalHeight || img.height;
    ctx.drawImage(img, 0, 0);

    // Run ONNX detection asynchronously - don't block animation loop
    isDetectingRef.current = true;
    onnxDetector.detect(canvas2d)
      .then(result => {
        console.log(`🔍 Pen ${penId}: ${result.totalPigCount} objects (${result.pigletCount} piglets, ${result.sowCount} sows)`);
        
        setClientDetection(result);

        // Notify parent of detection result (for simulation engine / behavior logger)
        onDetectionResult?.(result);

        // Update detection store so other components can read latest data
        setDetection(penId, {
          type: 'detection',
          pen_id: penId,
          data: {
            piglet_count: result.pigletCount,
            posture: result.sowPosture,
            risk_level: result.crushingRisk,
            bboxes: result.detections.map(d => ({ x: d.bbox[0], y: d.bbox[1], width: d.bbox[2] - d.bbox[0], height: d.bbox[3] - d.bbox[1], label: d.displayName, confidence: d.confidence })),
            timestamp: new Date().toISOString(),
            processing_time_ms: result.inferenceTimeMs,
          },
        });

        // Update FPS
        const now = performance.now();
        fpsHistoryRef.current.push(now);
        fpsHistoryRef.current = fpsHistoryRef.current.filter((t) => now - t < 1000);
        setFps(fpsHistoryRef.current.length);

        // Draw detections
        drawDetections(result.detections, result.inferenceTimeMs, result.proximityAlerts);
      })
      .catch(err => {
        console.error(`❌ Detection error for Pen ${penId}:`, err);
      })
      .finally(() => {
        isDetectingRef.current = false;
      });
  }, [useClientDetection, modelLoaded, penId, drawDetections, isPaused, detectionFrameSkip, connectionStatus, onDetectionResult, setDetection]);

  // Pause/resume detection based on visibility
  const prevVisibleRef = useRef(isVisible);
  useEffect(() => {
    setIsPaused(!isVisible);
    if (prevVisibleRef.current !== isVisible) {
      prevVisibleRef.current = isVisible;
      // Only log on actual change
      if (!isVisible) {
        console.log(`⏸️ Pausing detection for Pen ${penId}`);
      } else {
        console.log(`▶️ Resuming detection for Pen ${penId}`);
      }
    }
  }, [isVisible, penId]);

  // Start/stop detection loop — only when connected
  useEffect(() => {
    if (useClientDetection && modelLoaded && !loading && !error && !isPaused && connectionStatus === 'connected') {
      animationRef.current = requestAnimationFrame(runClientDetection);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [useClientDetection, modelLoaded, loading, error, runClientDetection, penId, isPaused, detectionFrameSkip, connectionStatus]);

  return (
    <div className={`relative bg-gray-900 rounded-lg overflow-hidden ${className}`}>
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/60 to-transparent p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-white" />
            <span className="text-white font-medium">{penName || `Pen ${penId}`}</span>
            {sowTag && (
              <span className="text-white/80 text-sm">• {sowTag}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onFullscreen && (
              <button
                onClick={onFullscreen}
                className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
                title="Fullscreen view"
              >
                <Activity className="w-4 h-4 text-white" />
              </button>
            )}
            <button
              onClick={handleRefresh}
              className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
              title="Refresh stream"
            >
              <RefreshCw className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      </div>

      {/* Video Stream */}
      <div className="relative aspect-video w-full">
        {/* Disconnected — camera not configured or unreachable */}
        {connectionStatus === 'disconnected' && !loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-800/95 z-20">
            <div className="text-center p-6">
              <VideoOff className="w-12 h-12 text-gray-500 mx-auto mb-3" />
              <p className="text-white font-medium mb-1">Camera Disconnected</p>
              <p className="text-white/50 text-xs mb-4">No camera configured for this pen</p>
              <button
                onClick={() => { setConnectionStatus('probing'); setReconnectAttempts(0); setError(null); setLoading(true); setStreamUrl(''); }}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg text-sm transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Probing */}
        {connectionStatus === 'probing' && loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-800 z-20">
            <div className="text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mx-auto mb-3"></div>
              <p className="text-white/70 text-sm">Checking camera...</p>
            </div>
          </div>
        )}

        {/* Loading stream (after probe succeeded) */}
        {connectionStatus === 'connected' && loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-white/80">Loading camera stream...</p>
            </div>
          </div>
        )}

        {/* Stream error (connected but feed failed) */}
        {connectionStatus === 'connected' && error && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
            <div className="text-center p-6">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <p className="text-white font-medium mb-2">Camera Error</p>
              <p className="text-white/60 text-sm mb-4">{error}</p>
              <button
                onClick={handleRefresh}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
              >
                Retry Connection
              </button>
            </div>
          </div>
        )}

        {streamUrl && connectionStatus === 'connected' && !error && (
          <>
            {useWebRTC && token ? (
              <WebRTCVideoPlayer
                penId={penId}
                token={token}
                className="w-full h-full object-contain"
                onConnected={() => {
                  setLoading(false);
                  setError(null);
                }}
                onError={() => {
                  setUseWebRTC(false);
                }}
              />
            ) : (
              <img
                ref={imgRef}
                src={streamUrl}
                alt={`Pen ${penId} camera feed`}
                className="w-full h-full object-contain"
                style={{
                  imageRendering: 'auto',
                  willChange: 'contents',       // Hint browser to optimize repaints
                  backfaceVisibility: 'hidden',  // Force GPU layer for smoother updates
                  transform: 'translateZ(0)',    // GPU compositing
                }}
                onLoad={handleImageLoad}
                onError={handleImageError}
                crossOrigin="anonymous"
              />
            )}
            {/* Hidden canvas for frame capture */}
            <canvas ref={canvasRef} className="hidden" />
            {/* Overlay canvas for detection visualization */}
            <canvas
              ref={overlayRef}
              className="absolute top-0 left-0 w-full h-full pointer-events-none"
              style={{ willChange: 'contents' }}
            />
          </>
        )}

        {/* Model Loading Indicator */}
        {connectionStatus === 'connected' && useClientDetection && !modelLoaded && !loading && !error && (
          <div className="absolute top-2 left-2 bg-yellow-500/90 backdrop-blur-sm rounded-lg px-3 py-1.5 text-xs text-white flex items-center gap-2">
            <Cpu className="w-3 h-3 animate-spin" />
            Loading detection model...
          </div>
        )}

        {/* Client Detection Active Indicator */}
        {connectionStatus === 'connected' && useClientDetection && modelLoaded && !loading && !error && (
          <div className="absolute top-2 left-2 bg-green-500/90 backdrop-blur-sm rounded-lg px-3 py-1.5 text-xs text-white flex items-center gap-2">
            <Cpu className="w-3 h-3" />
            Client Detection Active
          </div>
        )}
      </div>

      {/* Detection Statistics Overlay */}
      {showStats && !loading && !error && (
        <>
          {/* Use client detection data if available, otherwise backend data */}
          {(clientDetection || detectionData) && (
            <div className="absolute top-16 right-4 z-10 space-y-2">
              {/* Piglet Count */}
              <div className="bg-blue-500/90 backdrop-blur-sm rounded-lg px-4 py-2 shadow-lg">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-white" />
                  <div>
                    <div className="text-white/80 text-xs font-medium">Piglets</div>
                    <div className="text-white text-2xl font-bold">
                      {clientDetection?.pigletCount ?? detectionData?.piglet_count ?? 0}
                    </div>
                  </div>
                </div>
              </div>

              {/* Sow Count (from client detection) */}
              {clientDetection && (
                <div className="bg-pink-500/90 backdrop-blur-sm rounded-lg px-4 py-2 shadow-lg">
                  <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-white" />
                    <div>
                      <div className="text-white/80 text-xs font-medium">Sows</div>
                      <div className="text-white text-2xl font-bold">
                        {clientDetection.sowCount}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Sow Posture */}
              <div className="bg-purple-500/90 backdrop-blur-sm rounded-lg px-4 py-2 shadow-lg">
                <div className="text-white/80 text-xs font-medium mb-1">Sow Posture</div>
                <div className="text-white text-sm font-semibold capitalize">
                  {clientDetection?.sowPosture?.replace('_', ' ').replace('-', ' ') ?? 
                   detectionData?.sow_posture?.replace('_', ' ') ?? 'Unknown'}
                </div>
                {clientDetection?.sowPostureConfidence && (
                  <div className="text-white/70 text-xs mt-0.5">
                    {Math.round(clientDetection.sowPostureConfidence * 100)}% confidence
                  </div>
                )}
              </div>

              {/* Crushing Risk */}
              <div 
                className={`backdrop-blur-sm rounded-lg px-4 py-2 shadow-lg ${
                  (clientDetection?.crushingRisk ?? detectionData?.crushing_risk ?? 0) > 0.7 
                    ? 'bg-red-500/90' 
                    : (clientDetection?.crushingRisk ?? detectionData?.crushing_risk ?? 0) > 0.4 
                    ? 'bg-yellow-500/90' 
                    : 'bg-green-500/90'
                }`}
              >
                <div className="flex items-center gap-2">
                  {(clientDetection?.crushingRisk ?? detectionData?.crushing_risk ?? 0) > 0.4 && (
                    <AlertTriangle className="w-4 h-4 text-white" />
                  )}
                  <div>
                    <div className="text-white/80 text-xs font-medium">Risk Level</div>
                    <div className="text-white text-xl font-bold">
                      {((clientDetection?.crushingRisk ?? detectionData?.crushing_risk ?? 0) * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
                <div className="mt-1">
                  <div className="h-1 bg-white/30 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-white transition-all duration-300"
                      style={{ width: `${(clientDetection?.crushingRisk ?? detectionData?.crushing_risk ?? 0) * 100}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Detection Source Indicator */}
              <div className="bg-gray-800/80 backdrop-blur-sm rounded-lg px-3 py-1 text-xs text-white/60 text-center flex items-center justify-center gap-1.5">
                {clientDetection ? (
                  <>
                    <Cpu className="w-3 h-3" />
                    <span>Client Detection</span>
                  </>
                ) : (
                  <>
                    <Activity className="w-3 h-3" />
                    <span>Backend Detection</span>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Connection Status Indicator */}
      <div className="absolute bottom-4 left-4 z-10">
        <div 
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm cursor-pointer transition-all hover:scale-105 ${
            connectionStatus === 'disconnected' ? 'bg-gray-500/90' : connectionStatus === 'error' || error ? 'bg-red-500/90' : connectionStatus === 'probing' || loading ? 'bg-yellow-500/90' : 'bg-green-500/90'
          }`}
          onClick={() => setShowDebugInfo(!showDebugInfo)}
          title="Click for connection details"
        >
          {connectionStatus === 'disconnected' || connectionStatus === 'error' || error ? (
            <WifiOff className="w-3 h-3 text-white" />
          ) : connectionStatus === 'probing' ? (
            <Wifi className="w-3 h-3 text-white animate-pulse" />
          ) : (
            <Wifi className="w-3 h-3 text-white" />
          )}
          <span className="text-white font-medium">
            {connectionStatus === 'disconnected' ? 'Disconnected' : connectionStatus === 'probing' ? 'Checking...' : error ? 'Error' : loading ? 'Connecting...' : 'Live'}
          </span>
          {connectionStatus === 'connected' && cameraInfo?.connection_type && !error && !loading && (
            <span className="text-white/90 text-xs">• {cameraInfo.connection_type}</span>
          )}
        </div>

        {/* Debug Info Panel */}
        {showDebugInfo && cameraInfo && (
          <div className="absolute bottom-full mb-2 left-0 bg-black/90 backdrop-blur-sm rounded-lg p-3 min-w-[280px] text-sm">
            <div className="text-white font-semibold mb-2 flex items-center gap-2">
              <Camera className="w-4 h-4" />
              Camera Details
            </div>
            <div className="space-y-1.5 text-white/80">
              {cameraInfo.is_network_camera && (
                <div className="flex items-center gap-2 text-green-400">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  <span className="font-medium">RTSP Connected ✓</span>
                </div>
              )}
              <div className="text-xs space-y-1 mt-2 border-t border-white/10 pt-2">
                {cameraInfo.source && (
                  <div>
                    <span className="text-white/60">Source:</span>
                    <div className="text-white/90 font-mono text-[10px] break-all">
                      {cameraInfo.source.replace(/\/\/.*:.*@/, '//***:***@')}
                    </div>
                  </div>
                )}
                {cameraInfo.resolution && (
                  <div>
                    <span className="text-white/60">Resolution:</span> {cameraInfo.resolution}
                  </div>
                )}
                {cameraInfo.fps && (
                  <div>
                    <span className="text-white/60">FPS:</span> {cameraInfo.fps}
                  </div>
                )}
                {cameraInfo.codec && (
                  <div>
                    <span className="text-white/60">Codec:</span> {cameraInfo.codec}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
