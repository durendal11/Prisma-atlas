from datetime import datetime, timedelta


class BirthEventDetector:
    def __init__(self):
        self.confirmed_count: int = 0
        self.last_birth_time: datetime | None = None
        self.last_dystocia_alert_time: datetime | None = None

    def process_log(self, log, timestamp: datetime) -> list[dict]:
        events: list[dict] = []

        # 1) Birth detection from an increase in observed piglet count.
        if log.piglet_count > self.confirmed_count:
            new_births = log.piglet_count - self.confirmed_count
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
            and log.sow_posture in ("sleeping", "nursing")
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
