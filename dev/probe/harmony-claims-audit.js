#!/usr/bin/env node
/*
 * harmony-claims-audit.js — ЗОНД (только чтение, правок в приложении нет).
 *
 * Назначение: проверить по одной каждый пункт из списка «Ошибки, дающие
 * неверный результат», присланного пользователем (2026-10-07). Зонд не
 * исправляет ничего — он показывает фактическое поведение функций
 * STRUCHORD.html, чтобы решение принималось по замеру, а не по коду.
 *
 * Запуск:  node dev/probe/harmony-claims-audit.js
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
const row = (label, value) => line('  ' + String(label).padEnd(34) + ' -> ' + JSON.stringify(value));

line('\n=== 1. expandChordName: add-хвосты, оканчивающиеся на 4/2 ===');
for (const n of ['Cadd4', 'Cadd2', 'Cadd9', 'Cadd11', 'C2', 'C4', 'Csus4', 'C11', 'C6/9', 'Amadd9', 'C5']) {
  row(n, w.eval(`expandChordName(${JSON.stringify(n)})`));
}

line('\n=== 1б. Что дают эти имена в нотах (getChordNotes, C major = sharp style) ===');
for (const n of ['Cadd4', 'Caddsus4', 'Cadd2', 'Caddsus2', 'Csus4', 'Csus2', 'Cadd9']) {
  row(n, w.eval(`getChordNotes(${JSON.stringify(n)}, 'sharp')`));
}

line('\n=== 3. buildChordName: девятые (интервалы — классы высот 0..11) ===');
const shapes = {
  'Cadd4  (0,4,5,7)': [0, 4, 5, 7],
  'Cadd2  (0,2,4,7)': [0, 2, 4, 7],
  'C9     (0,2,4,7,10)': [0, 2, 4, 7, 10],
  'Cm9    (0,2,3,7,10)': [0, 2, 3, 7, 10],
  'Cmaj9  (0,2,4,7,11)': [0, 2, 4, 7, 11],
  'Cm11   (0,2,3,5,7,10)': [0, 2, 3, 5, 7, 10],
  'Cm7b5  (0,3,6,10)': [0, 3, 6, 10],
  'C7#9 Hendrix (0,3,4,7,10)': [0, 3, 4, 7, 10],
  'C7b9   (0,1,4,7,10)': [0, 1, 4, 7, 10],
  'Cm7b9  (0,1,3,7,10)': [0, 1, 3, 7, 10],
};
for (const [label, iv] of Object.entries(shapes)) {
  row(label, w.eval(`buildChordName('C', ${JSON.stringify(iv)})`));
}

line('\n=== 2. ♭/♯ в именах: getChordNotes ===');
for (const n of ['Cm7b5', 'Cm7♭5', 'C7(b9)', 'C7(♭9)', 'C7(#5)', 'C7(♯5)', 'C(#11)', 'C(♯11)']) {
  row(n, w.eval(`getChordNotes(${JSON.stringify(n)}, 'sharp')`));
}
line('  --- ожидание для сравнения ---');
row('Cm7b5 должно быть', ['C4', 'D#4', 'G4' /*если квинта не понижена*/].join(' ') + '  <-- спорно');
row('Cm7 (эталон)', w.eval(`getChordNotes('Cm7', 'sharp')`));

line('\n=== 2б. normalizeChordCase не трогает ♭/♯ ===');
for (const n of ['Cm7♭5', 'C7(♭9)', 'C(♯5)']) {
  row(n, w.eval(`normalizeChordCase(${JSON.stringify(n)})`));
}

line('\n=== 5. SHARP_TO_FLAT и нота Cb ===');
row("SHARP_TO_FLAT['B']", w.eval("SHARP_TO_FLAT['B']"));
for (const k of ['F', 'Bb', 'Gb', 'Cb', 'C']) {
  row(`getKeyStyle('${k}')`, w.eval(`getKeyStyle(${JSON.stringify(k)})`));
}
line('  --- аккорды в бемольных тональностях ---');
for (const [cn, k] of [['Em', 'F'], ['G7', 'Bb'], ['Bdim', 'Bb'], ['Em', 'Gb'], ['Em', 'Cb']]) {
  const ks = w.eval(`getKeyStyle(${JSON.stringify(k)})`);
  row(`${cn} в ${k} (${ks})`, w.eval(`getChordNotes(${JSON.stringify(cn)}, ${JSON.stringify(ks)})`));
}
line('  --- частота Cb ---');
row('noteToFrequency("Cb")', w.eval("noteToFrequency('Cb')"));
row('noteToFrequency("B4")', w.eval("noteToFrequency('B4')"));
row('noteToFrequency("B")', w.eval("noteToFrequency('B')"));

line('\n=== 5б. Ступени: правописание по стилю тональности, а не по букве ===');
for (const [cn, k] of [['Em', 'F'], ['G7', 'F'], ['Am', 'C'], ['F', 'F#'], ['B', 'Gb']]) {
  row(`getScaleDegree(${cn}, ${k})`, w.eval(`getScaleDegree(${JSON.stringify(cn)}, ${JSON.stringify(k)})`));
}
row('getScaleNotes("F")', w.eval("getScaleNotes('F')"));
row('getScaleNotes("F#")', w.eval("getScaleNotes('F#')"));
row('getScaleNotes("Gb")', w.eval("getScaleNotes('Gb')"));

line('\n=== 6. nashvilleToChord: римские цифры ===');
for (const [inp, k] of [['ii', 'C'], ['IV', 'C'], ['vi', 'C'], ['I', 'C'], ['i', 'C'], ['V', 'C'], ['v', 'C'], ['vii', 'C']]) {
  row(`${inp} в ${k}`, w.eval(`nashvilleToChord(${JSON.stringify(inp)}, ${JSON.stringify(k)})`));
}
line('  --- минорная тональность ---');
for (const [inp, k] of [['I', 'Am'], ['i', 'Am'], ['III', 'Am'], ['VI', 'Am'], ['VII', 'Am'], ['ii', 'Am'], ['v', 'Am']]) {
  row(`${inp} в ${k}`, w.eval(`nashvilleToChord(${JSON.stringify(inp)}, ${JSON.stringify(k)})`));
}
line('  --- числа Нэшвилла в миноре ---');
for (const [inp, k] of [['1', 'Am'], ['3', 'Am'], ['6', 'Am'], ['7', 'Am'], ['2', 'Am'], ['5', 'Am']]) {
  row(`${inp} в ${k}`, w.eval(`nashvilleToChord(${JSON.stringify(inp)}, ${JSON.stringify(k)})`));
}
line('  --- b-ступени ---');
for (const [inp, k] of [['b7', 'C'], ['bVII', 'C'], ['b3', 'C'], ['#4', 'C'], ['b7', 'F']]) {
  row(`${inp} в ${k}`, w.eval(`nashvilleToChord(${JSON.stringify(inp)}, ${JSON.stringify(k)})`));
}
row("normalizeChordCase('bVII')", w.eval("normalizeChordCase('bVII')"));

line('\n=== Неточности поменьше: sus-ступени и диатоника минора ===');
for (const [cn, k] of [['Dsus4', 'C'], ['Dsus2', 'C'], ['Gsus4', 'C'], ['E', 'Am'], ['E7', 'Am'], ['Dm', 'Am'], ['G', 'Am'], ['Am', 'Am']]) {
  row(`getScaleDegree(${cn}, ${k})`, w.eval(`getScaleDegree(${JSON.stringify(cn)}, ${JSON.stringify(k)})`));
}

line('\n=== parseChordForKeyDetection ===');
for (const n of ['Bm7b5', 'Bm7♭5', 'Bø7', 'Bdim', 'G7', 'G9', 'G11', 'G13', 'Gmaj7', 'Dsus4', 'Bm7b5', 'C/E']) {
  row(n, w.eval(`parseChordForKeyDetection(${JSON.stringify(n)})`));
}

line('\n=== isSecondaryDominant: V/vii° ===');
row("V/vii° (F#7 -> Bdim) в C",
  w.eval(`isSecondaryDominant(parseChordForKeyDetection('F#7'), parseChordForKeyDetection('Bdim'), 'C')`));
row("V/vi   (E7  -> Am)  в C",
  w.eval(`isSecondaryDominant(parseChordForKeyDetection('E7'), parseChordForKeyDetection('Am'), 'C')`));
row("V/ii   (A7  -> Dm)  в C",
  w.eval(`isSecondaryDominant(parseChordForKeyDetection('A7'), parseChordForKeyDetection('Dm'), 'C')`));

line('\n=== Октавы в getChordNotes ===');
for (const n of ['G7', 'C', 'D', 'Am', 'F', 'G']) {
  row(n, w.eval(`getChordNotes(${JSON.stringify(n)}, 'sharp')`));
}

line('\n=== 4. Профиль мелодического минора ===');
row('melodic-minor.qualities', w.eval("HARMONY_MODE_PROFILES['melodic-minor'].qualities"));
row('melodic-minor.intervals', w.eval("HARMONY_MODE_PROFILES['melodic-minor'].intervals"));
row('VI ступень (индекс 5)', w.eval("HARMONY_MODE_PROFILES['melodic-minor'].qualities[5]"));
row('F#m в Am, melodic (должно быть -1)',
  w.eval("getHarmonyModeDegree(parseChordForKeyDetection('F#m'), 'Am', 'melodic-minor')"));
row('F#dim в Am, melodic (должно быть 5)',
  w.eval("getHarmonyModeDegree(parseChordForKeyDetection('F#dim'), 'Am', 'melodic-minor')"));

line('\n=== Профили Крумхансла–Кесслера (KEY_TEMPLATES) ===');
row('шаблоны', w.eval("KEY_TEMPLATES.map(t => t.name + ':' + t.weights.join(','))"));

line('\nГотово.\n');
