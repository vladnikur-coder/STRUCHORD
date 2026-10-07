#!/usr/bin/env node
/*
 * harmony-claims-audit2.js — ЗОНД (только чтение). Вторая серия проверок:
 * уточнение спорных пунктов списка и поиск пользовательских последствий.
 *
 * Запуск:  node dev/probe/harmony-claims-audit2.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const htmlPath = path.join(__dirname, '..', '..', 'STRUCHORD.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://localhost/',
  beforeParse(win) {
    win.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    win.cancelAnimationFrame = (id) => clearTimeout(id);
    win.HTMLCanvasElement.prototype.getContext = () => ({
      font: '', measureText: () => ({ width: 10 }),
      clearRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {}, moveTo() {},
      lineTo() {}, closePath() {}, save() {}, restore() {}, translate() {}, rotate() {},
      fillText() {}, strokeText() {}, setTransform() {}, scale() {},
      createLinearGradient: () => ({ addColorStop() {} }),
    });
  },
});
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function () {
  return {
    currentTime: 0, state: 'running', resume() {}, sampleRate: 44100,
    createBuffer: (c, len) => ({ getChannelData: () => new Float32Array(len) }),
  };
};
const line = (s) => console.log(s);
const row = (label, value) => line('  ' + String(label).padEnd(40) + ' -> ' + String(value));

line('\n=== A. Полный путь имени ячейки: normalizeChordCase -> expandChordName -> parse ===');
for (const n of ['Bm7b5', 'Bm7♭5', 'Bø7', 'Bø', 'Bdim', 'Bdim7', 'Bm7-5', 'C7(♭9)', 'C7(b9)']) {
  const cc = w.eval(`normalizeChordCase(${JSON.stringify(n)})`);
  const ex = w.eval(`expandChordName(${JSON.stringify(cc)})`);
  const p = w.eval(`parseChordForKeyDetection(${JSON.stringify(ex)})`);
  row(n, `case="${cc}" expand="${ex}" quality=${p ? p.quality : 'null'} dom7=${p ? p.isDominant7 : '-'}`);
}

line('\n=== B. Есть ли E# / Cb в названиях нот: как ломаются СТУПЕНИ в бемольных тональностях ===');
for (const [cn, k] of [['G', 'F'], ['G7', 'F'], ['Em', 'F'], ['Am', 'F'], ['Bdim', 'F'], ['Dm', 'F'], ['C', 'F'],
                       ['G', 'Bb'], ['Dm', 'Bb'], ['Cm', 'Bb'], ['F', 'Bb'], ['Gm', 'Bb'],
                       ['B', 'F#'], ['F', 'F#'], ['C#', 'F#'], ['G#m', 'F#']]) {
  const ks = w.eval(`getKeyStyle(${JSON.stringify(k)})`);
  row(`${cn} в ${k} (${ks})`, `degree="${w.eval(`getScaleDegree(${JSON.stringify(cn)}, ${JSON.stringify(k)})`)}" ` +
    `notes=${JSON.stringify(w.eval(`getChordNotes(${JSON.stringify(cn)}, ${JSON.stringify(ks)})`))}`);
}

line('\n=== C. noteToFrequency и пропажа ноты в озвучке ===');
row('noteToFrequency("Cb4")', w.eval("noteToFrequency('Cb4')"));
row('Number.isNaN(...)', w.eval("Number.isNaN(noteToFrequency('Cb4'))"));
row('filter(Boolean) из 4 нот G7 в Bb',
  w.eval("getChordNotes('G7','flat').map(noteToFrequency).filter(Boolean).length"));
row('то же в диезной тональности (G7 в C)',
  w.eval("getChordNotes('G7','sharp').map(noteToFrequency).filter(Boolean).length"));

line('\n=== D. buildChordName: m13 и соседи (проверка широты бага m9) ===');
const shapes = {
  'Cm13  (0,2,3,7,9,10)': [0, 2, 3, 7, 9, 10],
  'Cm9   (0,2,3,7,10)': [0, 2, 3, 7, 10],
  'Cm11  (0,2,3,5,7,10)': [0, 2, 3, 5, 7, 10],
  'Cm(maj9) (0,2,3,7,11)': [0, 2, 3, 7, 11],
  'C13   (0,2,4,7,9,10)': [0, 2, 4, 7, 9, 10],
  'Cadd9 (0,2,4,7)': [0, 2, 4, 7],
  'Cmadd9 (0,2,3,7)': [0, 2, 3, 7],
};
for (const [label, iv] of Object.entries(shapes)) {
  row(label, w.eval(`buildChordName('C', ${JSON.stringify(iv)})`));
}

line('\n=== E. Альтерации в скобках без септимы ===');
for (const n of ['C(#11)', 'C(♯11)', 'C(b9)', 'C(#5)', 'C(b5)', 'C7(#11)']) {
  row(n, JSON.stringify(w.eval(`getChordNotes(${JSON.stringify(n)}, 'sharp')`)));
}

line('\n=== F. Что реально видит пользователь при вводе (saveCurrentChord-цепочка) ===');
for (const n of ['bVII', 'b7', 'bIII', 'Cadd4', 'Cadd2', 'C2', 'ii', 'IV']) {
  const cc = w.eval(`normalizeChordCase(${JSON.stringify(n)})`);
  const nv = w.eval(`nashvilleToChord(${JSON.stringify(cc)}, 'C')`);
  const ex = w.eval(`expandChordName(${JSON.stringify(cc)})`);
  row(n, `case="${cc}" nashville=${nv === null ? 'null' : '"' + nv + '"'} expand="${ex}"`);
}

line('\n=== G. Где имя с ♭/♯ влияет ещё (аппликатуры) ===');
row("getChordNotes('Cm7♭5','sharp')", JSON.stringify(w.eval("getChordNotes('Cm7♭5','sharp')")));
row("getChordNotes('Cm7b5','sharp')", JSON.stringify(w.eval("getChordNotes('Cm7b5','sharp')")));
row("OPEN_CHORDS['Cm7b5'] есть?", w.eval("!!OPEN_CHORDS['Cm7b5']"));
row("OPEN_CHORDS['Cm7♭5'] есть?", w.eval("!!OPEN_CHORDS['Cm7♭5']"));

line('\nГотово.\n');
