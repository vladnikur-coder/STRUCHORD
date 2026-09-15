#!/usr/bin/env node
/*
 * b80-ui-scale-slider.js — регрессии выбора масштаба UI (волна B-80).
 *
 * Масштаб выбирается из фиксированных вариантов (кнопки в меню «Тык»),
 * которые пишут в единый токен --ui-scale (B-79). Слайдер отвергнут:
 * контрол внутри масштабируемого меню давал петлю drag↔масштаб.
 *
 * Проверяем:
 *  - набор кнопок-вариантов на месте (50..300, ровно заданный список);
 *  - функции масштаба присутствуют, nearestUiScaleOption округляет к
 *    ближайшему варианту (миграция старых произвольных значений);
 *  - ранний inline-скрипт в <head> читает struchord-ui-scale и ставит
 *    --ui-scale ДО первой отрисовки;
 *  - initUiScale/setUiScale завязаны на localStorage-ключ.
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

const EXPECTED = [50, 75, 85, 100, 115, 125, 150, 175, 200, 250, 300];

// --- 1. Разметка стилизованного (кастомного) списка ---
const dom = new JSDOM(html);
const doc = dom.window.document;
const picker = doc.getElementById('struchord-scale-picker');
const list = doc.getElementById('scaleList');
// Триггер-пилюля (как у «Размер»): pill + всплывающая .meta-pill-list.
const pill = doc.getElementById('scalePill');
check('пикер #struchord-scale-picker существует', !!picker);
check('пилюля #scalePill зовёт toggleScaleList', pill && /toggleScaleList/.test(pill.getAttribute('onclick') || ''));
check('подпись текущего значения #scaleCurrentName есть', !!doc.getElementById('scaleCurrentName'));
check('список масштаба использует стиль .meta-pill-list (как «Размер»)',
  list && list.classList.contains('meta-pill-list'));
const opts = list ? [...list.querySelectorAll('.meta-pill-item')] : [];
check('ровно ' + EXPECTED.length + ' пунктов', opts.length === EXPECTED.length);
const vals = opts.map((o) => +o.dataset.scale);
check('значения data-scale = ' + EXPECTED.join(','), JSON.stringify(vals) === JSON.stringify(EXPECTED));
const labels = opts.map((o) => o.textContent.trim());
check('подписи = ' + EXPECTED.map((p) => p + '%').join(' '),
  JSON.stringify(labels) === JSON.stringify(EXPECTED.map((p) => p + '%')));
check('каждый пункт зовёт setUiScale', opts.every((o) => /setUiScale\(\d+\)/.test(o.getAttribute('onclick') || '')));
check('это НЕ нативный select', !doc.getElementById('uiScaleSelect'));
check('слайдера больше нет', !doc.getElementById('uiScaleSlider'));
check('список внутри меню «Тык» (#toolsDropdown)',
  !!(doc.getElementById('toolsDropdown') && doc.getElementById('toolsDropdown').querySelector('#scaleList')));

// --- 2. Функции масштаба в коде ---
check('есть setUiScale', /function setUiScale\(/.test(html));
check('есть writeUiScale', /function writeUiScale\(/.test(html));
check('есть toggleScaleList', /function toggleScaleList\(/.test(html));
check('есть initUiScale', /function initUiScale\(/.test(html));
check('есть nearestUiScaleOption', /function nearestUiScaleOption\(/.test(html));
check('initUiScale вызывается на старте', /\n\s*initUiScale\(\);/.test(html));
check('ключ localStorage struchord-ui-scale', /struchord-ui-scale/.test(html));

// --- 3. nearestUiScaleOption: округление к ближайшему варианту ---
const m = html.match(/const UI_SCALE_OPTIONS[\s\S]*?function nearestUiScaleOption[\s\S]*?\n}/);
check('блок nearestUiScaleOption извлекается', !!m);
if (m) {
  const UI_SCALE_DEFAULT = 125;
  // eslint-disable-next-line no-eval
  eval(m[0]);
  const cases = [
    [125, 125], [120, 115], [130, 125], [60, 50], [90, 85],
    [999, 300], [10, 50], [NaN, 125], [163, 175], [225, 200],
  ];
  let all = true;
  for (const [inp, exp] of cases) {
    // eslint-disable-next-line no-undef
    const got = nearestUiScaleOption(inp);
    if (got !== exp) {
      all = false;
      console.error('   ' + inp + ' -> ' + got + ', ожид ' + exp);
    }
  }
  check('nearestUiScaleOption: ближайший вариант', all);
}

// --- 4. Ранний inline-скрипт ставит --ui-scale ДО отрисовки ---
const store = { 'struchord-ui-scale': '200' };
const { VirtualConsole } = require('jsdom');
const vc = new VirtualConsole(); // шум приложения в jsdom глушим
const dom2 = new JSDOM(html, {
  runScripts: 'dangerously',
  virtualConsole: vc,
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
