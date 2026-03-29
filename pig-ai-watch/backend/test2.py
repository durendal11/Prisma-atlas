from fastapi import FastAPI
from fastapi.testclient import TestClient
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from pydantic import BaseModel

app = FastAPI()

class GoogleLoginRequest(BaseModel):
    credential: str

@app.post("/google")
async def google_login(request: GoogleLoginRequest):
    idinfo = id_token.verify_oauth2_token(
        request.credential, 
        google_requests.Request()
    )
    return idinfo

client = TestClient(app)
try:
    response = client.post("/google", json={"credential": "invalid"})
    print(response.status_code, response.text)
except Exception as e:
    print("CRASH!", e)
