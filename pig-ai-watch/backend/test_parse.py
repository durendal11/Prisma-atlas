import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    firebase_credentials_json: str

    class Config:
        env_file = ".test.env"

print(Settings().firebase_credentials_json)
