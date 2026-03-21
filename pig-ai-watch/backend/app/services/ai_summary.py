import json
import logging
import os
import importlib
from typing import Any, Dict

logger = logging.getLogger(__name__)

_GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"

_SYSTEM_PROMPT = """
You are a Precision Livestock Farming advisor for a pig farrowing
monitoring system in the Philippines. You receive aggregated behavioral
data from AI vision detection and produce structured, actionable summaries.

Your summaries must:
- Be concise and action-oriented (max 2 sentences per alert)
- Reference the specific observation that triggered the alert
- Recommend one concrete action grounded in veterinary best practice
- Indicate urgency: CRITICAL / HIGH / MEDIUM / ROUTINE

Scientific grounding you must reference where applicable:
- Weary et al.: most crushing events during sternal-to-lateral roll
- Oliviero et al. (2010, Livestock Science): posture transitions >6/30min
  = strongest pre-farrowing predictor; active nesting = ~12h window
- Jensen (1993, Applied Animal Behaviour Science): rooting/nesting
  onset 12-24h pre-farrowing in confined sows
- Merck Veterinary Manual: normal inter-piglet interval 15-20 min;
  >45 min = dystocia intervention threshold
- Quesnel et al. (J. Animal Science): piglets nurse 20-30 times/day;
  colostrum window = first hour post-birth

Return ONLY valid JSON — no preamble, no markdown, no backticks:
{
  "pen_id": number,
  "priority": "CRITICAL" | "HIGH" | "MEDIUM" | "ROUTINE",
  "alert_type": string,
  "headline": string (max 60 chars),
  "detail": string (max 200 chars, includes metric + threshold),
  "recommended_action": string (max 150 chars),
  "evidence_basis": string (study cited),
  "push_title": string (max 50 chars, starts with pen name),
  "push_body": string (max 100 chars),
  "suppress_until_minutes": number
}
""".strip()


def _fallback(pen_id: Any) -> Dict[str, Any]:
    return {
        "priority": "ROUTINE",
        "headline": "Summary unavailable",
        "push_title": f"Pen {pen_id}",
        "push_body": "Check dashboard for details",
        "suppress_until_minutes": 60,
    }


def _strip_markdown_fences(text: str) -> str:
    cleaned = (text or "").strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()
    return cleaned


def _build_user_prompt(pen_data: dict) -> str:
    return (
        f"Pen: {pen_data.get('pen_id')} | Sow: {pen_data.get('sow_name')} | Stage: {pen_data.get('lifecycle_stage')}\n"
        f"Window: last {pen_data.get('window_minutes')} min ({pen_data.get('log_count')} observations)\n\n"
        "Behavioral data:\n"
        f"- Dominant posture: {pen_data.get('dominant_posture')} ({float(pen_data.get('posture_pct', 0.0)):.2f}% of window)\n"
        f"- Posture transitions: {pen_data.get('transition_count')} (>6/30min = pre-farrowing signal)\n"
        f"- Nursing events: {pen_data.get('nursing_count')}\n"
        f"- Feeding events: {pen_data.get('feeding_count')}\n"
        f"- Avg crushing risk: {float(pen_data.get('avg_risk', 0.0)):.2f} (peak: {float(pen_data.get('peak_risk', 0.0)):.2f})\n"
        f"- Piglets in danger zone: {pen_data.get('danger_zone_count')}\n"
        f"- Active farrowing: {pen_data.get('is_farrowing')}\n"
        f"- Minutes since last piglet: {pen_data.get('mins_since_piglet')}\n"
        f"- Nesting score: {float(pen_data.get('nesting_score', 0.0)):.2f} / phase: {pen_data.get('nesting_phase')}\n"
        f"- Motionless piglet flag: {pen_data.get('motionless_piglet_flag')}\n"
        f"- Anomalies: {pen_data.get('anomalies')}\n\n"
        "Generate the most important single alert for this pen right now."
    )


async def generate_alert_summary(pen_data: dict) -> dict:
    pen_id = pen_data.get("pen_id", "Unknown")
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.warning("GEMINI_API_KEY not set; returning fallback summary.")
        return _fallback(pen_id)

    user_prompt = _build_user_prompt(pen_data)

    payload = {
        "system_instruction": {
            "parts": [{"text": _SYSTEM_PROMPT}],
        },
        "contents": [
            {
                "role": "user",
                "parts": [{"text": user_prompt}],
            }
        ],
        "generationConfig": {
            "maxOutputTokens": 1000,
            "temperature": 0.2,
        },
    }

    try:
        httpx = importlib.import_module("httpx")
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                _GEMINI_API_URL,
                params={"key": api_key},
                json=payload,
            )
            response.raise_for_status()
            data = response.json()

        candidates = data.get("candidates") or []
        if not candidates:
            logger.error("Gemini returned no candidates: %s", data)
            return _fallback(pen_id)

        parts = (((candidates[0] or {}).get("content") or {}).get("parts") or [])
        text = "\n".join(part.get("text", "") for part in parts if isinstance(part, dict)).strip()
        if not text:
            logger.error("Gemini candidate has no text parts: %s", candidates[0])
            return _fallback(pen_id)

        cleaned = _strip_markdown_fences(text)
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return parsed

        logger.error("Gemini output is not a JSON object: %s", cleaned)
        return _fallback(pen_id)
    except Exception as exc:
        logger.error("Failed to generate alert summary: %s", exc)
        return _fallback(pen_id)
