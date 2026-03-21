import os
import json
import logging
import google.generativeai as genai
from typing import Dict, Any, Optional
from app.core.config import _ENV_FILE

logger = logging.getLogger(__name__)

# Configure the SDK using the API key from environment variables
api_key = os.getenv("GEMINI_API_KEY")

try:
    if not api_key:
        from dotenv import load_dotenv
        load_dotenv(_ENV_FILE)
        api_key = os.getenv("GEMINI_API_KEY")

    if api_key:
        genai.configure(api_key=api_key)
        # the 'gemini-2.5-flash' model is highly suited for quick inferences and supports JSON mode
        model = genai.GenerativeModel('gemini-2.5-flash')
        logger.info("Gemini AI model configured successfully.")
    else:
        logger.warning("GEMINI_API_KEY not found in environment.")
        model = None
except Exception as e:
    logger.warning(f"Failed to configure Gemini AI: {e}")
    model = None

# --- PROMPTS ---

ADVISOR_SYSTEM_PROMPT = """
You are an expert swine veterinary advisor integrated into a real-time pig 
farrowing monitoring system called Pig AI Watch. You receive structured sensor 
data from AI-powered cameras monitoring sow-piglet pairs in farrowing pens.

Your job is to produce a SHORT, plain-language advisory summary for a farmer.
Rules:
- Write for a non-technical farmer. No jargon.
- Lead with the most urgent action first.
- State WHY (brief veterinary rationale).
- Keep it under 120 words.
- If nothing is urgent, say so clearly and briefly.
- Always respond in JSON format.
"""

DIGEST_SYSTEM_PROMPT = """
You are a farm performance analyst for a pig farrowing operation.
Summarize the last 24 hours across all monitored pens into a morning
briefing for the farmer. Be warm but professional. Use plain language
— no technical jargon. Format as a short report the farmer can read
in under 2 minutes.

Structure:
1. Overall status (1 sentence)
2. Highlight: best-performing pen + reason
3. Concern: pen needing attention today + why
4. Upcoming: sows due to farrow in next 48h
5. Recommended tasks for today (max 3 bullets)

Important: Do NOT use placeholders like [Farmer's Name]. Start directly, or use "Hello,".
Ground recommendations in observable data only. Do not speculate.
"""


def _get_digest_prompt(period_label: str = "24 hours") -> str:
    """Return a digest system prompt tailored to the requested analysis window."""
    return f"""
You are a farm performance analyst for a pig farrowing operation.
Summarize the last {period_label} across all monitored pens into a
briefing for the farmer. Be warm but professional. Use plain language
— no technical jargon. Format as a short report the farmer can read
in under 2 minutes.

Structure:
1. Overall status (1 sentence)
2. Highlight: best-performing pen + reason
3. Concern: pen needing attention + why
4. Upcoming: sows due to farrow in next 48h
5. Recommended tasks (max 3 bullets)

Important: Do NOT use placeholders like [Farmer's Name]. Start directly, or use "Hello,".
Ground recommendations in observable data only. Do not speculate.
"""

PUSH_COPY_PROMPT = """
Convert this alert JSON into a push notification. 
Rules:
- Title: max 50 chars, starts with pen name, urgent verb
- Body: max 100 chars, one key fact + one action word
- Tone: calm but urgent for CRITICAL/HIGH, informational for MEDIUM/ROUTINE
- Never use alarming language for ROUTINE alerts
- Always include the pen identifier
- Return ONLY valid JSON format.

Alert raw data:
{alert_json}
"""

TASK_PUSH_PROMPT = """
Convert these pen details and tasks into a concise push notification.
Rules:
- Title: max 50 chars, reference the pen and mention tasks/recommendations.
- Body: max 100 chars, highlight unfinished tasks or recommended actions based on the data.
- Tone: helpful and professional.
- Do NOT use placeholders like [Farmer's Name].
- Return ONLY valid JSON format.

Pen/Task data:
{task_json}
"""

def _period_label(period_hours: int) -> str:
    """Convert hours to a human-readable period label for LLM prompts."""
    if period_hours <= 24:
        return "24 hours"
    elif period_hours <= 168:
        return "7 days"
    else:
        return "30 days"


def _format_window(window_minutes: int) -> str:
    """Convert minutes to a human-readable time window string."""
    if window_minutes <= 60:
        return f"{window_minutes} minutes"
    elif window_minutes <= 1440:
        hours = window_minutes // 60
        return f"{hours} hour{'s' if hours != 1 else ''}"
    else:
        days = window_minutes // 1440
        return f"{days} day{'s' if days != 1 else ''}"


def generate_pen_advisory(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generates a JSON advisory based on pen telemetry data.
    """
    if not model:
        return {"error": "LLM not configured (missing API key or setup failed)."}

    prompt = f"""
    Farm data snapshot for pen {data.get('pen_id', 'Unknown')} — sow {data.get('sow_name', 'Unknown')}:
    Detection window: last {_format_window(data.get('window_minutes', 60))}
    Sow posture distribution: {data.get('posture_distribution', 'N/A')}
    Average / Peak risk: {data.get('avg_risk', 0.0):.2f} / {data.get('peak_risk', 0.0):.2f}
    Piglet count trend: {data.get('piglet_count_trend', 'N/A')}
    Posture transitions (last 30m): {data.get('posture_transitions', 0)}
    Active alerts: {data.get('active_alerts_list', 'None')}
    Lifecycle / Days context: {data.get('lifecycle_stage', 'Unknown')} / {data.get('days_context', 'N/A')}
    Nursing / Motionless events: {data.get('nursing_events', 0)} / {data.get('motionless_events', 0)}
    """
    
    try:
        response = model.generate_content(
            contents=[
                {"role": "user", "parts": [{"text": ADVISOR_SYSTEM_PROMPT}]},
                {"role": "user", "parts": [{"text": prompt}]}
            ],
            # Force the model to return valid JSON with a specific schema
            generation_config=genai.types.GenerationConfig(
                response_mime_type="application/json",
                response_schema={
                    "type": "object",
                    "properties": {
                        "urgency": {"type": "string", "enum": ["critical", "high", "medium", "low"]},
                        "headline": {"type": "string"},
                        "body": {"type": "string"},
                        "recommended_action": {"type": "string"},
                        "source_basis": {"type": "string"}
                    },
                    "required": ["urgency", "headline", "body", "recommended_action", "source_basis"]
                }
            )
        )
        return json.loads(response.text)
    except Exception as e:
        logger.error(f"Failed to generate pen advisory: {e}")
        return {"error": str(e), "urgency": "low", "headline": "Advisory Unavailable"}


def generate_daily_digest(data: Dict[str, Any]) -> str:
    """
    Generates a markdown formatted briefing for the requested time period.
    """
    if not model:
        return "LLM not configured (missing API key or setup failed)."

    period_hours = data.get('period_hours', 24)
    period_label = _period_label(period_hours)

    prompt = f"""
    {period_label} summary across {data.get('pen_count', 0)} pens:
    {data.get('per_pen_summaries', 'No pen data available')}

    Sows due to farrow (within 48h): {data.get('due_sows', 'None')}
    Alerts: {data.get('alert_count', 0)} total (Critical: {data.get('critical_count', 0)}, High: {data.get('high_count', 0)})
    Avg Health: {data.get('avg_health', 'N/A')}/100
    Declining pens: {data.get('declining_pens', 'None')}
    """
    try:
        system_prompt = _get_digest_prompt(period_label)
        response = model.generate_content(
            contents=[
                {"role": "user", "parts": [{"text": system_prompt}]},
                {"role": "user", "parts": [{"text": prompt}]}
            ]
        )
        return response.text # Returns standard text/markdown for the UI
    except Exception as e:
        logger.error(f"Failed to generate daily digest: {e}")
        return f"Error generation digest: {str(e)}"

def generate_push_notification(alert_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generates push notification copy from an alert payload.
    """
    if not model:
        return {
            "title": "New Alert", 
            "body": f"Please check the dashboard for a new alert.", 
            "sound": "default"
        }

    prompt = PUSH_COPY_PROMPT.replace("{alert_json}", json.dumps(alert_data))
    try:
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                response_mime_type="application/json",
                response_schema={
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "body": {"type": "string"},
                        "sound": {"type": "string", "enum": ["default", "urgent"]}
                    },
                    "required": ["title", "body", "sound"]
                }
            )
        )
        return json.loads(response.text)
    except Exception as e:
        logger.error(f"Failed to generate push notification text: {e}")
        return {
            "error": str(e),
            "title": "System Alert",
            "body": "An event was detected, please check your dashboard.",
            "sound": "default"
        }

def generate_task_push_notification(task_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generates push notification copy recommending tasks for a pen.
    """
    if not model:
        return {
            "title": "Task Reminder",
            "body": "Check the dashboard for unfinished tasks.",
            "sound": "default"
        }

    prompt = TASK_PUSH_PROMPT.replace("{task_json}", json.dumps(task_data))
    try:
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                response_mime_type="application/json",
                response_schema={
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "body": {"type": "string"},
                        "sound": {"type": "string", "enum": ["default", "urgent"]}
                    },
                    "required": ["title", "body", "sound"]
                }
            )
        )
        return json.loads(response.text)
    except Exception as e:
        logger.error(f"Failed to generate task push notification text: {e}")
        return {
            "error": str(e),
            "title": "Task Reminder",
            "body": "You have upcoming or unfinished tasks pending.",
            "sound": "default"
        }
