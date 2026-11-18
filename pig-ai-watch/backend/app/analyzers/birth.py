from datetime import datetime, timedelta


LYING_POSTURES = ("sleeping", "lying", "nursing")


class BirthEventDetector:
    # A newborn must stay in view for 2 minutes (logs arrive every ~12s). Dust or a
    # fly near the lens comes and goes; a real piglet stays.
    CONFIRM_SECONDS = 120

    def __init__(self):
        self.confirmed_count: int = 0
        self.last_birth_time: datetime | None = None
        self.last_dystocia_alert_time: datetime | None = None
        self.history: list[tuple[datetime, int]] = []

    def process_log(self, log, timestamp: datetime, births_allowed: bool = True) -> list[dict]:
        events: list[dict] = []

        self.history.append((timestamp, log.piglet_count))
        self.history = [h for h in self.history if (timestamp - h[0]).total_seconds() <= self.CONFIRM_SECONDS]
        covers_window = len(self.history) >= 3 and (timestamp - self.history[0][0]).total_seconds() >= self.CONFIRM_SECONDS * 0.9
        # Count held for the whole window, allowing one log where the newborn hid behind the sow.
        counts = sorted(n for _, n in self.history)
        held_count = counts[1] if covers_window else 0

        # Sow not due (or not pregnant): learn the litter size, never announce births.
        if not births_allowed:
            self.confirmed_count = max(self.confirmed_count, held_count)
            return events

        # 1) Birth = count rose and held for 2 minutes while the sow is lying (sows farrow lying down).
        if held_count > self.confirmed_count and log.sow_posture in LYING_POSTURES:
            new_births = held_count - self.confirmed_count
            self.confirmed_count = log.piglet_count
            self.last_birth_time = timestamp

            for _ in range(new_births):
                events.append(
                    {
                        "type": "birth_detected",
                        "pen_id": log.pen_id,
                        "time": timestamp.isoformat(),
                        "total_born": self.confirmed_count,
                        "colostrum_deadline": (timestamp + timedelta(hours=1)).isoformat(),
                        "severity": "MEDIUM",
                        "alert": (
                            f"New piglet born in Pen {log.pen_id}. "
                            f"Ensure teat access within 1 hour for colostrum intake."
                        ),
                    }
                )

        # 2) Dystocia risk if no new birth for >45 minutes while sow is lying/nursing.
        if (
            self.last_birth_time is not None
            and log.sow_posture in LYING_POSTURES
            and (timestamp - self.last_birth_time).total_seconds() > 2700
        ):
            should_fire = (
                self.last_dystocia_alert_time is None
                or (timestamp - self.last_dystocia_alert_time).total_seconds() >= 3600
            )

            if should_fire:
                minutes_since_last_birth = int(
                    (timestamp - self.last_birth_time).total_seconds() / 60
                )
                events.append(
                    {
                        "type": "dystocia_risk",
                        "pen_id": log.pen_id,
                        "severity": "HIGH",
                        "minutes_since_last_birth": minutes_since_last_birth,
                        "alert": (
                            f"No new piglet detected for {minutes_since_last_birth} min in Pen {log.pen_id}. "
                            f"Possible dystocia — check sow immediately. "
                            f"(Merck Veterinary Manual: >45 min = intervention threshold)"
                        ),
                    }
                )
                self.last_dystocia_alert_time = timestamp

        return events
