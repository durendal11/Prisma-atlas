import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class S(BaseSettings):
    model_config = SettingsConfigDict(env_file="test.env")
    FIREBASE_CREDENTIALS_JSON: str = ""

with open("test.env", "w") as f:
    f.write("FIREBASE_CREDENTIALS_JSON='{\n  \"type\": \"service_account\"\n}'\n")

print(S().FIREBASE_CREDENTIALS_JSON)
