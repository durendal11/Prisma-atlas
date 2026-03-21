import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, DashboardStats, PenStatus, Alert, DetectionWebSocket } from '@/types';
import type { DetectionResult } from '@/utils/onnxDetector';

// ─── Test Pen Persistent Detection Store ────────────────────────────────────
export interface SowBehaviorProfile {
  className: string;       // e.g. 'sow-sleep'
  displayName: string;     // e.g. 'Sow (Sleeping)'
  posture: string;
  count: number;           // times detected
  totalConfidence: number;
  firstSeen: number;       // timestamp
  lastSeen: number;        // timestamp
}

interface TestPenState {
  isRunning: boolean;
  latestResult: DetectionResult | null;
  sessionStarted: number | null;
  totalFrames: number;
  sowProfiles: Record<string, SowBehaviorProfile>; // keyed by className
  frameDetectionHistory: Array<{ ts: number; sowCount: number; pigletCount: number; risk: number }>;
  setRunning: (running: boolean) => void;
  updateResult: (result: DetectionResult) => void;
  resetSession: () => void;
}

export const useTestPenStore = create<TestPenState>((set) => ({
  isRunning: false,
  latestResult: null,
  sessionStarted: null,
  totalFrames: 0,
  sowProfiles: {},
  frameDetectionHistory: [],

  setRunning: (running) =>
    set((state) => ({
      isRunning: running,
      sessionStarted: running && !state.sessionStarted ? Date.now() : state.sessionStarted,
    })),

  updateResult: (result) =>
    set((state) => {
      // Update sow behavior profiles
      const updatedProfiles = { ...state.sowProfiles };
      result.detections.forEach((det) => {
        if (det.category === 'sow') {
          const key = det.className;
          const existing = updatedProfiles[key];
          updatedProfiles[key] = {
            className: det.className,
            displayName: det.displayName,
            posture: det.posture || 'unknown',
            count: (existing?.count ?? 0) + 1,
            totalConfidence: (existing?.totalConfidence ?? 0) + det.confidence,
            firstSeen: existing?.firstSeen ?? result.frameTimestamp,
            lastSeen: result.frameTimestamp,
          };
        }
      });

      // Rolling 5-minute history (at ~10fps = 3000 entries max)
      const now = Date.now();
      const history = [
        ...state.frameDetectionHistory,
        { ts: now, sowCount: result.sowCount, pigletCount: result.pigletCount, risk: result.crushingRisk },
      ].filter((e) => now - e.ts < 5 * 60 * 1000);

      return {
        latestResult: result,
        totalFrames: state.totalFrames + 1,
        sowProfiles: updatedProfiles,
        frameDetectionHistory: history,
      };
    }),

  resetSession: () =>
    set({
      isRunning: false,
      latestResult: null,
      sessionStarted: null,
      totalFrames: 0,
      sowProfiles: {},
      frameDetectionHistory: [],
    }),
}));

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      setAuth: (user, token) => {
        localStorage.setItem('access_token', token);
        set({ user, token, isAuthenticated: true });
      },
      logout: () => {
        localStorage.removeItem('access_token');
        set({ user: null, token: null, isAuthenticated: false });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ token: state.token }),
    }
  )
);

interface DashboardState {
  stats: DashboardStats | null;
  penStatuses: PenStatus[];
  isLoading: boolean;
  setStats: (stats: DashboardStats) => void;
  setPenStatuses: (statuses: PenStatus[]) => void;
  setLoading: (loading: boolean) => void;
  updatePenStatus: (penId: number, update: Partial<PenStatus>) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  stats: null,
  penStatuses: [],
  isLoading: true,
  setStats: (stats) => set({ stats }),
  setPenStatuses: (statuses) => set({ penStatuses: statuses }),
  setLoading: (loading) => set({ isLoading: loading }),
  updatePenStatus: (penId, update) =>
    set((state) => ({
      penStatuses: state.penStatuses.map((ps) =>
        ps.pen_id === penId ? { ...ps, ...update } : ps
      ),
    })),
}));

interface AlertState {
  alerts: Alert[];
  unreadCount: number;
  setAlerts: (alerts: Alert[]) => void;
  addAlert: (alert: Alert) => void;
  setUnreadCount: (count: number) => void;
  markAsRead: (alertId: number) => void;
}

export const useAlertStore = create<AlertState>((set) => ({
  alerts: [],
  unreadCount: 0,
  setAlerts: (alerts) => set({ alerts }),
  addAlert: (alert) =>
    set((state) => ({
      alerts: [alert, ...state.alerts].slice(0, 100),
      unreadCount: state.unreadCount + 1,
    })),
  setUnreadCount: (count) => set({ unreadCount: count }),
  markAsRead: (alertId) =>
    set((state) => ({
      alerts: state.alerts.map((a) =>
        a.id === alertId ? { ...a, is_read: true } : a
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    })),
}));

interface DetectionState {
  latestDetections: Record<string, DetectionWebSocket>;
  setDetection: (penId: string, detection: DetectionWebSocket) => void;
  setDetectionsBatch: (detections: DetectionWebSocket[]) => void;
  clearDetections: () => void;
}

export const useDetectionStore = create<DetectionState>((set) => ({
  latestDetections: {},
  setDetection: (penId, detection) =>
    set((state) => ({
      latestDetections: { ...state.latestDetections, [penId]: detection },
    })),
  setDetectionsBatch: (detections) =>
    set((state) => {
      if (!detections.length) {
        return state;
      }

      const next = { ...state.latestDetections };
      for (const detection of detections) {
        next[detection.pen_id] = detection;
      }

      return { latestDetections: next };
    }),
  clearDetections: () => set({ latestDetections: {} }),
}));

interface SettingsState {
  theme: 'light' | 'dark';
  language: 'en' | 'fil';
  notifications: boolean;
  soundEnabled: boolean;
  crushingRiskThreshold: number;
  setTheme: (theme: 'light' | 'dark') => void;
  setLanguage: (language: 'en' | 'fil') => void;
  setNotifications: (enabled: boolean) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setCrushingRiskThreshold: (threshold: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'light',
      language: 'en',
      notifications: true,
      soundEnabled: true,
      crushingRiskThreshold: 0.7,
      setTheme: (theme) => {
        // Apply dark mode class to document
        if (theme === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
        set({ theme });
      },
      setLanguage: (language) => set({ language }),
      setNotifications: (enabled) => set({ notifications: enabled }),
      setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),
      setCrushingRiskThreshold: (threshold) => set({ crushingRiskThreshold: threshold }),
    }),
    {
      name: 'settings-storage',
      onRehydrateStorage: () => (state) => {
        // Apply theme on app load
        if (state?.theme === 'dark') {
          document.documentElement.classList.add('dark');
        }
      },
    }
  )
);

// ─── Power Saving Store ─────────────────────────────────────────────────────

interface PowerSavingState {
  isPowerSaving: boolean;
  batteryLevel: number | null;
  setPowerSaving: (enabled: boolean) => void;
  setBatteryLevel: (level: number | null) => void;
}

export const usePowerSavingStore = create<PowerSavingState>()(
  persist(
    (set) => ({
      isPowerSaving: false,
      batteryLevel: null,
      setPowerSaving: (enabled) => set({ isPowerSaving: enabled }),
      setBatteryLevel: (level) => set({ batteryLevel: level }),
    }),
    {
      name: 'power-saving-storage',
      partialize: (state) => ({ isPowerSaving: state.isPowerSaving }),
    }
  )
);
