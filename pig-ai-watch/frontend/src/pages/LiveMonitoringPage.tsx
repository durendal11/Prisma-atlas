import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RTSPVideoFeed, RiskGauge, SystemTour, TourButton, type TourStep } from '@/components';
import { usePenStatus } from '@/hooks';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useDetectionStore } from '@/store';
import { pensApi } from '@/api';
import { 
  Maximize2, Grid, LayoutGrid, RefreshCw, Sliders, Eye, Zap, Plus, X, MapPin, 
  Video, LayoutDashboard, Smartphone, Monitor, ShieldAlert, 
  Baby, ChevronDown, ChevronUp, Search
} from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { PageSkeleton, useLoading } from '@/components/ui/Skeleton';
import { PageInfoButton, PageInfoModal } from '@/components/ui/PageInfoModal';
import { useDeviceMode } from '@/hooks/useDeviceMode';

type LayoutType = '2x2' | '3x2' | '1x1';

export default function LiveMonitoringPage() {
  const [layout, setLayout] = useState<LayoutType>('2x2');
  const [selectedPen, setSelectedPen] = useState<string | null>(null);
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(0.25);
  const [useClientDetection, setUseClientDetection] = useState<boolean>(true);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showBoundingBoxes, setShowBoundingBoxes] = useState<boolean>(true);
  const [detectionFrameSkip, setDetectionFrameSkip] = useState<number>(5); // Default to smooth video
  const [visiblePens, setVisiblePens] = useState<Set<string>>(new Set());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [searchParams] = useSearchParams();
  const [isTourOpen, setIsTourOpen] = useState(false);
  const { isDesktop, isMobile, preference, setSimulatedMode } = useDeviceMode();
  const [mobileFilter, setMobileFilter] = useState<'all' | 'high-risk' | 'farrowing'>('all');
  const [mobileSearch, setMobileSearch] = useState<string>('');
  const [expandedPenId, setExpandedPenId] = useState<string | null>(null);
  const { data: penStatuses, refetch, isRefetching, isLoading: isPenLoading } = usePenStatus();
  
  const { isLoading, finishLoading } = useLoading(true, 800);

  useEffect(() => {
    if (!isPenLoading) finishLoading();
  }, [isPenLoading, finishLoading]);
  const selectedPenDetection = useDetectionStore(
    useCallback(
      (state) => (selectedPen ? state.latestDetections[selectedPen] ?? null : null),
      [selectedPen],
    ),
  );
  const navigate = useNavigate();

  useEffect(() => {
    const paramTour = searchParams.get('tour');
    if (paramTour === 'true' || paramTour === '1') {
      setIsTourOpen(true);
    }
  }, [searchParams]);

  const MONITORING_TOUR_STEPS: TourStep[] = useMemo(() => [
    {
      targetId: 'tour-monitoring-header',
      title: '1. Multi-Pen Live Monitoring',
      badge: 'Live Step: Barn Grid',
      description: 'Observe all farrowing pens across your facility in real-time. Each card displays sub-second video feeds powered by edge streaming with YOLOv11 detection overlays.',
      actionHint: 'Notice the live pens count and quick controls.',
      placement: 'bottom',
    },
    {
      targetId: 'tour-monitoring-layout',
      title: '2. Multi-Camera Layout Matrix',
      badge: 'Layout Controls',
      description: 'Switch between a 2x2 grid, a 3x2 matrix for larger facilities, or a 1x1 focused view. Customize your workspace layout to match active farrowing pens.',
      placement: 'bottom',
    },
    {
      targetId: 'tour-monitoring-controls',
      title: '3. Detection Settings & FPS Controls',
      badge: 'Vision Controls',
      description: 'Adjust detection confidence thresholds, frame-skipping presets (Quality vs Performance), and YOLOv11 bounding box overlays directly on live streams.',
      placement: 'bottom',
    },
    {
      targetId: 'tour-monitoring-grid',
      title: '4. Live Barn Camera Feeds',
      badge: 'Real-Time Feeds',
      description: 'Each pen card renders live video with active piglet counts, sow postures, and crushing risk badges. Pens with elevated crushing risk highlight in amber or red.',
      placement: 'top',
    },
    {
      targetId: 'tour-monitoring-grid',
      title: '5. Enter Dedicated Pen Live Stream',
      badge: 'Drill Down to Pen',
      description: 'Click any pen card to open its dedicated Pen Live Stream (/pen/:id). In the dedicated livestream, you get sub-second WebRTC feeds, audible alarm triggers, farrowing progress, and caretaker intervention logging.',
      actionHint: 'Click below to enter the live stream for Pen #1!',
      placement: 'top',
      actionButton: {
        label: `Open Pen #${penStatuses?.[0]?.pen_id || 1} Live Stream ➔`,
        onClick: () => navigate(`/pen/${penStatuses?.[0]?.pen_id || 1}?tour=true`),
      },
    },
  ], [navigate, penStatuses]);
  const [showAddPen, setShowAddPen] = useState(false);
  const [addPenForm, setAddPenForm] = useState({ name: '', location: '', camera_source: '' });
  const [addingPen, setAddingPen] = useState(false);

  const handleAddPen = async () => {
    if (!addPenForm.name.trim()) {
      toast.error('Pen name is required');
      return;
    }
    setAddingPen(true);
    try {
      await pensApi.create({
        name: addPenForm.name.trim(),
        location: addPenForm.location.trim() || undefined,
        camera_source: addPenForm.camera_source.trim() || undefined,
      });
      toast.success(`Pen "${addPenForm.name.trim()}" created`);
      setShowAddPen(false);
      setAddPenForm({ name: '', location: '', camera_source: '' });
      refetch();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to create pen';
      toast.error(msg);
    } finally {
      setAddingPen(false);
    }
  };

  // Connect to WebSocket
  useWebSocket();

  // Setup IntersectionObserver to track which pens are visible
  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        setVisiblePens((prev) => {
          const newSet = new Set(prev);
          entries.forEach((entry) => {
            const penId = entry.target.getAttribute('data-pen-id');
            if (penId) {
              if (entry.isIntersecting) {
                newSet.add(penId);
              } else {
                newSet.delete(penId);
              }
            }
          });
          return newSet;
        });
      },
      { threshold: 0.1 } // Trigger when at least 10% visible
    );

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  // Performance mode presets
  const setPerformanceMode = (mode: 'quality' | 'balanced' | 'performance') => {
    switch (mode) {
      case 'quality':
        setDetectionFrameSkip(2); // Detect every 2nd frame - frequent updates
        setShowBoundingBoxes(true);
        break;
      case 'balanced':
        setDetectionFrameSkip(5); // Detect every 5th frame - smooth video, regular updates
        setShowBoundingBoxes(true);
        break;
      case 'performance':
        setDetectionFrameSkip(10); // Detect every 10th frame - maximum smoothness
        setShowBoundingBoxes(false); // Hide boxes for extra speed
        break;
    }
  };

  const layoutConfig = {
    '2x2': 'grid-cols-1 md:grid-cols-2',
    '3x2': 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    '1x1': 'grid-cols-1',
  };

  const activeDetection = selectedPenDetection;

  const highRiskCount = useMemo(() => {
    return penStatuses?.filter((p) => (p.crushing_risk ?? 0) >= 0.4).length ?? 0;
  }, [penStatuses]);

  const farrowingCount = useMemo(() => {
    return penStatuses?.filter((p) => {
      const post = (p.sow_posture ?? '').toLowerCase();
      return post.includes('lactat') || post.includes('nurs');
    }).length ?? 0;
  }, [penStatuses]);

  const filteredPens = useMemo(() => {
    if (!penStatuses) return [];
    return penStatuses.filter((pen) => {
      if (mobileSearch.trim()) {
        const q = mobileSearch.toLowerCase();
        const matchName = pen.pen_name.toLowerCase().includes(q);
        const matchTag = pen.sow_tag?.toLowerCase().includes(q);
        if (!matchName && !matchTag) return false;
      }
      if (mobileFilter === 'high-risk') {
        return (pen.crushing_risk ?? 0) >= 0.4;
      }
      if (mobileFilter === 'farrowing') {
        const posture = (pen.sow_posture ?? '').toLowerCase();
        return posture.includes('lactat') || posture.includes('nurs');
      }
      return true;
    });
  }, [penStatuses, mobileSearch, mobileFilter]);

  if (selectedPen) {
    const pen = penStatuses?.find(p => p.pen_id.toString() === selectedPen);
    
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="animate-slide-in-left">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {pen?.pen_name || `Pen ${selectedPen}`}
            </h1>
            <p className="text-gray-500 dark:text-slate-400">Full screen monitoring view</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(`/pen/${selectedPen}`)}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
            >
              Open Pen Details →
            </button>
            <button
              onClick={() => setSelectedPen(null)}
              className="px-4 py-2 bg-gray-100 dark:bg-slate-700/50 hover:bg-gray-200 dark:hover:bg-slate-600/50 text-gray-700 dark:text-slate-300 rounded-lg transition-all duration-200 hover:-translate-y-0.5"
            >
              Back to Grid
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main video */}
          <div className="lg:col-span-3">
            <RTSPVideoFeed
              penId={selectedPen}
              penName={pen?.pen_name || `Pen ${selectedPen}`}
              sowTag={pen?.sow_tag || undefined}
              showStats={false}
              className="aspect-video"
              confidenceThreshold={confidenceThreshold}
              useClientDetection={useClientDetection}
              showBoundingBoxes={showBoundingBoxes}
              detectionFrameSkip={detectionFrameSkip}
              isVisible={true} // Always visible in fullscreen
            />
          </div>

          {/* Stats sidebar */}
          <div className="space-y-4">
            {/* Piglet Count */}
            <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-700/50 p-5 hover:shadow-md dark:hover:shadow-dark-lg transition-all duration-300 hover:-translate-y-0.5">
              <h3 className="text-sm font-medium text-gray-500 dark:text-slate-400 mb-2">Piglet Count</h3>
              <p className="text-4xl font-bold text-gray-900 dark:text-white">
                {activeDetection?.data?.piglet_count || pen?.piglet_count || 0}
              </p>
            </div>

            {/* Sow Posture */}
            <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-700/50 p-5 hover:shadow-md dark:hover:shadow-dark-lg transition-all duration-300 hover:-translate-y-0.5">
              <h3 className="text-sm font-medium text-gray-500 dark:text-slate-400 mb-2">Sow Posture</h3>
              <p className="text-xl font-semibold text-gray-900 dark:text-white capitalize">
                {(activeDetection?.data?.posture || pen?.sow_posture || 'unknown').replace('_', ' ')}
              </p>
            </div>

            {/* Crushing Risk */}
            <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-700/50 p-5 hover:shadow-md dark:hover:shadow-dark-lg transition-all duration-300 hover:-translate-y-0.5">
              <h3 className="text-sm font-medium text-gray-500 dark:text-slate-400 mb-4">Crushing Risk</h3>
              <div className="flex justify-center">
                <RiskGauge 
                  value={activeDetection?.data?.risk_level || pen?.crushing_risk || 0}
                  size="lg"
                />
              </div>
            </div>

            {/* Processing Info */}
            {activeDetection && (
              <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-700/50 p-5 hover:shadow-md dark:hover:shadow-dark-lg transition-all duration-300 hover:-translate-y-0.5">
                <h3 className="text-sm font-medium text-gray-500 dark:text-slate-400 mb-2">Detection Info</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-slate-400">Processing Time</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {activeDetection.data?.processing_time_ms?.toFixed(1) || '-'} ms
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-slate-400">Objects Detected</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {activeDetection.data?.bboxes?.length || 0}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <PageSkeleton />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div id="tour-monitoring-header" className="animate-slide-in-left flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Live Monitoring</h1>
            <p className="text-gray-500 dark:text-slate-400">Real-time video feeds from all pens</p>
          </div>
          <div className="ml-2 bg-gray-100 dark:bg-slate-700/50 rounded-full border border-gray-200 dark:border-slate-600/50 flex shadow-sm">
            <PageInfoButton onClick={() => setIsInfoOpen(true)} />
          </div>
          <TourButton
            onClick={() => setIsTourOpen(true)}
            id="tour-start-btn"
            title="Start Live Monitoring System Tour"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAddPen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
          >
            <Plus className="h-4 w-4" /> Add Pen
          </button>

          <button
            id="tour-monitoring-controls"
            onClick={() => setShowSettings(!showSettings)}
            className={clsx(
              "p-2 hover:bg-gray-100 dark:hover:bg-slate-700/50 rounded-lg transition-all duration-200",
              showSettings && "bg-gray-100 dark:bg-slate-700/50"
            )}
            title="Detection settings"
          >
            <Sliders className="h-5 w-5 text-gray-600 dark:text-slate-400" />
          </button>
          
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700/50 rounded-lg transition-all duration-200 hover:scale-105"
          >
            <RefreshCw className={clsx('h-5 w-5 text-gray-600 dark:text-slate-400', isRefetching && 'animate-spin')} />
          </button>
          
          {/* Device Mode Switcher (Desktop vs Mobile Mode for Testing) */}
          <div className="flex items-center p-1 bg-gray-100 dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700">
            <button
              onClick={() => setSimulatedMode('auto')}
              className={clsx(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all',
                preference === 'auto'
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
              )}
              title="Auto Mode: Automatically detects browser & DevTools dimensions"
            >
              <Zap className="h-3.5 w-3.5" />
              <span>Auto ({isDesktop ? 'Desktop' : 'Mobile'})</span>
            </button>
            <button
              onClick={() => setSimulatedMode('desktop')}
              className={clsx(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all',
                preference === 'desktop'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
              )}
              title="Force Desktop Mode"
            >
              <Monitor className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Desktop</span>
            </button>
            <button
              onClick={() => setSimulatedMode('mobile')}
              className={clsx(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all',
                preference === 'mobile'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
              )}
              title="Force Mobile Mode"
            >
              <Smartphone className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Mobile</span>
            </button>
          </div>

          <div id="tour-monitoring-layout" className="hidden sm:flex bg-gray-100 dark:bg-slate-700/50 rounded-lg p-1">
            <button
              onClick={() => setLayout('2x2')}
              className={clsx(
                'p-2 rounded-md transition-all duration-200',
                layout === '2x2' ? 'bg-white dark:bg-slate-600 shadow dark:shadow-dark-lg' : 'hover:bg-gray-200 dark:hover:bg-slate-600/50 text-gray-600 dark:text-slate-400'
              )}
            >
              <Grid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setLayout('3x2')}
              className={clsx(
                'p-2 rounded-md transition-all duration-200',
                layout === '3x2' ? 'bg-white dark:bg-slate-600 shadow dark:shadow-dark-lg' : 'hover:bg-gray-200 dark:hover:bg-slate-600/50 text-gray-600 dark:text-slate-400'
              )}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setLayout('1x1')}
              className={clsx(
                'p-2 rounded-md transition-all duration-200',
                layout === '1x1' ? 'bg-white dark:bg-slate-600 shadow dark:shadow-dark-lg' : 'hover:bg-gray-200 dark:hover:bg-slate-600/50 text-gray-600 dark:text-slate-400'
              )}
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Detection Settings Panel */}
      {showSettings && (
        <div className="bg-white dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-700/50 p-4 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Detection Settings</h3>
            
            {/* Performance Mode Quick Presets */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500 dark:text-slate-400">Quick:</span>
              <button
                onClick={() => setPerformanceMode('quality')}
                className="px-2 py-1 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
                title="Best quality, highest CPU usage"
              >
                Quality
              </button>
              <button
                onClick={() => setPerformanceMode('balanced')}
                className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                title="Balanced quality and performance"
              >
                Balanced
              </button>
              <button
                onClick={() => setPerformanceMode('performance')}
                className="px-2 py-1 text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors"
                title="Best performance, lowest CPU usage"
              >
                Performance
              </button>
            </div>
          </div>
          
          {/* Detection Mode Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-gray-900 dark:text-white">Client-Side Detection</label>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                Use browser ONNX model (same as Test Pen Page)
              </p>
            </div>
            <button
              onClick={() => setUseClientDetection(!useClientDetection)}
              className={clsx(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                useClientDetection ? "bg-blue-600" : "bg-gray-300 dark:bg-slate-600"
              )}
            >
              <span
                className={clsx(
                  "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                  useClientDetection ? "translate-x-6" : "translate-x-1"
                )}
              />
            </button>
          </div>

          {/* Confidence Threshold Slider */}
          {useClientDetection && (
            <>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-900 dark:text-white">Confidence Threshold</label>
                  <span className="text-sm font-mono text-gray-600 dark:text-slate-400">{confidenceThreshold.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="0.9"
                  step="0.05"
                  value={confidenceThreshold}
                  onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer"
                  title="Adjust detection confidence threshold"
                />
                <div className="flex justify-between text-xs text-gray-500 dark:text-slate-400 mt-1">
                  <span>0.1 (More detections)</span>
                  <span>0.9 (Fewer, more confident)</span>
                </div>
              </div>

              {/* Show Bounding Boxes Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                    <Eye className="w-4 h-4" />
                    Show Bounding Boxes
                  </label>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                    Hide boxes to improve performance (detection still runs)
                  </p>
                </div>
                <button
                  onClick={() => setShowBoundingBoxes(!showBoundingBoxes)}
                  className={clsx(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                    showBoundingBoxes ? "bg-blue-600" : "bg-gray-300 dark:bg-slate-600"
                  )}
                  title="Toggle bounding box visibility"
                >
                  <span
                    className={clsx(
                      "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                      showBoundingBoxes ? "translate-x-6" : "translate-x-1"
                    )}
                  />
                </button>
              </div>

              {/* Frame Skip Setting */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    Detection Speed
                  </label>
                  <span className="text-sm font-mono text-gray-600 dark:text-slate-400">
                    Every {detectionFrameSkip} frame{detectionFrameSkip > 1 ? 's' : ''}
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={detectionFrameSkip}
                  onChange={(e) => setDetectionFrameSkip(parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer"
                  title="Process every Nth frame"
                />
                <div className="flex justify-between text-xs text-gray-500 dark:text-slate-400 mt-1">
                  <span>1 (Slower, best quality)</span>
                  <span>10 (Faster, lower quality)</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1.5">
                  Higher values = better performance, but may miss fast movements
                </p>
              </div>
            </>
          )}

          {!useClientDetection && (
            <div className="text-sm text-gray-500 dark:text-slate-400 p-3 bg-gray-50 dark:bg-slate-700/30 rounded-lg">
              ℹ️ Using backend detection. To adjust settings, modify backend configuration.
            </div>
          )}
        </div>
      )}

      {/* Dynamic Mobile Telemetry Hub (When on Mobile Dimension / Mobile Mode) */}
      {isMobile ? (
        <div className="space-y-4 animate-fade-in">
          {/* Animated Live Access Notice */}
          <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent dark:from-amber-900/30 dark:via-amber-900/10 dark:to-transparent border border-amber-300 dark:border-amber-700/60 rounded-2xl p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0 text-amber-600 dark:text-amber-400">
                <Smartphone className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                    Livestreaming Restricted on Mobile Devices
                  </h3>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-ping" />
                    Live Telemetry Active
                  </span>
                </div>
                <p className="text-xs text-gray-600 dark:text-slate-300 mt-1 leading-relaxed">
                  Multi-camera RTSP/WebRTC streams and client-side ONNX models are disabled on mobile viewports to prevent memory overflow, battery drain, and UI lag. All live sensors, posture changes, piglet counts, and risk gauges are displayed below in real-time.
                </p>
                <div className="mt-2.5 flex items-center gap-2">
                  <button
                    onClick={() => setSimulatedMode('desktop')}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                  >
                    <Monitor className="h-3 w-3" /> Force Desktop Stream Mode
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Search Bar */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-slate-500" />
              <input
                type="text"
                value={mobileSearch}
                onChange={(e) => setMobileSearch(e.target.value)}
                placeholder="Filter by pen name or sow tag..."
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {mobileSearch && (
                <button
                  onClick={() => setMobileSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              <button
                onClick={() => setMobileFilter('all')}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap',
                  mobileFilter === 'all'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700'
                )}
              >
                All Pens ({penStatuses?.length ?? 0})
              </button>
              <button
                onClick={() => setMobileFilter('high-risk')}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap',
                  mobileFilter === 'high-risk'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700'
                )}
              >
                <ShieldAlert className="h-3.5 w-3.5 text-red-500" />
                Elevated Risk ({highRiskCount})
              </button>
              <button
                onClick={() => setMobileFilter('farrowing')}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap',
                  mobileFilter === 'farrowing'
                    ? 'bg-pink-600 text-white shadow-sm'
                    : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700'
                )}
              >
                <Baby className="h-3.5 w-3.5 text-pink-500" />
                Nursing / Farrowing ({farrowingCount})
              </button>
            </div>
          </div>

          {/* Telemetry Cards List */}
          <div id="tour-monitoring-grid" className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredPens.map((pen) => {
              const risk = pen.crushing_risk ?? 0;
              const isHighRisk = risk >= 0.65;
              const isElevated = risk >= 0.4;
              const isExpanded = expandedPenId === pen.pen_id.toString();
              const postureClean = (pen.sow_posture || 'unknown').replace(/_/g, ' ');

              return (
                <div
                  key={pen.pen_id}
                  className={clsx(
                    'bg-white dark:bg-slate-800/80 rounded-2xl border transition-all duration-200 shadow-sm p-4 space-y-3.5',
                    isHighRisk
                      ? 'border-red-300 dark:border-red-800/80 bg-red-50/20'
                      : isElevated
                      ? 'border-amber-300 dark:border-amber-800/70'
                      : 'border-gray-200 dark:border-slate-700'
                  )}
                >
                  {/* Card Header */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={clsx(
                        'w-3 h-3 rounded-full flex-shrink-0 animate-pulse',
                        isHighRisk ? 'bg-red-500' : isElevated ? 'bg-amber-500' : 'bg-green-500'
                      )} />
                      <h4 className="font-bold text-gray-900 dark:text-white text-sm truncate">
                        {pen.pen_name}
                      </h4>
                      {pen.sow_tag ? (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                          Sow {pen.sow_tag}
                        </span>
                      ) : (
                        <span className="text-[11px] text-gray-400 dark:text-slate-500 italic">
                          No sow tag
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-mono text-gray-500 dark:text-slate-400">
                      {pen.last_updated ? new Date(pen.last_updated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Live'}
                    </span>
                  </div>

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-3 gap-2 py-1 bg-gray-50 dark:bg-slate-900/50 rounded-xl p-3 border border-gray-100 dark:border-slate-800">
                    <div className="text-center">
                      <span className="text-[10px] uppercase font-semibold text-gray-500 dark:text-slate-400 block mb-1">
                        Crushing Risk
                      </span>
                      <span className={clsx(
                        'font-mono font-bold text-sm tabular-nums block',
                        isHighRisk ? 'text-red-600 dark:text-red-400' : isElevated ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                      )}>
                        {(risk * 100).toFixed(0)}%
                      </span>
                      <span className="text-[10px] text-gray-500 dark:text-slate-400 capitalize">
                        {isHighRisk ? 'Critical' : isElevated ? 'Caution' : 'Normal'}
                      </span>
                    </div>

                    <div className="text-center border-x border-gray-200 dark:border-slate-700">
                      <span className="text-[10px] uppercase font-semibold text-gray-500 dark:text-slate-400 block mb-1">
                        Piglets
                      </span>
                      <span className="font-mono font-bold text-sm text-gray-900 dark:text-white tabular-nums flex items-center justify-center gap-1">
                        <Baby className="h-3.5 w-3.5 text-green-500" />
                        {pen.piglet_count}
                      </span>
                      <span className="text-[10px] text-gray-500 dark:text-slate-400">
                        Detected
                      </span>
                    </div>

                    <div className="text-center">
                      <span className="text-[10px] uppercase font-semibold text-gray-500 dark:text-slate-400 block mb-1">
                        Sow Posture
                      </span>
                      <span className="font-semibold text-xs text-gray-800 dark:text-slate-200 capitalize truncate block">
                        {postureClean}
                      </span>
                      <span className="text-[10px] text-gray-500 dark:text-slate-400">
                        Edge State
                      </span>
                    </div>
                  </div>

                  {/* Expandable Drawer */}
                  {isExpanded && (
                    <div className="pt-2 border-t border-gray-100 dark:border-slate-700/60 text-xs space-y-2 animate-fade-in text-gray-600 dark:text-slate-300">
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-slate-400">Video Source</span>
                        <span className="font-mono text-[11px] truncate max-w-[180px]">
                          {pen.is_streaming ? 'Live Stream Active' : 'Offline / Standby'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-slate-400">Monitoring Advisory</span>
                        <span className={clsx(
                          'font-medium',
                          isHighRisk ? 'text-red-500' : isElevated ? 'text-amber-500' : 'text-green-500'
                        )}>
                          {isHighRisk ? 'Immediate attention needed' : isElevated ? 'Piglets near sow' : 'Posture safe'}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Card Buttons */}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button
                      onClick={() => setExpandedPenId(isExpanded ? null : pen.pen_id.toString())}
                      className="flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200 transition-colors"
                    >
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      {isExpanded ? 'Less Info' : 'Quick Telemetry'}
                    </button>
                    <button
                      onClick={() => navigate(`/pen/${pen.pen_id}`)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors"
                    >
                      Pen Dashboard →
                    </button>
                  </div>
                </div>
              );
            })}

            {filteredPens.length === 0 && (
              <div className="col-span-full py-12 text-center bg-gray-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-gray-300 dark:border-slate-700">
                <Smartphone className="h-8 w-8 mx-auto text-gray-400 dark:text-slate-500 mb-2" />
                <p className="text-sm font-semibold text-gray-700 dark:text-slate-300">
                  No pens match the selected filter
                </p>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                  Try adjusting your search query or reset the filter
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Video Grid */
        <div id="tour-monitoring-grid" className={clsx('grid gap-4', layoutConfig[layout])}>
          {penStatuses?.map((pen) => {
            const penIdStr = pen.pen_id.toString();
            const isPenVisible = visiblePens.has(penIdStr) || selectedPen === penIdStr;
            
            return (
              <div 
                key={pen.pen_id} 
                className="animate-fade-in-up" 
                data-pen-id={penIdStr}
                ref={(el) => {
                  if (el && observerRef.current) {
                    observerRef.current.observe(el);
                  }
                }}
              >
                <RTSPVideoFeed
                  penId={penIdStr}
                  penName={pen.pen_name}
                  sowTag={pen.sow_tag || undefined}
                  onFullscreen={() => setSelectedPen(penIdStr)}
                  confidenceThreshold={confidenceThreshold}
                  useClientDetection={useClientDetection}
                  showBoundingBoxes={showBoundingBoxes}
                  detectionFrameSkip={detectionFrameSkip}
                  isVisible={isPenVisible}
                />
              </div>
            );
          })}

          {(!penStatuses || penStatuses.length === 0) && (
            <div className="col-span-full bg-gray-100 dark:bg-slate-800/50 rounded-xl p-12 text-center">
              <LayoutDashboard className="h-12 w-12 mx-auto text-gray-400 dark:text-slate-500 mb-3" />
              <p className="text-lg font-medium text-gray-600 dark:text-slate-300">No pens yet</p>
              <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 mb-5">Add your first pen to start live monitoring</p>
              <button
                onClick={() => setShowAddPen(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
              >
                <Plus className="h-4 w-4" /> Add First Pen
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Add Pen Modal ──────────────────────────────────────────────── */}
      {showAddPen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => { setShowAddPen(false); setAddPenForm({ name: '', location: '', camera_source: '' }); }}
          />

          <div className="relative w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-2xl animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Add New Pen</h2>
              <button
                onClick={() => { setShowAddPen(false); setAddPenForm({ name: '', location: '', camera_source: '' }); }}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            {/* Form */}
            <div className="px-6 py-5 space-y-4">
              {/* Pen Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                  Pen Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={addPenForm.name}
                  onChange={(e) => setAddPenForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Farrowing Pen 1"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddPen()}
                  autoFocus
                />
              </div>

              {/* Location */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                  <MapPin className="inline h-3.5 w-3.5 mr-1 opacity-60" />
                  Location <span className="text-xs text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={addPenForm.location}
                  onChange={(e) => setAddPenForm((f) => ({ ...f, location: e.target.value }))}
                  placeholder="e.g. Building A, Row 2"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              {/* RTSP URL */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                  <Video className="inline h-3.5 w-3.5 mr-1 opacity-60" />
                  Camera RTSP URL <span className="text-xs text-gray-400 font-normal">(optional — can be added later in Camera Setup)</span>
                </label>
                <input
                  type="text"
                  value={addPenForm.camera_source}
                  onChange={(e) => setAddPenForm((f) => ({ ...f, camera_source: e.target.value }))}
                  placeholder="rtsp://username:password@192.168.1.x:554/stream"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-400 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-slate-700">
              <button
                onClick={() => { setShowAddPen(false); setAddPenForm({ name: '', location: '', camera_source: '' }); }}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddPen}
                disabled={addingPen || !addPenForm.name.trim()}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
              >
                {addingPen ? (
                  <><RefreshCw className="h-4 w-4 animate-spin" /> Creating...</>
                ) : (
                  <><Plus className="h-4 w-4" /> Create Pen</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <PageInfoModal isOpen={isInfoOpen} onClose={() => setIsInfoOpen(false)} title="Live Monitoring">
        <div className="space-y-4 text-sm text-gray-600 dark:text-slate-300">
          <p>
            The Live Monitoring page allows you to view multi-pen camera streams simultaneously.
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li><strong>Grid Layout:</strong> Use the layout buttons (2x2, 3x2, etc.) to change how many camera feeds are visible at once.</li>
            <li><strong>Optimized Streaming:</strong> Video feeds pause automatically when scrolled out of view to save network bandwidth.</li>
            <li><strong>Drill Down:</strong> Clicking on any specific camera feed expands it and allows you to jump directly to the detailed Pen Monitor page for that specific pen.</li>
          </ul>
        </div>
      </PageInfoModal>

      <SystemTour
        isOpen={isTourOpen}
        onClose={() => setIsTourOpen(false)}
        steps={MONITORING_TOUR_STEPS}
        tourKey="prisma_atlas_monitoring_tour"
        onComplete={() => {
          toast.success('Live monitoring tour completed! Click any pen to enter full live streaming.');
        }}
      />
    </div>
  );
}
