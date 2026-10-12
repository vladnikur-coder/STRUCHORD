#!/usr/bin/env node
/*
 * b602-nashville-input.js — версия 0.602/0.603 (баг «Нэшвилл: слэш-аккорды»).
 *  1. normalizeChordCase идемпотентна для записей, которые не начинаются с буквы:
 *     5/7 остаётся 5/7 (раньше росло 5/7 → 5/7/7 → 5/7/7/7).
 *  2. nashvilleToChord(x, null|undefined) → null, без исключения.
 *  3. С тональностью слэш работает: C: 5/7 → G/B, 1/3 → C/E; Am: 5/7 → Em/G, 1/3 → Am/C.
 *  4. Без тональности нэшвиллский ввод не сохраняется, показывается подсказка (saveCurrentChord).
 *     Буквенные имена (C, Bb, Dm7, b7 = B7) этим не затрагиваются.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'STRUCHORD.html'), 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/?view=editor',
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

console.log('=== 1. нормализация идемпотентна ===');
check('normalizeChordCase(5/7) = 5/7', ev(`normalizeChordCase('5/7')`) === '5/7');
check('normalizeChordCase(1/3/3) = 1/3/3 (без нового баса)', ev(`normalizeChordCase('1/3/3')`) === '1/3/3');
for (const x of ['5/7', '1/3', '5', 'bVII/1', 'C/E', 'cm7', 'Bb/D', '#4']) {
  const once = ev(`normalizeChordCase(${JSON.stringify(x)})`);
  const twice = ev(`normalizeChordCase(normalizeChordCase(${JSON.stringify(x)}))`);
  check(`идемпотентность: ${x}`, once === twice, `${once} / ${twice}`);
}
check('буквенные имена не меняются: C/E → C/E, Dm7 → Dm7', ev(`normalizeChordCase('C/E')`) === 'C/E' && ev(`normalizeChordCase('Dm7')`) === 'Dm7');

console.log('=== 2. nashvilleToChord без тональности ===');
check('nashvilleToChord(5/7, null) = null', ev(`nashvilleToChord('5/7', null)`) === null);
check('nashvilleToChord(5/7, undefined) = null', ev(`nashvilleToChord('5/7', undefined)`) === null);

console.log('=== 3. слэш с тональностью ===');
check('5/7 в C → G/B', ev(`nashvilleToChord('5/7', 'C')`) === 'G/B');
check('1/3 в C → C/E', ev(`nashvilleToChord('1/3', 'C')`) === 'C/E');
check('5/7 в Am → Em/G', ev(`nashvilleToChord('5/7', 'Am')`) === 'Em/G');
check('1/3 в Am → Am/C', ev(`nashvilleToChord('1/3', 'Am')`) === 'Am/C');

console.log('=== 4. признак нэшвиллского ввода без тональности ===');
for (const x of ['5/7', '1/3', '5', '1/x', '#4', 'bVII', 'ii', 'V', 'шестая']) {
  check(`без тональности «${x}» — нэшвилл`, ev(`looksLikeNashvilleWithoutKey(${JSON.stringify(x)})`) === true);
}
for (const x of ['C', 'Cm', 'Bb', 'Dm7', 'C/E', 'b7', 'Cadd9', 'E', 'bb']) {
  check(`без тональности «${x}» — буквенное имя, не блокируется`, ev(`looksLikeNashvilleWithoutKey(${JSON.stringify(x)})`) === false);
}

console.log('=== 5. saveCurrentChord без тональности не пишет ===');
// Автоматический режим, тональность не определена.
ev(`keyMode = 'auto'; autoDetectedKey = null; globalKey = 'C';`);
check('getEffectiveKey() = null в авто-режиме без детекции', ev(`getEffectiveKey()`) === null);
const inp = w.document.createElement('input');
inp.value = '5/7';
inp.dataset.sec = '999999'; inp.dataset.square = '0'; inp.dataset.ei = '0';
w.document.body.appendChild(inp);
ev(`activeChordInput = document.querySelectorAll('input')[document.querySelectorAll('input').length - 1]`);
const saved = ev(`saveCurrentChord()`);
check('saveCurrentChord без тональности возвращает false', saved === false, String(saved));
check('ввод 5/7 остаётся в поле, не переписывается в 5/7/7', ev(`activeChordInput.value`) === '5/7');
const toast = ev(`document.getElementById('toast') ? document.getElementById('toast').textContent : (DOM && DOM.toast ? DOM.toast.textContent : '')`);
check('показана подсказка «Задайте тональность…»', String(toast).includes('Задайте тональность'), String(toast));

console.log(`\nИТОГО: пройдено ${pass}, провалено ${fail}`);
process.exit(fail ? 1 : 0);
