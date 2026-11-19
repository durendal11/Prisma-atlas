"""Generate simulated farm history around the farm's actual farrowing timeline.

Farrowings (fixed dates, 2026):
  - Mar 21: Anay 7 (Pen 2) -> litter filmed on Mar 28 (piglet crushed, CCTV clip)
  - Apr 20: Anay 1 (Pen 1) -> filmed from 12:41 AM: AI detection, behavior logs, crushing alerts
  - Apr 20: Anay 3 (Pen 3) -> not filmed: manual farrowing record only
  - Sep 12: Anay 5 (Pen 5) -> not filmed: manual farrowing record only
No farrowings in Oct-Nov and no sow is pregnant now. Litter numbers and the last-30-days behavior logs are generated.

Rows can be removed again with --reset:
  sows with the tag ids in TAGS (every other row links to one of those sows)
  detections with class_names = '["sow", "piglet"]' (the live pipeline leaves it empty)

Run inside the backend container:
  docker cp backend/seed_history.py pig-ai-watch-backend:/app/
  docker exec pig-ai-watch-backend python seed_history.py --reset  # remove
  docker exec pig-ai-watch-backend python seed_history.py          # create
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
PH = timezone(timedelta(hours=8))
NOW = datetime.now(timezone.utc).replace(second=0, microsecond=0)
OWNER = 1          # admin
GESTATION = 114    # days
LOG_DAYS = 30      # recent behavior logs window
LOG_STEP_MIN = 10
TAGS = [f"SOW-{n}" for n in range(2401, 2411)]   # reset covers the whole range
DET_MARK = '["sow", "piglet"]'

POSTURE_RISK = {
    "standing": 0.1, "sitting": 0.2, "sleeping": 0.6, "sleeping_lactating": 0.7,
    "standing_feeding": 0.15, "standing_lactating": 0.3,
}


def ph(m, d, h=0, mi=0):
    return datetime(2026, m, d, h, mi, tzinfo=PH)


# key, name, pen now, status now, parity before 2026, breeding date (current pregnancy), note
SOWS = [
    ("luna",   "Anay 1", 1,    "active",   2, None,          "Good mothering ability, calm temperament."),
    ("daisy",  "Anay 2", 2,    "active",   0, None,          "Gilt retained from own herd, not yet bred."),
    ("rosa",   "Anay 3", None, "active",   1, None,          "Did not settle after weaning, check heat closely."),
    ("mabel",  "Anay 4", 4,    "active",   0, None,          "Gilt, not yet bred."),
    ("clover", "Anay 5", 5,    "weaned",   2, None,          "Excellent milk production. Weaned Oct 8."),
    ("hazel",  "Anay 6", None, "active",   0, None,          "Replacement gilt, not yet bred."),
    ("march",  "Anay 7", None, "active",   1, None,          "Litter filmed on Mar 28. Weaned Apr 16."),
]

# sow key, pen, farrowing completed, filmed?, weaned, options
#   start:  fixed farrowing start (completion = start + generated duration)
#   deaths: fixed piglet deaths [(time, cause)] instead of generated ones
#   alive:  fixed number born alive
FARROWINGS = [
    ("luna",   1, ph(4, 20, 11, 30), True,  ph(5, 16, 8), {"start": ph(4, 20, 0, 41), "alive": 12}),   # CCTV: starts 12:41:05 AM; ~12 piglets on the 11:41 AM clip
    ("rosa",   3, ph(4, 20, 16, 10), False, ph(5, 17, 8), {}),
    ("clover", 5, ph(9, 12, 10, 25), False, ph(10, 8, 8), {}),
    ("march",  2, ph(3, 21, 9, 0),   True,  ph(4, 16, 8), {"deaths": [(ph(3, 28, 4, 43), "crushing")]}),  # crush on the Mar 28 clip
]
FARROW_NOTES = {
    "luna": "Farrowing recorded on camera, started 12:41 AM. Sow calm, piglets vigorous.",
    "rosa": "Normal farrowing. Not recorded on camera.",
    "clover": "Long gap between piglets 6 and 7. Not recorded on camera.",
    "march": "Normal farrowing. One piglet crushed on Mar 28, recorded on camera.",
}


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


def make_litter(sow, pen_id, farrow_end, weaned_at, filmed, note, start=None, deaths=None, alive=None):
    """Farrowing record + piglets. Returns (record, piglets, deaths[(time, cause)], weaned_count)."""
    alive = alive or rng.randint(10, 13)
    still = rng.choice([0, 1, 1])
    mumm = rng.choice([0, 0, 1])
    duration = rng.randint(200, 380)
    if start:
        farrow_end = start + timedelta(minutes=duration)
    else:
        start = farrow_end - timedelta(minutes=duration)
    weights = [round(rng.gauss(1.4, 0.2), 2) for _ in range(alive)]

    deaths = sorted(deaths or (
        (farrow_end + timedelta(hours=rng.uniform(8, 120)), cause)
        for cause in rng.choice([["crushing"], ["crushing", "starvation"], ["crushing"], ["weak at birth"]])
    ))
    weaned_count = alive - len(deaths)

    rec = FarrowingRecord(
        owner_id=OWNER, sow_id=sow.id, pen_id=pen_id,
        farrowing_started=start, farrowing_completed=farrow_end, duration_minutes=duration,
        total_born=alive + still + mumm, born_alive=alive, stillborn=still, mummified=mumm,
        piglet_weights=json.dumps(weights), avg_birth_weight=round(sum(weights) / alive, 2),
        current_litter_size=0,  # weaned
        sow_condition=rng.choice(["good", "good", "excellent"]),
        intervention_required=duration > 340,
        intervention_notes="Assisted delivery, long interval between piglets." if duration > 340 else None,
        ai_detected=filmed, crushing_incidents=sum(1 for _, c in deaths if c == "crushing"),
        attended_by=OWNER, notes=note, created_at=farrow_end,
    )
    piglets = []
    death_slots = rng.sample(range(alive), len(deaths))
    for i in range(alive):
        birth = start + timedelta(minutes=duration * (i + 1) / (alive + 1))
        p = PigletRecord(
            owner_id=OWNER, sow_id=sow.id, temp_id=f"{sow.tag_id[-3:]}-{farrow_end:%m%d}-{i + 1:02d}",
            birth_order=i + 1, birth_weight=weights[i], birth_time=birth, status="transferred",
            iron_given=True, teeth_clipped=True, tail_docked=True, castrated=i % 2 == 0,
            processed_date=birth + timedelta(days=3),
            current_weight=round(weights[i] + 0.22 * (weaned_at - farrow_end).days, 2),
            health_score=round(rng.uniform(85, 100), 1), created_at=birth,
        )
        if i in death_slots:
            t, cause = deaths[death_slots.index(i)]
            p.status, p.death_date, p.death_cause, p.health_score = "deceased", t, cause, 0
            p.current_weight = None
        piglets.append(p)
    return rec, piglets, deaths, weaned_count


def crushing_history(sow, pen_id, farrow_end, litter, crush_times):
    """CrushingEvents + Alerts for a filmed litter's first 3 weeks."""
    pairs = []
    day = farrow_end
    while day < farrow_end + timedelta(days=21):
        age = (day - farrow_end).days
        for _ in range(rng.choices([0, 1, 2, 3], [3, 4, 2, 1] if age < 5 else [6, 3, 1, 0])[0]):
            pairs.append((day + timedelta(hours=rng.uniform(0, 24)),
                          rng.choices(["false_positive", "prevented", "unresolved"], [45, 45, 10])[0]))
        day += timedelta(days=1)
    pairs += [(t, "likely_crush") for t in crush_times]

    out = []
    for t, outcome in sorted(pairs):
        dur = {"false_positive": rng.uniform(0.5, 2), "prevented": rng.uniform(2, 9),
               "unresolved": rng.uniform(5, 20), "likely_crush": rng.uniform(10, 30)}[outcome]
        ev = CrushingEvent(
            owner_id=OWNER, pen_id=pen_id, sow_id=sow.id,
            watch_started_at=t - timedelta(minutes=rng.uniform(0.5, 2)), alerted_at=t,
            resolved_at=t + timedelta(minutes=dur),
            dismissed_at=t + timedelta(minutes=dur) if outcome == "unresolved" else None,
            dismissed_by=OWNER if outcome == "unresolved" else None,
            baseline_count=litter, min_count_seen=litter - 1 - rng.choice([0, 0, 1]),
            recovery_count=litter - (1 if outcome == "likely_crush" else 0),
            duration_minutes=round(dur, 1), outcome=outcome,
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
            is_read=True, is_resolved=True, resolved_at=t + timedelta(minutes=dur), resolved_by=OWNER,
            detection_data=json.dumps({"piglet_count": ev.min_count_seen, "baseline": litter}),
            event_state="false_positive" if outcome == "false_positive" else "all_clear", created_at=t,
        )
        out.append((ev, al))
    return out


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


def camera_logs(sow, pen_id, start, end, farrow_end=None, born_alive=0, deaths=(), due=None):
    """Behavior logs every 10 min + hourly detections + some posture-change events."""
    logs, dets, events = [], [], []
    last_posture, clean, t = None, 1.0, start
    while t < end:
        local = t.astimezone(PH)
        lactating = farrow_end is not None and t >= farrow_end
        litter = born_alive - sum(1 for dt, _ in deaths if dt <= t) if lactating else 0
        ref = farrow_end if farrow_end and not lactating else due
        htf = (ref - t).total_seconds() / 3600 if ref and not lactating else None
        posture = pick_posture("lactating" if lactating else "pregnant", local.hour, htf)
        visible = max(0, litter - rng.choices([0, 1, 2, 3], [5, 3, 1, 1])[0]) if litter else 0
        risk = 0.0
        if visible:
            risk = min(1.0, POSTURE_RISK[posture] * rng.uniform(0.3, 1.0)
                       + (0.15 if posture.startswith("sleeping") and rng.random() < 0.05 else 0))
        if local.hour == 8 and local.minute < LOG_STEP_MIN:
            clean = 1.0
        clean = max(0.3, clean - 0.004)
        nesting = htf is not None and 0 < htf < 24
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
            movement_level="high" if nesting else
            rng.choice(["stationary", "low"]) if posture.startswith("sleeping") else rng.choice(["low", "moderate"]),
            cleanliness_score=round(clean, 3), wetness_score=round(1 - clean, 3),
            detection_data=json.dumps({"piglet_positions": positions, "nesting_score": 0.8 if nesting else 0.0,
                                       "nesting_phase": "nesting" if nesting else "calm"}),
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
            events.append(Event(owner_id=OWNER, type="posture_change", category="ai_detection",
                                sow_id=sow.id, pen_id=pen_id, created_at=t,
                                description=f"{sow.name}: {last_posture.replace('_', ' ')} -> {posture.replace('_', ' ')}",
                                event_metadata=json.dumps({"from": last_posture, "to": posture})))
        last_posture = posture
        t += timedelta(minutes=LOG_STEP_MIN)
    return logs + dets + events, len(logs), len(dets)


async def seed(db):
    tag_list = ",".join(f"'{t}'" for t in TAGS)
    if (await db.execute(text(f"select count(*) from sows where tag_id in ({tag_list})"))).scalar():
        print("History already exists. Run with --reset first to regenerate.")
        return
    pens = [r[0] for r in (await db.execute(text("select id from pens order by id"))).all()]
    if len(pens) < 5:
        print("Need at least 5 pens (found %d)." % len(pens))
        return

    # ── Sows ────────────────────────────────────────────────────────────────
    sows = {}
    for i, (key, name, pen, status, parity, bred, note) in enumerate(SOWS):
        sow = Sow(
            owner_id=OWNER, tag_id=TAGS[i], name=name, pen_id=pens[pen - 1] if pen else None,
            birth_date=ph(1, 1) - timedelta(days=rng.randint(300 if parity == 0 else 500, 400 if parity == 0 else 1100)),
            parity=parity, status=status, notes=note, created_at=ph(2, 1, 9),
            last_breeding_date=bred,
            expected_farrowing_date=bred + timedelta(days=GESTATION) if bred else None,
        )
        db.add(sow)
        sows[key] = sow
    await db.flush()

    # Breeding events for current pregnancies
    for sow in sows.values():
        if sow.last_breeding_date:
            db.add(Event(owner_id=OWNER, type="breeding", category="manual_entry", sow_id=sow.id, pen_id=sow.pen_id,
                         user_id=OWNER, created_at=sow.last_breeding_date,
                         description=f"{sow.name} bred (AI). Expected farrowing {sow.expected_farrowing_date:%b %d, %Y}."))

    added = []   # bulk camera rows
    n_logs = n_dets = n_crush = 0

    # ── Farrowings ──────────────────────────────────────────────────────────
    for key, pen_no, fe, filmed, weaned, opts in FARROWINGS:
        sow, pen_id = sows[key], pens[pen_no - 1]
        rec, piglets, deaths, weaned_count = make_litter(sow, pen_id, fe, weaned, filmed, FARROW_NOTES[key],
                                                         start=opts.get("start"), deaths=opts.get("deaths"),
                                                         alive=opts.get("alive"))
        fe = rec.farrowing_completed
        db.add(rec)
        await db.flush()
        for p in piglets:
            p.farrowing_record_id = rec.id
        db.add_all(piglets)
        sow.parity += 1
        sow.last_farrowing_date = fe

        db.add_all([
            Event(owner_id=OWNER, type="farrowing", category="ai_detection" if filmed else "manual_entry",
                  sow_id=sow.id, pen_id=pen_id, user_id=None if filmed else OWNER,
                  description=f"Farrowing started for {sow.name}", created_at=rec.farrowing_started),
            Event(owner_id=OWNER, type="farrowing", category="manual_entry", sow_id=sow.id, pen_id=pen_id,
                  user_id=OWNER, created_at=fe,
                  description=f"Farrowing completed: {rec.born_alive} born alive, {rec.stillborn} stillborn",
                  event_metadata=json.dumps({"born_alive": rec.born_alive})),
            Event(owner_id=OWNER, type="piglet_processing", category="manual_entry", sow_id=sow.id,
                  pen_id=pen_id, user_id=OWNER, created_at=fe + timedelta(days=3),
                  description="Piglets processed: iron injection, teeth clipping, tail docking"),
            Event(owner_id=OWNER, type="weaning", category="manual_entry", sow_id=sow.id, pen_id=pen_id,
                  user_id=OWNER, created_at=weaned, description=f"Litter weaned ({weaned_count} piglets)"),
        ])
        for t, cause in deaths:
            db.add(Event(owner_id=OWNER, type="piglet_death", category="manual_entry", sow_id=sow.id, pen_id=pen_id,
                         user_id=OWNER, created_at=t + timedelta(hours=1), description=f"Piglet found dead ({cause})"))

        if filmed:
            db.add(Alert(owner_id=OWNER, type="system", severity="medium", title=f"Farrowing started: {sow.name}",
                         message="Sow restless and first piglet detected near the sow.", sow_id=sow.id, pen_id=pen_id,
                         is_read=True, is_resolved=True, resolved_at=fe, resolved_by=OWNER,
                         created_at=rec.farrowing_started))
            pairs = crushing_history(sow, pen_id, fe, rec.born_alive,
                                     [t for t, c in deaths if c == "crushing"])
            for ev, _ in pairs:
                db.add(ev)
            await db.flush()
            for ev, al in pairs:
                al.crushing_event_id = ev.id
                db.add(al)
            await db.flush()
            for ev, al in pairs:
                ev.alert_id = al.id
            n_crush += len(pairs)
            rows, nl, nd = camera_logs(sow, pen_id, fe - timedelta(days=7), weaned, fe, rec.born_alive, deaths)
            added += rows
            n_logs += nl
            n_dets += nd

    # ── Recent camera history: sows in pens, last 30 days (no farrowings) ───
    for sow in sows.values():
        if sow.pen_id:
            rows, nl, nd = camera_logs(sow, sow.pen_id, NOW - timedelta(days=LOG_DAYS), NOW,
                                       due=sow.expected_farrowing_date)
            added += rows
            n_logs += nl
            n_dets += nd
        if sow.status == "pregnant" and sow.pen_id and (sow.expected_farrowing_date - NOW).days <= 4:
            db.add(Alert(owner_id=OWNER, type="system", severity="medium", sow_id=sow.id, pen_id=sow.pen_id,
                         title=f"{sow.name} is near her due date",
                         message=f"Expected farrowing {sow.expected_farrowing_date.astimezone(PH):%b %d}. Birth detection is active.",
                         created_at=NOW - timedelta(hours=20)))
    for _ in range(8):
        sow = rng.choice([s for s in sows.values() if s.pen_id])
        t = NOW - timedelta(days=rng.uniform(1, 30))
        db.add(Alert(owner_id=OWNER, type="system", severity="low", sow_id=sow.id, pen_id=sow.pen_id,
                     title="Camera stream reconnected", message="Stream dropped for a few minutes and recovered.",
                     is_read=True, is_resolved=True, resolved_at=t + timedelta(minutes=4), created_at=t))

    db.add_all(added)
    await db.commit()
    print(f"Sows: {len(sows)}  Farrowings: {len(FARROWINGS)}  Crushing events: {n_crush}  "
          f"Behavior logs: {n_logs}  Detections: {n_dets}")


async def main():
    async with AsyncSessionLocal() as db:
        if "--reset" in sys.argv:
            await reset(db)
        else:
            await seed(db)


if __name__ == "__main__":
    asyncio.run(main())
