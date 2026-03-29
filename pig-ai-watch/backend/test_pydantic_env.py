import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    firebase: str
    class Config:
        env_file = ".test.env"
        extra = "ignore"
        
print(Settings().firebase)
