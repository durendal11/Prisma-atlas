import { BehaviorSummary } from '@/utils/onnxDetector';

const API_BASE = '/api';

export interface BehaviorLogPayload {
  pen_id: number;
  sow_id?: number;
  piglet_count: number;
  sow_count: number;
  total_detections: number;
  sow_posture: string;
  posture_confidence: number;
  is_nursing: boolean;
  is_feeding: boolean;
  is_sleeping: boolean;
  activity_level: string;
  crushing_risk: number;
  health_score: number;
  avg_confidence: number;
  detection_density: number;
  movement_level: string;
  cleanliness_score?: number;
  wetness_score?: number;
  detection_data?: string;
  logged_at?: string;
}

export interface BehaviorLogResponse {
  id: number;
  pen_id: number;
  sow_id: number | null;
  piglet_count: number;
  sow_count: number;
  sow_posture: string;
  posture_confidence: number;
  is_nursing: boolean;
  is_feeding: boolean;
  is_sleeping: boolean;
  activity_level: string;
  crushing_risk: number;
  health_score: number;
  avg_confidence: number;
  movement_level: string;
  cleanliness_score: number;
  wetness_score: number;
  logged_at: string;
  created_at: string;
}

export interface BehaviorAnalytics {
  pen_id: number;
  period_start: string;
  period_end: string;
  total_logs: number;
  avg_piglet_count: number;
  avg_crushing_risk: number;
  avg_health_score: number;
  nursing_percentage: number;
  feeding_percentage: number;
  sleeping_percentage: number;
  posture_distribution: Record<string, number>;
  activity_distribution: Record<string, number>;
}

export interface HealthSummary {
  period_hours: number;
  pens: Array<{
    pen_id: number;
    avg_health_score: number;
    avg_crushing_risk: number;
    total_logs: number;
    nursing_percentage: number;
    feeding_percentage: number;
    needs_attention: boolean;
  }>;
  pens_needing_attention: number;
  total_pens: number;
}

export interface FarrowingLikelihood {
  pen_id: number;
  score: number; // 0-100
  likelihood: 'Low' | 'Moderate' | 'High' | 'Unknown';
  expected_window_hours: number | null;
  changes_per_hour: number;
  nursing_ratio: number;
  sleeping_ratio: number;
  feeding_ratio: number;
  lying_ratio: number;
  restlessness_index: number;
  period_hours: number;
  message?: string;
  components?: {
    posture_switching: number;
    movement: number;
    lying_time: number;
    feeding_reduction: number;
    activity_increase: number;
  };
}

export interface FarrowingLikelihoodTrendPoint {
  timestamp: string;
  score: number | null;
  changes_per_hour: number | null;
  restlessness: number | null;
  lying_ratio: number | null;
  log_count: number;
}

export interface FarrowingLikelihoodTrend {
  pen_id: number;
  trend: FarrowingLikelihoodTrendPoint[];
  period_hours: number;
  interval_hours: number;
}

class BehaviorLogger {
  private pendingLog: BehaviorLogPayload | null = null;
  private logInterval: ReturnType<typeof setInterval> | null = null;
  private isLogging = false;
  private penId: number = 1;
  private sowId?: number;

  /**
   * Start automatic behavior logging every 12 seconds
   */
  startLogging(penId: number, sowId?: number): void {
    this.penId = penId;
    this.sowId = sowId;
    
    if (this.logInterval) {
      clearInterval(this.logInterval);
    }

    this.isLogging = true;
    
    // Log every 12 seconds
    this.logInterval = setInterval(() => {
      this.flushPendingLog();
    }, 12000);

    console.log(`Behavior logging started for pen ${penId}`);
  }

  /**
   * Stop automatic behavior logging
   */
  stopLogging(): void {
    if (this.logInterval) {
      clearInterval(this.logInterval);
      this.logInterval = null;
    }
    
    // Flush any pending log
    this.flushPendingLog();
    
    this.isLogging = false;
    console.log('Behavior logging stopped');
  }

  /**
   * Update the pending behavior data (called on every detection frame)
   */
  updateBehavior(
    behaviorSummary: BehaviorSummary,
    detectionCount: number,
    avgConfidence: number,
    detectionDensity: number,
    movementLevel: string
  ): void {
    if (!this.isLogging) return;

    // Simple heuristics for cleanliness/wetness (placeholder until vision classifiers available)
    const cleanlinessScore = Math.max(0, Math.min(1, 1 - detectionDensity / 5));
    const wetnessScore = movementLevel === 'stationary' ? 0.1 : 0.2;

    this.pendingLog = {
      pen_id: this.penId,
      sow_id: this.sowId,
      piglet_count: behaviorSummary.pigletCount,
      sow_count: behaviorSummary.sowCount,
      total_detections: detectionCount,
      sow_posture: behaviorSummary.sowPosture,
      posture_confidence: behaviorSummary.sowPostureConfidence,
      is_nursing: behaviorSummary.isNursing,
      is_feeding: behaviorSummary.isFeeding,
      is_sleeping: behaviorSummary.isSleeping,
      activity_level: behaviorSummary.activityLevel,
      crushing_risk: behaviorSummary.crushingRisk,
      health_score: behaviorSummary.healthScore,
      avg_confidence: avgConfidence,
      detection_density: detectionDensity,
      movement_level: movementLevel,
      cleanliness_score: cleanlinessScore,
      wetness_score: wetnessScore,
      logged_at: new Date().toISOString(),
    };
  }

  /**
   * Send the pending log to the backend
   */
  private async flushPendingLog(): Promise<void> {
    if (!this.pendingLog) return;

    const logData = { ...this.pendingLog };
    this.pendingLog = null;

    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_BASE}/behavior/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(logData),
      });

      if (!response.ok) {
        console.error('Failed to log behavior:', await response.text());
      } else {
        console.log(`Behavior logged: ${logData.sow_posture}, risk=${logData.crushing_risk.toFixed(2)}`);
      }
    } catch (error) {
      console.error('Error logging behavior:', error);
    }
  }

  /**
   * Get behavior logs for a pen
   */
  async getLogs(penId: number, hours: number = 24): Promise<BehaviorLogResponse[]> {
    const token = localStorage.getItem('access_token');
    const response = await fetch(
      `${API_BASE}/behavior/logs/${penId}?hours=${hours}`,
      {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch behavior logs');
    }

    return response.json();
  }

  /**
   * Get behavior analytics for a pen
   */
  async getAnalytics(penId: number, hours: number = 24): Promise<BehaviorAnalytics> {
    const token = localStorage.getItem('access_token');
    const response = await fetch(
      `${API_BASE}/behavior/analytics/${penId}?hours=${hours}`,
      {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch behavior analytics');
    }

    return response.json();
  }

  /**
   * Get health summary across all pens
   */
  async getHealthSummary(hours: number = 24): Promise<HealthSummary> {
    const token = localStorage.getItem('access_token');
    const response = await fetch(
      `${API_BASE}/behavior/health-summary?hours=${hours}`,
      {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch health summary');
    }

    return response.json();
  }

  /**
   * Get farrowing likelihood for a pen
   */
  async getFarrowingLikelihood(penId: number, hours: number = 12): Promise<FarrowingLikelihood> {
    const token = localStorage.getItem('access_token');
    const response = await fetch(
      `${API_BASE}/behavior/farrowing-likelihood/${penId}?hours=${hours}`,
      {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch farrowing likelihood');
    }

    return response.json();
  }

  /**
   * Get farrowing likelihood trend over time for a pen
   */
  async getFarrowingLikelihoodTrend(penId: number, hours: number = 48, intervalHours: number = 2): Promise<FarrowingLikelihoodTrend> {
    const token = localStorage.getItem('access_token');
    const response = await fetch(
      `${API_BASE}/behavior/farrowing-likelihood-trend/${penId}?hours=${hours}&interval_hours=${intervalHours}`,
      {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch farrowing likelihood trend');
    }

    return response.json();
  }
}

export const behaviorLogger = new BehaviorLogger();


// ═══════════════════════════════════════════════════════════════════════════
// Farrowing API helpers (pre/post comparison, replay)
// ═══════════════════════════════════════════════════════════════════════════

export interface PrePostTimelinePoint {
  timestamp: string;
  phase: 'pre' | 'during' | 'post';
  log_count: number;
  avg_health_score: number | null;
  avg_crushing_risk: number | null;
  avg_piglet_count: number | null;
  nursing_pct: number | null;
  feeding_pct: number | null;
  sleeping_pct: number | null;
}

export interface PrePostPhaseSummary {
  log_count: number;
  avg_health_score: number;
  avg_crushing_risk: number;
  avg_piglet_count: number;
  nursing_pct: number;
  feeding_pct: number;
  sleeping_pct: number;
  posture_distribution: Record<string, number>;
  movement_distribution: Record<string, number>;
  activity_levels: Record<string, number>;
}

export interface PrePostComparison {
  sow_id: number;
  farrowing_record_id: number;
  farrowing_started: string;
  farrowing_completed: string | null;
  window_hours: number;
  born_alive?: number;
  total_born?: number;
  stillborn?: number;
  duration_minutes?: number;
  sow_condition?: string;
  pre: PrePostPhaseSummary | null;
  post: PrePostPhaseSummary | null;
  timeline: PrePostTimelinePoint[];
  message?: string;
}

export interface ReplayFrame {
  id: number;
  timestamp: string | null;
  sow_posture: string | null;
  posture_confidence: number;
  piglet_count: number;
  sow_count: number;
  total_detections: number;
  is_nursing: boolean;
  is_feeding: boolean;
  is_sleeping: boolean;
  activity_level: string | null;
  crushing_risk: number;
  health_score: number;
  movement_level: string | null;
  detection_data: unknown | null;
}

export interface ReplayData {
  pen_id: number;
  pen_name: string;
  total_frames: number;
  period_hours: number;
  start_time: string | null;
  end_time: string | null;
  frames: ReplayFrame[];
}

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export async function getPrePostComparison(sowId: number, windowHours = 48): Promise<PrePostComparison> {
  const resp = await fetch(
    `${API_BASE}/farrowing/pre-post-comparison/${sowId}?window_hours=${windowHours}`,
    { headers: authHeaders() },
  );
  if (resp.status === 404) {
    const body = await resp.json().catch(() => ({}));
    return { message: body.detail || 'No farrowing record found for this sow' } as PrePostComparison;
  }
  if (!resp.ok) throw new Error('Failed to fetch pre/post comparison');
  return resp.json();
}

export async function getReplayData(penId: number, hours = 24): Promise<ReplayData> {
  const resp = await fetch(
    `${API_BASE}/farrowing/replay/${penId}?hours=${hours}`,
    { headers: authHeaders() },
  );
  if (!resp.ok) throw new Error('Failed to fetch replay data');
  return resp.json();
}
