from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.pig import NotificationSubscription
from app.models.user import User


router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


class NotificationSubscribeRequest(BaseModel):
    device_token: str = Field(min_length=1)
    platform: str = "electron"
    pen_ids: List[int] = Field(default_factory=list)


class NotificationSubscribeResponse(BaseModel):
    status: str
    pen_ids: List[int]


class NotificationUnsubscribeRequest(BaseModel):
    device_token: str = Field(min_length=1)


class NotificationUnsubscribeResponse(BaseModel):
    status: str


@router.post("/subscribe", response_model=NotificationSubscribeResponse)
async def subscribe_notifications(
    payload: NotificationSubscribeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upsert this user's device subscription."""
    result = await db.execute(
        select(NotificationSubscription).where(
            NotificationSubscription.user_id == current_user.id,
            NotificationSubscription.device_token == payload.device_token,
        )
    )
    subscription = result.scalar_one_or_none()

    normalized_pen_ids = sorted({int(pen_id) for pen_id in payload.pen_ids})

    if subscription is None:
        subscription = NotificationSubscription(
            user_id=current_user.id,
            device_token=payload.device_token,
            platform=payload.platform,
            pen_ids=normalized_pen_ids,
        )
        db.add(subscription)
    else:
        subscription.platform = payload.platform
        subscription.pen_ids = normalized_pen_ids
        subscription.updated_at = datetime.utcnow()

    await db.commit()

    return NotificationSubscribeResponse(status="subscribed", pen_ids=normalized_pen_ids)


@router.delete("/unsubscribe", response_model=NotificationUnsubscribeResponse)
async def unsubscribe_notifications(
    payload: NotificationUnsubscribeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete this user's subscription for the given device token."""
    await db.execute(
        delete(NotificationSubscription).where(
            NotificationSubscription.user_id == current_user.id,
            NotificationSubscription.device_token == payload.device_token,
        )
    )
    await db.commit()

    return NotificationUnsubscribeResponse(status="unsubscribed")
