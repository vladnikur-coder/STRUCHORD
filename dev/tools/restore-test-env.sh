#!/bin/bash
# restore-test-env.sh — восстановление тестового окружения «с нуля».
#
# По правилу R9 верификация идёт через Git-репозиторий: любой прогон
# разворачивается в чистой среде, где нет ни node_modules, ни Chromium.
# Скрипт собирает всё, что нужно dev/tests и dev/bench:
#
#   1. npm install без скачивания Chrome с CDN Google (в закрытых
#      средах storage.googleapis.com недоступен — пакет ставится с
#      PUPPETEER_SKIP_DOWNLOAD=1);
#   2. Chromium из @sparticuz/chromium (bin/chromium.br -> /tmp/chromium);
#   3. системные библиотеки NSS (libnspr4/libnss3) из al2023.tar.br того
#      же пакета -> /tmp/libs/al2023/lib (путь ждут тесты вроде
#      b68-songmap-drag);
#   4. симлинки абсолютных путей, на которые захардкожены стенды
#      (/home/user/node_modules, /home/user/STRUCHORD.html, ...);
#   5. статический сервер на 127.0.0.1:8000 (нужен http-тестам).
#
# Использование:  bash dev/tools/restore-test-env.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "== 1/5 npm install (без Chrome с CDN) =="
PUPPETEER_SKIP_DOWNLOAD=1 PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1 \
  npm install --no-audit --no-fund
[ -d node_modules/pngjs ] || npm install pngjs --no-audit --no-fund

echo "== 2/5 Chromium из @sparticuz/chromium =="
if [ ! -x /tmp/chromium ]; then
  node --input-type=module -e "
import chromium from '@sparticuz/chromium';
const p = await chromium.executablePath();
console.log('chromium ->', p);
"
else
  echo "chromium уже на месте: /tmp/chromium"
fi

echo "== 3/5 NSS-библиотеки (al2023) =="
if [ ! -f /tmp/libs/al2023/lib/libnss3.so ]; then
  mkdir -p /tmp/libs/al2023
  node -e "
const zlib = require('zlib'), fs = require('fs');
const raw = zlib.brotliDecompressSync(fs.readFileSync('node_modules/@sparticuz/chromium/bin/al2023.tar.br'));
fs.writeFileSync('/tmp/al2023.tar', raw);
"
  tar -xf /tmp/al2023.tar -C /tmp/libs/al2023
  echo "библиотеки -> /tmp/libs/al2023/lib"
else
  echo "библиотеки уже на месте"
fi

echo "== 4/5 симлинки абсолютных путей стендов =="
for f in STRUCHORD.html sw.js README.md ROADMAP.md manifest.json \
         preset-lab.html fingering-lab.html package.json dev uploads; do
  if [ -e "/home/user/$f" ] || [ -L "/home/user/$f" ]; then
    [ "/home/user/$f" -ef "$f" ] || { echo "ВНИМАНИЕ: /home/user/$f существует и не указывает на $f — пропускаю"; continue; }
  else
    ln -s "$(pwd)/$f" "/home/user/$f"
  fi
done
ln -sfn "$(pwd)/node_modules" /home/user/node_modules

echo "== 5/5 статический сервер 127.0.0.1:8000 =="
if curl -s -o /dev/null http://127.0.0.1:8000/STRUCHORD.html; then
  echo "сервер уже слушает 8000"
else
  nohup python3 -m http.server 8000 --bind 0.0.0.0 >/tmp/http8000.log 2>&1 &
  sleep 1
  curl -s -o /dev/null http://127.0.0.1:8000/STRUCHORD.html && echo "сервер поднялся" || echo "ОШИБКА: сервер не поднялся"
fi

echo
echo "Готово. Прогон тестов:"
echo "  export LD_LIBRARY_PATH=/tmp/libs/al2023/lib PUPPETEER_EXECUTABLE_PATH=/tmp/chromium"
echo "  bash dev/run-tests.sh"
