"""Generate simulated farm history (sows, farrowings, alerts, behavior logs, detections).

All dates are relative to "now", so the history always ends today.
Rows can be removed again with --reset:
  sows with the tag ids in TAGS (every other row links to one of those sows)
  detections with class_names = '["sow", "piglet"]' (the live pipeline leaves it empty)

Run inside the backend container:
  docker cp backend/seed_history.py pig-ai-watch-backend:/app/
  docker exec pig-ai-watch-backend python seed_history.py          # create
  docker exec pig-ai-watch-backend python seed_history.py --reset  # remove
"""
import asyncio
import json
import random
import sys
from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from app.core.database import AsyncSessionLocal
from app.models.pig import (
    Alert, BehaviorLog, CrushingEvent, Detection, Event, FarrowingRecord, PigletRecord, Sow,
)

rng = random.Random(42)
NOW = datetime.now(timezone.utc).replace(second=0, microsecond=0)
OWNER = 1          # admin
GESTATION = 114    # days
LOG_DAYS = 30      # behavior logs / detections window
LOG_STEP_MIN = 10

POSTURE_RISK = {
    "standing": 0.1, "sitting": 0.2, "sleeping": 0.6, "sleeping_lactating": 0.7,
    "standing_feeding": 0.15, "standing_lactating": 0.3,
}

# name, pen (None = moved out), status now, days since bred (pregnant) or since last farrowing, parity before history
SOWS = [
    ("Luna",   1, "lactating", 12, 3),
    ("Daisy",  2, "pregnant",  112, 2),   # due in ~2 days -> near due date
    ("Rosa",   3, "lactating", 24, 4),
    ("Mabel",  4, "pregnant",  90, 1),
    ("Clover", 5, "lactating", 4, 2),
    ("Hazel",  None, "weaned", 41, 3),
    ("Pearl",  None, "weaned", 58, 5),
    ("Ivy",    None, "pregnant", 30, 2),
    ("Willow", None, "active", 96, 1),
    ("Olive",  None, "active", 133, 4),
]


TAGS = [f"SOW-{n}" for n in range(2401, 2411)]
DET_MARK = '["sow", "piglet"]'
SOW_NOTES = [
    "Good mothering ability, calm temperament.", "Gilt retained from own herd.", "Strong litters, slightly heavy.",
    "First-parity sow, watch body condition.", "Excellent milk production.", "Moved to dry sow barn after weaning.",
    "Older sow, consider culling after next litter.", "Rebred after weaning.", "Lame on rear left leg in August, recovered.",
    "Repeat breeder, check heat closely.",
]
FARROW_NOTES = [
    "Normal farrowing.", "Normal farrowing, sow calm.", "Long gap between piglets 6 and 7.",
    "Sow restless before farrowing.", "Piglets vigorous, good colostrum intake.", "One weak piglet, assisted to teat.",
]


def d(days=0.0, hours=0.0, minutes=0.0):
    return NOW - timedelta(days=days, hours=hours, minutes=minutes)


async def reset(db):
    ours = "(select id from sows where tag_id in (%s))" % ",".join(f"'{t}'" for t in TAGS)
    for sql in [
        f"update crushing_events set alert_id = null where sow_id in {ours}",
        f"delete from alerts where sow_id in {ours}",
        f"delete from crushing_events where sow_id in {ours}",
        f"delete from piglet_records where sow_id in {ours} or nurse_sow_id in {ours}",
        f"delete from farrowing_records where sow_id in {ours}",
        f"delete from events where sow_id in {ours}",
        f"delete from behavior_logs where sow_id in {ours}",
        f"delete from detections where class_names = '{DET_MARK}'",
        f"delete from sows where id in {ours}",
    ]:
        await db.execute(text(sql))
    await db.commit()
    print("Generated history removed.")


def make_litter(sow, pen_id, farrow_end, attended):
    """Farrowing record + piglets. Returns (record, piglets, crush_death_times)."""
    alive = rng.randint(9, 14)
    still = rng.choice([0, 0, 0, 1, 1, 2])
    mumm = rng.choice([0, 0, 0, 0, 1])
    duration = rng.randint(180, 420)
    start = farrow_end - timedelta(minutes=duration)
    weights = [round(rng.gauss(1.4, 0.22), 2) for _ in range(alive)]
    days_since = (NOW - farrow_end).total_seconds() / 86400
    weaned = days_since > 26

    # Deaths in the first week: mostly crushing, a few weak/starvation.
    deaths = []
    for _ in range(rng.choice([0, 0, 1, 1, 1, 2, 3])):
        t = farrow_end + timedelta(hours=rng.uniform(6, min(7 * 24, max(7, days_since * 24 - 1))))
        if t < NOW:
            deaths.append((t, rng.choices(["crushing", "starvation", "weak at birth"], [7, 2, 1])[0]))
    deaths.sort()

    rec = FarrowingRecord(
        owner_id=OWNER, sow_id=sow.id, pen_id=pen_id,
        farrowing_started=start, farrowing_completed=farrow_end, duration_minutes=duration,
        total_born=alive + still + mumm, born_alive=alive, stillborn=still, mummified=mumm,
        piglet_weights=json.dumps(weights), avg_birth_weight=round(sum(weights) / alive, 2),
        current_litter_size=0 if weaned else alive - len(deaths),
        sow_condition=rng.choices(["excellent", "good", "fair"], [2, 6, 2])[0],
        intervention_required=duration > 360,
        intervention_notes="Assisted delivery, long interval between piglets." if duration > 360 else None,
        ai_detected=True, crushing_incidents=sum(1 for _, c in deaths if c == "crushing"),
        attended_by=attended, notes=rng.choice(FARROW_NOTES),
        created_at=farrow_end,
    )
    piglets = []
    death_slots = rng.sample(range(alive), len(deaths))
    for i in range(alive):
        birth = start + timedelta(minutes=duration * (i + 1) / (alive + 1))
        p = PigletRecord(
            owner_id=OWNER, sow_id=sow.id, temp_id=f"{sow.tag_id[-3:]}-{farrow_end:%m%d}-{i + 1:02d}",
            birth_order=i + 1, birth_weight=weights[i], birth_time=birth,
            status="transferred" if weaned else "alive",
            iron_given=days_since > 3, teeth_clipped=days_since > 1, tail_docked=days_since > 3,
            castrated=days_since > 5 and i % 2 == 0,
            processed_date=birth + timedelta(days=3) if days_since > 3 else None,
            current_weight=round(weights[i] + 0.22 * min(days_since, 26), 2),
            health_score=round(rng.uniform(85, 100), 1), created_at=birth,
        )
        if i in death_slots:
            t, cause = deaths[death_slots.index(i)]
            p.status, p.death_date, p.death_cause, p.health_score = "deceased", t, cause, 0
        piglets.append(p)
    return rec, piglets, [t for t, c in deaths if c == "crushing"], alive - len(deaths)


def crushing_history(sow, pen_id, farrow_end, litter, crush_times, admin):
    """CrushingEvents + Alerts for the first 3 weeks after farrowing."""
    pairs = []
    lact_end = min(NOW, farrow_end + timedelta(days=21))
    day = farrow_end
    while day < lact_end:
        age = (day - farrow_end).days
        for _ in range(rng.choices([0, 1, 2, 3], [3, 4, 2, 1] if age < 5 else [6, 3, 1, 0])[0]):
            t = day + timedelta(hours=rng.uniform(0, 24))
            if t < lact_end:
                pairs.append((t, rng.choices(["false_positive", "prevented", "unresolved"], [45, 45, 10])[0]))
        day += timedelta(days=1)
    pairs += [(t, "likely_crush") for t in crush_times]

    out = []
    for t, outcome in sorted(pairs):
        dur = {"false_positive": rng.uniform(0.5, 2), "prevented": rng.uniform(2, 9),
               "unresolved": rng.uniform(5, 20), "likely_crush": rng.uniform(10, 30)}[outcome]
        recent = (NOW - t) < timedelta(hours=18) and outcome != "false_positive"
        ev = CrushingEvent(
            owner_id=OWNER, pen_id=pen_id, sow_id=sow.id,
            watch_started_at=t - timedelta(minutes=rng.uniform(0.5, 2)), alerted_at=t,
            resolved_at=None if recent else t + timedelta(minutes=dur),
            dismissed_at=t + timedelta(minutes=dur) if outcome == "unresolved" and not recent else None,
            dismissed_by=admin if outcome == "unresolved" and not recent else None,
            baseline_count=litter, min_count_seen=litter - 1 - rng.choice([0, 0, 1]),
            recovery_count=litter - (1 if outcome == "likely_crush" else 0),
            duration_minutes=None if recent else round(dur, 1),
            outcome=None if recent else outcome,
            trend_slope=round(-rng.uniform(0.05, 0.4), 3), trend_r2=round(rng.uniform(0.4, 0.95), 2),
            clump_detected=rng.random() < 0.35, created_at=t,
        )
        kind = {"false_positive": ("crushing_false_positive", "low", "Crushing risk cleared (false positive)"),
                "prevented": ("crushing_risk", "high", "Crushing risk: sow lying near piglets"),
                "unresolved": ("crushing_risk", "medium", "Crushing risk: piglet count dropped"),
                "likely_crush": ("crushing_escalated", "critical", "Possible crushing: piglet missing after sow lay down")}[outcome]
        al = Alert(
            owner_id=OWNER, type=kind[0], severity=kind[1], title=kind[2], sow_id=sow.id, pen_id=pen_id,
            message=f"{sow.name}: visible piglets dropped from {litter} to {ev.min_count_seen} while sow was lying.",
            is_read=not recent, is_resolved=not recent,
            resolved_at=None if recent else t + timedelta(minutes=dur), resolved_by=None if recent else admin,
            detection_data=json.dumps({"piglet_count": ev.min_count_seen, "baseline": litter}),
            event_state="alert" if recent else ("false_positive" if outcome == "false_positive" else "all_clear"),
            created_at=t,
        )
        out.append((ev, al))
    return out


def pen_state(sow_rows, pen_id, t):
    """(sow, stage, litter, hours_to_farrow) for a pen at time t."""
    for sow, info in sow_rows:
        if sow.pen_id != pen_id:
            continue
        fe = info.get("farrow_end")
        if fe and t >= fe:
            return sow, "lactating", info["litter"], None
        due = fe or sow.expected_farrowing_date
        return sow, "pregnant", 0, (due - t).total_seconds() / 3600 if due else None
    return None, None, 0, None


def pick_posture(stage, hour, hours_to_farrow):
    if stage == "pregnant" and hours_to_farrow is not None and 0 < hours_to_farrow < 24:
        return rng.choices(["standing", "sitting", "sleeping"], [5, 3, 2])[0]   # nesting / restless
    feeding = hour in (6, 7, 15, 16)
    night = hour >= 21 or hour < 5
    if stage == "lactating":
        if feeding:
            return rng.choices(["standing_feeding", "standing_lactating", "sleeping_lactating"], [6, 2, 2])[0]
        w = [1, 6, 2, 1] if night else [3, 4, 3, 2]
        return rng.choices(["standing", "sleeping_lactating", "sleeping", "standing_lactating"], w)[0]
    if feeding:
        return rng.choices(["standing_feeding", "standing"], [7, 3])[0]
    return rng.choices(["sleeping", "standing", "sitting"], [8, 1, 1] if night else [5, 3, 2])[0]


async def seed(db):
    exists = (await db.execute(text("select count(*) from sows where tag_id in (%s)" % ",".join(f"'{t}'" for t in TAGS)))).scalar()
    if exists:
        print("History already exists. Run with --reset first to regenerate.")
        return
    pens = [r[0] for r in (await db.execute(text("select id from pens order by id"))).all()]
    if len(pens) < 5:
        print("Need at least 5 pens (found %d)." % len(pens))
        return

    # ── Sows ────────────────────────────────────────────────────────────────
    sow_rows = []
    for i, (name, pen, status, days, parity) in enumerate(SOWS, start=1):
        sow = Sow(
            owner_id=OWNER, tag_id=TAGS[i - 1], name=name, pen_id=pens[pen - 1] if pen else None,
            breed=rng.choice(["Landrace", "Large White", "Landrace x Large White", "Duroc x Landrace"]),
            birth_date=d(days=rng.randint(700, 1500)), weight=round(rng.uniform(185, 265), 1),
            parity=parity, status=status, notes=SOW_NOTES[i - 1],
            created_at=d(days=200),
        )
        info = {}
        if status == "pregnant":
            sow.last_breeding_date = d(days=days)
            sow.expected_farrowing_date = sow.last_breeding_date + timedelta(days=GESTATION)
        elif status == "lactating":
            info["farrow_end"] = d(days=days, hours=rng.uniform(0, 12))
        else:  # weaned / active: last farrowing some time ago
            info["farrow_end"] = d(days=days)
        db.add(sow)
        sow_rows.append((sow, info))
    await db.flush()

    # ── Farrowings (current cycle + one previous cycle each) ────────────────
    farrowings = []   # (sow, pen_id, farrow_end, is_current)
    for idx, (sow, info) in enumerate(sow_rows):
        pen_id = sow.pen_id or pens[idx % 5]
        if "farrow_end" in info:
            farrowings.append((sow, pen_id, info["farrow_end"], True))
            prev = info["farrow_end"] - timedelta(days=rng.randint(142, 155))
        else:  # pregnant: previous farrowing ~ (lactation + wean-to-service) before breeding
            prev = sow.last_breeding_date - timedelta(days=rng.randint(28, 34))
        if (NOW - prev).days <= 365:
            farrowings.append((sow, pens[(idx + 2) % 5], prev, False))

    total_events, total_alerts = 0, 0
    for sow, pen_id, fe, current in sorted(farrowings, key=lambda f: f[2]):
        rec, piglets, crush_times, litter_now = make_litter(sow, pen_id, fe, OWNER)
        db.add(rec)
        await db.flush()
        for p in piglets:
            p.farrowing_record_id = rec.id
        db.add_all(piglets)
        info = next(i for s, i in sow_rows if s is sow)
        if current:
            sow.last_farrowing_date = fe
            sow.parity += 1
            info["litter"] = litter_now
            if sow.status == "lactating":
                sow.current_litter_size = litter_now
        else:
            sow.parity += 1

        db.add_all([
            Event(owner_id=OWNER, type="farrowing", category="ai_detection", sow_id=sow.id, pen_id=pen_id,
                  description=f"Farrowing started for {sow.name}", created_at=rec.farrowing_started,
                  event_metadata=None),
            Event(owner_id=OWNER, type="farrowing", category="manual_entry", sow_id=sow.id, pen_id=pen_id,
                  user_id=OWNER, created_at=fe,
                  description=f"Farrowing completed: {rec.born_alive} born alive, {rec.stillborn} stillborn",
                  event_metadata=json.dumps({"born_alive": rec.born_alive})),
            Alert(owner_id=OWNER, type="system", severity="medium", title=f"Farrowing started: {sow.name}",
                  message="Sow restless and first piglet detected near the sow.", sow_id=sow.id, pen_id=pen_id,
                  is_read=True, is_resolved=True, resolved_at=fe, resolved_by=OWNER, created_at=rec.farrowing_started),
        ])
        if (NOW - fe).days > 3:
            db.add(Event(owner_id=OWNER, type="piglet_processing", category="manual_entry", sow_id=sow.id,
                         pen_id=pen_id, user_id=OWNER, created_at=fe + timedelta(days=3),
                         description="Piglets processed: iron injection, tail docking",
                         event_metadata=None))
        if (NOW - fe).days > 26:
            db.add(Event(owner_id=OWNER, type="weaning", category="manual_entry", sow_id=sow.id, pen_id=pen_id,
                         user_id=OWNER, created_at=fe + timedelta(days=rng.randint(24, 28)),
                         description=f"Litter weaned ({rec.born_alive - len(crush_times)} piglets)",
                         event_metadata=None))

        pairs = crushing_history(sow, pen_id, fe, rec.born_alive, crush_times, OWNER)
        for ev, _ in pairs:
            db.add(ev)
        await db.flush()
        for ev, al in pairs:
            al.crushing_event_id = ev.id
            db.add(al)
        await db.flush()
        for ev, al in pairs:
            ev.alert_id = al.id
        total_events += len(pairs)
        total_alerts += len(pairs) + 1

    # Near-due + misc alerts
    for sow, info in sow_rows:
        if sow.status == "pregnant" and sow.pen_id and (sow.expected_farrowing_date - NOW).days <= 4:
            db.add(Alert(owner_id=OWNER, type="system", severity="medium", sow_id=sow.id, pen_id=sow.pen_id,
                         title=f"{sow.name} is near her due date",
                         message=f"Expected farrowing {sow.expected_farrowing_date:%b %d}. Birth detection is active.",
                         created_at=d(hours=20)))
    for _ in range(12):
        sow, _info = rng.choice(sow_rows[:5])
        t = d(days=rng.uniform(1, 30))
        db.add(Alert(owner_id=OWNER, type="system", severity="low", sow_id=sow.id, pen_id=sow.pen_id,
                     title="Camera stream reconnected", message="Stream dropped for a few minutes and recovered.",
                     is_read=True, is_resolved=True, resolved_at=t + timedelta(minutes=4), created_at=t))

    # ── Behavior logs + detections (last 30 days) ───────────────────────────
    logs, dets, posture_events = [], [], []
    for pen_id in pens[:5]:
        last_posture = None
        clean = 1.0
        t = d(days=LOG_DAYS)
        while t < NOW:
            sow, stage, litter, htf = pen_state(sow_rows, pen_id, t)
            if not sow:
                t += timedelta(minutes=LOG_STEP_MIN)
                continue
            posture = pick_posture(stage, t.hour, htf)
            visible = max(0, litter - rng.choices([0, 1, 2, 3], [5, 3, 1, 1])[0]) if litter else 0
            risk = 0.0
            if visible:
                risk = min(1.0, POSTURE_RISK[posture] * rng.uniform(0.3, 1.0) + (0.15 if posture.startswith("sleeping") and rng.random() < 0.05 else 0))
            if t.hour == 8 and t.minute < LOG_STEP_MIN:
                clean = 1.0
            clean = max(0.3, clean - 0.004)
            positions = [{"x": round(rng.uniform(0.2, 0.8), 4), "y": round(rng.uniform(0.4, 0.9), 4)} for _ in range(visible)]
            logs.append(BehaviorLog(
                owner_id=OWNER, pen_id=pen_id, sow_id=sow.id, piglet_count=visible, sow_count=1,
                total_detections=visible + 1, sow_posture=posture, posture_confidence=round(rng.uniform(0.62, 0.96), 3),
                is_nursing=posture.endswith("lactating"), is_feeding=posture == "standing_feeding",
                is_sleeping=posture.startswith("sleeping"),
                activity_level="lactating" if posture.endswith("lactating") else "feeding" if posture == "standing_feeding"
                else "resting" if posture.startswith("sleeping") else "active",
                crushing_risk=round(risk, 3), health_score=round(rng.uniform(76, 96), 1),
                avg_confidence=round(rng.uniform(0.6, 0.9), 3), detection_density=round(visible / 14, 3),
                movement_level="high" if htf is not None and 0 < htf < 24 else
                rng.choice(["stationary", "low"]) if posture.startswith("sleeping") else rng.choice(["low", "moderate"]),
                cleanliness_score=round(clean, 3), wetness_score=round(1 - clean, 3),
                detection_data=json.dumps({"piglet_positions": positions,
                                           "nesting_score": 0.8 if htf is not None and 0 < htf < 24 else 0.0,
                                           "nesting_phase": "nesting" if htf is not None and 0 < htf < 24 else "calm"}),
                logged_at=t, created_at=t,
            ))
            if t.minute < LOG_STEP_MIN:   # hourly detection snapshot
                boxes = [{"class_name": "sow", "confidence": round(rng.uniform(0.7, 0.95), 3),
                          "bbox": [rng.uniform(150, 250), rng.uniform(150, 250), rng.uniform(280, 360), rng.uniform(140, 200)]}]
                boxes += [{"class_name": "piglet", "confidence": round(rng.uniform(0.55, 0.9), 3),
                           "bbox": [p["x"] * 640, p["y"] * 640, rng.uniform(40, 70), rng.uniform(30, 55)]} for p in positions]
                dets.append(Detection(
                    owner_id=OWNER, pen_id=pen_id, piglet_count=visible, sow_count=1, sow_posture=posture,
                    crushing_risk=round(risk, 3), bounding_boxes=json.dumps(boxes),
                    confidence_scores=json.dumps([b["confidence"] for b in boxes]), class_names=DET_MARK,
                    frame_timestamp=t, processing_time_ms=round(rng.uniform(70, 110), 1), created_at=t,
                ))
            if last_posture and posture != last_posture and rng.random() < 0.08:
                posture_events.append(Event(owner_id=OWNER, type="posture_change", category="ai_detection",
                                            sow_id=sow.id, pen_id=pen_id, created_at=t,
                                            description=f"{sow.name}: {last_posture.replace('_', ' ')} -> {posture.replace('_', ' ')}",
                                            event_metadata=json.dumps({"from": last_posture, "to": posture})))
            last_posture = posture
            t += timedelta(minutes=LOG_STEP_MIN)
    db.add_all(logs + dets + posture_events)
    await db.commit()

    print(f"Sows: {len(sow_rows)}  Farrowings: {len(farrowings)}  Crushing events: {total_events}  "
          f"Alerts: ~{total_alerts + 12}  Behavior logs: {len(logs)}  Detections: {len(dets)}  "
          f"Posture events: {len(posture_events)}")


async def main():
    async with AsyncSessionLocal() as db:
        if "--reset" in sys.argv:
            await reset(db)
        else:
            await seed(db)


if __name__ == "__main__":
    asyncio.run(main())
