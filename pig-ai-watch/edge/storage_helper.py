import os
import shutil
import platform
import logging
from pathlib import Path

logger = logging.getLogger("edge-storage")

def detect_storage() -> tuple[str, int, int]:
    """
    Detect local storage path and return (path, total_bytes, free_bytes)
    Checks LOCAL_STORAGE_PATH env var first, then common mount points.
    Falls back to './local_recordings'.
    """
    # 1. Env Var
    env_path = os.getenv("LOCAL_STORAGE_PATH")
    if env_path:
        p = Path(env_path)
        p.mkdir(parents=True, exist_ok=True)
        total, _, free = shutil.disk_usage(p)
        return str(p), total, free

    # 2. Auto-detect mounted removable
    if platform.system() == "Linux":
        mount_roots = ["/media", "/mnt", "/run/media"]
        for mr in mount_roots:
            mr_path = Path(mr)
            if mr_path.exists():
                for sub in mr_path.iterdir():
                    if sub.is_dir() and os.path.ismount(sub):
                        test_path = sub / "prisma_recordings"
                        try:
                            test_path.mkdir(parents=True, exist_ok=True)
                            total, _, free = shutil.disk_usage(test_path)
                            return str(test_path), total, free
                        except PermissionError:
                            continue
    elif platform.system() == "Windows":
        # Check D: through Z:
        for drive in range(ord('D'), ord('Z')+1):
            drive_path = f"{chr(drive)}:\\"
            if os.path.exists(drive_path):
                test_path = Path(drive_path) / "prisma_recordings"
                try:
                    test_path.mkdir(parents=True, exist_ok=True)
                    total, _, free = shutil.disk_usage(test_path)
                    return str(test_path), total, free
                except (PermissionError, OSError):
                    continue

    # 3. Fallback
    base_dir = Path(__file__).resolve().parent / "local_recordings"
    base_dir.mkdir(parents=True, exist_ok=True)
    total, _, free = shutil.disk_usage(base_dir)
    return str(base_dir), total, free
