import json
import math
from typing import Any, Dict, List, Optional, Tuple


class NestingBehaviorAnalyzer:
    """Analyze behavior logs for pre-farrowing nesting signals."""

    @staticmethod
    def _parse_detection_data(raw: Any) -> Dict[str, Any]:
        if raw is None:
            return {}
        if isinstance(raw, dict):
            return raw
        if isinstance(raw, str):
            raw = raw.strip()
            if not raw:
                return {}
            try:
                parsed = json.loads(raw)
                return parsed if isinstance(parsed, dict) else {}
            except (TypeError, ValueError, json.JSONDecodeError):
                return {}
        return {}

    @staticmethod
    def _extract_center(log: Any) -> Optional[Tuple[float, float]]:
        data = NestingBehaviorAnalyzer._parse_detection_data(getattr(log, "detection_data", None))
        cx = data.get("center_x")
        cy = data.get("center_y")
        if cx is None or cy is None:
            return None
        try:
            return float(cx), float(cy)
        except (TypeError, ValueError):
            return None

    def analyze(self, logs: List[Any], window_minutes: int = 30) -> Dict[str, Any]:
        if len(logs) < 3:
            return {}

        # Ensure chronological order for consecutive-pair calculations.
        ordered_logs = sorted(logs, key=lambda l: getattr(l, "logged_at", None) or 0)

        transitions = 0
        displacement_sum = 0.0
        displacement_pairs = 0
        head_end_visits = 0

        for i, current in enumerate(ordered_logs):
            current_posture = getattr(current, "sow_posture", None)

            if current_posture == "standing":
                center = self._extract_center(current)
                if center is not None:
                    _, center_y = center
                    if center_y < 0.35:
                        head_end_visits += 1

            if i == 0:
                continue

            previous = ordered_logs[i - 1]
            previous_posture = getattr(previous, "sow_posture", None)
            if previous_posture != current_posture:
                transitions += 1

            prev_center = self._extract_center(previous)
            curr_center = self._extract_center(current)
            if prev_center is None or curr_center is None:
                continue

            dx = curr_center[0] - prev_center[0]
            dy = curr_center[1] - prev_center[1]
            displacement_sum += math.sqrt(dx * dx + dy * dy)
            displacement_pairs += 1

        hours = window_minutes / 60 if window_minutes > 0 else 0
        transitions_per_hour = (transitions / hours) if hours > 0 else 0.0
        avg_displacement = (displacement_sum / displacement_pairs) if displacement_pairs > 0 else 0.0

        nesting_score = min(
            1.0,
            (min(transitions_per_hour, 20.0) / 20.0) * 0.50
            + (min(avg_displacement, 50.0) / 50.0) * 0.30
            + (min(head_end_visits, 5) / 5.0) * 0.20,
        )

        if nesting_score >= 0.75:
            nesting_phase = "active_nesting"
        elif nesting_score >= 0.50:
            nesting_phase = "early_nesting"
        elif nesting_score >= 0.25:
            nesting_phase = "mild_restlessness"
        else:
            nesting_phase = "calm"

        return {
            "transitions_per_hour": round(transitions_per_hour, 2),
            "avg_displacement": round(avg_displacement, 2),
            "head_end_visits": int(head_end_visits),
            "nesting_score": round(nesting_score, 2),
            "nesting_phase": nesting_phase,
        }
