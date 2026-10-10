#!/usr/bin/env node
/*
 * b599-borrowing-chain.js — версия 0.599 (решения пользователя после 0.598).
 *  1. Одиночный заимствованный аккорд, который укладывается хотя бы в один лад,
 *     получает слабую группу borrowed-unconfirmed и степень из круга
 *     (getBorrowingMenuProfile). Лад называется, только если он единственный.
 *  2. Цепочка вторичных доминант считается с конца: E → A → D → G даёт
 *     V/V/V/V, V/V/V, V/V, V.
 *  3. Круг и ячейка показывают одну и ту же степень.
 *  4. Тональность песни от этих подписей не меняется.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'STRUCHORD.html'), 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/',
  beforeParse(win) {
    win.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    win.cancelAnimationFrame = (id) => clearTimeout(id);
    win.HTMLCanvasElement.prototype.getContext = () => ({
      font: '', measureText: () => ({ width: 10 }), clearRect() {}, beginPath() {}, arc() {}, fill() {},
      stroke() {}, moveTo() {}, lineTo() {}, closePath() {}, save() {}, restore() {}, translate() {},
      rotate() {}, fillText() {}, strokeText() {}, setTransform() {}, scale() {},
      createLinearGradient: () => ({ addColorStop() {} }),
    });
  },
});
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function () {
  return { currentTime: 0, state: 'running', resume() {}, sampleRate: 44100,
    createBuffer: (c, len) => ({ getChannelData: () => new Float32Array(len) }) };
};

let pass = 0;
let fail = 0;
function check(name, cond, details) {
  if (cond) { pass++; console.log('ok   ' + name); }
  else { fail++; console.error('FAIL ' + name + (details ? ' (' + details + ')' : '')); }
}
const ev = (code) => w.eval(code);
const analyze = (chord, key, opts = {}) => ev(`analyzeChordHarmony(${JSON.stringify(chord)}, ${JSON.stringify(key)}, ${JSON.stringify(opts)})`);
const sectionOf = (chords) => ev(`analyzeSectionHarmony({ key: 'C', squares: [{ events: ${JSON.stringify(chords.map((c) => ({ chord: c, span: 4 })))} }] }, 'C')`)
  .map((a) => ({ chord: a.chord, group: a.group, degree: a.degree, fn: a.function || '' }));

console.log('=== 1. слабые заимствования ===');
const bb = analyze('Bb', 'C');
check('Bb в C: группа borrowed-unconfirmed, confidence weak', bb.group === 'borrowed-unconfirmed' && bb.confidence === 'weak', JSON.stringify(bb));
check('Bb в C: степень ♭VII из круга, лад не назван (три лада)', bb.degree === '♭VII' && bb.mode === null && bb.candidates.length === 3, JSON.stringify(bb));
check('Bb в C: подпись без имени лада', !ev(`getHarmonyAccessibleText(analyzeChordHarmony('Bb','C',{}))`).includes('Лад:'));
check('Bb в C: профиль подсветки borrowed-unconfirmed', ev(`getHarmonyPresentationProfile(analyzeChordHarmony('Bb','C',{}))`) === 'borrowed-unconfirmed');
const fm = analyze('Fm', 'C');
check('Fm в C: слабая группа, степень iv', fm.group === 'borrowed-unconfirmed' && fm.degree === 'iv', JSON.stringify(fm));
const d = analyze('D', 'C');
check('D в C: единственный лад lydian назван в подписи', d.candidates.length === 1 && d.candidates[0] === 'lydian' && d.mode === null, JSON.stringify(d));
check('D в C: подпись содержит «Лидийский»', ev(`getHarmonyAccessibleText(analyzeChordHarmony('D','C',{}))`).includes('Лидийский'));
const caug = analyze('Caug', 'C');
check('Caug в C (не укладывается ни в один лад) остаётся unknown', caug.group === 'unknown', JSON.stringify(caug));

console.log('=== 2. цепочка вторичных доминант с конца ===');
const chain = sectionOf(['E', 'A', 'D', 'G']);
check('E → A → D → G: D = V/V', chain[2].fn === 'V/V', JSON.stringify(chain));
check('E → A → D → G: A = V/V/V', chain[1].fn === 'V/V/V', JSON.stringify(chain));
check('E → A → D → G: E = V/V/V/V', chain[0].fn === 'V/V/V/V', JSON.stringify(chain));
check('E → A → D → G: G остаётся диатоничной V', chain[3].group === 'diatonic' && chain[3].degree === 'V', JSON.stringify(chain));
const plain = sectionOf(['C', 'F', 'Bb', 'C']);
check('C F Bb C: Bb без вторичной цели остаётся слабым заимствованием', plain[2].group === 'borrowed-unconfirmed' && plain[2].fn === '', JSON.stringify(plain));

console.log('=== 3. круг и ячейка согласованы ===');
for (const chord of ['Bb', 'Ab', 'Fm', 'D', 'Gm']) {
  const cell = analyze(chord, 'C');
  const menu = ev(`getBorrowingMenuProfile(${JSON.stringify(chord)}, 'C')`);
  check(`${chord} в C: степень ячейки = степень круга`, cell.degree === menu.degree, `${cell.degree} vs ${menu.degree}`);
}

console.log('=== 4. тональность не меняется ===');
ev(`sections = [{ squares: [{ events: ${JSON.stringify(['C', 'F', 'Bb', 'C'].map((c) => ({ chord: c, span: 4 })))} }] }]; globalTimeSig = '4/4';`);
check('C F Bb C → тональность C', ev('detectKeyFromChords()') === 'C', ev('detectKeyFromChords()'));

console.log(`\nПРОВАЛОВ: ${fail}  (ок: ${pass})`);
process.exit(fail ? 1 : 0);
