#!/usr/bin/env python3
"""El Takipli Tenis — yerel sunucu (önbelleksiz, ES modülleri için doğru MIME)."""
import http.server, os, socketserver, sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
os.chdir(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
    }

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, max-age=0')
        super().end_headers()

    def log_message(self, *a):
        pass


socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('', PORT), Handler) as httpd:
    print(f'→ http://localhost:{PORT}  (Ctrl+C ile durdur)')
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nkapatıldı')
