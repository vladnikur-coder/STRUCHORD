// 0.803 · B-39 (№27): насыщенность = богатство звука, плавные кривые.
//
// Главный контракт волны: ползунок меняет ТОЛЬКО вертикаль (сколько нот звучит
// в атаке) — сетка атак, ритм и плотность не трогаются; кривые плавные (без
// порогов 60/80), решения детерминированы; старые песни без поля и ручные
// рисунки звучат как раньше. Плотность ушла из-под ползунка (станет
// «Интенсивностью», №28). Запуск: node dev/tests/b39-saturation-smooth-0803.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'STRUCHORD.html'), 'utf8');
const ACC = fs.readFileSync(path.join(ROOT, 'keyboard-accompaniment.js'), 'utf8');
const SW = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

let passed = 0;
function ok(name) { passed++; console.log('  ok  ' + name); }

// --- R7: версия и кэш парой (>= 0.803) ---
const verM = HTML.match(/· ver 0\.(\d+)/);
const swM = SW.match(/CACHE_NAME = 'struchord-v(\d+)'/);
assert(verM && Number(verM[1]) >= 803, 'версия в шапке >= 0.803');
assert(swM && swM[1] === verM[1], 'кэш Service Worker синхронен с версией');
ok('R7: ver >= 0.803 + синхронный struchord-vNNN');

// --- Порогов больше нет, кривые на месте (генератор, панель, блоковый авто) ---
for (const gone of ['satN>=60', 'sat >= 60', 'sat >= 80', 't.saturation >= 80', '0.75+satN/250'])
  assert(!HTML.includes(gone) && !ACC.includes(gone), 'порог/множитель исчез: ' + gone);
assert(HTML.includes('function satSmooth(t) { t=Math.max(0,Math.min(1,t)); return t*t*(3-2*t); }'), 'satSmooth (генератор)');
assert(HTML.includes('function satHash(seed,i,salt)'), 'satHash (генератор)');
assert(HTML.includes('function satCurveBetween(v, from, to)'), 'satCurveBetween (панель)');
assert(HTML.includes('function satHashStr(s, salt)'), 'satHashStr (панель)');
assert(ACC.includes('function accentRand(s)'), 'accentRand (блоковый авто)');
assert(ACC.includes('hbase + \'#\' + (bar / perBar)'), 'решение по тактам, а не по всей секции');
assert(HTML.includes('saturation,seed});   // 0.795 (№22); 0.803 (№27)'), 'buildSection передаёт seed в planSequence');
ok('статика: порогов нет, кривые и хэши в генераторе/панели/авто');

// --- Интеграция: перф-модуль из HTML с настоящим hand-модулем ---
const HSTART = '(function(){let module={exports:{}},require=function(){throw Error("unexpected require")};';
const HEND = 'return module.exports;})()';
const hand = vm.runInNewContext('(' + HTML.slice(HTML.indexOf(HSTART), HTML.indexOf(HEND) + HEND.length) + ')', {});
const moduleStart = HTML.indexOf('perf=(function(){let module={exports:{}},require=function(){return hand}');
const moduleEnd = HTML.indexOf('return module.exports;})(),section=', moduleStart);
assert(moduleStart > 0 && moduleEnd > moduleStart, 'перф-модуль найден в HTML');
let expression = HTML.slice(moduleStart, moduleEnd + 'return module.exports;})()'.length);
expression = expression.replace('return module.exports;})()', 'return {generatePerformance};})()');
const perf = new Function('hand', 'return ' + expression.slice('perf='.length))(hand);

const chords = Array.from({ length: 4 }, () => ({ bassPc: 0, tones: [0, 4, 7], beats: 4 }));
function gen(extra) {
  return perf.generatePerformance(Object.assign({ chords, low: 36, high: 88, bpm: 88, meter: '4/4', genre: 'pop', role: 'chorus', swing: false, seed: 5, phraseSeed: 42 }, extra));
}
const g0 = gen({ saturation: 0 }), g40 = gen({ saturation: 40 }), g100 = gen({ saturation: 100 });

// Суть волны: сетка атак не зависит от ползунка — меняется только вертикаль.
const grid = (notes, h) => [...new Set(notes.filter(n => n.hand === h).map(n => +n.beat.toFixed(4)))].sort((a, b) => a - b).join(',');
assert.strictEqual(grid(g0.notes, 'R'), grid(g40.notes, 'R'), 'сетка атак правой руки: sat 0 == sat 40');
assert.strictEqual(grid(g40.notes, 'R'), grid(g100.notes, 'R'), 'сетка атак правой руки: sat 40 == sat 100');
assert.strictEqual(grid(g0.notes, 'L'), grid(g100.notes, 'L'), 'сетка атак левой руки неизменна');
ok('ритм не тронут: сетки атак обеих рук идентичны при sat 0/40/100');

// Богатство растёт: шелл (0) < трезвучие (40) < удвоение (100).
assert(g0.notes.length < g40.notes.length, `sat 0 < sat 40 по нотам: ${g0.notes.length} vs ${g40.notes.length}`);
assert(g40.notes.length < g100.notes.length, `sat 40 < sat 100 по нотам: ${g40.notes.length} vs ${g100.notes.length}`);
ok(`вертикаль растёт: ${g0.notes.length} → ${g40.notes.length} → ${g100.notes.length} нот`);

// Детерминизм и повторяемость.
assert.deepStrictEqual(gen({ saturation: 65 }), gen({ saturation: 65 }), 'sat 65 детерминирован');
const legacy1 = gen({}), legacy2 = gen({});
assert.deepStrictEqual(legacy1, legacy2, 'legacy (без поля) детерминирован');
assert.strictEqual(legacy1.notes.length, g100.notes.length, 'legacy chorus: удвоение как в 0.795 (роль решает)');
ok('детерминизм: повторные вызовы идентичны; legacy-путь припева сохранён');

// --- endAccentEnabled: кривая 70–100 через vm с заглушкой HOST ---
const eaStart = ACC.indexOf('    function endAccentEnabled(o) {');
assert(eaStart > 0, 'endAccentEnabled найден');
const eaEnd = ACC.indexOf('\n    }\n', eaStart);
assert(eaEnd > eaStart, 'конец endAccentEnabled найден');
let TRACK = {};
const eaSandbox = { HOST: { StruChordTracks: { track: () => TRACK } } };
vm.createContext(eaSandbox);
vm.runInContext(ACC.slice(eaStart, eaEnd + 6) + '\nthis.endAccentEnabled = endAccentEnabled;', eaSandbox);
const ea = eaSandbox.endAccentEnabled;
const smooth = (x) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
TRACK = { saturation: 70 };  assert.strictEqual(ea({ trackId: 1 }), 0, 'sat 70 -> 0');
TRACK = { saturation: 100 }; assert.strictEqual(ea({ trackId: 1 }), 1, 'sat 100 -> 1');
TRACK = { saturation: 85 };  assert.strictEqual(ea({ trackId: 1 }), smooth(0.5), 'sat 85 -> smoothstep(0.5)');
TRACK = { saturation: 50 };  assert.strictEqual(ea({ trackId: 1 }), 0, 'sat 50 -> 0 (дефолт без акцента)');
TRACK = { saturation: 95 };  assert.ok(Math.abs(ea({ trackId: 1 }) - smooth(25 / 30)) < 1e-12, 'sat 95 -> smoothstep(25/30)');
TRACK = {};                  assert.strictEqual(ea({ trackId: 1 }), true, 'legacy: поля нет -> акцент включён (0.789)');
TRACK = { endAccent: false };assert.strictEqual(ea({ trackId: 1 }), false, 'legacy: endAccent:false -> выключен');
ok('endAccentEnabled: кривая smoothstep((sat-70)/30), legacy-булевы целы');

console.log(`\n0.803 (№27): насыщенность = богатство звука — все проверки пройдены (${passed} групп)`);
