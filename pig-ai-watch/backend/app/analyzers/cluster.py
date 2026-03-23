import collections
import json
from datetime import datetime, timedelta


class ClusterVisibilityAnalyzer:
    VISIBILITY_GAP_THRESHOLD = 0.45
    MIN_CLUSTER_SIZE = 3
    ALERT_COOLDOWN_MINUTES = 20
    MIN_CONFIRMED_TOTAL = 4

    def __init__(self):
        self.confirmed_total: int = 0
        self.last_alert_time: datetime | None = None
        self.gap_history = collections.deque(maxlen=3)

    def update_confirmed_total(self, birth_count_session: int):
        if birth_count_session > self.confirmed_total:
            self.confirmed_total = birth_count_session

    def process_log(self, log, timestamp: datetime) -> list[dict]:
        if self.confirmed_total < self.MIN_CONFIRMED_TOTAL:
            return []

        if log.sow_posture not in ("nursing", "sleeping"):
            self.gap_history.clear()
            return []

        visible_count = log.piglet_count
        gap = self.confirmed_total - visible_count
        gap_ratio = gap / self.confirmed_total

        self.gap_history.append(
            {
                "gap": gap,
                "visible": visible_count,
                "density": log.detection_density,
                "timestamp": timestamp,
            }
        )

        if len(self.gap_history) < 3:
            return []

        sustained_gap = all(h["gap"] >= self.MIN_CLUSTER_SIZE for h in self.gap_history)
        avg_density = sum(h["density"] for h in self.gap_history) / len(self.gap_history)
        clustering_likely = avg_density > 0.18

        if sustained_gap and gap_ratio >= self.VISIBILITY_GAP_THRESHOLD:
            if self.last_alert_time is not None and (
                timestamp - self.last_alert_time
            ) < timedelta(minutes=self.ALERT_COOLDOWN_MINUTES):
                return []

            self.last_alert_time = timestamp
            severity = "HIGH" if gap_ratio >= 0.70 else "MEDIUM"

            return [
                {
                    "type": "cluster_visibility_gap",
                    "pen_id": log.pen_id,
                    "severity": severity,
                    "confirmed_total": self.confirmed_total,
                    "visible_count": visible_count,
                    "gap": gap,
                    "gap_ratio": round(gap_ratio, 2),
                    "clustering_likely": clustering_likely,
                    "requires_human_review": True,
                    "alert": (
                        f"Pen {log.pen_id}: only {visible_count} of "
                        f"{self.confirmed_total} piglets visible during nursing. "
                        + (
                            "Piglets likely clustered under/beside sow. "
                            if clustering_likely
                            else "Piglets may be out of frame or hidden. "
                        )
                        + "Please check camera - a piglet may be crushed or hidden. "
                        + "(Andersen 2005: most crushing occurs during nursing "
                        + "in first 3 days postpartum)"
                    ),
                    "push_title": f"Pen {log.pen_id} - Piglet check needed",
                    "push_body": (
                        f"{visible_count}/{self.confirmed_total} piglets visible. "
                        f"Check for hidden or crushed piglet."
                    ),
                }
            ]

        return []
