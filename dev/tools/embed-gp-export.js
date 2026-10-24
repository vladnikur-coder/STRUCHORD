#!/usr/bin/env node
/* Переносит код экспорта Guitar Pro (dev/gp-export-code.js + dev/gp-export-ui.js)
 * в STRUCHORD.html между маркерами: он живёт в общем скрипте приложения,
 * потому что собирает модель из внутренних функций песни. */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const htmlPath = path.join(root, 'STRUCHORD.html');
const code = fs.readFileSync(path.join(root, 'dev', 'gp-export-code.js'), 'utf8').replace(/\s+$/, '');
const midi = fs.readFileSync(path.join(root, 'dev', 'midi-export-code.js'), 'utf8').trimEnd();
const ui = fs.readFileSync(path.join(root, 'dev', 'gp-export-ui.js'), 'utf8').replace(/\s+$/, '');
const START = '// ---------- ЭКСПОРТ В GUITAR PRO 6 (.gpx) — B-12.9.8 ----------';
const END = '  // ---------- ЭКСПОРТ В ФАЙЛ (ИСПРАВЛЕННЫЙ) ----------';

const html = fs.readFileSync(htmlPath, 'utf8');
const markerIndex = html.indexOf(START);
const startIndex = markerIndex < 0 ? -1 : html.lastIndexOf('\n', markerIndex) + 1;
const endIndex = html.indexOf(END);
if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
  console.error('Маркеры блока экспорта не найдены.');
  process.exit(1);
}
const block = `  ${code}\n\n${midi}\n\n${ui}\n\n`;
const out = html.slice(0, startIndex) + block + html.slice(endIndex);
fs.writeFileSync(htmlPath, out);
console.log(`gp-export: вставлено ${block.length} символов (код ${code.length}, UI ${ui.length})`);
