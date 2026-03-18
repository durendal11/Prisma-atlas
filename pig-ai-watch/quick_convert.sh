#!/bin/bash
# Quick Model Conversion Script
# Usage: ./quick_convert.sh path/to/model.pt

set -e

echo "=================================================="
echo "🚀 Quick YOLO to ONNX Converter"
echo "=================================================="
echo ""

# Check if model path provided
if [ -z "$1" ]; then
    echo "❌ Error: No model file specified"
    echo ""
    echo "Usage:"
    echo "  ./quick_convert.sh path/to/model.pt"
    echo ""
    echo "Examples:"
    echo "  ./quick_convert.sh ../best-v11.pt"
    echo "  ./quick_convert.sh /path/to/your/trained_model.pt"
    echo ""
    exit 1
fi

MODEL_PATH="$1"

# Check if file exists
if [ ! -f "$MODEL_PATH" ]; then
    echo "❌ Error: Model file not found: $MODEL_PATH"
    exit 1
fi

# Check if file is .pt
if [[ ! "$MODEL_PATH" =~ \.pt$ ]]; then
    echo "❌ Error: File must be a .pt file"
    echo "   Got: $MODEL_PATH"
    exit 1
fi

echo "✅ Model file found: $MODEL_PATH"
echo ""

# Navigate to backend directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/backend"

echo "🔄 Starting conversion..."
echo ""

# Run conversion
python convert_model_to_onnx.py "$MODEL_PATH"

echo ""
echo "=================================================="
echo "✅ All done!"
echo "=================================================="
echo ""
echo "Next steps:"
echo "  1. Restart your backend server if running"
echo "  2. Refresh your frontend application"
echo "  3. Test detection with the new model"
echo ""
