// 0.795 · B-39 этап 2 (бэклог №22): ползунок «Насыщенность» управляет
// preferDoubling (октавные удвоения корня/квинты — формы как в uploads/акк.mov)
// и через endAccentEnabled — акцентом 13/9. Этап 1 (№21): per-cell якорь.
// Запуск: node dev/tests/b39-saturation-0795.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const ROOT = path.join(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'STRUCHORD.html'), 'utf8');
const ACC = fs.readFileSync(path.join(ROOT, 'keyboard-accompaniment.js'), 'utf8');

let passed = 0;
function ok(name) { passed++; console.log('  ok  ' + name); }

// --- vm-прогон модуля keyboard-hand-voicings из STRUCHORD.html ---
const START = '(function(){let module={exports:{}},require=function(){throw Error("unexpected require")};';
const END = 'return module.exports;})()';
const i0 = HTML.indexOf(START), i1 = HTML.indexOf(END);
assert(i0 >= 0 && i1 > i0, 'модуль hand-voicings найден в HTML');
const hand = vm.runInNewContext('(' + HTML.slice(i0, i1 + END.length) + ')', {});
assert(typeof hand.planSequence === 'function', 'planSequence доступен');

const C = [{ bassPc: 0, tones: [0, 4, 7], beats: 4 }];   // C-мажор, 1 такт
function rightLen(opts) {
  const r = hand.planSequence(Object.assign({ chords: C, low: 36, high: 88, bpm: 120, role: 'verse' }, opts));
  assert(r.ok, 'planSequence ok: ' + JSON.stringify(r));
  return r.voices[0].right.length;
}

// Поле absent — прежнее поведение: удвоение только в припеве.
assert.strictEqual(rightLen({ role: 'verse' }), 3, 'absent + verse: без удвоения');
ok('absent + verse (legacy): правая рука из 3 нот');
assert.strictEqual(rightLen({ role: 'chorus' }), 4, 'absent + chorus: удвоение (legacy, как в акк.mov)');
ok('absent + chorus (legacy): корень удвоён октавой — 4 ноты, как на видео');

// Ползунок: <60 — без удвоений везде; >=60 — удвоение при beats>=2 и bpm<=140.
assert.strictEqual(rightLen({ saturation: 50, role: 'chorus' }), 3, 'sat 50: без удвоения даже в припеве');
assert.strictEqual(rightLen({ saturation: 70, role: 'verse' }), 4, 'sat 70 + verse: удвоение');
assert.strictEqual(rightLen({ saturation: 100, role: 'intro' }), 4, 'sat 100 + intro: удвоение');
ok('saturation 50/70/100: порог 60 управляет удвоением в любой роли');

assert.strictEqual(rightLen({ saturation: 70, role: 'verse', chords: [{ bassPc: 0, tones: [0, 4, 7], beats: 1 }] }), 3, 'sat 70, но beats<2: без удвоения');
assert.strictEqual(rightLen({ saturation: 70, role: 'verse', bpm: 160 }), 3, 'sat 70, но bpm>140: без удвоения');
ok('границы: удвоение только при beats>=2 и bpm<=140 (как и в legacy)');

// --- статические контракты 0.795 ---
// Этап 1 (№21): per-cell якорь.
assert(HTML.includes('var idx = variantIndex(trackId, chordName, cell) % variants.length;'), 'voicingProvider: реальный cell в variantIndex');
assert(HTML.includes('if (cellKey && T && typeof T.track === \'function\') {'), 'variantIndex: per-cell первый приоритет');
assert(HTML.includes('if (T && cellKey && typeof T.setVoicing === \'function\') T.setVoicing(trackId, cellKey, next);'), 'setVariantIndex: запись per-cell при выбранной ячейке');
ok('№21: per-cell voicings[cell] приоритетнее v:аккорд, voicingProvider читает cell');

// Этап 2 (№22): данные и API.
assert(HTML.includes('saturation:50} : {}'), 'новая дорожка: насыщенность 50 по умолчанию');
assert(/function setSaturation\(id, value\)/.test(HTML), 'API setSaturation');
assert(HTML.includes('setSaturation:setSaturation'), 'setSaturation экспортирован');
assert(HTML.includes("dispatch('b39/saturation'"), 'setSaturation пишет через dispatch (undo)');
assert(HTML.includes('saturation:Number.isInteger(track.saturation)?track.saturation:null'), 'prepare(): насыщенность в генератор');
assert(HTML.includes("const preferDoubling=chord.beats>=2 && bpm<=140 && (satN===null ? role==='chorus' : satN>=60);"), 'planSequence: preferDoubling от ползунка');
assert(HTML.includes("satN===null?1:0.75+satN/250"), 'generatePerformance: плотность роли масштабируется ползунком');
ok('№22: поле track.saturation, API, проводка в генератор и плотность роли');

// Этап 2: UI-ползунок и акцент 13/9.
assert(HTML.includes("sat.id='b39AutoSaturation'"), 'диалог авто: ползунок #b39AutoSaturation');
assert(HTML.includes('T().setSaturation(dialogTrack,Number(saturationInput.value))'), 'применение сохраняет насыщенность');
assert(ACC.includes('if (t && Number.isInteger(t.saturation)) return t.saturation >= 80;'), 'endAccentEnabled: 13/9 при насыщенности >= 80');
assert(ACC.includes('return !t || t.endAccent !== false;'), 'endAccentEnabled: legacy-ветка для старых песен сохранена');
ok('№22: ползунок в UI, акцент 13/9 от насыщенности, legacy для старых песен');

console.log(`\n0.795 (этапы 1+2, №21+№22): все проверки пройдены (${passed} групп)`);
