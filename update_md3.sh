sed -i '' '/## System Architecture/a\
\
### Edge-Assisted Recording\
To optimize localized network bandwidth and preserve hard drive space, continuous recording has been deprecated. CCTV integration is instead bridged via an Edge pipeline:\
1. **CameraWorker:** Captures live OpenCV buffers and runs \`pig_detection.onnx\` locally on edge nodes.\
2. **RecordingWorker:** An asynchronous daemon that listens exclusively for localized high-risk (> 40% crushing likelihood) telemetry drops. When triggered, it spawns a highly compressed 5-minute \`.mp4\` ffmpeg slice stored locally without bloating the main Cloud APIs.\
' /Users/arcelmacasling/prisma-atlas/pig-ai-watch/SYSTEM_MECHANICS.md
