# YOLO Model Conversion Guide

This guide explains how to convert your updated YOLO models to ONNX format for deployment in the Pig AI Watch system.

## 📋 Table of Contents
- [Quick Start](#quick-start)
- [Why ONNX?](#why-onnx)
- [System Architecture](#system-architecture)
- [Conversion Process](#conversion-process)
- [Advanced Options](#advanced-options)
- [Troubleshooting](#troubleshooting)

---

## 🚀 Quick Start

### Convert Your Model in 3 Steps:

1. **Place your model** in the root directory:
   ```bash
   # Copy your trained model to the project root
   cp /path/to/your/best-v11.pt /Users/arcelmacasling/prisma-atlas/
   ```

2. **Navigate to backend directory**:
   ```bash
   cd pig-ai-watch/backend
   ```

3. **Run the conversion script**:
   ```bash
   python convert_model_to_onnx.py ../../best-v11.pt
   ```

That's it! The script will:
- ✅ Convert your .pt model to ONNX format
- ✅ Validate the conversion
- ✅ Deploy to all required locations automatically
- ✅ Show you a summary of what was done

---

## 🎯 Why ONNX?

### ONNX Format Benefits:
- **Cross-platform**: Works on web browsers, mobile devices, and servers
- **Performance**: Optimized for inference (faster predictions)
- **Client-side AI**: Enables browser-based detection without server load
- **Standardized**: Works with multiple AI frameworks

### System Requirements:
- **Backend**: Uses PyTorch (.pt) models via Ultralytics YOLO
- **Frontend**: Uses ONNX models for client-side detection
- **Desktop**: Uses ONNX models for offline detection

---

## 🏗️ System Architecture

### Model Locations:

```
pig-ai-watch/
├── backend/
│   ├── app/models/
│   │   └── pig_detection.onnx    # Backend ONNX (optional)
│   ├── models/
│   │   └── pig_detection.pt      # Backend PyTorch (primary)
│   └── convert_model_to_onnx.py  # Conversion script
├── frontend/
│   └── public/
│       └── models/
│           └── pig_detection.onnx    # Web client detection
└── desktop/
    └── frontend-dist/
        └── models/
            └── pig_detection.onnx    # Desktop client detection
```

### Deployment Flow:

```
YOLOv11 Training (.pt)
    ↓
Convert to ONNX
    ↓
    ├─→ Backend (app/models/)
    ├─→ Frontend (public/models/)
    └─→ Desktop (frontend-dist/models/)
```

---

## 📝 Conversion Process

### Basic Usage:

```bash
# Navigate to backend directory
cd pig-ai-watch/backend

# Convert with default settings (recommended)
python convert_model_to_onnx.py path/to/your/model.pt

# Convert with custom output name
python convert_model_to_onnx.py model.pt --output custom_name.onnx
```

### What Happens During Conversion:

1. **Validation**: Checks if input model exists and is valid
2. **Loading**: Loads the YOLO model using Ultralytics
3. **Export**: Converts to ONNX format with optimization
4. **Simplification**: Optimizes the ONNX graph (optional)
5. **Deployment**: Copies to all required locations
6. **Verification**: Shows model info and deployment summary

### Expected Output:

```
============================================================
YOLO to ONNX Converter
============================================================

📂 Input model: best-v11.pt
📏 Image size: 640x640
🔧 Simplify: True
📦 Dynamic batch: False
🔢 ONNX opset: 12

🔄 Loading YOLO model...
✅ Model loaded successfully
   Model type: detect
   Model architecture: YOLOv8DetectionModel

🔄 Converting to ONNX format...
✅ ONNX conversion successful!

============================================================
🚀 Deploying Model
============================================================

✅ Deployed to backend: app/models/pig_detection.onnx
✅ Deployed to frontend: ../frontend/public/models/pig_detection.onnx
✅ Deployed to desktop: ../desktop/frontend-dist/models/pig_detection.onnx

📊 Deployment summary: 3 location(s) updated

============================================================
📋 Model Information
============================================================

📄 File: pig_detection.onnx
💾 Size: 45.23 MB
✨ Format: ONNX

============================================================
🎉 Conversion Complete!
============================================================
```

---

## ⚙️ Advanced Options

### All Command-Line Options:

```bash
python convert_model_to_onnx.py [OPTIONS] input_model.pt
```

| Option | Description | Default |
|--------|-------------|---------|
| `input` | Input YOLO model file (.pt) | Required |
| `--output`, `-o` | Output ONNX file name | `pig_detection.onnx` |
| `--imgsz` | Input image size | `640` |
| `--no-simplify` | Disable ONNX model simplification | Enabled by default |
| `--dynamic` | Enable dynamic batch size | Disabled by default |
| `--opset` | ONNX opset version | `12` |
| `--no-deploy` | Skip automatic deployment | Auto-deploy by default |

### Examples:

#### High-Resolution Model (1280x1280):
```bash
python convert_model_to_onnx.py best-v11.pt --imgsz 1280
```

#### Convert Without Auto-Deployment:
```bash
python convert_model_to_onnx.py best-v11.pt --no-deploy
```

#### Convert for Dynamic Batch Size:
```bash
python convert_model_to_onnx.py best-v11.pt --dynamic
```

#### Convert with Specific ONNX Version:
```bash
python convert_model_to_onnx.py best-v11.pt --opset 14
```

---

## 🔧 Troubleshooting

### Common Issues:

#### 1. "Module 'ultralytics' not found"
```bash
# Install required dependencies
cd backend
pip install -r requirements.txt
```

#### 2. "Input model not found"
```bash
# Check the path to your model
ls -la ../../best-v11.pt

# Use absolute path if needed
python convert_model_to_onnx.py /full/path/to/best-v11.pt
```

#### 3. "Deployment Failed"
```bash
# Check if directories exist
ls -la ../frontend/public/models/
ls -la ../desktop/frontend-dist/models/

# Create directories manually if needed
mkdir -p ../frontend/public/models/
mkdir -p ../desktop/frontend-dist/models/

# Run conversion again
python convert_model_to_onnx.py ../../best-v11.pt
```

#### 4. "Model Export Failed"
```bash
# Try without simplification
python convert_model_to_onnx.py best-v11.pt --no-simplify

# Or with different opset version
python convert_model_to_onnx.py best-v11.pt --opset 11
```

#### 5. Large Model Size
```bash
# Check model size
ls -lh pig_detection.onnx

# For web deployment, consider:
# - Using a smaller model (YOLOv8n instead of YOLOv8x)
# - Quantization (requires additional tools)
# - Pruning during training
```

---

## 📊 Verification

### Test the Converted Model:

#### Backend Test (Python):
```python
from ultralytics import YOLO

# Test ONNX model
model = YOLO('app/models/pig_detection.onnx')
results = model('test_image.jpg')
print(f"Detected {len(results[0].boxes)} objects")
```

#### Frontend Test (Browser Console):
```javascript
// Check if model is loaded
console.log('Model path:', '/models/pig_detection.onnx');

// Model should be accessible from browser
fetch('/models/pig_detection.onnx')
  .then(response => console.log('Model accessible:', response.ok))
  .catch(error => console.error('Model not found:', error));
```

---

## 🔄 Updating Models

### Workflow for New Model Versions:

1. **Train your model** and save as .pt file
2. **Test the .pt model** to ensure it works correctly
3. **Run conversion script**:
   ```bash
   cd pig-ai-watch/backend
   python convert_model_to_onnx.py /path/to/new-model.pt
   ```
4. **Restart services**:
   ```bash
   # Backend
   cd backend
   uvicorn app.main:app --reload
   
   # Frontend (if running dev server)
   cd frontend
   npm run dev
   ```
5. **Verify detection** works in the application

### Version Control:

Consider keeping model versions tracked:
```bash
# Rename with version
python convert_model_to_onnx.py best-v11.pt --output pig_detection_v11.onnx

# Keep a backup of current model
cp frontend/public/models/pig_detection.onnx \
   frontend/public/models/pig_detection_v10_backup.onnx
```

---

## 🎓 Best Practices

1. **Always test .pt model first** before converting
2. **Keep original .pt files** for future reference
3. **Document model versions** in your commit messages
4. **Verify deployment** to all three locations
5. **Test in browser** after frontend deployment
6. **Monitor model size** for web performance
7. **Use consistent image sizes** (640x640 recommended)

---

## 📚 Additional Resources

- [Ultralytics YOLO Documentation](https://docs.ultralytics.com/)
- [ONNX Runtime Documentation](https://onnxruntime.ai/)
- [YOLO Export Formats](https://docs.ultralytics.com/modes/export/)

---

## 💡 Tips

- **Image Size**: 640x640 is optimal for most use cases
- **Model Type**: Ensure your model is trained for detection/segmentation
- **Testing**: Always test with sample images before production
- **Performance**: Smaller models (YOLOv8n) are faster but less accurate
- **Deployment**: The script automatically handles deployment to all locations

---

## 🆘 Need Help?

If you encounter issues:
1. Check this documentation
2. Review the error messages
3. Verify all dependencies are installed
4. Check file paths and permissions
5. Ensure the original .pt model works correctly

---

**Last Updated**: 2026-02-19  
**Script Version**: 1.0.0  
**Compatible with**: YOLOv8, YOLOv11, Ultralytics 8.3.0+
