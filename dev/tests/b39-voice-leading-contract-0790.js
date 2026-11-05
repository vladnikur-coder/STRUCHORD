'use strict';
// 0.790 · B-118: голосоведение по всей песне — статический контракт.
//
// Изменение: кэш linkedSelection теперь на всю песню (ключ trackId), события
// всех секций в порядке документа, prev перетекает через границы секций;
// ключ ячейки из её секции (e.sec.key). Ручные exactNotes/индексы и старые
// песни (без linkedVoicings) — как раньше. Повторы не раскрываются.
// Поведенческий тест — b39-voice-leading-0790.js (browser, в песочнице нет Chromium).
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'STRUCHORD.html'), 'utf8');
let groups = 0;
const ok = (msg) => { groups++; console.log('  ok  ' + msg); };

// 1. R7: версия/кэш парой (динамически)
const VER = (HTML.match(/· ver (\d+\.\d+)/) || [])[1];
assert(VER && /^\d+\.\d+$/.test(VER), 'версия читается: ' + VER);
assert(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').includes('struchord-v' + VER.split('.')[1]),
  'CACHE_NAME парой с версией');
ok('R7: версия ' + VER + ' + struchord-v' + VER.split('.')[1]);

// 2. Кэш на всю песню
assert(HTML.includes('var cacheKey=String(trackId), cache=linkedCache.get(cacheKey);'),
  'ключ кэша — trackId (вся песня), а не trackId:secId');
assert(!HTML.includes("var cacheKey=String(trackId)+':'+secId"), 'прежний ключ на секцию убран');
assert(HTML.includes('sections.forEach(function(sec2){(sec2.squares||[]).forEach'),
  'события собираются со всех секций в порядке документа');
assert(HTML.includes('cache.events.push({sec:sec2,sq:sq,ev:ev,ei:ei,cell:k})'),
  'в событии сохраняется его секция');
assert(HTML.includes('var key=(e.sec&&e.sec.key) || currentKey()'),
  'ключ каждого события — из его собственной секции');
assert(HTML.includes('voiceLead(name,(far.sec&&far.sec.key)||currentKey()'),
  'fallback за пределом 2048 тоже берёт ключ из секции дальней ячейки');
ok('linkedSelection: обход по всей песне, prev через границы секций, ключ по секции ячейки');

// 3. UI-подпись и комментарии
assert(HTML.includes('Голосоведение по всей песне'), 'подпись переключателя обновлена');
assert(!HTML.includes('Голосоведение внутри секции'), 'старой подписи нет');
assert(HTML.includes('0.790 (B-118)'), 'комментарий 0.790 на месте');
ok('UI: «Голосоведение по всей песне»');

// 4. Защита ручного и старых песен не тронута
assert(HTML.includes('if(!t || !t.linkedVoicings || !cell)return null;'),
  'без галочки linkedVoicings выбор прежний (старые песни)');
assert(HTML.includes('if(exact){cache.prev=exact.slice();'), 'exactNotes ручной расчёт имеет приоритет и задаёт prev');
// 0.795 (№21, якорь-ячейка): per-cell вариант приоритетнее v:<аккорд>
assert(HTML.includes("var manual=t.voicings[e.cell];"), 'per-cell ручной индекс — первый приоритет (0.795)');
assert(HTML.includes("if(!Number.isInteger(manual))manual=t.voicings['v:'+chord];"), 'v:<аккорд> — запасной приоритет (0.795)');
ok('ручной выбор (exactNotes/индекс) и старые песни без галочки — без изменений');

// 5. Тест 0.720 обновлён под новую подпись
const T720 = fs.readFileSync(path.join(ROOT, 'dev/tests/b39-linked-voicings-0720.js'), 'utf8');
assert(T720.includes('Голосоведение по всей песне'), 'b39-linked-voicings-0720.js: regex подписи обновлён');
ok('b39-linked-voicings-0720.js под новую подпись');

console.log('\n0.790 B-118 (статический контракт): все проверки пройдены (' + groups + ' групп)');
