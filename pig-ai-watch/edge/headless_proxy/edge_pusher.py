import os
import sys
import time
import subprocess
import threading
try:
    from dotenv import load_dotenv
except ImportError:
    print("Please install dotenv: pip install python-dotenv")
    sys.exit(1)

load_dotenv()

CLOUD_IP = os.getenv("CLOUD_IP", "134.199.152.118")

def push_stream(local_url, pen_path):
    cloud_url = f"rtsp://{CLOUD_IP}:8554/{pen_path}"
    print(f"[*] Starting proxy: {local_url} -> {cloud_url}")
    
    cmd = ["ffmpeg", "-y"]
    
    # Only add RTSP specific flags for input if it's an RTSP stream
    if local_url.startswith("rtsp://"):
        cmd.extend(["-rtsp_transport", "tcp"])
        
    cmd.extend([
        "-re", # Read input at native frame rate (important for files)
        "-i", local_url,
        "-c:v", "libx264", # Transcode or copy. Using x264 ensures compatibility.
        "-preset", "ultrafast",
        "-tune", "zerolatency",
        "-an",
        "-f", "rtsp",
        "-rtsp_transport", "tcp",
        cloud_url
    ])
    
    while True:
        try:
            # check=False prevents it from throwing an exception if ffmpeg exits
            subprocess.run(cmd, check=False)
            print(f"[!] Stream to {pen_path} disconnected. Reconnecting in 5s...")
            time.sleep(5)
        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"Error: {e}")
            time.sleep(5)

def main():
    print(f"=== PRISMA ATLAS EDGE HEADLESS PROXY ===")
    print(f"Pushing to Cloud IP: {CLOUD_IP}")
    
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
