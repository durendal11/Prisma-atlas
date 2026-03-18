#!/usr/bin/env python3
"""
Diagnostic script to verify YOLOv11 model and detector configuration
"""
import sys
import os

print("=" * 70)
print("🔍 YOLO Detector Configuration Diagnostics")
print("=" * 70)

# 1. Check environment variables
print("\n📝 Environment Variables:")
print(f"   YOLO_WEIGHTS_PATH: {os.getenv('YOLO_WEIGHTS_PATH', 'Not set')}")
print(f"   YOLO_CONFIDENCE_THRESHOLD: {os.getenv('YOLO_CONFIDENCE_THRESHOLD', 'Not set')}")

# 2. Check config.py
print("\n⚙️  Configuration File (app/core/config.py):")
try:
    from app.core.config import settings
    print(f"   YOLO_WEIGHTS_PATH: {settings.YOLO_WEIGHTS_PATH}")
    print(f"   YOLO_CONFIDENCE_THRESHOLD: {settings.YOLO_CONFIDENCE_THRESHOLD}")
except Exception as e:
    print(f"   ❌ Error loading config: {e}")
    sys.exit(1)

# 3. Check if ONNX model exists
print("\n📦 Model Files:")
model_paths = [
    "app/models/pig_detection.onnx",
    "pig_detection.onnx",
    "../frontend/public/models/pig_detection.onnx",
]
for path in model_paths:
    if os.path.exists(path):
        size_mb = os.path.getsize(path) / (1024 * 1024)
        print(f"   ✅ {path} ({size_mb:.1f} MB)")
    else:
        print(f"   ❌ {path} (NOT FOUND)")

# 4. Try to load the detector
print("\n🔧 Loading YOLODetector...")
try:
    from app.services.yolo_detector import get_detector
    detector = get_detector()
    print(f"   ✅ Detector loaded successfully")
    print(f"   Model path: {detector.weights_path}")
    print(f"   Confidence threshold: {detector.confidence_threshold}")
    print(f"   Is loaded: {detector.is_loaded()}")
except Exception as e:
    print(f"   ❌ Error loading detector: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# 5. Check model class names
print("\n🏷️  Model Classes (from ONNX):")
try:
    from ultralytics import YOLO
    model = YOLO(detector.weights_path)
    if hasattr(model, 'names'):
        for idx, name in model.names.items():
            print(f"   [{idx}] {name}")
    else:
        print("   ⚠️  No class names found in model")
except Exception as e:
    print(f"   ❌ Error reading model: {e}")

# 6. Check label normalization
print("\n🔄 Label Normalization Test:")
test_labels = ["sow-sleep", "sow-sleep-lactating", "sow-stand-feed", "sow-stand-lactating", "piglet"]
for label in test_labels:
    normalized = detector._normalize_label(label)
    print(f"   '{label}' → '{normalized}'")

# 7. Check posture mapping
print("\n🗺️  Posture Mapping:")
for key, value in detector.POSTURE_MAP.items():
    print(f"   '{key}' → '{value}'")

print("\n" + "=" * 70)
print("✅ Diagnostics Complete!")
print("=" * 70)
