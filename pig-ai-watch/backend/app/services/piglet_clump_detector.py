"""
Piglet Clump Detector — Spatial analysis of piglet bounding boxes.

Uses bbox geometry (no segmentation required) to infer when piglets are
clumped together, which causes object-detection models to merge detections.

Signals produced:
  - merged_box_count: estimated extra piglets hidden inside oversized boxes
  - piglet_overlap_pairs: count of piglet-piglet bbox pairs with high IoU
  - cluster_near_sow: whether a dense piglet cluster sits inside/beside the sow
  - count_variance: rolling variance of piglet count (high = flickering)
  - likely_actual_count: best-effort estimate of real piglet count

These signals feed into FarrowingInferenceEngine for smart crushing alerts.
"""

from __future__ import annotations

import math
import statistics
from collections import deque
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any

import logging

logger = logging.getLogger(__name__)


# ─── Configuration ──────────────────────────────────────────────────────────

# IoU threshold to consider two piglet boxes as overlapping bodies
PIGLET_OVERLAP_IOU_THRESHOLD = 0.25

# A piglet box whose area is >= this multiplier of the median piglet area
# is likely a merged detection containing multiple piglets
MERGED_BOX_AREA_MULTIPLIER = 1.8

# Max distance (pixels) between piglet centroids to be considered part of
# the same spatial cluster
CLUSTER_RADIUS_PX = 120

# Minimum piglets in a spatial cluster to flag as "dense cluster"
MIN_CLUSTER_SIZE = 3

# Rolling window length for count-variance tracking (number of snapshots)
COUNT_VARIANCE_WINDOW = 15

# Variance threshold above which piglet count is considered "flickering"
COUNT_VARIANCE_HIGH = 2.0


# ─── Data Structures ────────────────────────────────────────────────────────

@dataclass
class BBox:
    """Lightweight bounding box (pixel coords)."""
    x: float
    y: float
    w: float
    h: float
    label: str = "piglet"
    confidence: float = 0.0

    @property
    def cx(self) -> float:
        return self.x + self.w / 2

    @property
    def cy(self) -> float:
        return self.y + self.h / 2

    @property
    def area(self) -> float:
        return max(self.w, 0) * max(self.h, 0)

    @property
    def x2(self) -> float:
        return self.x + self.w

    @property
    def y2(self) -> float:
        return self.y + self.h


@dataclass
class ClumpAnalysis:
    """Result of a single-frame clump analysis."""
    # Raw detected piglet count (from YOLO)
    detected_count: int = 0

    # Estimated additional piglets hidden inside oversized/merged boxes
    merged_box_extras: int = 0

    # Best-effort actual count: detected + estimated hidden
    likely_actual_count: int = 0

    # Number of piglet-piglet box pairs with IoU > threshold
    overlap_pair_count: int = 0

    # True if a dense piglet cluster exists near/inside the sow box
    cluster_near_sow: bool = False

    # Number of piglets in the largest cluster near the sow
    sow_cluster_size: int = 0

    # Rolling count variance (high = flickering detections)
    count_variance: float = 0.0

    # True if clumping is likely based on combined signals
    clumping_likely: bool = False

    # Ratio of total piglet box area to sow box area (density proxy)
    piglet_density_ratio: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "detected_count": self.detected_count,
            "merged_box_extras": self.merged_box_extras,
            "likely_actual_count": self.likely_actual_count,
            "overlap_pair_count": self.overlap_pair_count,
            "cluster_near_sow": self.cluster_near_sow,
            "sow_cluster_size": self.sow_cluster_size,
            "count_variance": round(self.count_variance, 3),
            "clumping_likely": self.clumping_likely,
            "piglet_density_ratio": round(self.piglet_density_ratio, 3),
        }


# ─── Helpers ────────────────────────────────────────────────────────────────

def _iou(a: BBox, b: BBox) -> float:
    """Compute Intersection-over-Union for two bounding boxes."""
    ix1 = max(a.x, b.x)
    iy1 = max(a.y, b.y)
    ix2 = min(a.x2, b.x2)
    iy2 = min(a.y2, b.y2)

    iw = max(0.0, ix2 - ix1)
    ih = max(0.0, iy2 - iy1)
    inter = iw * ih

    union = a.area + b.area - inter
    return inter / union if union > 0 else 0.0


def _distance(a: BBox, b: BBox) -> float:
    """Euclidean distance between box centroids."""
    return math.hypot(a.cx - b.cx, a.cy - b.cy)


def _point_in_expanded_box(px: float, py: float, box: BBox, margin: float) -> bool:
    """Check if a point is within an expanded bounding box."""
    return (box.x - margin <= px <= box.x2 + margin and
            box.y - margin <= py <= box.y2 + margin)


# ─── Main Detector ──────────────────────────────────────────────────────────

class PigletClumpDetector:
    """
    Analyzes piglet bounding boxes to detect clumping, merged detections,
    and flickering counts — all symptoms of object-detection limitations
    when piglets cluster together.

    Usage:
        detector = PigletClumpDetector()
        analysis = detector.analyze(piglet_boxes, sow_box)
    """

    def __init__(self):
        self._count_history: deque[int] = deque(maxlen=COUNT_VARIANCE_WINDOW)

    def reset(self):
        """Clear rolling state (call on session reset)."""
        self._count_history.clear()

    def analyze(
        self,
        piglet_boxes: List[Dict[str, Any]],
        sow_box: Optional[Dict[str, Any]] = None,
        sow_posture: str = "unknown",
    ) -> ClumpAnalysis:
        """
        Analyze a frame's piglet detections for clumping indicators.

        Args:
            piglet_boxes: List of piglet bbox dicts with x, y, width, height, confidence.
            sow_box: Optional sow bbox dict (same format).
            sow_posture: Current sow posture string.

        Returns:
            ClumpAnalysis with all computed signals.
        """
        result = ClumpAnalysis()

        # Convert to BBox objects
        piglets = [
            BBox(
                x=float(b.get("x", 0)),
                y=float(b.get("y", 0)),
                w=float(b.get("width", 0)),
                h=float(b.get("height", 0)),
                label="piglet",
                confidence=float(b.get("confidence", 0)),
            )
            for b in piglet_boxes
        ]

        sow: Optional[BBox] = None
        if sow_box:
            sow = BBox(
                x=float(sow_box.get("x", 0)),
                y=float(sow_box.get("y", 0)),
                w=float(sow_box.get("width", 0)),
                h=float(sow_box.get("height", 0)),
                label="sow",
                confidence=float(sow_box.get("confidence", 0)),
            )

        result.detected_count = len(piglets)

        # ── 1. Piglet-to-piglet overlap analysis ────────────────────────
        result.overlap_pair_count = self._count_overlap_pairs(piglets)

        # ── 2. Merged-box detection (oversized boxes) ──────────────────
        result.merged_box_extras = self._estimate_merged_extras(piglets)

        # ── 3. Likely actual count ─────────────────────────────────────
        result.likely_actual_count = result.detected_count + result.merged_box_extras

        # ── 4. Cluster near sow analysis ───────────────────────────────
        if sow and piglets:
            cluster_size = self._find_cluster_near_sow(piglets, sow)
            result.sow_cluster_size = cluster_size
            result.cluster_near_sow = cluster_size >= MIN_CLUSTER_SIZE

            # Density ratio: total piglet area / sow area
            total_piglet_area = sum(p.area for p in piglets)
            if sow.area > 0:
                result.piglet_density_ratio = total_piglet_area / sow.area

        # ── 5. Rolling count variance ──────────────────────────────────
        self._count_history.append(result.detected_count)
        if len(self._count_history) >= 3:
            result.count_variance = statistics.variance(self._count_history)
        else:
            result.count_variance = 0.0

        # ── 6. Combined clumping likelihood ────────────────────────────
        clump_signals = 0
        if result.overlap_pair_count > 0:
            clump_signals += 1
        if result.merged_box_extras > 0:
            clump_signals += 1
        if result.cluster_near_sow:
            clump_signals += 1
        if result.count_variance >= COUNT_VARIANCE_HIGH:
            clump_signals += 1

        # Clumping is "likely" if 2+ independent signals agree
        result.clumping_likely = clump_signals >= 2

        return result

    # ── Internal Methods ────────────────────────────────────────────────

    def _count_overlap_pairs(self, piglets: List[BBox]) -> int:
        """Count piglet-piglet box pairs with IoU above threshold."""
        count = 0
        for i in range(len(piglets)):
            for j in range(i + 1, len(piglets)):
                if _iou(piglets[i], piglets[j]) >= PIGLET_OVERLAP_IOU_THRESHOLD:
                    count += 1
        return count

    def _estimate_merged_extras(self, piglets: List[BBox]) -> int:
        """
        Estimate how many extra piglets are hidden in oversized boxes.

        If a box is 2x the median piglet area, it likely contains 2 piglets.
        If 3x, likely 3, etc.
        """
        if len(piglets) < 2:
            return 0

        areas = [p.area for p in piglets if p.area > 0]
        if not areas:
            return 0

        median_area = statistics.median(areas)
        if median_area <= 0:
            return 0

        extras = 0
        for p in piglets:
            ratio = p.area / median_area
            if ratio >= MERGED_BOX_AREA_MULTIPLIER:
                # Box contains ~ratio piglets, but we already counted 1
                estimated_inside = max(1, round(ratio)) - 1
                extras += estimated_inside
                logger.debug(
                    "Merged box detected: area=%.0f, median=%.0f, ratio=%.1f, extras=%d",
                    p.area, median_area, ratio, estimated_inside,
                )

        return extras

    def _find_cluster_near_sow(self, piglets: List[BBox], sow: BBox) -> int:
        """
        Find the largest spatial cluster of piglets that overlaps with
        or is near the sow bounding box.

        Returns the size of the largest such cluster.
        """
        # Margin: piglets just outside the sow box are still relevant
        margin = max(sow.w, sow.h) * 0.15

        # Filter piglets near the sow
        near_sow = [
            p for p in piglets
            if _point_in_expanded_box(p.cx, p.cy, sow, margin)
        ]

        if len(near_sow) < 2:
            return len(near_sow)

        # Simple greedy clustering by distance
        visited = [False] * len(near_sow)
        max_cluster = 0

        for i in range(len(near_sow)):
            if visited[i]:
                continue
            # BFS/DFS from piglet i
            cluster = [i]
            visited[i] = True
            queue = [i]
            while queue:
                cur = queue.pop(0)
                for j in range(len(near_sow)):
                    if not visited[j] and _distance(near_sow[cur], near_sow[j]) <= CLUSTER_RADIUS_PX:
                        visited[j] = True
                        cluster.append(j)
                        queue.append(j)

            max_cluster = max(max_cluster, len(cluster))

        return max_cluster
