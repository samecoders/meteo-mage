"""로컬 개발용 정적 서버 (캐시 끔).
사용: python tools/serve.py [포트] [--lan]
  --lan  : 같은 Wi-Fi 의 폰에서 http://<PC의 IP>:포트 로 접속할 수 있게 모든 주소에서 받음
프로젝트 폴더(이 파일의 상위 폴더)를 http://localhost:8080 으로 엽니다.
"""
import http.server
import os
import socketserver
import sys

args = [a for a in sys.argv[1:] if not a.startswith("--")]
PORT = int(args[0]) if args else 8080
HOST = "0.0.0.0" if "--lan" in sys.argv else "127.0.0.1"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".json": "application/json",
        ".webmanifest": "application/manifest+json",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


socketserver.TCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer((HOST, PORT), NoCacheHandler) as httpd:
    print(f"Serving {ROOT} at http://localhost:{PORT}" + ("  (LAN 공개)" if HOST == "0.0.0.0" else ""))
    httpd.serve_forever()
