#!/usr/bin/env node
/*
 * b80-ui-scale-slider.js — регрессии регулятора масштаба UI (волна B-80).
 *
 * Масштаб задаётся кнопками «− NNN% +» (шаг 5%) в меню «Тык», которые
 * пишут в единый токен --ui-scale (B-79). Слайдер отвергнут (петля
 * drag↔масштаб внутри масштабируемого меню); список фиксированных
 * вариантов заменён по просьбе на шаговый регулятор.
 *
 * Проверяем:
 *  - разметка регулятора на месте (кнопки −/+, подпись значения);
 *  - функции масштаба присутствуют; clampUiScale приводит к шагу 5% и
 *    границам 25..300; stepUiScale двигает на шаг; кнопки гаснут у краёв;
 *  - ранний inline-скрипт в <head> читает struchord-ui-scale и ставит
 *    --ui-scale ДО первой отрисовки;
 *  - setUiScale/stepUiScale завязаны на localStorage-ключ.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const htmlPath = path.join(__dirname, '..', '..', 'STRUCHORD.html');
const html = fs.readFileSync(htmlPath, 'utf8');

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) {
    pass++;
    console.log('ok   ' + name);
  } else {
    fail++;
    console.error('FAIL ' + name);
  }
}

// --- 1. Разметка шагового регулятора ---
const dom = new JSDOM(html);
const doc = dom.window.document;
const picker = doc.getElementById('struchord-scale-picker');
const minus = doc.getElementById('scaleMinus');
const plus = doc.getElementById('scalePlus');
const value = doc.getElementById('scaleCurrentName');
check('пикер #struchord-scale-picker существует', !!picker);
check('кнопка «−» #scaleMinus зовёт stepUiScale(-1)',
  minus && /stepUiScale\(-1\)/.test(minus.getAttribute('onclick') || ''));
check('кнопка «+» #scalePlus зовёт stepUiScale(1)',
  plus && /stepUiScale\(1\)/.test(plus.getAttribute('onclick') || ''));
check('подпись текущего значения #scaleCurrentName есть', !!value);
check('стартовая подпись 125%', value && value.textContent.trim() === '125%');
check('старого списка вариантов больше нет', !doc.getElementById('scaleList'));
check('старого заголовка-раскрывашки больше нет', !doc.getElementById('scaleHead'));
check('это НЕ нативный select', !doc.getElementById('uiScaleSelect'));
check('слайдера нет', !doc.getElementById('uiScaleSlider'));
check('регулятор внутри меню «Тык» (#toolsDropdown)',
  !!(doc.getElementById('toolsDropdown') &&
     doc.getElementById('toolsDropdown').querySelector('#struchord-scale-picker')));

// --- 2. Функции масштаба в коде ---
check('есть clampUiScale', /function clampUiScale\(/.test(html));
check('есть currentUiScale', /function currentUiScale\(/.test(html));
check('есть writeUiScale', /function writeUiScale\(/.test(html));
check('есть setUiScale', /function setUiScale\(/.test(html));
check('есть stepUiScale', /function stepUiScale\(/.test(html));
check('есть initUiScale', /function initUiScale\(/.test(html));
check('initUiScale вызывается на старте', /\n\s*initUiScale\(\);/.test(html));
check('ключ localStorage struchord-ui-scale', /struchord-ui-scale/.test(html));
check('шаг 5%', /const UI_SCALE_STEP = 5;/.test(html));
check('границы 25..300', /const UI_SCALE_MIN = 25;/.test(html) && /const UI_SCALE_MAX = 300;/.test(html));

// --- 3. clampUiScale: сетка шага 5% и границы 25..300 ---
const m = html.match(/const UI_SCALE_STEP[\s\S]*?function clampUiScale[\s\S]*?\n}/);
check('блок clampUiScale извлекается', !!m);
if (m) {
  const UI_SCALE_DEFAULT = 125;
  // eslint-disable-next-line no-eval
  eval(m[0]);
  const cases = [
    [125, 125], [123, 125], [122, 120], [127, 125], [128, 130],
    [999, 300], [10, 25], [NaN, 125], [163, 165], [22, 25], [303, 300],
  ];
  let all = true;
  for (const [inp, exp] of cases) {
    // eslint-disable-next-line no-undef
    const got = clampUiScale(inp);
    if (got !== exp) {
      all = false;
      console.error('   ' + inp + ' -> ' + got + ', ожид ' + exp);
    }
  }
  check('clampUiScale: шаг 5% и границы', all);
}

// --- 4. Живой шаг ±5% и гашение кнопок на краях ---
const store4 = {};
const { VirtualConsole } = require('jsdom');
const domLive = new JSDOM(html, {
  runScripts: 'dangerously',
  virtualConsole: new VirtualConsole(),
  beforeParse(win) {
    Object.defineProperty(win, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k) => (store4[k] != null ? store4[k] : null),
        setItem: (k, v) => { store4[k] = String(v); },
        removeItem: (k) => { delete store4[k]; },
      },
    });
  },
});
const w = domLive.window;
const d = w.document;
const readPct = () => Math.round(parseFloat(d.documentElement.style.getPropertyValue('--ui-scale')) * 100);
w.setUiScale(125);
check('setUiScale(125) → 125%', readPct() === 125);
w.stepUiScale(1);
check('+ шаг: 125 → 130', readPct() === 130 && d.getElementById('scaleCurrentName').textContent === '130%');
w.stepUiScale(-1);
check('− шаг: 130 → 125', readPct() === 125);
check('пишет в localStorage', store4['struchord-ui-scale'] === '125');
w.setUiScale(300);
check('на максимуме кнопка «+» погашена', d.getElementById('scalePlus').disabled === true);
check('на максимуме кнопка «−» активна', d.getElementById('scaleMinus').disabled === false);
w.stepUiScale(1);
check('«+» на максимуме не превышает 300', readPct() === 300);
w.setUiScale(25);
check('на минимуме кнопка «−» погашена', d.getElementById('scaleMinus').disabled === true);
w.stepUiScale(-1);
check('«−» на минимуме не опускается ниже 25', readPct() === 25);

// --- 5. Ранний inline-скрипт ставит --ui-scale ДО отрисовки ---
const store = { 'struchord-ui-scale': '200' };
const dom2 = new JSDOM(html, {
  runScripts: 'dangerously',
  virtualConsole: new VirtualConsole(),
  beforeParse(win) {
    Object.defineProperty(win, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k) => (store[k] != null ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
      },
    });
  },
});
const earlyScale = dom2.window.document.documentElement.style.getPropertyValue('--ui-scale');
check('ранний скрипт ставит --ui-scale=2 при сохранённых 200%', earlyScale === '2');

console.log('\nИТОГО: пройдено ' + pass + ', провалено ' + fail);
process.exit(fail ? 1 : 0);
