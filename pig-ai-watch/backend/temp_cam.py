169:class CameraStream:
170-    """Manages video capture from RTSP/USB/IP cameras with auto-reconnection."""
171-    
172-    def __init__(self, pen_id: str, source: str | int | None):
173-        self.pen_id = pen_id
174-        self.source = source
175-        self.capture: Optional[cv2.VideoCapture] = None
176-        self.is_running = False
177-        self.frame_count = 0
178-        self.last_frame: Optional[np.ndarray] = None
179-        self.last_detection: Optional[DetectionResult] = None
180-        self.failed_read_count = 0
181-        self.max_failed_reads = 15  # Reconnect after 15 failed reads (faster recovery)
182-        self.is_network_camera = isinstance(source, str) and source is not None
183-        self.detection_frame_skip = settings.DETECTION_FRAME_SKIP
184-        self._reconnect_attempts = 0
185-        self._max_reconnect_backoff = 30  # Max 30s between reconnect attempts
186-        self._last_reconnect_time = 0.0
187-        
188-    def start(self) -> bool:
189-        """Start capturing from the video source."""
190-        # Handle demo mode (no source configured)
191-        if self.source is None:
192-            logger.info(f"No camera source for pen {self.pen_id} - using demo mode")
193-            self.is_running = True
194-            return True
195-            
196-        for attempt in range(settings.CAMERA_RECONNECT_ATTEMPTS):
197-            try:
198-                if self.is_network_camera:
199-                    logger.info(f"🔌 Connecting to RTSP camera {self.pen_id}...")
200-                    logger.info(f"   URL: {self.source}")
201-                    logger.info(f"   Attempt: {attempt + 1}/{settings.CAMERA_RECONNECT_ATTEMPTS}")
202-                else:
203-                    logger.info(f"Connecting to camera {self.pen_id} (attempt {attempt + 1}/{settings.CAMERA_RECONNECT_ATTEMPTS})")
204-                
205-                # For network cameras, use system ffmpeg (works like VLC)
206-                if self.is_network_camera:
207-                    self.capture = _open_rtsp_capture(self.source)
208-                else:
209-                    self.capture = cv2.VideoCapture(self.source)
210-                
211-                if not self.capture.isOpened():
212-                    logger.warning(f"Failed to open camera source: {self.source}")
213-                    if attempt < settings.CAMERA_RECONNECT_ATTEMPTS - 1:
214-                        import time
215-                        time.sleep(settings.CAMERA_RECONNECT_DELAY_SEC)
216-                        continue
217-                    return False
218-                
219-                # Optimize for IP cameras - MINIMIZE LATENCY
220-                if self.is_network_camera:
221-                    # Minimize buffer to reduce latency (CRITICAL for low latency)
222-                    self.capture.set(cv2.CAP_PROP_BUFFERSIZE, settings.CAMERA_BUFFER_SIZE)
223-                    
224-                    # Set timeouts
225-                    self.capture.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, settings.CAMERA_OPEN_TIMEOUT_MS)
226-                    self.capture.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, settings.CAMERA_READ_TIMEOUT_MS)
227-                    
228-                    # Try to set quality settings
229-                    self.capture.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'H264'))
230-                    
231-                    # Disable internal buffering for minimal latency
232-                    self.capture.set(cv2.CAP_PROP_BUFFERSIZE, 1)
233-                
234-                # Set preferred resolution and FPS
235-                self.capture.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
236-                self.capture.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
237-                self.capture.set(cv2.CAP_PROP_FPS, 30)
238-                
239-                # Verify camera is actually working
240-                ret, test_frame = self.capture.read()
241-                if not ret:
242-                    logger.warning(f"Camera opened but cannot read frames: {self.source}")
243-                    self.capture.release()
244-                    if attempt < settings.CAMERA_RECONNECT_ATTEMPTS - 1:
245-                        import time
246-                        time.sleep(settings.CAMERA_RECONNECT_DELAY_SEC)
247-                        continue
248-                    return False
249-                
250-                self.last_frame = test_frame
251-                self.is_running = True
252-                self.failed_read_count = 0
253-                
254-                # Log detailed connection info (especially for RTSP)
255-                if self.is_network_camera:
256-                    width = self.capture.get(cv2.CAP_PROP_FRAME_WIDTH)
257-                    height = self.capture.get(cv2.CAP_PROP_FRAME_HEIGHT)
258-                    fps = self.capture.get(cv2.CAP_PROP_FPS)
259-                    fourcc = int(self.capture.get(cv2.CAP_PROP_FOURCC))
260-                    codec = "".join([chr((fourcc >> 8 * i) & 0xFF) for i in range(4)])
261-                    
262-                    logger.info(f"✅ RTSP CAMERA CONNECTED SUCCESSFULLY")
263-                    logger.info(f"   Pen ID: {self.pen_id}")
264-                    logger.info(f"   Source: {self.source}")
265-                    logger.info(f"   Resolution: {int(width)}x{int(height)}")
266-                    logger.info(f"   FPS: {fps}")
267-                    logger.info(f"   Codec: {codec}")
268-                    logger.info(f"   Test frame shape: {test_frame.shape}")
269-                else:
270-                    logger.info(f"✅ Successfully started camera stream for pen {self.pen_id}")
271-                
272-                return True
273-                
274-            except Exception as e:
275-                logger.error(f"Error starting camera stream (attempt {attempt + 1}): {e}")
276-                if attempt < settings.CAMERA_RECONNECT_ATTEMPTS - 1:
277-                    import time
278-                    time.sleep(settings.CAMERA_RECONNECT_DELAY_SEC)
279-                    continue
280-                    
281-        return False
282-    
283-    def reconnect(self) -> bool:
284-        """Attempt to reconnect to the camera source with exponential backoff."""
285-        import time as _time
286-        
287-        now = _time.time()
288-        
289-        # Exponential backoff: 2s, 4s, 8s, 16s, 30s (capped)
290-        backoff = min(2 ** (self._reconnect_attempts + 1), self._max_reconnect_backoff)
291-        time_since_last = now - self._last_reconnect_time
292-        
293-        if time_since_last < backoff:
294-            # Too soon — skip this reconnect attempt
295-            logger.debug(f"Skipping reconnect for pen {self.pen_id} (backoff: {backoff}s, waited: {time_since_last:.0f}s)")
296-            return False
297-        
298-        self._reconnect_attempts += 1
299-        self._last_reconnect_time = now
300-        logger.info(f"🔄 Reconnecting camera pen {self.pen_id} (attempt #{self._reconnect_attempts}, backoff={backoff}s)")
301-        
302-        self.stop()
303-        success = self.start()
304-        
305-        if success:
306-            self._reconnect_attempts = 0  # Reset on success
307-            logger.info(f"✅ Camera pen {self.pen_id} reconnected successfully")
308-        else:
309-            logger.warning(f"❌ Camera pen {self.pen_id} reconnect failed (next retry in ~{min(2 ** (self._reconnect_attempts + 1), self._max_reconnect_backoff)}s)")
310-        
311-        return success
312-    
313-    def stop(self):
314-        """Stop the camera capture."""
315-        self.is_running = False
316-        if self.capture:
317-            self.capture.release()
318-            self.capture = None
319-        logger.info(f"Stopped camera stream for pen {self.pen_id}")
320-    
321-    def read_frame(self, flush_buffer: bool = True) -> Optional[np.ndarray]:
322-        """Read a single frame from the camera with auto-reconnection.
323-        
324-        Args:
325-            flush_buffer: If True, flush old frames to get the latest frame (reduces latency)
326-        """
327-        # Demo mode - return demo frame
328-        if self.source is None and self.is_running:
329-            return get_demo_frame(self.pen_id)
330-            
331-        if not self.capture or not self.is_running:
332-            return None
333-        
334-        # For network cameras, flush buffer to get latest frame (minimize latency)
335-        # Only flush 2 frames max — flushing 5 was too aggressive and slowed frame delivery
336-        if flush_buffer and self.is_network_camera:
337-            for _ in range(2):
338-                ret = self.capture.grab()
339-                if not ret:
340-                    break
341-        
342-        ret, frame = self.capture.read()
343-        if ret:
344-            self.last_frame = frame
345-            self.frame_count += 1
346-            self.failed_read_count = 0
347-            return frame
348-        else:
349-            # Handle failed read
350-            self.failed_read_count += 1
351-            logger.warning(f"Failed to read frame from pen {self.pen_id} ({self.failed_read_count}/{self.max_failed_reads})")
352-            
353-            # Attempt reconnection if too many failures
354-            if self.failed_read_count >= self.max_failed_reads and self.is_network_camera:
355-                logger.warning(f"Too many failed reads, attempting reconnection for pen {self.pen_id}")
356-                if self.reconnect():
357-                    # Try reading again after reconnection
358-                    ret, frame = self.capture.read()
359-                    if ret:
360-                        self.last_frame = frame
361-                        self.frame_count += 1
362-                        return frame
363-            
364-            # Return last good frame if available
365-            if self.last_frame is not None:
366-                return self.last_frame
367-                
368-        return None
369-    
370-    def get_frame_with_detection(self) -> tuple[Optional[np.ndarray], Optional[DetectionResult]]:
371-        """Read frame and process with YOLO detection (with frame skipping for performance)."""
372-        frame = self.read_frame(flush_buffer=True)  # Always flush buffer for low latency
373-        if frame is None:
374-            return None, None
375-        
376-        # Process detection only every N frames to reduce latency
377-        should_process = (self.frame_count % self.detection_frame_skip) == 0
378-        
379-        if should_process:
380-            detector = get_detector()
381-            detection = detector.process_frame(frame)
382-            self.last_detection = detection
383-        
384-        # Draw detections on frame (use last detection if we skipped processing)
385-        if self.last_detection:
386-            detector = get_detector()
387-            annotated_frame = detector.draw_detections(frame, self.last_detection)
388-        else:
389-            annotated_frame = frame
390-        
391-        return annotated_frame, self.last_detection
392-
393-    def get_frame_fast(self) -> Optional[np.ndarray]:
394-        """Read frame WITHOUT running detection — for smooth streaming.
395-        
396-        Detection is overlaid from self.last_detection (set by background thread).
397-        This avoids blocking the MJPEG stream on YOLO inference.
398-        """
399-        frame = self.read_frame(flush_buffer=True)
400-        if frame is None:
401-            return None
402-        
403-        # Overlay last detection result (non-blocking)
404-        if self.last_detection:
405-            try:
406-                detector = get_detector()
407-                frame = detector.draw_detections(frame, self.last_detection)
408-            except Exception:
409-                pass  # Don't let detection drawing crash the stream
410-        
411-        return frame
412-
413-    def run_detection_once(self):
414-        """Run YOLO detection on the current frame (called from background thread)."""
415-        if self.last_frame is None:
416-            return
417-        try:
418-            detector = get_detector()
419-            detection = detector.process_frame(self.last_frame)
