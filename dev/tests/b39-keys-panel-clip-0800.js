// 0.800 · B-39 (баг по скриншоту владельца, Safari): клавиши панели рисовались за
// правой границей карточки. Фикс: .b39-keys-body width:0 + min-width:100% — ширина
// body жёстко равна панели, overflow-x:auto клипает клавиши по границе.
// Запуск: node dev/tests/b39-keys-panel-clip-0800.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'STRUCHORD.html'), 'utf8');

let passed = 0;
function ok(name) { passed++; console.log('  ok  ' + name); }

assert(HTML.includes('.b39-keys-body { width: 0; min-width: 100%; max-width: 100%; overflow-x: auto; overflow-y: hidden; overscroll-behavior-x: contain; }'),
  'body: width:0 + min-width:100% + overflow-x:auto (0.800)');
assert(!HTML.includes('.b39-keys-body { min-width: 0; max-width: 100%; overflow-x: auto;'),
  'старого правила без width:0 нет (0.800)');
ok('CSS: ширина .b39-keys-body привязана к панели, скролл-контейнер клипает клавиши');

// Панель сама не должна давать странице горизонтальный скролл.
assert(HTML.includes('.b39-keys-panel { box-sizing: border-box; min-width: min(28rem, 100%); max-width: 100%; width: max-content;'),
  'панель: max-width:100% (в пределах колонки) сохранён (0.800)');
// Подсказка о прокрутке依然 завязана на переполнение body.
assert(HTML.includes("if (body.scrollWidth > body.clientWidth) footParts.push('↔ прокрутка клавиш');"),
  'подсказка «↔ прокрутка клавиш» по scrollWidth>clientWidth на месте');
ok('панель в пределах колонки, подсказка ↔ работает как раньше');

console.log(`\n0.800: клавиши не вылезают за панель — все проверки пройдены (${passed} групп)`);
