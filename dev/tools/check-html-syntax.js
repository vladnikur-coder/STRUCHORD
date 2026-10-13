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
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const file = path.join(__dirname, '..', '..', 'STRUCHORD.html');
const html = fs.readFileSync(file, 'utf8');
const scripts = [];
const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let match;
while ((match = re.exec(html)) !== null) {
  if (/\bsrc\s*=/.test(match[1])) continue;
  scripts.push({ index: scripts.length, code: match[2], at: match.index });
}

let failures = 0;
for (const script of scripts) {
  const line = html.slice(0, script.at).split('\n').length;
  try {
    new vm.Script(script.code, { filename: `STRUCHORD.html:script#${script.index} (строка ${line})` });
  } catch (err) {
    failures++;
    console.error(`ОШИБКА в скрипте #${script.index} (начинается со строки ${line}):`);
    console.error('  ' + (err && err.message));
  }
}
console.log(`scripts checked: ${scripts.length}, failures: ${failures}`);
process.exitCode = failures ? 1 : 0;
