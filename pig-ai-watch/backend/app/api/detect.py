from fastapi import APIRouter, Depends, File, UploadFile, Form, HTTPException, status, Query
from fastapi.responses import JSONResponse
from app.core.security import get_current_user, verify_token
from app.models.user import User
from app.services.yolo_detector import YOLODetector
from typing import Optional
import numpy as np
import cv2
import base64

router = APIRouter(prefix="/api/detect", tags=["Detection"])

# Global detector instance
detector = YOLODetector()


@router.post("/frame")
async def detect_frame(
    file: UploadFile = File(...),
    pen_id: str = Query(default="1"),
    token: Optional[str] = Query(default=None),
):
    """
    Process a single frame and return detection results with segmentation masks.
    Accepts image file upload and returns YOLO detection results.
    """
    # Verify authentication
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required"
        )
    
    username = verify_token(token)
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )
    
    # Load model if not already loaded
    if not detector.is_loaded():
        detector.load_model()
    
    try:
        # Read the uploaded image
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid image data"
            )
        
        # Run detection
        result = detector.process_frame(img)
        
        # Draw detections on the frame (with segmentation masks if available)
        annotated_frame = draw_detections_with_masks(img, result, detector)
        
        # Encode as base64
        _, buffer = cv2.imencode('.jpg', annotated_frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        frame_base64 = base64.b64encode(buffer).decode('utf-8')
        
        return {
            "piglet_count": result.piglet_count,
            "sow_posture": result.sow_posture,
            "crushing_risk": round(result.crushing_risk, 2),
            "bounding_boxes": [
                {
                    "class_name": bbox.get("raw_label", bbox["label"]),
                    "confidence": bbox["confidence"],
                    "bbox": [bbox["x"], bbox["y"], bbox["width"], bbox["height"]]
                }
                for bbox in result.bounding_boxes
            ],
            "annotated_frame": frame_base64
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Detection failed: {str(e)}"
        )


def draw_detections_with_masks(frame: np.ndarray, result, detector: YOLODetector) -> np.ndarray:
    """Draw bounding boxes, segmentation masks, and labels on the frame."""
    annotated = frame.copy()
    h, w = frame.shape[:2]
    
    # Colors for different classes (BGR format)
    colors = {
        "piglet": (0, 255, 255),           # Yellow
        "pig": (0, 255, 255),              # Yellow
        "sow_standing": (0, 255, 0),       # Green
        "sow_lying_lateral": (0, 100, 255),# Dark Orange
        "sow_lying_sternal": (0, 165, 255),# Orange
        "sow_sitting": (255, 255, 0),      # Cyan
        "sow_nursing": (255, 0, 255),      # Magenta
    }
    
    # Draw segmentation masks if available
    masks = getattr(detector, '_last_masks', [])
    if masks and len(masks) > 0:
        overlay = annotated.copy()
        for i, mask in enumerate(masks):
            if i < len(result.bounding_boxes):
                bbox = result.bounding_boxes[i]
                label = bbox["label"]
                color = colors.get(label, (128, 128, 128))
                
                # Resize mask to frame size
                mask_resized = cv2.resize(mask.astype(np.float32), (w, h))
                mask_binary = (mask_resized > 0.5).astype(np.uint8)
                
                # Apply colored mask
                colored_mask = np.zeros_like(annotated)
                colored_mask[:] = color
                mask_3ch = np.stack([mask_binary] * 3, axis=-1)
                overlay = np.where(mask_3ch, 
                    cv2.addWeighted(overlay, 0.5, colored_mask, 0.5, 0), 
                    overlay)
        
        # Blend overlay with original
        annotated = cv2.addWeighted(annotated, 0.6, overlay, 0.4, 0)
    
    # Draw bounding boxes and labels
    for bbox in result.bounding_boxes:
        x = int(bbox["x"])
        y = int(bbox["y"])
        bw = int(bbox["width"])
        bh = int(bbox["height"])
        label = bbox["label"]
        raw_label = bbox.get("raw_label", label)
        conf = bbox["confidence"]
        
        # Get color for this class
        color = colors.get(label, (128, 128, 128))
        
        # Draw bounding box
        cv2.rectangle(annotated, (x, y), (x + bw, y + bh), color, 2)
        
        # Draw label background
        label_text = f"{raw_label}: {conf:.0%}"
        (text_w, text_h), baseline = cv2.getTextSize(
            label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1
        )
        cv2.rectangle(
            annotated, 
            (x, y - text_h - baseline - 5), 
            (x + text_w + 5, y), 
            color, 
            -1
        )
        
        # Draw label text
        cv2.putText(
            annotated, 
            label_text, 
            (x + 2, y - baseline - 2),
            cv2.FONT_HERSHEY_SIMPLEX, 
            0.5, 
            (0, 0, 0), 
            1
        )
    
    # Draw stats overlay with background
    stats_text = [
        f"Piglets: {result.piglet_count}",
        f"Posture: {result.sow_posture.replace('_', ' ')}",
        f"Risk: {result.crushing_risk:.0%}",
    ]
    
    # Draw semi-transparent background for stats
    stats_bg_height = len(stats_text) * 28 + 15
    cv2.rectangle(annotated, (5, 5), (180, stats_bg_height), (0, 0, 0), -1)
    cv2.rectangle(annotated, (5, 5), (180, stats_bg_height), (255, 255, 255), 1)
    
    y_offset = 30
    for text in stats_text:
        # White text with black outline for visibility
        cv2.putText(annotated, text, (12, y_offset), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)
        cv2.putText(annotated, text, (10, y_offset), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
        y_offset += 25
    
    # Draw risk indicator bar
    risk_color = (0, 255, 0)  # Green
    if result.crushing_risk > 0.3:
        risk_color = (0, 165, 255)  # Orange
    if result.crushing_risk > 0.6:
        risk_color = (0, 0, 255)  # Red
    
    bar_y = y_offset + 5
    cv2.rectangle(annotated, (10, bar_y), (170, bar_y + 15), (50, 50, 50), -1)
    cv2.rectangle(annotated, (10, bar_y), (int(10 + 160 * result.crushing_risk), bar_y + 15), risk_color, -1)
    cv2.rectangle(annotated, (10, bar_y), (170, bar_y + 15), (255, 255, 255), 1)
    
    return annotated
