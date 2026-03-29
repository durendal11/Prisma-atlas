import os
import sys
import time
import socket
import subprocess
import threading
try:
    from dotenv import load_dotenv
except ImportError:
    print("Please install dotenv: pip install python-dotenv")
    sys.exit(1)

load_dotenv()

CLOUD_IP = os.getenv("CLOUD_IP", "134.199.152.118")
RTSP_PORT = int(os.getenv("CLOUD_RTSP_PORT", "8554"))
PUBLISH_RETRY_SEC = int(os.getenv("PUBLISH_RETRY_SEC", "5"))
TCP_CHECK_TIMEOUT_SEC = float(os.getenv("TCP_CHECK_TIMEOUT_SEC", "5"))


def _tcp_port_open(host: str, port: int, timeout_sec: float) -> tuple[bool, str]:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(timeout_sec)
    try:
        s.connect((host, port))
        return True, "ok"
    except Exception as exc:
        return False, str(exc)
    finally:
        s.close()

def push_stream(local_url, pen_path):
    cloud_url = f"rtsp://{CLOUD_IP}:{RTSP_PORT}/{pen_path}"
    print(f"[*] Starting proxy: {local_url} -> {cloud_url}")
    
    cmd = ["ffmpeg", "-y"]
    
    # Only add RTSP specific flags for input if it's an RTSP stream
    if local_url.startswith("rtsp://"):
        cmd.extend(["-rtsp_transport", "tcp"])
        
    cmd.extend([
        "-re",  # Read input at native frame rate (important for files)
        "-thread_queue_size", "512",
        "-i", local_url,
        "-c:v", "libx264",  # Transcode to maximize cloud RTSP compatibility.
        "-preset", "ultrafast",
        "-tune", "zerolatency",
        "-g", "30",
        "-an",
        "-loglevel", "warning",
        "-f", "rtsp",
        "-rtsp_transport", "tcp",
        cloud_url
    ])
    
    while True:
        try:
            ok, detail = _tcp_port_open(CLOUD_IP, RTSP_PORT, TCP_CHECK_TIMEOUT_SEC)
            if not ok:
                print(
                    f"[!] Cannot reach cloud RTSP {CLOUD_IP}:{RTSP_PORT} ({detail}). "
                    "Check firewall/NAT and MediaMTX listener."
                )
                time.sleep(PUBLISH_RETRY_SEC)
                continue

            # check=False prevents it from throwing an exception if ffmpeg exits
            subprocess.run(cmd, check=False)
            print(f"[!] Stream to {pen_path} disconnected. Reconnecting in {PUBLISH_RETRY_SEC}s...")
            time.sleep(PUBLISH_RETRY_SEC)
        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"Error: {e}")
            time.sleep(PUBLISH_RETRY_SEC)

def main():
    print(f"=== PRISMA ATLAS EDGE HEADLESS PROXY ===")
    print(f"Pushing to Cloud RTSP: {CLOUD_IP}:{RTSP_PORT}")
    
    threads = []
    
    # Check env vars for FARM_CAM_1=rtsp://...
    for key, local_url in os.environ.items():
        if key.startswith("FARM_CAM_"):
            pen_path = key.replace("FARM_CAM_", "pen_").lower()
            t = threading.Thread(target=push_stream, args=(local_url, pen_path), daemon=True)
            t.start()
            threads.append(t)
            time.sleep(1) # stagger starts
            
    if not threads:
        print("No FARM_CAM_x variables found in .env! Please create a .env file with your local cameras.")
        return
        
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("Shutting down...")

if __name__ == "__main__":
    main()
