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
    """Build a clean HTML email body for the alert."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    severity_color = {
        "critical": "#dc2626",  # red-600
        "high": "#ea580c",      # orange-600
        "medium": "#d97706",    # amber-600
        "low": "#65a30d",       # lime-600
    }.get(severity.lower(), "#6b7280")

    pen_info = f"Pen {pen_id}" if pen_id is not None else "All Pens"

    return f"""
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border-radius:12px;overflow:hidden;
                      box-shadow:0 2px 8px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:{severity_color};padding:20px 28px;">
              <span style="color:#ffffff;font-size:20px;font-weight:700;">
                🐷 Pig AI Watch — Alert
              </span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px;">
              <p style="margin:0 0 8px;color:#374151;font-size:13px;text-transform:uppercase;
                         letter-spacing:0.05em;font-weight:600;">
                {severity.upper()} · {alert_type.replace("_", " ").title()}
              </p>
              <h2 style="margin:0 0 16px;color:#111827;font-size:20px;">{title}</h2>
              <p style="margin:0 0 24px;color:#4b5563;font-size:15px;line-height:1.6;">{body}</p>

              <table cellpadding="0" cellspacing="0"
                     style="background:#f9fafb;border:1px solid #e5e7eb;
                            border-radius:8px;width:100%;margin-bottom:24px;">
                <tr>
                  <td style="padding:14px 18px;">
                    <span style="color:#6b7280;font-size:13px;">📍 Location</span><br>
                    <strong style="color:#111827;font-size:14px;">{pen_info}</strong>
                  </td>
                  <td style="padding:14px 18px;border-left:1px solid #e5e7eb;">
                    <span style="color:#6b7280;font-size:13px;">🕐 Time</span><br>
                    <strong style="color:#111827;font-size:14px;">{timestamp}</strong>
                  </td>
                </tr>
              </table>

              <p style="margin:0;color:#9ca3af;font-size:12px;">
                This alert was generated automatically by Pig AI Watch.<br>
                Please check the pen and take appropriate action immediately.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:11px;text-align:center;">
                Pig AI Watch Monitoring System &mdash; Do not reply to this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


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
