#!/usr/bin/env node
/*
 * check-versions.js — один номер версии во всех местах.
 *
 * История проблемы: файл приложения ушёл на 0.703, README показывал 0.703,
 * а шапка ROADMAP застряла на 0.696. Новая сессия читает ROADMAP и считает,
 * что после 0.696 ничего не сделано.
 *
 * Источник истины — сам файл приложения (`· ver 0.xxx` в шапке).
 * Этот скрипт сверяет с ним:
 *   - имя кэша в sw.js;
 *   - шапку README.md;
 *   - шапку ROADMAP.md.
 *
 * Запуск:
 *   node dev/tools/check-versions.js         # только проверить (exit 1 при расхождении)
 *   node dev/tools/check-versions.js --fix   # подтянуть README и ROADMAP к файлу приложения
 *
 * sw.js не правится автоматически: кэш и HTML выкладываются парой (правило R7),
 * поэтому расхождение в sw.js — всегда сигнал, а не повод молча поправить.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const fix = process.argv.includes('--fix');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function appVersion() {
  const html = read('STRUCHORD.html');
  const m = html.match(/id="devPanelTrigger"[^>]*>·\s*ver\s+(\d+\.\d+)/);
  if (!m) throw new Error('в STRUCHORD.html не нашёл «· ver 0.xxx» у #devPanelTrigger');
  return m[1];
}

function cacheVersion() {
  const sw = read('sw.js');
  const m = sw.match(/CACHE_NAME\s*=\s*'([^']+)'/);
  return m ? m[1] : null;
}

// Шапки документов. Возвращает { found, line, regex } — чтобы --fix мог заменить точно.
function headerOf(rel, pattern) {
  const text = read(rel);
  const m = text.match(pattern);
  // m[2] — номер версии: m[1] это префикс строки.
  return m ? { text, match: m, found: m[2] } : { text, match: null, found: null };
}

const README_HEADER = /(> \*\*Текущая версия:\*\* `)(\d+\.\d+)(` \(`)(struchord-v[\w.]+)(`\))/;
const ROADMAP_HEADER = /(Текущая версия приложения: \*\*)(\d+\.\d+)(\*\* \(`)(struchord-v[\w.]+)(`\))/;

function main() {
  const app = appVersion();
  const cache = cacheVersion();
  const cacheWant = 'struchord-v' + app.split('.')[1];

  const rd = headerOf('README.md', README_HEADER);
  const rm = headerOf('ROADMAP.md', ROADMAP_HEADER);

  const rows = [
    ['STRUCHORD.html (источник)', app, app],
    ['sw.js CACHE_NAME', cache, cacheWant],
    ['README.md, шапка', rd.found, app],
    ['ROADMAP.md, шапка', rm.found, app],
  ];

  let bad = 0;
  console.log('Версия приложения: ' + app + '\n');
  for (const [where, got, want] of rows) {
    const ok = got === want;
    if (!ok) bad++;
    console.log((ok ? '  ok    ' : '  РАЗНО ' ) + where.padEnd(28) + String(got).padEnd(22) + (ok ? '' : 'должно быть ' + want));
  }

  if (!bad) {
    console.log('\nВсё сходится: один номер версии во всех местах.');
    return 0;
  }

  if (!fix) {
    console.log('\nРасхождение. Подтянуть шапки README и ROADMAP к файлу приложения:');
    console.log('    node dev/tools/check-versions.js --fix');
    console.log('Расхождение в sw.js так не правится: HTML и кэш выкладываются парой (R7).');
    return 1;
  }

  // --fix: только шапки документов. sw.js — руками, вместе с выкладкой.
  if (rd.match && rd.found !== app) {
    const next = rd.text.replace(README_HEADER,
      (_, a, _v, b, _c, d) => a + app + b + cacheWant + d);
    fs.writeFileSync(path.join(ROOT, 'README.md'), next);
    console.log('\nREADME.md: шапка → ' + app);
  }
  if (rm.match && rm.found !== app) {
    const next = rm.text.replace(ROADMAP_HEADER,
      (_, a, _v, b, _c, d) => a + app + b + cacheWant + d);
    fs.writeFileSync(path.join(ROOT, 'ROADMAP.md'), next);
    console.log('ROADMAP.md: шапка → ' + app);
  }
  if (cache !== cacheWant) {
    console.log('sw.js: CACHE_NAME = ' + cache + ', а нужен ' + cacheWant + ' — поправьте вместе с выкладкой (R7).');
    return 1;
  }
  console.log('\nГотово.');
  return 0;
}

process.exit(main());
