#!/usr/bin/env node
/*
 * check-html-syntax.js — синтаксическая проверка всех <script> приложения.
 *
 * STRUCHORD.html — один файл на ~2,7 МБ, и ошибка в одном скрипте ломает
 * всё приложение целиком. Проверка компилирует каждый встроенный скрипт
 * через vm.Script (без выполнения): она ловит опечатки и забытые скобки
 * до запуска jsdom-сьютов.
 *
 * Запуск: node dev/tools/check-html-syntax.js
 *
 * С 0.641 проверка ещё и следит за невидимыми блоками (встроенные рантаймы
 * GP6/GP7-8/alphaTab в <script type="text/plain">). Внутри них «</» обязано
 * быть экранировано: Live Server вклеивает свой <script> перед первым
 * </body> файла, и тот закрывал блок на полпути — страница рассыпалась в
 * простыню исходника (хотфикс 0.641).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { escapeInert, INERT_BLOCK_IDS } = require('./escape-inert-blocks.js');

const file = path.join(__dirname, '..', '..', 'STRUCHORD.html');
const html = fs.readFileSync(file, 'utf8');
const scripts = [];
const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let match;
while ((match = re.exec(html)) !== null) {
  if (/\bsrc\s*=/.test(match[1])) continue;
  scripts.push({ index: scripts.length, attrs: match[1], code: match[2], at: match.index });
}

let failures = 0;
let checked = 0;
for (const script of scripts) {
  // Bravura — base64-данные шрифта, не JavaScript. Инертные JS-рантаймы
  // при этом компилируем как прежде: text/plain не повод их пропускать.
  if (/\bid=["']bravuraWoff2Data["']/.test(script.attrs)) continue;
  checked++;
  const line = html.slice(0, script.at).split('\n').length;
  try {
    new vm.Script(script.code, { filename: `STRUCHORD.html:script#${script.index} (строка ${line})` });
  } catch (err) {
    failures++;
    console.error(`ОШИБКА в скрипте #${script.index} (начинается со строки ${line}):`);
    console.error('  ' + (err && err.message));
  }
}

// --- невидимые блоки: «</» должен быть экранирован (0.641) ---
const inertRe = new RegExp(`<script id="(${INERT_BLOCK_IDS.join('|')})" type="text/plain">([\\s\\S]*?)<\\/script>`, 'g');
const seenInert = [];
let inertMatch;
while ((inertMatch = inertRe.exec(html)) !== null) {
  seenInert.push(inertMatch[1]);
  const left = escapeInert(inertMatch[2]).count;
  if (left > 0) {
    failures++;
    console.error(`ОШИБКА в невидимом блоке #${inertMatch[1]}: неэкранированных «</» — ${left}.`);
    console.error('  Запустите: node dev/tools/escape-inert-blocks.js');
  }
}
for (const id of INERT_BLOCK_IDS) {
  if (!seenInert.includes(id)) {
    failures++;
    console.error(`ОШИБКА: нет невидимого блока #${id}`);
  }
}

console.log(`scripts checked: ${checked}, inert blocks checked: ${seenInert.length}, failures: ${failures}`);
process.exitCode = failures ? 1 : 0;
