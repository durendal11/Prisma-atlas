/**
 * FarrowingEngine — AI-based sow and piglet monitoring engine.
 *
 * Implements a full state machine for farrowing prediction, detection,
 * and monitoring as specified:
 *
 *   NORMAL_MONITORING → PREDICTION_HIGH → FARROWING_STARTED
 *     → FARROWING_ACTIVE → FARROWING_COMPLETED → NORMAL_MONITORING
 *
 * Modules:
 *   1. System States
 *   2. Pre-Farrowing Rule-Based Prediction (every 60 min / 30 min)
 *   3. Birth Event Detection (real-time per frame)
 *   4. Farrowing Active Mode (piglet counting)
 *   5. Safety Checks (crushing, motionless)
 *   6. State Transitions
 *   7. Data Logging
 */

import type { DetectionResult, Detection } from '@/utils/onnxDetector';
import { useFarrowingStore } from '@/store/farrowingStore';
import type { FarrowingSystemState } from '@/store/farrowingStore';

// ─── Configuration ──────────────────────────────────────────────────────────

const CONFIG = {
  // Prediction module (Section 2)
  predictionIntervalNormalMs: 60 * 60 * 1000,   // 60 minutes
  predictionIntervalHighMs: 30 * 60 * 1000,     // 30 minutes when HIGH
  postureTransitionThreshold: 20,                // per hour
  nestingCountThreshold: 5,                      // posture switching events per hour
  percentTimeLyingThreshold: 50,                 // percent
  activityIncreaseThreshold: 0.30,               // 30% increase

  // Birth detection (Section 3)
  birthConfidenceThreshold: 0.80,
  birthVisibilityFrames: 20,           // ~10 seconds at 2fps typical ONNX rate
  birthVisibilityDurationMs: 10_000,   // 10 seconds

  // Farrowing completion (Section 4)
  noNewPigletCompletionMs: 45 * 60 * 1000,  // 45 minutes
  resetToNormalAfterMs: 2 * 60 * 60 * 1000, // 2 hours after completion

  // Safety checks (Section 5)
  abruptPostureChangeMs: 2000,           // posture change within 2s → abrupt
  pigletMotionlessFrames: 120,           // ~60 seconds at 2fps
  pigletUnderSowOverlapThreshold: 0.6,   // IoU for piglet under sow

  // Sampling
  predictionMetricsSampleRate: 5,        // collect metrics every N frames
  hourlyMetricsWindowMs: 60 * 60 * 1000, // 1 hour window
} as const;

// ─── Engine State (mutable, not in Zustand for perf) ────────────────────────

interface EngineInternalState {
  // Timing
  engineStartTime: number;
  lastFrameTime: number;
  lastPredictionEvalTime: number;
  lastHourlyLogTime: number;

  // Posture tracking for prediction
  postureTransitions: number;
  postureHistory: Array<{ posture: string; timestamp: number }>;
  lastPosture: string;
  lastPostureTime: number;

  // Posture switching detection (frequent posture changes while lying)
  nestingEvents: number;
  recentLyingPostureChanges: number;

  // Activity scoring
  activityFrames: number;
  activeFrames: number;
  lyingFrames: number;
  totalFrames: number;

  // Birth detection buffers
  pigletCountBuffer: number[];          // rolling window for stable count
  pigletConfidenceBuffer: number[];
  pigletFirstAppearanceTime: number;    // when piglet count first increased
  previousStablePigletCount: number;
  newPigletConfirmed: boolean;
  birthCheckInProgress: boolean;
  consecutiveHigherPigletFrames: number;

  // Farrowing active tracking
  lastNewPigletTime: number;
  highestPigletCount: number;

  // Safety
  pigletPositionHistory: Map<string, Array<{ x: number; y: number; timestamp: number }>>;
  abruptPostureCount: number;

  // Activity score history (3-hour rolling)
  activityScoreHistory: Array<{ score: number; timestamp: number }>;

  // Completion timer
  completionTimerStart: number | null;

  frameCount: number;
}

const createInitialEngineState = (): EngineInternalState => ({
  engineStartTime: Date.now(),
  lastFrameTime: 0,
  lastPredictionEvalTime: 0,
  lastHourlyLogTime: Date.now(),

  postureTransitions: 0,
  postureHistory: [],
  lastPosture: '',
  lastPostureTime: Date.now(),

  nestingEvents: 0,
  recentLyingPostureChanges: 0,

  activityFrames: 0,
  activeFrames: 0,
  lyingFrames: 0,
  totalFrames: 0,

  pigletCountBuffer: [],
  pigletConfidenceBuffer: [],
  pigletFirstAppearanceTime: 0,
  previousStablePigletCount: 0,
  newPigletConfirmed: false,
  birthCheckInProgress: false,
  consecutiveHigherPigletFrames: 0,

  lastNewPigletTime: 0,
  highestPigletCount: 0,

  pigletPositionHistory: new Map(),
  abruptPostureCount: 0,

  activityScoreHistory: [],

  completionTimerStart: null,

  frameCount: 0,
});

// ─── Farrowing Engine ───────────────────────────────────────────────────────

class FarrowingEngine {
  private state: EngineInternalState = createInitialEngineState();
  private store = useFarrowingStore;
  private isRunning = false;
  private sowId?: number;
  private penId?: number;

  /**
   * Initialize engine for a pen/sow
   */
  start(sowId?: number, penId?: number): void {
    this.state = createInitialEngineState();
    this.isRunning = true;
    this.sowId = sowId;
    this.penId = penId;
    const store = this.store.getState();
    store.resetToNormal();
    store.transitionTo('NORMAL_MONITORING');

    console.log('[FarrowingEngine] Started monitoring', { sowId, penId });

    store.addAlert({
      type: 'prediction_high', // using as generic info
      severity: 'info',
      message: `Farrowing monitoring engine started for ${penId ? `Pen ${penId}` : 'monitoring'}.`,
    });
  }

  /**
   * Stop engine
   */
  stop(): void {
    this.isRunning = false;
    const store = this.store.getState();
    const session = store.activeSession;

    if (session && store.systemState === 'FARROWING_ACTIVE') {
      store.completeFarrowingSession();
      store.transitionTo('FARROWING_COMPLETED');
    }

    console.log('[FarrowingEngine] Stopped');
  }

  /**
   * Main entry point — called on every detection frame
   */
  processFrame(result: DetectionResult): void {
    if (!this.isRunning) return;

    const now = Date.now();
    const store = this.store.getState();
    this.state.frameCount++;
    this.state.lastFrameTime = now;

    // ── Update per-frame metrics ────────────────────────────────────────
    this.trackPosture(result, now);
    this.trackActivity(result, now);
    this.trackPigletPositions(result, now);

    // ── State-specific processing ───────────────────────────────────────
    const currentState = store.systemState;

    switch (currentState) {
      case 'NORMAL_MONITORING':
        this.runPredictionModule(result, now);
        this.checkForBirth(result, now);
        break;

      case 'PREDICTION_HIGH':
        this.runPredictionModule(result, now);
        this.checkForBirth(result, now);
        break;

      case 'FARROWING_STARTED':
        // Transition immediately to ACTIVE
        this.transitionToActive(result, now);
        break;

      case 'FARROWING_ACTIVE':
        this.runActiveMode(result, now);
        this.runSafetyChecks(result, now);
        break;

      case 'FARROWING_COMPLETED':
        this.checkCompletionReset(now);
        break;
    }

    // ── Hourly metrics logging (Section 7) ──────────────────────────────
    if (now - this.state.lastHourlyLogTime >= CONFIG.hourlyMetricsWindowMs) {
      this.logHourlyMetrics(now);
    }

    // ── Update piglet tracking in store ─────────────────────────────────
    const avgConfidence = this.state.pigletConfidenceBuffer.length > 0
      ? this.state.pigletConfidenceBuffer.reduce((a, b) => a + b, 0) / this.state.pigletConfidenceBuffer.length
      : 0;
    store.updatePigletTracking(result.pigletCount, avgConfidence);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2: PRE-FARROWING PREDICTION MODULE
  // ═══════════════════════════════════════════════════════════════════════════

  private runPredictionModule(_result: DetectionResult, now: number): void {
    const store = this.store.getState();
    const interval = store.systemState === 'PREDICTION_HIGH'
      ? CONFIG.predictionIntervalHighMs
      : CONFIG.predictionIntervalNormalMs;

    // Only evaluate at intervals (or first run)
    if (now - this.state.lastPredictionEvalTime < interval && this.state.lastPredictionEvalTime > 0) {
      return;
    }

    this.state.lastPredictionEvalTime = now;
    store.setLastPredictionRun(now);

    // Calculate prediction metrics over the last hour
    const oneHourAgo = now - CONFIG.hourlyMetricsWindowMs;
    const recentPostures = this.state.postureHistory.filter(p => p.timestamp > oneHourAgo);

    // Posture transitions per hour
    let transitions = 0;
    for (let i = 1; i < recentPostures.length; i++) {
      if (recentPostures[i].posture !== recentPostures[i - 1].posture) {
        transitions++;
      }
    }

    // Posture switching count: frequent transitions while predominantly lying
    const lyingPostures = recentPostures.filter(p =>
      /sleep|nurs|lying|lateral/i.test(p.posture)
    );
    const percentLying = recentPostures.length > 0
      ? (lyingPostures.length / recentPostures.length) * 100
      : 0;

    // Count posture switching events (posture changes from lying→standing→lying within short periods)
    let nestingCount = 0;
    for (let i = 2; i < recentPostures.length; i++) {
      const p0 = recentPostures[i - 2];
      const p1 = recentPostures[i - 1];
      const p2 = recentPostures[i];
      const isLying = (p: string) => /sleep|nurs|lying|lateral/i.test(p);
      const isActive = (p: string) => /stand|feed/i.test(p);
      if (isLying(p0.posture) && isActive(p1.posture) && isLying(p2.posture)) {
        if (p2.timestamp - p0.timestamp < 10 * 60 * 1000) { // within 10 min
          nestingCount++;
        }
      }
    }

    // Activity score (0-1)
    const activityScore = this.state.totalFrames > 0
      ? this.state.activeFrames / this.state.totalFrames
      : 0;

    // Activity increase check (compared to previous 3-hour average)
    const threeHoursAgo = now - 3 * 60 * 60 * 1000;
    const recentScores = this.state.activityScoreHistory.filter(s => s.timestamp > threeHoursAgo);
    const prevAvgActivity = recentScores.length > 0
      ? recentScores.reduce((sum, s) => sum + s.score, 0) / recentScores.length
      : activityScore;
    const activityIncrease = prevAvgActivity > 0
      ? (activityScore - prevAvgActivity) / prevAvgActivity
      : 0;

    // Store activity score for rolling average
    this.state.activityScoreHistory.push({ score: activityScore, timestamp: now });
    // Keep only 6 hours
    this.state.activityScoreHistory = this.state.activityScoreHistory.filter(
      s => s.timestamp > now - 6 * 60 * 60 * 1000
    );

    // ── Rule-Based Prediction Logic ─────────────────────────────────────

    let probability: 'LOW' | 'MODERATE' | 'HIGH' = 'LOW';

    // Primary rule
    if (
      transitions > CONFIG.postureTransitionThreshold &&
      nestingCount > CONFIG.nestingCountThreshold &&
      percentLying > CONFIG.percentTimeLyingThreshold
    ) {
      probability = 'HIGH';
    }
    // Extended rule: activity increase
    else if (activityIncrease >= CONFIG.activityIncreaseThreshold) {
      probability = probability === 'LOW' ? 'MODERATE' : 'HIGH';
    }
    // Moderate: some indicators present
    else if (
      (transitions > CONFIG.postureTransitionThreshold * 0.5 &&
       nestingCount > CONFIG.nestingCountThreshold * 0.5) ||
      percentLying > CONFIG.percentTimeLyingThreshold * 1.3
    ) {
      probability = 'MODERATE';
    }

    // Update store
    store.updatePrediction({
      postureTransitionsPerHour: transitions,
      nestingCountPerHour: nestingCount,
      percentTimeLying: Math.round(percentLying * 10) / 10,
      activityScore: Math.round(activityScore * 100) / 100,
      farrowingProbability: probability,
      previousActivityScores: recentScores.map(s => s.score),
    });
    store.setPredictionProbability(probability);

    // ── State transition on HIGH ────────────────────────────────────────

    if (probability === 'HIGH' && store.systemState === 'NORMAL_MONITORING') {
      store.transitionTo('PREDICTION_HIGH');
      store.setMonitoringInterval(30);

      store.addAlert({
        type: 'prediction_high',
        severity: 'warning',
        message: `Sow likely to farrow within 6–12 hours. Posture transitions: ${transitions}/hr, posture switching events: ${nestingCount}/hr, lying: ${percentLying.toFixed(0)}%.`,
        data: { transitions, nestingCount, percentLying, activityScore, activityIncrease },
      });

      console.log('[FarrowingEngine] PREDICTION_HIGH triggered', {
        transitions, nestingCount, percentLying, activityScore,
      });

      // Persist to backend
      this.persistStateToBackend('PREDICTION_HIGH', 'NORMAL_MONITORING');
    }

    // Deescalate if indicators drop
    if (probability === 'LOW' && store.systemState === 'PREDICTION_HIGH') {
      store.transitionTo('NORMAL_MONITORING');
      store.setMonitoringInterval(60);

      store.addAlert({
        type: 'prediction_high',
        severity: 'info',
        message: 'Farrowing prediction lowered. Indicators returned to normal.',
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3: BIRTH EVENT DETECTION (Real-Time)
  // ═══════════════════════════════════════════════════════════════════════════

  private checkForBirth(result: DetectionResult, now: number): void {
    const store = this.store.getState();
    const currentCount = result.pigletCount;
    const prevCount = this.state.previousStablePigletCount;

    // Track piglet confidence
    const pigletDetections = result.detections.filter(d => d.category === 'piglet');
    const avgConf = pigletDetections.length > 0
      ? pigletDetections.reduce((sum, d) => sum + d.confidence, 0) / pigletDetections.length
      : 0;

    this.state.pigletConfidenceBuffer.push(avgConf);
    if (this.state.pigletConfidenceBuffer.length > 20) {
      this.state.pigletConfidenceBuffer.shift();
    }

    this.state.pigletCountBuffer.push(currentCount);
    if (this.state.pigletCountBuffer.length > 20) {
      this.state.pigletCountBuffer.shift();
    }

    // Birth detection: piglets appear when there were none (or count increases)
    if (currentCount > prevCount && currentCount >= 1) {
      if (!this.state.birthCheckInProgress) {
        // Start observing — need sustained visibility
        this.state.birthCheckInProgress = true;
        this.state.pigletFirstAppearanceTime = now;
        this.state.consecutiveHigherPigletFrames = 1;
      } else {
        this.state.consecutiveHigherPigletFrames++;
      }

      // Check if birth criteria met
      const visibilityDuration = now - this.state.pigletFirstAppearanceTime;
      const recentConfidence = this.state.pigletConfidenceBuffer.length > 0
        ? this.state.pigletConfidenceBuffer.slice(-5).reduce((a, b) => a + b, 0) /
          Math.min(5, this.state.pigletConfidenceBuffer.length)
        : 0;

      if (
        visibilityDuration >= CONFIG.birthVisibilityDurationMs &&
        recentConfidence >= CONFIG.birthConfidenceThreshold &&
        this.state.consecutiveHigherPigletFrames >= CONFIG.birthVisibilityFrames
      ) {
        // BIRTH CONFIRMED
        this.state.birthCheckInProgress = false;
        this.state.previousStablePigletCount = currentCount;
        this.state.newPigletConfirmed = true;

        if (store.systemState === 'NORMAL_MONITORING' || store.systemState === 'PREDICTION_HIGH') {
          // First birth → FARROWING_STARTED
          store.transitionTo('FARROWING_STARTED');
          store.startFarrowingSession(undefined, undefined);

          store.addAlert({
            type: 'farrowing_started',
            severity: 'critical',
            message: `Farrowing has started. First piglet(s) detected (${currentCount}). Confidence: ${(recentConfidence * 100).toFixed(0)}%.`,
            data: { pigletCount: currentCount, confidence: recentConfidence },
          });

          // Persist to backend
          this.persistStateToBackend('FARROWING_STARTED', store.systemState);

          // Log birth events for all detected piglets
          for (let i = 0; i < currentCount; i++) {
            store.addBirthEvent({
              pigletNumber: i + 1,
              detectedAt: now,
              confidence: recentConfidence,
              pigletCountAtDetection: currentCount,
            });
          }

          this.state.lastNewPigletTime = now;
          this.state.highestPigletCount = currentCount;
        }
      }
    } else if (currentCount <= prevCount) {
      // Reset birth check if count drops back
      this.state.birthCheckInProgress = false;
      this.state.consecutiveHigherPigletFrames = 0;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3→4: TRANSITION TO ACTIVE
  // ═══════════════════════════════════════════════════════════════════════════

  private transitionToActive(_result: DetectionResult, _now: number): void {
    const store = this.store.getState();

    store.transitionTo('FARROWING_ACTIVE');

    store.addAlert({
      type: 'farrowing_active',
      severity: 'critical',
      message: 'Farrowing is active. Switching to piglet counting mode. Monitoring for new births.',
    });

    console.log('[FarrowingEngine] FARROWING_ACTIVE — piglet counting mode');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 4: FARROWING ACTIVE MODE
  // ═══════════════════════════════════════════════════════════════════════════

  private runActiveMode(result: DetectionResult, now: number): void {
    const store = this.store.getState();
    const currentCount = result.pigletCount;

    // Track new piglets
    if (currentCount > this.state.highestPigletCount) {
      const newCount = currentCount - this.state.highestPigletCount;

      // Confirm with multi-frame check
      this.state.consecutiveHigherPigletFrames++;

      if (this.state.consecutiveHigherPigletFrames >= 5) {
        // New piglet(s) confirmed
        const pigletDetections = result.detections.filter(d => d.category === 'piglet');
        const avgConf = pigletDetections.length > 0
          ? pigletDetections.reduce((s, d) => s + d.confidence, 0) / pigletDetections.length
          : 0;

        for (let i = 0; i < newCount; i++) {
          store.addBirthEvent({
            pigletNumber: this.state.highestPigletCount + i + 1,
            detectedAt: now,
            confidence: avgConf,
            pigletCountAtDetection: currentCount,
          });
        }

        store.addAlert({
          type: 'piglet_born',
          severity: 'info',
          message: `New piglet(s) detected! Total: ${currentCount}. Piglet #${this.state.highestPigletCount + 1}${newCount > 1 ? `–#${currentCount}` : ''} born.`,
          data: { newCount, totalCount: currentCount },
        });

        this.state.highestPigletCount = currentCount;
        this.state.lastNewPigletTime = now;
        this.state.previousStablePigletCount = currentCount;
        this.state.consecutiveHigherPigletFrames = 0;

        console.log(`[FarrowingEngine] Piglet #${currentCount} born at ${new Date(now).toLocaleTimeString()}`);
      }
    } else {
      this.state.consecutiveHigherPigletFrames = 0;
    }

    // ── Check for completion (45 minutes no new piglet) ─────────────────
    const timeSinceLastPiglet = now - this.state.lastNewPigletTime;
    store.updateTimers(timeSinceLastPiglet);

    if (timeSinceLastPiglet >= CONFIG.noNewPigletCompletionMs && this.state.lastNewPigletTime > 0) {
      // FARROWING COMPLETED
      store.completeFarrowingSession();
      store.transitionTo('FARROWING_COMPLETED');
      this.state.completionTimerStart = now;

      const session = store.getSessionSummary();
      const duration = session?.durationMinutes ?? 0;

      store.addAlert({
        type: 'farrowing_completed',
        severity: 'critical',
        message: `Farrowing completed. Total piglets born: ${this.state.highestPigletCount}. Duration: ${duration} minutes. No new piglet detected for 45 minutes.`,
        data: {
          totalBorn: this.state.highestPigletCount,
          durationMinutes: duration,
          crushingIncidents: session?.crushingIncidents ?? 0,
        },
      });

      console.log('[FarrowingEngine] FARROWING_COMPLETED', {
        total: this.state.highestPigletCount,
        duration,
      });

      // Persist to backend
      this.persistStateToBackend('FARROWING_COMPLETED', 'FARROWING_ACTIVE');
    }

    // Progress alert every 15 minutes during active farrowing
    if (
      this.state.lastNewPigletTime > 0 &&
      timeSinceLastPiglet > 15 * 60 * 1000 &&
      timeSinceLastPiglet < CONFIG.noNewPigletCompletionMs &&
      Math.floor(timeSinceLastPiglet / (15 * 60 * 1000)) !==
        Math.floor((timeSinceLastPiglet - (now - this.state.lastFrameTime)) / (15 * 60 * 1000))
    ) {
      store.addAlert({
        type: 'no_progress',
        severity: 'warning',
        message: `No new piglet detected for ${Math.round(timeSinceLastPiglet / 60000)} minutes. Current count: ${this.state.highestPigletCount}. Completion threshold: 45 min.`,
        data: { minutesSinceLastPiglet: Math.round(timeSinceLastPiglet / 60000) },
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 5: SAFETY CHECKS
  // ═══════════════════════════════════════════════════════════════════════════

  private runSafetyChecks(result: DetectionResult, now: number): void {
    const store = this.store.getState();

    // 1. Abrupt posture change
    const currentPosture = result.sowPosture || 'unknown';
    if (
      this.state.lastPosture &&
      currentPosture !== this.state.lastPosture &&
      currentPosture !== 'unknown' &&
      this.state.lastPosture !== 'unknown'
    ) {
      const timeSinceChange = now - this.state.lastPostureTime;
      if (timeSinceChange < CONFIG.abruptPostureChangeMs) {
        this.state.abruptPostureCount++;

        if (this.state.abruptPostureCount >= 3) {
          store.addSafetyCheck({
            type: 'abrupt_posture_change',
            description: `Sow changed posture rapidly (${this.state.lastPosture} → ${currentPosture}) ${this.state.abruptPostureCount} times. Possible piglet crushing risk.`,
            severity: 'warning',
          });

          store.addAlert({
            type: 'crushing_risk',
            severity: 'critical',
            message: `Possible piglet crushing risk. Sow posture changed abruptly ${this.state.abruptPostureCount} times.`,
            data: { from: this.state.lastPosture, to: currentPosture, count: this.state.abruptPostureCount },
          });

          store.incrementCrushingIncident();
          this.state.abruptPostureCount = 0;
        }
      } else {
        this.state.abruptPostureCount = 0;
      }
    }

    // 2. Piglet detected under sow body (IoU overlap check)
    const sowDetections = result.detections.filter(d => d.category === 'sow');
    const pigletDetections = result.detections.filter(d => d.category === 'piglet');

    for (const sow of sowDetections) {
      for (const piglet of pigletDetections) {
        const overlap = this.calculateIoU(sow, piglet);
        if (overlap > CONFIG.pigletUnderSowOverlapThreshold) {
          // Check if this is sustained (not just passing)
          const key = `piglet-under-${piglet.centerX.toFixed(2)}-${piglet.centerY.toFixed(2)}`;
          const history = this.state.pigletPositionHistory.get(key) || [];
          history.push({ x: piglet.centerX, y: piglet.centerY, timestamp: now });

          if (history.length > 10) {
            // Piglet has been under sow for ~5s
            store.addSafetyCheck({
              type: 'piglet_under_sow',
              description: `Piglet detected under sow body (overlap: ${(overlap * 100).toFixed(0)}%). Crushing risk elevated.`,
              severity: 'critical',
            });

            store.addAlert({
              type: 'crushing_risk',
              severity: 'critical',
              message: `Possible piglet crushing risk. Piglet detected under sow body for ${((now - history[0].timestamp) / 1000).toFixed(0)}s.`,
              data: { overlap: overlap.toFixed(2), duration: now - history[0].timestamp },
            });

            store.incrementCrushingIncident();
            this.state.pigletPositionHistory.delete(key);
          } else {
            this.state.pigletPositionHistory.set(key, history);
          }
        }
      }
    }

    // 3. Piglet motionless (stationary for 60 seconds)
    this.checkMotionlessPiglets(result, now, store);
  }

  private checkMotionlessPiglets(result: DetectionResult, now: number, store: ReturnType<typeof useFarrowingStore.getState>): void {
    const piglets = result.detections.filter(d => d.category === 'piglet');

    for (const piglet of piglets) {
      const key = `motion-${Math.round(piglet.centerX * 100)}-${Math.round(piglet.centerY * 100)}`;
      const history = this.state.pigletPositionHistory.get(key) || [];

      history.push({ x: piglet.centerX, y: piglet.centerY, timestamp: now });

      // Keep only last 60 seconds of data
      const cutoff = now - 60_000;
      const filtered = history.filter(h => h.timestamp > cutoff);
      this.state.pigletPositionHistory.set(key, filtered);

      if (filtered.length >= CONFIG.pigletMotionlessFrames) {
        // Check if all positions are nearly identical
        const xRange = Math.max(...filtered.map(h => h.x)) - Math.min(...filtered.map(h => h.x));
        const yRange = Math.max(...filtered.map(h => h.y)) - Math.min(...filtered.map(h => h.y));

        if (xRange < 0.02 && yRange < 0.02) {
          store.addSafetyCheck({
            type: 'piglet_motionless',
            description: `Piglet motionless for ${filtered.length} frames (~60s). Possible health concern.`,
            severity: 'critical',
          });

          store.addAlert({
            type: 'crushing_risk',
            severity: 'critical',
            message: `Possible piglet crushing risk. Piglet motionless for 60 seconds at position (${(piglet.centerX * 100).toFixed(0)}%, ${(piglet.centerY * 100).toFixed(0)}%).`,
            data: { x: piglet.centerX, y: piglet.centerY, frames: filtered.length },
          });

          // Clear to avoid repeated alerts
          this.state.pigletPositionHistory.delete(key);
        }
      }
    }

    // Cleanup stale keys
    for (const [key, history] of this.state.pigletPositionHistory) {
      if (history.length > 0 && now - history[history.length - 1].timestamp > 30_000) {
        this.state.pigletPositionHistory.delete(key);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 6: COMPLETION RESET
  // ═══════════════════════════════════════════════════════════════════════════

  private checkCompletionReset(now: number): void {
    if (!this.state.completionTimerStart) {
      this.state.completionTimerStart = now;
      return;
    }

    const elapsed = now - this.state.completionTimerStart;
    if (elapsed >= CONFIG.resetToNormalAfterMs) {
      const store = this.store.getState();
      store.transitionTo('NORMAL_MONITORING');
      store.setMonitoringInterval(60);
      this.state.completionTimerStart = null;

      // Reset engine tracking for next cycle
      this.state.highestPigletCount = 0;
      this.state.previousStablePigletCount = 0;
      this.state.lastNewPigletTime = 0;
      this.state.nestingEvents = 0;
      this.state.postureTransitions = 0;
      this.state.postureHistory = [];
      this.state.activityScoreHistory = [];

      store.addAlert({
        type: 'prediction_high',
        severity: 'info',
        message: 'Monitoring reset to NORMAL after 2-hour post-farrowing period.',
      });

      console.log('[FarrowingEngine] Reset to NORMAL_MONITORING after completion delay');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TRACKING HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private trackPosture(result: DetectionResult, now: number): void {
    const posture = result.sowPosture || 'unknown';
    if (posture === 'unknown') return;

    if (posture !== this.state.lastPosture && this.state.lastPosture) {
      this.state.postureTransitions++;

      // Track posture switching (lying → standing → lying)
      const isLying = /sleep|nurs|lying|lateral/i.test(posture);
      if (isLying) {
        this.state.recentLyingPostureChanges++;
      }
    }

    this.state.postureHistory.push({ posture, timestamp: now });
    // Keep only 2 hours of posture history
    const twoHoursAgo = now - 2 * 60 * 60 * 1000;
    this.state.postureHistory = this.state.postureHistory.filter(p => p.timestamp > twoHoursAgo);

    if (posture !== this.state.lastPosture) {
      this.state.lastPostureTime = now;
    }
    this.state.lastPosture = posture;
  }

  private trackActivity(result: DetectionResult, _now: number): void {
    this.state.totalFrames++;

    const posture = result.sowPosture || 'unknown';
    if (/stand|feed/i.test(posture)) {
      this.state.activeFrames++;
    }
    if (/sleep|nurs|lying|lateral/i.test(posture)) {
      this.state.lyingFrames++;
    }
  }

  private trackPigletPositions(result: DetectionResult, now: number): void {
    // Only track during active farrowing for safety checks
    const store = this.store.getState();
    if (store.systemState !== 'FARROWING_ACTIVE') return;

    const piglets = result.detections.filter(d => d.category === 'piglet');
    for (const piglet of piglets) {
      const key = `track-${Math.round(piglet.centerX * 50)}-${Math.round(piglet.centerY * 50)}`;
      const history = this.state.pigletPositionHistory.get(key) || [];
      history.push({ x: piglet.centerX, y: piglet.centerY, timestamp: now });
      // Keep last 2 minutes
      const cutoff = now - 120_000;
      this.state.pigletPositionHistory.set(
        key,
        history.filter(h => h.timestamp > cutoff)
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 7: HOURLY METRICS LOGGING
  // ═══════════════════════════════════════════════════════════════════════════

  private logHourlyMetrics(now: number): void {
    const hourStart = this.state.lastHourlyLogTime;
    this.state.lastHourlyLogTime = now;

    const totalFrames = Math.max(1, this.state.totalFrames);
    const percentLying = this.state.lyingFrames / totalFrames * 100;
    const activityScore = this.state.activeFrames / totalFrames;

    // Avg piglet count from buffer
    const avgPiglets = this.state.pigletCountBuffer.length > 0
      ? this.state.pigletCountBuffer.reduce((a, b) => a + b, 0) / this.state.pigletCountBuffer.length
      : 0;

    // Avg risk from confidence buffer (approximation)
    const avgRisk = this.state.pigletConfidenceBuffer.length > 0
      ? this.state.pigletConfidenceBuffer.reduce((a, b) => a + b, 0) / this.state.pigletConfidenceBuffer.length
      : 0;

    this.store.getState().addHourlyMetrics({
      hour: hourStart,
      postureTransitions: this.state.postureTransitions,
      nestingEvents: this.state.nestingEvents,
      percentLying: Math.round(percentLying * 10) / 10,
      activityScore: Math.round(activityScore * 100) / 100,
      pigletCountAvg: Math.round(avgPiglets * 10) / 10,
      crushingRiskAvg: Math.round(avgRisk * 100) / 100,
    });

    // Reset hourly counters
    this.state.postureTransitions = 0;
    this.state.nestingEvents = 0;
    this.state.activeFrames = 0;
    this.state.lyingFrames = 0;
    this.state.totalFrames = 0;
    this.state.pigletCountBuffer = [];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GEOMETRY HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private calculateIoU(a: Detection, b: Detection): number {
    const [ax1, ay1, ax2, ay2] = a.bbox;
    const [bx1, by1, bx2, by2] = b.bbox;

    const x1 = Math.max(ax1, bx1);
    const y1 = Math.max(ay1, by1);
    const x2 = Math.min(ax2, bx2);
    const y2 = Math.min(ay2, by2);

    const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    if (intersection === 0) return 0;

    const areaA = (ax2 - ax1) * (ay2 - ay1);
    const areaB = (bx2 - bx1) * (by2 - by1);
    const union = areaA + areaB - intersection;

    return union > 0 ? intersection / union : 0;
  }

  // ─── Public Getters ───────────────────────────────────────────────────

  getState(): FarrowingSystemState {
    return this.store.getState().systemState;
  }

  isActive(): boolean {
    return this.isRunning;
  }

  getCurrentPigletCount(): number {
    return this.state.highestPigletCount;
  }

  getTimeSinceLastPiglet(): number {
    if (this.state.lastNewPigletTime === 0) return 0;
    return Date.now() - this.state.lastNewPigletTime;
  }

  // ─── Backend Persistence ──────────────────────────────────────────────

  /**
   * Persist state transitions to the backend for data logging (Section 7).
   * Called on key transitions: PREDICTION_HIGH, FARROWING_STARTED, FARROWING_COMPLETED.
   */
  private async persistStateToBackend(
    newState: FarrowingSystemState,
    previousState: FarrowingSystemState | null
  ): Promise<void> {
    if (!this.penId) return;

    const store = this.store.getState();
    const payload = {
      pen_id: this.penId,
      sow_id: this.sowId ?? null,
      system_state: newState,
      previous_state: previousState,
      prediction_metrics: store.prediction,
      piglet_count: store.currentPigletCount,
      highest_piglet_count: this.state.highestPigletCount,
      crushing_incidents: store.activeSession?.crushingIncidents ?? 0,
      birth_events: store.activeSession?.birthEvents ?? [],
      session_started_at: store.activeSession?.startedAt
        ? new Date(store.activeSession.startedAt).toISOString()
        : null,
      session_duration_minutes: store.activeSession
        ? (Date.now() - store.activeSession.startedAt) / 60000
        : null,
    };

    try {
      const token = localStorage.getItem('access_token');
      await fetch('/api/farrowing/ai-monitor/state', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.warn('[FarrowingEngine] Failed to persist state:', err);
    }
  }
}

// Singleton
export const farrowingEngine = new FarrowingEngine();
