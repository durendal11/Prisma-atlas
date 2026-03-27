from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import timedelta
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

from app.core.database import get_db
from app.core.security import (
    verify_password, 
    get_password_hash, 
    create_access_token,
    get_current_user
)
from app.core.config import settings
from app.models.user import User
from app.schemas.user import (
    UserCreate, 
    UserResponse, 
    Token, 
    LoginRequest,
    GoogleLoginRequest
)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/login", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    """Authenticate user and return JWT token."""
    result = await db.execute(
        select(User).where(User.username == form_data.username)
    )
    user = result.scalar_one_or_none()
    
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is disabled"
        )
    
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, 
        expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/google", response_model=Token)
async def google_login(
    request: GoogleLoginRequest,
    db: AsyncSession = Depends(get_db)
):
    """Authenticate or register user using Google ID token."""
    try:
        # Verify the token with Google
        # Note: In production you should pass your specific CLIENT_ID to verify
        # id_token.verify_oauth2_token(token, google_requests.Request(), YOUR_CLIENT_ID)
        idinfo = id_token.verify_oauth2_token(
            request.credential, 
            google_requests.Request()
        )

        email = idinfo.get('email')
        name = idinfo.get('name')
        
        if not email:
            raise ValueError("Token didn't contain an email")

    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check if user exists
    result = await db.execute(
        select(User).where(User.email == email)
    )
    user = result.scalar_one_or_none()

    # If user doesn't exist, we register them automatically
    if not user:
        # Create a safe base username from email
        base_username = email.split('@')[0]
        username = base_username
        
        # Ensure username uniqueness
        counter = 1
        while True:
            existing = await db.execute(select(User).where(User.username == username))
            if not existing.scalar_one_or_none():
                break
            username = f"{base_username}{counter}"
            counter += 1

        # Create new user via Google
        new_user = User(
            username=username,
            email=email,
            hashed_password=get_password_hash("google-auth-random-pass-unusable"),
            full_name=name,
            role="operator" # Automatically assign operator role
        )
        db.add(new_user)
        await db.commit()
        await db.refresh(new_user)
        user = new_user

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is disabled"
        )
    
    # Generate standard JWT for our app
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, 
        expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/register", response_model=UserResponse)
async def register(
    user_data: UserCreate,
    db: AsyncSession = Depends(get_db)
):
    """Register a new user."""
    # Check if username exists
    result = await db.execute(
        select(User).where(User.username == user_data.username)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered"
        )
    
    # Check if email exists
    result = await db.execute(
        select(User).where(User.email == user_data.email)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create user
    hashed_password = get_password_hash(user_data.password)
    new_user = User(
        username=user_data.username,
        email=user_data.email,
        hashed_password=hashed_password,
        full_name=user_data.full_name,
        role=user_data.role
    )
    
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    
    return new_user


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_user)
):
    """Get current authenticated user info."""
    return current_user
