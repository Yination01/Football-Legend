#!/usr/bin/env python3
"""Static server for Football Legend with caching disabled (dev/playtest)."""
import http.server, functools

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

handler = functools.partial(NoCacheHandler, directory="/home/user/naija-legend")
http.server.ThreadingHTTPServer(("0.0.0.0", 8000), handler).serve_forever()
