#!/bin/bash
# Restart Backend with New Model Script

echo "============================================"
echo "🔄 Restarting Backend with YOLOv11 Model"
echo "============================================"

# Navigate to backend directory
cd "$(dirname "$0")"

echo ""
echo "✅ Verifying ONNX model deployment..."
if [ -f "app/models/pig_detection.onnx" ]; then
    echo "   ✓ Backend model found: app/models/pig_detection.onnx"
    ls -lh app/models/pig_detection.onnx
else
    echo "   ❌ ERROR: ONNX model not found at app/models/pig_detection.onnx"
    exit 1
fi

echo ""
echo "📋 Testing model class names..."
python test_model_classes.py
if [ $? -ne 0 ]; then
    echo "❌ Model verification failed!"
    exit 1
fi

echo ""
echo "🛑 Stopping existing backend processes..."
# Kill any existing uvicorn processes
pkill -f "uvicorn app.main:app" || echo "   No existing backend processes found"

echo ""
echo "🚀 Starting backend with new configuration..."
echo "   Model: app/models/pig_detection.onnx (YOLOv11)"
echo "   Classes: piglet, sow-sleep, sow-sleep-lactating, sow-stand-feed, sow-stand-lactating"
echo ""

# Check if virtual environment exists
if [ -d "venv" ]; then
    echo "   Using virtual environment..."
    source venv/bin/activate
fi

# Start backend
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

