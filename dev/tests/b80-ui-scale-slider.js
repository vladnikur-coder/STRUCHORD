#!/usr/bin/env node
/*
 * b80-ui-scale-slider.js — регрессии ползунка масштаба UI (волна B-80).
 *
 * Слайдер в меню «Тык» пишет в единый токен --ui-scale (B-79). Проверяем:
 *  - разметка слайдера на месте с диапазоном 25..300, шаг 5, дефолт 125;
 *  - функции масштаба присутствуют и клампят/округляют к шагу правильно;
 *  - ранний inline-скрипт в <head> читает struchord-ui-scale и ставит
 *    --ui-scale ДО первой отрисовки (иначе мелькнёт дефолт);
 *  - initUiScale/onUiScaleInput завязаны на localStorage-ключ.
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

// --- 1. Разметка слайдера ---
const dom = new JSDOM(html);
const doc = dom.window.document;
const slider = doc.getElementById('uiScaleSlider');
const value = doc.getElementById('uiScaleValue');
check('слайдер #uiScaleSlider существует', !!slider);
check('подпись #uiScaleValue существует', !!value);
check('type=range', slider && slider.getAttribute('type') === 'range');
check('min=25', slider && slider.getAttribute('min') === '25');
check('max=300', slider && slider.getAttribute('max') === '300');
check('step=5', slider && slider.getAttribute('step') === '5');
check('value=125 (дефолт B-79)', slider && slider.getAttribute('value') === '125');
check('подпись стартово 125%', value && value.textContent.trim() === '125%');
check('oninput → onUiScaleInput', slider && /onUiScaleInput/.test(slider.getAttribute('oninput') || ''));
check('слайдер внутри меню «Тык» (#toolsDropdown)',
  !!(doc.getElementById('toolsDropdown') && doc.getElementById('toolsDropdown').querySelector('#uiScaleSlider')));

// --- 2. Функции масштаба в коде ---
check('есть applyUiScale', /function applyUiScale\(/.test(html));
check('есть onUiScaleInput', /function onUiScaleInput\(/.test(html));
check('есть initUiScale', /function initUiScale\(/.test(html));
check('есть clampUiScale', /function clampUiScale\(/.test(html));
check('initUiScale вызывается на старте', /\n\s*initUiScale\(\);/.test(html));
check('ключ localStorage struchord-ui-scale', /struchord-ui-scale/.test(html));

// --- 3. Логика клампа/шага (извлекаем чистые функции) ---
const m = html.match(/const UI_SCALE_DEFAULT[\s\S]*?function clampUiScale[\s\S]*?\n}/);
check('блок clampUiScale извлекается', !!m);
if (m) {
  // eslint-disable-next-line no-eval
  eval(m[0]);
  const cases = [
    [125, 125], [132, 130], [133, 135], [24, 25], [25, 25],
    [301, 300], [300, 300], [0, 25], [NaN, 125], [48, 50],
  ];
  let allClamp = true;
  for (const [inp, exp] of cases) {
    // eslint-disable-next-line no-undef
    if (clampUiScale(inp) !== exp) {
      allClamp = false;
      console.error('   кламп ' + inp + ' -> ' + clampUiScale(inp) + ', ожид ' + exp);
    }
  }
  check('clampUiScale: диапазон 25..300 и шаг 5', allClamp);
}

// --- 4. Ранний inline-скрипт ставит --ui-scale ДО отрисовки ---
// Скрипт в <head> читает localStorage синхронно при парсинге. Симулируем
// сохранённые 200% и проверяем, что --ui-scale стал 2 сразу после парса.
const store = { 'struchord-ui-scale': '200' };
// Тихая консоль: основное приложение при запуске в jsdom спотыкается на
// requestAnimationFrame/AudioContext (браузерные API) — нам это не важно,
// нужен только результат раннего head-скрипта. Шум глушим.
const { VirtualConsole } = require('jsdom');
const vc = new VirtualConsole(); // без .sendTo — ошибки никуда не идут
const dom2 = new JSDOM(html, {
  runScripts: 'dangerously',
  virtualConsole: vc,
  beforeParse(win) {
    // Подменяем localStorage ДО выполнения любых скриптов.
    Object.defineProperty(win, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k) => (store[k] != null ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
      },
    });
    // Гасим падение основного приложения на отсутствующем AudioContext и т.п.:
    // ранний head-скрипт от них не зависит, а дальнейшие ошибки нам не важны
    // для этой проверки — заглушим console.error шумовых исключений.
  },
});
const earlyScale = dom2.window.document.documentElement.style.getPropertyValue('--ui-scale');
check('ранний скрипт ставит --ui-scale=2 при сохранённых 200%', earlyScale === '2');

console.log('\nИТОГО: пройдено ' + pass + ', провалено ' + fail);
process.exit(fail ? 1 : 0);
