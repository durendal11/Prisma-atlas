import json
import os
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

try:
    from dotenv import load_dotenv
except ImportError:
    print("Please install dotenv: pip install python-dotenv")
    sys.exit(1)

load_dotenv(Path(__file__).resolve().parent / ".env")

CLOUD_IP = os.getenv("CLOUD_IP", "134.199.152.118")
RTSP_PORT = int(os.getenv("CLOUD_RTSP_PORT", "8554"))
PUBLISH_RETRY_SEC = int(os.getenv("PUBLISH_RETRY_SEC", "5"))
TCP_CHECK_TIMEOUT_SEC = float(os.getenv("TCP_CHECK_TIMEOUT_SEC", "5"))

CLOUD_API_URL = os.getenv("CLOUD_API_URL", "").rstrip("/")
EDGE_API_KEY = os.getenv("EDGE_API_KEY", "")
CONFIG_REFRESH_SEC = int(os.getenv("EDGE_PUBLISH_CONFIG_REFRESH_SEC", "30"))
HTTP_TIMEOUT_SEC = float(os.getenv("EDGE_PUBLISH_HTTP_TIMEOUT_SEC", "15"))


def _tcp_port_open(host: str, port: int, timeout_sec: float) -> tuple[bool, str]:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(timeout_sec)
    try:
        sock.connect((host, port))
        return True, "ok"
    except Exception as exc:
        return False, str(exc)
    finally:
        sock.close()


def _legacy_env_publishers() -> dict[str, str]:
    publishers: dict[str, str] = {}
    for key, local_url in os.environ.items():
        if key.startswith("FARM_CAM_") and local_url:
            pen_path = key.replace("FARM_CAM_", "pen_").lower()
            publishers[pen_path] = local_url.strip()
    return publishers


def _fetch_cloud_publishers() -> dict[str, str] | None:
    if not CLOUD_API_URL or not EDGE_API_KEY:
        return None

    req = Request(
        f"{CLOUD_API_URL}/api/edge/publisher-config",
        headers={"X-Edge-Key": EDGE_API_KEY},
        method="GET",
    )

    try:
        with urlopen(req, timeout=HTTP_TIMEOUT_SEC) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except HTTPError as exc:
        print(f"[!] Publisher config HTTP error: {exc.code}")
        return None
    except URLError as exc:
        print(f"[!] Publisher config network error: {exc.reason}")
        return None
    except Exception as exc:
        print(f"[!] Publisher config parse error: {exc}")
        return None

    publishers: dict[str, str] = {}
    for item in payload.get("publishers", []):
        stream_path = str(item.get("stream_path") or "").strip().strip("/")
        local_camera_url = str(item.get("local_camera_url") or "").strip()
        if not stream_path or not local_camera_url:
            continue
        publishers[stream_path] = local_camera_url
    return publishers


class PushWorker(threading.Thread):
    def __init__(self, local_url: str, stream_path: str):
        super().__init__(daemon=True)
        self.local_url = local_url
        self.stream_path = stream_path
        self._stop_event = threading.Event()

    def stop(self):
        self._stop_event.set()

    def _build_ffmpeg_cmd(self) -> list[str]:
        cloud_url = f"rtsp://{CLOUD_IP}:{RTSP_PORT}/{self.stream_path}"
        cmd = ["ffmpeg", "-y"]
        if self.local_url.startswith("rtsp://"):
            cmd.extend(["-rtsp_transport", "tcp"])

        cmd.extend(
            [
                "-re",
                "-thread_queue_size",
                "512",
                "-i",
                self.local_url,
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                "-tune",
                "zerolatency",
                "-g",
                "30",
                "-an",
                "-loglevel",
                "warning",
                "-f",
                "rtsp",
                "-rtsp_transport",
                "tcp",
                cloud_url,
            ]
        )
        return cmd

    def run(self):
        cloud_url = f"rtsp://{CLOUD_IP}:{RTSP_PORT}/{self.stream_path}"
        print(f"[*] Starting proxy: {self.local_url} -> {cloud_url}")

        while not self._stop_event.is_set():
            ok, detail = _tcp_port_open(CLOUD_IP, RTSP_PORT, TCP_CHECK_TIMEOUT_SEC)
            if not ok:
                print(
                    f"[!] Cannot reach cloud RTSP {CLOUD_IP}:{RTSP_PORT} ({detail}). "
                    "Check firewall/NAT and MediaMTX listener."
                )
                self._stop_event.wait(PUBLISH_RETRY_SEC)
                continue

            try:
                proc = subprocess.Popen(self._build_ffmpeg_cmd())
            except FileNotFoundError:
                print("[!] ffmpeg command not found. Install ffmpeg and retry.")
                return

            while proc.poll() is None and not self._stop_event.is_set():
                time.sleep(1)

            if self._stop_event.is_set():
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
                break

            print(
                f"[!] Stream to {self.stream_path} disconnected. "
                f"Reconnecting in {PUBLISH_RETRY_SEC}s..."
            )
            self._stop_event.wait(PUBLISH_RETRY_SEC)


def _start_worker(workers: dict[str, PushWorker], stream_path: str, local_url: str):
    worker = PushWorker(local_url=local_url, stream_path=stream_path)
    worker.start()
    workers[stream_path] = worker


def _stop_worker(workers: dict[str, PushWorker], stream_path: str):
    worker = workers.pop(stream_path, None)
    if not worker:
        return
    worker.stop()
    worker.join(timeout=10)


def _sync_workers(workers: dict[str, PushWorker], desired: dict[str, str]):
    for stream_path in list(workers.keys()):
        worker = workers[stream_path]
        next_url = desired.get(stream_path)
        if not next_url or next_url != worker.local_url:
            _stop_worker(workers, stream_path)

    for stream_path, local_url in desired.items():
        if stream_path not in workers:
            _start_worker(workers, stream_path, local_url)


def main():
    print("=== PRISMA ATLAS EDGE HEADLESS PROXY ===")
    print(f"Pushing to Cloud RTSP: {CLOUD_IP}:{RTSP_PORT}")

    workers: dict[str, PushWorker] = {}

    # Backward compatibility: if FARM_CAM_x exists, use legacy static env mode.
    legacy_publishers = _legacy_env_publishers()
    if legacy_publishers:
        print("[*] Using legacy FARM_CAM_x configuration from .env")
        _sync_workers(workers, legacy_publishers)
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("Shutting down...")
        finally:
            for stream_path in list(workers.keys()):
                _stop_worker(workers, stream_path)
        return

    if not CLOUD_API_URL or not EDGE_API_KEY:
        print("No FARM_CAM_x variables found in .env.")
        print("Set CLOUD_API_URL and EDGE_API_KEY to use cloud-driven camera publisher config.")
        return

    print(f"Cloud API: {CLOUD_API_URL}")
    print(f"Config refresh interval: {CONFIG_REFRESH_SEC}s")

    waiting_logged = False
    try:
        while True:
            desired_publishers = _fetch_cloud_publishers()
            if desired_publishers is not None:
                _sync_workers(workers, desired_publishers)

            if not workers and not waiting_logged:
                print("[*] Waiting for cloud publisher config from camera setup...")
                waiting_logged = True
            elif workers:
                waiting_logged = False

            time.sleep(CONFIG_REFRESH_SEC)
    except KeyboardInterrupt:
        print("Shutting down...")
    finally:
        for stream_path in list(workers.keys()):
            _stop_worker(workers, stream_path)

if __name__ == "__main__":
    main()
