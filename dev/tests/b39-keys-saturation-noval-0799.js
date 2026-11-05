// 0.799 · B-39: у ползунка насыщенности в шапке панели убрано число-значение
// (владелец: «число рядом с ползунком не нужно»). Ползунок и поведение — как в 0.798.
// Запуск: node dev/tests/b39-keys-saturation-noval-0799.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'STRUCHORD.html'), 'utf8');

let passed = 0;
function ok(name) { passed++; console.log('  ok  ' + name); }

// Ползунок остался, цифровой подписи в панели нет.
assert(HTML.includes("satInput.id='b39KeysSaturation';"), 'ползунок #b39KeysSaturation на месте (0.798 сохранено)');
assert(!HTML.includes("el('span', 'b39-keys-sat-val'"), 'элемента b39-keys-sat-val в панели нет (0.799)');
assert(!HTML.includes('satVal.textContent = satInput.value;'), 'обработчик input не обновляет цифру (0.799)');
assert(!HTML.includes('.b39-keys-sat-val {'), 'CSS .b39-keys-sat-val удалён (0.799)');
assert(HTML.includes('satWrap.appendChild(satInput);'), 'в шапке только сам ползунок (0.799)');
ok('цифра рядом с ползунком убрана, ползунок на месте');

// Поведение не изменилось: live + общий track.saturation.
assert(HTML.includes("if (T && a && a.track && a.track.instrument === 'keys') { T.setSaturation(a.track.id, Number(satInput.value)); renderPanel(); }"),
  'input: setSaturation + renderPanel (0.798, без изменений)');
assert(HTML.includes("if (Number(satInput.value) !== sv && doc.activeElement !== satInput) { satInput.value = String(sv); } }"),
  'renderPanel: синхронизация позиции, скобки целы (0.799 fixup)');
ok('поведение live_save + shared сохранено');

// Цифра в диалоге автоаккомпанемента (была с 0.795) не тронута.
assert(HTML.includes("var satVal=element('span','b39-auto-sat-val',sat.value);"), 'в диалоге авто подпись значения осталась (0.799 — только панель)');
ok('диалог авто не изменён');

console.log(`\n0.799: число у ползунка панели убрано — все проверки пройдены (${passed} групп)`);
