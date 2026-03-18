# Model Conversion Quick Reference

## ✨ Super Quick Method

From the `pig-ai-watch` directory:

```bash
./quick_convert.sh ../best-v11.pt
```

## 📝 Standard Method

From the `backend` directory:

```bash
python convert_model_to_onnx.py /path/to/your/model.pt
```

## 📚 Full Documentation

See [../MODEL_CONVERSION_GUIDE.md](../MODEL_CONVERSION_GUIDE.md) for:
- Detailed explanations
- Advanced options
- Troubleshooting
- Best practices

## 🎯 What It Does

1. Converts your `.pt` model to ONNX format
2. Automatically deploys to:
   - Backend: `app/models/pig_detection.onnx`
   - Frontend: `../frontend/public/models/pig_detection.onnx`
   - Desktop: `../desktop/frontend-dist/models/pig_detection.onnx`
3. Validates and shows you a summary

## 💡 Common Options

```bash
# Custom output name
python convert_model_to_onnx.py model.pt --output custom.onnx

# Higher resolution (1280x1280)
python convert_model_to_onnx.py model.pt --imgsz 1280

# Skip auto-deployment
python convert_model_to_onnx.py model.pt --no-deploy

# See all options
python convert_model_to_onnx.py --help
```

## ✅ Your Current Model

- **File**: `pig_detection.onnx` (36.14 MB)
- **Source**: YOLOv11s from `best-v11.pt`
- **Input size**: 640x640
- **Format**: ONNX (opset 12)
- **Deployed**: Backend, Frontend, Desktop
- **Last updated**: 2026-02-19
