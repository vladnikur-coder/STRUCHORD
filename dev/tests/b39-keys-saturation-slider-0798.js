// 0.798 · B-39 (бэклог №25): ползунок «Насыщенность» прямо в шапке панели клавиш,
// рядом со стрелками ‹ › (R8: next_nav + live_save + shared).
// Запуск: node dev/tests/b39-keys-saturation-panel-0798.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'STRUCHORD.html'), 'utf8');

let passed = 0;
function ok(name) { passed++; console.log('  ok  ' + name); }

// Ползунок создан в шапке сразу после nav (‹ ›).
assert(HTML.includes("head.appendChild(identity); head.appendChild(nav); head.appendChild(satWrap); head.appendChild(settingsToggle); head.appendChild(close);"),
  'шапка: satWrap после nav (рядом со стрелками ‹ ›) (0.798)');
assert(HTML.includes("satInput = el('input'); satInput.type='range'; satInput.id='b39KeysSaturation'; satInput.min='0'; satInput.max='100'; satInput.step='1';"),
  'ползунок range 0–100 с id b39KeysSaturation (0.798)');
assert(HTML.includes("satInput.setAttribute('aria-label','Насыщенность');"), 'aria-label «Насыщенность» (0.798)');
ok('UI: ползунок в шапке панели рядом со стрелками навигации');

// live_save: input → setSaturation + renderPanel (тот же track.saturation, что у авто).
assert(HTML.includes("if (T && a && a.track && a.track.instrument === 'keys') { T.setSaturation(a.track.id, Number(satInput.value)); renderPanel(); }"),
  'input: setSaturation(track.id) + renderPanel — сразу и в дорожку (0.798)');
assert(!HTML.includes('satVal.textContent = satInput.value;'), 'числовой readout рядом с ползунком отсутствует');
ok('поведение: live + запись в track.saturation (общее с диалогом авто)');

// shared: renderPanel синхронизирует позицию ползунка (не трогая активный ползунок).
assert(HTML.includes('if (satInput && active && active.track) { var sv = Number.isInteger(active.track.saturation) ? active.track.saturation : 50; if (Number(satInput.value) !== sv && doc.activeElement !== satInput) { satInput.value = String(sv); } }'),
  'renderPanel: синхронизация с track.saturation, absent = 50 (0.798)');
assert(HTML.includes('if (HOST.StruChordKeys && typeof HOST.StruChordKeys.render === \'function\') HOST.StruChordKeys.render();'),
  'диалог авто после «Применить» обновляет панель (0.798)');
ok('синхронизация: общий track.saturation между панелью и диалогом авто');

// CSS: компактный ползунок в шапке, прячется в режиме ввода ноты.
assert(HTML.includes(".b39-keys-sat { display: inline-flex; align-items: center; gap: .2rem; }"), 'CSS .b39-keys-sat (0.798)');
assert(HTML.includes(".b39-keys-panel.is-note-input .b39-keys-nav, .b39-keys-panel.is-note-input .b39-keys-sat { display:none; }"),
  'в режиме ввода ноты ползунок прячется вместе с nav (0.798)');
assert(HTML.includes(".b39-keys-sat input[type='range'] { width: 3.2rem; }"), 'на узком экране ползунок уже (0.798)');
ok('CSS: компактный ползунок, адаптив под 640px');

// Связка с 0.797: панель зависит от насыщенности, поэтому ползунок в панели разумен.
assert(HTML.includes('function saturateNotes(trackId, notes, chordName, key, range)'), 'saturateNotes (0.797) на месте');
ok('связка с №24: панель пересчитывается от насыщенности');

console.log(`\n0.798 (№25): ползунок насыщенности в шапке панели — все проверки пройдены (${passed} групп)`);
