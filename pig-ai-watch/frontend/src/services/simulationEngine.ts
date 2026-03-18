/**
 * SimulationEngine — Processes detection results and automatically generates
 * events, tracks behavior sessions, monitors piglet counts, and produces
 * smart alerts for the live monitoring simulation.
 */
import type { DetectionResult, Detection } from '@/utils/onnxDetector';
import { useSimulationStore, genSessionId } from '@/store/simulationStore';
import type { EventSeverity, EventType, NursingSession } from '@/store/simulationStore';
import { farrowingEngine } from '@/services/farrowingEngine';

// ─── Configuration ──────────────────────────────────────────────────────────

const CONFIG = {
  // Piglet monitoring
  pigletDropThresholdFrames: 8,       // consecutive frames before alerting
  pigletRecoveryFrames: 5,            // frames of normal count to clear alert
  
  // Nursing session
  nursingMinDurationMs: 5000,         // min 5s to count as nursing session
  
  // Risk monitoring
  highRiskThreshold: 0.65,
  sustainedRiskFrames: 10,            // frames of high risk before escalation
  riskRecoveryFrames: 5,
  
  // Cross-pen detection
  crossPenSowThreshold: 2,           // if > 1 sow detected, likely cross-pen
  edgeZoneRatio: 0.15,               // detections within 15% of frame edge
  
  // Health monitoring
  healthWarningThreshold: 40,
  
  // Sampling rates (not every frame)
  pigletSampleRate: 3,               // record piglet count every N frames
  riskSampleRate: 3,
  healthSampleRate: 5,
  
  // Activity thresholds
  inactivityAlertMs: 120000,         // 2 min without posture change
} as const;

// ─── Engine State (mutable, not in Zustand for performance) ─────────────────

interface EngineState {
  lastPosture: string;
  lastPigletCount: number;
  consecutiveLowPigletFrames: number;
  consecutiveNormalPigletFrames: number;
  pigletDropAlerted: boolean;
  
  isNursing: boolean;
  currentNursingStart: number;
  currentNursingStartVideo: number;
  
  consecutiveHighRiskFrames: number;
  consecutiveNormalRiskFrames: number;
  highRiskAlerted: boolean;
  lastHighRiskTime: number;
  
  lastPostureChangeTime: number;
  inactivityAlerted: boolean;
  
  frameCount: number;
  lastCrossPenFrame: number;
  
  isFeeding: boolean;
  feedingStartTime: number;
  feedingStartVideoTime: number;
}

const createInitialEngineState = (): EngineState => ({
  lastPosture: '',
  lastPigletCount: -1,
  consecutiveLowPigletFrames: 0,
  consecutiveNormalPigletFrames: 0,
  pigletDropAlerted: false,
  
  isNursing: false,
  currentNursingStart: 0,
  currentNursingStartVideo: 0,
  
  consecutiveHighRiskFrames: 0,
  consecutiveNormalRiskFrames: 0,
  highRiskAlerted: false,
  lastHighRiskTime: 0,
  
  lastPostureChangeTime: Date.now(),
  inactivityAlerted: false,
  
  frameCount: 0,
  lastCrossPenFrame: 0,
  
  isFeeding: false,
  feedingStartTime: 0,
  feedingStartVideoTime: 0,
});

// ─── Simulation Engine ──────────────────────────────────────────────────────

class SimulationEngine {
  private state: EngineState = createInitialEngineState();
  private store = useSimulationStore;
  
  /**
   * Start a new simulation session
   */
  start(expectedPiglets: number, sowId?: number, penId?: number): void {
    this.state = createInitialEngineState();
    this.store.getState().resetSimulation();
    this.store.getState().startSimulation(expectedPiglets);
    
    // Start farrowing monitoring engine
    farrowingEngine.start(sowId, penId);
    
    this.emitEvent({
      type: 'session_start',
      severity: 'info',
      title: 'Monitoring Started',
      description: `Live monitoring simulation started. Tracking ${expectedPiglets} piglets.`,
      videoTime: 0,
    });
  }
  
  /**
   * Stop the simulation
   */
  stop(): void {
    const store = this.store.getState();
    
    // Stop farrowing engine
    farrowingEngine.stop();
    
    // Close any open nursing session
    if (this.state.isNursing) {
      this.endNursingSession(Date.now(), 0);
    }
    
    // Close any open feeding session
    if (this.state.isFeeding) {
      this.emitEvent({
        type: 'feeding_end',
        severity: 'info',
        title: 'Feeding Ended',
        description: `Sow stopped feeding. Duration: ${this.formatDuration(Date.now() - this.state.feedingStartTime)}.`,
        videoTime: 0,
      });
    }
    
    this.emitEvent({
      type: 'session_end',
      severity: 'info',
      title: 'Monitoring Stopped',
      description: `Session ended. ${store.framesProcessed} frames processed, ${store.events.length} events generated.`,
      videoTime: 0,
    });
    
    store.stopSimulation();
  }
  
  /**
   * Process a single detection frame — the main entry point called on every detection
   */
  processFrame(result: DetectionResult, videoTime: number): void {
    if (!this.store.getState().isSimulating) return;
    
    const now = Date.now();
    const store = this.store.getState();
    this.state.frameCount++;
    
    // 1. Update frame counter
    store.incrementFrames();
    
    // 2. Track frame-level stats
    const isNursing = result.behaviorSummary?.isNursing ?? false;
    const isFeeding = result.behaviorSummary?.isFeeding ?? false;
    const isSleeping = result.behaviorSummary?.isSleeping ?? false;
    const isStanding = !isNursing && !isFeeding && !isSleeping &&
      /stand/i.test(result.sowPosture);
    
    store.addFrameStats(
      isNursing, isFeeding, isSleeping, isStanding,
      result.pigletCount, result.crushingRisk,
      result.behaviorSummary?.healthScore ?? 50
    );
    
    // 3. Posture change detection
    this.processPostureChange(result, now, videoTime);
    
    // 4. Nursing session tracking
    this.processNursing(result, isNursing, now, videoTime);
    
    // 5. Feeding session tracking
    this.processFeeding(result, isFeeding, now, videoTime);
    
    // 6. Piglet count monitoring
    this.processPigletCount(result, now, videoTime);
    
    // 7. Crushing risk monitoring
    this.processRisk(result, now, videoTime);
    
    // 8. Health score monitoring
    this.processHealth(result, now, videoTime);
    
    // 9. Cross-pen detection
    this.processCrossPen(result, now, videoTime);
    
    // 10. Inactivity alert
    this.processInactivity(now, videoTime);
    
    // 11. Farrowing engine (state machine, birth detection, safety)
    farrowingEngine.processFrame(result);
    
    // 12. Posture tracking for timeline
    const posture = result.sowPosture || 'unknown';
    store.updatePosture(posture, now, videoTime);
  }
  
  // ─── Posture Change ─────────────────────────────────────────────────────
  
  private processPostureChange(result: DetectionResult, now: number, videoTime: number): void {
    const posture = result.sowPosture || 'unknown';
    
    if (this.state.lastPosture && posture !== this.state.lastPosture && posture !== 'unknown') {
      this.emitEvent({
        type: 'posture_change',
        severity: 'info',
        title: 'Posture Change',
        description: `Sow changed from ${this.formatPosture(this.state.lastPosture)} to ${this.formatPosture(posture)}.`,
        videoTime,
        data: { from: this.state.lastPosture, to: posture },
      });
      
      this.state.lastPostureChangeTime = now;
      this.state.inactivityAlerted = false;
    }
    
    if (posture !== 'unknown') {
      this.state.lastPosture = posture;
    }
  }
  
  // ─── Nursing ────────────────────────────────────────────────────────────
  
  private processNursing(result: DetectionResult, isNursing: boolean, now: number, videoTime: number): void {
    if (isNursing && !this.state.isNursing) {
      // Nursing started
      this.state.isNursing = true;
      this.state.currentNursingStart = now;
      this.state.currentNursingStartVideo = videoTime;
      
      const session: NursingSession = {
        id: genSessionId(),
        startTime: now,
        startVideoTime: videoTime,
      };
      this.store.getState().setCurrentNursingSession(session);
      
      this.emitEvent({
        type: 'nursing_start',
        severity: 'info',
        title: 'Lactation Started',
        description: `Sow began lactating. ${result.pigletCount} piglet(s) in pen.`,
        videoTime,
        data: { pigletCount: result.pigletCount },
      });
    } else if (!isNursing && this.state.isNursing) {
      // Nursing ended
      this.endNursingSession(now, videoTime);
    }
  }
  
  private endNursingSession(now: number, videoTime: number): void {
    const duration = now - this.state.currentNursingStart;
    this.state.isNursing = false;
    
    if (duration >= CONFIG.nursingMinDurationMs) {
      const session: NursingSession = {
        id: genSessionId(),
        startTime: this.state.currentNursingStart,
        startVideoTime: this.state.currentNursingStartVideo,
        endTime: now,
        endVideoTime: videoTime,
        durationMs: duration,
      };
      
      this.store.getState().addNursingSession(session);
      this.store.getState().setCurrentNursingSession(null);
      
      this.emitEvent({
        type: 'nursing_end',
        severity: 'info',
        title: 'Lactation Ended',
        description: `Lactation session lasted ${this.formatDuration(duration)}. ${this.store.getState().nursingSessions.length} session(s) this monitoring period.`,
        videoTime,
        data: { durationMs: duration },
      });
    } else {
      this.store.getState().setCurrentNursingSession(null);
    }
  }
  
  // ─── Feeding ────────────────────────────────────────────────────────────
  
  private processFeeding(_result: DetectionResult, isFeeding: boolean, now: number, videoTime: number): void {
    if (isFeeding && !this.state.isFeeding) {
      this.state.isFeeding = true;
      this.state.feedingStartTime = now;
      this.state.feedingStartVideoTime = videoTime;
      
      this.emitEvent({
        type: 'feeding_start',
        severity: 'info',
        title: 'Feeding Started',
        description: 'Sow is now feeding. Good sign of appetite and health.',
        videoTime,
      });
    } else if (!isFeeding && this.state.isFeeding) {
      const duration = now - this.state.feedingStartTime;
      this.state.isFeeding = false;
      
      if (duration > 3000) {
        this.emitEvent({
          type: 'feeding_end',
          severity: 'info',
          title: 'Feeding Ended',
          description: `Sow stopped feeding after ${this.formatDuration(duration)}.`,
          videoTime,
          data: { durationMs: duration },
        });
      }
    }
  }
  
  // ─── Piglet Count ───────────────────────────────────────────────────────
  
  private processPigletCount(result: DetectionResult, now: number, videoTime: number): void {
    const expected = this.store.getState().expectedPigletCount;
    const detected = result.pigletCount;
    
    // Sample for history
    if (this.state.frameCount % CONFIG.pigletSampleRate === 0) {
      this.store.getState().addPigletCount({
        timestamp: now,
        videoTime,
        count: detected,
        expected,
      });
    }
    
    // Monitor drops
    if (detected < expected && detected > 0) {
      this.state.consecutiveLowPigletFrames++;
      this.state.consecutiveNormalPigletFrames = 0;
      
      if (this.state.consecutiveLowPigletFrames >= CONFIG.pigletDropThresholdFrames && !this.state.pigletDropAlerted) {
        this.state.pigletDropAlerted = true;
        this.store.getState().setPigletDropAlert(true);
        
        const missing = expected - detected;
        const severity: EventSeverity = missing >= 3 ? 'critical' : 'warning';
        
        this.emitEvent({
          type: 'piglet_count_drop',
          severity,
          title: `Piglet Count Drop: ${detected}/${expected}`,
          description: missing >= 3
            ? `${missing} piglets missing from view. Check for crushing, escape, or camera blind spots immediately!`
            : `${missing} piglet(s) not visible. May be hidden behind sow or in blind spot. Verify physically.`,
          videoTime,
          data: { detected, expected, missing },
        });
      }
    } else if (detected >= expected) {
      this.state.consecutiveNormalPigletFrames++;
      this.state.consecutiveLowPigletFrames = 0;
      
      if (this.state.pigletDropAlerted && this.state.consecutiveNormalPigletFrames >= CONFIG.pigletRecoveryFrames) {
        this.state.pigletDropAlerted = false;
        this.store.getState().setPigletDropAlert(false);
        
        this.emitEvent({
          type: 'piglet_count_recovered',
          severity: 'info',
          title: `Piglet Count Recovered: ${detected}/${expected}`,
          description: 'All expected piglets are visible again.',
          videoTime,
          data: { detected, expected },
        });
      }
    }
    
    this.state.lastPigletCount = detected;
  }
  
  // ─── Risk ───────────────────────────────────────────────────────────────
  
  private processRisk(result: DetectionResult, now: number, videoTime: number): void {
    const risk = result.crushingRisk;
    
    // Sample for history
    if (this.state.frameCount % CONFIG.riskSampleRate === 0) {
      this.store.getState().addRiskEntry({
        timestamp: now,
        videoTime,
        risk,
        level: result.crushingRiskLevel,
      });
    }
    
    // Monitor sustained high risk
    if (risk >= CONFIG.highRiskThreshold) {
      this.state.consecutiveHighRiskFrames++;
      this.state.consecutiveNormalRiskFrames = 0;
      
      // Track duration
      if (this.state.lastHighRiskTime > 0) {
        const elapsed = now - this.state.lastHighRiskTime;
        this.store.getState().addHighRiskDuration(elapsed);
      }
      this.state.lastHighRiskTime = now;
      
      if (this.state.consecutiveHighRiskFrames >= CONFIG.sustainedRiskFrames && !this.state.highRiskAlerted) {
        this.state.highRiskAlerted = true;
        this.store.getState().setSustainedHighRisk(true, now);
        
        this.emitEvent({
          type: 'risk_escalation',
          severity: 'critical',
          title: 'Sustained High Crushing Risk!',
          description: `Crushing risk has been above ${(CONFIG.highRiskThreshold * 100).toFixed(0)}% for ${CONFIG.sustainedRiskFrames} consecutive frames. Piglets may be in danger.`,
          videoTime,
          data: { risk: (risk * 100).toFixed(0), duration: CONFIG.sustainedRiskFrames },
        });
      }
    } else {
      this.state.consecutiveNormalRiskFrames++;
      this.state.consecutiveHighRiskFrames = 0;
      this.state.lastHighRiskTime = 0;
      
      if (this.state.highRiskAlerted && this.state.consecutiveNormalRiskFrames >= CONFIG.riskRecoveryFrames) {
        this.state.highRiskAlerted = false;
        this.store.getState().setSustainedHighRisk(false);
        
        this.emitEvent({
          type: 'risk_deescalation',
          severity: 'info',
          title: 'Crushing Risk Normalized',
          description: 'Crushing risk has returned to normal levels.',
          videoTime,
        });
      }
    }
  }
  
  // ─── Health ─────────────────────────────────────────────────────────────
  
  private processHealth(result: DetectionResult, now: number, videoTime: number): void {
    const score = result.behaviorSummary?.healthScore ?? 50;
    
    // Sample for history
    if (this.state.frameCount % CONFIG.healthSampleRate === 0) {
      this.store.getState().addHealthEntry({
        timestamp: now,
        videoTime,
        score,
      });
    }
    
    if (score < CONFIG.healthWarningThreshold && this.state.frameCount > 30) {
      // Only alert once per sustained low-health period
      const recentHealthEvents = this.store.getState().events.filter(
        (e) => e.type === 'health_warning' && Date.now() - e.timestamp < 30000
      );
      
      if (recentHealthEvents.length === 0) {
        this.emitEvent({
          type: 'health_warning',
          severity: 'warning',
          title: 'Low Health Score',
          description: `Health score dropped to ${score.toFixed(0)}/100. Check sow behavior patterns and piglet welfare.`,
          videoTime,
          data: { score },
        });
      }
    }
  }
  
  // ─── Cross-Pen ──────────────────────────────────────────────────────────
  
  private processCrossPen(result: DetectionResult, _now: number, videoTime: number): void {
    const sowDetections = result.detections.filter((d) => d.category === 'sow');
    
    // If >1 sow detected, one might be from adjacent pen
    if (sowDetections.length > CONFIG.crossPenSowThreshold) {
      // Check if any sow is near the frame edge
      const edgeSows = sowDetections.filter((d) =>
        d.centerX < CONFIG.edgeZoneRatio ||
        d.centerX > (1 - CONFIG.edgeZoneRatio) ||
        d.centerY < CONFIG.edgeZoneRatio ||
        d.centerY > (1 - CONFIG.edgeZoneRatio)
      );
      
      if (edgeSows.length > 0 && this.state.frameCount - this.state.lastCrossPenFrame > 60) {
        this.state.lastCrossPenFrame = this.state.frameCount;
        this.store.getState().incrementCrossPenDetections();
        
        this.emitEvent({
          type: 'cross_pen_detection',
          severity: 'info',
          title: 'Adjacent Pen Detection',
          description: `${sowDetections.length} sow(s) detected — ${edgeSows.length} near frame edge likely from adjacent pen. Only tracking primary pen sow.`,
          videoTime,
          data: { totalSows: sowDetections.length, edgeSows: edgeSows.length },
        });
      }
    }
    
    // Also check for piglets near edges (cross-pen piglets)
    const pigletDetections = result.detections.filter((d) => d.category === 'piglet');
    const edgePiglets = pigletDetections.filter((d: Detection) =>
      d.centerX < CONFIG.edgeZoneRatio * 0.5 ||
      d.centerX > (1 - CONFIG.edgeZoneRatio * 0.5)
    );
    
    if (edgePiglets.length > 2 && pigletDetections.length > this.store.getState().expectedPigletCount + 2) {
      if (this.state.frameCount - this.state.lastCrossPenFrame > 60) {
        this.state.lastCrossPenFrame = this.state.frameCount;
        
        this.emitEvent({
          type: 'cross_pen_detection',
          severity: 'info',
          title: 'Cross-pen Piglets',
          description: `Detected ${pigletDetections.length} piglets (expected ${this.store.getState().expectedPigletCount}). ${edgePiglets.length} near edge — likely from adjacent pen.`,
          videoTime,
          data: { detected: pigletDetections.length, edgePiglets: edgePiglets.length },
        });
      }
    }
  }
  
  // ─── Inactivity ─────────────────────────────────────────────────────────
  
  private processInactivity(now: number, videoTime: number): void {
    const timeSinceChange = now - this.state.lastPostureChangeTime;
    
    if (timeSinceChange > CONFIG.inactivityAlertMs && !this.state.inactivityAlerted) {
      this.state.inactivityAlerted = true;
      
      this.emitEvent({
        type: 'activity_alert',
        severity: 'warning',
        title: 'Extended Inactivity',
        description: `Sow has maintained the same posture (${this.formatPosture(this.state.lastPosture)}) for over ${Math.round(timeSinceChange / 60000)} minutes. May indicate lethargy or health concern.`,
        videoTime,
        data: { posture: this.state.lastPosture, durationMs: timeSinceChange },
      });
    }
  }
  
  // ─── Helpers ────────────────────────────────────────────────────────────
  
  private emitEvent(event: { type: EventType; severity: EventSeverity; title: string; description: string; videoTime: number; data?: Record<string, unknown> }): void {
    this.store.getState().addEvent({
      timestamp: Date.now(),
      ...event,
    });
  }
  
  private formatPosture(posture: string): string {
    return posture
      .replace(/-/g, ' ')
      .replace(/_/g, ' ')
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
  
  private formatDuration(ms: number): string {
    const sec = Math.round(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    const rem = sec % 60;
    return rem > 0 ? `${min}m ${rem}s` : `${min}m`;
  }
}

// Singleton
export const simulationEngine = new SimulationEngine();
