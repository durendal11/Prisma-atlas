import { create } from 'zustand';

// ─── Types ──────────────────────────────────────────────────────────────────

export type EventType =
  | 'posture_change'
  | 'nursing_start'
  | 'nursing_end'
  | 'feeding_start'
  | 'feeding_end'
  | 'piglet_count_drop'
  | 'piglet_count_recovered'
  | 'risk_escalation'
  | 'risk_deescalation'
  | 'cross_pen_detection'
  | 'activity_alert'
  | 'health_warning'
  | 'session_start'
  | 'session_end';

export type EventSeverity = 'info' | 'warning' | 'critical';

export interface SimulationEvent {
  id: string;
  timestamp: number;
  videoTime: number;
  type: EventType;
  severity: EventSeverity;
  title: string;
  description: string;
  icon?: string;
  data?: Record<string, unknown>;
}

export interface NursingSession {
  id: string;
  startTime: number;
  startVideoTime: number;
  endTime?: number;
  endVideoTime?: number;
  durationMs?: number;
}

export interface PostureSegment {
  posture: string;
  startTime: number;
  startVideoTime: number;
  endTime: number;
  endVideoTime: number;
  durationMs: number;
}

export interface PigletCountEntry {
  timestamp: number;
  videoTime: number;
  count: number;
  expected: number;
}

export interface RiskEntry {
  timestamp: number;
  videoTime: number;
  risk: number;
  level: string;
}

export interface HealthEntry {
  timestamp: number;
  videoTime: number;
  score: number;
}

export interface SimulationStats {
  // Nursing
  totalNursingSessions: number;
  totalNursingDurationMs: number;
  avgNursingDurationMs: number;
  nursingPercentage: number;
  // Posture
  feedingPercentage: number;
  sleepingPercentage: number;
  standingPercentage: number;
  postureChanges: number;
  // Piglets
  avgPigletCount: number;
  minPigletCount: number;
  maxPigletCount: number;
  pigletCountDrops: number;
  // Risk
  avgCrushingRisk: number;
  maxCrushingRisk: number;
  timeAboveHighRisk: number; // ms at risk >= 0.65
  // Health
  avgHealthScore: number;
  minHealthScore: number;
  // Events
  totalEvents: number;
  criticalEvents: number;
  warningEvents: number;
  // Cross-pen
  crossPenDetections: number;
  // Session
  sessionDurationMs: number;
  framesProcessed: number;
}

// ─── Store Interface ────────────────────────────────────────────────────────

interface SimulationState {
  // Session control
  isSimulating: boolean;
  simulationStartTime: number | null;
  expectedPigletCount: number;

  // Events feed
  events: SimulationEvent[];
  maxEvents: number;

  // Nursing sessions
  nursingSessions: NursingSession[];
  currentNursingSession: NursingSession | null;

  // Posture timeline
  postureTimeline: PostureSegment[];
  currentPosture: string | null;
  currentPostureStart: number | null;
  currentPostureStartVideo: number | null;

  // Piglet count history
  pigletCountHistory: PigletCountEntry[];
  lastStablePigletCount: number;
  pigletDropAlert: boolean;

  // Risk history
  riskHistory: RiskEntry[];
  sustainedHighRisk: boolean;
  highRiskStartTime: number | null;

  // Health history
  healthHistory: HealthEntry[];

  // Running counters for stats
  totalPostureChanges: number;
  totalCrossPenDetections: number;
  framesProcessed: number;
  nursingFrames: number;
  feedingFrames: number;
  sleepingFrames: number;
  standingFrames: number;
  totalPigletSum: number;
  totalRiskSum: number;
  totalHealthSum: number;
  highRiskDurationMs: number;

  // Actions
  startSimulation: (expectedPiglets: number) => void;
  stopSimulation: () => void;
  addEvent: (event: Omit<SimulationEvent, 'id'>) => void;
  addNursingSession: (session: NursingSession) => void;
  setCurrentNursingSession: (session: NursingSession | null) => void;
  addPostureSegment: (segment: PostureSegment) => void;
  updatePosture: (posture: string, timestamp: number, videoTime: number) => void;
  addPigletCount: (entry: PigletCountEntry) => void;
  setPigletDropAlert: (alert: boolean) => void;
  addRiskEntry: (entry: RiskEntry) => void;
  setSustainedHighRisk: (high: boolean, startTime?: number) => void;
  addHealthEntry: (entry: HealthEntry) => void;
  incrementFrames: () => void;
  incrementCrossPenDetections: () => void;
  addFrameStats: (nursing: boolean, feeding: boolean, sleeping: boolean, standing: boolean, pigletCount: number, risk: number, healthScore: number) => void;
  addHighRiskDuration: (ms: number) => void;
  getStats: () => SimulationStats;
  resetSimulation: () => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

let eventCounter = 0;
const genEventId = () => `evt-${++eventCounter}-${Date.now()}`;
const genSessionId = () => `ns-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

// ─── Store ──────────────────────────────────────────────────────────────────

const initialState = {
  isSimulating: false,
  simulationStartTime: null as number | null,
  expectedPigletCount: 9,
  events: [] as SimulationEvent[],
  maxEvents: 200,
  nursingSessions: [] as NursingSession[],
  currentNursingSession: null as NursingSession | null,
  postureTimeline: [] as PostureSegment[],
  currentPosture: null as string | null,
  currentPostureStart: null as number | null,
  currentPostureStartVideo: null as number | null,
  pigletCountHistory: [] as PigletCountEntry[],
  lastStablePigletCount: 0,
  pigletDropAlert: false,
  riskHistory: [] as RiskEntry[],
  sustainedHighRisk: false,
  highRiskStartTime: null as number | null,
  healthHistory: [] as HealthEntry[],
  totalPostureChanges: 0,
  totalCrossPenDetections: 0,
  framesProcessed: 0,
  nursingFrames: 0,
  feedingFrames: 0,
  sleepingFrames: 0,
  standingFrames: 0,
  totalPigletSum: 0,
  totalRiskSum: 0,
  totalHealthSum: 0,
  highRiskDurationMs: 0,
};

export const useSimulationStore = create<SimulationState>((set, get) => ({
  ...initialState,

  startSimulation: (expectedPiglets: number) =>
    set({
      isSimulating: true,
      simulationStartTime: Date.now(),
      expectedPigletCount: expectedPiglets,
    }),

  stopSimulation: () => {
    const state = get();
    // Close any open nursing session
    if (state.currentNursingSession) {
      const now = Date.now();
      const completed: NursingSession = {
        ...state.currentNursingSession,
        endTime: now,
        endVideoTime: 0,
        durationMs: now - state.currentNursingSession.startTime,
      };
      set((s) => ({
        isSimulating: false,
        nursingSessions: [...s.nursingSessions, completed],
        currentNursingSession: null,
      }));
    } else {
      set({ isSimulating: false });
    }
  },

  addEvent: (event) =>
    set((state) => ({
      events: [{ ...event, id: genEventId() }, ...state.events].slice(0, state.maxEvents),
    })),

  addNursingSession: (session) =>
    set((state) => ({ nursingSessions: [...state.nursingSessions, session] })),

  setCurrentNursingSession: (session) => set({ currentNursingSession: session }),

  addPostureSegment: (segment) =>
    set((state) => ({ postureTimeline: [...state.postureTimeline, segment] })),

  updatePosture: (posture: string, timestamp: number, videoTime: number) => {
    const state = get();
    if (state.currentPosture === posture) return; // no change

    // Close previous posture segment
    if (state.currentPosture && state.currentPostureStart) {
      const segment: PostureSegment = {
        posture: state.currentPosture,
        startTime: state.currentPostureStart,
        startVideoTime: state.currentPostureStartVideo ?? 0,
        endTime: timestamp,
        endVideoTime: videoTime,
        durationMs: timestamp - state.currentPostureStart,
      };
      set((s) => ({
        postureTimeline: [...s.postureTimeline, segment],
        currentPosture: posture,
        currentPostureStart: timestamp,
        currentPostureStartVideo: videoTime,
        totalPostureChanges: s.totalPostureChanges + 1,
      }));
    } else {
      set({
        currentPosture: posture,
        currentPostureStart: timestamp,
        currentPostureStartVideo: videoTime,
      });
    }
  },

  addPigletCount: (entry) =>
    set((state) => {
      // Keep last 5 minutes of data (at ~10fps = ~3000 entries, sample every 5th frame)
      const now = Date.now();
      const filtered = [...state.pigletCountHistory, entry].filter(
        (e) => now - e.timestamp < 5 * 60 * 1000
      );
      return { pigletCountHistory: filtered };
    }),

  setPigletDropAlert: (alert) => set({ pigletDropAlert: alert }),

  addRiskEntry: (entry) =>
    set((state) => {
      const now = Date.now();
      const filtered = [...state.riskHistory, entry].filter(
        (e) => now - e.timestamp < 5 * 60 * 1000
      );
      return { riskHistory: filtered };
    }),

  setSustainedHighRisk: (high, startTime) =>
    set({ sustainedHighRisk: high, highRiskStartTime: startTime ?? null }),

  addHealthEntry: (entry) =>
    set((state) => {
      const now = Date.now();
      const filtered = [...state.healthHistory, entry].filter(
        (e) => now - e.timestamp < 5 * 60 * 1000
      );
      return { healthHistory: filtered };
    }),

  incrementFrames: () => set((s) => ({ framesProcessed: s.framesProcessed + 1 })),

  incrementCrossPenDetections: () =>
    set((s) => ({ totalCrossPenDetections: s.totalCrossPenDetections + 1 })),

  addFrameStats: (nursing, feeding, sleeping, standing, pigletCount, risk, healthScore) =>
    set((s) => ({
      nursingFrames: s.nursingFrames + (nursing ? 1 : 0),
      feedingFrames: s.feedingFrames + (feeding ? 1 : 0),
      sleepingFrames: s.sleepingFrames + (sleeping ? 1 : 0),
      standingFrames: s.standingFrames + (standing ? 1 : 0),
      totalPigletSum: s.totalPigletSum + pigletCount,
      totalRiskSum: s.totalRiskSum + risk,
      totalHealthSum: s.totalHealthSum + healthScore,
    })),

  addHighRiskDuration: (ms) =>
    set((s) => ({ highRiskDurationMs: s.highRiskDurationMs + ms })),

  getStats: (): SimulationStats => {
    const s = get();
    const sessionDurationMs = s.simulationStartTime ? Date.now() - s.simulationStartTime : 0;
    const frames = Math.max(1, s.framesProcessed);

    // Nursing stats
    const completedSessions = s.nursingSessions.filter((ns) => ns.durationMs);
    const totalNursingDurationMs = completedSessions.reduce((sum, ns) => sum + (ns.durationMs ?? 0), 0);

    // Piglet stats
    const pigletCounts = s.pigletCountHistory.map((e) => e.count);
    const minPiglet = pigletCounts.length > 0 ? Math.min(...pigletCounts) : 0;
    const maxPiglet = pigletCounts.length > 0 ? Math.max(...pigletCounts) : 0;
    const pigletDrops = s.events.filter((e) => e.type === 'piglet_count_drop').length;

    // Risk
    const riskValues = s.riskHistory.map((e) => e.risk);
    const maxRisk = riskValues.length > 0 ? Math.max(...riskValues) : 0;

    // Health
    const healthValues = s.healthHistory.map((e) => e.score);
    const minHealth = healthValues.length > 0 ? Math.min(...healthValues) : 0;

    return {
      totalNursingSessions: s.nursingSessions.length,
      totalNursingDurationMs,
      avgNursingDurationMs: completedSessions.length > 0 ? totalNursingDurationMs / completedSessions.length : 0,
      nursingPercentage: (s.nursingFrames / frames) * 100,
      feedingPercentage: (s.feedingFrames / frames) * 100,
      sleepingPercentage: (s.sleepingFrames / frames) * 100,
      standingPercentage: (s.standingFrames / frames) * 100,
      postureChanges: s.totalPostureChanges,
      avgPigletCount: s.totalPigletSum / frames,
      minPigletCount: minPiglet,
      maxPigletCount: maxPiglet,
      pigletCountDrops: pigletDrops,
      avgCrushingRisk: s.totalRiskSum / frames,
      maxCrushingRisk: maxRisk,
      timeAboveHighRisk: s.highRiskDurationMs,
      avgHealthScore: s.totalHealthSum / frames,
      minHealthScore: minHealth,
      totalEvents: s.events.length,
      criticalEvents: s.events.filter((e) => e.severity === 'critical').length,
      warningEvents: s.events.filter((e) => e.severity === 'warning').length,
      crossPenDetections: s.totalCrossPenDetections,
      sessionDurationMs,
      framesProcessed: s.framesProcessed,
    };
  },

  resetSimulation: () => {
    eventCounter = 0;
    set(initialState);
  },
}));

export { genSessionId };
