import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    test_val: str
        
print("OS GETENV:", os.getenv("TEST_VAL"))
print("PYDANTIC:", Settings().test_val)
