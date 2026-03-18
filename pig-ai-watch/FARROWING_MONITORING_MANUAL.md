# Farrowing Monitoring & Sow Well-Being Manual

> Pig AI Watch — Simplified guide for recording and monitoring farrowing events, sow health, and piglet welfare.

---

## Table of Contents

1. [Sow Lifecycle Overview](#1-sow-lifecycle-overview)
2. [Recording Breeding / Insemination](#2-recording-breeding--insemination)
3. [Gestation Tracking](#3-gestation-tracking)
4. [Pre-Farrowing Signs (What to Watch For)](#4-pre-farrowing-signs-what-to-watch-for)
5. [Recording a Farrowing Event](#5-recording-a-farrowing-event)
6. [Post-Farrowing Monitoring](#6-post-farrowing-monitoring)
7. [Sow Well-Being Checklist](#7-sow-well-being-checklist)
8. [AI Detection Classes](#8-ai-detection-classes)
9. [API Quick Reference](#9-api-quick-reference)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Sow Lifecycle Overview

Each sow moves through these statuses in the system:

```
active → pregnant → farrowing → lactating → weaned → active
```

| Status | Meaning |
|--------|--------|
| **active** | Not pregnant, available for breeding |
| **pregnant** | Bred/inseminated, gestation in progress |
| **farrowing** | Actively giving birth (set automatically when a farrowing record is created) |
| **lactating** | Post-farrowing, suckling piglets (set automatically after farrowing is recorded) |
| **weaned** | Piglets weaned, sow available for next breeding cycle (typically 5-7 days post-wean) |
| **inactive** | Removed from breeding rotation |

**Important:** When you record a farrowing event, the system automatically:
- Sets the sow status to `lactating`
- Increments parity by 1
- Updates `current_litter_size` to the number born alive

---

## 2. Recording Breeding / Insemination

### When you know the exact date

1. Go to **Test Pen** (upload detection) or **Pen Monitor** (live camera)
2. Open the **Farrowing** tab
3. Click **Record Breeding Date**
4. Enter the insemination/breeding date
5. Click **Save**

The system calculates:
- **Expected farrowing date** = breeding date + 114 days
- Sow status changes to `pregnant`

### When you don't know the date

If the sow is pregnant but the breeding date was not recorded:

1. Open the **Farrowing** tab
2. Click **Record Breeding Date**
3. Toggle **"I don't know the breeding/insemination date"**
4. Optionally enter an **estimated farrowing date** (if you have a rough idea)
5. Click **Save**

The system will:
- Mark the sow as `pregnant`
- If an estimated farrowing date is given, show a countdown
- If no dates at all, display: *"Monitor behavior closely for farrowing signs"*

---

## 3. Gestation Tracking

Standard pig gestation is **114 days** (3 months, 3 weeks, 3 days).

The gestation tracker on the Farrowing tab shows one of three views:

| Scenario | What you see |
|----------|-------------|
| **Both dates known** | Progress bar (day X of 114), expected farrowing date, days remaining |
| **Expected date only** | Countdown to estimated farrowing date |
| **No dates** | Warning banner: watch for behavioral signs |

### Key gestation milestones

| Day | Event |
|-----|-------|
| 0 | Breeding/insemination |
| 12–18 | Embryo implantation (minimize stress) |
| 18–24 | Return-to-heat observation window (if sow shows estrus, breeding failed — re-breed) |
| 24–30 | Ultrasound confirmation window |
| 90 | Move to farrowing crate/pen |
| 110 | Pre-farrowing preparation |
| 114 | Expected farrowing (±3 days normal) |

---

## 4. Pre-Farrowing Signs (What to Watch For)

Monitor these signs as the sow approaches her due date:

### Physical signs
- **Udder development** — teats fill and become firm (24–48 hrs before)
- **Milk letdown** — milk can be expressed from teats (<12 hrs before; high probability of imminent farrowing)
- **Vulva swelling** — becomes enlarged and reddened
- **Relaxed muscles** — tail head area relaxes

### Behavioral signs (detected by AI)
- **Posture switching / restlessness** — frequent lying→standing→lying cycles, increased restlessness
- **Reduced feeding** — appetite drops significantly (12–24 hrs before)
- **Frequent posture changes** — alternating between standing and lying (>6 transitions/30 min is significant)
- **Increased respiration** — visible heavier breathing

### AI Detection indicators
The system detects these postures automatically:
- `sow-stand-feed` → feeding activity (drop in this = reduced appetite)
- `sow-sleep` / `sow-sleep-lactate` → resting postures
- Rapid switching between postures may indicate pre-farrowing restlessness (posture switching frequency inference)
- Prolonged lying with piglets detected = lactation

---

## 5. Recording a Farrowing Event

### Step-by-step

1. Open the **Farrowing** tab on the pen page
2. Click **Record New Farrowing**
3. Fill in the form:

| Field | Required | Description |
|-------|----------|-------------|
| **Piglets born alive** | Yes | Count of live piglets at birth |
| **Stillborn** | No (default: 0) | Count of stillborn piglets |
| **Date** | Auto-filled | Date of farrowing (today by default) |
| **Time** | Auto-filled | Time farrowing started (current time by default) |
| **Notes** | No | Any observations (e.g., "assisted delivery", "easy birth") |

4. Click **Record Farrowing**

### What happens automatically
- `total_born` = born alive + stillborn
- `current_litter_size` = born alive
- Sow status → `lactating`
- Sow parity incremented by 1
- Farrowing event logged in the Events system
- Alert generated if stillborn count is high

### Completing a farrowing record
After all piglets are delivered and the sow is stable, click **Complete Farrowing** on the active record to mark timeframe.

---

## 6. Post-Farrowing Monitoring

### First 24 hours (critical)

| Check | What to look for | Frequency |
|-------|-------------------|-----------|
| **Piglet nursing** | All piglets finding teats, active suckling | Every 2 hrs |
| **Milk production** | Adequate for litter size | Every 4 hrs |
| **Piglet activity** | Active, warm, no shivering | Every 2 hrs |
| **Crushing risk** | Inferred from sow posture + piglet count drop (not directly detected) | Continuous (AI monitors) |

### Days 2–7

| Check | What to look for | Frequency |
|-------|-------------------|-----------|
| **Litter size** | Count piglets daily — any losses? | Daily |
| **Weight gain** | Piglets gaining ~200g/day | Every 2 days |
| **Sow appetite** | Should return to normal by day 2–3 | Daily |
| **Diarrhea** | Scours in piglets (common days 3–5) | Twice daily |
| **Navel health** | Check for infections | Daily |

### Days 7–21 (weaning prep)

| Check | What to look for | Frequency |
|-------|-------------------|-----------|
| **Creep feeding** | Start introducing solid feed | From day 7 |
| **Piglet weight** | Target: 5–7 kg by weaning | Weekly |
| **Sow condition** | Body condition score ≥ 2.5 | Weekly |

---

## 7. Sow Well-Being Checklist

Use this daily checklist for each lactating sow:

```
□ Sow is eating normally
□ Sow is drinking water (minimum 20–40 L/day while lactating in hot climate)
□ No signs of lameness
□ Udder healthy — no hard/hot quarters (mastitis check)
□ Vulva discharge normal color (clear → slightly red)
□ All piglets accounted for
□ All piglets nursing actively
□ No piglet injuries (crushing, biting)
□ Pen clean and dry
□ Creep area warm and draft-free for newborns
□ Adequate ventilation without drafts
```

### Alert triggers (system auto-generates)
The Pig AI Watch system will raise alerts for:
- **Detection anomalies** — sudden drop in piglet count
- **Prolonged inactivity** — sow lying without posture change for >45 minutes
- **Piglet missing** — no piglets visible for >20 minutes (if litter was recorded)
- **Posture alerts** — sow standing excessively (could indicate discomfort)
- **Dystocia risk** — no new piglet for >45 minutes during active farrowing

---

## 8. AI Detection Classes

The ONNX model detects these:

| Class | Code | Meaning |
|-------|------|---------|
| Piglet | `piglet` | Individual piglet detected |
| Sow sleeping | `sow-sleep` | Sow lying down, not lactating |
| Sow lactating | `sow-sleep-lactate` | Sow lying with piglets (lactating posture) |
| Sow standing/feeding | `sow-stand-feed` | Sow at feeder or standing eating |
| Sow standing (lactating) | `sow-stand-lactating` | Lactating sow in standing posture |

### Behavioral insights from detections
- **Lactation frequency**: Track `sow-sleep-lactate` occurrences over time (lactation sessions)
- **Feeding pattern**: Track `sow-stand-feed` — reduced feeding may signal health issues
- **Activity level**: Ratio of standing vs sleeping detections
- **Piglet count**: Number of `piglet` detections per frame (cross-reference with `born_alive`)

---

## 9. API Quick Reference

All endpoints are prefixed with `/api/farrowing`.

### Farrowing Records

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/records?sow_id=X&pen_id=X` | List farrowing records (filterable) |
| `GET` | `/records/{id}` | Get single record |
| `POST` | `/records` | Create new farrowing record |
| `PUT` | `/records/{id}` | Update a record |
| `POST` | `/records/{id}/complete` | Mark farrowing as complete |
| `POST` | `/records/{id}/wean` | Mark sow as weaned (status → weaned) |

### Piglets

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/records/{id}/piglets` | Add piglet to record |
| `GET` | `/piglets/{id}` | Get piglet details |
| `PUT` | `/piglets/{id}` | Update piglet info |
| `POST` | `/piglets/{id}/cross-foster` | Transfer piglet to another sow |

### Statistics & Alerts

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/statistics?pen_id=X` | Get farrowing statistics |
| `GET` | `/due-sows` | List sows nearing their due date |

### Example: Create farrowing record (curl)

```bash
curl -X POST http://localhost:8000/api/farrowing/records \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "sow_id": 4,
    "pen_id": 10,
    "farrowing_started": "2025-01-20T08:30:00",
    "born_alive": 12,
    "stillborn": 1,
    "total_born": 13,
    "notes": "Assisted delivery, sow in good condition"
  }'
```

---

## 10. Troubleshooting

### born_alive shows 0 after recording
**Cause:** Stale Python bytecode cache (`__pycache__`) — the server loaded old code that didn't pass `born_alive` to the database.

**Fix:**
```bash
cd backend
find . -name '__pycache__' -type d -exec rm -rf {} +
# Restart the backend server
lsof -ti:8000 | xargs kill -9
source venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### Sow status stuck on "farrowing"
The system sets status to `farrowing` when a record is created, then to `lactating` automatically. If it gets stuck:
1. Go to the Farrowing tab
2. Use the **Sow Lifecycle Status** buttons to manually set the status
3. Or via API: `PUT /api/sows/{id}` with `{"status": "lactating"}`

### Detection model not loading
1. Ensure the ONNX model file exists at `public/models/pig_detection.onnx`
2. Check browser console for ONNX Runtime errors
3. Try reducing confidence threshold (default: 0.25)

### Farrowing records not appearing
1. Ensure you're viewing the correct pen (Pen 10 for TestPen)
2. Check that the sow is assigned to the pen
3. Refresh the page — data loads on tab switch

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────┐
│           FARROWING QUICK REFERENCE             │
├─────────────────────────────────────────────────┤
│ Gestation period:     114 days (±3 days)        │
│ Normal litter size:   10-14 piglets             │
│ Piglet birth weight:  1.2-1.5 kg avg            │
│   At-risk:            <1.0 kg                   │
│ Weaning age:          21-28 days                │
│ Piglet weight gain:   ~200 g/day                │
│ Sow water intake:     20-40 L/day (lactating,   │
│                       higher in hot climate)     │
│ Creep feed start:     Day 7                     │
│ Full lifecycle:       ~147 days                 │
│   (114 gestation + 21-28 lactation + rest)      │
├─────────────────────────────────────────────────┤
│ STATUS FLOW:                                    │
│ active → pregnant → farrowing → lactating        │
│   → weaned → active                              │
│                                                 │
│ ALERT THRESHOLDS:                               │
│ Inactivity:     >45 min no posture change        │
│ Piglet missing: >20 min no piglets visible       │
│ Dystocia risk:  >45 min no new piglet (active)   │
│ Crushing risk:  sow lying + >50% piglet drop     │
└─────────────────────────────────────────────────┘
```

---

*Last updated: June 2025*
*Pig AI Watch — Farrowing Monitoring System*
