#!/usr/bin/env node
/*
 * b79-scale-guard.js — регрессионный сторож масштаба (волна B-79).
 *
 * Базовый масштаб UI держится на ОДНОМ токене --ui-scale (html font-size в rem/em).
 * Жёсткие px в РАЗМЕРАХ (font-size, размер <svg>) этот токен игнорируют → элемент
 * останется мелким на 125%. Этот тест ловит новые такие места ДО того, как их
 * заметит пользователь.
 *
 * Порог: font-size:px вне <style> и px-размер <svg> должны оставаться 0.
 * geometry (отступы/тени/radius в инлайне и JS) НЕ проверяем как ошибку —
 * там много декоративных px, которые масштабировать не нужно; за ними следим
 * глазами через `node dev/audit-scale.js`.
 */
const { execFileSync } = require('child_process');
const path = require('path');

const auditPath = path.join(__dirname, '..', 'audit-scale.js');
const out = execFileSync('node', [auditPath, '--count'], { encoding: 'utf8' });
const counts = JSON.parse(out);

const LIMITS = {
  'font-size': 0,  // все размеры шрифта/иконок должны быть в rem
  'svg-size': 0,   // все <svg> должны задавать размер в rem (атрибут или style)
};

let failed = 0;
for (const [cat, limit] of Object.entries(LIMITS)) {
  const got = counts[cat];
  if (got > limit) {
    console.error(`ПРОВАЛ: ${cat} = ${got}, допустимо ≤ ${limit}. ` +
      `Новые немасштабируемые px. Запусти: node dev/audit-scale.js`);
    failed++;
  } else {
    console.log(`OK: ${cat} = ${got} (≤ ${limit})`);
  }
}

if (failed) {
  console.error(`\nИТОГО: провалено ${failed}. Немасштабируемые размеры вне токена --ui-scale.`);
  process.exit(1);
}
console.log('\nALL OK — все размеры под токеном --ui-scale.');
