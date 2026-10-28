#!/usr/bin/env node
/*
 * release-check.js — три быстрые проверки перед выкладкой волны (R6).
 *
 * Анализ 24 предлагал добавить в чек-лист сдачи ровно это: ошибок в консоли 0,
 * нет горизонтальной прокрутки на 390 px, приложение открывается двойным кликом.
 * Плюс сюда же — согласованность номера версии.
 *
 * Запуск (нужен Chromium из puppeteer):
 *   PUPPETEER_EXECUTABLE_PATH=/tmp/chromium node dev/tools/release-check.js
 *
 * Код возврата 0 — всё в порядке, 1 — есть замечания.
 */
const path = require('path');
const { execFileSync } = require('child_process');
const puppeteer = require('puppeteer');

const ROOT = path.resolve(__dirname, '..', '..');
const FILE_URL = 'file://' + path.join(ROOT, 'STRUCHORD.html');

let bad = 0;
const line = (ok, name, detail) => {
  if (!ok) bad++;
  console.log((ok ? '  ok    ' : '  ПЛОХО ') + name.padEnd(46) + (detail || ''));
};

(async () => {
  console.log('Версии\n');
  try {
    const out = execFileSync(process.execPath, [path.join(__dirname, 'check-versions.js')], { encoding: 'utf8' });
    line(true, 'номер версии совпадает во всех местах', out.match(/Версия приложения: ([\d.]+)/)[1]);
  } catch (e) {
    line(false, 'номер версии совпадает во всех местах', String(e.stdout || e.message).trim().split('\n').pop());
  }

  console.log('\nПриложение в браузере\n');
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--allow-file-access-from-files'],
  });

  // 1. Открывается двойным кликом: локальный файл, без сервера
  {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(FILE_URL, { waitUntil: 'load' });
    await new Promise((r) => setTimeout(r, 1500));
    const state = await page.evaluate(() => {
      const el = document.querySelector('#devPanelTrigger');
      return { ver: el ? el.textContent.trim() : null, home: !!document.querySelector('.home-brand-mark') };
    });
    line(!!state.home, 'открывается двойным кликом (file://)', state.ver || '');
    // Ошибка кэш-воркера по file:// — ожидаемая и известная, её не считаем.
    const real = errors.filter((t) => !/sw\.js|ServiceWorker|serviceWorker|Failed to register/i.test(t));
    line(real.length === 0, 'ошибок JavaScript нет', real.slice(0, 2).join(' | '));
    await page.close();
  }

  // 2. Телефон 390 px: нет горизонтальной прокрутки и ничего не вылезает за край
  for (const [w, h, tag] of [[390, 844, '390 px'], [834, 1112, '834 px'], [1440, 900, '1440 px']]) {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h });
    await page.goto(FILE_URL, { waitUntil: 'load' });
    await new Promise((r) => setTimeout(r, 1200));
    const m = await page.evaluate(() => ({
      docOver: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      bodyOver: document.body.scrollWidth - document.body.clientWidth,
    }));
    const over = Math.max(m.docOver, m.bodyOver);
    line(over <= 0, 'нет горизонтальной прокрутки, ' + tag, over > 0 ? 'вылезает на ' + over + ' px' : '');
    await page.close();
  }

  await browser.close();
  console.log('\n' + (bad ? 'Замечаний: ' + bad : 'Всё в порядке.'));
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
