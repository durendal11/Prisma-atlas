from __future__ import annotations

from datetime import datetime
import re
import time

import cloudinary
from cloudinary.utils import api_sign_request

from app.core.config import settings


class CloudinaryService:
    def __init__(self) -> None:
        self._configured = False

    @property
    def is_enabled(self) -> bool:
        return settings.cloudinary_enabled

    def configure(self) -> None:
        if self._configured or not self.is_enabled:
            return
        cloudinary.config(
            cloud_name=settings.CLOUDINARY_CLOUD_NAME,
            api_key=settings.CLOUDINARY_API_KEY,
            api_secret=settings.CLOUDINARY_API_SECRET,
            secure=settings.CLOUDINARY_SECURE,
        )
        self._configured = True

    def upload_url(self, resource_type: str = "video") -> str:
        cloud_name = settings.CLOUDINARY_CLOUD_NAME
        if not cloud_name:
            raise ValueError("Cloudinary is not configured")
        return f"https://api.cloudinary.com/v1_1/{cloud_name}/{resource_type}/upload"

    def sign_upload_params(self, params: dict[str, str | int]) -> str:
        if not settings.CLOUDINARY_API_SECRET:
            raise ValueError("Cloudinary API secret is not configured")
        return api_sign_request(params, settings.CLOUDINARY_API_SECRET)

    def build_folder(self, pen_id: int | None = None, clip_type: str = "replay") -> str:
        base = settings.CLOUDINARY_FOLDER.strip("/")
        clip_part = self._slugify(clip_type) or "replay"
        if pen_id is None:
            return f"{base}/{clip_part}"
        return f"{base}/pen_{pen_id}/{clip_part}"

    def build_public_id(self, pen_id: int | None, clip_type: str, original_filename: str | None) -> str:
        timestamp = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
        base_name = "clip"
        if original_filename:
            raw = original_filename.rsplit(".", 1)[0]
            base_name = self._slugify(raw) or "clip"
        pen_part = f"pen{pen_id}" if pen_id is not None else "penX"
        clip_part = self._slugify(clip_type) or "replay"
        return f"{pen_part}_{clip_part}_{timestamp}_{base_name}"

    def build_signed_upload_payload(
        self,
        pen_id: int | None,
        clip_type: str,
        resource_type: str,
        original_filename: str | None,
    ) -> dict[str, str | int]:
        self.configure()

        timestamp = int(time.time())
        folder = self.build_folder(pen_id=pen_id, clip_type=clip_type)
        public_id = self.build_public_id(
            pen_id=pen_id,
            clip_type=clip_type,
            original_filename=original_filename,
        )

        context_parts = [f"app=PigAIWatch", f"clip_type={clip_type}"]
        if pen_id is not None:
            context_parts.append(f"pen_id={pen_id}")
        context = "|".join(context_parts)
        tags = ["pig-ai-watch", f"clip-{self._slugify(clip_type) or 'replay'}"]
        if pen_id is not None:
            tags.append(f"pen-{pen_id}")

        sign_params: dict[str, str | int] = {
            "timestamp": timestamp,
            "folder": folder,
            "public_id": public_id,
            "context": context,
            "tags": ",".join(tags),
        }

        signature = self.sign_upload_params(sign_params)

        return {
            "cloud_name": settings.CLOUDINARY_CLOUD_NAME or "",
            "api_key": settings.CLOUDINARY_API_KEY or "",
            "timestamp": timestamp,
            "folder": folder,
            "public_id": public_id,
            "context": context,
            "tags": ",".join(tags),
            "signature": signature,
            "resource_type": resource_type,
            "upload_url": self.upload_url(resource_type=resource_type),
        }

    @staticmethod
    def _slugify(value: str) -> str:
        value = value.strip().lower()
        value = re.sub(r"[^a-z0-9_-]+", "-", value)
        value = re.sub(r"-+", "-", value)
        return value.strip("-")


cloudinary_service = CloudinaryService()