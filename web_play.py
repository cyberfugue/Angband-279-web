#!/usr/bin/env python3
import json
import os
import pty
import select
import signal
import struct
import termios
import threading
from fcntl import ioctl
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
GAME_ROOT = ROOT / "angband-2.7.9v6"
GAME_BIN = GAME_ROOT / "angband"
STATIC_DIR = ROOT / "web"


def _winsize(rows: int, cols: int) -> bytes:
    return struct.pack('HHHH', rows, cols, 0, 0)


class GameSession:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.master_fd = None
        self.pid = None
        self.buffer = []
        self.seq = 0
        self.reader = None
        self.start()

    def start(self) -> None:
        if not GAME_BIN.exists():
            raise FileNotFoundError(
                f"{GAME_BIN} is missing. Build with: make -C angband-2.7.9v6/src "
                "CFLAGS='-Wall -O2 -pipe -D\"USE_CAP\" -D\"USE_HARDCODE\"' "
                "LIBS='-ltermcap'"
            )

        if self.pid:
            self.stop()

        pid, master_fd = pty.fork()
        if pid == 0:
            env = os.environ.copy()
            env["ANGBAND_PATH"] = str(GAME_ROOT / "lib")
            env["TERM"] = "vt100"
            os.chdir(GAME_ROOT)
            os.execvpe(str(GAME_BIN), [str(GAME_BIN), "-n"], env)
            raise RuntimeError("execvpe failed")

        self.pid = pid
        self.master_fd = master_fd
        with self.lock:
            self.buffer.clear()
            self.seq = 0
        self.reader = threading.Thread(target=self._reader_loop, daemon=True)
        self.reader.start()

    def stop(self) -> None:
        if self.pid:
            try:
                os.kill(self.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            self.pid = None
        if self.master_fd is not None:
            try:
                os.close(self.master_fd)
            except OSError:
                pass
            self.master_fd = None

    def _reader_loop(self) -> None:
        while self.master_fd is not None:
            ready, _, _ = select.select([self.master_fd], [], [], 0.1)
            if not ready:
                continue
            try:
                chunk = os.read(self.master_fd, 4096)
            except OSError:
                break
            if not chunk:
                break
            text = chunk.decode("utf-8", errors="replace")
            with self.lock:
                self.seq += 1
                self.buffer.append((self.seq, text))
                if len(self.buffer) > 2000:
                    self.buffer = self.buffer[-1000:]

    def write(self, payload: str) -> None:
        if self.master_fd is None:
            return
        os.write(self.master_fd, payload.encode("utf-8", errors="ignore"))

    def resize(self, rows: int, cols: int) -> None:
        if self.master_fd is None:
            return
        ioctl(self.master_fd, termios.TIOCSWINSZ, _winsize(rows, cols))

    def read_from(self, since: int):
        with self.lock:
            updates = [txt for idx, txt in self.buffer if idx > since]
            return {"next": self.seq, "data": "".join(updates)}


SESSION = GameSession()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def _write_json(self, payload: dict, status: int = HTTPStatus.OK) -> None:
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:
        if self.path.startswith("/api/output"):
            try:
                query = self.path.split("?", 1)[1]
                pairs = dict(p.split("=", 1) for p in query.split("&") if "=" in p)
                since = int(pairs.get("since", "0"))
            except Exception:
                since = 0
            self._write_json(SESSION.read_from(since))
            return
        return super().do_GET()

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length) if length else b"{}"
        payload = json.loads(body.decode("utf-8"))

        if self.path == "/api/input":
            SESSION.write(payload.get("data", ""))
            self._write_json({"ok": True})
            return

        if self.path == "/api/resize":
            SESSION.resize(int(payload.get("rows", 24)), int(payload.get("cols", 80)))
            self._write_json({"ok": True})
            return

        if self.path == "/api/reset":
            SESSION.start()
            self._write_json({"ok": True})
            return

        self._write_json({"error": "not found"}, status=HTTPStatus.NOT_FOUND)


def main() -> None:
    host = "0.0.0.0"
    port = int(os.environ.get("PORT", "8080"))
    print(f"Serving Angband at http://{host}:{port}")
    server = ThreadingHTTPServer((host, port), Handler)
    try:
        server.serve_forever()
    finally:
        SESSION.stop()


if __name__ == "__main__":
    main()
