from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=True) # made nullable for google auth
    google_sub = Column(String(255), unique=True, index=True, nullable=True)
    auth_provider = Column(String(50), default="local")
    full_name = Column(String(100))
    role = Column(String(20), default="operator")  # admin, operator, viewer
    fcm_token = Column(String(255), nullable=True) # Firebase Cloud Messaging Token
    language = Column(String(10), default="en")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
