sed -i '' '/## Advanced: Run as a System Service/i\
## Local Edge Recording Mechanics\
The edge node also houses the `recording_worker.py`. This worker no longer records continuously to prevent drive bloat. When the `agent.py` processes an ONNX risk frame with `crushing_risk >= 0.4`, a callback activates the worker to encode a 300-second (5 minute) `ffmpeg` slice out of the RTSP buffer. The files are securely stashed locally on the edge disk. Users download them remotely via the cloud dashboard using `X-Edge-Key` file proxies.\
\
' /Users/arcelmacasling/prisma-atlas/pig-ai-watch/edge/EDGE_SETUP.md
