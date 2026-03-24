#!/usr/bin/env python3
"""Seed script to create default admin user."""
import asyncio
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text

import os
from urllib.parse import quote_plus

# Use argon2 to match the app's security module
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

def _build_database_url() -> str:
    explicit = os.environ.get("DATABASE_URL")
    if explicit:
        return explicit

    db_host = os.environ.get("DB_HOST", "localhost")
    db_port = os.environ.get("DB_PORT", "5432")
    db_user = os.environ.get("DB_USER", "postgres")
    db_password = quote_plus(os.environ.get("DB_PASSWORD", "postgres"))
    db_name = os.environ.get("DB_NAME", "pig_ai_watch")
    return f"postgresql+asyncpg://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"


DATABASE_URL = _build_database_url()

def hash_password(password: str) -> str:
    """Hash a password using argon2."""
    return pwd_context.hash(password)

async def create_admin():
    engine = create_async_engine(DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        # Delete existing admin to recreate with correct hash
        await session.execute(text("DELETE FROM users WHERE username = 'admin'"))
        
        # Create admin user
        hashed_password = hash_password('admin123')
        await session.execute(text('''
            INSERT INTO users (username, email, hashed_password, full_name, role, is_active)
            VALUES (:username, :email, :hashed_password, :full_name, :role, :is_active)
        '''), {
            'username': 'admin',
            'email': 'admin@pigaiwatch.com',
            'hashed_password': hashed_password,
            'full_name': 'Administrator',
            'role': 'admin',
            'is_active': True
        })
        await session.commit()
        print('✅ Admin user created!')
        print('   Username: admin')
        print('   Password: admin123')
    
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(create_admin())
