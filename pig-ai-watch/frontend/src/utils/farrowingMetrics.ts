// ── Shared Farrowing Metrics ────────────────────────────────────────────────
// Centralised computation functions used across TestPenPage, DashboardPage,
// StatsPage and ReplayPage so logic never drifts between views.

// ── Restlessness Score ──────────────────────────────────────────────────────

export interface RestlessnessInput {
  postureTransitionsPerHour: number;
  nestingCountPerHour: number;
  percentTimeLying: number;
}

export type RestlessnessLevel = 'Calm' | 'Active' | 'Restless' | 'Pre-Farrowing Critical';

export interface RestlessnessResult {
  score: number;            // 0 – 100
  level: RestlessnessLevel;
  color: string;            // tailwind-friendly hex
}

export function computeRestlessnessScore(data: RestlessnessInput): RestlessnessResult {
  const raw =
    (data.postureTransitionsPerHour * 3) +
    (data.nestingCountPerHour * 6) +
    ((100 - data.percentTimeLying) * 0.5);

  const score = Math.min(100, Math.max(0, Math.round(raw)));

  let level: RestlessnessLevel;
  let color: string;

  if (score >= 80) {
    level = 'Pre-Farrowing Critical';
    color = '#DC2626'; // red-600
  } else if (score >= 60) {
    level = 'Restless';
    color = '#F59E0B'; // amber-500
  } else if (score >= 30) {
    level = 'Active';
    color = '#3B82F6'; // blue-500
  } else {
    level = 'Calm';
    color = '#10B981'; // emerald-500
  }

  return { score, level, color };
}

// ── Farrowing Likelihood % ──────────────────────────────────────────────────

export interface LikelihoodInput {
  postureTransitionsPerHour: number;
  nestingCountPerHour: number;
}

export type LikelihoodLabel = 'LOW' | 'MODERATE' | 'HIGH';

export interface LikelihoodResult {
  score: number;            // 0 – 100
  label: LikelihoodLabel;
  color: string;
}

export function computeFarrowingLikelihood(data: LikelihoodInput): LikelihoodResult {
  const raw =
    (data.postureTransitionsPerHour * 2) +
    (data.nestingCountPerHour * 5);

  const score = Math.min(100, Math.max(0, Math.round(raw)));

  let label: LikelihoodLabel;
  let color: string;

  if (score >= 60) {
    label = 'HIGH';
    color = '#DC2626'; // red-600
  } else if (score >= 30) {
    label = 'MODERATE';
    color = '#F59E0B'; // amber-500
  } else {
    label = 'LOW';
    color = '#10B981'; // emerald-500
  }

  return { score, label, color };
}

// ── Stagnation Escalation ───────────────────────────────────────────────────

export type StagnationLevel = 'NORMAL' | 'WARNING' | 'CRITICAL' | 'EMERGENCY';

export interface StagnationResult {
  level: StagnationLevel;
  color: string;
  bg: string;
  message: string;
  pulse: boolean;
}

export function computeStagnationLevel(minutesSinceLastPiglet: number): StagnationResult {
  if (minutesSinceLastPiglet >= 60) {
    return {
      level: 'EMERGENCY',
      color: 'text-red-100',
      bg: 'bg-red-700 dark:bg-red-800',
      message: 'No new piglet for 60+ min. Possible dystocia — veterinary intervention may be needed immediately.',
      pulse: true,
    };
  }
  if (minutesSinceLastPiglet >= 45) {
    return {
      level: 'CRITICAL',
      color: 'text-red-700 dark:text-red-200',
      bg: 'bg-red-100 dark:bg-red-900/30',
      message: 'No new piglet for 45+ min. High risk of dystocia — prepare for intervention.',
      pulse: true,
    };
  }
  if (minutesSinceLastPiglet >= 20) {
    return {
      level: 'WARNING',
      color: 'text-amber-700 dark:text-amber-200',
      bg: 'bg-amber-100 dark:bg-amber-900/30',
      message: 'No new piglet for 20+ min. Monitor closely — interval between piglets is getting long.',
      pulse: false,
    };
  }
  return {
    level: 'NORMAL',
    color: 'text-green-700 dark:text-green-300',
    bg: 'bg-green-100 dark:bg-green-900/30',
    message: 'Birth interval normal.',
    pulse: false,
  };
}

// ── Inter-Birth Interval Calculations ───────────────────────────────────────

export interface BirthTimestamp {
  timestamp: string | number | Date;
}

export interface BirthInterval {
  pigletNumber: number;
  intervalMinutes: number;
  risk: 'normal' | 'delayed' | 'critical';
}

export function computeBirthIntervals(births: BirthTimestamp[]): BirthInterval[] {
  if (!births || births.length < 2) return [];

  const sorted = [...births].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const intervals: BirthInterval[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const diffMs =
      new Date(sorted[i].timestamp).getTime() -
      new Date(sorted[i - 1].timestamp).getTime();
    const intervalMinutes = Math.round(diffMs / 60000);

    intervals.push({
      pigletNumber: i + 1,
      intervalMinutes,
      risk: intervalMinutes >= 45 ? 'critical' : intervalMinutes >= 30 ? 'delayed' : 'normal',
    });
  }

  return intervals;
}

export function computeAverageInterval(intervals: BirthInterval[]): number {
  if (!intervals.length) return 0;
  const sum = intervals.reduce((acc, i) => acc + i.intervalMinutes, 0);
  return Math.round(sum / intervals.length);
}

export function computeLongestInterval(intervals: BirthInterval[]): number {
  if (!intervals.length) return 0;
  return Math.max(...intervals.map(i => i.intervalMinutes));
}

/**
 * Estimate birth intervals from total_born + duration when per-piglet
 * timestamps are not available (backend aggregate data).
 */
export function estimateBirthIntervals(
  totalBorn: number,
  durationMinutes: number,
): BirthInterval[] {
  if (totalBorn < 2 || durationMinutes <= 0) return [];
  const avgInterval = Math.round(durationMinutes / (totalBorn - 1));
  return Array.from({ length: totalBorn - 1 }, (_, i) => ({
    pigletNumber: i + 2,
    intervalMinutes: avgInterval,
    risk: avgInterval >= 45 ? 'critical' as const : avgInterval >= 30 ? 'delayed' as const : 'normal' as const,
  }));
}

// ── Session Classification ──────────────────────────────────────────────────

export type SessionClassification =
  | 'NORMAL FARROWING'
  | 'PROLONGED FARROWING'
  | 'DYSTOCIA SUSPECTED'
  | 'HIGH STILLBORN RISK'
  | 'HIGH CRUSHING RISK';

export interface SessionClassificationResult {
  label: SessionClassification;
  color: string;   // text color class
  bg: string;      // bg color class
}

export function classifySession(params: {
  totalDurationMinutes: number;
  longestInterval: number;
  stillbornCount: number;
  crushingIncidents: number;
}): SessionClassificationResult {
  if (params.longestInterval >= 60) {
    return {
      label: 'DYSTOCIA SUSPECTED',
      bg: 'bg-red-100 dark:bg-red-900/40',
      color: 'text-red-700 dark:text-red-300',
    };
  }
  if (params.totalDurationMinutes > 360) {
    return {
      label: 'PROLONGED FARROWING',
      bg: 'bg-amber-100 dark:bg-amber-900/40',
      color: 'text-amber-700 dark:text-amber-300',
    };
  }
  if (params.stillbornCount >= 2) {
    return {
      label: 'HIGH STILLBORN RISK',
      bg: 'bg-red-100 dark:bg-red-900/40',
      color: 'text-red-700 dark:text-red-300',
    };
  }
  if (params.crushingIncidents >= 3) {
    return {
      label: 'HIGH CRUSHING RISK',
      bg: 'bg-orange-100 dark:bg-orange-900/40',
      color: 'text-orange-700 dark:text-orange-300',
    };
  }
  return {
    label: 'NORMAL FARROWING',
    bg: 'bg-green-100 dark:bg-green-900/40',
    color: 'text-green-700 dark:text-green-300',
  };
}

// ── Automated Clinical Interpretation ───────────────────────────────────────

// ── Age-Adjusted Crushing Risk ──────────────────────────────────────────────

export interface CrushingRiskAgeContext {
  daysSinceFarrowing: number | null;
  rawRisk: number;
}

export type CrushingRiskPhase = 'newborn' | 'mid-lactation' | 'late-lactation' | 'unknown';

export interface CrushingRiskResult {
  adjustedRisk: number;
  phase: CrushingRiskPhase;
  phaseLabel: string;
  level: 'low' | 'moderate' | 'elevated' | 'high';
  message: string;
  color: string;
  bgColor: string;
}

export function computeAgeAdjustedCrushingRisk(ctx: CrushingRiskAgeContext): CrushingRiskResult {
  const { rawRisk, daysSinceFarrowing } = ctx;

  // Determine phase and multiplier
  let phase: CrushingRiskPhase;
  let phaseLabel: string;
  let multiplier: number;

  if (daysSinceFarrowing === null || daysSinceFarrowing === undefined) {
    phase = 'unknown';
    phaseLabel = 'Age unknown';
    multiplier = 1.0;
  } else if (daysSinceFarrowing <= 7) {
    phase = 'newborn';
    phaseLabel = `Day ${daysSinceFarrowing} — Newborn`;
    multiplier = 1.3;
  } else if (daysSinceFarrowing <= 21) {
    phase = 'mid-lactation';
    phaseLabel = `Day ${daysSinceFarrowing} — Mid-lactation`;
    multiplier = 1.0;
  } else {
    phase = 'late-lactation';
    phaseLabel = `Day ${daysSinceFarrowing} — Late lactation`;
    multiplier = 0.6;
  }

  const adjustedRisk = Math.min(1, Math.max(0, rawRisk * multiplier));

  // Level thresholds
  let level: CrushingRiskResult['level'];
  let color: string;
  let bgColor: string;

  if (adjustedRisk < 0.25) {
    level = 'low';
    color = 'text-teal-600 dark:text-teal-400';
    bgColor = 'bg-teal-50 dark:bg-teal-900/20';
  } else if (adjustedRisk < 0.5) {
    level = 'moderate';
    color = 'text-sky-600 dark:text-sky-400';
    bgColor = 'bg-sky-50 dark:bg-sky-900/20';
  } else if (adjustedRisk < 0.7) {
    level = 'elevated';
    color = 'text-amber-600 dark:text-amber-400';
    bgColor = 'bg-amber-50 dark:bg-amber-900/20';
  } else {
    level = 'high';
    color = 'text-orange-600 dark:text-orange-400';
    bgColor = 'bg-orange-50 dark:bg-orange-900/20';
  }

  // Contextual message
  let message: string;
  const pct = Math.round(adjustedRisk * 100);

  if (phase === 'newborn') {
    if (level === 'high' || level === 'elevated') {
      message = `Elevated overlay risk (${pct}%) for neonatal piglets (Day ${daysSinceFarrowing}). Newborns are most vulnerable to crushing — ensure the creep area is warm and accessible.`;
    } else if (level === 'moderate') {
      message = `Moderate proximity detected for newborn piglets (Day ${daysSinceFarrowing}). Continue close monitoring — neonates have limited mobility to escape overlay.`;
    } else {
      message = `Low crushing risk for newborn piglets (Day ${daysSinceFarrowing}). Piglets appear at safe distance. Continue routine monitoring during this critical neonatal period.`;
    }
  } else if (phase === 'mid-lactation') {
    if (level === 'high' || level === 'elevated') {
      message = `Elevated proximity detected (${pct}%). Piglets at Day ${daysSinceFarrowing} are more mobile but still at risk during sow rest periods.`;
    } else if (level === 'moderate') {
      message = `Moderate risk at Day ${daysSinceFarrowing}. Piglets are growing but should still be monitored during sow posture changes.`;
    } else {
      message = `Low risk at Day ${daysSinceFarrowing}. Piglets are developing well and maintaining safe distance from the sow.`;
    }
  } else if (phase === 'late-lactation') {
    if (level === 'high' || level === 'elevated') {
      message = `Some proximity detected (${pct}%), but at Day ${daysSinceFarrowing} piglets are large and mobile enough to avoid most overlay situations. Crushing is uncommon in late lactation.`;
    } else {
      message = `Low risk. At Day ${daysSinceFarrowing}, piglets are large enough to move away from the sow. Crushing is uncommon at this stage — consider weaning readiness.`;
    }
  } else {
    if (level === 'high' || level === 'elevated') {
      message = `Elevated proximity detected (${pct}%). Piglet age is unknown — if these are newborns, treat this as a higher concern.`;
    } else {
      message = `Crushing risk appears low (${pct}%). Piglet age context unavailable — assign a sow with farrowing data for age-aware assessment.`;
    }
  }

  return { adjustedRisk, phase, phaseLabel, level, message, color, bgColor };
}

// ── Automated Clinical Interpretation ───────────────────────────────────────

export function generateClinicalSummary(params: {
  averageInterval: number;
  longestInterval: number;
  totalDurationMinutes: number;
  stillbornCount: number;
  crushingIncidents: number;
  peakRestlessness: number;
}): string {
  const summary: string[] = [];

  if (params.totalDurationMinutes > 360) {
    summary.push('Prolonged labor observed (>6 hours).');
  }

  if (params.longestInterval > 45) {
    summary.push(`Extended birth interval of ${params.longestInterval} min suggests possible dystocia.`);
  } else if (params.longestInterval > 30) {
    summary.push(`Moderately delayed birth interval of ${params.longestInterval} min noted.`);
  }

  if (params.stillbornCount > 0) {
    summary.push(`Stillbirth occurrence detected (${params.stillbornCount} stillborn).`);
  }

  if (params.crushingIncidents > 0) {
    summary.push(`${params.crushingIncidents} crushing risk incident(s) recorded during session.`);
  }

  if (params.peakRestlessness > 80) {
    summary.push('High pre-farrowing restlessness spike noted — consistent with imminent labor onset.');
  } else if (params.peakRestlessness > 60) {
    summary.push('Elevated pre-farrowing restlessness detected.');
  }

  if (params.averageInterval > 0 && params.averageInterval <= 20) {
    summary.push(`Average inter-birth interval of ${params.averageInterval} min is within normal range.`);
  }

  if (!summary.length) {
    summary.push('Farrowing progression within expected physiological range. No anomalies detected.');
  }

  return summary.join(' ');
}
