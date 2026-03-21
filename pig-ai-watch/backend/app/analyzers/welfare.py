import collections
import json
from datetime import datetime


class PigletWelfareMonitor:
    def __init__(self):
        self.zone_history = collections.deque(maxlen=5)

    def process_log(self, log, timestamp: datetime) -> list[dict]:
        detection_data_raw = getattr(log, "detection_data", None)
        spread_radius = 0.0

        if isinstance(detection_data_raw, str):
            try:
                parsed = json.loads(detection_data_raw)
                if isinstance(parsed, dict):
                    spread_radius = float(parsed.get("spread_radius", 0.0) or 0.0)
            except (ValueError, TypeError, json.JSONDecodeError):
                spread_radius = 0.0
        elif isinstance(detection_data_raw, dict):
            try:
                spread_radius = float(detection_data_raw.get("spread_radius", 0.0) or 0.0)
            except (ValueError, TypeError):
                spread_radius = 0.0

        self.zone_history.append(
            {
                "movement": log.movement_level,
                "density": log.detection_density,
                "piglet_count": log.piglet_count,
                "spread_radius": spread_radius,
                "timestamp": timestamp,
            }
        )

        if len(self.zone_history) < 5:
            return []

        all_stationary = all(
            h["movement"] in ("stationary", "low")
            for h in self.zone_history
        )

        spread_values = [h["spread_radius"] for h in self.zone_history]
        spread_increasing = spread_values[-1] > spread_values[0] * 1.4

        low_cluster = (
            log.piglet_count > 0
            and log.detection_density < 0.15
        )

        if all_stationary and (spread_increasing or low_cluster):
            return [
                {
                    "type": "piglet_welfare_flag",
                    "pen_id": log.pen_id,
                    "severity": "HIGH",
                    "reason": "Piglet(s) appear motionless and/or isolated for 60+ seconds",
                    "alert": (
                        f"Pen {log.pen_id}: piglet inactivity detected. "
                        f"Check for chilling, weakness, or crushing. "
                        f"(Edwards 2002: isolation >10 min = high mortality risk)"
                    ),
                }
            ]

        return []
