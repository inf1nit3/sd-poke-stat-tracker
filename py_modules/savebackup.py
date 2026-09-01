"""Rolling save-file backups.

Copies the active ``Game.rxdata`` to a backup directory after every
successful watcher parse and prunes old copies so at most ``count``
backups remain. Protects against save corruption (a real risk on
SD cards) without any user interaction.
"""

from __future__ import annotations

import os
import shutil
import time
from pathlib import Path
from threading import Lock
from typing import Any


class SaveBackupManager:
    """Keep the last ``count`` copies of a save file."""

    def __init__(self, backup_dir: Path, count: int = 5) -> None:
        self.backup_dir = Path(backup_dir)
        self.count = max(1, int(count))
        self._lock = Lock()

    def backup(self, path: Path) -> Path | None:
        """Copy ``path`` into the backup dir. Returns the backup path
        or None when the source is missing/unreadable."""
        src = Path(path)
        if not src.is_file():
            return None
        try:
            with self._lock:
                self.backup_dir.mkdir(parents=True, exist_ok=True)
                ts = time.strftime("%Y%m%d-%H%M%S")
                dest = self.backup_dir / f"{src.stem}.{ts}{src.suffix}"
                i = 1
                while dest.exists():
                    dest = self.backup_dir / f"{src.stem}.{ts}-{i}{src.suffix}"
                    i += 1
                shutil.copy2(src, dest)
                self._prune()
                return dest
        except OSError as exc:
            import logging
            logging.getLogger(__name__).warning(f"Save backup failed: {exc}")
            return None

    def list_files(self) -> list[Path]:
        """All backup files, newest first."""
        try:
            files = [p for p in self.backup_dir.iterdir() if p.is_file()]
        except OSError:
            return []
        return sorted(files, key=lambda p: p.stat().st_mtime, reverse=True)

    def list(self) -> list[dict[str, Any]]:
        """Backup metadata for the UI, newest first."""
        out: list[dict[str, Any]] = []
        for p in self.list_files():
            try:
                st = p.stat()
            except OSError:
                continue
            out.append(
                {
                    "name": p.name,
                    "path": str(p),
                    "size": st.st_size,
                    "modified": st.st_mtime,
                }
            )
        return out

    def restore(self, backup_path: Path, target: Path) -> Path:
        """Copy ``backup_path`` over ``target`` atomically.

        Raises ValueError when the backup is not inside our backup dir
        (path traversal guard) and FileNotFoundError/OSError on I/O problems.
        """
        backup = Path(backup_path).resolve()
        backup_dir = self.backup_dir.resolve()
        if backup.parent != backup_dir:
            raise ValueError("Backup path is not inside the backup directory")
        if not backup.is_file():
            raise FileNotFoundError(f"Backup not found: {backup}")
        target = Path(target)
        tmp = target.with_name(target.name + ".restore.tmp")
        shutil.copy2(backup, tmp)
        os.replace(tmp, target)
        return target

    def _prune(self) -> None:
        for old in self.list_files()[self.count :]:
            try:
                old.unlink()
            except OSError:
                pass
