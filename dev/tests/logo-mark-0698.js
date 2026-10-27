#!/usr/bin/env node
/**
 * 0.698 Acceptance & Screenshot Test — логотип «стручок» (patch_logo.py, версия 1.1).
 *
 * Что проверяем по просьбе владельца:
 * 1) на главном экране слева от надписи STRUCHORD стоит стручок, а не медиатор;
 * 2) в шапке редактора тоже стручок;
 * 3) переключение темы меняет цвет знака (контур берётся из темы);
 * 4) схема «Перец» показывает перец вместо стручка: на светлой теме контур
 *    тёмный, на тёмной — кремовый; возврат на другую схему возвращает стручок;
 * 5) на телефоне знак уменьшается, но не исчезает (главный экран);
 * 6) иконки приложения лежат рядом с HTML и прописаны в manifest.json;
 * 7) favicon и apple-touch-icon встроены PNG-данными (без внешних файлов).
 *
 * Скриншоты кладутся в dev/bench/results/logo-0.698/.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const URL = process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html';
const ROOT = path.join(__dirname, '..', '..');
const OUT_DIR = path.join(__dirname, '..', 'bench', 'results', 'logo-0.698');
fs.mkdirSync(OUT_DIR, { recursive: true });

const results = [];
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  const ok = a === b;
  results.push({ name, ok, actual, expected });
  if (!ok) console.error(`FAIL: ${name}\n  expected: ${b}\n  actual:   ${a}`);
  else console.log(`PASS: ${name}`);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Ищет первый ВИДИМЫЙ знак и снимает его состояние: размер, цвет контура и
// какая из двух картинок (стручок/перец) сейчас показана.
const markState = (page) => page.evaluate(() => {
  const all = [...document.querySelectorAll('.struchord-mark')];
  const mark = all.find((el) => el.getBoundingClientRect().width > 0) || null;
  if (!mark) return { visible: false, count: all.length };
  const r = mark.getBoundingClientRect();
  const cs = getComputedStyle(mark);
  const pod = mark.querySelector('.mark-pod');
  const pepper = mark.querySelector('.mark-pepper');
  return {
    visible: true,
    count: all.length,
    width: Math.round(r.width),
    height: Math.round(r.height),
    line: cs.getPropertyValue('--sm-line').trim(),
    ticonColor: cs.color,
    pod: pod ? getComputedStyle(pod).display : null,
    pepper: pepper ? getComputedStyle(pepper).display : null,
    emoji: !!mark.querySelector('i.ti'),
  };
});

const shotMark = async (page, file) => {
  const box = await page.evaluate(() => {
    const mark = [...document.querySelectorAll('.struchord-mark')].find((el) => el.getBoundingClientRect().width > 0);
    if (!mark) return null;
    const r = mark.getBoundingClientRect();
    return { x: Math.max(0, Math.round(r.x - 50)), y: Math.max(0, Math.round(r.y - 12)),
      width: Math.min(620, Math.round(r.width) + 320), height: Math.round(r.height) + 24 };
  });
  if (box) await page.screenshot({ path: path.join(OUT_DIR, file), clip: box });
};

const pngSize = (file) => {
  const buf = fs.readFileSync(file);
  const isPng = buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return { isPng, w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), bytes: buf.length };
};

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    env: { ...process.env, LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH || '/tmp/al2023/lib' },
  });
  const errors = [];
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });
  const resp = await page.goto(URL, { waitUntil: 'load' });
  await wait(1800);

  // ── 1. Главный экран: стручок вместо медиатора ─────────────────────────
  check('страница открылась', resp && resp.status(), 200);
  const home = await markState(page);
  check('на главном экране знак виден', [home.visible, home.width > 30], [true, true]);
  check('знак — настоящая картинка, а не иконка-шрифт', home.emoji, false);
  check('на главном экране показан стручок', [home.pod, home.pepper], ['inline', 'none']);
  check('медиатор из главной шапки убран', await page.evaluate(() => !!document.querySelector('.home-brand-mark .ti-guitar-pick')), false);
  check('медиатор из шапки редактора убран', await page.evaluate(() => !!document.querySelector('.app-header .ti-guitar-pick')), false);
  await shotMark(page, '01-home-light.png');

  // ── 2. Тема: цвет знака меняется вместе с темой ────────────────────────
  const lightLine = home.line;
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await wait(500);
  const dark = await markState(page);
  check('на тёмной теме знак виден', dark.visible, true);
  check('цвет контура знака отличается от светлой темы', dark.line !== lightLine, true);
  check('на тёмной теме контур кремовый', dark.line.toLowerCase(), '#f4f0e4');
  await shotMark(page, '02-home-dark.png');

  // ── 3. Схема «Перец»: перец вместо стручка ─────────────────────────────
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  await wait(300);
  await page.evaluate(() => { const b = document.querySelector('.scheme-item[data-scheme-id="pepper"]'); if (b) b.click(); });
  await wait(600);
  const pepperLight = await markState(page);
  check('схема «Перец» включилась', await page.evaluate(() => document.documentElement.dataset.scheme), 'pepper');
  check('на схеме «Перец» показан перец, а не стручок', [pepperLight.pod, pepperLight.pepper], ['none', 'inline']);
  // У схемы «Перец» свои цвета: контур = основной цвет текста схемы,
  // на светлой теме тёмный (#241713), на тёмной — кремовый (#f0e2da).
  check('на светлой теме контур перца тёмный', pepperLight.line.toLowerCase(), '#241713');
  await shotMark(page, '03-pepper-light.png');
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await wait(500);
  const pepperDark = await markState(page);
  check('на тёмной теме контур перца кремовый', pepperDark.line.toLowerCase(), '#f0e2da');
  await shotMark(page, '04-pepper-dark.png');
  await page.evaluate(() => { document.documentElement.dataset.scheme = 'forest'; document.documentElement.dataset.theme = 'light'; });
  await wait(500);
  const forest = await markState(page);
  check('на другой схеме снова стручок', [forest.pod, forest.pepper], ['inline', 'none']);
  await page.evaluate(() => { document.documentElement.dataset.scheme = ''; });
  await wait(300);

  // ── 4. Шапка редактора: тоже стручок ───────────────────────────────────
  await page.evaluate(() => startNewSongFromHome());
  await wait(2200);
  const editor = await markState(page);
  check('в шапке редактора знак виден', editor.visible, true);
  check('в шапке редактора показан стручок', [editor.pod, editor.pepper], ['inline', 'none']);
  const headerShot = await page.evaluate(() => {
    const h = document.querySelector('.app-header');
    const r = h.getBoundingClientRect();
    return { x: 0, y: Math.max(0, Math.round(r.y)), width: 1280, height: Math.min(120, Math.round(r.height) || 70) };
  });
  await page.screenshot({ path: path.join(OUT_DIR, '05-editor-light.png'), clip: headerShot });

  // ── 5. Телефон: знак уменьшается, но не исчезает ───────────────────────
  const phone = await browser.newPage();
  phone.on('pageerror', (e) => errors.push('phone: ' + e.message));
  await phone.setViewport({ width: 390, height: 780, deviceScaleFactor: 3 });
  await phone.goto(URL, { waitUntil: 'load' });
  await wait(1800);
  // Схема запоминается в браузере; для кадра возвращаем «Дефолт», иначе на
  // снимке будет перец, выбранный на предыдущем шаге.
  await phone.evaluate(() => { document.documentElement.dataset.scheme = ''; });
  await wait(400);
  const phoneHome = await markState(phone);
  check('на телефоне знак на главном экране виден', phoneHome.visible, true);
  check('на телефоне знак меньше, чем на десктопе', phoneHome.width < home.width, true);
  check('на телефоне знак не уже 20 px', phoneHome.width >= 20, true);
  const phoneBox = await phone.evaluate(() => {
    const mark = [...document.querySelectorAll('.struchord-mark')].find((el) => el.getBoundingClientRect().width > 0);
    const r = mark.getBoundingClientRect();
    return { x: 0, y: Math.max(0, Math.round(r.y - 10)), width: 390, height: Math.round(r.height) + 22 };
  });
  await phone.screenshot({ path: path.join(OUT_DIR, '06-home-phone.png'), clip: phoneBox });
  await phone.evaluate(() => startNewSongFromHome());
  await wait(2000);
  const phoneEditorMark = await phone.evaluate(() => {
    const mark = document.querySelector('.app-header .struchord-mark');
    return mark ? getComputedStyle(mark).display : 'нет знака';
  });
  check('в шапке редактора на телефоне знак скрыт (решение патча: не хватает места)', phoneEditorMark, 'none');

  // ── 6. Иконки приложения и манифест ────────────────────────────────────
  const icons = [
    ['icon-192.png', 192, 192],
    ['icon-512.png', 512, 512],
    ['icon-512-maskable.png', 512, 512],
  ];
  for (const [name, w, h] of icons) {
    const file = path.join(ROOT, name);
    const exists = fs.existsSync(file);
    const info = exists ? pngSize(file) : null;
    check(`${name}: PNG ${w}×${h} рядом с HTML`, [exists, info && info.isPng, info && info.w, info && info.h], [true, true, w, h]);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  check('в manifest.json прописаны три иконки', (manifest.icons || []).map((i) => [i.src, i.sizes, i.purpose]),
    [['icon-192.png', '192x192', 'any'], ['icon-512.png', '512x512', 'any'], ['icon-512-maskable.png', '512x512', 'maskable']]);
  const served = await page.evaluate(async () => {
    const out = [];
    const man = await fetch('manifest.json');
    const json = await man.json();
    for (const ic of json.icons) {
      const r = await fetch(ic.src);
      out.push([ic.src, r.status, r.headers.get('content-type')]);
    }
    return out;
  });
  check('иконки из манифеста отдаются как image/png', served, [
    ['icon-192.png', 200, 'image/png'], ['icon-512.png', 200, 'image/png'], ['icon-512-maskable.png', 200, 'image/png'],
  ]);

  // ── 7. Favicon и «на экран Домой» — встроенные PNG ─────────────────────
  const links = await page.evaluate(() => {
    const icon = document.querySelector('link[rel="icon"]');
    const apple = document.querySelector('link[rel="apple-touch-icon"]');
    return {
      icon: icon ? { href: icon.href.slice(0, 22), sizes: icon.getAttribute('sizes') } : null,
      apple: apple ? { href: apple.href.slice(0, 22), sizes: apple.getAttribute('sizes') } : null,
    };
  });
  check('favicon — встроенный PNG 32×32', [links.icon && links.icon.href, links.icon && links.icon.sizes], ['data:image/png;base64,', '32x32']);
  check('иконка «на экран Домой» — встроенный PNG 180×180', [links.apple && links.apple.href, links.apple && links.apple.sizes], ['data:image/png;base64,', '180x180']);

  check('На страницах не было ошибок JavaScript', errors, []);

  await browser.close();
  const passed = results.filter((r) => r.ok).length;
  fs.writeFileSync(path.join(OUT_DIR, 'checks.json'),
    JSON.stringify({ version: '0.698', results, passed, total: results.length }, null, 2));
  console.log(`\n${passed}/${results.length} PASS`);
  process.exit(passed === results.length ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
