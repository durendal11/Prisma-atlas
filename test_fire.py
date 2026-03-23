# test_fire.py
# Run from project root:
# /Users/arcelmacasling/prisma-atlas/.venv/bin/python test_fire.py

import asyncio
import httpx
import json
from datetime import datetime

BASE_URL = "http://localhost:8000"


# Helpers
async def login(client):
    resp = await client.post(
        f"{BASE_URL}/api/auth/login",
        data={"username": "admin", "password": "admin123"},
    )
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    token = resp.json()["access_token"]
    print("  [OK] Login OK - token acquired")
    return token


def headers(token):
    return {"Authorization": f"Bearer {token}"}


def log_result(name, resp, expect=200):
    ok = resp.status_code == expect
    icon = "[OK]" if ok else "[FAIL]"
    print(f"  {icon} {name}: HTTP {resp.status_code}")
    if not ok:
        print(f"     Response: {resp.text[:200]}")
    else:
        try:
            data = resp.json()
            print(f"     Response: {json.dumps(data, indent=2)[:300]}")
        except Exception:
            pass
    return ok


# Test payloads
def make_behavior_log(
    pen_id=1,
    sow_posture="sleeping",
    piglet_count=6,
    crushing_risk=0.25,
    health_score=70.0,
    movement_level="stationary",
    detection_density=0.22,
    center_x=0.50,
    center_y=0.50,
    spread_radius=0.18,
    piglet_cluster_density=0.33,
    extra_detection_data=None,
):
    detection_data = {
        "center_x": center_x,
        "center_y": center_y,
        "spread_radius": spread_radius,
        "piglet_cluster_density": piglet_cluster_density,
        "sow_bbox": {"x": 180.0, "y": 80.0, "w": 500.0, "h": 820.0},
        "piglet_positions": [
            {"x": 0.18, "y": 0.40},
            {"x": 0.20, "y": 0.55},
            {"x": 0.72, "y": 0.38},
            {"x": 0.74, "y": 0.52},
            {"x": 0.71, "y": 0.65},
            {"x": 0.17, "y": 0.30},
        ],
    }
    if extra_detection_data:
        detection_data.update(extra_detection_data)

    return {
        "pen_id": pen_id,
        "sow_id": None,
        "piglet_count": piglet_count,
        "sow_count": 1,
        "total_detections": piglet_count + 1,
        "sow_posture": sow_posture,
        "posture_confidence": 0.91,
        "is_nursing": sow_posture == "nursing",
        "is_feeding": sow_posture == "feeding",
        "is_sleeping": sow_posture in ("sleeping", "nursing"),
        "activity_level": "nursing" if sow_posture == "nursing" else "resting",
        "crushing_risk": crushing_risk,
        "health_score": health_score,
        "avg_confidence": 0.87,
        "detection_density": detection_density,
        "movement_level": movement_level,
        "cleanliness_score": 0.75,
        "wetness_score": 0.15,
        "detection_data": json.dumps(detection_data),
        "logged_at": datetime.utcnow().isoformat(),
    }


# Individual tests
async def test_auth(client):
    print("\n-- 1. AUTH --------------------------------")
    token = await login(client)
    resp = await client.get(f"{BASE_URL}/api/auth/me", headers=headers(token))
    log_result("GET /api/auth/me", resp)
    return token


async def test_health_score(client, token):
    print("\n-- 2. HEALTH SCORE CHAIN ------------------")

    payload = make_behavior_log(
        sow_posture="nursing",
        crushing_risk=0.15,
        health_score=90.0,
        piglet_count=8,
    )
    resp = await client.post(
        f"{BASE_URL}/api/behavior/log", json=payload, headers=headers(token)
    )
    log_result("POST nursing log (expect health~90)", resp)

    payload = make_behavior_log(
        sow_posture="sleeping",
        crushing_risk=0.72,
        health_score=50.0,
        piglet_count=8,
    )
    resp = await client.post(
        f"{BASE_URL}/api/behavior/log", json=payload, headers=headers(token)
    )
    log_result("POST high-risk log (expect health~50)", resp)

    resp = await client.get(f"{BASE_URL}/api/behavior/analytics/1", headers=headers(token))
    log_result("GET /api/behavior/analytics/1", resp)
    if resp.status_code == 200:
        data = resp.json()
        hs = data.get("avg_health_score")
        print(f"     avg_health_score: {hs}")
        if hs is not None:
            print(f"     {'[OK]' if 50 <= hs <= 95 else '[FAIL]'} Score in expected range 50-95")


async def test_behavior_log_enrichment(client, token):
    print("\n-- 3. BEHAVIOR LOG ENRICHMENT -------------")
    payload = make_behavior_log(
        sow_posture="standing",
        piglet_count=7,
        crushing_risk=0.12,
        center_x=0.48,
        center_y=0.45,
        spread_radius=0.21,
        piglet_cluster_density=0.28,
    )
    resp = await client.post(
        f"{BASE_URL}/api/behavior/log", json=payload, headers=headers(token)
    )
    log_result("POST enriched log (center_x/y, spread_radius)", resp)
    if resp.status_code == 200:
        body = resp.json()
        phase = body.get("nesting_phase")
        print(f"     nesting_phase in response: {phase}")
        print(f"     {'[OK]' if phase else '[FAIL]'} nesting_phase returned")


async def test_nesting_analyzer(client, token):
    print("\n-- 5. NESTING ANALYZER --------------------")
    print("     Sending 10 rapid posture-switching logs to trigger nesting...")

    postures = [
        "standing", "sleeping", "standing", "sitting",
        "standing", "sleeping", "standing", "sitting",
        "standing", "sleeping",
    ]
    for i, posture in enumerate(postures):
        payload = make_behavior_log(
            sow_posture=posture,
            piglet_count=9,
            crushing_risk=0.20,
            movement_level="moderate" if posture == "standing" else "stationary",
        )
        resp = await client.post(
            f"{BASE_URL}/api/behavior/log", json=payload, headers=headers(token)
        )
        phase = resp.json().get("nesting_phase", "?") if resp.status_code == 200 else "ERR"
        print(f"     Log {i+1:02d} posture={posture:<10} -> phase={phase}")

    resp = await client.get(
        f"{BASE_URL}/api/behavior/farrowing-likelihood/1", headers=headers(token)
    )
    log_result("GET farrowing-likelihood/1", resp)
    if resp.status_code == 200:
        data = resp.json()
        score = data.get("score", data.get("farrowing_likelihood", "?"))
        phase = data.get("nesting_phase", "?")
        print(f"     farrowing score: {score}")
        print(f"     nesting phase:   {phase}")


async def test_birth_detector(client, token):
    print("\n-- 6. BIRTH DETECTOR ----------------------")
    print("     Simulating piglet count increasing 1 by 1 (births)...")

    for count in [0, 1, 2, 3]:
        payload = make_behavior_log(
            sow_posture="sleeping",
            piglet_count=count,
            crushing_risk=0.30,
        )
        resp = await client.post(
            f"{BASE_URL}/api/behavior/log", json=payload, headers=headers(token)
        )
        print(f"     piglet_count={count} -> HTTP {resp.status_code}")

    resp = await client.get(
        f"{BASE_URL}/api/alerts?pen_id=1&limit=5", headers=headers(token)
    )
    log_result("GET /api/alerts (check birth_detected)", resp)
    if resp.status_code == 200:
        alerts = resp.json()
        alerts_list = alerts if isinstance(alerts, list) else alerts.get("alerts", [])
        birth_alerts = [a for a in alerts_list if "birth" in str(a).lower()]
        print(f"     birth-related alerts found: {len(birth_alerts)}")
        print(f"     {'[OK]' if birth_alerts else '[WARN] none yet (may need more logs)'}")


async def test_welfare_monitor(client, token):
    print("\n-- 7. PIGLET WELFARE MONITOR --------------")
    print("     Sending 5 stationary logs with high spread (isolation)...")

    for i in range(5):
        payload = make_behavior_log(
            sow_posture="sleeping",
            piglet_count=4,
            crushing_risk=0.20,
            movement_level="stationary",
            detection_density=0.10,
            spread_radius=0.45,
        )
        resp = await client.post(
            f"{BASE_URL}/api/behavior/log", json=payload, headers=headers(token)
        )
        print(f"     Log {i+1} stationary+spread -> HTTP {resp.status_code}")

    resp = await client.get(
        f"{BASE_URL}/api/alerts?pen_id=1&limit=10", headers=headers(token)
    )
    if resp.status_code == 200:
        alerts = resp.json()
        alerts_list = alerts if isinstance(alerts, list) else alerts.get("alerts", [])
        welfare = [a for a in alerts_list if "welfare" in str(a).lower() or "motionless" in str(a).lower()]
        print(f"     welfare alerts found: {len(welfare)}")
        print(f"     {'[OK]' if welfare else '[WARN] none yet (deque needs 5 logs minimum)'}")


async def test_cluster_analyzer(client, token):
    print("\n-- 12. CLUSTER VISIBILITY ANALYZER --------")
    print("     First establishing confirmed_total=11 via birth logs...")

    for count in range(0, 12):
        payload = make_behavior_log(
            sow_posture="sleeping",
            piglet_count=count,
            crushing_risk=0.25,
        )
        await client.post(f"{BASE_URL}/api/behavior/log", json=payload, headers=headers(token))

    print("     Confirmed total set to 11.")
    print("     Now sending 3 nursing logs with only 5 visible (gap=6, ratio=0.54)...")

    for i in range(3):
        payload = make_behavior_log(
            sow_posture="nursing",
            piglet_count=5,
            crushing_risk=0.35,
            detection_density=0.25,
        )
        resp = await client.post(
            f"{BASE_URL}/api/behavior/log", json=payload, headers=headers(token)
        )
        print(f"     Log {i+1} nursing piglet_count=5 -> HTTP {resp.status_code}")

    resp = await client.get(
        f"{BASE_URL}/api/alerts?pen_id=1&limit=10", headers=headers(token)
    )
    if resp.status_code == 200:
        alerts = resp.json()
        alerts_list = alerts if isinstance(alerts, list) else alerts.get("alerts", [])
        cluster = [a for a in alerts_list if "cluster" in str(a).lower() or "piglet check" in str(a).lower()]
        print(f"     cluster_visibility_gap alerts found: {len(cluster)}")
        print(f"     {'[OK]' if cluster else '[WARN] check confirmed_total in BirthDetector'}")


async def test_farrowing_likelihood(client, token):
    print("\n-- 8. FARROWING LIKELIHOOD + NESTING ------")
    resp = await client.get(
        f"{BASE_URL}/api/behavior/farrowing-likelihood/1", headers=headers(token)
    )
    log_result("GET farrowing-likelihood/1", resp)
    if resp.status_code == 200:
        data = resp.json()
        print(f"     score:         {data.get('score', '?')}")
        print(f"     likelihood:    {data.get('likelihood', '?')}")
        print(f"     nesting_phase: {data.get('nesting_phase', 'not in response')}")
        print(f"     components:    {data.get('components', '?')}")


async def test_alerts(client, token):
    print("\n-- ALERTS SUMMARY -------------------------")
    resp = await client.get(
        f"{BASE_URL}/api/alerts?pen_id=1&limit=20", headers=headers(token)
    )
    log_result("GET /api/alerts pen_id=1", resp)
    if resp.status_code == 200:
        alerts = resp.json()
        alerts_list = alerts if isinstance(alerts, list) else alerts.get("alerts", [])
        print(f"     Total alerts for pen 1: {len(alerts_list)}")
        type_counts = {}
        for a in alerts_list:
            t = a.get("alert_type", a.get("type", "unknown"))
            type_counts[t] = type_counts.get(t, 0) + 1
        for t, c in type_counts.items():
            print(f"     {c}x {t}")


async def test_health_summary(client, token):
    print("\n-- HEALTH SUMMARY -------------------------")
    resp = await client.get(f"{BASE_URL}/api/behavior/health-summary", headers=headers(token))
    log_result("GET /api/behavior/health-summary", resp)


async def test_db_detection_data():
    print("\n-- DB: detection_data COLUMN CHECK --------")
    print("     Run this manually against your DB:")
    print()
    print('     docker exec pig-ai-watch-db psql -U postgres -d pig_ai_watch -c "')
    print("     SELECT id, pen_id, sow_posture, piglet_count,")
    print("            LEFT(detection_data, 150) as det_preview,")
    print("            logged_at")
    print("     FROM behavior_logs")
    print("     ORDER BY logged_at DESC LIMIT 5;\"")
    print()
    print("     Look for center_x, nesting_score, nesting_phase in det_preview.")


async def main():
    print("=" * 52)
    print("  PIG AI WATCH - FEATURE TEST FIRE")
    print(f"  {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC")
    print("=" * 52)

    async with httpx.AsyncClient(timeout=30.0) as client:
        token = await test_auth(client)
        if not token:
            print("[FAIL] Cannot continue without auth token.")
            return

        await test_health_score(client, token)
        await test_behavior_log_enrichment(client, token)
        await test_nesting_analyzer(client, token)
        await test_birth_detector(client, token)
        await test_welfare_monitor(client, token)
        await test_cluster_analyzer(client, token)
        await test_farrowing_likelihood(client, token)
        await test_alerts(client, token)
        await test_health_summary(client, token)
        await test_db_detection_data()

    print()
    print("=" * 52)
    print("  TEST FIRE COMPLETE")
    print("  Check [OK]/[FAIL]/[WARN] above for results")
    print("  Run the DB query in the last section")
    print("  to confirm detection_data is populated")
    print("=" * 52)


if __name__ == "__main__":
    asyncio.run(main())
