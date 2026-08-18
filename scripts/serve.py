#!/usr/bin/env python3
"""Serve the prototype with cache rules that always refresh HTML."""

from argparse import ArgumentParser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


PROJECT_ROOT = Path(__file__).resolve().parent.parent


class PrototypeHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, quiet=False, **kwargs):
        self.quiet = quiet
        super().__init__(*args, **kwargs)

    def end_headers(self):
        request = urlsplit(self.path)
        is_html = request.path in ("/", "/index.html") or request.path.endswith(".html")
        if is_html:
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
        elif "v=" in request.query:
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        else:
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, format, *args):
        if not self.quiet:
            super().log_message(format, *args)


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=4173)
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args()

    handler = partial(PrototypeHandler, directory=str(PROJECT_ROOT), quiet=args.quiet)
    with ThreadingHTTPServer((args.bind, args.port), handler) as server:
        host, port = server.server_address[:2]
        print(f"Serving {PROJECT_ROOT} at http://{host}:{port}/", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
