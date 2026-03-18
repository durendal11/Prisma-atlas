#!/usr/bin/env python3
"""
YOLO Model to ONNX Converter
Converts PyTorch YOLO models (.pt) to ONNX format for deployment.

Usage:
    python convert_model_to_onnx.py --input best-v11.pt [--output pig_detection.onnx]
    
    Or simply:
    python convert_model_to_onnx.py best-v11.pt
"""

import argparse
import sys
import os
from pathlib import Path
from ultralytics import YOLO
import shutil


def convert_to_onnx(
    input_model: str,
    output_name: str = "pig_detection.onnx",
    imgsz: int = 640,
    simplify: bool = True,
    dynamic: bool = False,
    opset: int = 12
):
    """
    Convert YOLO model to ONNX format.
    
    Args:
        input_model: Path to input .pt model file
        output_name: Name for output ONNX file
        imgsz: Input image size (default: 640)
        simplify: Simplify ONNX model (default: True)
        dynamic: Enable dynamic batch size (default: False)
        opset: ONNX opset version (default: 12)
    
    Returns:
        Path to the generated ONNX file
    """
    print(f"\n{'='*60}")
    print(f"YOLO to ONNX Converter")
    print(f"{'='*60}\n")
    
    # Validate input file
    input_path = Path(input_model)
    if not input_path.exists():
        raise FileNotFoundError(f"Input model not found: {input_model}")
    
    if not input_path.suffix == '.pt':
        raise ValueError(f"Input file must be a .pt file, got: {input_path.suffix}")
    
    print(f"📂 Input model: {input_path}")
    print(f"📏 Image size: {imgsz}x{imgsz}")
    print(f"🔧 Simplify: {simplify}")
    print(f"📦 Dynamic batch: {dynamic}")
    print(f"🔢 ONNX opset: {opset}\n")
    
    # Load YOLO model
    print("🔄 Loading YOLO model...")
    try:
        model = YOLO(str(input_path))
        print(f"✅ Model loaded successfully")
        print(f"   Model type: {model.task}")
        print(f"   Model architecture: {type(model.model).__name__}\n")
    except Exception as e:
        print(f"❌ Failed to load model: {e}")
        sys.exit(1)
    
    # Export to ONNX
    print("🔄 Converting to ONNX format...")
    try:
        # Export returns the path to the exported model
        export_result = model.export(
            format='onnx',
            imgsz=imgsz,
            simplify=simplify,
            dynamic=dynamic,
            opset=opset
        )
        
        # The export creates a file with .onnx extension in the same directory
        generated_onnx = Path(str(input_path).replace('.pt', '.onnx'))
        
        if not generated_onnx.exists():
            raise FileNotFoundError("ONNX export completed but file not found")
        
        print(f"✅ ONNX conversion successful!\n")
        
        # Rename/move to desired output name if different
        final_output = Path(output_name)
        if generated_onnx != final_output:
            print(f"📦 Moving to: {final_output}")
            # Create output directory if it doesn't exist
            final_output.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(generated_onnx), str(final_output))
        
        return final_output
        
    except Exception as e:
        print(f"❌ Conversion failed: {e}")
        sys.exit(1)


def deploy_model(onnx_path: Path, auto_deploy: bool = True):
    """
    Deploy ONNX model to required locations.
    
    Args:
        onnx_path: Path to ONNX model
        auto_deploy: Automatically copy to deployment locations
    """
    if not auto_deploy:
        return
    
    print(f"\n{'='*60}")
    print("🚀 Deploying Model")
    print(f"{'='*60}\n")
    
    # Define deployment locations
    backend_model = Path("app/models/pig_detection.onnx")
    frontend_model = Path("../frontend/public/models/pig_detection.onnx")
    desktop_model = Path("../desktop/frontend-dist/models/pig_detection.onnx")
    
    deployed_count = 0
    
    # Deploy to backend
    if backend_model.parent.exists():
        try:
            backend_model.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(str(onnx_path), str(backend_model))
            print(f"✅ Deployed to backend: {backend_model}")
            deployed_count += 1
        except Exception as e:
            print(f"⚠️  Failed to deploy to backend: {e}")
    
    # Deploy to frontend
    if frontend_model.parent.parent.exists():
        try:
            frontend_model.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(str(onnx_path), str(frontend_model))
            print(f"✅ Deployed to frontend: {frontend_model}")
            deployed_count += 1
        except Exception as e:
            print(f"⚠️  Failed to deploy to frontend: {e}")
    
    # Deploy to desktop
    if desktop_model.parent.parent.exists():
        try:
            desktop_model.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(str(onnx_path), str(desktop_model))
            print(f"✅ Deployed to desktop: {desktop_model}")
            deployed_count += 1
        except Exception as e:
            print(f"⚠️  Failed to deploy to desktop: {e}")
    
    print(f"\n📊 Deployment summary: {deployed_count} location(s) updated")


def print_model_info(onnx_path: Path):
    """Print useful information about the converted model."""
    if not onnx_path.exists():
        return
    
    file_size_mb = onnx_path.stat().st_size / (1024 * 1024)
    
    print(f"\n{'='*60}")
    print("📋 Model Information")
    print(f"{'='*60}\n")
    print(f"📄 File: {onnx_path}")
    print(f"💾 Size: {file_size_mb:.2f} MB")
    print(f"✨ Format: ONNX")
    
    # Try to get more info using onnx library if available
    try:
        import onnx
        model = onnx.load(str(onnx_path))
        print(f"🔢 ONNX IR version: {model.ir_version}")
        print(f"🏷️  Producer: {model.producer_name}")
        print(f"📊 Graph inputs: {len(model.graph.input)}")
        print(f"📊 Graph outputs: {len(model.graph.output)}")
    except ImportError:
        pass
    except Exception:
        pass


def main():
    parser = argparse.ArgumentParser(
        description="Convert YOLO PyTorch models to ONNX format",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Convert with default settings
  python convert_model_to_onnx.py best-v11.pt
  
  # Convert with custom output name
  python convert_model_to_onnx.py best-v11.pt --output my_model.onnx
  
  # Convert without auto-deployment
  python convert_model_to_onnx.py best-v11.pt --no-deploy
  
  # Convert with custom image size
  python convert_model_to_onnx.py best-v11.pt --imgsz 1280
        """
    )
    
    parser.add_argument(
        'input',
        type=str,
        help='Input YOLO model file (.pt)'
    )
    
    parser.add_argument(
        '--output', '-o',
        type=str,
        default='pig_detection.onnx',
        help='Output ONNX file name (default: pig_detection.onnx)'
    )
    
    parser.add_argument(
        '--imgsz',
        type=int,
        default=640,
        help='Input image size (default: 640)'
    )
    
    parser.add_argument(
        '--no-simplify',
        action='store_true',
        help='Disable ONNX model simplification'
    )
    
    parser.add_argument(
        '--dynamic',
        action='store_true',
        help='Enable dynamic batch size'
    )
    
    parser.add_argument(
        '--opset',
        type=int,
        default=12,
        help='ONNX opset version (default: 12)'
    )
    
    parser.add_argument(
        '--no-deploy',
        action='store_true',
        help='Skip automatic deployment to project directories'
    )
    
    args = parser.parse_args()
    
    try:
        # Convert model
        onnx_path = convert_to_onnx(
            input_model=args.input,
            output_name=args.output,
            imgsz=args.imgsz,
            simplify=not args.no_simplify,
            dynamic=args.dynamic,
            opset=args.opset
        )
        
        # Print model info
        print_model_info(onnx_path)
        
        # Deploy model
        deploy_model(onnx_path, auto_deploy=not args.no_deploy)
        
        print(f"\n{'='*60}")
        print("🎉 Conversion Complete!")
        print(f"{'='*60}\n")
        print(f"Your ONNX model is ready: {onnx_path}\n")
        
    except KeyboardInterrupt:
        print("\n\n⚠️  Conversion cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
