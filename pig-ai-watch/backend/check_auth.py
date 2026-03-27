#!/usr/bin/env python3
"""Diagnostic script to check auth setup on production."""
import asyncio
from passlib.context import CryptContext
import bcrypt
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
import os
import sys

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/pig_ai_watch"
)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Same logic as app/core/security.py"""
    if not plain_password or not hashed_password:
        return False

    # Check for legacy bcrypt hashes
    if hashed_password.startswith(("$2a$", "$2b$", "$2y$")):
        try:
            return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
        except Exception as e:
            print(f"❌ Bcrypt verification failed: {e}")
            return False

    # Check argon2 hashes
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception as e:
        print(f"❌ Argon2 verification failed: {e}")
        return False

async def check_auth():
    print("=" * 60)
    print("🔍 Authentication Diagnostic Check")
    print("=" * 60)
    print(f"Database URL: {DATABASE_URL}")
    print()

    engine = create_async_engine(DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with async_session() as session:
            # Check if users table exists
            result = await session.execute(text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables
                    WHERE table_schema = 'public'
                    AND table_name = 'users'
                )
            """))
            table_exists = result.scalar()

            if not table_exists:
                print("❌ Users table does NOT exist!")
                print("   Run: docker compose --profile seed up seed")
                return

            print("✅ Users table exists")
            print()

            # Get all users
            result = await session.execute(text("""
                SELECT id, username, email, role, is_active,
                       LEFT(hashed_password, 10) as hash_prefix,
                       LENGTH(hashed_password) as hash_length
                FROM users
                ORDER BY id
            """))
            users = result.fetchall()

            if not users:
                print("❌ No users found in database!")
                print("   Run: docker compose --profile seed up seed")
                return

            print(f"Found {len(users)} user(s):")
            print()

            for user in users:
                print(f"User: {user.username}")
                print(f"  Email: {user.email}")
                print(f"  Role: {user.role}")
                print(f"  Active: {user.is_active}")
                print(f"  Hash prefix: {user.hash_prefix}...")
                print(f"  Hash length: {user.hash_length}")

                # Detect hash type
                if user.hash_prefix.startswith(("$2a$", "$2b$", "$2y$")):
                    print(f"  Hash type: bcrypt (legacy)")
                elif user.hash_prefix.startswith("$argon2"):
                    print(f"  Hash type: argon2 (current)")
                else:
                    print(f"  Hash type: unknown")

                # Test password verification for admin user
                if user.username == 'admin':
                    result = await session.execute(text("""
                        SELECT hashed_password FROM users WHERE username = 'admin'
                    """))
                    admin = result.fetchone()

                    if admin:
                        test_password = 'admin123'
                        print(f"  Testing password '{test_password}'...")

                        is_valid = verify_password(test_password, admin.hashed_password)
                        if is_valid:
                            print(f"  ✅ Password verification SUCCESSFUL")
                        else:
                            print(f"  ❌ Password verification FAILED")
                            print(f"     The password 'admin123' does not match the hash")

                print()

    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        import traceback
        traceback.print_exc()

    finally:
        await engine.dispose()

    print("=" * 60)
    print("🔍 Diagnostic complete")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(check_auth())
