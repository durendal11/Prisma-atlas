import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageInfoButton, PageInfoModal } from '@/components/ui/PageInfoModal';
import { useQuery } from '@tanstack/react-query';
import { onnxDetector, Detection, DetectionResult, drawRiskHighlights } from '@/utils/onnxDetector';
import type { ProximityAlert } from '@/utils/onnxDetector';
import {
  computeRestlessnessScore,
  computeFarrowingLikelihood,
  computeStagnationLevel,
} from '@/utils/farrowingMetrics';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import { behaviorLogger, type BehaviorAnalytics, type FarrowingLikelihood } from '@/services/behaviorLogger';
import { simulationEngine } from '@/services/simulationEngine';
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from '@/hooks/useTranslation';
import { useApi } from '@/hooks/useApi';
import { useTestPenStore, type SowBehaviorProfile } from '@/store';
import { useSimulationStore, type SimulationEvent } from '@/store/simulationStore';
import { useFarrowingStore, type FarrowingSystemState } from '@/store/farrowingStore';
import { CrushingRiskGauge } from '@/components';
import { AIPenAdvisoryCard } from '@/components/AIPenAdvisoryCard';
import type { Sow, FarrowingRecord, FarrowingStats, SowUpdate, Alert, Pen } from '@/types';
import {
  Upload,
  StopCircle,
  AlertTriangle,
  Cpu,
  Image,
  FileVideo,
  Activity,
  Clock,
  Baby,
  Shield,
  Eye,
  Sparkles,
  BarChart3,
  Heart,
  Plus,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Calendar,
  FileText,
  TrendingUp,
  Thermometer,
  Edit3,
  Save,
  ClipboardList,
  Radio,
  Zap,
  PieChart,
  Bell,
  ArrowDown,
  ArrowUp,
  Timer,
  Target,
  MonitorSpeaker,
  Play,
  Pause,
  Info,
} from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';

// ── Color maps ───────────────────────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = { sow: '#E91E63', piglet: '#4CAF50', unknown: '#9E9E9E' };
const CLASS_COLORS: Record<string, string> = {
  piglet: '#4CAF50', 'sow-sit': '#FF9800', 'sow-sleep': '#2196F3',
  'sow-sleep-lactate': '#9C27B0', 'sow-stand': '#607D8B', 'sow-stand-feed': '#8BC34A', default: '#4CAF50',
};
const POSTURE_COLORS: Record<string, string> = {
  sleeping: '#2196F3', lactating: '#9C27B0', nursing: '#9C27B0', feeding: '#8BC34A', standing: '#FF9800', unknown: '#9E9E9E',
};

// ── Tab type ────────────────────────────────────────────────────────────────
type Tab = 'overview' | 'detections' | 'behavior' | 'farrowing' | 'live-monitor';

const TARGET_FPS = 10;
const FRAME_INTERVAL = 1000 / TARGET_FPS;

export default function TestPenPage() {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const fpsHistoryRef = useRef<number[]>([]);
  // Reusable offscreen canvas for center-crop preprocessing (excludes side pens)
  const cropCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // Display canvas — renders the cropped frame; overlay + model input share this exact coordinate space
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileType, setFileType] = useState<'video' | 'image' | null>(null);
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [fps, setFps] = useState<number>(0);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading-model' | 'ready' | 'playing' | 'processing' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const initialPenId = useMemo(() => {
    const penParam = searchParams.get('pen');
    const parsed = Number(penParam);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, [searchParams]);
  const [selectedPenId, setSelectedPenId] = useState<number | null>(initialPenId);
  const penId = selectedPenId ?? 0;
  const canUseMedia = selectedPenId !== null;
  const lastProcessedFrameTimeRef = useRef(0);
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(0.25);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  // Video playback state (for custom controls — native controls removed to enforce crop)
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isInfoOpen, setIsInfoOpen] = useState(false);

  // Farrowing state
  const [sow, setSow] = useState<Sow | null>(null);
  const [farrowingRecords, setFarrowingRecords] = useState<FarrowingRecord[]>([]);
  const [farrowingStats, setFarrowingStats] = useState<FarrowingStats | null>(null);
  const [showNewFarrowForm, setShowNewFarrowForm] = useState(false);
  const [expandedRecord, setExpandedRecord] = useState<number | null>(null);
  const [formPiglets, setFormPiglets] = useState('');
  const [formStillborn, setFormStillborn] = useState('0');
  const [formDate, setFormDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [formTime, setFormTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });
  const [formNotes, setFormNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [farrowingLoading, setFarrowingLoading] = useState(false);

  // Breeding info state
  const [breedingDate, setBreedingDate] = useState('');
  const [showBreedingForm, setShowBreedingForm] = useState(false);
  const [savingBreeding, setSavingBreeding] = useState(false);
  const [unknownBreedingDate, setUnknownBreedingDate] = useState(false);
  const [estimatedFarrowingDateFrom, setEstimatedFarrowingDateFrom] = useState('');
  const [estimatedFarrowingDateTo, setEstimatedFarrowingDateTo] = useState('');
  const [showFarrowingGuide, setShowFarrowingGuide] = useState(false);

  // Replay mode toggle
  const [liveMode, setLiveMode] = useState<'live' | 'replay'>('live');
  const navigate = useNavigate();

  const [liveFarrowingLikelihood, setLiveFarrowingLikelihood] = useState<FarrowingLikelihood | null>(null);
  const [liveBehaviorAnalytics, setLiveBehaviorAnalytics] = useState<BehaviorAnalytics | null>(null);
  const [liveRecentAlerts, setLiveRecentAlerts] = useState<Alert[]>([]);

  const { data: pens = [] } = useQuery({
    queryKey: ['test-pen-pens'],
    queryFn: async (): Promise<Pen[]> => {
      const response = await api.get('/api/pens', { params: { is_active: true } });
      return Array.isArray(response.data) ? response.data : [];
    },
    staleTime: 30_000,
  });

  // Mini trend chart data — rolling restlessness + likelihood
  const [trendData, setTrendData] = useState<Array<{ time: string; restlessness: number; likelihood: number }>>([
    { time: new Date(Date.now() - 300000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), restlessness: 0, likelihood: 0 },
  ]);

  const { updateResult, setRunning, resetSession, sowProfiles, sessionStarted, totalFrames } = useTestPenStore();

  // Simulation store
  const simStore = useSimulationStore();
  const simEvents = useSimulationStore((s) => s.events);
  const simIsSimulating = useSimulationStore((s) => s.isSimulating);
  const simPigletCountHistory = useSimulationStore((s) => s.pigletCountHistory);
  const simRiskHistory = useSimulationStore((s) => s.riskHistory);
  const simNursingSessions = useSimulationStore((s) => s.nursingSessions);
  const simCurrentNursing = useSimulationStore((s) => s.currentNursingSession);
  const simPostureTimeline = useSimulationStore((s) => s.postureTimeline);
  const simPigletDropAlert = useSimulationStore((s) => s.pigletDropAlert);
  const simSustainedHighRisk = useSimulationStore((s) => s.sustainedHighRisk);
  const simExpectedPiglets = useSimulationStore((s) => s.expectedPigletCount);
  const simStats = useMemo(() => simStore.getStats(), [simStore, simEvents.length, simStore.framesProcessed]);

  // Farrowing engine store
  const farrowingState = useFarrowingStore((s) => s.systemState);
  const farrowingPrediction = useFarrowingStore((s) => s.prediction);
  const farrowingAlerts = useFarrowingStore((s) => s.alerts);
  const activeSession = useFarrowingStore((s) => s.activeSession);
  const farrowingSafetyChecks = useFarrowingStore((s) => s.safetyChecks);
  const completedSessions = useFarrowingStore((s) => s.completedSessions);
  const noNewPigletSinceMs = useFarrowingStore((s) =>
    s.activeSession?.lastNewPigletAt ? Date.now() - s.activeSession.lastNewPigletAt : 0
  );
  const monitoringInterval = useFarrowingStore((s) => s.monitoringIntervalMinutes);

  // ── Computed metrics (from shared utility) ────────────────────────────────
  const restlessness = useMemo(
    () => computeRestlessnessScore({
      postureTransitionsPerHour: farrowingPrediction.postureTransitionsPerHour,
      nestingCountPerHour: farrowingPrediction.nestingCountPerHour,
      percentTimeLying: farrowingPrediction.percentTimeLying,
    }),
    [farrowingPrediction.postureTransitionsPerHour, farrowingPrediction.nestingCountPerHour, farrowingPrediction.percentTimeLying]
  );

  const farrowingLikelihood = useMemo(
    () => computeFarrowingLikelihood({
      postureTransitionsPerHour: farrowingPrediction.postureTransitionsPerHour,
      nestingCountPerHour: farrowingPrediction.nestingCountPerHour,
    }),
    [farrowingPrediction.postureTransitionsPerHour, farrowingPrediction.nestingCountPerHour]
  );

  const stagnation = useMemo(
    () => computeStagnationLevel(noNewPigletSinceMs / 60000),
    [noNewPigletSinceMs]
  );

  // ── Trend chart: append data-point every 30s while live-monitor tab is active ──
  useEffect(() => {
    if (activeTab !== 'live-monitor') return;
    const iv = setInterval(() => {
      const now = new Date();
      const timeLabel = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setTrendData((prev) => {
        const next = [
          ...prev,
          {
            time: timeLabel,
            restlessness: restlessness.score,
            likelihood: farrowingLikelihood.score,
          },
        ];
        // Keep last 60 points (≈ 30 min at 30s intervals)
        return next.slice(-60);
      });
    }, 30_000);
    return () => clearInterval(iv);
  }, [activeTab, restlessness.score, farrowingLikelihood.score]);

  // ── Model loading ─────────────────────────────────────────────────────────
  const loadModel = useCallback(async () => {
    if (modelLoaded || onnxDetector.isReady()) {
      setModelLoaded(true);
      return true;
    }
    setStatus('loading-model');
    try {
      await onnxDetector.loadModel('/models/pig_detection.onnx');
      setModelLoaded(true);
      return true;
    } catch (err) {
      console.error('Model load failed:', err);
      setError(t('failedToLoadModel'));
      setStatus('error');
      return false;
    }
  }, [modelLoaded, t]);

  // ── Draw detections ───────────────────────────────────────────────────────
  const drawDetections = useCallback((detections: Detection[], inferenceTime: number, proximityAlerts?: ProximityAlert[]) => {
    const overlay = overlayRef.current;
    const dc = displayCanvasRef.current;
    // displayCanvas is sized to the container; overlay must match it exactly for bbox alignment
    if (!overlay || !dc) return;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;

    overlay.width = dc.width;
    overlay.height = dc.height;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    const { width: inputW, height: inputH } = onnxDetector.getInputSize();
    const scaleX = overlay.width / inputW;
    const scaleY = overlay.height / inputH;

    detections.forEach((det) => {
      const [x1, y1, x2, y2] = det.bbox;
      const sx1 = x1 * scaleX, sy1 = y1 * scaleY, sx2 = x2 * scaleX, sy2 = y2 * scaleY;
      const w = sx2 - sx1, h = sy2 - sy1;
      const color = CATEGORY_COLORS[det.category] || CLASS_COLORS[det.className] || CLASS_COLORS.default;

      ctx.strokeStyle = color;
      ctx.lineWidth = 0.6;
      ctx.strokeRect(sx1, sy1, w, h);

      const cs = 8;
      ctx.fillStyle = color;
      ctx.fillRect(sx1, sy1, cs, 1); ctx.fillRect(sx1, sy1, 1, cs);
      ctx.fillRect(sx2 - cs, sy1, cs, 1); ctx.fillRect(sx2 - 1, sy1, 1, cs);
      ctx.fillRect(sx1, sy2 - 1, cs, 1); ctx.fillRect(sx1, sy2 - cs, 1, cs);
      ctx.fillRect(sx2 - cs, sy2 - 1, cs, 1); ctx.fillRect(sx2 - 1, sy2 - cs, 1, cs);

      const categoryLabel = det.category !== 'unknown' ? det.category.charAt(0).toUpperCase() + det.category.slice(1) : '';
      const label = `${categoryLabel ? categoryLabel + ' • ' : ''}${det.displayName} ${(det.confidence * 100).toFixed(0)}%`;
      ctx.font = '8px Arial';
      const tw = ctx.measureText(label).width;
      const pad = 3, textH = 10;
      ctx.fillStyle = color;
      ctx.fillRect(sx1, sy1 - textH - pad, tw + pad * 2, textH + pad);
      ctx.fillStyle = 'white';
      ctx.fillText(label, sx1 + pad, sy1 - pad);
    });

    // Highlight at-risk piglets
    if (proximityAlerts && proximityAlerts.length > 0) {
      drawRiskHighlights(ctx, detections, proximityAlerts, scaleX, scaleY);
    }

    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(overlay.width - 160, overlay.height - 55, 150, 48);
    ctx.fillStyle = '#00ff00';
    ctx.fillText(`FPS: ${fps}`, overlay.width - 150, overlay.height - 33);
    ctx.fillStyle = '#00ffff';
    ctx.fillText(`Inf: ${inferenceTime.toFixed(0)}ms`, overlay.width - 150, overlay.height - 13);
  }, [fps]);

  // ── Detection loops ───────────────────────────────────────────────────────
  const runDetection = useCallback(async (timestamp: number) => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !onnxDetector.isReady()) {
      animationRef.current = requestAnimationFrame(runDetection);
      return;
    }

    if (timestamp - lastProcessedFrameTimeRef.current < FRAME_INTERVAL) {
      animationRef.current = requestAnimationFrame(runDetection);
      return;
    }
    lastProcessedFrameTimeRef.current = timestamp;

    try {
      // Crop center portion of the video frame at 55% zoom — removes side pens from inference
      if (!cropCanvasRef.current) cropCanvasRef.current = document.createElement('canvas');
      const cc = cropCanvasRef.current;
      const vw = video.videoWidth, vh = video.videoHeight;
      cc.width = Math.round(vw / 1.6);
      cc.height = vh;
      const ccCtx = cc.getContext('2d');
      if (ccCtx) ccCtx.drawImage(video, Math.round((vw - cc.width) / 2), 0, cc.width, vh, 0, 0, cc.width, vh);
      // Mirror the cropped frame to displayCanvas so the overlay canvas aligns perfectly
      const dc = displayCanvasRef.current;
      if (dc && ccCtx) {
        const dcRect = dc.getBoundingClientRect();
        const dcW = Math.round(dcRect.width), dcH = Math.round(dcRect.height);
        if (dc.width !== dcW || dc.height !== dcH) { dc.width = dcW; dc.height = dcH; }
        const dcCtx = dc.getContext('2d');
        if (dcCtx) dcCtx.drawImage(cc, 0, 0, dc.width, dc.height);
      }
      const result = await onnxDetector.detect(ccCtx ? cc : video);
      setDetection(result);
      updateResult(result);
      const now = performance.now();
      fpsHistoryRef.current.push(now);
      fpsHistoryRef.current = fpsHistoryRef.current.filter((t) => now - t < 1000);
      setFps(fpsHistoryRef.current.length);
      if (result.behaviorSummary) {
        behaviorLogger.updateBehavior(
          result.behaviorSummary,
          result.totalPigCount,
          result.analytics.avgConfidence,
          result.analytics.detectionDensity,
          result.analytics.movementEstimate,
          result.detections,
        );
      }
      // Feed simulation engine
      simulationEngine.processFrame(result, video.currentTime);
      drawDetections(result.detections, result.inferenceTimeMs, result.proximityAlerts);
    } catch (err) {
      console.error('Detection error:', err);
    }
    animationRef.current = requestAnimationFrame(runDetection);
  }, [drawDetections, updateResult]);

  const stopDetection = useCallback(() => {
    if (animationRef.current) { cancelAnimationFrame(animationRef.current); animationRef.current = null; }
    lastProcessedFrameTimeRef.current = 0;
    behaviorLogger.stopLogging();
    if (useSimulationStore.getState().isSimulating) {
      simulationEngine.stop();
    }
    setRunning(false);
    const overlay = overlayRef.current;
    if (overlay) overlay.getContext('2d')?.clearRect(0, 0, overlay.width, overlay.height);
    setDetection(null);
    setFps(0);
    setStatus('idle');
  }, [setRunning]);

  const handleConfidenceChange = (value: number) => {
    setConfidenceThreshold(value);
    onnxDetector.setConfidenceThreshold(value);
  };

  const runImageDetection = useCallback(async () => {
    const img = imageRef.current;
    if (!img || !onnxDetector.isReady()) return;
    setStatus('processing');
    try {
      // Crop center portion of the image at 55% zoom — removes side pens from inference
      const canvas = document.createElement('canvas');
      const srcW = img.naturalWidth || img.width;
      const srcH = img.naturalHeight || img.height;
      const cropW = Math.round(srcW / 1.6);
      const cropX = Math.round((srcW - cropW) / 2);
      canvas.width = cropW;
      canvas.height = srcH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context failed');
      ctx.drawImage(img, cropX, 0, cropW, srcH, 0, 0, cropW, srcH);
      // Mirror crop to displayCanvas so overlay aligns perfectly
      const dc = displayCanvasRef.current;
      if (dc) {
        const dcRect = dc.getBoundingClientRect();
        dc.width = Math.round(dcRect.width);
        dc.height = Math.round(dcRect.height);
        const dcCtx = dc.getContext('2d');
        if (dcCtx) dcCtx.drawImage(canvas, 0, 0, dc.width, dc.height);
      }
      const result = await onnxDetector.detect(canvas);
      setDetection(result);
      updateResult(result);
      if (result.behaviorSummary) {
        behaviorLogger.updateBehavior(
          result.behaviorSummary,
          result.totalPigCount,
          result.analytics.avgConfidence,
          result.analytics.detectionDensity,
          result.analytics.movementEstimate,
          result.detections,
        );
      }
      drawDetections(result.detections, result.inferenceTimeMs, result.proximityAlerts);
      setStatus('ready');
    } catch (err) {
      console.error('Image detection error:', err);
      setError(t('failedToProcess'));
      setStatus('error');
    }
  }, [t, drawDetections, updateResult]);

  const handleFile = async (file: File) => {
    if (!canUseMedia || !selectedPenId) {
      toast.error('Select a pen before uploading media');
      return;
    }

    setError(null);
    const ok = await loadModel();
    if (!ok) return;
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    const url = URL.createObjectURL(file);
    setFileUrl(url);
    resetSession();
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (isImage) {
      setFileType('image');
      setStatus('ready');
      setRunning(true);
      behaviorLogger.startLogging(selectedPenId, sow?.id);
      // Detection fires via onLoad on the hidden img element
    } else if (isVideo) {
      setFileType('video');
      setStatus('ready');
      setRunning(true);
      behaviorLogger.startLogging(selectedPenId, sow?.id);
      // Start simulation engine with expected piglet count
      const expectedPiglets = sow?.current_litter_size || 9;
      simulationEngine.start(expectedPiglets, sow?.id, selectedPenId);
      requestAnimationFrame(() => {
        const video = videoRef.current;
        if (video) {
          video.onloadedmetadata = () => {
            video.play().then(() => { setStatus('playing'); animationRef.current = requestAnimationFrame(runDetection); })
              .catch(() => { setError(t('failedToPlay')); setStatus('error'); });
          };
          video.load();
        }
      });
    } else {
      setError(t('unsupportedFile'));
      setStatus('error');
    }
  };

  useEffect(() => () => { stopDetection(); if (fileUrl) URL.revokeObjectURL(fileUrl); }, [stopDetection, fileUrl]);

  // ── Farrowing data loading ────────────────────────────────────────────────
  const loadFarrowingData = useCallback(async () => {
    if (!selectedPenId) {
      setSow(null);
      setFarrowingRecords([]);
      setFarrowingStats(null);
      return;
    }

    setFarrowingLoading(true);
    try {
      // Fetch sow assigned to test pen
      try {
        const sowRes = await api.get('/api/sows', { params: { pen_id: selectedPenId, limit: 1 } });
        if (sowRes.data && sowRes.data.length > 0) {
          setSow(sowRes.data[0]);
        }
      } catch { /* no sow assigned */ }

      // Farrowing records for this pen
      try {
        const frRes = await api.get('/api/farrowing/records', { params: { pen_id: selectedPenId, limit: 20 } });
        setFarrowingRecords(Array.isArray(frRes.data) ? frRes.data : []);
      } catch { /* no records */ }

      // Farrowing stats
      try {
        const stRes = await api.get('/api/farrowing/statistics', { params: { period_days: 90 } });
        setFarrowingStats(stRes.data);
      } catch { /* no stats */ }
    } catch (err) {
      console.error('Failed to load farrowing data:', err);
    } finally {
      setFarrowingLoading(false);
    }
  }, [selectedPenId, api]);

  useEffect(() => {
    loadFarrowingData();
  }, [loadFarrowingData]);

  useEffect(() => {
    if (!selectedPenId) {
      behaviorLogger.stopLogging();
      return;
    }
    behaviorLogger.stopLogging();
    behaviorLogger.startLogging(selectedPenId, sow?.id);
    return () => behaviorLogger.stopLogging();
  }, [selectedPenId, sow?.id]);

  useEffect(() => {
    if (!selectedPenId || !videoPlaying) {
      return;
    }

    let isMounted = true;

    const loadLivePanelData = async () => {
      try {
        const [likelihood, analytics, alertsResponse] = await Promise.all([
          behaviorLogger.getFarrowingLikelihood(selectedPenId),
          behaviorLogger.getAnalytics(selectedPenId),
          api.get('/api/alerts', { params: { pen_id: selectedPenId, limit: 5 } }),
        ]);

        if (!isMounted) {
          return;
        }

        setLiveFarrowingLikelihood(likelihood);
        setLiveBehaviorAnalytics(analytics);
        setLiveRecentAlerts(Array.isArray(alertsResponse.data) ? alertsResponse.data : []);
      } catch (err) {
        console.error('Failed to refresh Test Pen live analytics panel:', err);
      }
    };

    loadLivePanelData();
    const timer = setInterval(loadLivePanelData, 15000);

    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [selectedPenId, videoPlaying, api]);

  // ── Farrowing handlers ────────────────────────────────────────────────────
  const handleRecordFarrowing = async () => {
    if (!sow) {
      toast.error('No sow assigned to this pen. Please assign a sow first.');
      return;
    }
    if (!formPiglets || Number(formPiglets) <= 0) {
      toast.error('Enter a valid piglet count');
      return;
    }
    setSubmitting(true);
    try {
      const bornAlive = Number(formPiglets);
      const stillborn = Number(formStillborn) || 0;
      const farrowingStarted = new Date(`${formDate}T${formTime}`).toISOString();

      await api.post('/api/farrowing/records', {
        sow_id: sow.id,
        pen_id: penId,
        farrowing_started: farrowingStarted,
        total_born: bornAlive + stillborn,
        born_alive: bornAlive,
        stillborn,
        notes: formNotes || undefined,
      });

      toast.success(`Farrowing recorded — ${bornAlive} piglets alive`);
      setShowNewFarrowForm(false);
      setFormPiglets('');
      setFormStillborn('0');
      setFormNotes('');

      // Update sow status to lactating and set litter size
      if (sow) {
        try {
          await api.put(`/api/sows/${sow.id}`, {
            status: 'lactating',
            current_litter_size: bornAlive,
            parity: sow.parity + 1,
          } as SowUpdate);
          setSow({ ...sow, status: 'lactating', current_litter_size: bornAlive, parity: sow.parity + 1, last_farrowing_date: farrowingStarted });
        } catch { /* non-critical */ }
      }

      queryClient.invalidateQueries({ queryKey: ["farrowing", "records"] });
      queryClient.invalidateQueries({ queryKey: ["farrowingRecords"] });
      loadFarrowingData();
    } catch (err: unknown) {
      console.error(err);
      toast.error('Failed to record farrowing');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteFarrowing = async (recordId: number) => {
    try {
      await api.post(`/api/farrowing/records/${recordId}/complete`, {
        farrowing_completed: new Date().toISOString(),
        sow_condition: 'good',
      });
      toast.success('Farrowing marked as complete');
      queryClient.invalidateQueries({ queryKey: ["farrowing", "records"] });
      queryClient.invalidateQueries({ queryKey: ["farrowingRecords"] });
      loadFarrowingData();
    } catch {
      toast.error('Failed to complete farrowing');
    }
  };

  // ── Breeding / sow status handlers ────────────────────────────────────────
  const handleSaveBreedingDate = async () => {
    if (!sow) { toast.error('No sow assigned'); return; }

    // Unknown breeding date mode — user sets expected farrowing range or marks pregnant with no dates
    if (unknownBreedingDate) {
      setSavingBreeding(true);
      try {
        // Use midpoint of the range as the expected_farrowing_date for backend
        let expectedDate: string | undefined;
        if (estimatedFarrowingDateFrom && estimatedFarrowingDateTo) {
          const from = new Date(estimatedFarrowingDateFrom).getTime();
          const to = new Date(estimatedFarrowingDateTo).getTime();
          expectedDate = new Date((from + to) / 2).toISOString();
        } else if (estimatedFarrowingDateFrom) {
          expectedDate = new Date(estimatedFarrowingDateFrom).toISOString();
        }
        const updateData: SowUpdate = {
          status: 'pregnant',
          expected_farrowing_date: expectedDate,
        };
        await api.put(`/api/sows/${sow.id}`, updateData);

        const updatedSow = {
          ...sow,
          status: 'pregnant' as const,
          last_breeding_date: null,
          expected_farrowing_date: expectedDate ?? null,
        };
        setSow(updatedSow);
        toast.success(
          estimatedFarrowingDateFrom && estimatedFarrowingDateTo
            ? `Marked pregnant. Estimated farrowing window: ${new Date(estimatedFarrowingDateFrom).toLocaleDateString()} – ${new Date(estimatedFarrowingDateTo).toLocaleDateString()}`
            : estimatedFarrowingDateFrom
            ? `Marked pregnant. Earliest estimated farrowing: ${new Date(estimatedFarrowingDateFrom).toLocaleDateString()}`
            : 'Marked as pregnant (unknown dates). Monitor behavior for farrowing signs.'
        );
        setShowBreedingForm(false);
        setUnknownBreedingDate(false);
        setEstimatedFarrowingDateFrom('');
        setEstimatedFarrowingDateTo('');
      } catch (err) {
        console.error(err);
        toast.error('Failed to update sow status');
      } finally {
        setSavingBreeding(false);
      }
      return;
    }

    // Known breeding date mode
    if (!breedingDate) { toast.error('Enter a breeding/insemination date'); return; }
    setSavingBreeding(true);
    try {
      const breedingDateObj = new Date(breedingDate);
      // Gestation ~114 days
      const expectedFarrowing = new Date(breedingDateObj.getTime() + 114 * 86400000);

      const updateData: SowUpdate = {
        last_breeding_date: breedingDateObj.toISOString(),
        expected_farrowing_date: expectedFarrowing.toISOString(),
        status: 'pregnant',
      };
      await api.put(`/api/sows/${sow.id}`, updateData);

      // Refresh sow data
      setSow({ ...sow, last_breeding_date: breedingDateObj.toISOString(), expected_farrowing_date: expectedFarrowing.toISOString(), status: 'pregnant' });
      toast.success(`Breeding recorded. Expected farrowing: ${expectedFarrowing.toLocaleDateString()}`);
      setShowBreedingForm(false);
      setBreedingDate('');
    } catch (err) {
      console.error(err);
      toast.error('Failed to save breeding info');
    } finally {
      setSavingBreeding(false);
    }
  };

  const handleUpdateSowStatus = async (newStatus: string) => {
    if (!sow) return;
    try {
      await api.put(`/api/sows/${sow.id}`, { status: newStatus } as SowUpdate);
      setSow({ ...sow, status: newStatus as Sow['status'] });
      toast.success(`Sow status updated to ${newStatus}`);
    } catch {
      toast.error('Failed to update sow status');
    }
  };

  const activeFarrowing = farrowingRecords.find((r) => !r.farrowing_completed);
  const hasRecentCompletedFarrowing = farrowingRecords.some((r) => 
    r.farrowing_completed && 
    (Date.now() - new Date(r.farrowing_completed).getTime()) < 40 * 86400000
  );
  const daysSinceFarrowing = activeFarrowing?.farrowing_started
    ? Math.floor((Date.now() - new Date(activeFarrowing.farrowing_started).getTime()) / 86400000)
    : null;

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  // ── Computed values ───────────────────────────────────────────────────────
  const riskValue = detection?.crushingRisk ?? 0;
  const pigletCount = detection?.pigletCount ?? 0;
  const sowCount = detection?.sowCount ?? 0;
  const sowPosture = (detection?.sowPosture ?? 'none').replace(/_/g, ' ').replace(/-/g, ' ');
  const profilesList = Object.values(sowProfiles);

  return (
    <div className="space-y-5 animate-fade-in max-w-[1400px] mx-auto">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              Test Pen
            {activeFarrowing && (
              <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300 animate-pulse">
                Farrowing Active
              </span>
            )}
            {status === 'playing' && (
              <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 animate-pulse">
                Detecting
              </span>
            )}
            {status === 'loading-model' && (
              <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300">
                Loading Model...
              </span>
            )}
          </h1>
          <PageInfoButton onClick={() => setIsInfoOpen(true)} />
        </div>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
            Upload images or videos to test AI detection • {selectedPenId ? `Pen #${selectedPenId}` : 'Select a pen to begin'}
          </p>
        </div>

        {/* Quick stats pills */}
        {detection && (
          <div className="hidden sm:flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800">
              <Baby className="h-3.5 w-3.5" /> {pigletCount} piglets
            </span>
            <span className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border',
              riskValue >= 0.65 ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800'
                : riskValue >= 0.4 ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
                : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
            )}>
              <Shield className="h-3.5 w-3.5" /> {(riskValue * 100).toFixed(0)}% risk
            </span>
            {fps > 0 && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800">
                <Cpu className="h-3.5 w-3.5" /> {fps} FPS
              </span>
            )}
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-800/60 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <label htmlFor="test-pen-select" className="text-sm font-medium text-gray-700 dark:text-slate-300">
            Assessment Pen
          </label>
          <select
            id="test-pen-select"
            value={selectedPenId ?? ''}
            onChange={(e) => {
              const next = Number(e.target.value);
              setSelectedPenId(Number.isInteger(next) && next > 0 ? next : null);
              stopDetection();
            }}
            className="w-full sm:w-72 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-gray-900 dark:text-slate-100"
          >
            <option value="">Select pen...</option>
            {pens.map((pen) => (
              <option key={pen.id} value={pen.id}>
                {pen.name} (#{pen.id})
              </option>
            ))}
          </select>
          {!canUseMedia && (
            <span className="text-xs text-amber-600 dark:text-amber-400">
              Choose a pen to enable upload and playback
            </span>
          )}
        </div>
      </div>

      {/* ── TOP: Video/Image + Quick Info grid ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Media area */}
        <div className="lg:col-span-2 space-y-0 rounded-2xl overflow-hidden border border-gray-200 dark:border-slate-700 bg-black">
          {/* Upload controls bar */}
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-gray-900 border-b border-gray-800">
            <label className={clsx(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-white transition-colors',
              canUseMedia ? 'bg-blue-600 hover:bg-blue-700 cursor-pointer' : 'bg-gray-500 cursor-not-allowed opacity-70'
            )}>
              <Image className="h-3.5 w-3.5" />
              Image
              <input type="file" accept="image/*" className="hidden" disabled={!canUseMedia} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </label>
            <label className={clsx(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-white transition-colors',
              canUseMedia ? 'bg-purple-600 hover:bg-purple-700 cursor-pointer' : 'bg-gray-500 cursor-not-allowed opacity-70'
            )}>
              <FileVideo className="h-3.5 w-3.5" />
              Video
              <input type="file" accept="video/*" className="hidden" disabled={!canUseMedia} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </label>

            {status !== 'idle' && (
              <button onClick={stopDetection} title="Stop detection" className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors">
                <StopCircle className="h-3.5 w-3.5" /> Stop
              </button>
            )}
            {fileType === 'image' && status === 'ready' && (
              <button onClick={runImageDetection} title="Re-detect" className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors">
                <Cpu className="h-3.5 w-3.5" /> Re-detect
              </button>
            )}

            <div className="flex items-center gap-2 ml-auto bg-gray-800 px-3 py-1.5 rounded-lg">
              <span className="text-[10px] text-gray-400">Conf</span>
              <input type="range" min="0.1" max="0.9" step="0.05" value={confidenceThreshold} onChange={(e) => handleConfidenceChange(parseFloat(e.target.value))} className="w-16 h-1 bg-gray-600 rounded appearance-none cursor-pointer" title="Confidence threshold" />
              <span className="text-[10px] font-mono text-gray-200">{confidenceThreshold.toFixed(2)}</span>
            </div>

            {status === 'processing' && (
              <span className="flex items-center gap-1.5 text-[10px] text-blue-400">
                <Cpu className="h-3 w-3 animate-spin" /> Processing...
              </span>
            )}
          </div>

          {/* Video / Image canvas — displayCanvas renders center crop; overlay + model share the same coordinate space */}
          <div className="relative h-[850px] bg-gray-950">
            {/* Hidden source elements for playback/data only */}
            {fileType === 'video' && (
              <video
                ref={videoRef}
                className="hidden"
                muted
                loop
                src={fileUrl || undefined}
                onPlay={() => setVideoPlaying(true)}
                onPause={() => setVideoPlaying(false)}
                onEnded={() => setVideoPlaying(false)}
                onTimeUpdate={() => setVideoCurrentTime(videoRef.current?.currentTime ?? 0)}
                onLoadedMetadata={() => setVideoDuration(videoRef.current?.duration ?? 0)}
              />
            )}
            {fileType === 'image' && (
              <img ref={imageRef} className="hidden" src={fileUrl || undefined} alt="source" onLoad={runImageDetection} />
            )}

            {/* Display canvas — shows the cropped frame (identical region to what the model sees) */}
            {fileUrl && <canvas ref={displayCanvasRef} className="absolute inset-0 w-full h-full" />}

            {/* Overlay canvas — same dimensions as displayCanvas, so bbox coords align exactly */}
            <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none" />

            {!fileUrl && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
                <Upload className="h-14 w-14 text-gray-600 mb-3" />
                <p className="text-gray-400 text-sm mb-1 font-medium">
                  {canUseMedia ? 'Upload an image or video to start' : 'Select a pen before uploading media'}
                </p>
                <p className="text-gray-600 text-xs">The AI model will detect sows, piglets, posture, and crushing risk</p>
              </div>
            )}

            {/* Custom video controls (native controls removed — they bypassed the crop wrapper) */}
            {fileType === 'video' && fileUrl && (
              <div className="absolute bottom-0 left-0 right-0 bg-black/70 backdrop-blur-sm px-4 py-2.5 flex items-center gap-3">
                <button
                  onClick={() => { const v = videoRef.current; if (v) videoPlaying ? v.pause() : v.play(); }}
                  className="text-white hover:text-blue-400 transition-colors flex-shrink-0"
                >
                  {videoPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                </button>
                <span className="text-xs text-white/60 font-mono whitespace-nowrap">
                  {formatTime(videoCurrentTime)} / {formatTime(videoDuration)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={videoDuration || 100}
                  step={0.1}
                  value={videoCurrentTime}
                  title="Video progress"
                  aria-label="Video progress"
                  onChange={(e) => {
                    const v = videoRef.current;
                    if (v) { v.currentTime = parseFloat(e.target.value); setVideoCurrentTime(parseFloat(e.target.value)); }
                  }}
                  className="flex-1 h-1 bg-gray-600 rounded appearance-none cursor-pointer accent-blue-500"
                />
              </div>
            )}

            {/* Risk overlay badge */}
            {detection && riskValue >= 0.4 && (
              <div className={clsx(
                'absolute top-3 right-3 flex items-center gap-1.5 text-white px-3 py-1.5 rounded-lg text-xs font-semibold backdrop-blur-sm',
                riskValue >= 0.7 ? 'bg-red-600/80' : 'bg-amber-600/80'
              )}>
                <AlertTriangle className="h-3.5 w-3.5" />
                {riskValue >= 0.7 ? 'HIGH RISK' : 'CAUTION'}
              </div>
            )}
            {detection && detection.detections.length > 0 && (
              <div className="absolute top-3 left-3 bg-black/60 text-white px-2.5 py-1 rounded-lg text-xs backdrop-blur-sm">
                {detection.detections.length} detection{detection.detections.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>

        {selectedPenId && videoPlaying && (
          <div className="lg:col-span-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Live Pen Analytics (Assessment)</h3>
              <span className="text-xs text-gray-500 dark:text-slate-400">Refreshing every 15s</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-lg border border-gray-200 dark:border-slate-700 p-3 bg-gray-50 dark:bg-slate-900/40">
                <p className="text-xs text-gray-500 dark:text-slate-400">Farrowing Likelihood</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {liveFarrowingLikelihood ? `${liveFarrowingLikelihood.score.toFixed(0)}%` : '--'}
                </p>
                <p className="text-xs text-gray-600 dark:text-slate-300">
                  {liveFarrowingLikelihood?.likelihood ?? 'Waiting for behavior logs'}
                </p>
              </div>
              <div className="rounded-lg border border-gray-200 dark:border-slate-700 p-3 bg-gray-50 dark:bg-slate-900/40">
                <p className="text-xs text-gray-500 dark:text-slate-400">Health Score (Current Window)</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {liveBehaviorAnalytics ? liveBehaviorAnalytics.avg_health_score.toFixed(1) : '--'}
                </p>
                <p className="text-xs text-gray-600 dark:text-slate-300">
                  {liveBehaviorAnalytics ? `${liveBehaviorAnalytics.total_logs} logs analyzed` : 'No analytics yet'}
                </p>
              </div>
              <div className="rounded-lg border border-gray-200 dark:border-slate-700 p-3 bg-gray-50 dark:bg-slate-900/40">
                <p className="text-xs text-gray-500 dark:text-slate-400">Recent Alerts</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{liveRecentAlerts.length}</p>
                <div className="mt-1 space-y-1">
                  {liveRecentAlerts.slice(0, 2).map((alert) => (
                    <p key={alert.id} className="text-[11px] text-gray-600 dark:text-slate-300 truncate">
                      {String(alert.severity || '').toUpperCase()}: {alert.title}
                    </p>
                  ))}
                  {liveRecentAlerts.length === 0 && (
                    <p className="text-[11px] text-gray-500 dark:text-slate-400">No recent alerts for this pen</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Quick Info Panel (right side) */}
        <div className="space-y-4">
          {/* Crushing Risk Gauge */}
          <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-gray-200 dark:border-slate-700 p-5">
            <CrushingRiskGauge rawRisk={riskValue} daysSinceFarrowing={daysSinceFarrowing} size="lg" proximityAlerts={detection?.proximityAlerts} totalPiglets={detection?.pigletCount} />
          </div>

          {/* Live Counts */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white dark:bg-slate-800/60 rounded-xl border border-gray-200 dark:border-slate-700 p-4 text-center">
              <Baby className="h-5 w-5 mx-auto text-green-500 mb-1" />
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{pigletCount}</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">Piglets</p>
            </div>
            <div className="bg-white dark:bg-slate-800/60 rounded-xl border border-gray-200 dark:border-slate-700 p-4 text-center">
              <Activity className="h-5 w-5 mx-auto text-pink-500 mb-1" />
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{sowCount}</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">Sows</p>
            </div>
          </div>

          {/* Sow posture card */}
          <div className="bg-white dark:bg-slate-800/60 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
            <p className="text-xs text-gray-500 dark:text-slate-400 mb-1">Sow Posture</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white capitalize">{sowPosture !== 'none' ? sowPosture : '—'}</p>
            {detection?.sowPostureConfidence ? (
              <p className="text-xs text-gray-400">{(detection.sowPostureConfidence * 100).toFixed(0)}% confidence</p>
            ) : null}
          </div>

          {/* Session info */}
          <div className="bg-white dark:bg-slate-800/60 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-gray-500" />
              <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Session</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-gray-50 dark:bg-slate-700/30 rounded-lg px-3 py-2">
                <span className="text-gray-500 dark:text-slate-400 block">Frames</span>
                <span className="font-bold text-gray-800 dark:text-white">{totalFrames}</span>
              </div>
              <div className="bg-gray-50 dark:bg-slate-700/30 rounded-lg px-3 py-2">
                <span className="text-gray-500 dark:text-slate-400 block">Duration</span>
                <span className="font-bold text-gray-800 dark:text-white">
                  {sessionStarted ? `${Math.round((Date.now() - sessionStarted) / 60000)} min` : '—'}
                </span>
              </div>
            </div>
            {detection?.inferenceTimeMs && (
              <p className="text-xs text-gray-400 mt-2">Inference: {detection.inferenceTimeMs.toFixed(0)}ms</p>
            )}
          </div>

          {/* Sow identity card */}
          {sow && (
            <div className="bg-white dark:bg-slate-800/60 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-full bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center">
                  <Heart className="h-5 w-5 text-pink-500" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">{sow.tag_id}{sow.name ? ` — ${sow.name}` : ''}</p>
                  <p className="text-xs text-gray-500 dark:text-slate-400 capitalize">{sow.status} • Parity {sow.parity}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-gray-50 dark:bg-slate-700/30 rounded-lg px-3 py-2">
                  <span className="text-gray-500 dark:text-slate-400 block">Breed</span>
                  <span className="font-medium text-gray-800 dark:text-white">{sow.breed || '-'}</span>
                </div>
                <div className="bg-gray-50 dark:bg-slate-700/30 rounded-lg px-3 py-2">
                  <span className="text-gray-500 dark:text-slate-400 block">Litter</span>
                  <span className="font-medium text-gray-800 dark:text-white">{sow.current_litter_size || '-'}</span>
                </div>
                <div className="bg-gray-50 dark:bg-slate-700/30 rounded-lg px-3 py-2">
                  <span className="text-gray-500 dark:text-slate-400 block">Status</span>
                  <span className="font-medium text-gray-800 dark:text-white capitalize">{sow.status}</span>
                </div>
                <div className="bg-gray-50 dark:bg-slate-700/30 rounded-lg px-3 py-2">
                  <span className="text-gray-500 dark:text-slate-400 block">Expected</span>
                  <span className="font-medium text-gray-800 dark:text-white">
                    {sow.expected_farrowing_date ? new Date(sow.expected_farrowing_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-gray-100 dark:bg-slate-800/50 rounded-xl p-1 overflow-x-auto">
        {([
          { key: 'overview' as Tab, label: 'Overview', icon: <Eye className="h-4 w-4" /> },
          { key: 'live-monitor' as Tab, label: 'Live Monitor', icon: <Radio className="h-4 w-4" /> },
          { key: 'farrowing' as Tab, label: 'Farrowing & Wellbeing', icon: <Heart className="h-4 w-4" /> },
          { key: 'detections' as Tab, label: 'Detections', icon: <BarChart3 className="h-4 w-4" /> },
          { key: 'behavior' as Tab, label: 'Sow Behavior', icon: <Activity className="h-4 w-4" /> },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={clsx(
              'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
              activeTab === tab.key
                ? 'bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'
            )}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ━━━━━━━━━━━━━ TAB: OVERVIEW ━━━━━━━━━━━━━━━━━ */}
      {activeTab === 'overview' && (
        <div className="space-y-5 animate-fade-in">
          {/* AI analysis cards */}
          <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary-500" />
              <h2 className="font-semibold text-gray-900 dark:text-white">AI Detection Summary</h2>
              <span className="ml-auto text-xs text-gray-400 dark:text-slate-500">{detection ? 'Latest frame' : 'No data'}</span>
            </div>
            <div className="p-5">
              {detection ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Crushing risk insight */}
                  <InsightCard
                    status={riskValue >= 0.65 ? 'critical' : riskValue >= 0.4 ? 'warning' : 'good'}
                    icon={<Shield className="h-5 w-5" />}
                    label="Crushing Risk"
                    value={`${(riskValue * 100).toFixed(0)}%`}
                    detail={
                      riskValue >= 0.65 ? 'Piglets dangerously close to sow. Take immediate action.'
                        : riskValue >= 0.4 ? 'Some piglets near sow. Monitor closely.'
                        : 'Piglets are at safe distance.'
                    }
                  />
                  {/* Posture */}
                  <InsightCard
                    status={/sleep|lying/i.test(sowPosture) && riskValue >= 0.5 ? 'warning' : 'good'}
                    icon={<Activity className="h-5 w-5" />}
                    label="Sow Posture"
                    value={sowPosture !== 'none' ? sowPosture : 'Unknown'}
                    detail={
                      /sleep|lying/i.test(sowPosture)
                        ? 'Sow is lying down — ensure piglets have safe retreat area.'
                        : /feed|stand/i.test(sowPosture)
                        ? 'Sow is active. Good sign of appetite and mobility.'
                        : 'Upload media to detect posture.'
                    }
                  />
                  {/* Detection count */}
                  <InsightCard
                    status="good"
                    icon={<Baby className="h-5 w-5" />}
                    label="Detected Animals"
                    value={`${detection.totalPigCount} total`}
                    detail={`${sowCount} sow(s), ${pigletCount} piglet(s). Avg confidence: ${(detection.analytics.avgConfidence * 100).toFixed(0)}%.`}
                  />
                  {/* Lactation */}
                  {detection.behaviorSummary && (
                    <InsightCard
                      status={detection.behaviorSummary.isNursing ? 'good' : 'warning'}
                      icon={<Sparkles className="h-5 w-5" />}
                      label="Behavior"
                      value={detection.behaviorSummary.isNursing ? 'Lactating' : detection.behaviorSummary.isFeeding ? 'Feeding' : detection.behaviorSummary.isSleeping ? 'Resting' : 'Observing'}
                      detail={`Health score: ${detection.behaviorSummary.healthScore?.toFixed(0) ?? '—'}. Movement: ${detection.analytics.movementEstimate}.`}
                    />
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400 dark:text-slate-500">
                  <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p><TypewriterText text="Upload an image or video to see AI analysis" speed={35} /></p>
                </div>
              )}
            </div>
          </div>

          {/* Proximity alerts */}
          {detection && detection.proximityAlerts && detection.proximityAlerts.length > 0 && (
            <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl border border-red-200 dark:border-red-800 p-5">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <h3 className="font-semibold text-red-800 dark:text-red-200">Proximity Alerts</h3>
              </div>
              <p className="text-sm text-red-700 dark:text-red-300">
                {detection.proximityAlerts.length} piglet{detection.proximityAlerts.length !== 1 ? 's' : ''} detected dangerously close to the sow — crushing risk elevated.
              </p>
            </div>
          )}

          {/* AI Pen Advisory Integration */}
          <AIPenAdvisoryCard 
            penId={penId} 
            penStatus={detection ? {
              crushing_risk: riskValue,
              piglet_count: pigletCount,
              sow_posture: sowPosture
            } : {}}
            recentEvents={[]} 
          />

        </div>
      )}

      {/* ━━━━━━━━━━━━━ TAB: LIVE MONITOR ━━━━━━━━━━━━━━━━━ */}
      {activeTab === 'live-monitor' && (
        <div className="space-y-5 animate-fade-in">
          {/* ── 5️⃣ Replay Mode Toggle ───────────────────────────────── */}
          <div className="flex items-center justify-between bg-white/70 dark:bg-slate-800/40 rounded-xl px-4 py-2.5 border border-gray-200 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-green-500" />
              <span className="text-xs font-semibold text-gray-700 dark:text-slate-300">Monitor Mode</span>
            </div>
            <div className="flex bg-gray-100 dark:bg-slate-700 rounded-lg p-0.5">
              <button
                onClick={() => setLiveMode('live')}
                className={clsx(
                  'px-3 py-1 rounded-md text-xs font-medium transition-all',
                  liveMode === 'live'
                    ? 'bg-green-500 text-white shadow-sm'
                    : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
                )}
              >
                <span className="flex items-center gap-1.5"><Radio className="h-3 w-3" /> Live Mode</span>
              </button>
              <button
                onClick={() => navigate(`/replay?pen=${penId}`)}
                className={clsx(
                  'px-3 py-1 rounded-md text-xs font-medium transition-all',
                  liveMode === 'replay'
                    ? 'bg-blue-500 text-white shadow-sm'
                    : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
                )}
              >
                <span className="flex items-center gap-1.5"><Eye className="h-3 w-3" /> Load Replay</span>
              </button>
            </div>
          </div>

          {/* Alert banners */}
          {simPigletDropAlert && (
            <div className="bg-red-50 dark:bg-red-900/20 rounded-2xl border-2 border-red-300 dark:border-red-700 p-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-800/50 flex items-center justify-center animate-bounce">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="font-bold text-red-800 dark:text-red-200">Piglet Count Drop Detected!</p>
                  <p className="text-sm text-red-600 dark:text-red-300">
                    Fewer than {simExpectedPiglets} piglets visible. Check for crushing, escape, or camera blind spots.
                  </p>
                </div>
              </div>
            </div>
          )}

          {simSustainedHighRisk && (
            <div className="bg-orange-50 dark:bg-orange-900/20 rounded-2xl border-2 border-orange-300 dark:border-orange-700 p-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-orange-100 dark:bg-orange-800/50 flex items-center justify-center">
                  <Shield className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="font-bold text-orange-800 dark:text-orange-200">Sustained High Crushing Risk!</p>
                  <p className="text-sm text-orange-600 dark:text-orange-300">
                    Crushing risk remains above 65% for an extended period. Consider intervention.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Farrowing Engine Panel */}
          <FarrowingEnginePanelTest
            state={farrowingState}
            prediction={farrowingPrediction}
            activeSession={activeSession}
            alerts={farrowingAlerts}
            safetyChecks={farrowingSafetyChecks}
            completedSessions={completedSessions}
            noNewPigletSinceMs={noNewPigletSinceMs}
            monitoringInterval={monitoringInterval}
            restlessnessResult={restlessness}
            likelihoodResult={farrowingLikelihood}
            stagnationResult={stagnation}
            trendData={trendData}
          />

          {/* Live Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            <LiveStatCard
              icon={<Baby className="h-4 w-4 text-green-500" />}
              label="Piglets"
              value={`${pigletCount}/${simExpectedPiglets}`}
              sub={simStats.framesProcessed > 0 ? `avg ${simStats.avgPigletCount.toFixed(1)}` : '\u2014'}
              status={pigletCount < simExpectedPiglets ? 'warning' : 'good'}
            />
            <LiveStatCard
              icon={<Shield className="h-4 w-4 text-red-500" />}
              label="Crush Risk"
              value={`${(riskValue * 100).toFixed(0)}%`}
              sub={`max ${(simStats.maxCrushingRisk * 100).toFixed(0)}%`}
              status={riskValue >= 0.65 ? 'critical' : riskValue >= 0.4 ? 'warning' : 'good'}
            />
            <LiveStatCard
              icon={<Heart className="h-4 w-4 text-pink-500" />}
              label="Health"
              value={`${(detection?.behaviorSummary?.healthScore ?? 0).toFixed(0)}`}
              sub={`avg ${simStats.avgHealthScore.toFixed(0)}`}
              status={simStats.avgHealthScore < 40 ? 'warning' : 'good'}
            />
            <LiveStatCard
              icon={<Timer className="h-4 w-4 text-purple-500" />}
              label="Lactation"
              value={`${simStats.totalNursingSessions}`}
              sub={`${simStats.nursingPercentage.toFixed(0)}% time`}
              status={simIsSimulating && simStats.framesProcessed > 50 && simStats.nursingPercentage < 5 ? 'warning' : 'good'}
            />
            <LiveStatCard
              icon={<Zap className="h-4 w-4 text-amber-500" />}
              label="Posture"
              value={`${simStats.postureChanges} chg`}
              sub={`${(sowPosture ?? 'none').replace(/-/g, ' ')}`}
              status="good"
            />
            <LiveStatCard
              icon={<Bell className="h-4 w-4 text-blue-500" />}
              label="Events"
              value={`${simStats.totalEvents}`}
              sub={`${simStats.criticalEvents} critical`}
              status={simStats.criticalEvents > 0 ? 'critical' : simStats.warningEvents > 0 ? 'warning' : 'good'}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Left column: Charts & data */}
            <div className="lg:col-span-2 space-y-5">
              {/* Piglet Count Trend */}
              {simPigletCountHistory.length > 5 && (
                <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-gray-200 dark:border-slate-700 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="h-5 w-5 text-green-500" />
                    <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Piglet Count Trend</h3>
                    <span className="ml-auto text-xs text-gray-400">Expected: {simExpectedPiglets}</span>
                  </div>
                  <MiniSparkline
                    data={simPigletCountHistory.map((e) => e.count)}
                    expected={simExpectedPiglets}
                    color="#4CAF50"
                    warningColor="#F44336"
                    height={60}
                  />
                  <div className="flex items-center justify-between text-xs text-gray-400 mt-2">
                    <span>Min: {simStats.minPigletCount}</span>
                    <span>Avg: {simStats.avgPigletCount.toFixed(1)}</span>
                    <span>Max: {simStats.maxPigletCount}</span>
                    <span>Drops: {simStats.pigletCountDrops}</span>
                  </div>
                </div>
              )}

              {/* Crushing Risk Trend */}
              {simRiskHistory.length > 5 && (
                <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-gray-200 dark:border-slate-700 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Shield className="h-5 w-5 text-red-500" />
                    <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Crushing Risk Trend</h3>
                    <span className="ml-auto text-xs text-gray-400">
                      High risk time: {(simStats.timeAboveHighRisk / 1000).toFixed(0)}s
                    </span>
                  </div>
                  <MiniSparkline
                    data={simRiskHistory.map((e) => e.risk * 100)}
                    expected={65}
                    color="#FF5722"
                    warningColor="#F44336"
                    height={50}
                    isPercentage
                  />
                </div>
              )}

              {/* Posture Timeline */}
              {simPostureTimeline.length > 0 && (
                <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-gray-200 dark:border-slate-700 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Activity className="h-5 w-5 text-pink-500" />
                    <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Posture Timeline</h3>
                  </div>
                  <PostureTimelineBar segments={simPostureTimeline} />
                  <div className="flex flex-wrap gap-3 mt-2">
                    {Object.entries(POSTURE_COLORS).map(([posture, color]) => (
                      <span key={posture} className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                        {posture}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Lactation Sessions */}
              {simNursingSessions.length > 0 && (
                <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-gray-200 dark:border-slate-700 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Heart className="h-5 w-5 text-purple-500" />
                    <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Lactation Sessions</h3>
                    <span className="ml-auto text-xs text-gray-400">
                      Total: {simStats.totalNursingSessions} | Avg: {simStats.avgNursingDurationMs > 0 ? `${(simStats.avgNursingDurationMs / 1000).toFixed(0)}s` : '\u2014'}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {simNursingSessions.slice(-8).reverse().map((ns, i) => (
                      <div key={ns.id || i} className="flex items-center gap-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl p-3">
                        <div className="h-8 w-8 rounded-lg bg-purple-100 dark:bg-purple-800/40 flex items-center justify-center">
                          <Heart className="h-4 w-4 text-purple-600" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-purple-800 dark:text-purple-200">
                            Session {simNursingSessions.length - i}
                          </p>
                          <p className="text-xs text-purple-600 dark:text-purple-300">
                            Duration: {ns.durationMs ? `${(ns.durationMs / 1000).toFixed(0)}s` : 'ongoing...'}
                            {ns.startVideoTime !== undefined && ` | Video: ${ns.startVideoTime.toFixed(1)}s`}
                          </p>
                        </div>
                        <span className={clsx(
                          'px-2 py-0.5 rounded-full text-xs font-medium',
                          ns.endTime ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 animate-pulse'
                        )}>
                          {ns.endTime ? 'Completed' : 'Active'}
                        </span>
                      </div>
                    ))}
                  </div>
                  {simCurrentNursing && (
                    <div className="mt-3 bg-purple-100 dark:bg-purple-900/30 rounded-xl p-3 border border-purple-200 dark:border-purple-700 animate-pulse">
                      <p className="text-sm font-semibold text-purple-800 dark:text-purple-200 flex items-center gap-2">
                        <Heart className="h-4 w-4" /> Currently Lactating
                      </p>
                      <p className="text-xs text-purple-600 dark:text-purple-300 mt-1">
                        Started {((Date.now() - simCurrentNursing.startTime) / 1000).toFixed(0)}s ago
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Session Statistics Summary */}
              {simStats.framesProcessed > 10 && (
                <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-gray-200 dark:border-slate-700 p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <PieChart className="h-5 w-5 text-indigo-500" />
                    <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Session Statistics</h3>
                    <span className="ml-auto text-xs text-gray-400">
                      {simStats.framesProcessed} frames | {(simStats.sessionDurationMs / 1000).toFixed(0)}s
                    </span>
                  </div>

                  {/* Posture distribution bar */}
                  <p className="text-xs text-gray-500 dark:text-slate-400 mb-2 font-medium">Activity Distribution</p>
                  <div className="flex gap-0.5 h-4 rounded-full overflow-hidden mb-2">
                    {[
                      { label: 'Lactation', pct: simStats.nursingPercentage, color: '#9C27B0' },
                      { label: 'Feeding', pct: simStats.feedingPercentage, color: '#8BC34A' },
                      { label: 'Sleeping', pct: simStats.sleepingPercentage, color: '#2196F3' },
                      { label: 'Standing', pct: simStats.standingPercentage, color: '#FF9800' },
                    ].filter((s) => s.pct > 0).map((s) => (
                      <div
                        key={s.label}
                        title={`${s.label}: ${s.pct.toFixed(1)}%`}
                        className="transition-all duration-500"
                        style={{ width: `${s.pct}%`, backgroundColor: s.color, minWidth: s.pct > 0 ? '2px' : '0' }}
                      />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#9C27B0]" /> Lactation {simStats.nursingPercentage.toFixed(1)}%</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#8BC34A]" /> Feeding {simStats.feedingPercentage.toFixed(1)}%</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#2196F3]" /> Sleeping {simStats.sleepingPercentage.toFixed(1)}%</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#FF9800]" /> Standing {simStats.standingPercentage.toFixed(1)}%</span>
                  </div>

                  {/* Key metrics grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
                    <div className="bg-gray-50 dark:bg-slate-700/30 rounded-xl p-3">
                      <p className="text-xs text-gray-500 dark:text-slate-400">Avg Piglets</p>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">{simStats.avgPigletCount.toFixed(1)}</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-slate-700/30 rounded-xl p-3">
                      <p className="text-xs text-gray-500 dark:text-slate-400">Avg Risk</p>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">{(simStats.avgCrushingRisk * 100).toFixed(0)}%</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-slate-700/30 rounded-xl p-3">
                      <p className="text-xs text-gray-500 dark:text-slate-400">Cross-Pen</p>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">{simStats.crossPenDetections}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right column: Event Feed */}
            <div className="lg:col-span-1">
              <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden sticky top-4">
                <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700 flex items-center gap-2">
                  <MonitorSpeaker className="h-4 w-4 text-blue-500" />
                  <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Event Feed</h3>
                  {simIsSimulating && (
                    <span className="ml-auto flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> Live
                    </span>
                  )}
                  {!simIsSimulating && simEvents.length > 0 && (
                    <span className="ml-auto text-xs text-gray-400">{simEvents.length} events</span>
                  )}
                </div>
                <div className="max-h-[600px] overflow-y-auto divide-y divide-gray-50 dark:divide-slate-700/50">
                  {simEvents.length > 0 ? (
                    simEvents.slice(0, 50).map((evt) => (
                      <EventFeedItem key={evt.id} event={evt} />
                    ))
                  ) : (
                    <div className="p-6 text-center text-gray-400 dark:text-slate-500">
                      <Radio className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">Upload a video to start live monitoring</p>
                      <p className="text-xs mt-1">Events will appear here automatically</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Smart Insights */}
          {simStats.framesProcessed > 30 && (
            <div className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20 rounded-2xl border border-indigo-200 dark:border-indigo-800 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-5 w-5 text-indigo-500" />
                <h3 className="font-semibold text-indigo-800 dark:text-indigo-200">AI Smart Insights</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Lactation insight */}
                <InsightCard
                  status={simStats.nursingPercentage > 20 ? 'good' : simStats.nursingPercentage > 5 ? 'warning' : simIsSimulating && simStats.framesProcessed > 50 ? 'critical' : 'good'}
                  icon={<Heart className="h-5 w-5" />}
                  label="Lactation Pattern"
                  value={`${simStats.totalNursingSessions} sessions`}
                  detail={
                    simStats.nursingPercentage > 20
                      ? `Good lactation rate (${simStats.nursingPercentage.toFixed(0)}% of time). Sow is actively feeding litter.`
                      : simStats.nursingPercentage > 5
                      ? `Moderate lactation (${simStats.nursingPercentage.toFixed(0)}%). Monitor milk availability.`
                      : simIsSimulating && simStats.framesProcessed > 50
                      ? `Low lactation detected (${simStats.nursingPercentage.toFixed(0)}%). Sow may be experiencing agalactia. Monitor milk production closely.`
                      : 'Collecting data...'
                  }
                />

                {/* Piglet tracking insight */}
                <InsightCard
                  status={simStats.pigletCountDrops > 3 ? 'critical' : simStats.pigletCountDrops > 0 ? 'warning' : 'good'}
                  icon={<Baby className="h-5 w-5" />}
                  label="Piglet Tracking"
                  value={`${simStats.avgPigletCount.toFixed(1)} avg visible`}
                  detail={
                    simStats.pigletCountDrops > 3
                      ? `Frequent piglet count drops (${simStats.pigletCountDrops}x). Check for mortality or camera coverage.`
                      : simStats.pigletCountDrops > 0
                      ? `${simStats.pigletCountDrops} temporary drop(s). Piglets may hide behind sow or in blind spots.`
                      : `Stable visibility. All ${simExpectedPiglets} expected piglets consistently detected.`
                  }
                />

                {/* Activity insight */}
                <InsightCard
                  status={simStats.postureChanges < 2 && simStats.framesProcessed > 100 ? 'warning' : 'good'}
                  icon={<Activity className="h-5 w-5" />}
                  label="Sow Activity"
                  value={`${simStats.postureChanges} changes`}
                  detail={
                    simStats.postureChanges < 2 && simStats.framesProcessed > 100
                      ? 'Low activity. Sow barely changed posture. May indicate lethargy or discomfort.'
                      : simStats.postureChanges > 10
                      ? 'High activity. Sow is restless \u2014 could indicate discomfort, heat stress, or pre-farrowing restlessness.'
                      : 'Normal activity pattern. Sow cycling between rest and movement.'
                  }
                />

                {/* Cross-pen insight */}
                <InsightCard
                  status={simStats.crossPenDetections > 0 ? 'warning' : 'good'}
                  icon={<Target className="h-5 w-5" />}
                  label="Cross-Pen"
                  value={simStats.crossPenDetections > 0 ? `${simStats.crossPenDetections} detected` : 'None'}
                  detail={
                    simStats.crossPenDetections > 0
                      ? `Camera captured ${simStats.crossPenDetections} cross-pen detection(s). Edge-of-frame animals are from adjacent pen.`
                      : 'No cross-pen detections. Camera view well-contained to this pen.'
                  }
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ━━━━━━━━━━━━━ TAB: FARROWING & WELLBEING ━━━━━━━━━━━━━ */}
      {activeTab === 'farrowing' && (
        <div className="space-y-5 animate-fade-in">
          {/* Action bar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Heart className="h-5 w-5 text-pink-500" />
              Farrowing Management — Test Pen
              {/* Info tooltip */}
              <div className="relative" onMouseEnter={() => setShowFarrowingGuide(true)} onMouseLeave={() => setShowFarrowingGuide(false)}>
                <button title="Farrowing management guide" className="h-4.5 w-4.5 rounded-full bg-gray-200 dark:bg-slate-600 flex items-center justify-center hover:bg-gray-300 dark:hover:bg-slate-500 transition-colors">
                  <Info className="h-2.5 w-2.5 text-gray-500 dark:text-slate-300" />
                </button>
                {showFarrowingGuide && (
                  <div className="absolute left-0 top-7 z-50 w-80 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-200 dark:border-slate-700 p-4 space-y-3 text-xs">
                    <p className="font-semibold text-gray-900 dark:text-white text-sm">Farrowing Management Guide</p>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <span className="flex-shrink-0 h-5 w-5 rounded-full bg-indigo-100 dark:bg-indigo-800/50 text-indigo-600 dark:text-indigo-300 flex items-center justify-center font-bold text-[10px]">1</span>
                        <div><span className="font-semibold text-gray-800 dark:text-gray-200">Record Breeding</span> — Enter the sow's breeding/insemination date. The system calculates the expected farrowing date (~114 days gestation).</div>
                      </div>
                      <div className="flex gap-2">
                        <span className="flex-shrink-0 h-5 w-5 rounded-full bg-pink-100 dark:bg-pink-800/50 text-pink-600 dark:text-pink-300 flex items-center justify-center font-bold text-[10px]">2</span>
                        <div><span className="font-semibold text-gray-800 dark:text-gray-200">Record Birth</span> — When farrowing begins, log the number of piglets born alive and any stillborns. This creates a farrowing record.</div>
                      </div>
                      <div className="flex gap-2">
                        <span className="flex-shrink-0 h-5 w-5 rounded-full bg-blue-100 dark:bg-blue-800/50 text-blue-600 dark:text-blue-300 flex items-center justify-center font-bold text-[10px]">3</span>
                        <div><span className="font-semibold text-gray-800 dark:text-gray-200">Complete Farrowing</span> — Mark the farrowing as complete once all piglets are delivered and the sow is stable.</div>
                      </div>
                      <div className="flex gap-2">
                        <span className="flex-shrink-0 h-5 w-5 rounded-full bg-green-100 dark:bg-green-800/50 text-green-600 dark:text-green-300 flex items-center justify-center font-bold text-[10px]">4</span>
                        <div><span className="font-semibold text-gray-800 dark:text-gray-200">Monitor & Track</span> — View farrowing history, stats, and sow status. Update sow status (active, pregnant, lactating) as needed.</div>
                      </div>
                    </div>
                    <div className="pt-1 border-t border-gray-100 dark:border-slate-700 text-[10px] text-gray-400 dark:text-slate-500">
                      Tip: If you don't know the breeding date, use the toggle to set an estimated farrowing date or mark the sow as pregnant without dates.
                    </div>
                  </div>
                )}
              </div>
            </h2>
            <div className="flex items-center gap-2">
              {sow && !activeFarrowing && sow.status === 'pregnant' && (
                <button
                  onClick={() => setShowNewFarrowForm(!showNewFarrowForm)}
                  className="flex items-center gap-2 px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-xl text-sm font-medium transition-all duration-200 hover:shadow-lg hover:shadow-pink-500/25 hover:-translate-y-0.5"
                >
                  <Plus className="h-4 w-4" /> Record Birth
                </button>
              )}
              {sow && !activeFarrowing && (sow.status === 'active' || sow.status === 'inactive') && (
                <button
                  onClick={() => setShowBreedingForm(!showBreedingForm)}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-all duration-200 hover:shadow-lg hover:shadow-indigo-500/25 hover:-translate-y-0.5"
                >
                  <Edit3 className="h-4 w-4" /> Record Breeding
                </button>
              )}
              {sow && sow.status === 'lactating' && !activeFarrowing && !hasRecentCompletedFarrowing && (
                <button
                  onClick={() => setShowNewFarrowForm(!showNewFarrowForm)}
                  className="flex items-center gap-2 px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-xl text-sm font-medium transition-all duration-200 hover:shadow-lg"
                >
                  <Plus className="h-4 w-4" /> Record Birth
                </button>
              )}
              {!sow && !farrowingLoading && (
                <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-1.5 rounded-lg border border-amber-200 dark:border-amber-800">
                  No sow assigned to Pen #{penId}
                </span>
              )}
            </div>
          </div>

          {/* ── ONBOARDING: No sow assigned — guide caretaker to set up ── */}
          {!sow && !farrowingLoading && (
            <div className="bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 dark:from-amber-900/20 dark:via-orange-900/15 dark:to-yellow-900/10 rounded-2xl border-2 border-dashed border-amber-300 dark:border-amber-700 p-8 text-center space-y-4">
              <div className="h-16 w-16 rounded-full bg-amber-100 dark:bg-amber-800/40 flex items-center justify-center mx-auto">
                <ClipboardList className="h-8 w-8 text-amber-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">No Sow Assigned to Pen #{penId}</h3>
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
                  To start tracking farrowing, breeding records, and piglet monitoring, a sow must first be assigned to this pen. Please assign a sow through the pen management page or contact your administrator.
                </p>
              </div>
              <div className="bg-white dark:bg-slate-800/50 rounded-xl p-4 max-w-sm mx-auto text-left space-y-2 text-xs text-gray-600 dark:text-slate-300">
                <p className="font-semibold text-gray-900 dark:text-white text-sm">What you'll be able to do:</p>
                <div className="flex items-start gap-2"><CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" /><span>Record breeding/insemination dates with auto gestation tracking</span></div>
                <div className="flex items-start gap-2"><CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" /><span>Log births with piglet counts, stillborns, and notes</span></div>
                <div className="flex items-start gap-2"><CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" /><span>Get AI-powered crushing risk monitoring and alerts</span></div>
                <div className="flex items-start gap-2"><CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" /><span>View farrowing history, stats, and lifecycle management</span></div>
              </div>
            </div>
          )}

          {/* ── PROMPT: Sow is active/inactive — prompt caretaker to record breeding ── */}
          {sow && !activeFarrowing && (sow.status === 'active' || sow.status === 'inactive') && !showBreedingForm && (
            <div className="bg-gradient-to-r from-indigo-50 to-violet-50 dark:from-indigo-900/20 dark:to-violet-900/15 rounded-2xl border-2 border-dashed border-indigo-300 dark:border-indigo-700 p-6 space-y-4">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-full bg-indigo-100 dark:bg-indigo-800/40 flex items-center justify-center flex-shrink-0">
                  <Edit3 className="h-6 w-6 text-indigo-500" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900 dark:text-white">Next Step: Record Breeding Information</h3>
                  <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                    Sow <strong>{sow.tag_id}</strong>{sow.name ? ` (${sow.name})` : ''} is currently <strong className="capitalize">{sow.status}</strong>. To begin farrowing tracking, record when the sow was bred or artificially inseminated.
                  </p>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    <div className="flex items-center gap-2 bg-white/60 dark:bg-slate-800/40 rounded-lg px-3 py-2">
                      <span className="h-5 w-5 rounded-full bg-indigo-100 dark:bg-indigo-700 text-indigo-600 dark:text-indigo-300 flex items-center justify-center font-bold text-[9px]">1</span>
                      <span className="text-gray-600 dark:text-slate-300">Record breeding date</span>
                    </div>
                    <div className="flex items-center gap-2 bg-white/60 dark:bg-slate-800/40 rounded-lg px-3 py-2">
                      <span className="h-5 w-5 rounded-full bg-gray-200 dark:bg-slate-600 text-gray-500 dark:text-slate-400 flex items-center justify-center font-bold text-[9px]">2</span>
                      <span className="text-gray-400 dark:text-slate-500">Track gestation (auto)</span>
                    </div>
                    <div className="flex items-center gap-2 bg-white/60 dark:bg-slate-800/40 rounded-lg px-3 py-2">
                      <span className="h-5 w-5 rounded-full bg-gray-200 dark:bg-slate-600 text-gray-500 dark:text-slate-400 flex items-center justify-center font-bold text-[9px]">3</span>
                      <span className="text-gray-400 dark:text-slate-500">Record birth when due</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowBreedingForm(true)}
                    className="mt-4 flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-all duration-200 hover:shadow-lg hover:shadow-indigo-500/25 hover:-translate-y-0.5"
                  >
                    <Edit3 className="h-4 w-4" /> Record Breeding / Insemination
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── PROMPT: Sow is weaned — prompt caretaker for next breeding cycle ── */}
          {sow && !activeFarrowing && sow.status === 'weaned' && !showBreedingForm && (
            <div className="bg-gradient-to-r from-cyan-50 to-teal-50 dark:from-cyan-900/20 dark:to-teal-900/15 rounded-2xl border-2 border-dashed border-cyan-300 dark:border-cyan-700 p-6 space-y-4">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-full bg-cyan-100 dark:bg-cyan-800/40 flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="h-6 w-6 text-cyan-500" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900 dark:text-white">Sow Weaned — Ready for Next Cycle</h3>
                  <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                    Sow <strong>{sow.tag_id}</strong>{sow.name ? ` (${sow.name})` : ''} has been weaned. Sows typically return to estrus <strong>4–7 days</strong> after weaning.
                  </p>
                  <div className="mt-3 bg-white/60 dark:bg-slate-800/40 rounded-xl p-3 text-xs space-y-1.5 text-gray-600 dark:text-slate-300">
                    <p className="font-semibold text-gray-800 dark:text-gray-200">Caretaker Checklist:</p>
                    <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />Watch for estrus signs (standing heat, swollen vulva, restlessness)</div>
                    <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />Flush-feed the sow to improve ovulation rate</div>
                    <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />Record the breeding/insemination date once bred</div>
                    <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />Consider body condition score — target 3.0–3.5 before re-breeding</div>
                  </div>
                  <div className="flex items-center gap-2 mt-4">
                    <button
                      onClick={() => setShowBreedingForm(true)}
                      className="flex items-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-sm font-medium transition-all duration-200 hover:shadow-lg hover:shadow-cyan-500/25 hover:-translate-y-0.5"
                    >
                      <Edit3 className="h-4 w-4" /> Record New Breeding
                    </button>
                    <button
                      onClick={() => handleUpdateSowStatus('active')}
                      className="px-4 py-2.5 text-sm text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl transition-colors border border-gray-200 dark:border-slate-700"
                    >
                      Mark as Active
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── PROMPT: Sow is lactating with no active farrowing — prompt to record birth ── */}
          {sow && sow.status === 'lactating' && !activeFarrowing && !hasRecentCompletedFarrowing && !showNewFarrowForm && (
            <div className="bg-gradient-to-r from-pink-50 to-rose-50 dark:from-pink-900/20 dark:to-rose-900/15 rounded-2xl border-2 border-dashed border-pink-300 dark:border-pink-700 p-6 space-y-4">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-full bg-pink-100 dark:bg-pink-800/40 flex items-center justify-center flex-shrink-0">
                  <Baby className="h-6 w-6 text-pink-500" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900 dark:text-white">Record Birth Details</h3>
                  <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                    Sow <strong>{sow.tag_id}</strong>{sow.name ? ` (${sow.name})` : ''} is marked as <strong>lactating</strong> but has no active farrowing record. Please log the birth details so the system can track piglet welfare and provide accurate monitoring.
                  </p>
                  <div className="mt-3 bg-white/60 dark:bg-slate-800/40 rounded-xl p-3 text-xs space-y-1.5 text-gray-600 dark:text-slate-300">
                    <p className="font-semibold text-gray-800 dark:text-gray-200">What we need from you:</p>
                    <div className="flex items-center gap-2"><Baby className="h-3.5 w-3.5 text-pink-400 flex-shrink-0" />Number of piglets born alive</div>
                    <div className="flex items-center gap-2"><XCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />Number of stillborns (if any)</div>
                    <div className="flex items-center gap-2"><Calendar className="h-3.5 w-3.5 text-indigo-400 flex-shrink-0" />Farrowing date and time</div>
                    <div className="flex items-center gap-2"><FileText className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />Any notes about the delivery (optional)</div>
                  </div>
                  <button
                    onClick={() => setShowNewFarrowForm(true)}
                    className="mt-4 flex items-center gap-2 px-5 py-2.5 bg-pink-600 hover:bg-pink-700 text-white rounded-xl text-sm font-medium transition-all duration-200 hover:shadow-lg hover:shadow-pink-500/25 hover:-translate-y-0.5"
                  >
                    <Plus className="h-4 w-4" /> Record Birth Now
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── PROMPT: Sow is pregnant with no active farrowing — prompt quick health check ── */}
          {sow && sow.status === 'pregnant' && !activeFarrowing && !showNewFarrowForm && !showBreedingForm && (
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/15 dark:to-emerald-900/10 rounded-2xl border border-green-200 dark:border-green-800 p-5">
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-800/40 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="h-5 w-5 text-green-500" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Quick Health Check Reminder</h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                    Remember to observe and record any changes for sow <strong>{sow.tag_id}</strong>{sow.name ? ` (${sow.name})` : ''}. Regular caretaker observations improve early detection.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                    <span className="bg-green-100 dark:bg-green-800/30 text-green-700 dark:text-green-300 px-2.5 py-1 rounded-lg">Appetite normal?</span>
                    <span className="bg-green-100 dark:bg-green-800/30 text-green-700 dark:text-green-300 px-2.5 py-1 rounded-lg">Movement normal?</span>
                    <span className="bg-green-100 dark:bg-green-800/30 text-green-700 dark:text-green-300 px-2.5 py-1 rounded-lg">Udder changes?</span>
                    <span className="bg-green-100 dark:bg-green-800/30 text-green-700 dark:text-green-300 px-2.5 py-1 rounded-lg">Vulva changes?</span>
                    <span className="bg-green-100 dark:bg-green-800/30 text-green-700 dark:text-green-300 px-2.5 py-1 rounded-lg">Body condition OK?</span>
                    <span className="bg-green-100 dark:bg-green-800/30 text-green-700 dark:text-green-300 px-2.5 py-1 rounded-lg">Water intake?</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 1: Breeding/Insemination Input (for active sows not yet bred) ── */}
          {showBreedingForm && sow && (
            <div className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20 rounded-2xl border border-indigo-200 dark:border-indigo-800 p-6 space-y-4">
              <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Edit3 className="h-5 w-5 text-indigo-500" /> Record Breeding / Insemination
              </h3>
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Enter the date the sow was bred or artificially inseminated. The system will automatically calculate the expected farrowing date (~114 days gestation).
              </p>

              {/* Toggle: I don't know the breeding date */}
              <label className="flex items-center gap-3 cursor-pointer group">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={unknownBreedingDate}
                    onChange={(e) => {
                      setUnknownBreedingDate(e.target.checked);
                      if (e.target.checked) setBreedingDate('');
                      else { setEstimatedFarrowingDateFrom(''); setEstimatedFarrowingDateTo(''); }
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-gray-200 dark:bg-slate-600 rounded-full peer-checked:bg-amber-500 dark:peer-checked:bg-amber-600 transition-colors" />
                  <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow peer-checked:translate-x-5 transition-transform" />
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-slate-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                  I don't know the breeding/insemination date
                </span>
              </label>

              {!unknownBreedingDate ? (
                /* ── Known date mode ── */
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                      <Calendar className="inline h-4 w-4 mr-1" /> Breeding / Insemination Date
                    </label>
                    <input
                      type="date"
                      title="Breeding date"
                      value={breedingDate}
                      onChange={(e) => setBreedingDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 text-sm"
                    />
                  </div>
                  {breedingDate && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                        <Calendar className="inline h-4 w-4 mr-1" /> Expected Farrowing Date (auto)
                      </label>
                      <div className="w-full px-3 py-2 rounded-lg border border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300 text-sm font-semibold">
                        {new Date(new Date(breedingDate).getTime() + 114 * 86400000).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                        <span className="text-xs font-normal ml-2 opacity-70">(114 days gestation)</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* ── Unknown date mode ── */
                <div className="space-y-4">
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2 text-amber-700 dark:text-amber-300 font-semibold text-sm">
                      <AlertTriangle className="h-4 w-4" /> Pregnant with Unknown Breeding Date
                    </div>
                    <p className="text-sm text-amber-600 dark:text-amber-300">
                      No problem! You can still mark the sow as pregnant. If you have a rough idea when she might farrow, enter an <strong>estimated date range</strong> below. This is more accurate since without a breeding date the exact due date is uncertain. Otherwise, the system will rely on <strong>behavioral detection</strong> (posture switching, restlessness, reduced appetite) to alert you.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wider">Estimated Farrowing Window <span className="text-gray-400 dark:text-slate-500 font-normal normal-case">(optional)</span></p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                          <Calendar className="inline h-4 w-4 mr-1" /> Earliest Expected Date
                        </label>
                        <input
                          type="date"
                          title="Earliest estimated farrowing date"
                          value={estimatedFarrowingDateFrom}
                          onChange={(e) => {
                            setEstimatedFarrowingDateFrom(e.target.value);
                            // Auto-clear "to" if it's before "from"
                            if (estimatedFarrowingDateTo && e.target.value > estimatedFarrowingDateTo) setEstimatedFarrowingDateTo('');
                          }}
                          min={new Date().toISOString().split('T')[0]}
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                          <Calendar className="inline h-4 w-4 mr-1" /> Latest Expected Date
                        </label>
                        <input
                          type="date"
                          title="Latest estimated farrowing date"
                          value={estimatedFarrowingDateTo}
                          onChange={(e) => setEstimatedFarrowingDateTo(e.target.value)}
                          min={estimatedFarrowingDateFrom || new Date().toISOString().split('T')[0]}
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 text-sm"
                        />
                      </div>
                    </div>

                    {/* Range summary */}
                    {(estimatedFarrowingDateFrom || estimatedFarrowingDateTo) && (
                      <div className="bg-white/60 dark:bg-slate-800/40 rounded-xl p-3 space-y-2">
                        {estimatedFarrowingDateFrom && estimatedFarrowingDateTo && (() => {
                          const from = new Date(estimatedFarrowingDateFrom);
                          const to = new Date(estimatedFarrowingDateTo);
                          const windowDays = Math.ceil((to.getTime() - from.getTime()) / 86400000);
                          const daysUntilEarliest = Math.ceil((from.getTime() - Date.now()) / 86400000);
                          const daysUntilLatest = Math.ceil((to.getTime() - Date.now()) / 86400000);
                          return (
                            <>
                              <div className="flex items-center gap-3">
                                <div className="flex-1 h-2 rounded-full bg-amber-200 dark:bg-amber-800 relative overflow-hidden">
                                  <div className="absolute inset-0 bg-gradient-to-r from-amber-400 to-amber-500 dark:from-amber-500 dark:to-amber-600 rounded-full" />
                                </div>
                                <span className="text-xs font-bold text-amber-700 dark:text-amber-300 whitespace-nowrap">{windowDays} day window</span>
                              </div>
                              <div className="flex justify-between text-xs">
                                <div>
                                  <span className="text-gray-500 dark:text-slate-400">Earliest: </span>
                                  <span className="font-semibold text-amber-700 dark:text-amber-300">
                                    {from.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    {daysUntilEarliest <= 0 ? ' (now/past)' : ` (${daysUntilEarliest}d)`}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-gray-500 dark:text-slate-400">Latest: </span>
                                  <span className="font-semibold text-amber-700 dark:text-amber-300">
                                    {to.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    {daysUntilLatest <= 0 ? ' (now/past)' : ` (${daysUntilLatest}d)`}
                                  </span>
                                </div>
                              </div>
                              {daysUntilEarliest <= 7 && (
                                <p className="text-xs text-red-600 dark:text-red-400 font-medium flex items-center gap-1">
                                  <AlertTriangle className="h-3 w-3" /> Farrowing window is approaching or open. Increase monitoring frequency.
                                </p>
                              )}
                            </>
                          );
                        })()}
                        {estimatedFarrowingDateFrom && !estimatedFarrowingDateTo && (
                          <div className="text-xs text-gray-500 dark:text-slate-400">
                            Earliest: <span className="font-semibold text-amber-700 dark:text-amber-300">{new Date(estimatedFarrowingDateFrom).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                            <span className="ml-2 text-gray-400">— add a latest date to define the full window</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Sow status will auto-change to pregnant */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-sm">
                <div className="flex items-center gap-2 mb-2 text-blue-700 dark:text-blue-300 font-semibold">
                  <Sparkles className="h-4 w-4" /> What happens when you save
                </div>
                <ul className="space-y-1 text-blue-600 dark:text-blue-300">
                  <li>• Sow status changes from <strong>{sow.status}</strong> → <strong>pregnant</strong></li>
                  {unknownBreedingDate ? (
                    <>
                      {estimatedFarrowingDateFrom && estimatedFarrowingDateTo && (
                        <li>• Estimated farrowing window: <strong>{new Date(estimatedFarrowingDateFrom).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} – {new Date(estimatedFarrowingDateTo).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</strong></li>
                      )}
                      {estimatedFarrowingDateFrom && !estimatedFarrowingDateTo && (
                        <li>• Earliest estimated farrowing: <strong>{new Date(estimatedFarrowingDateFrom).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</strong></li>
                      )}
                      <li>• System will focus on <strong>behavioral signs</strong> to detect approaching farrowing</li>
                      <li>• You can update the breeding date later if you find records</li>
                    </>
                  ) : (
                    <>
                      <li>• Expected farrowing date is set automatically (breeding date + 114 days)</li>
                      <li>• System will track gestation progress and alert you as the due date approaches</li>
                    </>
                  )}
                  <li>• Pre-farrowing behavior analysis will begin (posture switching frequency, restlessness inference)</li>
                </ul>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleSaveBreedingDate}
                  disabled={savingBreeding || (!unknownBreedingDate && !breedingDate)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-all duration-200 hover:shadow-lg"
                >
                  {savingBreeding ? (
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {unknownBreedingDate ? 'Mark as Pregnant' : 'Save Breeding Record'}
                </button>
                <button
                  onClick={() => { setShowBreedingForm(false); setUnknownBreedingDate(false); setEstimatedFarrowingDateFrom(''); setEstimatedFarrowingDateTo(''); }}
                  className="px-4 py-2.5 text-sm text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 2: Pre-Farrowing Monitoring (pregnant sow, not yet farrowed) ── */}
          {sow && sow.status === 'pregnant' && !activeFarrowing && (
            <div className="space-y-4">
              {/* Gestation progress */}
              <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-2xl border border-purple-200 dark:border-purple-800 p-5">
                <div className="flex items-center gap-3 mb-3">
                  <Calendar className="h-6 w-6 text-purple-500" />
                  <div>
                    <h3 className="font-semibold text-purple-800 dark:text-purple-200">Gestation Progress</h3>
                    <p className="text-sm text-purple-600 dark:text-purple-300">
                      Sow {sow.tag_id}{sow.name ? ` (${sow.name})` : ''} • Parity {sow.parity}
                    </p>
                  </div>
                </div>

                {(() => {
                  const breedDateStr = sow.last_breeding_date;
                  const expectedStr = sow.expected_farrowing_date;

                  // Pregnant with NO dates at all
                  if (!breedDateStr && !expectedStr) {
                    return (
                      <div className="space-y-4">
                        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-2 text-amber-700 dark:text-amber-300 font-semibold text-sm">
                            <AlertTriangle className="h-4 w-4" /> Unknown Gestation Timeline
                          </div>
                          <p className="text-sm text-amber-600 dark:text-amber-300">
                            This sow is marked as pregnant but has no breeding date or estimated farrowing date on record.
                            The system is relying on <strong>behavioral detection</strong> to identify approaching farrowing.
                          </p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <InsightCard
                            status="warning"
                            icon={<Calendar className="h-5 w-5" />}
                            label="Due Date"
                            value="Unknown"
                            detail="No estimated farrowing date. Watch for physical signs: udder enlargement, vulva swelling, milk letdown, increased restlessness."
                          />
                          {detection && (
                            <InsightCard
                              status={/stand|feed/i.test(sowPosture) ? 'warning' : 'good'}
                              icon={<Activity className="h-5 w-5" />}
                              label="Behavior Analysis"
                              value={sowPosture !== 'none' ? sowPosture : 'Unknown'}
                              detail="Without a breeding date, behavioral analysis is the primary indicator. Watch for: restlessness, posture switching, rapid breathing, reduced appetite."
                            />
                          )}
                          <InsightCard
                            status={sow.parity >= 5 ? 'warning' : 'good'}
                            icon={<Shield className="h-5 w-5" />}
                            label="Risk Profile"
                            value={`Parity ${sow.parity}`}
                            detail={
                              sow.parity === 0
                                ? 'Gilt (first farrowing). Higher risk of prolonged labor. Have assistance ready.'
                                : sow.parity >= 7
                                ? 'High parity sow. May have larger but weaker litters. Monitor for uterine fatigue.'
                                : sow.parity >= 5
                                ? 'Experienced sow but aging. Monitor for overlay risk and teat functionality.'
                                : 'Good parity range. Expected normal farrowing outcomes.'
                            }
                          />
                        </div>
                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-sm">
                          <div className="flex items-center gap-2 mb-2 text-blue-700 dark:text-blue-300 font-semibold">
                            <Sparkles className="h-4 w-4" /> What to Watch For
                          </div>
                          <ul className="space-y-1.5 text-blue-600 dark:text-blue-300">
                            <li>• <strong>Udder development</strong> — teats become fuller 2-3 days before farrowing</li>
                            <li>• <strong>Milk letdown</strong> — milk can be expressed &lt;12 hours before birth (high probability of imminent farrowing)</li>
                            <li>• <strong>Restlessness / posture switching</strong> — frequent position changes, getting up and lying down repeatedly</li>
                            <li>• <strong>Vulva changes</strong> — swelling and reddening in the days before farrowing</li>
                            <li>• <strong>Reduced appetite</strong> — eating less 12-24 hours before labor</li>
                          </ul>
                        </div>
                      </div>
                    );
                  }

                  // Pregnant with expected date but no breeding date (estimated)
                  if (!breedDateStr && expectedStr) {
                    const expectedDate = new Date(expectedStr);
                    const daysRemaining = Math.ceil((expectedDate.getTime() - Date.now()) / 86400000);

                    return (
                      <>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                          <div className="text-center bg-white/60 dark:bg-slate-800/40 rounded-xl py-3">
                            <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">?</p>
                            <p className="text-xs text-purple-500">Days Pregnant</p>
                            <p className="text-[10px] text-gray-400 dark:text-slate-500">Breeding date unknown</p>
                          </div>
                          <div className="text-center bg-white/60 dark:bg-slate-800/40 rounded-xl py-3">
                            <p className={clsx('text-2xl font-bold', daysRemaining <= 7 ? 'text-red-600 dark:text-red-400' : daysRemaining <= 14 ? 'text-amber-600 dark:text-amber-400' : 'text-purple-700 dark:text-purple-300')}>
                              {daysRemaining <= 0 ? 'Overdue' : `~${daysRemaining}`}
                            </p>
                            <p className="text-xs text-purple-500">Est. Days Remaining</p>
                          </div>
                          <div className="text-center bg-white/60 dark:bg-slate-800/40 rounded-xl py-3">
                            <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{expectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                            <p className="text-xs text-purple-500">Est. Due Date</p>
                          </div>
                        </div>

                        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-xs text-amber-600 dark:text-amber-300 mb-4">
                          <strong>Note:</strong> Breeding date unknown — gestation progress bar and nutrition phase are approximate. Focus on behavioral signs as due date approaches.
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <InsightCard
                            status={daysRemaining <= 3 ? 'critical' : daysRemaining <= 7 ? 'warning' : 'good'}
                            icon={<Calendar className="h-5 w-5" />}
                            label="Est. Due Date"
                            value={daysRemaining <= 0 ? 'Overdue!' : `~${daysRemaining} days`}
                            detail={
                              daysRemaining <= 0
                                ? 'Sow is past estimated due date. Watch for imminent farrowing signs.'
                                : daysRemaining <= 3
                                ? 'Farrowing likely imminent. Prepare pen and monitor 24/7.'
                                : daysRemaining <= 7
                                ? 'Farrowing approaching. Start increased monitoring.'
                                : 'Estimated farrowing date is set. Continue monitoring.'
                            }
                          />
                          {detection && (
                            <InsightCard
                              status={/stand|feed/i.test(sowPosture) && daysRemaining <= 3 ? 'critical' : /sleep|lying/i.test(sowPosture) && daysRemaining <= 7 ? 'warning' : 'good'}
                              icon={<Activity className="h-5 w-5" />}
                              label="Behavior Analysis"
                              value={sowPosture !== 'none' ? sowPosture : 'Unknown'}
                              detail="Behavioral signs are especially important when breeding date is unknown. Watch for posture switching, restlessness, rapid breathing."
                            />
                          )}
                          <InsightCard
                            status={sow.parity >= 5 ? 'warning' : 'good'}
                            icon={<Shield className="h-5 w-5" />}
                            label="Risk Profile"
                            value={`Parity ${sow.parity}`}
                            detail={
                              sow.parity === 0
                                ? 'Gilt (first farrowing). Higher risk of prolonged labor.'
                                : sow.parity >= 5
                                ? 'Experienced sow but aging. Monitor carefully.'
                                : 'Good parity range. Expected normal farrowing.'
                            }
                          />
                        </div>
                      </>
                    );
                  }

                  // Full tracking: both breeding date and expected date available
                  const breedDate = new Date(breedDateStr!);
                  const expectedDate = new Date(expectedStr!);
                  const gestationDays = Math.floor((Date.now() - breedDate.getTime()) / 86400000);
                  const daysRemaining = Math.max(0, Math.floor((expectedDate.getTime() - Date.now()) / 86400000));
                  const progressPct = Math.min(100, (gestationDays / 114) * 100);

                  return (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                        <div className="text-center bg-white/60 dark:bg-slate-800/40 rounded-xl py-3">
                          <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{gestationDays}</p>
                          <p className="text-xs text-purple-500">Days Pregnant</p>
                        </div>
                        <div className="text-center bg-white/60 dark:bg-slate-800/40 rounded-xl py-3">
                          <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{daysRemaining}</p>
                          <p className="text-xs text-purple-500">Days Remaining</p>
                        </div>
                        <div className="text-center bg-white/60 dark:bg-slate-800/40 rounded-xl py-3">
                          <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{breedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                          <p className="text-xs text-purple-500">Bred</p>
                        </div>
                        <div className="text-center bg-white/60 dark:bg-slate-800/40 rounded-xl py-3">
                          <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{expectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                          <p className="text-xs text-purple-500">Due Date</p>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="mb-4">
                        <div className="flex justify-between text-xs text-purple-500 mb-1">
                          <span>Bred</span>
                          <span>{progressPct.toFixed(0)}%</span>
                          <span>Due</span>
                        </div>
                        <div className="w-full bg-purple-200 dark:bg-purple-800 rounded-full h-3 overflow-hidden">
                          <div
                            className={clsx(
                              'h-3 rounded-full transition-all duration-500',
                              daysRemaining <= 7 ? 'bg-red-500' : daysRemaining <= 14 ? 'bg-amber-500' : 'bg-purple-500'
                            )}
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>

                      {/* Pre-farrowing behavior analysis */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <InsightCard
                          status={daysRemaining <= 3 ? 'critical' : daysRemaining <= 7 ? 'warning' : 'good'}
                          icon={<Calendar className="h-5 w-5" />}
                          label="Due Date"
                          value={daysRemaining <= 0 ? 'Overdue!' : `${daysRemaining} days`}
                          detail={
                            daysRemaining <= 0
                              ? 'Sow is past due date. Watch for imminent farrowing signs: restlessness, posture switching, milk letdown.'
                              : daysRemaining <= 3
                              ? 'Farrowing imminent. Prepare pen: check heat lamp, have supplies ready, monitor 24/7.'
                              : daysRemaining <= 7
                              ? 'Farrowing approaching. Watch for increased posture switching and restlessness.'
                              : daysRemaining <= 14
                              ? 'Late gestation. Increase feed to support rapid piglet growth. Check udder development.'
                              : 'Normal gestation progress. Continue regular nutrition and monitoring.'
                          }
                        />
                        {detection && (
                          <InsightCard
                            status={
                              /sleep|lying/i.test(sowPosture) && gestationDays > 110 ? 'warning'
                              : /stand|feed/i.test(sowPosture) && gestationDays > 112 ? 'critical'
                              : 'good'
                            }
                            icon={<Activity className="h-5 w-5" />}
                            label="Behavior Analysis"
                            value={sowPosture !== 'none' ? sowPosture : 'Unknown'}
                            detail={
                              gestationDays > 112
                                ? 'Very late gestation. Watch for: posture switching, rapid breathing, restlessness, udder enlargement.'
                                : gestationDays > 108
                                ? 'Pre-farrowing window. Sow may show increased restlessness, reduced appetite, vulva swelling.'
                                : 'Normal gestational behavior. Monitor posture and activity patterns.'
                            }
                          />
                        )}
                        <InsightCard
                          status={gestationDays >= 80 && gestationDays <= 100 ? 'warning' : 'good'}
                          icon={<Sparkles className="h-5 w-5" />}
                          label="Nutrition Phase"
                          value={
                            gestationDays <= 30 ? 'Early'
                            : gestationDays <= 85 ? 'Mid'
                            : gestationDays <= 100 ? 'Late-build'
                            : 'Pre-farrowing'
                          }
                          detail={
                            gestationDays <= 30
                              ? 'Early gestation. Standard diet. Avoid overfeeding — target body condition score 3.'
                              : gestationDays <= 85
                              ? 'Mid gestation. Maintain 2.0-2.5kg/day feed. Monitor body condition weekly.'
                              : gestationDays <= 100
                              ? 'Increase feed to 2.5-3.0kg/day. Piglets growing rapidly. Add fiber for gut health.'
                              : 'Pre-farrowing. Increase to 3.0-3.5kg/day. Ensure vitamin E and selenium supplementation.'
                          }
                        />
                        <InsightCard
                          status={sow.parity >= 5 ? 'warning' : 'good'}
                          icon={<Shield className="h-5 w-5" />}
                          label="Risk Profile"
                          value={`Parity ${sow.parity}`}
                          detail={
                            sow.parity === 0
                              ? 'Gilt (first farrowing). Higher risk of prolonged labor. Have assistance ready.'
                              : sow.parity >= 7
                              ? 'High parity sow. May have larger but weaker litters. Monitor for uterine fatigue.'
                              : sow.parity >= 5
                              ? 'Experienced sow but aging. Monitor for overlay risk and teat functionality.'
                              : 'Good parity range. Expected normal farrowing outcomes.'
                          }
                        />
                      </div>

                      {/* Gestation stage tips */}
                      <div className="mt-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-sm">
                        <div className="flex items-center gap-2 mb-2 text-blue-700 dark:text-blue-300 font-semibold">
                          <Sparkles className="h-4 w-4" /> {
                            gestationDays <= 30 ? 'Early Gestation Guidelines (Days 1-30)'
                            : gestationDays <= 85 ? 'Mid Gestation Guidelines (Days 31-85)'
                            : gestationDays <= 100 ? 'Late Gestation Guidelines (Days 86-100)'
                            : gestationDays <= 110 ? 'Pre-Farrowing Prep (Days 101-110)'
                            : 'Imminent Farrowing (Day 111+)'
                          }
                        </div>
                        <ul className="space-y-1.5 text-blue-600 dark:text-blue-300">
                          {gestationDays <= 30 && (
                            <>
                              <li>• Embryo implantation occurs (days 12-18). Minimize stress — no mixing, moving, or environmental extremes.</li>
                              <li>• Day 18-24: Return-to-heat observation window. If sow shows estrus signs, breeding failed — re-breed.</li>
                              <li>• Day 24-30: Confirm pregnancy via ultrasound.</li>
                              <li>• Feed 1.8-2.0 kg/day standard gestation diet.</li>
                            </>
                          )}
                          {gestationDays > 30 && gestationDays <= 85 && (
                            <>
                              <li>• Stable period. Maintain body condition score 3.0-3.5.</li>
                              <li>• Feed 2.0-2.5 kg/day. Adjust based on body condition.</li>
                              <li>• Vaccinate against common pathogens (E. coli, Clostridium) at days 70-80.</li>
                            </>
                          )}
                          {gestationDays > 85 && gestationDays <= 100 && (
                            <>
                              <li>• Rapid piglet growth phase. Increase feed by 0.5 kg/day.</li>
                              <li>• De-worm sow before moving to farrowing crate.</li>
                              <li>• Prepare farrowing area: clean, disinfect, check heating equipment.</li>
                            </>
                          )}
                          {gestationDays > 100 && gestationDays <= 110 && (
                            <>
                              <li>• Move sow to farrowing crate by day 110 to acclimate.</li>
                              <li>• Increase feed to 3.0-3.5 kg/day. Switch to lactation diet.</li>
                              <li>• Check udder for milk letdown signs. Test teats for patency.</li>
                              <li>• Prepare birthing supplies: towels, iodine, clamps, heat lamp.</li>
                            </>
                          )}
                          {gestationDays > 110 && (
                            <>
                              <li>• <strong>Watch for farrowing signs:</strong> restlessness, posture switching (frequent lying-standing cycles), vulva swelling, milk letdown.</li>
                              <li>• Reduce feed to 1.5 kg on day of expected farrowing to prevent constipation.</li>
                              <li>• Monitor every 2-4 hours. Record time between piglet births (should be 10-30 min).</li>
                              <li>• If no piglets after 30+ min of straining, intervene or call veterinarian.</li>
                              <li>• Have oxytocin available if labor stalls (vet approval required).</li>
                            </>
                          )}
                        </ul>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* ── STEP 3: Active Farrowing (birth recorded, monitoring piglets) ── */}
          {activeFarrowing && (
            <div className="bg-gradient-to-r from-pink-50 to-rose-50 dark:from-pink-900/20 dark:to-rose-900/20 rounded-2xl border border-pink-200 dark:border-pink-800 p-5">
              <div className="flex items-center gap-3 mb-3">
                <Heart className="h-6 w-6 text-pink-500" />
                <div>
                  <h3 className="font-semibold text-pink-800 dark:text-pink-200">Active Farrowing</h3>
                  <p className="text-sm text-pink-600 dark:text-pink-300">
                    Started {activeFarrowing.farrowing_started
                      ? new Date(activeFarrowing.farrowing_started).toLocaleString()
                      : 'recently'}
                    {sow && <span className="ml-2">• Sow {sow.tag_id}{sow.name ? ` (${sow.name})` : ''}</span>}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center bg-white/60 dark:bg-slate-800/40 rounded-xl py-3">
                  <p className="text-2xl font-bold text-pink-700 dark:text-pink-300">{activeFarrowing.born_alive ?? '-'}</p>
                  <p className="text-xs text-pink-500">Born Alive</p>
                </div>
                <div className="text-center bg-white/60 dark:bg-slate-800/40 rounded-xl py-3">
                  <p className="text-2xl font-bold text-gray-700 dark:text-gray-300">{activeFarrowing.total_born ?? '-'}</p>
                  <p className="text-xs text-gray-500">Total Born</p>
                </div>
                <div className="text-center bg-white/60 dark:bg-slate-800/40 rounded-xl py-3">
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">{activeFarrowing.stillborn ?? 0}</p>
                  <p className="text-xs text-red-500">Stillborn</p>
                </div>
              </div>

              {/* Wellbeing insights for active farrowing */}
              {(() => {
                const daysSinceFarrowing = activeFarrowing.farrowing_started
                  ? Math.floor((Date.now() - new Date(activeFarrowing.farrowing_started).getTime()) / 86400000)
                  : null;
                const expectedPiglets = activeFarrowing.born_alive ?? 0;

                return (
                  <div className="mt-4 space-y-3">
                    <p className="text-xs font-semibold text-pink-700 dark:text-pink-300 uppercase tracking-wider">Piglet & Sow Wellbeing</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <InsightCard
                        status={daysSinceFarrowing !== null && daysSinceFarrowing <= 3 ? 'critical' : daysSinceFarrowing !== null && daysSinceFarrowing > 21 ? 'warning' : 'good'}
                        icon={<Heart className="h-5 w-5" />}
                        label="Lactation Day"
                        value={daysSinceFarrowing !== null ? `Day ${daysSinceFarrowing}` : 'Unknown'}
                        detail={
                          daysSinceFarrowing !== null
                            ? daysSinceFarrowing <= 3
                              ? 'Critical neonatal period — ensure all piglets receive colostrum within 6 hours.'
                              : daysSinceFarrowing <= 7
                              ? 'Early lactation. Monitor piglet weight gain and sow feed intake closely.'
                              : daysSinceFarrowing <= 21
                              ? 'Mid-lactation. Check piglets for size uniformity. Ensure sow eats well.'
                              : 'Late lactation — consider weaning plan. Monitor sow body condition.'
                            : 'Record farrowing date for tracking.'
                        }
                      />
                      {expectedPiglets > 0 && detection && (
                        <InsightCard
                          status={expectedPiglets - pigletCount >= 3 ? 'critical' : expectedPiglets - pigletCount >= 1 ? 'warning' : 'good'}
                          icon={<Baby className="h-5 w-5" />}
                          label="Piglet Visibility"
                          value={`${pigletCount} / ${expectedPiglets}`}
                          detail={
                            expectedPiglets - pigletCount >= 3
                              ? `${expectedPiglets - pigletCount} piglets not visible. Check for hiding, crushing, or camera blind spots.`
                              : expectedPiglets - pigletCount >= 1
                              ? `${expectedPiglets - pigletCount} piglet(s) may be out of view. Verify physically.`
                              : 'All expected piglets are visible in frame.'
                          }
                        />
                      )}
                      {detection && (
                        <InsightCard
                          status={riskValue >= 0.65 ? 'critical' : riskValue >= 0.4 ? 'warning' : 'good'}
                          icon={<Shield className="h-5 w-5" />}
                          label="Crushing Risk"
                          value={`${(riskValue * 100).toFixed(0)}%`}
                          detail={
                            riskValue >= 0.65 ? 'Piglets dangerously close to sow. Intervene immediately.'
                              : riskValue >= 0.4 ? 'Some piglets near sow. Keep monitoring.'
                              : 'Piglets are at a safe distance.'
                          }
                        />
                      )}
                      {detection && (
                        <InsightCard
                          status={/sleep|lying/i.test(sowPosture) && riskValue >= 0.5 ? 'warning' : 'good'}
                          icon={<Activity className="h-5 w-5" />}
                          label="Sow Posture"
                          value={sowPosture !== 'none' ? sowPosture : 'Unknown'}
                          detail={
                            /sleep|lying/i.test(sowPosture)
                              ? 'Sow is lying down — ensure piglets have safe retreat area to avoid overlay.'
                              : /feed|stand/i.test(sowPosture)
                              ? 'Sow is active/feeding. Good sign of appetite and mobility post-farrowing.'
                              : 'Upload media to detect posture.'
                          }
                        />
                      )}
                    </div>

                    {/* Wellbeing tips based on day */}
                    {daysSinceFarrowing !== null && (
                      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-sm">
                        <div className="flex items-center gap-2 mb-2 text-blue-700 dark:text-blue-300 font-semibold">
                          <Sparkles className="h-4 w-4" /> Monitoring Tips — Day {daysSinceFarrowing}
                        </div>
                        <ul className="space-y-1.5 text-blue-600 dark:text-blue-300">
                          {daysSinceFarrowing <= 3 && (
                            <>
                              <li>• Keep creep area warm (32-35°C). Watch for piglets sleeping near sow instead of heat lamp.</li>
                              <li>• Ensure all piglets nurse within the first 6 hours for colostrum intake.</li>
                              <li>• Check for weak or cold piglets and assist with lactation if needed.</li>
                            </>
                          )}
                          {daysSinceFarrowing > 3 && daysSinceFarrowing <= 7 && (
                            <>
                              <li>• Begin monitoring piglet weights — aim for 200-300g daily gain.</li>
                              <li>• Sow should be eating 6-8kg feed daily. Increase gradually.</li>
                              <li>• Watch for signs of diarrhea (scours) in piglets.</li>
                            </>
                          )}
                          {daysSinceFarrowing > 7 && daysSinceFarrowing <= 14 && (
                            <>
                              <li>• Introduce creep feed to piglets from day 7-10.</li>
                              <li>• Monitor sow body condition — she should maintain weight.</li>
                              <li>• Check for uniformity in litter; runts may need supplemental feeding.</li>
                            </>
                          )}
                          {daysSinceFarrowing > 14 && daysSinceFarrowing <= 21 && (
                            <>
                              <li>• Piglets should be actively exploring creep feed.</li>
                              <li>• Prepare for weaning at day 21-28.</li>
                              <li>• Ensure water access for piglets.</li>
                            </>
                          )}
                          {daysSinceFarrowing > 21 && (
                            <>
                              <li>• Weaning should occur soon if not already done.</li>
                              <li>• Sow body condition may decline — adjust nutrition post-weaning.</li>
                              <li>• Next estrus expected 4-7 days after weaning.</li>
                            </>
                          )}
                          <li>• AI monitors crushing risk continuously. Alerts fire if risk exceeds 65%.</li>
                          {sow && sow.parity >= 5 && (
                            <li>• <strong>High parity sow (P{sow.parity}):</strong> Higher likelihood of overlay. Consider crate adjustment.</li>
                          )}
                        </ul>
                      </div>
                    )}

                    <button
                      onClick={() => handleCompleteFarrowing(activeFarrowing.id)}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-medium transition-all"
                    >
                      <CheckCircle className="h-4 w-4" /> Mark Farrowing Complete
                    </button>
                  </div>
                );
              })()}
            </div>
          )}

          {/* New farrowing form (Record Birth) */}
          {showNewFarrowForm && sow && (
            <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-pink-200 dark:border-pink-800 p-6 space-y-4">
              <h3 className="font-semibold text-gray-900 dark:text-white">Record New Birth (Farrowing Event)</h3>
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Sow <strong>{sow.tag_id}</strong>{sow.name ? ` — ${sow.name}` : ''} • Parity {sow.parity} • Test Pen #{penId}
              </p>
              <p className="text-xs text-gray-400 dark:text-slate-500">
                Manually input the number of piglets born and the date/time of birth. This is how the system knows the sow has farrowed.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                    <Calendar className="inline h-4 w-4 mr-1" /> Farrowing Date
                  </label>
                  <input
                    type="date"
                    title="Farrowing date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                    <Clock className="inline h-4 w-4 mr-1" /> Farrowing Time
                  </label>
                  <input
                    type="time"
                    title="Farrowing time"
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                    <Baby className="inline h-4 w-4 mr-1" /> Piglets Born Alive
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formPiglets}
                    onChange={(e) => setFormPiglets(e.target.value)}
                    placeholder="e.g. 12"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                    <XCircle className="inline h-4 w-4 mr-1" /> Stillborn
                  </label>
                  <input
                    type="number"
                    min="0"
                    title="Stillborn count"
                    value={formStillborn}
                    onChange={(e) => setFormStillborn(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  <FileText className="inline h-4 w-4 mr-1" /> Notes (optional)
                </label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={2}
                  placeholder="e.g. Assisted delivery, sow showed signs of distress..."
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-pink-500 text-sm resize-none"
                />
              </div>

              {/* AI recommendation */}
              {formPiglets && Number(formPiglets) > 0 && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-sm">
                  <div className="flex items-center gap-2 mb-2 text-blue-700 dark:text-blue-300 font-semibold">
                    <Sparkles className="h-4 w-4" /> AI Monitoring Recommendations
                  </div>
                  <ul className="space-y-1.5 text-blue-600 dark:text-blue-300">
                    {Number(formPiglets) > 14 && (
                      <li>• <strong>Large litter ({formPiglets}):</strong> Monitor for uneven piglet sizes. Consider split-suckling in first 12 hours.</li>
                    )}
                    {Number(formPiglets) <= 8 && (
                      <li>• <strong>Small litter ({formPiglets}):</strong> Piglets may grow faster. Monitor sow for mastitis with fewer suckling piglets.</li>
                    )}
                    <li>• First 72 hours are critical — ensure all piglets receive colostrum within 6 hours of birth.</li>
                    <li>• Keep creep area warm (32-35°C). Watch for piglets sleeping near sow instead of heat lamp.</li>
                    {Number(formStillborn) > 2 && (
                      <li>• <strong>Elevated stillborn count ({formStillborn}):</strong> Review sow nutrition & birthing assistance protocols.</li>
                    )}
                    <li>• AI will monitor crushing risk every 12s. Alerts fire if risk exceeds 65% for sustained period.</li>
                    {sow.parity >= 5 && (
                      <li>• <strong>High parity sow (P{sow.parity}):</strong> Higher likelihood of overlay. Consider crate adjustment.</li>
                    )}
                  </ul>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleRecordFarrowing}
                  disabled={submitting || !formPiglets}
                  className="flex items-center gap-2 px-5 py-2.5 bg-pink-600 hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-all duration-200 hover:shadow-lg"
                >
                  {submitting ? (
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  ) : (
                    <CheckCircle className="h-4 w-4" />
                  )}
                  Save Farrowing Record
                </button>
                <button
                  onClick={() => setShowNewFarrowForm(false)}
                  className="px-4 py-2.5 text-sm text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Sow Status Management */}
          {sow && !activeFarrowing && (
            <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-gray-200 dark:border-slate-700 p-5">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-gray-500" /> Sow Lifecycle Status
              </h3>
              <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">
                Current status: <strong className="capitalize">{sow.status}</strong>. Update the sow's reproductive status to calibrate monitoring and alerts.
              </p>
              {/* SOW STATUS UPDATE BLOCK - STRICT MODE */}
              <div className="flex flex-wrap gap-2">
                {(['active', 'pregnant', 'lactating', 'weaned', 'inactive'] as const).map((s) => (
                  <button
                    key={s}
                    disabled={true}
                    className={clsx(
                      'px-4 py-2 rounded-xl text-sm font-medium transition-all opacity-80 cursor-not-allowed',
                      s === sow.status
                        ? s === 'pregnant' ? 'bg-purple-600 text-white shadow-md font-bold'
                          : s === 'lactating' ? 'bg-pink-600 text-white shadow-md font-bold'
                          : s === 'weaned' ? 'bg-cyan-600 text-white shadow-md font-bold'
                          : s === 'active' ? 'bg-green-600 text-white shadow-md font-bold'
                          : 'bg-gray-600 text-white shadow-md font-bold'
                        : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-500'
                    )}
                  >
                    {s === 'active' && '● Active'}
                    {s === 'pregnant' && '● Pregnant'}
                    {s === 'lactating' && '● Lactating'}
                    {s === 'weaned' && '● Weaned'}
                    {s === 'inactive' && '● Inactive'}
                  </button>
                ))}
              </div>

              {sow.status !== 'active' && sow.status !== 'inactive' && (
                <div className="mt-4 flex items-center justify-between bg-red-50 dark:bg-red-900/10 p-3 rounded-xl border border-red-100 dark:border-red-900/30">
                  <div className="text-sm text-red-700 dark:text-red-400">
                    <p className="font-semibold">Need to correct a mistake?</p>
                    <p className="text-xs mt-0.5 opacity-90">Resetting will clear the current lifecycle dates and return the sow to Active status.</p>
                  </div>
                  <button
                    onClick={async () => {
                      if (confirm("Are you sure you want to reset this sow's lifecycle? This will clear breeding and expected farrowing dates.")) {
                        try {
                          await api.put(`/api/sows/${sow.id}`, {
                            status: 'active',
                            last_breeding_date: null as unknown as string,
                            expected_farrowing_date: null as unknown as string
                          } as SowUpdate);
                          loadFarrowingData();
                          toast.success('Sow lifecycle reset to Active');
                        } catch (err: unknown) {
                          console.error(err);
                          toast.error('Failed to reset sow lifecycle');
                        }
                      }
                    }}
                    className="px-3 py-1.5 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 rounded-lg text-sm font-medium transition-colors"
                  >
                    Cancel / Reset Registration
                  </button>
                </div>
              )}
              
              <div className="mt-4 text-xs text-gray-400 dark:text-slate-500 space-y-1">
                <p><strong>Active:</strong> Not bred. Record breeding date to start gestation tracking.</p>
                <p><strong>Pregnant:</strong> Bred and gestating. System tracks days until expected farrowing and provides stage-specific guidance.</p>
                <p><strong>Lactating:</strong> Has farrowed. System monitors piglet wellbeing, crushing risk, and lactation days.</p>
                <p><strong>Weaned:</strong> Piglets weaned. Sow available for next breeding cycle (typically 5-7 days post-wean).</p>
                <p><strong>Inactive:</strong> Not in production cycle.</p>
              </div>
            </div>
          )}

          {/* Farrowing stats summary */}
          {farrowingStats && farrowingStats.total_farrowings > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white dark:bg-slate-800/60 rounded-xl border border-gray-200 dark:border-slate-700 p-4 hover:shadow-md transition-all">
                <BarChart3 className="h-4 w-4 text-indigo-500 mb-1" />
                <p className="text-xs text-gray-500 dark:text-slate-400">Total (90d)</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{farrowingStats.total_farrowings}</p>
              </div>
              <div className="bg-white dark:bg-slate-800/60 rounded-xl border border-gray-200 dark:border-slate-700 p-4 hover:shadow-md transition-all">
                <TrendingUp className="h-4 w-4 text-green-500 mb-1" />
                <p className="text-xs text-gray-500 dark:text-slate-400">Avg Alive</p>
                <p className="text-xl font-bold text-green-600 dark:text-green-400">{farrowingStats.avg_born_alive.toFixed(1)}</p>
              </div>
              <div className="bg-white dark:bg-slate-800/60 rounded-xl border border-gray-200 dark:border-slate-700 p-4 hover:shadow-md transition-all">
                <Thermometer className="h-4 w-4 text-red-500 mb-1" />
                <p className="text-xs text-gray-500 dark:text-slate-400">Stillborn Rate</p>
                <p className="text-xl font-bold text-red-600 dark:text-red-400">{farrowingStats.stillborn_rate.toFixed(1)}%</p>
              </div>
              <div className="bg-white dark:bg-slate-800/60 rounded-xl border border-gray-200 dark:border-slate-700 p-4 hover:shadow-md transition-all">
                <Baby className="h-4 w-4 text-blue-500 mb-1" />
                <p className="text-xs text-gray-500 dark:text-slate-400">Avg Litter</p>
                <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{farrowingStats.avg_litter_size.toFixed(1)}</p>
              </div>
            </div>
          )}

          {/* Next farrowing prediction (for completed farrowings) */}
          {sow && !activeFarrowing && sow.status !== 'pregnant' && farrowingRecords.length > 0 && (() => {
            const lastCompleted = farrowingRecords.find((r) => r.farrowing_completed);
            if (!lastCompleted?.farrowing_completed) return null;
            const lastDate = new Date(lastCompleted.farrowing_completed);
            const daysSinceLast = Math.floor((Date.now() - lastDate.getTime()) / 86400000);
            const estimatedDaysToNext = 147 - daysSinceLast;
            return (
              <div className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20 rounded-2xl border border-indigo-200 dark:border-indigo-800 p-5">
                <div className="flex items-center gap-3 mb-2">
                  <Calendar className="h-5 w-5 text-indigo-500" />
                  <h3 className="font-semibold text-indigo-800 dark:text-indigo-200">Next Farrowing Estimate</h3>
                </div>
                <p className="text-sm text-indigo-600 dark:text-indigo-300 mb-3">
                  Last farrowing completed {daysSinceLast} day{daysSinceLast !== 1 ? 's' : ''} ago ({lastDate.toLocaleDateString()}).
                  To get accurate tracking, record the breeding date when the sow is inseminated.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="bg-white/60 dark:bg-slate-800/40 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">{daysSinceLast}d</p>
                    <p className="text-xs text-indigo-500">Since Last</p>
                  </div>
                  <div className="bg-white/60 dark:bg-slate-800/40 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">
                      {estimatedDaysToNext > 0 ? `~${estimatedDaysToNext}d` : 'Due'}
                    </p>
                    <p className="text-xs text-indigo-500">Est. Next</p>
                  </div>
                  <div className="bg-white/60 dark:bg-slate-800/40 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">P{sow.parity}</p>
                    <p className="text-xs text-indigo-500">Parity</p>
                  </div>
                </div>
                {estimatedDaysToNext <= 14 && estimatedDaysToNext > 0 && (
                  <p className="mt-3 text-sm text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4" /> Farrowing may be approaching. Record breeding date for accurate tracking.
                  </p>
                )}
              </div>
            );
          })()}

          {/* Farrowing records list */}
          <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700">
              <h3 className="font-semibold text-gray-900 dark:text-white">Farrowing History</h3>
            </div>
            {farrowingLoading ? (
              <div className="p-8 text-center text-gray-400 dark:text-slate-500">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-pink-200 border-t-pink-500 mx-auto mb-2" />
                <p className="text-sm">Loading farrowing records...</p>
              </div>
            ) : farrowingRecords.length === 0 ? (
              <div className="p-8 text-center text-gray-400 dark:text-slate-500">
                <Heart className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p>No farrowing records yet.</p>
                {sow ? (
                  <p className="mt-2 text-xs text-gray-400">
                    {sow.status === 'active' ? 'Record breeding date first, then record birth when the sow farrows.' : 'Record birth when the sow farrows.'}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-gray-400">Assign a sow to this pen to start recording</p>
                )}
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-slate-700">
                {farrowingRecords.map((rec) => (
                  <div key={rec.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/20 transition-colors">
                    <button
                      onClick={() => setExpandedRecord(expandedRecord === rec.id ? null : rec.id)}
                      className="w-full px-5 py-4 flex items-center gap-4 text-left"
                    >
                      <div className={clsx(
                        'h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0',
                        rec.farrowing_completed ? 'bg-green-100 dark:bg-green-900/30' : 'bg-pink-100 dark:bg-pink-900/30'
                      )}>
                        {rec.farrowing_completed
                          ? <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                          : <Heart className="h-5 w-5 text-pink-600 dark:text-pink-400 animate-pulse" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 dark:text-white">
                          {rec.farrowing_started
                            ? new Date(rec.farrowing_started).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                            : 'Unknown date'}
                          <span className="ml-2 text-xs text-gray-500 dark:text-slate-400">
                            {rec.farrowing_started && new Date(rec.farrowing_started).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </p>
                        <p className="text-sm text-gray-500 dark:text-slate-400">
                          {rec.born_alive ?? '?'} alive • {rec.stillborn ?? 0} stillborn • {rec.total_born ?? '?'} total
                        </p>
                      </div>
                      <span className={clsx(
                        'px-2.5 py-1 rounded-full text-xs font-medium',
                        rec.farrowing_completed
                          ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                          : 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300'
                      )}>
                        {rec.farrowing_completed ? 'Completed' : 'In Progress'}
                      </span>
                      {expandedRecord === rec.id
                        ? <ChevronUp className="h-4 w-4 text-gray-400" />
                        : <ChevronDown className="h-4 w-4 text-gray-400" />
                      }
                    </button>

                    {expandedRecord === rec.id && (
                      <div className="px-5 pb-5 pt-0 space-y-3 animate-fade-in">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                          <div className="bg-gray-50 dark:bg-slate-700/30 rounded-lg p-3">
                            <span className="text-gray-500 dark:text-slate-400 block text-xs">Born Alive</span>
                            <span className="font-bold text-green-600 dark:text-green-400 text-lg">{rec.born_alive ?? '-'}</span>
                          </div>
                          <div className="bg-gray-50 dark:bg-slate-700/30 rounded-lg p-3">
                            <span className="text-gray-500 dark:text-slate-400 block text-xs">Stillborn</span>
                            <span className="font-bold text-red-600 dark:text-red-400 text-lg">{rec.stillborn ?? 0}</span>
                          </div>
                          <div className="bg-gray-50 dark:bg-slate-700/30 rounded-lg p-3">
                            <span className="text-gray-500 dark:text-slate-400 block text-xs">Mummified</span>
                            <span className="font-bold text-gray-600 dark:text-gray-300 text-lg">{rec.mummified ?? 0}</span>
                          </div>
                          <div className="bg-gray-50 dark:bg-slate-700/30 rounded-lg p-3">
                            <span className="text-gray-500 dark:text-slate-400 block text-xs">Condition</span>
                            <span className="font-bold text-gray-600 dark:text-gray-300 text-lg capitalize">{rec.sow_condition || '-'}</span>
                          </div>
                        </div>

                        {rec.notes && (
                          <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3 text-sm text-yellow-800 dark:text-yellow-300">
                            <FileText className="inline h-4 w-4 mr-1" /> {rec.notes}
                          </div>
                        )}

                        <div className="bg-blue-50 dark:bg-blue-900/15 rounded-lg p-4 text-sm space-y-1 text-blue-700 dark:text-blue-300">
                          <div className="flex items-center gap-2 font-semibold mb-1">
                            <Sparkles className="h-4 w-4" /> Monitoring Guidelines
                          </div>
                          {(rec.born_alive ?? 0) > 14 && (
                            <p>• Large litter — ensure split-suckling and adequate teats.</p>
                          )}
                          {(rec.stillborn ?? 0) > 2 && (
                            <p>• Elevated stillborn count — review sow nutrition program.</p>
                          )}
                          <p>• Check piglet weights at day 3 and day 7 for growth uniformity.</p>
                          <p>• Ensure creep area is warm and draft-free for the first week.</p>
                          <p>• AI monitors crushing risk continuously. Alerts escalate at sustained ≥65%.</p>
                        </div>

                        {!rec.farrowing_completed && (
                          <button
                            onClick={() => handleCompleteFarrowing(rec.id)}
                            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-medium transition-all"
                          >
                            <CheckCircle className="h-4 w-4" /> Mark Farrowing Complete
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ━━━━━━━━━━━━━ TAB: DETECTIONS ━━━━━━━━━━━━━━━━ */}
      {activeTab === 'detections' && (
        <div className="space-y-5 animate-fade-in">
          <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-white">Detection Details</h3>
              {detection?.analytics && (
                <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-slate-400">
                  <span>Avg conf: {(detection.analytics.avgConfidence * 100).toFixed(0)}%</span>
                  <span>Move: {detection.analytics.movementEstimate}</span>
                  <span>Inf: {detection.inferenceTimeMs?.toFixed(0)}ms</span>
                </div>
              )}
            </div>
            <div className="p-5">
              {detection && detection.detections.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {detection.detections.map((det, idx) => {
                    const catColor = CATEGORY_COLORS[det.category] || '#9E9E9E';
                    return (
                      <div key={idx} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/20 transition-colors">
                        <div className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${catColor}20` }}>
                          {det.category === 'sow' ? <Activity className="h-5 w-5" style={{ color: catColor }} /> : <Baby className="h-5 w-5" style={{ color: catColor }} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white capitalize">{det.displayName}</p>
                          <p className="text-xs text-gray-500 dark:text-slate-400">{det.category} • {(det.confidence * 100).toFixed(0)}%</p>
                        </div>
                        <div className="w-12 bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
                          <div className="h-1.5 rounded-full" style={{ width: `${det.confidence * 100}%`, backgroundColor: catColor }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400 dark:text-slate-500">
                  <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No detections yet</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ━━━━━━━━━━━━━ TAB: BEHAVIOR PROFILE ━━━━━━━━━━━━━ */}
      {activeTab === 'behavior' && (
        <div className="space-y-5 animate-fade-in">
          <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-pink-500" />
                <h3 className="font-semibold text-gray-900 dark:text-white">Sow Behavior Profile</h3>
                <span className="text-xs text-gray-400">— this session</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                {sessionStarted && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {Math.round((Date.now() - sessionStarted) / 60000)} min
                  </span>
                )}
                <span>{totalFrames} frames</span>
                <button onClick={resetSession} className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 rounded transition-colors">
                  Reset
                </button>
              </div>
            </div>

            {profilesList.length > 0 ? (
              <>
                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {profilesList.map((profile) => (
                    <ProfileCard key={profile.className} profile={profile} />
                  ))}
                </div>

                {/* Posture distribution bar */}
                {profilesList.length > 1 && (
                  <div className="px-5 pb-5">
                    <p className="text-xs text-gray-500 dark:text-slate-400 mb-2">Posture distribution</p>
                    <div className="flex gap-0.5 h-3 rounded-full overflow-hidden">
                      {(() => {
                        const total = profilesList.reduce((s, p) => s + p.count, 0);
                        return profilesList.map((p) => (
                          <div
                            key={p.className}
                            title={`${p.posture}: ${((p.count / total) * 100).toFixed(0)}%`}
                            className="transition-all duration-500"
                            style={{ width: `${(p.count / total) * 100}%`, backgroundColor: POSTURE_COLORS[p.posture] ?? '#9E9E9E' }}
                          />
                        ));
                      })()}
                    </div>
                    <div className="flex flex-wrap gap-3 mt-2">
                      {(() => {
                        const total = profilesList.reduce((s, x) => s + x.count, 0);
                        return profilesList.map((p) => {
                          const c = POSTURE_COLORS[p.posture] ?? '#9E9E9E';
                          return (
                            <span key={p.className} className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c }} />
                              {p.posture} {((p.count / total) * 100).toFixed(0)}%
                            </span>
                          );
                        });
                      })()}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="p-8 text-center text-gray-400 dark:text-slate-500">
                <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No behavior data yet — start a detection session</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" /> {error}
        </div>
      )}

      <PageInfoModal 
        isOpen={isInfoOpen}
        onClose={() => setIsInfoOpen(false)}
        title="Test Pen Sandbox"
        section="test_pen"
        steps={[
          "Sandbox Simulator: Upload an mp4 file or an image to run a complete simulated detection pass mirroring the edge agent.",
          "Bounding Box Overlays: Verify the visual fidelity of YOLOv8s' bounding boxes representing `sow`, `piglet`, and `posture` logic.",
          "Farrowing Emulation: Toggle farrowing active to monitor how the state machine reacts to simulated rapid piglet growth.",
          "Event Analytics: Track historical frames simulated in real-time or fast-forward modes."
        ]}
      />
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

// ── Live Monitor Sub-components ─────────────────────────────────────────────

function LiveStatCard({ icon, label, value, sub, status }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  status: 'good' | 'warning' | 'critical';
}) {
  const borderColor = status === 'critical' ? 'border-red-300 dark:border-red-700'
    : status === 'warning' ? 'border-amber-300 dark:border-amber-700'
    : 'border-gray-200 dark:border-slate-700';
  return (
    <div className={clsx('bg-white dark:bg-slate-800/60 rounded-xl border p-3 transition-all', borderColor)}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-gray-500 dark:text-slate-400 font-medium">{label}</span>
      </div>
      <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-xs text-gray-400 dark:text-slate-500 truncate">{sub}</p>
    </div>
  );
}

function MiniSparkline({ data, expected, color, warningColor, height = 50, isPercentage = false }: {
  data: number[];
  expected: number;
  color: string;
  warningColor: string;
  height?: number;
  isPercentage?: boolean;
}) {
  if (data.length < 2) return null;
  
  const maxVal = Math.max(...data, expected * 1.2);
  const minVal = Math.min(...data, 0);
  const range = maxVal - minVal || 1;
  
  // Downsample to max 120 points for performance
  const maxPoints = 120;
  const step = Math.max(1, Math.floor(data.length / maxPoints));
  const sampled = data.filter((_, i) => i % step === 0);
  
  const w = 100;
  const h = height;
  const points = sampled.map((v, i) => {
    const x = (i / (sampled.length - 1)) * w;
    const y = h - ((v - minVal) / range) * h;
    return `${x},${y}`;
  });
  
  const expectedY = h - ((expected - minVal) / range) * h;
  
  // Area fill
  const areaPoints = [`0,${h}`, ...points, `${w},${h}`].join(' ');
  
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: `${height}px` }} preserveAspectRatio="none">
      {/* Expected line */}
      <line x1="0" y1={expectedY} x2={w} y2={expectedY} stroke={warningColor} strokeWidth="0.3" strokeDasharray="2,2" opacity="0.5" />
      {/* Area fill */}
      <polygon points={areaPoints} fill={color} opacity="0.1" />
      {/* Line */}
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="0.5" />
      {/* Latest point */}
      {sampled.length > 0 && (() => {
        const lastX = w;
        const lastY = h - ((sampled[sampled.length - 1] - minVal) / range) * h;
        const isBelow = !isPercentage ? sampled[sampled.length - 1] < expected : sampled[sampled.length - 1] > expected;
        return <circle cx={lastX} cy={lastY} r="1.5" fill={isBelow ? warningColor : color} />;
      })()}
      {/* Labels */}
      <text x="1" y={expectedY - 1} fill={warningColor} fontSize="3" opacity="0.7">
        {isPercentage ? `${expected}%` : expected}
      </text>
    </svg>
  );
}

function PostureTimelineBar({ segments }: { segments: import('@/store/simulationStore').PostureSegment[] }) {
  if (segments.length === 0) return null;
  
  const totalDuration = segments.reduce((sum, s) => sum + s.durationMs, 0);
  if (totalDuration === 0) return null;
  
  return (
    <div className="flex gap-px h-5 rounded-lg overflow-hidden">
      {segments.map((seg, i) => {
        const pct = (seg.durationMs / totalDuration) * 100;
        if (pct < 0.5) return null;
        const posture = seg.posture.replace(/-/g, ' ').replace(/sow\s*/i, '').trim() || 'unknown';
        const color = POSTURE_COLORS[posture] ?? POSTURE_COLORS[seg.posture] ?? '#9E9E9E';
        return (
          <div
            key={i}
            title={`${posture}: ${(seg.durationMs / 1000).toFixed(0)}s (${pct.toFixed(0)}%)`}
            className="transition-all duration-300 cursor-pointer hover:opacity-80"
            style={{ width: `${pct}%`, backgroundColor: color, minWidth: '2px' }}
          />
        );
      })}
    </div>
  );
}

function EventFeedItem({ event }: { event: SimulationEvent }) {
  const iconMap: Record<string, React.ReactNode> = {
    posture_change: <Activity className="h-3.5 w-3.5 text-blue-500" />,
    nursing_start: <Heart className="h-3.5 w-3.5 text-purple-500" />,
    nursing_end: <Heart className="h-3.5 w-3.5 text-purple-400" />,
    feeding_start: <Zap className="h-3.5 w-3.5 text-green-500" />,
    feeding_end: <Zap className="h-3.5 w-3.5 text-green-400" />,
    piglet_count_drop: <ArrowDown className="h-3.5 w-3.5 text-red-500" />,
    piglet_count_recovered: <ArrowUp className="h-3.5 w-3.5 text-green-500" />,
    risk_escalation: <AlertTriangle className="h-3.5 w-3.5 text-red-600" />,
    risk_deescalation: <Shield className="h-3.5 w-3.5 text-green-500" />,
    cross_pen_detection: <Target className="h-3.5 w-3.5 text-amber-500" />,
    activity_alert: <Clock className="h-3.5 w-3.5 text-amber-500" />,
    health_warning: <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />,
    session_start: <Radio className="h-3.5 w-3.5 text-green-500" />,
    session_end: <StopCircle className="h-3.5 w-3.5 text-gray-500" />,
  };

  const severityBg = {
    info: 'bg-white dark:bg-slate-800/40',
    warning: 'bg-amber-50/50 dark:bg-amber-900/10',
    critical: 'bg-red-50/50 dark:bg-red-900/10',
  };

  const timeAgo = Math.round((Date.now() - event.timestamp) / 1000);
  const timeLabel = timeAgo < 60 ? `${timeAgo}s ago` : `${Math.floor(timeAgo / 60)}m ago`;

  return (
    <div className={clsx('px-3 py-2.5 transition-colors', severityBg[event.severity])}>
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex-shrink-0">
          {iconMap[event.type] || <Bell className="h-3.5 w-3.5 text-gray-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{event.title}</p>
            <span className="text-[10px] text-gray-400 dark:text-slate-500 flex-shrink-0">{timeLabel}</span>
          </div>
          <p className="text-[11px] text-gray-500 dark:text-slate-400 leading-relaxed mt-0.5">{event.description}</p>
          {event.videoTime > 0 && (
            <span className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5 inline-block">
              @ {event.videoTime.toFixed(1)}s in video
            </span>
          )}
        </div>
        {event.severity !== 'info' && (
          <span className={clsx(
            'px-1.5 py-0.5 rounded text-[9px] font-bold flex-shrink-0 mt-0.5',
            event.severity === 'critical' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
          )}>
            {event.severity.toUpperCase()}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Original Sub-components ─────────────────────────────────────────────────

function TypewriterText({ text, speed = 18, className }: { text: string; speed?: number; className?: string }) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  const hasAnimated = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (hasAnimated.current) {
      setDisplayed(text);
      setDone(true);
      return;
    }
    hasAnimated.current = true;
    setDisplayed(''); setDone(false);
    let index = 0;
    const type = () => {
      if (index < text.length) {
        index++;
        setDisplayed(text.slice(0, index));
        timerRef.current = setTimeout(type, speed);
      } else { setDone(true); }
    };
    timerRef.current = setTimeout(type, speed);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [text, speed]);

  return (
    <span className={className}>
      {displayed}
      {!done && <span className="inline-block w-0.5 h-3.5 bg-current ml-0.5 align-middle animate-[blink_0.7s_step-end_infinite]" />}
    </span>
  );
}

function InsightCard({ status, icon, label, value, detail }: {
  status: 'good' | 'warning' | 'critical';
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  const colorMap = {
    good: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800',
    warning: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
    critical: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
  };
  return (
    <div className={clsx('rounded-xl border p-4 transition-all duration-200 hover:shadow-md', colorMap[status])}>
      <div className="flex items-center gap-3 mb-2">
        {icon}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider opacity-70">{label}</p>
          <p className="text-lg font-bold capitalize">{value}</p>
        </div>
      </div>
      <p className="text-xs leading-relaxed opacity-80"><TypewriterText text={detail} speed={14} /></p>
    </div>
  );
}

// ─── Farrowing Engine Panel (TestPen) ──────────────────────────────────────────

const TEST_STATE_CONFIG: Record<string, { label: string; color: string; bg: string; description: string }> = {
  NORMAL_MONITORING: {
    label: 'Normal Monitoring',
    color: 'text-green-700 dark:text-green-300',
    bg: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    description: 'Routine behavior monitoring. Prediction module running every 60 min.',
  },
  PREDICTION_HIGH: {
    label: 'Prediction: HIGH',
    color: 'text-amber-700 dark:text-amber-300',
    bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700',
    description: 'Sow likely to farrow within 6–12 hours. Monitoring interval: 30 min.',
  },
  FARROWING_STARTED: {
    label: 'Farrowing Started!',
    color: 'text-red-700 dark:text-red-200',
    bg: 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700 animate-pulse',
    description: 'First piglet detected. Transitioning to active farrowing mode.',
  },
  FARROWING_ACTIVE: {
    label: 'Farrowing Active',
    color: 'text-red-700 dark:text-red-200',
    bg: 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700',
    description: 'Actively counting piglets. Monitoring for births and crushing risks.',
  },
  FARROWING_COMPLETED: {
    label: 'Farrowing Completed',
    color: 'text-blue-700 dark:text-blue-300',
    bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    description: 'Farrowing complete. Will reset to normal monitoring in 2 hours.',
  },
};

function FarrowingEnginePanelTest({
  state,
  prediction,
  activeSession,
  alerts,
  safetyChecks,
  completedSessions,
  noNewPigletSinceMs,
  monitoringInterval,
  restlessnessResult,
  likelihoodResult,
  stagnationResult,
  trendData,
}: {
  state: FarrowingSystemState;
  prediction: { postureTransitionsPerHour: number; nestingCountPerHour: number; percentTimeLying: number; activityScore: number; farrowingProbability: string };
  activeSession: { totalBorn: number; crushingIncidents: number; startedAt: number; birthEvents: Array<{ pigletNumber: number; detectedAt: number; confidence: number }> } | null;
  alerts: Array<{ id: string; timestamp: number; type: string; severity: string; message: string }>;
  safetyChecks: Array<{ timestamp: number; type: string; description: string; severity: string }>;
  completedSessions: Array<{ id: string; totalBorn: number; durationMinutes?: number; crushingIncidents: number }>;
  noNewPigletSinceMs: number;
  monitoringInterval: number;
  restlessnessResult: { score: number; level: string; color: string };
  likelihoodResult: { score: number; label: string; color: string };
  stagnationResult: { level: string; color: string; bg: string; message: string; pulse: boolean };
  trendData: Array<{ time: string; restlessness: number; likelihood: number }>;
}) {
  const cfg = TEST_STATE_CONFIG[state] || TEST_STATE_CONFIG.NORMAL_MONITORING;
  const recentAlerts = alerts.slice(0, 5);
  const recentSafety = safetyChecks.slice(-3);
  const [showGuide, setShowGuide] = useState(false);
  const [showMetrics, setShowMetrics] = useState(false);

  return (
    <div className={clsx('rounded-2xl border-2 p-5 space-y-4', cfg.bg)}>
      {/* State Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className={clsx(
              'h-10 w-10 rounded-full flex items-center justify-center',
              state === 'FARROWING_ACTIVE' || state === 'FARROWING_STARTED' ? 'bg-red-100 dark:bg-red-800/50' :
              state === 'PREDICTION_HIGH' ? 'bg-amber-100 dark:bg-amber-800/50' :
              state === 'FARROWING_COMPLETED' ? 'bg-blue-100 dark:bg-blue-800/50' :
              'bg-green-100 dark:bg-green-800/50'
            )}>
              {state === 'FARROWING_ACTIVE' || state === 'FARROWING_STARTED' ? (
                <Baby className="h-5 w-5 text-red-600" />
              ) : state === 'PREDICTION_HIGH' ? (
                <TrendingUp className="h-5 w-5 text-amber-600" />
              ) : state === 'FARROWING_COMPLETED' ? (
                <CheckCircle className="h-5 w-5 text-blue-600" />
              ) : (
                <Eye className="h-5 w-5 text-green-600" />
              )}
            </div>
            {(state === 'FARROWING_ACTIVE' || state === 'FARROWING_STARTED') && (
              <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-red-500 animate-ping" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className={clsx('font-bold text-sm', cfg.color)}>{cfg.label}</h3>
              {/* Info tooltip */}
              <div className="relative" onMouseEnter={() => setShowGuide(true)} onMouseLeave={() => setShowGuide(false)}>
                <button title="Monitoring states guide" className="h-4 w-4 rounded-full bg-gray-200 dark:bg-slate-600 flex items-center justify-center hover:bg-gray-300 dark:hover:bg-slate-500 transition-colors">
                  <Info className="h-2.5 w-2.5 text-gray-500 dark:text-slate-300" />
                </button>
                {showGuide && (
                  <div className="absolute left-0 top-6 z-50 w-72 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-200 dark:border-slate-700 p-3.5 space-y-2 text-xs">
                    <p className="font-semibold text-gray-900 dark:text-white text-sm">Monitoring States Guide</p>
                    <div className="space-y-1.5">
                      <div><span className="font-semibold text-green-600">Normal Monitoring</span> — Routine observation. The system checks sow behavior every 60 min and runs prediction models in the background.</div>
                      <div><span className="font-semibold text-amber-600">Prediction: HIGH</span> — The model predicts farrowing within 6–12 hours based on nesting behavior and posture changes. Monitoring interval tightens to 30 min.</div>
                      <div><span className="font-semibold text-red-600">Farrowing Started</span> — First piglet detected! The system transitions into active birth monitoring automatically.</div>
                      <div><span className="font-semibold text-red-600">Farrowing Active</span> — Actively tracking each birth, counting piglets, and monitoring crushing risk in real time.</div>
                      <div><span className="font-semibold text-blue-600">Farrowing Completed</span> — No new piglets detected for a sustained period. The system logs the session and resets to normal monitoring after 2 hours.</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-slate-400">{cfg.description}</p>
          </div>
        </div>

        {/* State Flow Indicator */}
        <div className="hidden sm:flex items-center gap-1 text-[9px] font-mono">
          {['NORMAL_MONITORING', 'PREDICTION_HIGH', 'FARROWING_STARTED', 'FARROWING_ACTIVE', 'FARROWING_COMPLETED'].map((s, i) => (
            <div key={s} className="flex items-center gap-1">
              <span className={clsx(
                'px-1.5 py-0.5 rounded',
                s === state ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold' : 'bg-gray-200 dark:bg-slate-700 text-gray-500 dark:text-slate-400'
              )}>
                {s.split('_').map(w => w[0]).join('')}
              </span>
              {i < 4 && <span className="text-gray-300 dark:text-slate-600">→</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Prediction Metrics */}
      {(state === 'NORMAL_MONITORING' || state === 'PREDICTION_HIGH') && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white/70 dark:bg-slate-800/40 rounded-xl px-3 py-2">
            <p className="text-[10px] text-gray-500 dark:text-slate-400 uppercase tracking-wider">Posture Trans/hr</p>
            <p className={clsx('text-lg font-bold', prediction.postureTransitionsPerHour > 20 ? 'text-red-600' : 'text-gray-900 dark:text-white')}>
              {prediction.postureTransitionsPerHour}
            </p>
            <p className="text-[9px] text-gray-400">threshold: 20</p>
          </div>
          <div className="bg-white/70 dark:bg-slate-800/40 rounded-xl px-3 py-2">
            <p className="text-[10px] text-gray-500 dark:text-slate-400 uppercase tracking-wider">Posture Switching/hr</p>
            <p className={clsx('text-lg font-bold', prediction.nestingCountPerHour > 5 ? 'text-red-600' : 'text-gray-900 dark:text-white')}>
              {prediction.nestingCountPerHour}
            </p>
            <p className="text-[9px] text-gray-400">threshold: 5</p>
          </div>
          <div className="bg-white/70 dark:bg-slate-800/40 rounded-xl px-3 py-2">
            <p className="text-[10px] text-gray-500 dark:text-slate-400 uppercase tracking-wider">% Time Lying</p>
            <p className={clsx('text-lg font-bold', prediction.percentTimeLying > 50 ? 'text-amber-600' : 'text-gray-900 dark:text-white')}>
              {prediction.percentTimeLying.toFixed(0)}%
            </p>
            <p className="text-[9px] text-gray-400">threshold: 50%</p>
          </div>
          <div className="bg-white/70 dark:bg-slate-800/40 rounded-xl px-3 py-2">
            <p className="text-[10px] text-gray-500 dark:text-slate-400 uppercase tracking-wider">Eval Interval</p>
            <p className="text-lg font-bold text-gray-900 dark:text-white">{monitoringInterval}m</p>
            <p className="text-[9px] text-gray-400">prob: {prediction.farrowingProbability}</p>
          </div>
        </div>
      )}

      {/* ── Collapsible: Restlessness + Likelihood + Trend ────────────── */}
      {(state === 'NORMAL_MONITORING' || state === 'PREDICTION_HIGH') && (
        <div className="bg-white/70 dark:bg-slate-800/40 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          {/* Toggle header — always visible */}
          <button
            onClick={() => setShowMetrics((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors"
            title="Toggle advanced metrics"
          >
            <div className="flex items-center gap-3">
              <Activity className="h-4 w-4 text-indigo-500" />
              <span className="text-xs font-semibold text-gray-700 dark:text-slate-300">Advanced Metrics</span>
              {/* Compact badges when collapsed */}
              {!showMetrics && (
                <div className="flex items-center gap-2 ml-1">
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: `${restlessnessResult.color}15`, color: restlessnessResult.color }}>
                    Rest: {restlessnessResult.score}
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: `${likelihoodResult.color}15`, color: likelihoodResult.color }}>
                    Likelihood: {likelihoodResult.score}%
                  </span>
                </div>
              )}
            </div>
            {showMetrics
              ? <ChevronUp className="h-4 w-4 text-gray-400" />
              : <ChevronDown className="h-4 w-4 text-gray-400" />
            }
          </button>

          {/* Expanded content */}
          {showMetrics && (
            <div className="px-4 pb-4 pt-1 space-y-3">
              {/* 1️⃣ Restlessness Score + 2️⃣ Numeric Likelihood % */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Restlessness Score */}
                <div className="bg-gray-50 dark:bg-slate-800/60 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-gray-500 dark:text-slate-400 uppercase tracking-wider font-semibold">Restlessness Score</p>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${restlessnessResult.color}20`, color: restlessnessResult.color }}>
                      {restlessnessResult.level}
                    </span>
                  </div>
                  <div className="flex items-end gap-2">
                    <p className="text-3xl font-black" style={{ color: restlessnessResult.color }}>{restlessnessResult.score}</p>
                    <span className="text-sm text-gray-400 mb-1">/ 100</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
                    <div className="h-2 rounded-full transition-all duration-700" style={{ width: `${restlessnessResult.score}%`, backgroundColor: restlessnessResult.color }} />
                  </div>
                  <div className="flex justify-between text-[9px] text-gray-400">
                    <span>0 – Calm</span><span>30 – Active</span><span>60 – Restless</span><span>80+ Critical</span>
                  </div>
                </div>

                {/* Numeric Farrowing Likelihood % */}
                <div className="bg-gray-50 dark:bg-slate-800/60 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-gray-500 dark:text-slate-400 uppercase tracking-wider font-semibold">Farrowing Likelihood</p>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${likelihoodResult.color}20`, color: likelihoodResult.color }}>
                      {likelihoodResult.label}
                    </span>
                  </div>
                  <div className="flex items-end gap-2">
                    <p className="text-3xl font-black" style={{ color: likelihoodResult.color }}>{likelihoodResult.score}%</p>
                    <span className="text-sm text-gray-400 mb-1">({likelihoodResult.label})</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
                    <div className="h-2 rounded-full transition-all duration-700" style={{ width: `${likelihoodResult.score}%`, backgroundColor: likelihoodResult.color }} />
                  </div>
                  <div className="flex justify-between text-[9px] text-gray-400">
                    <span>0% – Low</span><span>30% – Moderate</span><span>60%+ – High</span>
                  </div>
                </div>
              </div>

              {/* 4️⃣ Mini Trend Chart */}
              {trendData.length >= 2 && (
                <div className="bg-gray-50 dark:bg-slate-800/60 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-gray-500 dark:text-slate-400 uppercase tracking-wider font-semibold">Live Trend</p>
                    <span className="text-[9px] text-gray-400">{trendData.length} data points • 30s interval</span>
                  </div>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                      <XAxis dataKey="time" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 9 }} width={30} />
                      <RechartsTooltip
                        contentStyle={{ fontSize: 11, borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,.1)' }}
                        labelStyle={{ fontWeight: 600 }}
                      />
                      <Line type="monotone" dataKey="restlessness" stroke="#F59E0B" strokeWidth={2} dot={false} name="Restlessness" />
                      <Line type="monotone" dataKey="likelihood" stroke="#DC2626" strokeWidth={2} dot={false} name="Likelihood %" />
                    </LineChart>
                  </ResponsiveContainer>
                  <div className="flex justify-center gap-6 text-[10px]">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-amber-500 rounded" /> Restlessness</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-red-600 rounded" /> Likelihood %</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Active Farrowing Session */}
      {activeSession && (state === 'FARROWING_ACTIVE' || state === 'FARROWING_STARTED') && (
        <div className="bg-white/70 dark:bg-slate-800/40 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm text-gray-900 dark:text-white">Active Birth Session</h4>
            <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-2 py-0.5 rounded-full font-medium">
              {Math.round((Date.now() - activeSession.startedAt) / 60000)} min elapsed
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-2xl font-bold text-green-600">{activeSession.totalBorn}</p>
              <p className="text-[10px] text-gray-500 uppercase">Piglets Born</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">{activeSession.crushingIncidents}</p>
              <p className="text-[10px] text-gray-500 uppercase">Crush Alerts</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-600">
                {noNewPigletSinceMs > 0 ? `${Math.round(noNewPigletSinceMs / 60000)}m` : '—'}
              </p>
              <p className="text-[10px] text-gray-500 uppercase">Since Last</p>
            </div>
          </div>
          {/* ── 3️⃣ Stagnation Escalation Alert ───────────────────────── */}
          {noNewPigletSinceMs > 0 && stagnationResult.level !== 'NORMAL' && (
            <div className={clsx(
              'rounded-xl px-4 py-3 flex items-start gap-3 border',
              stagnationResult.bg,
              stagnationResult.pulse && 'animate-pulse',
              stagnationResult.level === 'EMERGENCY' ? 'border-red-500' :
              stagnationResult.level === 'CRITICAL' ? 'border-red-300 dark:border-red-700' :
              'border-amber-300 dark:border-amber-700'
            )}>
              <div className={clsx(
                'h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                stagnationResult.level === 'EMERGENCY' ? 'bg-red-800' :
                stagnationResult.level === 'CRITICAL' ? 'bg-red-200 dark:bg-red-800/50' :
                'bg-amber-200 dark:bg-amber-800/50'
              )}>
                <AlertTriangle className={clsx(
                  'h-4 w-4',
                  stagnationResult.level === 'EMERGENCY' ? 'text-white' :
                  stagnationResult.level === 'CRITICAL' ? 'text-red-600' :
                  'text-amber-600'
                )} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className={clsx(
                    'text-xs font-bold uppercase tracking-wider',
                    stagnationResult.color
                  )}>
                    Stagnation: {stagnationResult.level}
                  </span>
                  <span className="text-[10px] opacity-60">{Math.round(noNewPigletSinceMs / 60000)} min since last piglet</span>
                </div>
                <p className={clsx('text-xs mt-1 leading-relaxed', stagnationResult.color)}>
                  {stagnationResult.message}
                </p>
              </div>
            </div>
          )}

          {/* Birth Timeline */}
          {activeSession.birthEvents.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] text-gray-500 dark:text-slate-400 uppercase tracking-wider">Birth Timeline</p>
              <div className="flex flex-wrap gap-1">
                {activeSession.birthEvents.map((e, i) => (
                  <span key={i} className="inline-flex items-center gap-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-[10px] px-2 py-0.5 rounded-full">
                    #{e.pigletNumber} • {new Date(e.detectedAt).toLocaleTimeString()} • {(e.confidence * 100).toFixed(0)}%
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Completed Session Summary */}
      {state === 'FARROWING_COMPLETED' && completedSessions.length > 0 && (() => {
        const last = completedSessions[completedSessions.length - 1];
        return (
          <div className="bg-white/70 dark:bg-slate-800/40 rounded-xl p-4">
            <h4 className="font-semibold text-sm text-gray-900 dark:text-white mb-2">Farrowing Summary</h4>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-2xl font-bold text-green-600">{last.totalBorn}</p>
                <p className="text-[10px] text-gray-500 uppercase">Total Born</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-600">{last.durationMinutes ?? '—'}</p>
                <p className="text-[10px] text-gray-500 uppercase">Minutes</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">{last.crushingIncidents}</p>
                <p className="text-[10px] text-gray-500 uppercase">Crush Events</p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Safety Alerts */}
      {recentSafety.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-gray-500 dark:text-slate-400 uppercase tracking-wider font-semibold">Safety Checks</p>
          {recentSafety.map((s, i) => (
            <div key={i} className={clsx(
              'rounded-lg px-3 py-2 text-xs flex items-center gap-2',
              s.severity === 'critical' ? 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300' : 'bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
            )}>
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{s.description}</span>
            </div>
          ))}
        </div>
      )}

      {/* Recent Farrowing Alerts */}
      {recentAlerts.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-gray-500 dark:text-slate-400 uppercase tracking-wider font-semibold">Engine Alerts</p>
          {recentAlerts.map((a) => (
            <div key={a.id} className={clsx(
              'rounded-lg px-3 py-2 text-xs flex items-start gap-2',
              a.severity === 'critical' ? 'bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-300' :
              a.severity === 'warning' ? 'bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-300' :
              'bg-gray-50 dark:bg-slate-800/30 text-gray-600 dark:text-slate-400'
            )}>
              <Bell className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">{a.message}</p>
                <p className="text-[10px] opacity-60 mt-0.5">{new Date(a.timestamp).toLocaleTimeString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProfileCard({ profile }: { profile: SowBehaviorProfile }) {
  const avgConf = profile.totalConfidence / profile.count;
  const durationSec = Math.round((profile.lastSeen - profile.firstSeen) / 1000);
  const color = POSTURE_COLORS[profile.posture] ?? '#9E9E9E';
  return (
    <div className="bg-white dark:bg-slate-800/40 rounded-xl p-4 border border-gray-100 dark:border-slate-700 hover:shadow-md transition-all">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-gray-900 dark:text-white">{profile.displayName}</span>
        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: `${color}25`, color }}>{profile.posture}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
        <div>
          <p className="text-gray-500 dark:text-slate-400">Detections</p>
          <p className="font-bold text-gray-900 dark:text-white text-sm">{profile.count}</p>
        </div>
        <div>
          <p className="text-gray-500 dark:text-slate-400">Avg Conf</p>
          <p className="font-bold text-gray-900 dark:text-white text-sm">{(avgConf * 100).toFixed(0)}%</p>
        </div>
        <div>
          <p className="text-gray-500 dark:text-slate-400">Duration</p>
          <p className="font-bold text-gray-900 dark:text-white text-sm">
            {durationSec >= 60 ? `${Math.floor(durationSec / 60)}m ${durationSec % 60}s` : `${durationSec}s`}
          </p>
        </div>
        <div>
          <p className="text-gray-500 dark:text-slate-400">Last seen</p>
          <p className="font-bold text-gray-900 dark:text-white text-xs">{Math.round((Date.now() - profile.lastSeen) / 1000)}s ago</p>
        </div>
      </div>
      <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
        <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${avgConf * 100}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}
