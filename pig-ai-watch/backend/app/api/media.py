from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.security import get_current_user
from app.models.user import User
from app.services.cloudinary_service import cloudinary_service


router = APIRouter(prefix="/api/media", tags=["Media"])


class CloudinarySignRequest(BaseModel):
    pen_id: int | None = Field(default=None, ge=1)
    clip_type: str = Field(default="replay", min_length=1, max_length=50)
    resource_type: Literal["video", "image", "raw", "auto"] = "video"
    original_filename: str | None = Field(default=None, max_length=255)


@router.get("/cloudinary/status")
async def get_cloudinary_status(current_user: User = Depends(get_current_user)):
    return {
        "enabled": settings.cloudinary_enabled,
        "cloud_name": settings.CLOUDINARY_CLOUD_NAME if settings.cloudinary_enabled else None,
        "folder": settings.CLOUDINARY_FOLDER,
    }


@router.post("/cloudinary/sign-upload")
async def sign_cloudinary_upload(
    payload: CloudinarySignRequest,
    current_user: User = Depends(get_current_user),
):
    if not settings.cloudinary_enabled:
        raise HTTPException(
            status_code=503,
            detail="Cloudinary integration is not configured",
        )

    signed_payload = cloudinary_service.build_signed_upload_payload(
        pen_id=payload.pen_id,
        clip_type=payload.clip_type,
        resource_type=payload.resource_type,
        original_filename=payload.original_filename,
    )
    return signed_payload