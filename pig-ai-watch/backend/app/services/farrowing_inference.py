"""
Farrowing Inference Service — Rule-based alert logic for farrowing monitoring.

Implements biologically accurate rules for:
  - Crushing risk inference (NOT direct detection — inferred from posture + piglet count drop)
  - Prolonged inactivity alerts
  - Farrowing duration / dystocia alerts
  - Pre-farrowing posture switching (restlessness inference)

All rules operate on detection timestamps and counts — no new model output required.
"""
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from dataclasses import dataclass, field
import logging

logger = logging.getLogger(__name__)


# ─── Configuration ───────────────────────────────────────────────────────────

# Correction 7: Crushing risk thresholds
CRUSHING_PIGLET_DROP_PERCENT = 0.50      # >50% drop in visible piglets
CRUSHING_DURATION_MINUTES = 20           # sustained for 20 minutes
CRUSHING_SOW_POSTURES = {"sleeping", "sleeping_lactating", "lying_lateral", "sow-sleep", "sow-sleep-lactate"}

# Correction 8: Inactivity thresholds
INACTIVITY_NO_POSTURE_CHANGE_MINUTES = 45   # no posture change → alert
INACTIVITY_NO_PIGLET_DETECTION_MINUTES = 20  # no piglet detected → alert (if litter exists)

# Correction 9: Dystocia thresholds
DYSTOCIA_NO_NEW_PIGLET_MINUTES = 45     # no new piglet during active farrowing → alert
AVERAGE_PIGLET_INTERVAL_MINUTES = (15, 20)  # normal birth interval

# Correction 4: Pre-farrowing posture switching (restlessness)
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


@dataclass
class FarrowingInferenceState:
    """Tracks rolling state for inference rules."""
    # Detection history (rolling window)
    detection_history: List[DetectionSnapshot] = field(default_factory=list)
    max_history_minutes: int = 120  # keep 2 hours of data

    # Crushing risk tracking
    baseline_piglet_count: int = 0
    piglet_drop_started_at: Optional[datetime] = None

    # Inactivity tracking
    last_posture_change_at: Optional[datetime] = None
    last_posture: str = ""
    last_piglet_seen_at: Optional[datetime] = None

    # Dystocia tracking (active farrowing only)
    farrowing_active: bool = False
    last_new_piglet_at: Optional[datetime] = None
    highest_piglet_count: int = 0

    # Alert cooldowns (avoid spam)
    last_crushing_alert_at: Optional[datetime] = None
    last_inactivity_alert_at: Optional[datetime] = None
    last_dystocia_alert_at: Optional[datetime] = None
    last_posture_switch_alert_at: Optional[datetime] = None
    alert_cooldown_minutes: int = 10


@dataclass
class InferenceAlert:
    """An alert produced by the inference engine."""
    type: str          # crushing_risk, inactivity, dystocia, posture_switching
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
    """

    def __init__(self):
        self.state = FarrowingInferenceState()

    def reset(self):
        self.state = FarrowingInferenceState()

    def set_farrowing_active(self, active: bool):
        """Call when farrowing session starts/ends."""
        self.state.farrowing_active = active
        if active:
            self.state.last_new_piglet_at = datetime.utcnow()
            self.state.highest_piglet_count = 0

    def process_detection(self, snapshot: DetectionSnapshot) -> List[InferenceAlert]:
        """
        Process a new detection frame and return any triggered alerts.

        Args:
            snapshot: DetectionSnapshot with timestamp, posture, piglet count.

        Returns:
            List of InferenceAlert objects (may be empty).
        """
        alerts: List[InferenceAlert] = []
        now = snapshot.timestamp

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

        # Update baseline piglet count (use rolling max of last 30 min)
        recent = [d for d in self.state.detection_history
                  if (now - d.timestamp).total_seconds() < 1800]
        if recent:
            self.state.baseline_piglet_count = max(d.piglet_count for d in recent)

        # ── Rule 7: Crushing risk inference ──────────────────────────────
        crushing_alert = self._check_crushing_risk(snapshot, now)
        if crushing_alert:
            alerts.append(crushing_alert)

        # ── Rule 8a: Prolonged inactivity (no posture change) ────────────
        inactivity_alert = self._check_inactivity(snapshot, now)
        if inactivity_alert:
            alerts.append(inactivity_alert)

        # ── Rule 8b: No piglet detection ─────────────────────────────────
        piglet_missing_alert = self._check_piglet_missing(snapshot, now)
        if piglet_missing_alert:
            alerts.append(piglet_missing_alert)

        # ── Rule 9: Dystocia detection ───────────────────────────────────
        dystocia_alert = self._check_dystocia(snapshot, now)
        if dystocia_alert:
            alerts.append(dystocia_alert)

        # ── Rule 4: Pre-farrowing posture switching ──────────────────────
        switching_alert = self._check_posture_switching(now)
        if switching_alert:
            alerts.append(switching_alert)

        return alerts

    # ─── Correction 7: Crushing Risk ─────────────────────────────────────

    def _check_crushing_risk(self, snapshot: DetectionSnapshot, now: datetime) -> Optional[InferenceAlert]:
        """
        AI flags prolonged sow lying with sudden drop in visible piglet detections
        as potential crushing risk. NOT a direct detection.
        
        Rule: sow in lying/sleeping posture AND piglet count drops >50%
              sustained for >20 minutes → alert.
        """
        if self._on_cooldown(self.state.last_crushing_alert_at, now):
            return None

        sow_lying = snapshot.sow_posture.lower().replace("-", "_") in CRUSHING_SOW_POSTURES or \
                    "sleep" in snapshot.sow_posture.lower() or \
                    "lying" in snapshot.sow_posture.lower()

        baseline = self.state.baseline_piglet_count
        if baseline <= 0 or not sow_lying:
            self.state.piglet_drop_started_at = None
            return None

        drop_pct = (baseline - snapshot.piglet_count) / baseline if baseline > 0 else 0

        if drop_pct >= CRUSHING_PIGLET_DROP_PERCENT:
            if self.state.piglet_drop_started_at is None:
                self.state.piglet_drop_started_at = now
            else:
                drop_duration = (now - self.state.piglet_drop_started_at).total_seconds() / 60
                if drop_duration >= CRUSHING_DURATION_MINUTES:
                    self.state.last_crushing_alert_at = now
                    self.state.piglet_drop_started_at = None
                    return InferenceAlert(
                        type="crushing_risk",
                        severity="critical",
                        title="Potential Crushing Risk Detected",
                        message=(
                            f"Sow in lying posture ({snapshot.sow_posture}) with "
                            f"piglet visibility dropped from {baseline} to {snapshot.piglet_count} "
                            f"(>{CRUSHING_PIGLET_DROP_PERCENT*100:.0f}% drop) for {drop_duration:.0f} minutes. "
                            f"Possible piglet crushing — check pen immediately."
                        ),
                        data={
                            "baseline_piglets": baseline,
                            "current_piglets": snapshot.piglet_count,
                            "drop_percent": round(drop_pct * 100, 1),
                            "duration_minutes": round(drop_duration, 1),
                            "sow_posture": snapshot.sow_posture,
                        }
                    )
        else:
            self.state.piglet_drop_started_at = None

        return None

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

        # Track new piglet arrivals
        if snapshot.piglet_count > self.state.highest_piglet_count:
            self.state.highest_piglet_count = snapshot.piglet_count
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
