import asyncio
from app.core.database import AsyncSessionLocal
from app.models.pig import Alert
from app.models.user import User
from app.core.firebase import broadcast_alert
from app.api.websocket import ws_manager

async def trigger_alert(db, alert_data):
    alert = Alert(**alert_data)
    db.add(alert)
    await db.commit()
    await db.refresh(alert)
    
    # Broadcast to FCM clients
    await broadcast_alert(
        title=alert.title,
        body=alert.message,
        alert_type=alert.type,
        pen_id=alert.pen_id,
        severity=alert.severity
    )
    
    # Push to local websockets so UI reacts immediately
    alert_message = {
        "type": "alert",
        "data": {
            "id": alert.id,
            "type": alert.type,
            "severity": alert.severity,
            "title": alert.title,
            "message": alert.message,
            "pen_id": alert.pen_id,
            "timestamp": alert.created_at.isoformat() if alert.created_at else None
        }
    }
    await ws_manager.broadcast(alert_message)
    print(f"Triggered: {alert.title}")

async def main():
    alerts_to_test = [
        {
            "type": "crushing_risk",
            "severity": "critical",
            "title": "🚨 CRITICAL: Crushing Risk",
            "message": "Sow posture indicates immediate danger to nearby piglets in Pen 1.",
            "pen_id": 1,
            "is_read": False,
            "is_resolved": False,
        },
        {
            "type": "farrowing_start",
            "severity": "info",
            "title": "👶 Farrowing Started",
            "message": "The sow in Pen 2 has officially begun the farrowing process.",
            "pen_id": 2,
            "is_read": False,
            "is_resolved": False,
        },
        {
            "type": "piglet_distress",
            "severity": "warning",
            "title": "⚠️ Piglet Distress Warning",
            "message": "A piglet has been mostly motionless for over 15 minutes away from the heat lamp in Pen 1.",
            "pen_id": 1,
            "is_read": False,
            "is_resolved": False,
        }
    ]

    async with AsyncSessionLocal() as db:
        for alert_data in alerts_to_test:
            await trigger_alert(db, alert_data)
            await asyncio.sleep(2)
            
    print("\n✅ All test scenarios dispatched successfully!")

if __name__ == "__main__":
    asyncio.run(main())