sed -i '' '/## 8. Replay & Simulation/i\
## 8a. Smart Edge Recording Schedule\
The Recording Schedule determines when the edge device should monitor for and record high-risk crushing events.\
- **No Continuous Recording**: Recording functions exclusively based on localized crushing risk detections (=>40%) to optimize bandwidth and hard drive capacity.\
- **How to Use**: Drag across the 168-hour calendar cells. Select "Detection Only" (Amber) to arm the Edge device to listen for anomalies, or click "Off" (Gray) to disable tracking during those hours. Changes sync to the Edge nodes autonomously via the backend.\
\
' /Users/arcelmacasling/prisma-atlas/pig-ai-watch/USER_MANUAL.md
