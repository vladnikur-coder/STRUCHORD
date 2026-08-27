#!/bin/bash
# Прогон всех тестов одной командой: jsdom-тесты из dev/tests.
# Стенды dev/bench сюда не входят — они требуют puppeteer и меряют
# настоящие кадры в Chrome (запускаются по одному: node dev/bench/имя.js).
cd "$(dirname "$0")/.."

pass=0
fail=0
failed=()
for t in dev/tests/*.js; do
  if node "$t" > /tmp/struchord-test.log 2>&1; then
    echo "ok    $t"
    pass=$((pass + 1))
  else
    echo "FAIL  $t  (лог: /tmp/struchord-test.log)"
    tail -5 /tmp/struchord-test.log | sed 's/^/        /'
    fail=$((fail + 1))
    failed+=("$t")
  fi
done

echo
echo "итого: $pass ok, $fail FAIL"
[ "$fail" -eq 0 ]
