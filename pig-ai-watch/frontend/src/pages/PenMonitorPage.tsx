import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  computeRestlessnessScore,
  computeFarrowingLikelihood,
  computeStagnationLevel,
  computeAgeAdjustedCrushingRisk,
} from '@/utils/farrowingMetrics';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  ArrowLeft,
  Heart,
  Baby,
  Activity,
  AlertTriangle,
  Clock,
  Plus,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Thermometer,
  Shield,
  TrendingUp,
  Calendar,
  ClipboardList,
  FileText,
  Eye,
  Sparkles,
  BarChart3,
  Edit3,
  Save,
  Timer,
  Zap,
  Bell,
  Radio,
  Target,
  MonitorSpeaker,
  StopCircle,
  PieChart,
  ArrowDown,
  ArrowUp,
  Info,
  Search,
  UserPlus,
  RefreshCw,
} from 'lucide-react';
import { RTSPVideoFeed, CrushingRiskGauge, type CameraConnectionStatus } from '@/components';
import { AIPenAdvisoryCard } from '@/components/AIPenAdvisoryCard';
import { useApi } from '@/hooks/useApi';
import { usePenStatus, useAlerts } from '@/hooks';
import { useDetectionStore, usePowerSavingStore } from '@/store';
import { useSimulationStore, type SimulationEvent } from '@/store/simulationStore';
import { useFarrowingStore, type FarrowingSystemState } from '@/store/farrowingStore';
import { simulationEngine } from '@/services/simulationEngine';
import { behaviorLogger } from '@/services/behaviorLogger';
import type { DetectionResult } from '@/utils/onnxDetector';
import type { Sow, FarrowingRecord, FarrowingStats, Alert, Event, SowUpdate } from '@/types';
import clsx from 'clsx';
import toast from 'react-hot-toast';

// ─── Tab definition ──────────────────────────────────────────────────────────
type Tab = 'overview' | 'live-monitor' | 'farrowing' | 'health';

// ─── Posture color map (for timeline visualization) ──────────────────────────
const POSTURE_COLORS: Record<string, string> = {
  sleeping: '#2196F3', lactating: '#9C27B0', nursing: '#9C27B0', feeding: '#8BC34A', standing: '#FF9800', unknown: '#9E9E9E',
};

// ─── AI Welfare insights helper ──────────────────────────────────────────────
interface WelfareInsight {
  icon: React.ReactNode;
  label: string;
  value: string;
  status: 'good' | 'warning' | 'critical';
  detail: string;
}

function computeWelfareInsights(
  sow: Sow | null,
  farrowingRecords: FarrowingRecord[],
  alerts: Alert[],
  penStatus: { crushing_risk: number; piglet_count: number; sow_posture: string } | null
): WelfareInsight[] {
  const insights: WelfareInsight[] = [];
  const activeRecord = farrowingRecords.find((r) => !r.farrowing_completed);
  const risk = penStatus?.crushing_risk ?? 0;
  const pigletCount = penStatus?.piglet_count ?? 0;
  const posture = penStatus?.sow_posture ?? 'unknown';

  // Crushing risk (age-adjusted)
  const daysSince = activeRecord?.farrowing_started
    ? Math.floor((Date.now() - new Date(activeRecord.farrowing_started).getTime()) / 86400000)
    : null;
  const crushResult = computeAgeAdjustedCrushingRisk({ rawRisk: risk, daysSinceFarrowing: daysSince });
  insights.push({
    icon: <Shield className="h-5 w-5" />,
    label: 'Crushing Risk',
    value: `${Math.round(crushResult.adjustedRisk * 100)}%`,
    status: crushResult.level === 'high' ? 'critical' : crushResult.level === 'elevated' ? 'warning' : 'good',
    detail: crushResult.message,
  });

  // Sow posture
  const postureNorm = posture.replace(/_/g, ' ').replace(/-/g, ' ');
  const isSleeping = /sleep|lying|lateral/i.test(posture);
  const isFeeding = /feed|stand/i.test(posture);
  insights.push({
    icon: <Activity className="h-5 w-5" />,
    label: 'Sow Posture',
    value: postureNorm || 'Unknown',
    status: isSleeping && risk >= 0.5 ? 'warning' : 'good',
    detail: isSleeping
      ? 'Sow is lying down. Ensure piglets have safe retreat area to avoid overlay.'
      : isFeeding
      ? 'Sow is active/feeding. Good sign of appetite and mobility.'
      : 'Unable to determine posture — verify camera angle.',
  });

  // Piglet count vs expected
  const expectedPiglets = activeRecord?.born_alive ?? sow?.current_litter_size ?? 0;
  if (expectedPiglets > 0) {
    const missing = expectedPiglets - pigletCount;
    insights.push({
      icon: <Baby className="h-5 w-5" />,
      label: 'Piglet Visibility',
      value: `${pigletCount} / ${expectedPiglets}`,
      status: missing >= 3 ? 'critical' : missing >= 1 ? 'warning' : 'good',
      detail:
        missing >= 3
          ? `${missing} piglets not visible. Check for hiding, crushing, or camera blind spots.`
          : missing >= 1
          ? `${missing} piglet(s) may be out of camera view. Verify physically if needed.`
          : 'All expected piglets are visible.',
    });
  }

  // Lactation tracking
  if (sow?.status === 'lactating' || activeRecord) {
    const daysSinceFarrowing = activeRecord?.farrowing_started
      ? Math.floor((Date.now() - new Date(activeRecord.farrowing_started).getTime()) / 86400000)
      : null;
    insights.push({
      icon: <Heart className="h-5 w-5" />,
      label: 'Lactation Status',
      value: daysSinceFarrowing !== null ? `Day ${daysSinceFarrowing}` : 'Active',
      status:
        daysSinceFarrowing !== null && daysSinceFarrowing > 21
          ? 'warning'
          : 'good',
      detail:
        daysSinceFarrowing !== null
          ? daysSinceFarrowing <= 3
            ? 'Critical neonatal period — ensure colostrum intake and warmth for piglets.'
            : daysSinceFarrowing <= 7
            ? 'Early lactation. Monitor piglet weight gain and sow feed intake.'
            : daysSinceFarrowing <= 21
            ? 'Mid-lactation. Sow should be eating well. Check piglets for uniformity.'
            : 'Late lactation — consider weaning plan. Sow body condition may decline.'
          : 'Monitor sow lactation behavior and piglet suckling patterns.',
    });
  }

  // Recent alerts for this pen
  const criticalAlerts = alerts.filter((a) => a.severity === 'critical' && !a.is_resolved);
  if (criticalAlerts.length > 0) {
    insights.push({
      icon: <AlertTriangle className="h-5 w-5" />,
      label: 'Active Alerts',
      value: `${criticalAlerts.length} critical`,
      status: 'critical',
      detail: `There are ${criticalAlerts.length} unresolved critical alert(s). Address immediately.`,
    });
  }

  return insights;
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function PenMonitorPage() {
  const { penId } = useParams<{ penId: string }>();
  const navigate = useNavigate();
  const api = useApi();
  const numericPenId = Number(penId);

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);

  // Pen & sow data
  const [sow, setSow] = useState<Sow | null>(null);
  const [penName, setPenName] = useState<string>('');
  const [currentPenCameraSource, setCurrentPenCameraSource] = useState<string | null>(null);
  const [otherPensWithCameras, setOtherPensWithCameras] = useState<Array<{ id: number; name: string }>>([]);

  // Farrowing
  const [farrowingRecords, setFarrowingRecords] = useState<FarrowingRecord[]>([]);
  const [farrowingStats, setFarrowingStats] = useState<FarrowingStats | null>(null);
  const [showNewFarrowForm, setShowNewFarrowForm] = useState(false);
  const [expandedRecord, setExpandedRecord] = useState<number | null>(null);

  // Farrowing form
  const [formPiglets, setFormPiglets] = useState('');
  const [formStillborn, setFormStillborn] = useState('0');
  const [formDate, setFormDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [formTime, setFormTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });
  const [formNotes, setFormNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Breeding info state
  const [breedingDate, setBreedingDate] = useState('');
  const [showBreedingForm, setShowBreedingForm] = useState(false);
  const [savingBreeding, setSavingBreeding] = useState(false);
  const [unknownBreedingDate, setUnknownBreedingDate] = useState(false);
  const [estimatedFarrowingDate, setEstimatedFarrowingDate] = useState('');
  const [estimatedFarrowingDateFrom, setEstimatedFarrowingDateFrom] = useState('');
  const [estimatedFarrowingDateTo, setEstimatedFarrowingDateTo] = useState('');

  // Info tooltip guide
  const [showFarrowingGuide, setShowFarrowingGuide] = useState(false);

  // Replay mode toggle
  const [liveMode, setLiveMode] = useState<'live' | 'replay'>('live');

  // Mini trend chart data — rolling restlessness + likelihood
  const [trendData, setTrendData] = useState<Array<{ time: string; restlessness: number; likelihood: number }>>([
    { time: new Date(Date.now() - 300000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), restlessness: 0, likelihood: 0 },
  ]);

  // Sow selector state
  const [allSows, setAllSows] = useState<Sow[]>([]);
  const [sowSearch, setSowSearch] = useState('');
  const [showSowSelector, setShowSowSelector] = useState(false);
  const [assigningSow, setAssigningSow] = useState(false);

  // Pen status from dashboard hook
  const { data: penStatuses } = usePenStatus();
  const penStatus = penStatuses?.find((p) => p.pen_id === numericPenId) ?? null;
  const { isPowerSaving, setPowerSaving } = usePowerSavingStore();
  const latestDetections = useDetectionStore((s) => s.latestDetections);
  const liveDetection = latestDetections[penId || ''] ?? null;

  // Recent alerts/events for this pen
  const { data: penAlerts } = useAlerts({ pen_id: numericPenId, limit: 20, is_resolved: false });
  const [penEvents, setPenEvents] = useState<Event[]>([]);

  // ── Live Monitor: Simulation engine + behavior logger ───────────────────
  const [liveMonitorActive, setLiveMonitorActive] = useState(false);
  const [latestDetection, setLatestDetection] = useState<DetectionResult | null>(null);
  const monitorStartRef = useRef<number>(0);
  const [cameraConnectionStatus, setCameraConnectionStatus] = useState<CameraConnectionStatus>('probing');

  // Simulation store selectors
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

  // Farrowing engine store selectors
  const farrowingState = useFarrowingStore((s) => s.systemState);
  const farrowingPrediction = useFarrowingStore((s) => s.prediction);
  const farrowingAlerts = useFarrowingStore((s) => s.alerts);
  const activeSession = useFarrowingStore((s) => s.activeSession);
  const farrowingSafetyChecks = useFarrowingStore((s) => s.safetyChecks);
  const completedSessions = useFarrowingStore((s) => s.completedSessions);
  const noNewPigletSinceMs = useFarrowingStore((s) => s.noNewPigletSinceMs);
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

  // ── Sow selector: filtered list ──────────────────────────────────────────
  const filteredSows = useMemo(() => {
    if (!sowSearch.trim()) return allSows;
    const q = sowSearch.toLowerCase();
    return allSows.filter(s =>
      (s.tag_id?.toLowerCase().includes(q)) ||
      (s.name?.toLowerCase().includes(q)) ||
      (s.breed?.toLowerCase().includes(q))
    );
  }, [allSows, sowSearch]);

  // ── Trend chart: append data-point every 30s while live-monitor tab is active
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
        return next.slice(-60);
      });
    }, 30_000);
    return () => clearInterval(iv);
  }, [activeTab, restlessness.score, farrowingLikelihood.score]);

  // Handle detection results from RTSPVideoFeed
  const handleDetectionResult = useCallback((result: DetectionResult) => {
    setLatestDetection(result);

    if (!liveMonitorActive) return;

    // Elapsed seconds since monitoring started (acts as "video time")
    const elapsed = (Date.now() - monitorStartRef.current) / 1000;

    // Feed into simulation engine
    simulationEngine.processFrame(result, elapsed);

    // Feed into behavior logger
    if (result.behaviorSummary) {
      behaviorLogger.updateBehavior(
        result.behaviorSummary,
        result.detections.length,
        result.detections.reduce((s, d) => s + d.confidence, 0) / (result.detections.length || 1),
        result.detections.length / Math.max(1, (result.detections.filter(d => d.category === 'sow').length || 1)),
        result.behaviorSummary.activityLevel || 'moderate'
      );
    }
  }, [liveMonitorActive]);

  // Start live monitoring
  const startLiveMonitoring = useCallback(() => {
    const expectedPiglets = sow?.current_litter_size
      || farrowingRecords.find(r => !r.farrowing_completed)?.born_alive
      || 0;
    monitorStartRef.current = Date.now();
    simulationEngine.start(expectedPiglets || 9, sow?.id, numericPenId);
    behaviorLogger.startLogging(numericPenId, sow?.id);
    setLiveMonitorActive(true);
    toast.success('Live monitoring started');
  }, [numericPenId, sow, farrowingRecords]);

  // Stop live monitoring
  const stopLiveMonitoring = useCallback(() => {
    simulationEngine.stop();
    behaviorLogger.stopLogging();
    setLiveMonitorActive(false);
    toast.success('Live monitoring stopped');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (liveMonitorActive) {
        simulationEngine.stop();
        behaviorLogger.stopLogging();
      }
    };
  }, [liveMonitorActive]);

  // ── Data loading ────────────────────────────────────────────────────────────
  const loadPenData = useCallback(async () => {
    if (!numericPenId) return;
    setLoading(true);
    try {
      // Fetch pen info
      const penRes = await api.get(`/api/pens/${numericPenId}`);
      setPenName(penRes.data.name || `Pen ${numericPenId}`);
      setCurrentPenCameraSource(penRes.data.camera_source ?? null);

      // Fetch all active pens to show where cameras are currently assigned
      try {
        const allPensRes = await api.get('/api/pens', { params: { is_active: true } });
        const withCameras = (Array.isArray(allPensRes.data) ? allPensRes.data : [])
          .filter((p: any) => Boolean(p.camera_source))
          .map((p: any) => ({ id: p.id, name: p.name || `Pen ${p.id}` }));
        setOtherPensWithCameras(withCameras.filter((p: { id: number }) => p.id !== numericPenId));
      } catch {
        setOtherPensWithCameras([]);
      }

      // Fetch sow assigned to this pen
      try {
        const sowRes = await api.get('/api/sows', { params: { pen_id: numericPenId, limit: 1 } });
        if (sowRes.data && sowRes.data.length > 0) {
          setSow(sowRes.data[0]);
        }
      } catch { /* no sow assigned */ }

      // Farrowing records for this pen
      try {
        const frRes = await api.get('/api/farrowing/records', { params: { pen_id: numericPenId, limit: 20 } });
        setFarrowingRecords(Array.isArray(frRes.data) ? frRes.data : []);
      } catch { /* no records */ }

      // Farrowing stats
      try {
        const stRes = await api.get('/api/farrowing/statistics', { params: { period_days: 90 } });
        setFarrowingStats(stRes.data);
      } catch { /* no stats */ }

      // Recent events
      try {
        const evRes = await api.get('/api/events', { params: { pen_id: numericPenId, limit: 15 } });
        setPenEvents(Array.isArray(evRes.data) ? evRes.data : []);
      } catch { /* ignore */ }

      // Load all sows for sow selector
      try {
        const allRes = await api.get('/api/sows', { params: { limit: 100 } });
        setAllSows(Array.isArray(allRes.data) ? allRes.data : []);
      } catch { /* ignore */ }
    } catch (err) {
      console.error('Failed to load pen data:', err);
    } finally {
      setLoading(false);
    }
  }, [numericPenId, api]);

  useEffect(() => {
    loadPenData();
  }, [loadPenData]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  // Assign sow to this pen
  const handleAssignSow = async (sowToAssign: Sow) => {
    if (!numericPenId) return;
    setAssigningSow(true);
    try {
      await api.put(`/api/sows/${sowToAssign.id}`, { pen_id: numericPenId } as SowUpdate);
      toast.success(`Sow ${sowToAssign.tag_id} assigned to ${penName}`);
      setSow(sowToAssign);
      setShowSowSelector(false);
      setSowSearch('');
      loadPenData();
    } catch (err) {
      console.error('Failed to assign sow:', err);
      toast.error('Failed to assign sow');
    } finally {
      setAssigningSow(false);
    }
  };

  // Breeding / Insemination save handler
  const handleSaveBreedingDate = async () => {
    if (!sow) { toast.error('No sow assigned'); return; }

    // Unknown breeding date mode
    if (unknownBreedingDate) {
      setSavingBreeding(true);
      try {
        const updateData: SowUpdate = {
          status: 'pregnant',
          expected_farrowing_date: estimatedFarrowingDate ? new Date(estimatedFarrowingDate).toISOString() : undefined,
        };
        await api.put(`/api/sows/${sow.id}`, updateData);
        const updatedSow = {
          ...sow,
          status: 'pregnant' as const,
          last_breeding_date: null,
          expected_farrowing_date: estimatedFarrowingDate ? new Date(estimatedFarrowingDate).toISOString() : null,
        };
        setSow(updatedSow);
        toast.success(
          estimatedFarrowingDate
            ? `Marked pregnant. Estimated farrowing: ${new Date(estimatedFarrowingDate).toLocaleDateString()}`
            : 'Marked as pregnant (unknown dates). Monitor behavior for farrowing signs.'
        );
        setShowBreedingForm(false);
        setUnknownBreedingDate(false);
        setEstimatedFarrowingDate('');
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
      const expectedFarrowing = new Date(breedingDateObj.getTime() + 114 * 86400000);
      const updateData: SowUpdate = {
        last_breeding_date: breedingDateObj.toISOString(),
        expected_farrowing_date: expectedFarrowing.toISOString(),
        status: 'pregnant',
      };
      await api.put(`/api/sows/${sow.id}`, updateData);
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

  const handleRecordFarrowing = async () => {
    if (!sow) {
      toast.error('No sow assigned to this pen');
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
        pen_id: numericPenId,
        farrowing_started: farrowingStarted,
        total_born: bornAlive + stillborn,
        born_alive: bornAlive,
        stillborn,
        notes: formNotes || undefined,
      });

      // Auto-update sow status to lactating
      try {
        await api.put(`/api/sows/${sow.id}`, {
          status: 'lactating',
          current_litter_size: bornAlive,
          parity: sow.parity + 1,
        } as SowUpdate);
        setSow({ ...sow, status: 'lactating', current_litter_size: bornAlive, parity: sow.parity + 1 });
      } catch { /* sow update failed but farrowing still recorded */ }

      toast.success(`Farrowing recorded — ${bornAlive} piglets alive`);
      setShowNewFarrowForm(false);
      setFormPiglets('');
      setFormStillborn('0');
      setFormNotes('');
      loadPenData();
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
      loadPenData();
    } catch {
      toast.error('Failed to complete farrowing');
    }
  };

  // Computed welfare insights
  const welfareInsights = computeWelfareInsights(
    sow,
    farrowingRecords,
    penAlerts || [],
    penStatus
      ? { crushing_risk: penStatus.crushing_risk, piglet_count: penStatus.piglet_count, sow_posture: penStatus.sow_posture }
      : liveDetection
      ? { crushing_risk: liveDetection.data.risk_level, piglet_count: liveDetection.data.piglet_count, sow_posture: liveDetection.data.posture }
      : null
  );

  const activeFarrowing = farrowingRecords.find((r) => !r.farrowing_completed);
  const hasCameraAssigned = Boolean(currentPenCameraSource);
  const riskValue = latestDetection?.crushingRisk ?? liveDetection?.data.risk_level ?? penStatus?.crushing_risk ?? 0;
  const pigletCountLive = latestDetection?.pigletCount ?? liveDetection?.data.piglet_count ?? penStatus?.piglet_count ?? 0;
  const sowPostureLive = (latestDetection?.sowPosture ?? liveDetection?.data.posture ?? penStatus?.sow_posture ?? 'unknown').replace(/_/g, ' ').replace(/-/g, ' ');
  const daysSinceFarrowing = activeFarrowing?.farrowing_started
    ? Math.floor((Date.now() - new Date(activeFarrowing.farrowing_started).getTime()) / 86400000)
    : null;

  // ── Status color helpers ────────────────────────────────────────
  const statusColor = (s: 'good' | 'warning' | 'critical') =>
    s === 'critical'
      ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
      : s === 'warning'
      ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
      : 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800';

  // ── Loading state ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="relative">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-primary-200 dark:border-slate-700 border-t-primary-500" />
          <Activity className="absolute inset-0 m-auto h-6 w-6 text-primary-500 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in max-w-[1400px] mx-auto">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate(-1)}
            title="Go back"
            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors flex-shrink-0"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600 dark:text-slate-400" />
          </button>
          
          {/* Power Saving Toggle */}
          <button
            onClick={() => setPowerSaving(!isPowerSaving)}
            title={isPowerSaving ? "Power Saving: ON (Low FPS)" : "Power Saving: OFF (High FPS)"}
            className={`p-2 rounded-xl border transition-colors flex-shrink-0 flex items-center gap-1 ${
              isPowerSaving 
                ? 'bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400' 
                : 'hover:bg-gray-100 dark:hover:bg-slate-800 border-transparent text-gray-600 dark:text-slate-400'
            }`}
          >
            <Zap className={`h-5 w-5 ${isPowerSaving ? 'fill-current' : ''}`} />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2 truncate">
              {penName}
              {activeFarrowing && (
                <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300 animate-pulse flex-shrink-0">
                  Farrowing Active
                </span>
              )}
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 truncate">
              {sow ? `Sow ${sow.tag_id}${sow.name ? ` — ${sow.name}` : ''} • Parity ${sow.parity}` : 'No sow assigned'}
              {penStatus?.is_streaming && cameraConnectionStatus === 'connected' && (
                <span className="ml-2 inline-flex items-center gap-1 text-green-600 dark:text-green-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  Live
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Quick stats pills */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800">
            <Baby className="h-3.5 w-3.5" /> {pigletCountLive} piglets
          </span>
          <span className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border',
            riskValue >= 0.65 ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800'
              : riskValue >= 0.4 ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
              : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
          )}>
            <Shield className="h-3.5 w-3.5" /> {(riskValue * 100).toFixed(0)}% risk
          </span>
        </div>
      </div>

      {/* ── TOP: Live Camera + Quick Info grid ─────────────────────── */}
      {!hasCameraAssigned && (
        <div className="rounded-2xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <div className="flex items-start gap-3 flex-1">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  No camera assigned to {penName}
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                  Camera setup may show connected for another pen, but this page only displays streams assigned to this specific pen.
                </p>
                {otherPensWithCameras.length > 0 ? (
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                    Currently assigned: {otherPensWithCameras.map((p) => p.name).join(', ')}.
                  </p>
                ) : (
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                    No active pen currently has a saved camera source.
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate('/camera-setup')}
                className="px-3 py-2 rounded-lg text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white transition-colors"
              >
                Open Camera Setup
              </button>
              {otherPensWithCameras.length > 0 && (
                <button
                  onClick={() => navigate(`/pen/${otherPensWithCameras[0].id}`)}
                  className="px-3 py-2 rounded-lg text-xs font-medium bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                >
                  Open {otherPensWithCameras[0].name}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Live Camera */}
        <div className="lg:col-span-2 rounded-2xl overflow-hidden border border-gray-200 dark:border-slate-700 bg-black">
          <RTSPVideoFeed
            penId={penId || ''}
            penName={penName}
            sowTag={sow?.tag_id || penStatus?.sow_tag || undefined}
            showStats={false}
            className="aspect-video w-full"
            confidenceThreshold={0.25}
            useClientDetection={true}
            showBoundingBoxes={true}
            detectionFrameSkip={isPowerSaving ? 15 : 5}
            isVisible={true}
            onConnectionStatus={setCameraConnectionStatus}
            onDetectionResult={handleDetectionResult}
          />
        </div>

        {/* Quick Info Panel */}
        <div className="space-y-4">
          {/* Crushing Risk Gauge */}
          <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-gray-200 dark:border-slate-700 p-5">
            <CrushingRiskGauge rawRisk={riskValue} daysSinceFarrowing={daysSinceFarrowing} size="lg" proximityAlerts={latestDetection?.proximityAlerts} totalPiglets={pigletCountLive} />
          </div>

          {/* Live Counts */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white dark:bg-slate-800/60 rounded-xl border border-gray-200 dark:border-slate-700 p-4 text-center">
              <Baby className="h-5 w-5 mx-auto text-green-500 mb-1" />
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{pigletCountLive}</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">Piglets</p>
            </div>
            <div className="bg-white dark:bg-slate-800/60 rounded-xl border border-gray-200 dark:border-slate-700 p-4 text-center">
              <Activity className="h-5 w-5 mx-auto text-pink-500 mb-1" />
              <p className="text-sm font-bold text-gray-900 dark:text-white capitalize mt-1">{sowPostureLive}</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">Sow posture</p>
            </div>
          </div>

          {/* Sow identity card */}
          {sow && (
            <div className="bg-white dark:bg-slate-800/60 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-full bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center">
                  <Heart className="h-5 w-5 text-pink-500" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">{sow.tag_id}</p>
                  <p className="text-xs text-gray-500 dark:text-slate-400 capitalize">{sow.status} • Parity {sow.parity}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-gray-50 dark:bg-slate-700/30 rounded-lg px-3 py-2">
                  <span className="text-gray-500 dark:text-slate-400 block">Breed</span>
                  <span className="font-medium text-gray-800 dark:text-white">{sow.breed || '-'}</span>
                </div>
                <div className="bg-gray-50 dark:bg-slate-700/30 rounded-lg px-3 py-2">
                  <span className="text-gray-500 dark:text-slate-400 block">Litter size</span>
                  <span className="font-medium text-gray-800 dark:text-white">{sow.current_litter_size || '-'}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Tab navigation ─────────────────────────────────────────── */}
      <div className="overflow-x-auto -mx-1 px-1 scrollbar-hide">
        <div className="flex gap-1 bg-gray-100 dark:bg-slate-800/50 rounded-xl p-1 min-w-max sm:min-w-0">
          {([
            { key: 'overview' as Tab, label: 'Overview', icon: <Eye className="h-4 w-4" /> },
            { key: 'live-monitor' as Tab, label: 'Live Monitor', icon: <Radio className="h-4 w-4" /> },
            { key: 'farrowing' as Tab, label: 'Farrowing', icon: <Heart className="h-4 w-4" /> },
            { key: 'health' as Tab, label: 'Events', icon: <ClipboardList className="h-4 w-4" /> },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={clsx(
                'flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap',
                activeTab === tab.key
                  ? 'bg-white dark:bg-slate-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'
              )}
            >
              {tab.icon} <span className="hidden xs:inline sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ━━━━━━━━━━━━━━━━ TAB: OVERVIEW & WELFARE ━━━━━━━━━━━━━━━━ */}
      {activeTab === 'overview' && (
        <div className="space-y-5 animate-fade-in">
          {/* AI Welfare Insights */}
          <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary-500" />
              <h2 className="font-semibold text-gray-900 dark:text-white">AI Welfare Analysis</h2>
              <span className="ml-auto text-xs text-gray-400 dark:text-slate-500">Real-time</span>
            </div>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {welfareInsights.map((insight, i) => (
                <div
                  key={i}
                  className={clsx(
                    'rounded-xl border p-4 transition-all duration-200 hover:shadow-md',
                    statusColor(insight.status)
                  )}
                >
                  <div className="flex items-center gap-3 mb-2">
                    {insight.icon}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wider opacity-70">{insight.label}</p>
                      <p className="text-lg font-bold capitalize">{insight.value}</p>
                    </div>
                  </div>
                  <p className="text-xs leading-relaxed opacity-80"><TypewriterText text={insight.detail} speed={14} /></p>
                </div>
              ))}

              {welfareInsights.length === 0 && (
                <div className="col-span-2 text-center py-8 text-gray-400 dark:text-slate-500">
                  <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p><TypewriterText text="Waiting for detection data..." speed={40} /></p>
                </div>
              )}
            </div>
          </div>

          <AIPenAdvisoryCard penId={penId} penStatus={penStatus} recentEvents={penEvents} />

          {/* Quick farrowing summary if active */}
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
              <div className="flex justify-end mt-3">
                <button
                  onClick={() => setActiveTab('farrowing')}
                  className="text-sm text-pink-600 dark:text-pink-400 hover:underline flex items-center gap-1"
                >
                  Manage farrowing <ChevronDown className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ━━━━━━━━━━━━━━━━ TAB: LIVE MONITOR ━━━━━━━━━━━━━━━━━━━━━ */}
      {activeTab === 'live-monitor' && (
        <div className="space-y-5 animate-fade-in">
          {/* Replay Mode Toggle */}
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

          {/* Start/Stop Monitoring Controls */}
          <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-gray-200 dark:border-slate-700 p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={clsx(
                  'h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0',
                  liveMonitorActive ? 'bg-green-100 dark:bg-green-900/30 animate-pulse' : 'bg-gray-100 dark:bg-slate-700/40'
                )}>
                  <Radio className={clsx('h-5 w-5', liveMonitorActive ? 'text-green-600' : 'text-gray-400')} />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {liveMonitorActive ? 'Live Monitoring Active' : 'Real-Time Smart Monitoring'}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-slate-400">
                    {liveMonitorActive
                      ? `Tracking ${simExpectedPiglets} piglets • ${simStats.framesProcessed} frames • ${simStats.totalEvents} events`
                      : 'Start monitoring to track lactation, posture, piglet counts, and crushing risk in real-time'}
                  </p>
                </div>
              </div>
              <button
                onClick={liveMonitorActive ? stopLiveMonitoring : startLiveMonitoring}
                className={clsx(
                  'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5',
                  liveMonitorActive
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-green-600 hover:bg-green-700 text-white'
                )}
              >
                {liveMonitorActive ? (
                  <><StopCircle className="h-4 w-4" /> Stop Monitoring</>
                ) : (
                  <><Radio className="h-4 w-4" /> Start Monitoring</>
                )}
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

          {/* ── Farrowing Engine Status Panel ──────────────────────────── */}
          {liveMonitorActive && (
            <FarrowingEnginePanel
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
          )}

          {/* Live Stats Grid */}
          {liveMonitorActive && (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              <LiveStatCard
                icon={<Baby className="h-4 w-4 text-green-500" />}
                label="Piglets"
                value={`${pigletCountLive}/${simExpectedPiglets}`}
                sub={simStats.framesProcessed > 0 ? `avg ${simStats.avgPigletCount.toFixed(1)}` : '\u2014'}
                status={pigletCountLive < simExpectedPiglets ? 'warning' : 'good'}
              />
              <LiveStatCard
                icon={<Shield className="h-4 w-4 text-teal-500" />}
                label="Crush Risk"
                value={`${(riskValue * 100).toFixed(0)}%`}
                sub={`max ${(simStats.maxCrushingRisk * 100).toFixed(0)}%`}
                status={(() => { const r = computeAgeAdjustedCrushingRisk({ rawRisk: riskValue, daysSinceFarrowing }); return r.level === 'high' ? 'critical' : r.level === 'elevated' ? 'warning' : 'good'; })()}
              />
              <LiveStatCard
                icon={<Heart className="h-4 w-4 text-pink-500" />}
                label="Health"
                value={`${(latestDetection?.behaviorSummary?.healthScore ?? 0).toFixed(0)}`}
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
                sub={sowPostureLive || 'none'}
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
          )}

          {liveMonitorActive && (
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
                        <p className="text-sm">Click "Start Monitoring" to begin</p>
                        <p className="text-xs mt-1">Events will appear here automatically</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Smart Insights */}
          {liveMonitorActive && simStats.framesProcessed > 30 && (
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
                      ? 'High activity. Sow is restless — could indicate discomfort, heat stress, or pre-farrowing restlessness.'
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

          {/* Prompt when not started */}
          {!liveMonitorActive && simEvents.length === 0 && (
            <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-gray-200 dark:border-slate-700 p-8 text-center">
              <Radio className="h-12 w-12 mx-auto mb-4 text-gray-300 dark:text-slate-600" />
              <h3 className="text-lg font-semibold text-gray-700 dark:text-slate-300 mb-2">Real-Time AI Monitoring</h3>
              <p className="text-sm text-gray-500 dark:text-slate-400 max-w-md mx-auto mb-4">
                Press "Start Monitoring" to enable smart event tracking on the live CCTV feed. The system will automatically detect lactation sessions, posture changes, piglet count drops, and crushing risk escalations.
              </p>
              <div className="flex flex-wrap justify-center gap-3 text-xs text-gray-400 dark:text-slate-500">
                <span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5 text-purple-400" /> Lactation tracking</span>
                <span className="flex items-center gap-1"><Baby className="h-3.5 w-3.5 text-green-400" /> Piglet counting</span>
                <span className="flex items-center gap-1"><Shield className="h-3.5 w-3.5 text-red-400" /> Risk alerts</span>
                <span className="flex items-center gap-1"><Activity className="h-3.5 w-3.5 text-blue-400" /> Posture analysis</span>
                <span className="flex items-center gap-1"><Target className="h-3.5 w-3.5 text-amber-400" /> Cross-pen detection</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ━━━━━━━━━━━━━━━━ TAB: FARROWING ━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {activeTab === 'farrowing' && (
        <div className="space-y-5 animate-fade-in">
          {/* Action bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between flex-wrap gap-2">
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Heart className="h-5 w-5 text-pink-500" />
              Farrowing Management — {penName}
              {/* Info tooltip */}
              <div className="relative" onMouseEnter={() => setShowFarrowingGuide(true)} onMouseLeave={() => setShowFarrowingGuide(false)}>
                <button title="How farrowing works" className="h-5 w-5 rounded-full bg-gray-200 dark:bg-slate-600 flex items-center justify-center hover:bg-gray-300 dark:hover:bg-slate-500 transition-colors">
                  <Info className="h-3 w-3 text-gray-500 dark:text-slate-300" />
                </button>
                {showFarrowingGuide && (
                  <div className="absolute left-0 top-7 z-50 w-80 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-200 dark:border-slate-700 p-4 space-y-2 text-xs">
                    <p className="font-semibold text-gray-900 dark:text-white text-sm">How Farrowing Management Works</p>
                    <div className="space-y-1.5 text-gray-600 dark:text-slate-300">
                      <div><strong>Step 1:</strong> Record the breeding/insemination date (or mark as unknown)</div>
                      <div><strong>Step 2:</strong> System tracks gestation progress (114 day cycle)</div>
                      <div><strong>Step 3:</strong> AI monitors sow behavior for pre-farrowing signs</div>
                      <div><strong>Step 4:</strong> When farrowing begins, record births and monitor piglets</div>
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
              {sow && sow.status === 'lactating' && !activeFarrowing && (
                <button
                  onClick={() => setShowNewFarrowForm(!showNewFarrowForm)}
                  className="flex items-center gap-2 px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-xl text-sm font-medium transition-all duration-200 hover:shadow-lg"
                >
                  <Plus className="h-4 w-4" /> Record Birth
                </button>
              )}
              {!sow && !loading && (
                <button
                  onClick={() => setShowSowSelector(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-medium transition-all duration-200 hover:shadow-lg hover:shadow-amber-500/25 hover:-translate-y-0.5"
                >
                  <UserPlus className="h-4 w-4" /> Assign Sow
                </button>
              )}
              {sow && (
                <button
                  onClick={() => setShowSowSelector(!showSowSelector)}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-slate-400 bg-gray-100 dark:bg-slate-700/40 hover:bg-gray-200 dark:hover:bg-slate-700/60 rounded-lg transition-colors"
                >
                  <RefreshCw className="h-3 w-3" /> Change Sow
                </button>
              )}
            </div>
          </div>

          {/* ── Sow Selector Panel ─────────────────────────────────── */}
          {showSowSelector && (
            <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-indigo-200 dark:border-indigo-800 p-5 space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-indigo-500" />
                  {sow ? 'Change Sow Assignment' : 'Assign a Sow to This Pen'}
                </h3>
                <button
                  onClick={() => { setShowSowSelector(false); setSowSearch(''); }}
                  className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-slate-300"
                >
                  Close
                </button>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by tag, name, breed..."
                  value={sowSearch}
                  onChange={(e) => setSowSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700/30 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Sow list */}
              <div className="max-h-60 overflow-y-auto divide-y divide-gray-100 dark:divide-slate-700 rounded-xl border border-gray-200 dark:border-slate-700">
                {filteredSows.length === 0 ? (
                  <div className="p-6 text-center text-gray-400 dark:text-slate-500 text-sm">No sows found</div>
                ) : (
                  filteredSows.map((s) => (
                    <button
                      key={s.id}
                      disabled={assigningSow}
                      onClick={() => handleAssignSow(s)}
                      className={clsx(
                        'w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors',
                        s.id === sow?.id && 'bg-indigo-50 dark:bg-indigo-900/20'
                      )}
                    >
                      <div className="h-8 w-8 rounded-full bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center flex-shrink-0">
                        <Heart className="h-4 w-4 text-pink-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {s.tag_id}{s.name ? ` — ${s.name}` : ''}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-slate-400 truncate capitalize">
                          {s.status} • Parity {s.parity}{s.breed ? ` • ${s.breed}` : ''}{s.pen_id ? ` • Pen ${s.pen_id}` : ''}
                        </p>
                      </div>
                      {s.id === sow?.id && (
                        <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full">Current</span>
                      )}
                    </button>
                  ))
                )}
              </div>
              <p className="text-[10px] text-gray-400 dark:text-slate-500">
                Showing {filteredSows.length} of {allSows.length} registered sows. Click a sow to assign to {penName}.
              </p>
            </div>
          )}

          {/* ── ONBOARDING: No sow assigned — guide caretaker ── */}
          {!sow && !loading && (
            <div className="bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 dark:from-amber-900/20 dark:via-orange-900/15 dark:to-yellow-900/10 rounded-2xl border-2 border-dashed border-amber-300 dark:border-amber-700 p-8 text-center space-y-4">
              <div className="h-16 w-16 rounded-full bg-amber-100 dark:bg-amber-800/40 flex items-center justify-center mx-auto">
                <ClipboardList className="h-8 w-8 text-amber-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">No Sow Assigned to {penName}</h3>
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
                  To start tracking farrowing, breeding records, and piglet monitoring, a sow must first be assigned to this pen.
                </p>
              </div>
              <div className="bg-white dark:bg-slate-800/50 rounded-xl p-4 max-w-sm mx-auto text-left space-y-2 text-xs text-gray-600 dark:text-slate-300">
                <p className="font-semibold text-gray-900 dark:text-white text-sm">What you'll be able to do:</p>
                <div className="flex items-start gap-2"><CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" /><span>Record breeding/insemination dates with auto gestation tracking</span></div>
                <div className="flex items-start gap-2"><CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" /><span>Log births with piglet counts, stillborns, and notes</span></div>
                <div className="flex items-start gap-2"><CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" /><span>Get AI-powered crushing risk monitoring and alerts</span></div>
                <div className="flex items-start gap-2"><CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" /><span>View farrowing history, stats, and lifecycle management</span></div>
              </div>
              <button
                onClick={() => setShowSowSelector(true)}
                className="mt-2 flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-medium transition-all duration-200 hover:shadow-lg hover:shadow-amber-500/25 hover:-translate-y-0.5 mx-auto"
              >
                <UserPlus className="h-4 w-4" /> Assign a Sow Now
              </button>
            </div>
          )}

          {/* ── PROMPT: Sow active/inactive — prompt to record breeding ── */}
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

          {/* ── PROMPT: Sow weaned — prompt for next breeding cycle ── */}
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

          {/* ── PROMPT: Sow lactating with no active farrowing — prompt to record birth ── */}
          {sow && sow.status === 'lactating' && !activeFarrowing && !showNewFarrowForm && (
            <div className="bg-gradient-to-r from-pink-50 to-rose-50 dark:from-pink-900/20 dark:to-rose-900/15 rounded-2xl border-2 border-dashed border-pink-300 dark:border-pink-700 p-6 space-y-4">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-full bg-pink-100 dark:bg-pink-800/40 flex items-center justify-center flex-shrink-0">
                  <Baby className="h-6 w-6 text-pink-500" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900 dark:text-white">Record Birth Details</h3>
                  <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                    Sow <strong>{sow.tag_id}</strong>{sow.name ? ` (${sow.name})` : ''} is marked as <strong>lactating</strong> but has no active farrowing record. Please log the birth details so the system can track piglet welfare.
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

          {/* ── PROMPT: Sow pregnant, no active farrowing — health check reminder ── */}
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

          {/* ── STEP 1: Breeding/Insemination Input ── */}
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
                      else setEstimatedFarrowingDate('');
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
                <div className="space-y-4">
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2 text-amber-700 dark:text-amber-300 font-semibold text-sm">
                      <AlertTriangle className="h-4 w-4" /> Pregnant with Unknown Breeding Date
                    </div>
                    <p className="text-sm text-amber-600 dark:text-amber-300">
                      No problem! You can still mark the sow as pregnant. If you have a rough idea when she might farrow, enter an estimated date below. Otherwise, the system will rely on <strong>behavioral detection</strong> (posture switching, restlessness, reduced appetite) to alert you.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                        <Calendar className="inline h-4 w-4 mr-1" /> Estimated Farrowing — From <span className="text-xs text-gray-400 dark:text-slate-500">(optional)</span>
                      </label>
                      <input
                        type="date"
                        title="Estimated farrowing date (earliest)"
                        value={estimatedFarrowingDateFrom}
                        onChange={(e) => setEstimatedFarrowingDateFrom(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                        <Calendar className="inline h-4 w-4 mr-1" /> Estimated Farrowing — To <span className="text-xs text-gray-400 dark:text-slate-500">(optional)</span>
                      </label>
                      <input
                        type="date"
                        title="Estimated farrowing date (latest)"
                        value={estimatedFarrowingDateTo}
                        onChange={(e) => setEstimatedFarrowingDateTo(e.target.value)}
                        min={estimatedFarrowingDateFrom || new Date().toISOString().split('T')[0]}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 text-sm"
                      />
                    </div>
                    {(estimatedFarrowingDateFrom || estimatedFarrowingDateTo) && (
                      <div className="sm:col-span-2">
                        <div className="w-full px-3 py-2 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 text-sm font-semibold">
                          {(() => {
                            const from = estimatedFarrowingDateFrom ? Math.ceil((new Date(estimatedFarrowingDateFrom).getTime() - Date.now()) / 86400000) : null;
                            const to = estimatedFarrowingDateTo ? Math.ceil((new Date(estimatedFarrowingDateTo).getTime() - Date.now()) / 86400000) : null;
                            if (from !== null && to !== null) {
                              return from <= 0 && to <= 0 ? 'Overdue / Due now!' : `~${Math.max(0, from)}–${Math.max(0, to)} days remaining`;
                            }
                            if (from !== null) return from <= 0 ? 'Overdue / Due now!' : `~${from} days remaining (earliest)`;
                            if (to !== null) return to <= 0 ? 'Overdue / Due now!' : `~${to} days remaining (latest)`;
                            return '';
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-sm">
                <div className="flex items-center gap-2 mb-2 text-blue-700 dark:text-blue-300 font-semibold">
                  <Sparkles className="h-4 w-4" /> What happens when you save
                </div>
                <ul className="space-y-1 text-blue-600 dark:text-blue-300">
                  <li>• Sow status changes from <strong>{sow.status}</strong> → <strong>pregnant</strong></li>
                  {unknownBreedingDate ? (
                    <>
                      {(estimatedFarrowingDateFrom || estimatedFarrowingDateTo) && (
                        <li>• Estimated farrowing range set to{' '}
                          {estimatedFarrowingDateFrom && new Date(estimatedFarrowingDateFrom).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                          {estimatedFarrowingDateFrom && estimatedFarrowingDateTo && ' — '}
                          {estimatedFarrowingDateTo && new Date(estimatedFarrowingDateTo).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                        </li>
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
                  onClick={() => { setShowBreedingForm(false); setUnknownBreedingDate(false); setEstimatedFarrowingDate(''); }}
                  className="px-4 py-2.5 text-sm text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 2: Gestation Tracker (pregnant sow, not yet farrowed) ── */}
          {sow && sow.status === 'pregnant' && !activeFarrowing && (
            <div className="space-y-4">
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
                            detail="No estimated farrowing date. Watch for physical signs: udder enlargement, vulva swelling, increased posture switching, reduced appetite."
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
                                ? 'High parity sow. May have larger but weaker litters.'
                                : sow.parity >= 5
                                ? 'Experienced sow but aging. Monitor for overlay risk.'
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
                            <li>• <strong>Milk letdown</strong> — milk can be expressed from teats (high probability of imminent farrowing within &lt;12 hours, not a guaranteed 24h predictor)</li>
                            <li>• <strong>Restlessness / posture switching</strong> — frequent position changes (AI detects this via increased posture switching frequency)</li>
                            <li>• <strong>Restlessness</strong> — frequent position changes, getting up and lying down</li>
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
                          <strong>Note:</strong> Breeding date unknown — focus on behavioral signs as due date approaches.
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

                  // Full tracking: both breeding date and expected date
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

                      {/* Insight cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <InsightCard
                          status={daysRemaining <= 3 ? 'critical' : daysRemaining <= 7 ? 'warning' : 'good'}
                          icon={<Calendar className="h-5 w-5" />}
                          label="Due Date"
                          value={daysRemaining <= 0 ? 'Overdue!' : `${daysRemaining} days`}
                          detail={
                            daysRemaining <= 0
                              ? 'Sow is past due date. Watch for imminent farrowing signs.'
                              : daysRemaining <= 3
                              ? 'Farrowing imminent. Prepare pen: check heat lamp, have supplies ready, monitor 24/7.'
                              : daysRemaining <= 7
                              ? 'Farrowing approaching. Watch for increased posture switching and restlessness.'
                              : daysRemaining <= 14
                              ? 'Late gestation. Increase feed to support rapid piglet growth.'
                              : 'Normal gestation progress. Continue regular monitoring.'
                          }
                        />
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
                              ? 'Early gestation. Standard diet. Avoid overfeeding.'
                              : gestationDays <= 85
                              ? 'Mid gestation. Maintain 2.0-2.5kg/day feed.'
                              : gestationDays <= 100
                              ? 'Increase feed to 2.5-3.0kg/day. Piglets growing rapidly.'
                              : 'Pre-farrowing. Increase to 3.0-3.5kg/day. Ensure vitamin E and selenium.'
                          }
                        />
                        <InsightCard
                          status={sow.parity >= 5 ? 'warning' : 'good'}
                          icon={<Shield className="h-5 w-5" />}
                          label="Risk Profile"
                          value={`Parity ${sow.parity}`}
                          detail={
                            sow.parity === 0
                              ? 'Gilt (first farrowing). Higher risk of prolonged labor.'
                              : sow.parity >= 7
                              ? 'High parity sow. May have larger but weaker litters.'
                              : sow.parity >= 5
                              ? 'Experienced sow but aging. Monitor for overlay risk.'
                              : 'Good parity range. Expected normal farrowing outcomes.'
                          }
                        />
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* ── Sow Lifecycle Status Management ── */}
          {sow && (
            <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-gray-200 dark:border-slate-700 p-5">
              <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-3">
                <Activity className="h-5 w-5 text-indigo-500" /> Sow Lifecycle Status
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                {(['active', 'pregnant', 'lactating', 'weaned', 'inactive'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => handleUpdateSowStatus(s)}
                    disabled={sow.status === s}
                    className={clsx(
                      'px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 border',
                      sow.status === s
                        ? s === 'active' ? 'bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300'
                        : s === 'pregnant' ? 'bg-purple-100 dark:bg-purple-900/30 border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300'
                        : s === 'lactating' ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                        : 'bg-gray-100 dark:bg-slate-700/30 border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300'
                        : 'bg-white dark:bg-slate-700/20 border-gray-200 dark:border-slate-600 text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700/40 cursor-pointer'
                    )}
                  >
                    {sow.status === s && <CheckCircle className="inline h-3.5 w-3.5 mr-1" />}
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 dark:text-slate-500 mt-2">
                Current: <strong className="capitalize">{sow.status}</strong>. Click to manually change the sow's lifecycle status.
              </p>
            </div>
          )}

          {/* New farrowing form */}
          {showNewFarrowForm && sow && (
            <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-pink-200 dark:border-pink-800 p-6 space-y-4">
              <h3 className="font-semibold text-gray-900 dark:text-white">New Farrowing Event</h3>
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Sow <strong>{sow.tag_id}</strong> — {penName}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Date */}
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
                {/* Time */}
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
                {/* Piglets born alive */}
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
                {/* Stillborn */}
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

              {/* Notes */}
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

              {/* AI recommendation based on input */}
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
                    {sow && sow.parity >= 5 && (
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

          {/* Stats summary (pen-level or global) */}
          {farrowingStats && (
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

          {/* Farrowing records list */}
          <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700">
              <h3 className="font-semibold text-gray-900 dark:text-white">Farrowing History</h3>
            </div>
            {farrowingRecords.length === 0 ? (
              <div className="p-8 text-center text-gray-400 dark:text-slate-500">
                <Heart className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p>No farrowing records for this pen yet.</p>
                {sow && (
                  <button
                    onClick={() => setShowNewFarrowForm(true)}
                    className="mt-3 text-sm text-pink-600 dark:text-pink-400 hover:underline"
                  >
                    Record first farrowing →
                  </button>
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

                    {/* Expanded detail */}
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

                        {/* Monitoring recommendations for this record */}
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

                        {/* Complete button */}
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

      {/* InsightCard used in farrowing gestation tracker */}

      {/* ━━━━━━━━━━━━━━━━ TAB: EVENTS & ALERTS ━━━━━━━━━━━━━━━━━ */}
      {activeTab === 'health' && (
        <div className="space-y-5 animate-fade-in">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Active alerts */}
            <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <h3 className="font-semibold text-gray-900 dark:text-white">Active Alerts</h3>
                <span className="ml-auto px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-xs font-medium">
                  {penAlerts?.filter((a) => !a.is_resolved).length ?? 0}
                </span>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-slate-700 max-h-[400px] overflow-y-auto">
                {(!penAlerts || penAlerts.length === 0) ? (
                  <div className="p-8 text-center text-gray-400 dark:text-slate-500">
                    <Shield className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No active alerts</p>
                  </div>
                ) : (
                  penAlerts.map((alert) => (
                    <div key={alert.id} className="px-5 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/20">
                      <div className="flex items-start gap-3">
                        <span className={clsx(
                          'mt-0.5 h-2.5 w-2.5 rounded-full flex-shrink-0',
                          alert.severity === 'critical' ? 'bg-red-500' :
                          alert.severity === 'high' ? 'bg-orange-500' :
                          alert.severity === 'medium' ? 'bg-yellow-500' : 'bg-blue-500'
                        )} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{alert.title}</p>
                          {alert.message && (
                            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{alert.message}</p>
                          )}
                          <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
                            {new Date(alert.created_at).toLocaleString()}
                          </p>
                        </div>
                        <span className={clsx(
                          'px-2 py-0.5 rounded-full text-xs font-medium capitalize',
                          alert.severity === 'critical' ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                            : alert.severity === 'high' ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300'
                            : 'bg-gray-100 dark:bg-gray-700/40 text-gray-700 dark:text-gray-300'
                        )}>
                          {alert.severity}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Recent events */}
            <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-blue-500" />
                <h3 className="font-semibold text-gray-900 dark:text-white">Recent Events</h3>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-slate-700 max-h-[400px] overflow-y-auto">
                {penEvents.length === 0 ? (
                  <div className="p-8 text-center text-gray-400 dark:text-slate-500">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No events recorded</p>
                  </div>
                ) : (
                  penEvents.map((ev) => (
                    <div key={ev.id} className="px-5 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/20">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 h-8 w-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
                          <Activity className="h-4 w-4 text-blue-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 dark:text-white">{ev.description || ev.type}</p>
                          <p className="text-xs text-gray-400 dark:text-slate-500">
                            {new Date(ev.created_at).toLocaleString()} • {ev.category || ev.type}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Typewriter text component (animates once on mount only) ────────────────

function TypewriterText({ text, speed = 18, className }: { text: string; speed?: number; className?: string }) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  const hasAnimated = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (hasAnimated.current) {
      // Already animated once — show updates instantly
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

// ─── InsightCard (reusable) ─────────────────────────────────────────────────

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
      <p className="text-xs leading-relaxed opacity-80">{detail}</p>
    </div>
  );
}

// ─── LiveStatCard ───────────────────────────────────────────────────────────
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

// ─── MiniSparkline ──────────────────────────────────────────────────────────
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
  const areaPoints = [`0,${h}`, ...points, `${w},${h}`].join(' ');

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: `${height}px` }} preserveAspectRatio="none">
      <line x1="0" y1={expectedY} x2={w} y2={expectedY} stroke={warningColor} strokeWidth="0.3" strokeDasharray="2,2" opacity="0.5" />
      <polygon points={areaPoints} fill={color} opacity="0.1" />
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="0.5" />
      {sampled.length > 0 && (() => {
        const lastX = w;
        const lastY = h - ((sampled[sampled.length - 1] - minVal) / range) * h;
        const isBelow = !isPercentage ? sampled[sampled.length - 1] < expected : sampled[sampled.length - 1] > expected;
        return <circle cx={lastX} cy={lastY} r="1.5" fill={isBelow ? warningColor : color} />;
      })()}
      <text x="1" y={expectedY - 1} fill={warningColor} fontSize="3" opacity="0.7">
        {isPercentage ? `${expected}%` : expected}
      </text>
    </svg>
  );
}

// ─── PostureTimelineBar ─────────────────────────────────────────────────────
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

// ─── EventFeedItem ──────────────────────────────────────────────────────────
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
              @ {event.videoTime.toFixed(1)}s elapsed
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

// ─── Farrowing Engine Panel ─────────────────────────────────────────────────

const STATE_CONFIG: Record<string, { label: string; color: string; bg: string; description: string }> = {
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

function FarrowingEnginePanel({
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
  const cfg = STATE_CONFIG[state] || STATE_CONFIG.NORMAL_MONITORING;
  const recentAlerts = alerts.slice(0, 5);
  const recentSafety = safetyChecks.slice(-3);
  const [showGuide, setShowGuide] = useState(false);
  const [showMetrics, setShowMetrics] = useState(false);

  return (
    <div className={clsx('rounded-2xl border-2 p-4 sm:p-5 space-y-4', cfg.bg)}>
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
          <button
            onClick={() => setShowMetrics((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors"
            title="Toggle advanced metrics"
          >
            <div className="flex items-center gap-3">
              <Activity className="h-4 w-4 text-indigo-500" />
              <span className="text-xs font-semibold text-gray-700 dark:text-slate-300">Advanced Metrics</span>
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
            {showMetrics ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
          </button>

          {showMetrics && (
            <div className="px-4 pb-4 pt-1 space-y-3">
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

              {/* Mini Trend Chart */}
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
          {/* Stagnation Escalation Alert */}
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
                  <span className={clsx('text-xs font-bold uppercase tracking-wider', stagnationResult.color)}>
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
