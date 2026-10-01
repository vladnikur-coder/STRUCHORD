#!/usr/bin/env bash
# Песочница: /tmp не переживает смену хода (а иногда и длинные прогоны).
# @sparticuz/chromium нужен al2023-набор системных библиотек (libnspr4 и
# др.) в /tmp/al2023/lib — иначе Chromium не запускается (exit 127).
# Восстановление: bash dev/bench/ensure-chromium-libs.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
if [ -f /tmp/al2023/lib/libnspr4.so ]; then
  echo "ok: /tmp/al2023/lib уже на месте"
  exit 0
fi
node -e "
const fs = require('fs');
const zlib = require('zlib');
const buf = fs.readFileSync('node_modules/@sparticuz/chromium/bin/al2023.tar.br');
fs.writeFileSync('/tmp/al2023.tar', zlib.brotliDecompressSync(buf));
"
mkdir -p /tmp/al2023
tar -xf /tmp/al2023.tar -C /tmp/al2023
echo "ok: извлечено в /tmp/al2023/lib"
