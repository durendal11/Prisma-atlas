"""
Email Alert Sender — SMTP-based notification for critical/high alerts.

Sends an HTML email to all registered users when a high/critical alert fires.
Uses Python's built-in smtplib only — zero additional pip dependencies.

Configure via .env:
    SMTP_ENABLED=True
    SMTP_HOST=smtp.gmail.com
    SMTP_PORT=587
    SMTP_USERNAME=your@email.com
    SMTP_PASSWORD=your_app_password
    SMTP_FROM_EMAIL=your@email.com
    SMTP_FROM_NAME=Pig AI Watch
"""

import asyncio
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)


# Severity levels that trigger email notifications
EMAIL_ALERT_SEVERITIES = {"critical", "high"}


def _build_html_email(
    title: str,
    body: str,
    alert_type: str,
    pen_id: Optional[int],
    severity: str,
) -> str:
    """Build a modern, responsive HTML email for farm alerts."""
    timestamp = datetime.now().strftime("%B %d, %Y · %I:%M %p")
    sev_lower = severity.lower()
    type_lower = alert_type.lower()

    # Theme configuration based on alert type & severity
    if sev_lower == "critical":
        bg_gradient = "linear-gradient(135deg, #dc2626 0%, #991b1b 100%)"
        hdr_bg = "#dc2626"
        badge_bg = "#fef2f2"
        badge_border = "#fecaca"
        badge_text = "#991b1b"
        icon_symbol = "🚨"
        severity_label = "CRITICAL ALERT"
    elif sev_lower == "high":
        bg_gradient = "linear-gradient(135deg, #ea580c 0%, #c2410c 100%)"
        hdr_bg = "#ea580c"
        badge_bg = "#fff7ed"
        badge_border = "#fed7aa"
        badge_text = "#c2410c"
        icon_symbol = "⚠️"
        severity_label = "HIGH PRIORITY ALERT"
    elif sev_lower == "medium":
        bg_gradient = "linear-gradient(135deg, #d97706 0%, #b45309 100%)"
        hdr_bg = "#d97706"
        badge_bg = "#fef3c7"
        badge_border = "#fde68a"
        badge_text = "#b45309"
        icon_symbol = "⚡"
        severity_label = "MEDIUM ALERT"
    else:
        bg_gradient = "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)"
        hdr_bg = "#2563eb"
        badge_bg = "#eff6ff"
        badge_border = "#bfdbfe"
        badge_text = "#1e40af"
        icon_symbol = "ℹ️"
        severity_label = "SYSTEM ADVISORY"

    pen_info = f"Pen #{pen_id}" if pen_id is not None else "All Pens / System"
    app_url = getattr(settings, "APP_URL", "https://prisma-atlas.duckdns.org")
    target_url = f"{app_url}/pen/{pen_id}" if pen_id else f"{app_url}/alerts"

    # Contextual checklist recommendations based on alert type
    if "crushing" in type_lower or "piglet" in type_lower:
        type_title = "PIGLET SAFETY WARNING"
        btn_text = "📹 Open Live Camera & View Pen"
        checklist_items = [
            "Inspect pen immediately to check sow posture and piglet position.",
            "Verify piglets are safely inside the protected creep zone.",
            "Ensure creep heating lamps are active to attract piglets away from sow.",
        ]
    elif "farrowing" in type_lower or "posture" in type_lower or "gestation" in type_lower:
        type_title = "SOW & FARROWING ADVISORY"
        btn_text = "📊 View Sow Farrowing Metrics"
        checklist_items = [
            "Check sow posture and monitor interval between piglet births.",
            "Confirm adequate water supply and bedding condition in pen.",
            "Contact farm supervisor if prolonged recumbency or distress is observed.",
        ]
    else:
        type_title = alert_type.replace("_", " ").upper()
        btn_text = "🖥️ Open Pig AI Watch Dashboard"
        checklist_items = [
            "Log in to Pig AI Watch dashboard to review event telemetry.",
            "Acknowledge or resolve the alert status once addressed.",
        ]

    checklist_html = "".join([
        f'<li style="margin-bottom:8px;color:#374151;font-size:14px;line-height:1.5;">{item}</li>'
        for item in checklist_items
    ])

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);border:1px solid #e2e8f0;">

          <!-- Top Brand Bar -->
          <tr>
            <td style="background-color:#0f172a;padding:16px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="color:#ffffff;font-size:18px;font-weight:800;letter-spacing:-0.02em;">
                      🐷 PIG AI WATCH
                    </span>
                    <span style="color:#94a3b8;font-size:12px;margin-left:8px;font-weight:500;">
                      Farm Monitoring System
                    </span>
                  </td>
                  <td align="right">
                    <span style="background-color:rgba(255,255,255,0.12);color:#e2e8f0;font-size:11px;font-weight:600;padding:4px 10px;border-radius:20px;text-transform:uppercase;">
                      {type_title}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Gradient Alert Header -->
          <tr>
            <td style="background:{bg_gradient};background-color:{hdr_bg};padding:32px 28px;text-align:left;">
              <table cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
                <tr>
                  <td style="background-color:rgba(255,255,255,0.2);padding:4px 12px;border-radius:14px;color:#ffffff;font-size:12px;font-weight:700;letter-spacing:0.05em;">
                    {icon_symbol} {severity_label}
                  </td>
                </tr>
              </table>
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:800;line-height:1.3;letter-spacing:-0.01em;">
                {title}
              </h1>
            </td>
          </tr>

          <!-- Main Content Area -->
          <tr>
            <td style="padding:28px 28px 20px 28px;background-color:#ffffff;">
              <p style="margin:0 0 20px 0;color:#334155;font-size:15px;line-height:1.6;font-weight:400;">
                {body}
              </p>

              <!-- Telemetry Card Grid -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:24px;">
                <tr>
                  <td width="50%" style="padding:16px 20px;border-right:1px solid #e2e8f0;">
                    <span style="color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;display:block;margin-bottom:4px;">
                      📍 Location
                    </span>
                    <strong style="color:#0f172a;font-size:16px;font-weight:700;">
                      {pen_info}
                    </strong>
                  </td>
                  <td width="50%" style="padding:16px 20px;">
                    <span style="color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;display:block;margin-bottom:4px;">
                      🕐 Time Detected
                    </span>
                    <strong style="color:#0f172a;font-size:14px;font-weight:600;">
                      {timestamp}
                    </strong>
                  </td>
                </tr>
              </table>

              <!-- Recommended Action Box -->
              <div style="background-color:{badge_bg};border:1px solid {badge_border};border-radius:12px;padding:20px;margin-bottom:28px;">
                <h3 style="margin:0 0 12px 0;color:{badge_text};font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:0.03em;">
                  📋 Recommended Action Steps:
                </h3>
                <ul style="margin:0;padding-left:20px;">
                  {checklist_html}
                </ul>
              </div>

              <!-- Primary Action CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
                <tr>
                  <td align="center">
                    <a href="{target_url}" target="_blank" style="display:inline-block;background-color:#0f172a;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:10px;box-shadow:0 2px 6px rgba(15,23,42,0.25);">
                      {btn_text}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 28px;background-color:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
              <p style="margin:0 0 6px 0;color:#64748b;font-size:12px;font-weight:500;">
                Pig AI Watch Monitoring & Alert System
              </p>
              <p style="margin:0;color:#94a3b8;font-size:11px;">
                Automated alert notification · Please do not reply directly to this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def _send_emails_blocking(
    recipients: list[str],
    title: str,
    body: str,
    alert_type: str,
    pen_id: Optional[int],
    severity: str,
) -> None:
    """Blocking SMTP send — run this in a thread pool."""
    if not recipients:
        return

    from_addr = settings.SMTP_FROM_EMAIL or settings.SMTP_USERNAME or ""
    subject = f"[{severity.upper()}] {title}"
    html_content = _build_html_email(title, body, alert_type, pen_id, severity)

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.ehlo()
            if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
                smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)

            for recipient in recipients:
                try:
                    msg = MIMEMultipart("alternative")
                    msg["Subject"] = subject
                    msg["From"] = f"{settings.SMTP_FROM_NAME} <{from_addr}>"
                    msg["To"] = recipient
                    msg.attach(MIMEText(body, "plain"))
                    msg.attach(MIMEText(html_content, "html"))
                    smtp.sendmail(from_addr, recipient, msg.as_string())
                    logger.info("Email alert sent to %s: %s", recipient, subject)
                except Exception as e:
                    logger.warning("Failed to send email to %s: %s", recipient, e)

    except smtplib.SMTPException as e:
        logger.error("SMTP error sending alert emails: %s", e)
    except Exception as e:
        logger.error("Unexpected error sending alert emails: %s", e)


async def send_alert_email(
    title: str,
    body: str,
    alert_type: str = "system",
    pen_id: Optional[int] = None,
    severity: str = "high",
) -> None:
    """
    Send an HTML alert email to all registered users.

    Silently no-ops when SMTP is disabled or not configured.
    Only fires for critical/high severity alerts.

    Args:
        title:      Alert title (email subject prefix).
        body:       Alert body text.
        alert_type: Alert type string (e.g. "crushing_risk").
        pen_id:     Pen ID associated with the alert (optional).
        severity:   Alert severity level string.
    """
    # Guard: only send for configured severities
    if severity.lower() not in EMAIL_ALERT_SEVERITIES:
        return

    # Guard: only send when SMTP is explicitly enabled and configured
    if not settings.SMTP_ENABLED:
        return
    if not settings.SMTP_HOST:
        logger.debug("SMTP_HOST not set — skipping email alert")
        return

    # Fetch all user emails from DB
    try:
        from sqlalchemy import select
        from app.core.database import AsyncSessionLocal
        from app.models.user import User

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(User.email).where(
                    User.email.isnot(None),
                    User.is_active == True,
                )
            )
            recipients: list[str] = [row[0] for row in result.fetchall() if row[0]]

        if not recipients:
            logger.debug("No active user emails found — skipping email alert")
            return

        # Send blocking SMTP in thread pool to avoid blocking the event loop
        await asyncio.to_thread(
            _send_emails_blocking,
            recipients,
            title,
            body,
            alert_type,
            pen_id,
            severity,
        )

    except Exception as e:
        logger.error("send_alert_email failed: %s", e)
