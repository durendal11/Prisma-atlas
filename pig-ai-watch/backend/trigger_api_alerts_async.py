import asyncio
import requests
from app.core.database import AsyncSessionLocal
from app.models.user import User
from app.core.security import create_access_token
from sqlalchemy import select

async def get_token_async():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User))
        user = result.scalars().first()
        if not user:
            return None
        print(f"Creating token for username: {user.username}")
        return create_access_token({"sub": user.username})

def main():
    token = asyncio.run(get_token_async())
    if not token:
        print("No user found in DB. Cannot generate token.")
        return
        
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
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
            "severity": "low",
            "title": "👶 Farrowing Started",
            "message": "The sow in Pen 2 has officially begun the farrowing process.",
            "pen_id": 2,
            "is_read": False,
            "is_resolved": False,
        },
        {
            "type": "piglet_distress",
            "severity": "high",
            "title": "⚠️ Piglet Distress Warning",
            "message": "A piglet has been mostly motionless for over 15 minutes away from the heat lamp in Pen 1.",
            "pen_id": 1,
            "is_read": False,
            "is_resolved": False,
        }
    ]
    
    for alert in alerts_to_test:
        print(f"Triggering {alert['title']} via API...")
        res = requests.post("http://localhost:8000/api/alerts", headers=headers, json=alert)
        print("Status:", res.status_code)
        if res.status_code >= 400:
            print("Error:", res.text)
            
if __name__ == "__main__":
    main()