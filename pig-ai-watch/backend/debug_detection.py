#!/usr/bin/env python3
"""
Test script to see ALL detections from the model, including low-confidence ones
"""
import sys
import cv2
import numpy as np
from ultralytics import YOLO

# Test with a demo frame
print("=" * 70)
print("🔍 Testing Model Detection with Different Thresholds")
print("=" * 70)

model_path = "app/models/pig_detection.onnx"
print(f"\n📦 Loading model: {model_path}")

try:
    model = YOLO(model_path)
    print("✅ Model loaded successfully")
    
    # Print available classes
    print(f"\n🏷️  Model Classes: {model.names}")
    
except Exception as e:
    print(f"❌ Error loading model: {e}")
    sys.exit(1)

# Try to load a test image if provided
if len(sys.argv) > 1:
    img_path = sys.argv[1]
    print(f"\n🖼️  Loading image: {img_path}")
    img = cv2.imread(img_path)
    if img is None:
        print(f"❌ Could not load image: {img_path}")
        sys.exit(1)
else:
    print("\n⚠️  No image provided, creating dummy image")
    print("   Usage: python debug_detection.py <image_path>")
    img = np.zeros((640, 640, 3), dtype=np.uint8)

print(f"   Image size: {img.shape}")

# Test with different confidence thresholds
thresholds = [0.1, 0.2, 0.3, 0.4, 0.5]

for conf_threshold in thresholds:
    print(f"\n{'='*70}")
    print(f"🎯 Testing with confidence threshold: {conf_threshold}")
    print(f"{'='*70}")
    
    results = model(img, conf=conf_threshold, verbose=False)
    
    detections_by_class = {}
    total_detections = 0
    
    for result in results:
        boxes = result.boxes
        if boxes is not None:
            for box in boxes:
                cls_id = int(box.cls[0])
                conf = float(box.conf[0])
                class_name = model.names.get(cls_id, f"class_{cls_id}")
                
                if class_name not in detections_by_class:
                    detections_by_class[class_name] = []
                detections_by_class[class_name].append(conf)
                total_detections += 1
    
    print(f"\n📊 Total detections: {total_detections}")
    
    if detections_by_class:
        print("\n🔢 Detections by class:")
        for class_name, confidences in sorted(detections_by_class.items()):
            count = len(confidences)
            avg_conf = sum(confidences) / count
            max_conf = max(confidences)
            min_conf = min(confidences)
            print(f"   {class_name:25} Count: {count:3}  |  Avg: {avg_conf:.1%}  |  Range: {min_conf:.1%} - {max_conf:.1%}")
    else:
        print("   ⚠️  No detections found")

print(f"\n{'='*70}")
print("✅ Testing Complete")
print(f"{'='*70}")
print("\n💡 Recommendation:")
print("   - If sows are detected at lower thresholds, reduce YOLO_CONFIDENCE_THRESHOLD")
print("   - If sows are never detected, the model may need retraining with more sow examples")
