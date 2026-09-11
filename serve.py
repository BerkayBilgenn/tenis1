#!/usr/bin/env python3
"""El Takipli Tenis — yerel sunucu (önbelleksiz, ES modülleri için doğru MIME).

Ayrıca /api/network uç noktasını taklit eder: yayında Vercel Edge Function
ne yapıyorsa (istemcinin ağını özetlemek) burada yerel alt ağ üzerinden yapar,
böylece aynı Wi-Fi'daki cihazlar geliştirme sırasında da birbirini bulur.
"""
import hashlib, http.server, json, os, socketserver, sys

SALT = 'tenis-el-takip-v1'


def network_id(client_ip: str) -> str:
    # yerelde /24 alt ağı kullan: 192.168.1.x -> aynı kimlik
    parts = client_ip.split('.')
    key = '.'.join(parts[:3]) if len(parts) == 4 else client_ip
    return hashlib.sha256((SALT + key).encode()).hexdigest()[:16]

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
os.chdir(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
    }

    def do_GET(self):
        if self.path.split('?')[0] == '/api/network':
            body = json.dumps({'id': network_id(self.client_address[0])}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

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
