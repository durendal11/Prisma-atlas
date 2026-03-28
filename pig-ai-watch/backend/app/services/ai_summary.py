import logging
from typing import Any, Dict

logger = logging.getLogger(__name__)

def generate_alert_summary(pen_data: dict) -> Dict[str, Any]:
    """Generates a static, deterministic alert summary based on pen data."""
    pen_id = pen_data.get("pen_id", "Unknown")
    sow_name = pen_data.get("sow_name", f"Sow in Pen {pen_id}")
    
    avg_risk = float(pen_data.get("avg_risk", 0.0))
    peak_risk = float(pen_data.get("peak_risk", 0.0))
    danger_zone = int(pen_data.get("danger_zone_count", 0))
    transitions = int(pen_data.get("transition_count", 0))
    nesting_score = float(pen_data.get("nesting_score", 0.0))
    is_farrowing = pen_data.get("is_farrowing", False)
    mins_since = int(pen_data.get("mins_since_piglet", 0))
    motionless = pen_data.get("motionless_piglet_flag", False)
    
    # 1. Critical: Crushing Risk
    if peak_risk >= 0.70 or danger_zone > 0:
        return {
            "priority": "CRITICAL",
            "alert_type": "crushing_risk_critical",
            "headline": f"CRITICAL: Immediate Crushing Risk in Pen {pen_id}",
            "detail": f"{sow_name} recorded a {peak_risk*100:.0f}% crushing risk with {danger_zone} piglets in the danger zone.",
            "recommended_action": "Intervene immediately; check piglet positions near the sow.",
            "evidence_basis": "Weary et al.: most crushing events during sternal-to-lateral roll.",
            "push_title": f"Pen {pen_id} CRUSHING ALERT",
            "push_body": f"Highest risk: {peak_risk*100:.0f}%% - Check {sow_name} immediately.",
            "suppress_until_minutes": 5
        }
    
    # 2. Critical: Dystocia (Prolonged Farrowing)
    if is_farrowing and mins_since > 45:
        return {
            "priority": "CRITICAL",
            "alert_type": "farrowing_interval_critical",
            "headline": f"Dystocia Warning: Prolonged Farrowing Interval",
            "detail": f"It has been {mins_since} minutes since {sow_name} delivered the last piglet.",
            "recommended_action": "Perform a manual vaginal examination to check for obstruction.",
            "evidence_basis": "Merck Veterinary Manual: >45 min = dystocia intervention threshold.",
            "push_title": f"Pen {pen_id} DYSTOCIA",
            "push_body": f"{mins_since}m since last piglet. Intervention required.",
            "suppress_until_minutes": 15
        }
        
    # 3. High: Motionless Piglets
    if motionless:
        return {
            "priority": "HIGH",
            "alert_type": "piglet_welfare_warning",
            "headline": "Motionless Piglet Detected",
            "detail": f"A piglet in Pen {pen_id} has been motionless for an extended period.",
            "recommended_action": "Check the piglet for viability, hypothermia, or crushing.",
            "evidence_basis": "Routine welfare check.",
            "push_title": f"Pen {pen_id} WELFARE",
            "push_body": "Motionless piglet detected. Please inspect.",
            "suppress_until_minutes": 15
        }

    # 4. High: Active Farrowing Preparation / Nesting
    if transitions > 6 or nesting_score >= 0.60:
        return {
            "priority": "HIGH",
            "alert_type": "farrowing_imminent",
            "headline": "Pre-Farrowing Behavior Detected",
            "detail": f"{sow_name} shows high nesting activity ({transitions} posture transitions/30m).",
            "recommended_action": "Prepare farrowing support. Farrowing expected within 12-24 hours.",
            "evidence_basis": "Oliviero et al.: posture transitions >6/30min = strongest pre-farrowing predictor.",
            "push_title": f"Pen {pen_id} NESTING",
            "push_body": f"{sow_name} is exhibiting active pre-farrowing behavior.",
            "suppress_until_minutes": 60
        }

    # Fallback to Routine
    return {
        "priority": "ROUTINE",
        "alert_type": "routine_monitoring",
        "headline": f"Pen {pen_id} is Stable",
        "detail": f"{sow_name} is resting safely. Peak risk: {peak_risk*100:.0f}%.",
        "recommended_action": "Continue remote monitoring.",
        "evidence_basis": "Standard observation.",
        "push_title": f"Pen {pen_id} Status",
        "push_body": "All behaviors normal.",
        "suppress_until_minutes": 60
    }

async def generate_alert_summary_async(pen_data: dict) -> Dict[str, Any]:
    return generate_alert_summary(pen_data)

