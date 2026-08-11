import json
import os
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
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
FAIL_FAST_SEC = float(os.getenv("EDGE_PUBLISH_FAIL_FAST_SEC", "12"))
INPUT_THREAD_QUEUE_SIZE = int(os.getenv("EDGE_PUBLISH_THREAD_QUEUE_SIZE", "64"))
TRY_STREAM2_FALLBACK = os.getenv("EDGE_PUBLISH_TRY_STREAM2", "true").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
PREFER_STREAM2 = os.getenv("EDGE_PUBLISH_PREFER_STREAM2", "true").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
ROTATE_SOURCE_ON_DISCONNECT = os.getenv("EDGE_PUBLISH_ROTATE_SOURCE_ON_DISCONNECT", "true").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
FORCE_RE_FOR_ALL_INPUTS = os.getenv("EDGE_PUBLISH_FORCE_RE", "false").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
PUBLISH_CODEC = os.getenv("EDGE_PUBLISH_CODEC", "auto").strip().lower()


def _is_realtime_source(url: str) -> bool:
    lower = url.lower()
    return lower.startswith(("rtsp://", "rtsps://", "rtmp://", "http://", "https://"))


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


def _sanitize_url(url: str) -> str:
    """Hide embedded credentials when logging camera URLs."""
    if "@" not in url or "://" not in url:
        return url

    parsed = urlsplit(url)
    if not parsed.netloc or "@" not in parsed.netloc:
        return url

    creds, host = parsed.netloc.rsplit("@", 1)
    username = creds.split(":", 1)[0] if creds else ""
    masked_user = f"{username}:***" if username else "***"
    return urlunsplit((parsed.scheme, f"{masked_user}@{host}", parsed.path, parsed.query, parsed.fragment))


def _build_source_candidates(local_url: str) -> list[str]:
    """
    Return candidate camera URLs to try.

    For common IP-camera layouts, if source is .../stream1 we also try .../stream2
    so publishing can move to a secondary channel when the primary is in use.
    """
    candidates = [local_url.strip()]

    if not TRY_STREAM2_FALLBACK or not local_url.lower().startswith("rtsp://"):
        return candidates

    parsed = urlsplit(local_url)
    path = parsed.path or ""
    lower_path = path.lower()
    if not lower_path.endswith("/stream1"):
        return candidates

    alt_path = f"{path[:-1]}2"
    alt_url = urlunsplit((parsed.scheme, parsed.netloc, alt_path, parsed.query, parsed.fragment))
    if alt_url == local_url:
        return candidates

    if PREFER_STREAM2:
        return [alt_url, local_url]

    if alt_url not in candidates:
        candidates.append(alt_url)

    return candidates


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
        self._source_candidates = _build_source_candidates(local_url)
        self._source_index = 0
        self._stop_event = threading.Event()

    def stop(self):
        self._stop_event.set()

    def _build_ffmpeg_cmd(self, source_url: str) -> list[str]:
        cloud_url = f"rtsp://{CLOUD_IP}:{RTSP_PORT}/{self.stream_path}"
        cmd = ["ffmpeg", "-y"]
        if source_url.startswith("rtsp://"):
            cmd.extend(
                [
                    "-rtsp_transport",
                    "tcp",
                    "-fflags",
                    "nobuffer",
                    "-flags",
                    "low_delay",
                    "-max_delay",
                    "100000",
                ]
            )

        # -re is useful for file inputs, but it can introduce drift on live RTSP streams.
        if FORCE_RE_FOR_ALL_INPUTS or not _is_realtime_source(source_url):
            cmd.append("-re")

        codec = PUBLISH_CODEC
        if codec == "auto":
            codec = "copy" if source_url.lower().startswith("rtsp://") else "h264"

        if codec == "copy":
            v_flags = ["-c:v", "copy"]
        else:
            v_flags = ["-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-g", "30"]

        cmd.extend(
            [
                "-thread_queue_size",
                str(INPUT_THREAD_QUEUE_SIZE),
                "-i",
                source_url,
                *v_flags,
                "-an",
                "-loglevel",
                "warning",
                "-f",
                "rtsp",
                "-muxdelay",
                "0",
                "-muxpreload",
                "0",
                "-rtsp_transport",
                "tcp",
                cloud_url,
            ]
        )
        return cmd

    def run(self):
        cloud_url = f"rtsp://{CLOUD_IP}:{RTSP_PORT}/{self.stream_path}"
        print(f"[*] Starting proxy: {_sanitize_url(self.local_url)} -> {cloud_url}")
        if len(self._source_candidates) > 1:
            joined = " | ".join(_sanitize_url(url) for url in self._source_candidates)
            print(f"[*] {self.stream_path} input fallback order: {joined}")

        while not self._stop_event.is_set():
            ok, detail = _tcp_port_open(CLOUD_IP, RTSP_PORT, TCP_CHECK_TIMEOUT_SEC)
            if not ok:
                print(
                    f"[!] Cannot reach cloud RTSP {CLOUD_IP}:{RTSP_PORT} ({detail}). "
                    "Check firewall/NAT and MediaMTX listener."
                )
                self._stop_event.wait(PUBLISH_RETRY_SEC)
                continue

            source_url = self._source_candidates[self._source_index]
            try:
                proc = subprocess.Popen(self._build_ffmpeg_cmd(source_url))
            except FileNotFoundError:
                print("[!] ffmpeg command not found. Install ffmpeg and retry.")
                return

            started_at = time.monotonic()

            while proc.poll() is None and not self._stop_event.is_set():
                time.sleep(1)

            if self._stop_event.is_set():
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
                break

            run_sec = time.monotonic() - started_at
            if run_sec < FAIL_FAST_SEC and len(self._source_candidates) > 1:
                prev_source = source_url
                self._source_index = (self._source_index + 1) % len(self._source_candidates)
                next_source = self._source_candidates[self._source_index]
                print(
                    f"[!] {self.stream_path} input failed quickly ({run_sec:.1f}s): "
                    f"{_sanitize_url(prev_source)}"
                )
                print(
                    f"[*] Retrying with alternate source: {_sanitize_url(next_source)} "
                    f"in {PUBLISH_RETRY_SEC}s..."
                )
                self._stop_event.wait(PUBLISH_RETRY_SEC)
                continue

            if run_sec < FAIL_FAST_SEC:
                print(
                    f"[!] {self.stream_path} source failed quickly ({run_sec:.1f}s): "
                    f"{_sanitize_url(source_url)}"
                )
                print(
                    "[!] If this camera allows only one RTSP client, "
                    "run Detection Only mode or map publisher to a secondary substream."
                )

            print(
                f"[!] Stream to {self.stream_path} disconnected. "
                f"Reconnecting in {PUBLISH_RETRY_SEC}s..."
            )

            if ROTATE_SOURCE_ON_DISCONNECT and len(self._source_candidates) > 1:
                self._source_index = (self._source_index + 1) % len(self._source_candidates)
                next_source = self._source_candidates[self._source_index]
                print(f"[*] Next source candidate: {_sanitize_url(next_source)}")

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
