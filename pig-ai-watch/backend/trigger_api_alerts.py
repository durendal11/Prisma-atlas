import requests
from app.core.database import SessionLocal
from app.models.user import User
from app.core.security import create_access_token
import datetime
from sqlalchemy import select

def get_token():
    # Provide a simple mock access token for the first user
    db = SessionLocal()
    user = db.query(User).first()
    db.close()
    if not user:
        return None
    return create_access_token({"sub": str(user.id)})

def main():
    token = get_token()
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
    
    for alert in alerts_to_test:
        print(f"Triggering {alert['title']} via API...")
        res = requests.post("http://localhost:8000/api/alerts", headers=headers, json=alert)
        print("Status:", res.status_code)
        if res.status_code >= 400:
            print("Error:", res.text)
            
if __name__ == "__main__":
    main()