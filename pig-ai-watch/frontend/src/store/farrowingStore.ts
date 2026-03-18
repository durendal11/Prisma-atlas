import { create } from 'zustand';

// ─── System States (Section 1) ──────────────────────────────────────────────

export type FarrowingSystemState =
  | 'NORMAL_MONITORING'
  | 'PREDICTION_HIGH'
  | 'FARROWING_STARTED'
  | 'FARROWING_ACTIVE'
  | 'FARROWING_COMPLETED';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PredictionMetrics {
  postureTransitionsPerHour: number;
  nestingCountPerHour: number;       // posture switching events per hour (lying→standing→lying cycles)
  percentTimeLying: number;
  activityScore: number;
  vulvaVisibilityFlag: boolean;
  farrowingProbability: 'LOW' | 'MODERATE' | 'HIGH';
  lastEvalTimestamp: number;
  previousActivityScores: number[];  // rolling 3-hour history
}

export interface BirthEvent {
  id: string;
  pigletNumber: number;
  detectedAt: number;          // wall clock
  confidence: number;
  pigletCountAtDetection: number;
}

export interface FarrowingSession {
  id: string;
  sowId?: number;
  penId?: number;
  startedAt: number;
  completedAt?: number;
  durationMinutes?: number;
  totalBorn: number;
  birthEvents: BirthEvent[];
  lastNewPigletAt: number;
  crushingIncidents: number;
  // Logging
  predictionTriggeredAt?: number;
  predictionScore?: number;
}

export interface FarrowingAlert {
  id: string;
  timestamp: number;
  type: 'prediction_high' | 'farrowing_started' | 'farrowing_active' | 'farrowing_completed' | 'piglet_born' | 'crushing_risk' | 'no_progress';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  data?: Record<string, unknown>;
}

export interface SafetyCheck {
  timestamp: number;
  type: 'abrupt_posture_change' | 'piglet_under_sow' | 'piglet_motionless';
  description: string;
  severity: 'warning' | 'critical';
}

// ─── Hourly Behavior Metrics (Section 7) ────────────────────────────────────

export interface HourlyMetrics {
  hour: number;            // unix timestamp of the hour start
  postureTransitions: number;
  nestingEvents: number;           // posture switching events (lying→standing→lying cycles)
  percentLying: number;
  activityScore: number;
  pigletCountAvg: number;
  crushingRiskAvg: number;
}

// ─── Store Interface ────────────────────────────────────────────────────────

interface FarrowingStoreState {
  // Core state machine
  systemState: FarrowingSystemState;
  previousState: FarrowingSystemState | null;
  stateChangedAt: number;

  // Prediction (Section 2)
  prediction: PredictionMetrics;
  monitoringIntervalMinutes: number;   // 60 normally, 30 when HIGH

  // Current session (Sections 3-4)
  activeSession: FarrowingSession | null;

  // Piglet tracking
  currentPigletCount: number;
  previousPigletCount: number;
  pigletStableFrames: number;          // frames piglet has been visible
  pigletConfidenceBuffer: number[];    // recent confidence scores

  // Safety (Section 5)
  safetyChecks: SafetyCheck[];
  lastSowPosture: string;
  lastPostureChangeAt: number;
  motionlessPigletFrames: number;

  // Alerts
  alerts: FarrowingAlert[];
  maxAlerts: number;

  // Hourly metrics log (Section 7)
  hourlyMetrics: HourlyMetrics[];

  // Timers
  noNewPigletSinceMs: number;          // ms since last new piglet
  completionDelayMs: number;           // 2-hour reset timer after completion
  lastPredictionRunAt: number;

  // Completed sessions history
  completedSessions: FarrowingSession[];

  // Actions
  transitionTo: (state: FarrowingSystemState) => void;
  updatePrediction: (metrics: Partial<PredictionMetrics>) => void;
  setPredictionProbability: (prob: 'LOW' | 'MODERATE' | 'HIGH') => void;
  setMonitoringInterval: (minutes: number) => void;

  startFarrowingSession: (sowId?: number, penId?: number) => void;
  addBirthEvent: (event: Omit<BirthEvent, 'id'>) => void;
  completeFarrowingSession: () => void;
  incrementCrushingIncident: () => void;

  updatePigletTracking: (count: number, confidence: number) => void;
  addSafetyCheck: (check: Omit<SafetyCheck, 'timestamp'>) => void;
  addAlert: (alert: Omit<FarrowingAlert, 'id' | 'timestamp'>) => void;
  addHourlyMetrics: (metrics: HourlyMetrics) => void;

  updateTimers: (noNewPigletMs: number) => void;
  setLastPredictionRun: (ts: number) => void;

  resetToNormal: () => void;
  getSessionSummary: () => FarrowingSession | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

let farrowingAlertCounter = 0;
const genAlertId = () => `far-${++farrowingAlertCounter}-${Date.now()}`;
let birthEventCounter = 0;
const genBirthId = () => `birth-${++birthEventCounter}-${Date.now()}`;
const genSessionId = () => `fs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// ─── Initial State ──────────────────────────────────────────────────────────

const initialPrediction: PredictionMetrics = {
  postureTransitionsPerHour: 0,
  nestingCountPerHour: 0,
  percentTimeLying: 0,
  activityScore: 0,
  vulvaVisibilityFlag: false,
  farrowingProbability: 'LOW',
  lastEvalTimestamp: 0,
  previousActivityScores: [],
};

const initialState = {
  systemState: 'NORMAL_MONITORING' as FarrowingSystemState,
  previousState: null as FarrowingSystemState | null,
  stateChangedAt: Date.now(),

  prediction: { ...initialPrediction },
  monitoringIntervalMinutes: 60,

  activeSession: null as FarrowingSession | null,

  currentPigletCount: 0,
  previousPigletCount: 0,
  pigletStableFrames: 0,
  pigletConfidenceBuffer: [] as number[],

  safetyChecks: [] as SafetyCheck[],
  lastSowPosture: '',
  lastPostureChangeAt: Date.now(),
  motionlessPigletFrames: 0,

  alerts: [] as FarrowingAlert[],
  maxAlerts: 100,

  hourlyMetrics: [] as HourlyMetrics[],

  noNewPigletSinceMs: 0,
  completionDelayMs: 0,
  lastPredictionRunAt: 0,

  completedSessions: [] as FarrowingSession[],
};

// ─── Store ──────────────────────────────────────────────────────────────────

export const useFarrowingStore = create<FarrowingStoreState>((set, get) => ({
  ...initialState,

  // ── State Machine ─────────────────────────────────────────────────────

  transitionTo: (newState: FarrowingSystemState) => {
    const current = get().systemState;
    console.log(`[Farrowing] State: ${current} → ${newState}`);
    set({
      previousState: current,
      systemState: newState,
      stateChangedAt: Date.now(),
    });
  },

  // ── Prediction ────────────────────────────────────────────────────────

  updatePrediction: (metrics: Partial<PredictionMetrics>) =>
    set((s) => ({
      prediction: { ...s.prediction, ...metrics, lastEvalTimestamp: Date.now() },
    })),

  setPredictionProbability: (prob: 'LOW' | 'MODERATE' | 'HIGH') =>
    set((s) => ({
      prediction: { ...s.prediction, farrowingProbability: prob },
    })),

  setMonitoringInterval: (minutes: number) =>
    set({ monitoringIntervalMinutes: minutes }),

  // ── Farrowing Session ─────────────────────────────────────────────────

  startFarrowingSession: (sowId?: number, penId?: number) => {
    const now = Date.now();
    const session: FarrowingSession = {
      id: genSessionId(),
      sowId,
      penId,
      startedAt: now,
      totalBorn: 0,
      birthEvents: [],
      lastNewPigletAt: now,
      crushingIncidents: 0,
      predictionTriggeredAt: get().prediction.lastEvalTimestamp || undefined,
      predictionScore: get().prediction.farrowingProbability === 'HIGH' ? 1 : 0,
    };
    set({ activeSession: session });
  },

  addBirthEvent: (event: Omit<BirthEvent, 'id'>) =>
    set((s) => {
      if (!s.activeSession) return {};
      const birthEvent: BirthEvent = { ...event, id: genBirthId() };
      const updatedSession: FarrowingSession = {
        ...s.activeSession,
        birthEvents: [...s.activeSession.birthEvents, birthEvent],
        totalBorn: s.activeSession.totalBorn + 1,
        lastNewPigletAt: Date.now(),
      };
      return { activeSession: updatedSession, noNewPigletSinceMs: 0 };
    }),

  completeFarrowingSession: () =>
    set((s) => {
      if (!s.activeSession) return {};
      const now = Date.now();
      const completed: FarrowingSession = {
        ...s.activeSession,
        completedAt: now,
        durationMinutes: Math.round((now - s.activeSession.startedAt) / 60000),
      };
      return {
        activeSession: null,
        completedSessions: [...s.completedSessions, completed],
      };
    }),

  incrementCrushingIncident: () =>
    set((s) => {
      if (!s.activeSession) return {};
      return {
        activeSession: {
          ...s.activeSession,
          crushingIncidents: s.activeSession.crushingIncidents + 1,
        },
      };
    }),

  // ── Piglet Tracking ───────────────────────────────────────────────────

  updatePigletTracking: (count: number, confidence: number) =>
    set((s) => {
      const buffer = [...s.pigletConfidenceBuffer, confidence].slice(-10);
      const stableFrames = count === s.currentPigletCount
        ? s.pigletStableFrames + 1
        : 0;
      return {
        previousPigletCount: s.currentPigletCount,
        currentPigletCount: count,
        pigletStableFrames: stableFrames,
        pigletConfidenceBuffer: buffer,
      };
    }),

  // ── Safety ────────────────────────────────────────────────────────────

  addSafetyCheck: (check: Omit<SafetyCheck, 'timestamp'>) =>
    set((s) => ({
      safetyChecks: [...s.safetyChecks.slice(-49), { ...check, timestamp: Date.now() }],
    })),

  // ── Alerts ────────────────────────────────────────────────────────────

  addAlert: (alert: Omit<FarrowingAlert, 'id' | 'timestamp'>) =>
    set((s) => ({
      alerts: [
        { ...alert, id: genAlertId(), timestamp: Date.now() },
        ...s.alerts,
      ].slice(0, s.maxAlerts),
    })),

  // ── Hourly Metrics ────────────────────────────────────────────────────

  addHourlyMetrics: (metrics: HourlyMetrics) =>
    set((s) => ({
      hourlyMetrics: [...s.hourlyMetrics.slice(-167), metrics], // keep 7 days
    })),

  // ── Timers ────────────────────────────────────────────────────────────

  updateTimers: (noNewPigletMs: number) => set({ noNewPigletSinceMs: noNewPigletMs }),

  setLastPredictionRun: (ts: number) => set({ lastPredictionRunAt: ts }),

  // ── Reset ─────────────────────────────────────────────────────────────

  resetToNormal: () => {
    farrowingAlertCounter = 0;
    birthEventCounter = 0;
    set({
      ...initialState,
      completedSessions: get().completedSessions, // preserve history
      hourlyMetrics: get().hourlyMetrics,          // preserve metrics
    });
  },

  // ── Summary ───────────────────────────────────────────────────────────

  getSessionSummary: (): FarrowingSession | null => {
    const s = get();
    return s.activeSession || (s.completedSessions.length > 0
      ? s.completedSessions[s.completedSessions.length - 1]
      : null);
  },
}));
