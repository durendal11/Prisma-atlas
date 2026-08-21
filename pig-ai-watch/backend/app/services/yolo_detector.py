import cv2
import numpy as np
from ultralytics import YOLO
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime
import json
import asyncio
from app.core.config import settings
from app.services.piglet_clump_detector import PigletClumpDetector, ClumpAnalysis
import logging

logger = logging.getLogger(__name__)


@dataclass
class DetectionResult:
    piglet_count: int
    sow_posture: str
    crushing_risk: float
    bounding_boxes: List[Dict[str, Any]]
    confidence_scores: List[float]
    processing_time_ms: float
    timestamp: datetime
    # Clump analysis metadata (for smart crushing detection)
    clump_analysis: Optional[ClumpAnalysis] = None
    likely_actual_piglet_count: int = 0
    piglet_overlap_pairs: int = 0
    clump_near_sow: bool = False


class YOLODetector:
    """YOLO-based pig detection and posture analysis."""
    
    # Class labels for pig detection model
    CLASS_LABELS = {
        0: "piglet",
        1: "sow_standing",
        2: "sow_lying_lateral",
        3: "sow_lying_sternal",
        4: "sow_sitting",
        5: "sow_nursing"
    }
    
    POSTURE_MAP = {
        "sow_standing": "standing",
        "sow_lying_lateral": "lying_lateral",
        "sow_lying_sternal": "lying_sternal",
        "sow_sitting": "sitting",
        "sow_nursing": "lactating",
        # YOLOv11 new class names
        "sow_sleep": "sleeping",
        "sow_sleep_lactating": "sleeping_lactating",
        "sow_stand_feed": "standing_feeding",
        "sow_stand_lactating": "standing_lactating"
    }
    
    def __init__(self, weights_path: Optional[str] = None):
        self.weights_path = weights_path or settings.YOLO_WEIGHTS_PATH
        self.model: Optional[YOLO] = None
        self.confidence_threshold = settings.YOLO_CONFIDENCE_THRESHOLD
        self._loaded = False
        self._last_masks = []  # Store masks from last detection for drawing
        self._is_segmentation = False  # Track if model is segmentation type
        self._clump_detector = PigletClumpDetector()
        
    def load_model(self) -> bool:
        """Load the YOLO model weights."""
        try:
            # Try to load custom weights, fall back to pre-trained if not available
            try:
                self.model = YOLO(self.weights_path)
                logger.info(f"Loaded custom YOLO weights from {self.weights_path}")
                # Check if it's a segmentation model
                model_task = getattr(self.model, 'task', None)
                self._is_segmentation = model_task == 'segment'
                logger.info(f"Model task type: {model_task}, is_segmentation: {self._is_segmentation}")
            except Exception:
                # Fall back to YOLOv8n for demo/testing
                self.model = YOLO("yolov8n.pt")
                logger.warning("Custom weights not found, using YOLOv8n for demo")
            
            self._loaded = True
            return True
        except Exception as e:
            logger.error(f"Failed to load YOLO model: {e}")
            return False
    
    def is_loaded(self) -> bool:
        return self._loaded
    
    def _normalize_label(self, raw_label: str) -> str:
        """Normalize model labels to our standard format."""
        label_lower = raw_label.lower().replace(" ", "_").replace("-", "_")
        
        # Map common variations
        label_map = {
            "pig": "piglet",
            "piglet": "piglet",
            "sow": "sow_standing",
            "sow_standing": "sow_standing",
            "sow_lying": "sow_lying_lateral",
            "sow_lying_lateral": "sow_lying_lateral",
            "sow_lying_sternal": "sow_lying_sternal",
            "sow_sitting": "sow_sitting",
            "sow_nursing": "sow_nursing",
            "standing": "sow_standing",
            "lying": "sow_lying_lateral",
            "sitting": "sow_sitting",
            "nursing": "sow_nursing",
            # YOLOv11 new class mappings
            "sow_sleep": "sow_sleep",
            "sow_sleep_lactating": "sow_sleep_lactating",
            "sow_stand_feed": "sow_stand_feed",
            "sow_stand_lactating": "sow_stand_lactating",
        }
        
        # Check exact match first
        if label_lower in label_map:
            return label_map[label_lower]
        
        # Check partial matches
        for key, value in label_map.items():
            if key in label_lower:
                return value
        
        return raw_label

    def filter_boxes_by_roi(
        self,
        bounding_boxes: List[Dict[str, Any]],
        roi_points: Optional[List[List[float]]],
        frame_shape: tuple,
    ) -> List[Dict[str, Any]]:
        """
        Remove bounding boxes whose centroid falls outside the ROI polygon.

        Args:
            bounding_boxes: List of bbox dicts with x, y, width, height keys.
            roi_points:     Normalized [[x, y], ...] ratios (0.0–1.0). None = no filter.
            frame_shape:    (height, width, channels) from frame.shape.

        Returns:
            Filtered list of bounding boxes.
        """
        if not roi_points or len(roi_points) < 3:
            return bounding_boxes  # No valid polygon → keep all boxes

        h, w = frame_shape[:2]
        # Convert normalized coords to pixel coords
        polygon = np.array(
            [[int(pt[0] * w), int(pt[1] * h)] for pt in roi_points],
            dtype=np.int32,
        )

        filtered = []
        for bbox in bounding_boxes:
            cx = bbox["x"] + bbox["width"] / 2
            cy = bbox["y"] + bbox["height"] / 2
            # pointPolygonTest: positive → inside, zero → on edge, negative → outside
            result = cv2.pointPolygonTest(polygon, (float(cx), float(cy)), False)
            if result >= 0:  # inside or on boundary
                filtered.append(bbox)

        discarded = len(bounding_boxes) - len(filtered)
        if discarded:
            logger.debug(f"ROI filter: discarded {discarded} box(es) outside polygon")
        return filtered
    
    def process_frame(
        self,
        frame: np.ndarray,
        roi_points: Optional[List[List[float]]] = None,
    ) -> DetectionResult:
        """Process a single frame and return detection results.
        Handles both detection and segmentation models.

        Args:
            frame:      Raw video frame (numpy array).
            roi_points: Optional normalized [[x,y],...] polygon. Detections outside
                        the polygon are discarded before any counting/alert logic.
        """
        start_time = cv2.getTickCount()
        
        if not self._loaded:
            self.load_model()
        
        # Run inference
        results = self.model(frame, conf=self.confidence_threshold, verbose=False)
        
        piglet_count = 0
        sow_posture = "unknown"
        bounding_boxes = []
        confidence_scores = []
        piglet_boxes = []
        sow_box = None
        masks_data = []  # Store masks for segmentation models
        
        for result in results:
            boxes = result.boxes
            masks = getattr(result, 'masks', None)  # Segmentation masks if available
            
            # Get class names from the model if available
            model_names = getattr(result, 'names', None) or self.CLASS_LABELS
            
            if boxes is not None:
                for i, box in enumerate(boxes):
                    cls_id = int(box.cls[0])
                    conf = float(box.conf[0])
                    xyxy = box.xyxy[0].cpu().numpy()
                    
                    # Map class ID to label - use model's own class names if available
                    if isinstance(model_names, dict):
                        raw_label = model_names.get(cls_id, f"class_{cls_id}")
                    else:
                        raw_label = self.CLASS_LABELS.get(cls_id, f"class_{cls_id}")
                    
                    # Normalize label for our system
                    label = self._normalize_label(raw_label)
                    
                    # Debug logging
                    logger.debug(f"Detection: raw='{raw_label}' → normalized='{label}' (conf={conf:.2f})")
                    
                    bbox = {
                        "x": float(xyxy[0]),
                        "y": float(xyxy[1]),
                        "width": float(xyxy[2] - xyxy[0]),
                        "height": float(xyxy[3] - xyxy[1]),
                        "label": label,
                        "raw_label": raw_label,
                        "confidence": conf
                    }
                    
                    # Store mask data if available (for segmentation models)
                    if masks is not None and i < len(masks.data):
                        mask = masks.data[i].cpu().numpy()
                        bbox["has_mask"] = True
                        masks_data.append(mask)
                    else:
                        bbox["has_mask"] = False
                    
                    bounding_boxes.append(bbox)
                    confidence_scores.append(conf)
                    
                    # Count piglets (flexible matching)
                    if "piglet" in label.lower() or "pig" in label.lower():
                        piglet_count += 1
                        piglet_boxes.append(xyxy)
                    
                    # Detect sow posture (take highest confidence sow detection)
                    if "sow" in label.lower() or label.startswith("sow_"):
                        posture = self.POSTURE_MAP.get(label, label)
                        if sow_box is None or conf > sow_box[1]:
                            sow_posture = posture
                            sow_box = (xyxy, conf)
        
        # Store masks for drawing later
        self._last_masks = masks_data

        # ── ROI Polygon Filter ────────────────────────────────────────────
        # Discard bounding boxes outside the configured pen polygon.
        bounding_boxes = self.filter_boxes_by_roi(bounding_boxes, roi_points, frame.shape)
        # Re-derive masks_data to stay aligned after filtering (keep only matching masks)
        # (masks_data is already indexed by bbox position; filtering by centroid is sufficient)

        # Re-calculate piglet_count and sow_posture from filtered boxes
        piglet_count = 0
        sow_posture = "unknown"
        piglet_boxes = []
        sow_box = None
        confidence_scores = [float(b["confidence"]) for b in bounding_boxes]

        for bbox in bounding_boxes:
            label = bbox["label"]
            conf = bbox["confidence"]
            xyxy = np.array([bbox["x"], bbox["y"], bbox["x"] + bbox["width"], bbox["y"] + bbox["height"]])

            if "piglet" in label.lower() or "pig" in label.lower():
                piglet_count += 1
                piglet_boxes.append(xyxy)

            if "sow" in label.lower() or label.startswith("sow_"):
                posture = self.POSTURE_MAP.get(label, label)
                if sow_box is None or conf > sow_box[1]:
                    sow_posture = posture
                    sow_box = (xyxy, conf)


        if bounding_boxes:
            class_counts = {}
            for bbox in bounding_boxes:
                raw = bbox['raw_label']
                class_counts[raw] = class_counts.get(raw, 0) + 1
            logger.info(f"  By class (post-ROI): {class_counts}")
        
        # ── Clump analysis ─────────────────────────────────────────────
        # Build piglet/sow box dicts for the clump detector
        piglet_box_dicts = [
            {"x": float(b["x"]), "y": float(b["y"]),
             "width": float(b["width"]), "height": float(b["height"]),
             "confidence": float(b["confidence"])}
            for b in bounding_boxes
            if "piglet" in b["label"].lower() or "pig" in b["label"].lower()
        ]
        sow_box_dict = None
        if sow_box is not None:
            sow_xyxy = sow_box[0]
            sow_box_dict = {
                "x": float(sow_xyxy[0]), "y": float(sow_xyxy[1]),
                "width": float(sow_xyxy[2] - sow_xyxy[0]),
                "height": float(sow_xyxy[3] - sow_xyxy[1]),
                "confidence": float(sow_box[1]),
            }

        clump = self._clump_detector.analyze(
            piglet_box_dicts,
            sow_box=sow_box_dict,
            sow_posture=sow_posture,
        )

        # Calculate crushing risk (now clump-aware)
        crushing_risk = self._calculate_crushing_risk(
            sow_posture, sow_box, piglet_boxes, frame.shape, clump
        )
        
        # Calculate processing time
        end_time = cv2.getTickCount()
        processing_time_ms = (end_time - start_time) / cv2.getTickFrequency() * 1000
        
        return DetectionResult(
            piglet_count=piglet_count,
            sow_posture=sow_posture,
            crushing_risk=crushing_risk,
            bounding_boxes=bounding_boxes,
            confidence_scores=confidence_scores,
            processing_time_ms=processing_time_ms,
            timestamp=datetime.utcnow(),
            clump_analysis=clump,
            likely_actual_piglet_count=clump.likely_actual_count,
            piglet_overlap_pairs=clump.overlap_pair_count,
            clump_near_sow=clump.cluster_near_sow,
        )
    
    def _calculate_crushing_risk(
        self, 
        sow_posture: str, 
        sow_box: Optional[Tuple], 
        piglet_boxes: List[np.ndarray],
        frame_shape: Tuple[int, int, int],
        clump: Optional[ClumpAnalysis] = None,
    ) -> float:
        """Calculate the risk of piglet crushing based on positions, postures, and clump analysis.
        
        Enhanced with clump awareness:
        - Merged/oversized piglet boxes contribute higher risk (hidden piglets)
        - Dense clusters near sow add a clumping risk modifier
        - Piglet-piglet overlap signals reduce the per-box proximity penalty
          (since overlapping boxes are likely double-counting the same piglet)
        """
        
        if not piglet_boxes or sow_box is None:
            return 0.0
        
        risk = 0.0
        sow_xyxy = sow_box[0]
        
        # Base risk by posture
        posture_risk = {
            "standing": 0.1,
            "sitting": 0.2,
            "lying_sternal": 0.3,
            "lying_lateral": 0.5,  # Highest risk when lying on side
            "lactating": 0.4,
            "unknown": 0.2,
            # YOLOv11 new posture risks
            "sleeping": 0.6,  # High risk
            "sleeping_lactating": 0.7,  # Very high risk - sow sleeping while lactating
            "standing_feeding": 0.15,  # Very low risk - sow is standing and eating
            "standing_lactating": 0.3,  # Moderate risk - sow standing but lactating
        }
        risk = posture_risk.get(sow_posture, 0.2)
        
        # Calculate proximity risk
        sow_center = np.array([
            (sow_xyxy[0] + sow_xyxy[2]) / 2,
            (sow_xyxy[1] + sow_xyxy[3]) / 2
        ])
        
        threshold = settings.PIGLET_PROXIMITY_THRESHOLD
        danger_zone_margin = 30  # pixels
        
        resting_nursing_postures = {
            "nursing", "lactating", "sleeping", "sleeping_lactating",
            "lying_lateral", "lying_sternal"
        }
        is_resting_nursing = sow_posture in resting_nursing_postures

        # ── Detect oversized (merged) piglet boxes via area analysis ──
        piglet_areas = []
        for pb in piglet_boxes:
            w = max(0.0, float(pb[2] - pb[0]))
            h = max(0.0, float(pb[3] - pb[1]))
            piglet_areas.append(w * h)

        median_piglet_area = 0.0
        if len(piglet_areas) >= 2:
            sorted_areas = sorted(piglet_areas)
            mid = len(sorted_areas) // 2
            median_piglet_area = (
                sorted_areas[mid] if len(sorted_areas) % 2 == 1
                else (sorted_areas[mid - 1] + sorted_areas[mid]) / 2
            )

        # ── Compute piglet-piglet IoU to detect overlapping detections ─
        overlap_indices = set()  # indices of piglets involved in overlaps
        for i in range(len(piglet_boxes)):
            for j in range(i + 1, len(piglet_boxes)):
                # Quick IoU check between piglet boxes
                pi, pj = piglet_boxes[i], piglet_boxes[j]
                ix1 = max(float(pi[0]), float(pj[0]))
                iy1 = max(float(pi[1]), float(pj[1]))
                ix2 = min(float(pi[2]), float(pj[2]))
                iy2 = min(float(pi[3]), float(pj[3]))
                iw = max(0.0, ix2 - ix1)
                ih = max(0.0, iy2 - iy1)
                inter = iw * ih
                union = piglet_areas[i] + piglet_areas[j] - inter
                iou = inter / union if union > 0 else 0.0
                if iou >= 0.25:
                    overlap_indices.add(i)
                    overlap_indices.add(j)
        
        for idx, piglet_box in enumerate(piglet_boxes):
            piglet_center = np.array([
                (piglet_box[0] + piglet_box[2]) / 2,
                (piglet_box[1] + piglet_box[3]) / 2
            ])
            
            # Check if piglet is within sow's bounding box (danger zone)
            in_danger_zone = (
                sow_xyxy[0] - danger_zone_margin <= piglet_center[0] <= sow_xyxy[2] + danger_zone_margin and
                sow_xyxy[1] - danger_zone_margin <= piglet_center[1] <= sow_xyxy[3] + danger_zone_margin
            )
            
            if in_danger_zone:
                # Compute piglet inclusion ratio inside sow box
                p_w = max(0.0, float(piglet_box[2] - piglet_box[0]))
                p_h = max(0.0, float(piglet_box[3] - piglet_box[1]))
                p_area = p_w * p_h
                
                inter_x1 = max(float(sow_xyxy[0]), float(piglet_box[0]))
                inter_y1 = max(float(sow_xyxy[1]), float(piglet_box[1]))
                inter_x2 = min(float(sow_xyxy[2]), float(piglet_box[2]))
                inter_y2 = min(float(sow_xyxy[3]), float(piglet_box[3]))
                
                inter_w = max(0.0, inter_x2 - inter_x1)
                inter_h = max(0.0, inter_y2 - inter_y1)
                inter_area = inter_w * inter_h
                
                inclusion_ratio = inter_area / p_area if p_area > 0 else 0.0
                is_on_top = is_resting_nursing and inclusion_ratio >= 0.80
                
                # Check if this is a merged/oversized box
                is_merged = (
                    median_piglet_area > 0 and
                    p_area >= median_piglet_area * 1.8
                )

                # Reduce risk contribution if this box overlaps with another
                # piglet (likely double-counting the same piglet body)
                is_overlapping = idx in overlap_indices

                distance = np.linalg.norm(sow_center - piglet_center)
                if is_on_top:
                    # Piglet is resting/nursing on top of sow - minimal risk contribution
                    proximity_factor = max(0, 1 - distance / 200)
                    risk = min(1.0, risk + proximity_factor * 0.05)
                elif is_overlapping:
                    # Overlapping detection — reduced contribution to avoid
                    # inflating risk from fragmented/duplicate detections
                    proximity_factor = max(0, 1 - distance / 200)
                    risk = min(1.0, risk + proximity_factor * 0.10)
                elif is_merged:
                    # Merged box: likely contains multiple piglets under/near sow
                    # Higher risk because hidden piglets may be crushed
                    proximity_factor = max(0, 1 - distance / 200)
                    risk = min(1.0, risk + proximity_factor * 0.35)
                else:
                    # Standard individual piglet near sow perimeter
                    proximity_factor = max(0, 1 - distance / 200)
                    risk = min(1.0, risk + proximity_factor * 0.3)

        # ── Clump-near-sow risk modifier ──────────────────────────────
        if clump and clump.cluster_near_sow and is_resting_nursing:
            # Dense cluster near a resting/nursing sow adds baseline risk
            # because hidden piglets in the pile may be in danger
            clump_modifier = min(0.15, clump.sow_cluster_size * 0.03)
            risk = min(1.0, risk + clump_modifier)
            logger.debug(
                "Clump-near-sow modifier: +%.2f (cluster_size=%d)",
                clump_modifier, clump.sow_cluster_size,
            )

        return round(risk, 2)
    
    def draw_detections(self, frame: np.ndarray, result: DetectionResult) -> np.ndarray:
        """Draw detection boxes and labels on frame."""
        annotated_frame = frame.copy()
        
        colors = {
            "piglet": (0, 255, 0),  # Green
            "sow_standing": (255, 165, 0),  # Orange
            "sow_lying_lateral": (255, 0, 0),  # Red
            "sow_lying_sternal": (255, 100, 100),
            "sow_sitting": (255, 200, 0),
            "sow_nursing": (0, 255, 255)  # Cyan
        }
        
        for bbox in result.bounding_boxes:
            x, y = int(bbox["x"]), int(bbox["y"])
            w, h = int(bbox["width"]), int(bbox["height"])
            label = bbox["label"]
            conf = bbox["confidence"]
            
            color = colors.get(label, (128, 128, 128))
            
            cv2.rectangle(annotated_frame, (x, y), (x + w, y + h), color, 2)
            
            label_text = f"{label}: {conf:.2f}"
            cv2.putText(
                annotated_frame, label_text, (x, y - 10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2
            )
        
        # Draw risk indicator
        risk_color = (0, 255, 0) if result.crushing_risk < 0.3 else \
                    (0, 255, 255) if result.crushing_risk < 0.6 else (0, 0, 255)
        
        cv2.putText(
            annotated_frame, 
            f"Crushing Risk: {result.crushing_risk:.0%}", 
            (10, 30),
            cv2.FONT_HERSHEY_SIMPLEX, 0.8, risk_color, 2
        )
        
        cv2.putText(
            annotated_frame,
            f"Piglets: {result.piglet_count} | Posture: {result.sow_posture}",
            (10, 60),
            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2
        )
        
        return annotated_frame


# Global detector instance
detector = YOLODetector()


def get_detector() -> YOLODetector:
    """Get or initialize the YOLO detector."""
    if not detector.is_loaded():
        detector.load_model()
    return detector
