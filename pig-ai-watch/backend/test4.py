import json
import os

val = os.getenv("FIREBASE_CREDENTIALS_JSON")
# Since docker-compose loads .env into the container's environment, pydantic gets it from os.environ!
print("Raw env:", repr(val))

