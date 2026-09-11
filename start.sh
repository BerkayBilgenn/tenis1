#!/usr/bin/env bash
# El Takipli Tenis — yerel sunucu (kamera izni için localhost şart)
cd "$(dirname "$0")"
PORT="${1:-8000}"
command -v open >/dev/null && (sleep 1; open "http://localhost:$PORT") &
exec python3 serve.py "$PORT"
