"""Import real CCTV clips into the system using the real detector.

For every clip in /app/recordings/manifest.csv:
  1. Replay storage: a recording_clips row pointing at the file (shown in Replay > Recordings).
  2. Original time (e.g. Apr 20 00:41): runs YOLODetector on one frame every 2 s and stores
     detections + behavior logs at the clip's on-screen time, replacing generated fill in that
     window. Births go through BirthEventDetector (same 2-minute rule as live); piglet-count
     drops go through the live crushing rule (simulationEngine.ts) -> crushing events + alerts.
  3. Evaluation (Sep 23-27): one replay of the clips marked shown_to_evaluators per survey
     response, in SESSION_PEN like Test Pen, storing what the live backend stores for each
     behavior log (incl. crushing-risk alerts at risk >= 0.7). Times come from the survey
     submission times in evaluator/Pig_AI_Watch_Survey_Responses.xlsx (no names).

Run after seed_history.py, inside the backend container:
  docker exec pig-ai-watch-backend python import_footage.py          # import
  docker exec pig-ai-watch-backend python import_footage.py --reset  # remove imported rows
(--reset leaves piglet birth times changed; re-run seed_history.py to restore them.)
"""
import asyncio
import csv
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import cv2
import numpy as np
from sqlalchemy import select, text

from app.analyzers.birth import BirthEventDetector
from app.core.database import AsyncSessionLocal
from app.models.pig import (
    Alert, BehaviorLog, CrushingEvent, Detection, Event, FarrowingRecord, Pen, PigletRecord, RecordingClip, Sow,
)
from app.services.yolo_detector import YOLODetector

PH = timezone(timedelta(hours=8))
DIR = "/app/recordings"
MANIFEST = f"{DIR}/manifest.csv"
DEVICE = "cctv-import"
DET_MARK = '["cctv"]'
OWNER = 1
SAMPLE_SEC = 2          # detector runs on one frame every 2 s
LOG_SEC = 12            # behavior log every 12 s (same as the live behavior logger)
COUNT_WINDOW = 60       # crushing rule: visible count = 80th percentile over 60 s
DROP_CONFIRM = 60       #                a drop must last 60 s
LIE_DOWN_WINDOW = 600   #                "after lie-down" = within 10 min

# Survey submission times (times only) from evaluator/Pig_AI_Watch_Survey_Responses.xlsx.
# One Test Pen replay per response, ending REPLAY_LEAD before it was submitted; evaluators used
# their own devices, so replays may overlap.
RESPONSES = [
    "2026-09-23 17:06",
    "2026-09-23 18:51",
    "2026-09-23 19:52",
    "2026-09-24 00:21",
    "2026-09-27 10:36",
    "2026-09-27 10:38",
    "2026-09-27 10:39",
    "2026-09-27 10:40",
    "2026-09-27 11:30",
    "2026-09-27 12:53",
    "2026-09-27 14:41",
    "2026-09-27 14:46",
    "2026-09-27 14:48",
    "2026-09-27 15:01",
    "2026-09-27 15:08",
    "2026-09-27 16:25",
    "2026-09-27 16:25",
    "2026-09-27 16:26",
    "2026-09-27 16:27",
    "2026-09-27 16:28",
    "2026-09-27 16:30",
    "2026-09-27 17:08",
    "2026-09-27 17:15",
    "2026-09-27 17:18",
    "2026-09-27 17:26",
    "2026-09-27 17:27",
    "2026-09-27 17:27",
    "2026-09-27 17:28",
    "2026-09-27 19:51",
    "2026-09-27 20:04",
    "2026-09-27 21:48",
]
REPLAY_LEAD = timedelta(minutes=2)    # evaluator fills the survey right after watching
SESSION_GAP = timedelta(seconds=30)   # pause between clips within a replay
SESSION_PEN, SESSION_SOW_TAG = 1, "SOW-2401"


class BrowserOnnxDetector:
    """Runs pig_detection.onnx exactly like the browser (frontend/src/utils/onnxDetector.ts):
    letterbox to 640 with gray 114, RGB/255, conf >= 0.5, NMS IoU 0.45.
    (Ultralytics in this container mis-decodes this ONNX export, so it is not used.)
    Reuses YOLODetector for labels, ROI filter, clump analysis and crushing risk."""
    NAMES = ["piglet", "sow-sleep", "sow-sleep-lactating", "sow-stand-feed", "sow-stand-lactating"]

    def __init__(self, path="/app/models/pig_detection.onnx", conf=0.5, iou=0.45):
        import onnxruntime as ort
        self.sess = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
        self.conf, self.iou = conf, iou
        self.helper = YOLODetector()

    def process_frame(self, frame, roi):
        t0 = time.perf_counter()
        h, w = frame.shape[:2]
        r = min(640 / w, 640 / h)
        nw, nh = round(w * r), round(h * r)
        px, py = (640 - nw) // 2, (640 - nh) // 2
        canvas = np.full((640, 640, 3), 114, np.uint8)
        canvas[py:py + nh, px:px + nw] = cv2.resize(frame, (nw, nh))
        x = cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB).transpose(2, 0, 1)[None].astype(np.float32) / 255.0
        out = self.sess.run(None, {self.sess.get_inputs()[0].name: x})[0][0]   # (4 + classes, 8400)
        scores = out[4:]
        cls, conf = scores.argmax(0), scores.max(0)
        keep = conf >= self.conf
        b, cls, conf = out[:4, keep].T, cls[keep], conf[keep]
        rects = [[float((cx - bw / 2 - px) / r), float((cy - bh / 2 - py) / r), float(bw / r), float(bh / r)]
                 for cx, cy, bw, bh in b]
        idx = cv2.dnn.NMSBoxes(rects, conf.tolist(), self.conf, self.iou) if rects else []
        boxes = []
        for i in np.array(idx).flatten():
            raw = self.NAMES[int(cls[i])]
            boxes.append({"x": rects[i][0], "y": rects[i][1], "width": rects[i][2], "height": rects[i][3],
                          "label": self.helper._normalize_label(raw), "raw_label": raw,
                          "confidence": float(conf[i]), "has_mask": False})
        boxes = self.helper.filter_boxes_by_roi(boxes, roi, frame.shape)

        piglets = [b for b in boxes if "piglet" in b["label"]]
        sow_box, posture = None, "unknown"
        for bx in boxes:
            if bx["label"].startswith("sow") and (sow_box is None or bx["confidence"] > sow_box[1]):
                sow_box = (np.array([bx["x"], bx["y"], bx["x"] + bx["width"], bx["y"] + bx["height"]]), bx["confidence"])
                posture = self.helper.POSTURE_MAP.get(bx["label"], bx["label"])
        sow_dict = None if sow_box is None else {
            "x": float(sow_box[0][0]), "y": float(sow_box[0][1]), "width": float(sow_box[0][2] - sow_box[0][0]),
            "height": float(sow_box[0][3] - sow_box[0][1]), "confidence": float(sow_box[1])}
        clump = self.helper._clump_detector.analyze(
            [{k: p[k] for k in ("x", "y", "width", "height", "confidence")} for p in piglets],
            sow_box=sow_dict, sow_posture=posture)
        piglet_xyxy = [np.array([p["x"], p["y"], p["x"] + p["width"], p["y"] + p["height"]]) for p in piglets]
        risk = self.helper._calculate_crushing_risk(posture, sow_box, piglet_xyxy, frame.shape, clump)
        return SimpleNamespace(piglet_count=len(piglets), sow_posture=posture, crushing_risk=risk,
                               bounding_boxes=boxes, processing_time_ms=round((time.perf_counter() - t0) * 1000, 1))


def is_lying(p):
    return not p.startswith("standing") and any(k in p for k in ("lying", "sleep", "lactating", "nurs"))


def is_up(p):
    return p.startswith("standing") or p == "sitting"


def run_detector(detector, path, roi):
    """One sample per SAMPLE_SEC: dict(t, n, posture, risk, boxes, ms, w, h)."""
    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    duration = cap.get(cv2.CAP_PROP_FRAME_COUNT) / fps
    samples, t = [], 0.0
    while t < duration:
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
        ok, frame = cap.read()
        if not ok:
            break
        r = detector.process_frame(frame, roi)
        samples.append({"t": t, "n": r.piglet_count, "posture": r.sow_posture, "risk": float(r.crushing_risk),
                        "boxes": r.bounding_boxes, "ms": r.processing_time_ms,
                        "w": frame.shape[1], "h": frame.shape[0]})
        t += SAMPLE_SEC
    cap.release()
    return samples, duration


def crushing_rule(samples):
    """Port of simulationEngine.processPigletCount: sustained drop of the visible count."""
    hist, baseline, low_since, open_ev, out = [], 0, None, None, []
    last_post, last_lie, count_before_lie = None, None, 0
    for s in samples:
        hist = [h for h in hist + [(s["t"], s["n"])] if s["t"] - h[0] <= COUNT_WINDOW]
        vals = sorted(n for _, n in hist)
        detected = vals[min(len(vals) - 1, int(0.8 * len(vals)))]
        if s["t"] >= COUNT_WINDOW:
            baseline = max(baseline, detected)
        p = s["posture"]
        if last_post and p != last_post and is_lying(p) and is_up(last_post):
            last_lie, count_before_lie = s["t"], detected
        last_post = p
        if baseline and 0 < detected < baseline:
            low_since = s["t"] if low_since is None else low_since
            if open_ev is None and s["t"] - low_since >= DROP_CONFIRM:
                after_lie = (last_lie is not None and s["t"] - last_lie <= LIE_DOWN_WINDOW
                             and count_before_lie >= baseline and is_lying(p))
                open_ev = {"start": low_since, "alerted": s["t"], "baseline": baseline, "min": detected,
                           "after_lie": after_lie}
            if open_ev:
                open_ev["min"] = min(open_ev["min"], detected)
        elif detected >= baseline:
            low_since = None
            if open_ev:
                out.append({**open_ev, "resolved": s["t"], "recovered": True, "recovery": detected})
                open_ev = None
    if open_ev:
        out.append({**open_ev, "resolved": samples[-1]["t"], "recovered": False, "recovery": open_ev["min"]})
    return out


def log_from(s, pen_id, sow_id, at, clip):
    p = s["posture"]
    pos = [{"x": round((b["x"] + b["width"] / 2) / s["w"], 4), "y": round((b["y"] + b["height"] / 2) / s["h"], 4)}
           for b in s["boxes"] if "piglet" in b["label"]]
    confs = [b["confidence"] for b in s["boxes"]]
    return BehaviorLog(
        owner_id=OWNER, pen_id=pen_id, sow_id=sow_id, piglet_count=s["n"],
        sow_count=sum(1 for b in s["boxes"] if b["label"].startswith("sow")), total_detections=len(s["boxes"]),
        sow_posture=p, posture_confidence=max((b["confidence"] for b in s["boxes"] if b["label"].startswith("sow")), default=0.0),
        is_nursing="lactating" in p or "nurs" in p, is_feeding="feed" in p, is_sleeping="sleep" in p,
        activity_level="lactating" if "lactating" in p else "feeding" if "feed" in p else "resting" if is_lying(p) else "active",
        crushing_risk=round(s["risk"], 3), avg_confidence=round(sum(confs) / len(confs), 3) if confs else 0.0,
        detection_density=round(s["n"] / 14, 3), movement_level="stationary" if is_lying(p) else "moderate",
        detection_data=json.dumps({"source": "cctv", "clip": clip, "video_time": s["t"], "piglet_positions": pos}),
        logged_at=at, created_at=at,
    )


def detection_from(s, pen_id, at):
    return Detection(
        owner_id=OWNER, pen_id=pen_id, piglet_count=s["n"],
        sow_count=sum(1 for b in s["boxes"] if b["label"].startswith("sow")), sow_posture=s["posture"],
        crushing_risk=round(s["risk"], 3), bounding_boxes=json.dumps(s["boxes"]),
        confidence_scores=json.dumps([b["confidence"] for b in s["boxes"]]), class_names=DET_MARK,
        frame_timestamp=at, processing_time_ms=s["ms"], created_at=at,
    )


async def clear_window(db, pen_id, start, end):
    """Remove generated fill for a pen inside [start, end] (logs, detections, crushing events/alerts)."""
    w = {"p": pen_id, "a": start, "b": end}
    await db.execute(text("update crushing_events set alert_id = null where pen_id = :p and alerted_at between :a and :b"), w)
    await db.execute(text("delete from alerts where pen_id = :p and created_at between :a and :b and type like 'crushing%'"), w)
    await db.execute(text("delete from crushing_events where pen_id = :p and alerted_at between :a and :b"), w)
    await db.execute(text("delete from behavior_logs where pen_id = :p and logged_at between :a and :b"), w)
    await db.execute(text("delete from detections where pen_id = :p and frame_timestamp between :a and :b"), w)


async def reset(db):
    await db.execute(text("update crushing_events set alert_id = null where alert_id in "
                          "(select id from alerts where detection_data like '%\"source\": \"cctv\"%')"))
    # Alerts point at crushing events, so delete both in one statement.
    await db.execute(text("with a as (delete from alerts where detection_data like '%\"source\": \"cctv\"%' "
                          "returning crushing_event_id) "
                          "delete from crushing_events where id in (select crushing_event_id from a)"))
    await db.execute(text("delete from events where metadata like '%\"source\": \"cctv\"%'"))
    await db.execute(text("delete from behavior_logs where detection_data like '%\"source\": \"cctv\"%'"))
    await db.execute(text(f"delete from detections where class_names = '{DET_MARK}'"))
    await db.execute(text(f"delete from recording_clips where edge_device_id = '{DEVICE}'"))
    await db.commit()
    print("Imported footage rows removed.")


async def main():
    async with AsyncSessionLocal() as db:
        if "--reset" in sys.argv:
            return await reset(db)
        if (await db.execute(text(f"select count(*) from recording_clips where edge_device_id = '{DEVICE}'"))).scalar():
            print("Footage already imported. Run with --reset first.")
            return

        detector = BrowserOnnxDetector()
        pens = {p.id: p for p in (await db.execute(select(Pen))).scalars()}
        sows = {s.tag_id: s for s in (await db.execute(select(Sow))).scalars()}
        with open(MANIFEST, newline="", encoding="utf-8") as f:
            clips = list(csv.DictReader(f))

        shown = []
        for c in clips:
            path = f"{DIR}/{c['file']}"
            pen_id = int(c["pen"])
            sow = sows.get(c["sow_tag"])
            roi = json.loads(c["roi"]) if c.get("roi") else None
            start = datetime.fromisoformat(c["start_local"]).replace(tzinfo=PH)
            samples, duration = run_detector(detector, path, roi)
            end = start + timedelta(seconds=duration)
            at = lambda s: start + timedelta(seconds=s["t"])

            # 1. Replay storage
            db.add(RecordingClip(owner_id=OWNER, pen_id=pen_id, start_time=start, end_time=end, mode="continuous",
                                 file_path=path, storage_path=DIR, file_size_bytes=os.path.getsize(path),
                                 edge_device_id=DEVICE, created_at=end))

            # 2. Records at the original time (replacing generated fill in this window)
            await clear_window(db, pen_id, start, end)
            db.add_all([detection_from(s, pen_id, at(s)) for s in samples])
            logs = [log_from(s, pen_id, sow.id if sow else None, at(s), c["file"])
                    for s in samples if int(s["t"]) % LOG_SEC < SAMPLE_SEC]
            db.add_all(logs)

            # Births only count while this sow is farrowing (same gate as live: sow must be due).
            rec = None
            if sow:
                rec = (await db.execute(select(FarrowingRecord).where(
                    FarrowingRecord.sow_id == sow.id, FarrowingRecord.farrowing_started <= end,
                    FarrowingRecord.farrowing_completed >= start).limit(1))).scalar_one_or_none()
            births = []
            birth_detector = BirthEventDetector()
            for log in logs:
                for ev in birth_detector.process_log(log, log.logged_at, births_allowed=rec is not None):
                    if ev["type"] == "birth_detected":
                        births.append(log.logged_at)
                    db.add(Alert(owner_id=OWNER, type=ev["type"], severity=ev["severity"].lower(),
                                 title=ev["type"].replace("_", " ").title(), message=ev["alert"],
                                 pen_id=pen_id, sow_id=sow.id if sow else None, is_read=True, is_resolved=True,
                                 resolved_at=log.logged_at, detection_data=json.dumps({**ev, "source": "cctv"}),
                                 created_at=log.logged_at))
            if births and rec:
                piglets = (await db.execute(select(PigletRecord).where(PigletRecord.farrowing_record_id == rec.id)
                                            .order_by(PigletRecord.birth_order))).scalars().all()
                for p, t in zip(piglets, births):
                    p.birth_time = t

            crushes = crushing_rule(samples)
            for e in crushes:
                t_alert = start + timedelta(seconds=e["alerted"])
                t_res = start + timedelta(seconds=e["resolved"])
                outcome = "false_positive" if e["recovered"] else "unresolved"
                ev = CrushingEvent(
                    owner_id=OWNER, pen_id=pen_id, sow_id=sow.id if sow else None,
                    watch_started_at=start + timedelta(seconds=e["start"]), alerted_at=t_alert, resolved_at=t_res,
                    baseline_count=e["baseline"], min_count_seen=e["min"], recovery_count=e["recovery"],
                    duration_minutes=round((t_res - t_alert).total_seconds() / 60, 1), outcome=outcome,
                    created_at=t_alert)
                db.add(ev)
                await db.flush()
                kind = ("crushing_escalated", "critical", "Possible crushing: piglet missing after sow lay down") \
                    if e["after_lie"] else ("crushing_risk", "high", f"Piglet count drop: {e['min']}/{e['baseline']}")
                al = Alert(owner_id=OWNER, type=kind[0], severity=kind[1], title=kind[2], pen_id=pen_id,
                           sow_id=sow.id if sow else None, crushing_event_id=ev.id, is_read=True, is_resolved=True,
                           resolved_at=t_res, created_at=t_alert,
                           message=f"Visible piglets dropped from {e['baseline']} to {e['min']} for over a minute.",
                           event_state="false_positive" if e["recovered"] else "alert",
                           detection_data=json.dumps({"source": "cctv", "clip": c["file"], "video_time": e["alerted"],
                                                      "baseline": e["baseline"], "piglet_count": e["min"]}))
                db.add(al)
                await db.flush()
                ev.alert_id = al.id

            print(f"{c['file']}: {start:%Y-%m-%d %H:%M:%S} +{duration / 60:.1f} min  frames={len(samples)}  "
                  f"logs={len(logs)}  max_piglets={max((s['n'] for s in samples), default=0)}  "
                  f"births={len(births)}  crushing_events={len(crushes)}")
            if c.get("shown_to_evaluators", "").strip().lower() in ("yes", "y", "true", "1"):
                shown.append((c["file"], samples, duration))

        # 3. Evaluation: one Test Pen replay per survey response, ending just before it was submitted
        sow = sows.get(SESSION_SOW_TAG)
        total = sum((timedelta(seconds=d) + SESSION_GAP for _, _, d in shown), timedelta())
        times = [datetime.fromisoformat(r).replace(tzinfo=PH) for r in RESPONSES] if shown else []
        if times:
            await clear_window(db, SESSION_PEN, times[0] - total - REPLAY_LEAD, times[-1])
        n_alerts = 0
        for k, submitted in enumerate(times, start=1):
            t = r_start = submitted - REPLAY_LEAD - total
            for name, samples, duration in shown:
                for s in samples:
                    at = t + timedelta(seconds=s["t"])
                    db.add(detection_from(s, SESSION_PEN, at))
                    if int(s["t"]) % LOG_SEC < SAMPLE_SEC:
                        db.add(log_from(s, SESSION_PEN, sow.id if sow else None, at, name))
                        if s["risk"] >= 0.7:   # same as POST /api/behavior/log
                            sev = "critical" if s["risk"] >= 0.8 else "high"
                            db.add(Event(owner_id=OWNER, type="detection", category="ai_detection",
                                         pen_id=SESSION_PEN, created_at=at,
                                         description=f"High crushing risk detected ({s['risk']:.2f})",
                                         event_metadata=json.dumps({"source": "cctv", "clip": name})))
                            db.add(Alert(owner_id=OWNER, type="crushing_risk", severity=sev, title="Crushing Risk",
                                         pen_id=SESSION_PEN, is_read=True, is_resolved=True, resolved_at=at,
                                         created_at=at, message=(
                                             f"High crushing risk detected in Pen {SESSION_PEN} (risk={s['risk']:.2f}). "
                                             "Check sow and piglet spacing immediately."),
                                         detection_data=json.dumps({"source": "cctv", "clip": name,
                                                                    "risk_level": round(s["risk"], 3)})))
                            n_alerts += 1
                t += timedelta(seconds=duration) + SESSION_GAP
            db.add(Event(owner_id=OWNER, type="evaluation_session", category="system", pen_id=SESSION_PEN,
                         created_at=r_start,
                         description=(f"Evaluation replay {k} of {len(times)}: Test Pen replay of "
                                      f"{len(shown)} recorded clip(s) before survey response"),
                         event_metadata=json.dumps({"source": "cctv", "clips": [n for n, _, _ in shown],
                                                    "response": k, "submitted": submitted.isoformat()})))
        print(f"Evaluation: {len(times)} replays ({total.total_seconds() / 60:.1f} min each), "
              f"{n_alerts} crushing-risk alerts")

        await db.commit()


if __name__ == "__main__":
    asyncio.run(main())
