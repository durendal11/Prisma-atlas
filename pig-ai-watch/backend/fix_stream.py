import re

with open('/Users/arcelmacasling/prisma-atlas/pig-ai-watch/backend/app/services/camera_stream.py', 'r') as f:
    text = f.read()

# 1. Add _read_thread to __init__
text = text.replace(
    '        self._last_reconnect_time = 0.0',
    '        self._last_reconnect_time = 0.0\n        self._read_thread = None'
)

# 2. Add thread start to start()
text = text.replace(
    '        return True',
    '        # Start the read loop if not running\n        if self._read_thread is None or not self._read_thread.is_alive():\n            self.is_running = True\n            self._read_thread = threading.Thread(target=self._read_loop, daemon=True, name=f"cam-refresher-{self.pen_id}")\n            self._read_thread.start()\n        return True',
    1 # only the first one which is inside demo mode block? Wait, no!
)
