'use strict';
// 0.787 · B-115: щелчок электрооргана — тест обновлён в 0.788 (B-116).
//
// История: в 0.787 щелчок клавиши стал тише (~×0.3, life.clickVar) и
// перкуссия тон-колёс звучала только на новой атаке (life.percussive).
// После жалобы «орган всё ещё щелкает, атака слишком жёсткая» владелец
// (R8 №4) решил убрать синтетические щелчок и перкуссию СОВСЕМ и перевести
// орган на WAV-сэмплы с атакой ~20 мс — см. b39-organ-attack-0788.js.
// Этот файл теперь хранит СТАТИЧЕСКИЙ контракт пост-0.788: organAttack
// удалена целиком, clickVar/percussive ушли из lifeFor, атака 20 мс,
// орган в manifest.json — только WAV.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'STRUCHORD.html'), 'utf8');
const AUDIO = fs.readFileSync(path.join(ROOT, 'keyboard-audio.js'), 'utf8');
let groups = 0;
const ok = (msg) => { groups++; console.log('  ok  ' + msg); };

// ---------------------------------------------------------------------------
// 1. R7: версия и кэш — парой, версия динамическая
// ---------------------------------------------------------------------------
const VER = (HTML.match(/· ver (\d+\.\d+)/) || [])[1];
assert(VER && /^\d+\.\d+$/.test(VER), 'версия в шапке HTML читается: ' + VER);
assert(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').includes('struchord-v' + VER.split('.')[1]),
  'R7: CACHE_NAME struchord-v' + VER.split('.')[1] + ' выложен парой с версией ' + VER);
ok('R7: версия ' + VER + ' в HTML и CACHE_NAME в sw.js — парой (динамически)');

// ---------------------------------------------------------------------------
// 2. Статический контракт 0.788: щелчка и перкуссии больше нет вообще
// ---------------------------------------------------------------------------
assert(!AUDIO.includes('function organAttack'), 'organAttack удалена целиком (функции нет)');
assert(!AUDIO.includes('organAttack(ctx'), 'вызова organAttack нет');
assert(!AUDIO.includes('clickVar'), 'life.clickVar ушёл вместе со щелчком');
assert(!AUDIO.includes('percussive'), 'life.percussive ушёл вместе с перкуссией');
assert(AUDIO.includes("var attack=mode==='pad'?.14:mode==='organ'?.02:.004,end=start+held;"),
  'атака сэмпла органа ~20 мс (0.788), pad и остальные как были');
assert(AUDIO.includes('tonejs-instrument-organ-wav'), 'кредиты: орган = tonejs-instrument-organ-wav (MIT)');
assert(!AUDIO.includes('hammondman'), 'прежний источник органа (hammondman/piano-block) убран из кредитов');
ok('контракт 0.788: нет ни щелчка, ни перкуссии, атака органа ~20 мс, новые кредиты');

// ---------------------------------------------------------------------------
// 3. Манифест: орган — только WAV из нового источника
// ---------------------------------------------------------------------------
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'sounds', 'manifest.json'), 'utf8'));
const organ = manifest.organ;
assert.strictEqual(organ.length, 7, 'у органа 7 нот');
const midis = organ.map(e => e.midi).sort((a, b) => a - b);
assert.deepStrictEqual(midis, [42, 48, 54, 60, 66, 72, 78],
  'ноты-источники tonejs-instrument-organ-wav: Fs2/C3/Fs3/C4/Fs4/C5/Fs5');
for (const e of organ) {
  assert(e.file.endsWith('.wav'), e.file + ': WAV, не mp3');
  const buf = fs.readFileSync(path.join(ROOT, 'sounds', e.file));
  assert.strictEqual(buf.slice(0, 4).toString('latin1'), 'RIFF', e.file + ': настоящий WAV');
  assert(buf.length > 100000, e.file + ': файл не пустой');
}
assert(!fs.readdirSync(path.join(ROOT, 'sounds', 'organ')).some(f => f.endsWith('.mp3')),
  'старые mp3 органа удалены из sounds/organ/');
ok('manifest: орган — 7 WAV-нот (источники 42/48/54/60/66/72/78), mp3 удалены');

console.log('\n0.787->0.788 B-116 (статический контракт): все проверки пройдены (' + groups + ' групп)');
