// 0.795 → 0.803 · B-39 (№22 → №27): ползунок «Насыщенность» = богатство звука.
// Удвоение корня/квинты (формы как в uploads/акк.mov) — плавная вероятность
// smoothstep((sat-40)/50); ниже нормы — 2-нотный шелл (корень+3-я/7-я) с
// вероятностью smoothstep((40-sat)/40); порогов 60/80 больше нет. Плотность
// атак ползунком не масштабируется (0.803; ей станет «Интенсивность», №28).
// Этап 1 (№21): per-cell якорь. Запуск: node dev/tests/b39-saturation-0795.js
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
const C7 = [{ bassPc: 0, tones: [0, 4, 7, 11], beats: 4 }];   // C7
const C1 = [{ bassPc: 0, tones: [0, 4, 7], beats: 1 }];   // короткая смена
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

// 0.803 (№27): якоря кривой. sat 40 — окна ещё нет и уже нет: ровно 3 ноты;
// sat 100 — удвоение доступно всегда (P=1); sat 0 — «беднее нормы»: шелл.
assert.strictEqual(rightLen({ saturation: 40, seed: 1 }), 3, 'sat 40: окна неактивны');
assert.strictEqual(rightLen({ saturation: 100, seed: 1 }), 4, 'sat 100: удвоение (P=1)');
assert.strictEqual(rightLen({ saturation: 0, seed: 1 }), 2, 'sat 0: 2-нотный шелл (P=1)');
assert.strictEqual(rightLen({ saturation: 0, seed: 1, chords: C7 }), 2, 'sat 0 C7: шелл и для септаккорда');
ok('якоря кривой: sat 0 → шелл (2), sat 40 → трезвучие (3), sat 100 → удвоение (4)');

// Охраны удвоения сохранены; шеллу охраны не нужны (прореживание всегда играбельно).
assert.strictEqual(rightLen({ saturation: 100, seed: 1, chords: C1 }), 3, 'sat 100, но beats<2: без удвоения');
assert.strictEqual(rightLen({ saturation: 100, seed: 1, bpm: 160 }), 3, 'sat 100, но bpm>140: без удвоения');
assert.strictEqual(rightLen({ saturation: 0, seed: 1, chords: C1 }), 2, 'sat 0 и beats<2: шелл остаётся');
ok('охраны: удвоение только при beats>=2 и bpm<=140; шелл — без охран');

// Монотонность: окна удвоения (40–90) и шелла (0–40) не пересекаются, поэтому
// для одного аккорда число нот не убывает по ползунку (реализованный выбор =
// доступность, переходов нет).
for (let seed = 1; seed <= 8; seed++) {
  let prev = -1;
  for (let sat = 0; sat <= 100; sat += 10) {
    const L = rightLen({ saturation: sat, seed });
    assert(L >= prev, `монотонность: seed ${seed}, sat ${sat}: ${L} < ${prev}`);
    prev = L;
  }
}
ok('монотонность: 8 сидов × 11 значений ползунка — без убываний');

// Детерминизм: одинаковый вход — одинаковый результат.
const d1 = hand.planSequence({ chords: C, low: 36, high: 88, bpm: 120, role: 'verse', saturation: 55, seed: 7 });
const d2 = hand.planSequence({ chords: C, low: 36, high: 88, bpm: 120, role: 'verse', saturation: 55, seed: 7 });
assert.deepStrictEqual(d1, d2, 'детерминизм planSequence');
ok('детерминизм: повторный вызов даёт тот же результат');

// Дефолт 50 чуть богаче (R8: окно 40→90): на 40 сидах удвоение встречается,
// но не везде (P(50)≈0.10); на 65 — примерно у половины (P=0.5).
let n4_50 = 0, n4_65 = 0, n2_10 = 0;
for (let s = 1; s <= 40; s++) {
  if (rightLen({ saturation: 50, seed: s }) === 4) n4_50++;
  if (rightLen({ saturation: 65, seed: s }) === 4) n4_65++;
  if (rightLen({ saturation: 10, seed: s }) === 2) n2_10++;
}
assert(n4_50 >= 1 && n4_50 <= 8, 'sat 50: редкое удвоение (1..8 из 40), получили ' + n4_50);
assert(n4_65 >= 12 && n4_65 <= 28, 'sat 65: около половины (12..28 из 40), получили ' + n4_65);
assert(n2_10 >= 30, 'sat 10: шелл почти всегда (>=30 из 40), получили ' + n2_10);
ok('живая шкала: sat 50 → редкие удвоения, 65 → ~половина, 10 → почти всегда шелл');

// --- статические контракты ---
// Этап 1 (№21): per-cell якорь.
assert(HTML.includes('var idx = variantIndex(trackId, chordName, cell) % variants.length;'), 'voicingProvider: реальный cell в variantIndex');
assert(HTML.includes('if (cellKey && T && typeof T.track === \'function\') {'), 'variantIndex: per-cell первый приоритет');
assert(HTML.includes('if (T && cellKey && typeof T.setVoicing === \'function\') T.setVoicing(trackId, cellKey, next);'), 'setVariantIndex: запись per-cell при выбранной ячейке');
ok('№21: per-cell voicings[cell] приоритетнее v:аккорд, voicingProvider читает cell');

// Этап 2 (№22): данные и API (без изменений), 0.803: кривые вместо порогов.
assert(HTML.includes('saturation:50} : {}'), 'новая дорожка: насыщенность 50 по умолчанию');
assert(/function setSaturation\(id, value\)/.test(HTML), 'API setSaturation');
assert(HTML.includes('setSaturation:setSaturation'), 'setSaturation экспортирован');
assert(HTML.includes("dispatch('b39/saturation'"), 'setSaturation пишет через dispatch (undo)');
assert(HTML.includes('saturation:Number.isInteger(track.saturation)?track.saturation:null'), 'prepare(): насыщенность в генератор');
assert(HTML.includes("preferDoubling=chord.beats>=2 && bpm<=140 && satHash(seed,i,1)<satSmooth((satN-40)/50)"), 'planSequence: удвоение — вероятность satHash<satSmooth((sat-40)/50)');
assert(HTML.includes('satHash(seed,i,2)<satSmooth((40-satN)/40)'), 'planSequence: шелл — вероятность smoothstep((40-sat)/40)');
assert(HTML.includes('preferDoubling,preferShell});'), 'planSequence: candidates получает preferShell');
assert(HTML.includes('const shellBonus=preferShell && count===2 ? (Math.min(4,pcs.length)-count)*14+16 : 0;'), 'candidates: shellBonus решительно смещает выбор к шеллу');
assert(!HTML.includes('satN>=60'), 'порог удвоения 60 убран (0.803)');
assert(!HTML.includes('0.75+satN/250'), 'плотность роли не масштабируется ползунком (0.803, уходит в №28)');
ok('№22/№27: поле track.saturation, API, вероятностные кривые, плотность отвязана');

// Этап 2: UI-ползунок и акцент 13/9 (0.803: плавная вероятность 70–100).
assert(HTML.includes("sat.id='b39AutoSaturation'"), 'диалог авто: ползунок #b39AutoSaturation');
assert(HTML.includes('T().setSaturation(dialogTrack,Number(saturationInput.value))'), 'применение сохраняет насыщенность');
assert(ACC.includes('var ax = Math.max(0, Math.min(1, (t.saturation - 70) / 30)); return ax * ax * (3 - 2 * ax);'), 'endAccentEnabled: кривая smoothstep((sat-70)/30)');
assert(ACC.includes('function accentRand(s)'), 'детерминированный хэш такта accentRand');
assert(ACC.includes('if (p < 1 && accentRand(hbase + \'#\' + (bar / perBar)) >= p) continue;'), 'вероятностное решение по тактам');
assert(!ACC.includes('t.saturation >= 80'), 'порог акцента 80 убран (0.803)');
assert(ACC.includes('return !t || t.endAccent !== false;'), 'endAccentEnabled: legacy-ветка для старых песен сохранена');
ok('№22/№27: ползунок в UI, акцент 13/9 по кривой 70–100, legacy для старых песен');

console.log(`\n0.795+0.803 (№21+№22+№27): все проверки пройдены (${passed} групп)`);
