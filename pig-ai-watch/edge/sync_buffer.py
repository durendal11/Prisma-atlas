"""
PRISMA ATLAS — Edge Sync Buffer

SQLite-backed offline queue.  When the cloud is unreachable the edge agent
writes detection payloads here.  A background flush loop drains buffered
records to the cloud in batches once connectivity is restored.
"""

import sqlite3
import json
import time
import logging
from pathlib import Path
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).parent / "buffer.db"


class SyncBuffer:
    """SQLite ring-buffer for offline detection results."""

    def __init__(self, db_path: str | Path = DB_PATH):
        self.db_path = str(db_path)
        self._init_db()

    # ── private helpers ──────────────────────────────────────────

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=3)
        conn.execute("PRAGMA busy_timeout = 3000")
        return conn

    def _init_db(self):
        with self._conn() as conn:
            conn.execute("PRAGMA journal_mode = WAL")
            conn.execute("PRAGMA synchronous = NORMAL")
            conn.execute("PRAGMA wal_autocheckpoint = 100")
            conn.execute("""
                CREATE TABLE IF NOT EXISTS buffer (
                    id        INTEGER PRIMARY KEY AUTOINCREMENT,
                    payload   TEXT    NOT NULL,
                    created   REAL   NOT NULL
                )
            """)
            conn.commit()

    # ── public API ───────────────────────────────────────────────

    def insert(self, payload: Dict[str, Any]):
        """Store a single detection payload for later sync."""
        with self._conn() as conn:
            conn.execute(
                "INSERT INTO buffer (payload, created) VALUES (?, ?)",
                (json.dumps(payload), time.time()),
            )
            conn.commit()
        logger.debug("Buffered 1 detection locally")

    def peek(self, limit: int = 50) -> List[tuple]:
        """Return up to *limit* oldest records as (id, payload_dict) tuples."""
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT id, payload FROM buffer ORDER BY id LIMIT ?", (limit,)
            ).fetchall()
        return [(row[0], json.loads(row[1])) for row in rows]

    def delete_ids(self, ids: List[int]):
        """Remove records that have been successfully pushed."""
        if not ids:
            return
        placeholders = ",".join("?" for _ in ids)
        with self._conn() as conn:
            conn.execute(f"DELETE FROM buffer WHERE id IN ({placeholders})", ids)
            conn.commit()

    def purge_old(self, max_age_days: int = 7):
        """Delete records older than *max_age_days* to avoid filling disk."""
        cutoff = time.time() - max_age_days * 86400
        with self._conn() as conn:
            cur = conn.execute("DELETE FROM buffer WHERE created < ?", (cutoff,))
            conn.commit()
        if cur.rowcount:
            logger.info(f"Purged {cur.rowcount} stale buffered records")

    def count(self) -> int:
        with self._conn() as conn:
            return conn.execute("SELECT COUNT(*) FROM buffer").fetchone()[0]
