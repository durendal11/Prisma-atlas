sed -i '' '/## 7. Live Multi-Camera Monitoring/i\
## 6b. Advanced Local Edge Recording\
Instead of continuous cloud recording, the system utilizes "Smart Edge Recording". Video chunking runs natively on edge devices and triggers **only** when crushing risk spikes (>= 40%) are detected by the dual-pipeline ONNX YOLO worker. \
- **Local Storage:** Chunks (.mp4) are saved directly on the edge, bypassing heavy cloud/VRAM bandwidth.\
- **UI Gating:** Frontend continuous recording functionality has been deprecated explicitly in favor of "Detection Only" to maximize disk retention dynamically.\
' /Users/arcelmacasling/prisma-atlas/pig-ai-watch/SYSTEM_OVERVIEW.md
