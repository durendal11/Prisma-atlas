"""
Farrowing Inference Service — Rule-based alert logic for farrowing monitoring.

Implements biologically accurate rules for:
  - Crushing risk inference (NOT direct detection — inferred from posture + piglet count drop)
  - Smart crushing advisory (clump-aware, tells caretaker to overlook pen)
  - Prolonged inactivity alerts
  - Farrowing duration / dystocia alerts
  - Pre-farrowing posture switching (restlessness inference)

All rules operate on detection timestamps and counts — no new model output required.
"""
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from dataclasses import dataclass, field
from collections import deque
import statistics
import logging

from app.services.piglet_clump_detector import PigletClumpDetector, ClumpAnalysis

logger = logging.getLogger(__name__)


# ─── Configuration ───────────────────────────────────────────────────────────

# Crushing risk thresholds (3-tier system)
CRUSHING_PIGLET_DROP_CRITICAL = 2       # ≥2 piglets missing + sow lying + clump = CRITICAL
CRUSHING_PIGLET_DROP_ADVISORY = 1       # ≥1 piglet missing OR clump near sow = ADVISORY
CRUSHING_DURATION_MINUTES = 0           # 0 = immediate alert on first qualifying snapshot
                                         # (set > 0 to require sustained window before alerting)
CRUSHING_SOW_POSTURES = {"sleeping", "sleeping_lactating", "lying_lateral", "sow-sleep", "sow-sleep-lactate"}

# Stable count tracker
STABLE_COUNT_WINDOW = 15                 # snapshots for rolling median (~30s at 2s intervals)
SUSTAINED_CONFIRMATION_MINUTES = 2       # median must hold for 2 min to become "confirmed"

# Alert cooldowns (avoid spam)
CRUSHING_CRITICAL_COOLDOWN_MINUTES = 10  # critical: 10 min
CRUSHING_ADVISORY_COOLDOWN_MINUTES = 30  # advisory: 30 min (less urgent)
CRUSHING_INFO_COOLDOWN_MINUTES = 45      # info: 45 min
DEFAULT_ALERT_COOLDOWN_MINUTES = 10

# Inactivity thresholds
INACTIVITY_NO_POSTURE_CHANGE_MINUTES = 45   # no posture change → alert
INACTIVITY_NO_PIGLET_DETECTION_MINUTES = 20  # no piglet detected → alert (if litter exists)

# Dystocia thresholds
DYSTOCIA_NO_NEW_PIGLET_MINUTES = 45     # no new piglet during active farrowing → alert
AVERAGE_PIGLET_INTERVAL_MINUTES = (15, 20)  # normal birth interval

# Pre-farrowing posture switching (restlessness)
POSTURE_SWITCH_THRESHOLD = 6        # >6 posture changes in 30 minutes
POSTURE_SWITCH_WINDOW_MINUTES = 30


# ─── Data Structures ────────────────────────────────────────────────────────

@dataclass
class DetectionSnapshot:
    """A single detection frame observation."""
    timestamp: datetime
    sow_posture: str
    piglet_count: int
    confidence: float = 0.0
    # Optional clump analysis from PigletClumpDetector
    clump_analysis: Optional[ClumpAnalysis] = None


@dataclass
class FarrowingInferenceState:
    """Tracks rolling state for inference rules."""
    # Detection history (rolling window)
    detection_history: List[DetectionSnapshot] = field(default_factory=list)
    max_history_minutes: int = 120  # keep 2 hours of data

    # ── Smart stable count tracker ──────────────────────────────────
    # Rolling median of recent piglet counts (robust to flicker)
    recent_counts: deque = field(default_factory=lambda: deque(maxlen=STABLE_COUNT_WINDOW))
    stable_median_count: int = 0

    # Highest confirmed count: only ratchets up when median sustains ≥2 min
    highest_ever_confirmed: int = 0
    median_sustained_since: Optional[datetime] = None
    median_sustained_value: int = 0

    # Legacy baseline (still computed for backwards compatibility)
    baseline_piglet_count: int = 0

    # Crushing risk tracking
    piglet_drop_started_at: Optional[datetime] = None

    # Inactivity tracking
    last_posture_change_at: Optional[datetime] = None
    last_posture: str = ""
    last_piglet_seen_at: Optional[datetime] = None

    # Dystocia tracking (active farrowing only)
    farrowing_active: bool = False
    last_new_piglet_at: Optional[datetime] = None
    highest_piglet_count: int = 0

    # Alert cooldowns (avoid spam) — separate cooldowns per tier
    last_crushing_critical_at: Optional[datetime] = None
    last_crushing_advisory_at: Optional[datetime] = None
    last_crushing_info_at: Optional[datetime] = None
    last_crushing_alert_at: Optional[datetime] = None  # legacy compat
    last_inactivity_alert_at: Optional[datetime] = None
    last_dystocia_alert_at: Optional[datetime] = None
    last_posture_switch_alert_at: Optional[datetime] = None
    alert_cooldown_minutes: int = DEFAULT_ALERT_COOLDOWN_MINUTES


@dataclass
class InferenceAlert:
    """An alert produced by the inference engine."""
    type: str          # crushing_risk, crushing_advisory, detection_anomaly,
                       # inactivity, dystocia, posture_switching
    severity: str      # low, medium, high, critical
    title: str
    message: str
    data: Dict[str, Any] = field(default_factory=dict)


# ─── Inference Engine ────────────────────────────────────────────────────────

class FarrowingInferenceEngine:
    """
    Rule-based inference engine for farrowing alerts.

    Feed detection snapshots via `process_detection()`.
    Retrieve alerts via the returned list.

    Enhanced with smart crushing detection that uses clump analysis
    and rolling-median count stabilization to reduce false positives
    while catching true crushing events faster.
    """

    def __init__(self):
        self.state = FarrowingInferenceState()
        self.clump_detector = PigletClumpDetector()

    def reset(self):
        self.state = FarrowingInferenceState()
        self.clump_detector.reset()

    def set_farrowing_active(self, active: bool):
        """Call when farrowing session starts/ends."""
        self.state.farrowing_active = active
        if active:
            self.state.last_new_piglet_at = datetime.utcnow()
            self.state.highest_piglet_count = 0

    def process_detection(
        self,
        snapshot: DetectionSnapshot,
        piglet_boxes: Optional[List[Dict[str, Any]]] = None,
        sow_box: Optional[Dict[str, Any]] = None,
    ) -> List[InferenceAlert]:
        """
        Process a new detection frame and return any triggered alerts.

        Args:
            snapshot: DetectionSnapshot with timestamp, posture, piglet count.
            piglet_boxes: Optional list of piglet bounding box dicts (for clump analysis).
            sow_box: Optional sow bounding box dict (for clump analysis).

        Returns:
            List of InferenceAlert objects (may be empty).
        """
        alerts: List[InferenceAlert] = []
        now = snapshot.timestamp

        # ── Run clump analysis if bbox data is available ─────────────
        if piglet_boxes is not None:
            clump = self.clump_detector.analyze(
                piglet_boxes,
                sow_box=sow_box,
                sow_posture=snapshot.sow_posture,
            )
            snapshot.clump_analysis = clump
        else:
            clump = snapshot.clump_analysis

        # Add to history
        self.state.detection_history.append(snapshot)
        self._prune_history(now)

        # Track posture changes
        if snapshot.sow_posture and snapshot.sow_posture != "unknown":
            if self.state.last_posture and snapshot.sow_posture != self.state.last_posture:
                self.state.last_posture_change_at = now
            if not self.state.last_posture_change_at:
                self.state.last_posture_change_at = now
            self.state.last_posture = snapshot.sow_posture

        # Track piglet visibility
        if snapshot.piglet_count > 0:
            self.state.last_piglet_seen_at = now

        # ── Update stable count tracker ──────────────────────────────
        effective_count = snapshot.piglet_count
        if clump and clump.likely_actual_count > effective_count:
            effective_count = clump.likely_actual_count

        self._update_stable_count(effective_count, now)

        # Legacy baseline (backwards compat): rolling max of last 30 min
        recent = [d for d in self.state.detection_history
                  if (now - d.timestamp).total_seconds() < 1800]
        if recent:
            self.state.baseline_piglet_count = max(d.piglet_count for d in recent)

        # ── Rule 7: Smart crushing risk inference (3-tier) ───────────
        crushing_alerts = self._check_smart_crushing(snapshot, clump, now)
        alerts.extend(crushing_alerts)

        # ── Rule 8a: Prolonged inactivity (no posture change) ────────
        inactivity_alert = self._check_inactivity(snapshot, now)
        if inactivity_alert:
            alerts.append(inactivity_alert)

        # ── Rule 8b: No piglet detection ─────────────────────────────
        piglet_missing_alert = self._check_piglet_missing(snapshot, now)
        if piglet_missing_alert:
            alerts.append(piglet_missing_alert)

        # ── Rule 9: Dystocia detection ───────────────────────────────
        dystocia_alert = self._check_dystocia(snapshot, now)
        if dystocia_alert:
            alerts.append(dystocia_alert)

        # ── Rule 4: Pre-farrowing posture switching ──────────────────
        switching_alert = self._check_posture_switching(now)
        if switching_alert:
            alerts.append(switching_alert)

        return alerts

    # ─── Stable Count Tracker ────────────────────────────────────────────

    def _update_stable_count(self, effective_count: int, now: datetime):
        """
        Update the rolling-median stable count and highest-ever-confirmed.

        Uses median instead of max to resist single-frame flicker.
        Only ratchets up highest_ever_confirmed when the median sustains
        for SUSTAINED_CONFIRMATION_MINUTES.
        """
        self.state.recent_counts.append(effective_count)

        if len(self.state.recent_counts) >= 3:
            median = int(statistics.median(self.state.recent_counts))
        else:
            median = effective_count

        self.state.stable_median_count = median

        # Sustained confirmation: median must hold at a value for ≥2 min
        if median != self.state.median_sustained_value:
            self.state.median_sustained_value = median
            self.state.median_sustained_since = now
        elif self.state.median_sustained_since is not None:
            sustained_minutes = (now - self.state.median_sustained_since).total_seconds() / 60
            if sustained_minutes >= SUSTAINED_CONFIRMATION_MINUTES:
                if median > self.state.highest_ever_confirmed:
                    logger.info(
                        "Highest confirmed piglet count updated: %d → %d (sustained %.1f min)",
                        self.state.highest_ever_confirmed, median, sustained_minutes,
                    )
                    self.state.highest_ever_confirmed = median

    # ─── Smart Crushing Risk (3-Tier) ────────────────────────────────────

    def _check_smart_crushing(
        self,
        snapshot: DetectionSnapshot,
        clump: Optional[ClumpAnalysis],
        now: datetime,
    ) -> List[InferenceAlert]:
        """
        Smart crushing detection with 3 severity tiers:

        CRITICAL: Sow lying + piglet count dropped ≥2 from confirmed + clump near sow
                  → "Possible piglet crushing — check pen immediately"

        HIGH (Advisory): Sow lying + (count dropped by 1 OR clump near sow with stable count)
                  → "Piglets clustered near sow — please overlook pen"

        MEDIUM (Info): Count flickering (high variance) regardless of posture
                  → "Piglet count unstable — possible occlusion or clumping"
        """
        results: List[InferenceAlert] = []

        # Determine if sow is in a high-risk lying posture
        posture_normalized = snapshot.sow_posture.lower().replace("-", "_")
        sow_lying = (
            posture_normalized in CRUSHING_SOW_POSTURES or
            "sleep" in posture_normalized or
            "lying" in posture_normalized
        )

        # Use the best available baseline
        confirmed = self.state.highest_ever_confirmed
        median = self.state.stable_median_count

        # Fall back to legacy baseline if confirmed count hasn't been established yet
        if confirmed <= 0:
            confirmed = self.state.baseline_piglet_count

        # Current count: use clump-adjusted count if available
        current = snapshot.piglet_count
        likely_actual = current
        if clump:
            likely_actual = clump.likely_actual_count

        # Calculate drop from confirmed baseline
        drop_from_confirmed = confirmed - likely_actual if confirmed > 0 else 0
        drop_from_median = median - current if median > 0 else 0

        # Clump signals
        has_clump_near_sow = clump.cluster_near_sow if clump else False
        clumping_likely = clump.clumping_likely if clump else False
        # Use clump variance if available; fall back to engine's own count history
        if clump:
            count_variance = clump.count_variance
        elif len(self.state.recent_counts) >= 3:
            count_variance = statistics.variance(self.state.recent_counts)
        else:
            count_variance = 0.0

        # ── Tier 1: CRITICAL ────────────────────────────────────────────
        # Sow lying + significant drop + evidence of clumping
        if sow_lying and confirmed > 0 and drop_from_confirmed >= CRUSHING_PIGLET_DROP_CRITICAL:
            if not self._on_cooldown_minutes(self.state.last_crushing_critical_at, now,
                                              CRUSHING_CRITICAL_COOLDOWN_MINUTES):

                if CRUSHING_DURATION_MINUTES == 0:
                    # Immediate critical alert
                    self.state.last_crushing_critical_at = now
                    self.state.last_crushing_alert_at = now  # legacy
                    self.state.piglet_drop_started_at = None

                    drop_pct = (drop_from_confirmed / confirmed * 100) if confirmed > 0 else 0

                    results.append(InferenceAlert(
                        type="crushing_risk",
                        severity="critical",
                        title="Potential Crushing Risk Detected",
                        message=(
                            f"Sow in lying posture ({snapshot.sow_posture}) with "
                            f"piglet visibility dropped from {confirmed} to {likely_actual} "
                            f"({drop_from_confirmed} missing, {drop_pct:.0f}% drop). "
                            f"{'Piglet clump detected near sow body. ' if has_clump_near_sow else ''}"
                            f"Possible piglet crushing — check pen immediately."
                        ),
                        data={
                            "baseline_piglets": confirmed,
                            "current_piglets": current,
                            "likely_actual": likely_actual,
                            "missing_count": drop_from_confirmed,
                            "drop_percent": round(drop_pct, 1),
                            "sow_posture": snapshot.sow_posture,
                            "clump_near_sow": has_clump_near_sow,
                            "clumping_likely": clumping_likely,
                            "immediate": True,
                            "tier": "critical",
                        }
                    ))
                    # Critical alert fired — don't also fire advisory/info
                    return results

                else:
                    # Sustained-window path
                    if self.state.piglet_drop_started_at is None:
                        self.state.piglet_drop_started_at = now
                    else:
                        drop_duration = (now - self.state.piglet_drop_started_at).total_seconds() / 60
                        if drop_duration >= CRUSHING_DURATION_MINUTES:
                            self.state.last_crushing_critical_at = now
                            self.state.last_crushing_alert_at = now
                            self.state.piglet_drop_started_at = None

                            drop_pct = (drop_from_confirmed / confirmed * 100) if confirmed > 0 else 0

                            results.append(InferenceAlert(
                                type="crushing_risk",
                                severity="critical",
                                title="Potential Crushing Risk Detected",
                                message=(
                                    f"Sow in lying posture ({snapshot.sow_posture}) with "
                                    f"piglet visibility dropped from {confirmed} to {likely_actual} "
                                    f"({drop_from_confirmed} missing, {drop_pct:.0f}% drop) "
                                    f"for {drop_duration:.0f} minutes. "
                                    f"{'Piglet clump detected near sow body. ' if has_clump_near_sow else ''}"
                                    f"Possible piglet crushing — check pen immediately."
                                ),
                                data={
                                    "baseline_piglets": confirmed,
                                    "current_piglets": current,
                                    "likely_actual": likely_actual,
                                    "missing_count": drop_from_confirmed,
                                    "drop_percent": round(drop_pct, 1),
                                    "duration_minutes": round(drop_duration, 1),
                                    "sow_posture": snapshot.sow_posture,
                                    "clump_near_sow": has_clump_near_sow,
                                    "clumping_likely": clumping_likely,
                                    "immediate": False,
                                    "tier": "critical",
                                }
                            ))
                            return results

        # ── Tier 2: HIGH / ADVISORY ─────────────────────────────────────
        # Sow lying + (minor drop OR clump near sow with stable count)
        # → "Please overlook pen — piglets may be hidden"
        if sow_lying and confirmed > 0:
            advisory_triggered = False
            advisory_reason = ""

            if drop_from_confirmed >= CRUSHING_PIGLET_DROP_ADVISORY and drop_from_confirmed < CRUSHING_PIGLET_DROP_CRITICAL:
                advisory_triggered = True
                advisory_reason = (
                    f"{drop_from_confirmed} piglet(s) not visible "
                    f"(expected {confirmed}, detecting {likely_actual}). "
                )
            elif has_clump_near_sow and drop_from_confirmed <= 0:
                advisory_triggered = True
                sow_cluster_size = clump.sow_cluster_size if clump else 0
                advisory_reason = (
                    f"{sow_cluster_size} piglets clustered tightly near sow body. "
                    f"Count appears stable ({current}) but clumping may be hiding a piglet. "
                )
            elif clumping_likely and drop_from_median >= 1:
                advisory_triggered = True
                advisory_reason = (
                    f"Piglet clumping detected with count dipping below stable median "
                    f"({median} → {current}). "
                )

            if advisory_triggered:
                if not self._on_cooldown_minutes(self.state.last_crushing_advisory_at, now,
                                                  CRUSHING_ADVISORY_COOLDOWN_MINUTES):
                    self.state.last_crushing_advisory_at = now
                    results.append(InferenceAlert(
                        type="crushing_advisory",
                        severity="high",
                        title="Piglet Visibility Concern — Please Check Pen",
                        message=(
                            f"Sow in {snapshot.sow_posture} posture. "
                            f"{advisory_reason}"
                            f"Please overlook the pen — a piglet may be hidden or at risk. "
                            f"(Note: piglet clumping can cause detection inaccuracy)"
                        ),
                        data={
                            "baseline_piglets": confirmed,
                            "current_piglets": current,
                            "likely_actual": likely_actual,
                            "missing_count": max(0, drop_from_confirmed),
                            "sow_posture": snapshot.sow_posture,
                            "clump_near_sow": has_clump_near_sow,
                            "clumping_likely": clumping_likely,
                            "stable_median": median,
                            "tier": "advisory",
                            "requires_human_review": True,
                        }
                    ))
                    return results

        # ── Tier 3: MEDIUM / INFO ───────────────────────────────────────
        # High count variance = flickering detections (regardless of posture)
        if count_variance >= 2.0 and len(self.state.recent_counts) >= 5:
            if not self._on_cooldown_minutes(self.state.last_crushing_info_at, now,
                                              CRUSHING_INFO_COOLDOWN_MINUTES):
                self.state.last_crushing_info_at = now
                results.append(InferenceAlert(
                    type="detection_anomaly",
                    severity="medium",
                    title="Piglet Count Unstable — Possible Occlusion",
                    message=(
                        f"Piglet detection count is fluctuating (variance={count_variance:.1f}, "
                        f"median={median}, current={current}). "
                        f"This may indicate piglets are overlapping or partially occluded. "
                        f"Detection accuracy may be reduced until piglets spread out."
                    ),
                    data={
                        "count_variance": round(count_variance, 3),
                        "stable_median": median,
                        "current_piglets": current,
                        "sow_posture": snapshot.sow_posture,
                        "clumping_likely": clumping_likely,
                        "tier": "info",
                    }
                ))

        # Reset drop timer if no significant drop
        if drop_from_confirmed < CRUSHING_PIGLET_DROP_ADVISORY:
            self.state.piglet_drop_started_at = None

        return results

    # ─── Correction 8a: Prolonged Inactivity ─────────────────────────────

    def _check_inactivity(self, snapshot: DetectionSnapshot, now: datetime) -> Optional[InferenceAlert]:
        """No posture change for >45 minutes → alert."""
        if self._on_cooldown(self.state.last_inactivity_alert_at, now):
            return None

        if not self.state.last_posture_change_at:
            return None

        minutes_since = (now - self.state.last_posture_change_at).total_seconds() / 60

        if minutes_since >= INACTIVITY_NO_POSTURE_CHANGE_MINUTES:
            self.state.last_inactivity_alert_at = now
            return InferenceAlert(
                type="inactivity",
                severity="high",
                title="Prolonged Sow Inactivity",
                message=(
                    f"Sow has been in '{snapshot.sow_posture}' posture for "
                    f"{minutes_since:.0f} minutes without any posture change. "
                    f"Check sow condition — possible health issue."
                ),
                data={
                    "posture": snapshot.sow_posture,
                    "duration_minutes": round(minutes_since, 1),
                    "threshold_minutes": INACTIVITY_NO_POSTURE_CHANGE_MINUTES,
                }
            )
        return None

    # ─── Correction 8b: No Piglet Detection ──────────────────────────────

    def _check_piglet_missing(self, snapshot: DetectionSnapshot, now: datetime) -> Optional[InferenceAlert]:
        """No piglet detection for >20 minutes → alert (if litter exists)."""
        if self.state.baseline_piglet_count <= 0:
            return None  # No litter tracked
        if self._on_cooldown(self.state.last_inactivity_alert_at, now):
            return None
        if not self.state.last_piglet_seen_at:
            return None

        minutes_since = (now - self.state.last_piglet_seen_at).total_seconds() / 60

        if snapshot.piglet_count == 0 and minutes_since >= INACTIVITY_NO_PIGLET_DETECTION_MINUTES:
            self.state.last_inactivity_alert_at = now
            return InferenceAlert(
                type="piglet_count_change",
                severity="critical",
                title="No Piglets Visible",
                message=(
                    f"No piglets detected for {minutes_since:.0f} minutes "
                    f"(expected ~{self.state.baseline_piglet_count} based on litter). "
                    f"Check pen immediately — possible obstruction or piglet distress."
                ),
                data={
                    "expected_piglets": self.state.baseline_piglet_count,
                    "minutes_missing": round(minutes_since, 1),
                    "threshold_minutes": INACTIVITY_NO_PIGLET_DETECTION_MINUTES,
                }
            )
        return None

    # ─── Correction 9: Dystocia Detection ────────────────────────────────

    def _check_dystocia(self, snapshot: DetectionSnapshot, now: datetime) -> Optional[InferenceAlert]:
        """
        During active farrowing: if no new piglet for >45 minutes → possible dystocia.
        Average piglet interval should be 15-20 minutes.
        """
        if not self.state.farrowing_active:
            return None
        if self._on_cooldown(self.state.last_dystocia_alert_at, now):
            return None

        # Track new piglet arrivals — use stable median to avoid
        # ratcheting on fragmented/flickering detections
        stable = self.state.stable_median_count
        if stable > self.state.highest_piglet_count:
            self.state.highest_piglet_count = stable
            self.state.last_new_piglet_at = now

        if not self.state.last_new_piglet_at:
            return None

        minutes_since = (now - self.state.last_new_piglet_at).total_seconds() / 60

        if minutes_since >= DYSTOCIA_NO_NEW_PIGLET_MINUTES:
            self.state.last_dystocia_alert_at = now
            return InferenceAlert(
                type="dystocia",
                severity="critical",
                title="Possible Dystocia — No New Piglet",
                message=(
                    f"No new piglet detected for {minutes_since:.0f} minutes during active farrowing "
                    f"(normal interval: {AVERAGE_PIGLET_INTERVAL_MINUTES[0]}-{AVERAGE_PIGLET_INTERVAL_MINUTES[1]} min). "
                    f"Current count: {self.state.highest_piglet_count}. "
                    f"Possible dystocia (birth difficulty) — consider veterinary assistance."
                ),
                data={
                    "minutes_since_last_piglet": round(minutes_since, 1),
                    "current_piglet_count": self.state.highest_piglet_count,
                    "threshold_minutes": DYSTOCIA_NO_NEW_PIGLET_MINUTES,
                    "normal_interval": AVERAGE_PIGLET_INTERVAL_MINUTES,
                }
            )
        return None

    # ─── Correction 4: Pre-Farrowing Posture Switching ───────────────────

    def _check_posture_switching(self, now: datetime) -> Optional[InferenceAlert]:
        """
        AI infers possible pre-farrowing restlessness through increased posture
        switching frequency. NOT true nesting detection.
        
        Rule: >6 posture changes in 30 minutes.
        """
        if self.state.farrowing_active:
            return None  # Only relevant pre-farrowing
        if self._on_cooldown(self.state.last_posture_switch_alert_at, now):
            return None

        window_start = now - timedelta(minutes=POSTURE_SWITCH_WINDOW_MINUTES)
        recent = [d for d in self.state.detection_history if d.timestamp >= window_start]

        if len(recent) < 3:
            return None

        # Count posture transitions
        transitions = 0
        for i in range(1, len(recent)):
            if (recent[i].sow_posture != recent[i - 1].sow_posture and
                    recent[i].sow_posture != "unknown" and
                    recent[i - 1].sow_posture != "unknown"):
                transitions += 1

        if transitions >= POSTURE_SWITCH_THRESHOLD:
            self.state.last_posture_switch_alert_at = now
            return InferenceAlert(
                type="posture_switching",
                severity="medium",
                title="Increased Posture Switching — Possible Pre-Farrowing Restlessness",
                message=(
                    f"Sow changed posture {transitions} times in the last "
                    f"{POSTURE_SWITCH_WINDOW_MINUTES} minutes (threshold: {POSTURE_SWITCH_THRESHOLD}). "
                    f"This may indicate pre-farrowing restlessness. "
                    f"Note: AI infers restlessness from posture switching frequency, not true nesting detection."
                ),
                data={
                    "posture_changes": transitions,
                    "window_minutes": POSTURE_SWITCH_WINDOW_MINUTES,
                    "threshold": POSTURE_SWITCH_THRESHOLD,
                }
            )
        return None

    # ─── Helpers ──────────────────────────────────────────────────────────

    def _prune_history(self, now: datetime):
        cutoff = now - timedelta(minutes=self.state.max_history_minutes)
        self.state.detection_history = [
            d for d in self.state.detection_history if d.timestamp >= cutoff
        ]

    def _on_cooldown(self, last_alert_at: Optional[datetime], now: datetime) -> bool:
        if last_alert_at is None:
            return False
        return (now - last_alert_at).total_seconds() < self.state.alert_cooldown_minutes * 60

    def _on_cooldown_minutes(self, last_alert_at: Optional[datetime], now: datetime,
                              cooldown_minutes: int) -> bool:
        """Check cooldown with a specific duration (for tiered cooldowns)."""
        if last_alert_at is None:
            return False
        return (now - last_alert_at).total_seconds() < cooldown_minutes * 60
