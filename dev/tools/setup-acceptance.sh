#!/usr/bin/env bash
# Восстановление окружения приёмки B-12.9.x: браузерные тесты и оракул PyGuitarPro.
#
# Песочница перезапускается и вместе с ней исчезает всё в /tmp (Chromium, распакованные
# библиотеки NSS, venv с PyGuitarPro). Скрипт поднимает это заново одной командой:
#
#     bash dev/tools/setup-acceptance.sh
#
# Что делает:
#   1. npm install — jsdom, puppeteer, @sparticuz/chromium;
#   2. распаковывает al2023.tar.br в /tmp/al2023 — Chromium из @sparticuz/chromium
#      распаковывает эти библиотеки только на Amazon Linux 2023, на Debian нужен ручной
#      шаг, иначе Chromium падает с «error while loading shared libraries: libnspr4.so»;
#   3. ставит PyGuitarPro 0.11 в /tmp/gpvenv — независимый оракул для проверки .gp5.
#
# Ничего из этого не нужно самому приложению: ни Python, ни Chromium в рантайме
# STRUCHORD нет. Это только инструменты приёмки.
set -euo pipefail

cd "$(dirname "$0")/../.."
ROOT=$(pwd)

echo "== 1. npm-зависимости =="
if [ ! -d node_modules/jsdom ]; then
  npm install --no-audit --no-fund
else
  echo "node_modules на месте"
fi

echo "== 2. Chromium и библиотеки NSS =="
ARCHIVE=node_modules/@sparticuz/chromium/bin/al2023.tar.br
if [ ! -f "$ARCHIVE" ]; then
  echo "НЕТ $ARCHIVE — переустановите @sparticuz/chromium" >&2
  exit 1
fi
if [ ! -f /tmp/al2023/lib/libnspr4.so ]; then
  mkdir -p /tmp/al2023
  node -e "
    const zlib = require('zlib'), fs = require('fs');
    const src = process.argv[1];
    fs.writeFileSync('/tmp/al2023.tar.br', zlib.brotliDecompressSync(fs.readFileSync(src)));
  " "$ARCHIVE"
  tar -xf /tmp/al2023.tar.br -C /tmp/al2023
  echo "библиотеки распакованы в /tmp/al2023"
else
  echo "/tmp/al2023 на месте"
fi
# Сам Chromium: пакет кладёт бинарь при первом require, копируем его в /tmp/chromium.
if [ ! -f /tmp/chromium ]; then
  node -e "
    const chromium = require('@sparticuz/chromium').default;
    chromium.executablePath().then((bin) => console.log('Chromium:', bin));
  "
else
  echo "/tmp/chromium на месте"
fi
export LD_LIBRARY_PATH=/tmp/al2023/lib
echo "библиотеки:"; ls /tmp/al2023/lib | head -5

echo "== 3. Оракул PyGuitarPro =="
if [ ! -x /tmp/gpvenv/bin/python ]; then
  python3 -m venv /tmp/gpvenv
  /tmp/gpvenv/bin/pip install --quiet --upgrade pip
fi
if ! /tmp/gpvenv/bin/python -c "import guitarpro" 2>/dev/null; then
  /tmp/gpvenv/bin/pip install --quiet PyGuitarPro==0.11
fi
/tmp/gpvenv/bin/python -c "import guitarpro; print('PyGuitarPro готов:', guitarpro.__file__)"

echo
echo "Готово. Проверка: node dev/tests/b12-gp5-export.js и $ROOT/dev/tools/gp5-py-oracle.py"