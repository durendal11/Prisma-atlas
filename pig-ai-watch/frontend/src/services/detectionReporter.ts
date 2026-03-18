/**
 * detectionReporter.ts
 * Posts Events and Alerts to the backend based on ONNX front-end detection results.
 * Call reportDetection() every time you want to flush a detection interval (e.g. every 12s).
 */

import type { DetectionResult } from '@/utils/onnxDetector';

const API_BASE = '/api';

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('access_token');
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

async function postEvent(payload: object) {
  try {
    const res = await fetch(`${API_BASE}/events`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) console.warn('Event post failed:', await res.text());
  } catch (e) {
    console.warn('Event post error:', e);
  }
}

async function postAlert(payload: object) {
  try {
    const res = await fetch(`${API_BASE}/alerts`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) console.warn('Alert post failed:', await res.text());
  } catch (e) {
    console.warn('Alert post error:', e);
  }
}

// Tracks the last alert time per alert type to avoid spamming
const lastAlertAt: Record<string, number> = {};
// Tracks consecutive high-risk readings to require sustained risk before alerting
const consecutiveHighRisk: Record<number, number> = {};

const COOLDOWNS: Record<string, number> = {
  crushing_risk_critical: 5 * 60_000,   // 5 min — critical, fire sooner
  crushing_risk_high:    10 * 60_000,   // 10 min — only after 2 consecutive readings
};

function canAlert(type: string): boolean {
  const now = Date.now();
  const cooldown = COOLDOWNS[type] ?? 5 * 60_000;
  if (!lastAlertAt[type] || now - lastAlertAt[type] > cooldown) {
    lastAlertAt[type] = now;
    return true;
  }
  return false;
}

/**
 * Call this every ~12 seconds with the latest detection result.
 * Always logs a detection Event; only raises Alerts when genuinely necessary.
 *
 * Alert rules (strict):
 *  - Critical (≥80% risk): immediate alert, 5-min cooldown
 *  - High    (≥65% risk): only after 2 consecutive high-risk readings, 10-min cooldown
 *  - Nothing else fires an alert — routine detections, nursing, sleeping, low risk are events only
 */
export async function reportDetection(result: DetectionResult, penId: number = 10): Promise<void> {
  if (!result || result.totalPigCount === 0) return;

  const bs = result.behaviorSummary;
  const risk = result.crushingRisk;
  const riskPct = Math.round(risk * 100);
  const postureLabel = result.sowPosture && result.sowPosture !== 'none' ? result.sowPosture : 'unknown';

  // ── 1. Always post an informational detection event (goes to Event Logs) ──
  const sowDesc = result.sowCount > 0
    ? `${result.sowCount} sow${result.sowCount > 1 ? 's' : ''} (posture: ${postureLabel})`
    : 'no sows';
  const pigletDesc = `${result.pigletCount} piglet${result.pigletCount !== 1 ? 's' : ''}`;

  await postEvent({
    type: 'detection',
    category: 'ai_detection',
    pen_id: penId,
    description: `Pen ${penId} — ${pigletDesc}, ${sowDesc}. Crushing risk: ${riskPct}%. Confidence: ${Math.round(result.analytics.avgConfidence * 100)}%.`,
    metadata: JSON.stringify({
      piglet_count: result.pigletCount,
      sow_count: result.sowCount,
      sow_posture: postureLabel,
      crushing_risk: risk,
      is_nursing: bs?.isNursing ?? false,
      is_feeding: bs?.isFeeding ?? false,
      is_sleeping: bs?.isSleeping ?? false,
      health_score: bs?.healthScore ?? null,
      inference_ms: result.inferenceTimeMs,
    }),
  });

  // ── 2. Crushing risk alerts (only when actionable) ─────────────────────────

  if (risk >= 0.8) {
    // CRITICAL — alert immediately, every 5 min
    consecutiveHighRisk[penId] = 0; // reset — critical supersedes
    if (canAlert('crushing_risk_critical')) {
      await postAlert({
        type: 'crushing_risk',
        severity: 'critical',
        pen_id: penId,
        title: `⚠️ Critical crushing risk — Pen ${penId}`,
        message: `Crushing risk at ${riskPct}%: ${result.proximityAlerts.length} piglet(s) dangerously close to sow (${postureLabel}). Immediate action required.`,
        detection_data: JSON.stringify({ risk, piglet_count: result.pigletCount, sow_posture: postureLabel, proximity_alerts: result.proximityAlerts.length }),
      });
    }
  } else if (risk >= 0.65) {
    // HIGH — only alert after 2 consecutive high readings (≈24s of sustained risk)
    consecutiveHighRisk[penId] = (consecutiveHighRisk[penId] ?? 0) + 1;
    if (consecutiveHighRisk[penId] >= 2 && canAlert('crushing_risk_high')) {
      await postAlert({
        type: 'crushing_risk',
        severity: 'high',
        pen_id: penId,
        title: `High crushing risk — Pen ${penId}`,
        message: `Sustained crushing risk at ${riskPct}% for ${consecutiveHighRisk[penId]} consecutive readings. Sow posture: ${postureLabel}. ${result.pigletCount} piglet(s) nearby.`,
        detection_data: JSON.stringify({ risk, piglet_count: result.pigletCount, sow_posture: postureLabel }),
      });
    }
  } else {
    // Risk has dropped — reset consecutive counter
    consecutiveHighRisk[penId] = 0;
  }
}
