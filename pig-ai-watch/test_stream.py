import requests
import sys

URL = "http://129.212.236.192:8000/api/stream/1/status"
resp = requests.get(URL)
print(f"Status check HTTP {resp.status_code}")
print(resp.text)
sys.exit(0)
