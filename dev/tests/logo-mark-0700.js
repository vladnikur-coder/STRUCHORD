'use strict';
// 0.700 · логотип: стручок, перец, слива, малина (патч patch_logo.py 1.2).
// Проверяет ровно то, что владелец просил посмотреть руками:
//   1) главный экран — стручок слева от STRUCHORD, а не медиатор;
//   2) в шапке редактора — стручок;
//   3) переключение темы (☾) — знак меняет цвет вместе с темой;
//   4) схемы «Перец», «Слива», «Малина» — перец, слива, малина; другая схема — стручок;
//   5) телефон — знак уменьшается, но не исчезает (в шапке редактора скрыт);
//   6) PWA — новый кэш приложения (два обновления подряд).
// Запуск: node dev/tests/logo-mark-0700.js
// Нужен локальный сервер: python3 -m http.server 8000 (из корня репозитория).

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const sparticuz = require('@sparticuz/chromium').default;

const URL = process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html';
const OUT_DIR = path.join(__dirname, '..', 'bench', 'results', 'logo-0.700');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  results.push({ name, ok, actual, expected });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      было: ${JSON.stringify(actual)}\n      ждали: ${JSON.stringify(expected)}`}`);
}

// Какой знак реально виден и какого он размера.
const markState = (page, selector) => page.evaluate((sel) => {
  const host = document.querySelector(sel);
  if (!host) return { found: false };
  const svg = host.matches('svg') ? host : host.querySelector('svg.struchord-mark');
  const r = svg ? svg.getBoundingClientRect() : null;
  const uses = svg ? [...svg.querySelectorAll('use')] : [];
  const shown = uses.filter((u) => getComputedStyle(u).display !== 'none').map((u) => String(u.getAttribute('class')));
  const cs = svg ? getComputedStyle(svg) : null;
  return {
    found: true,
    visible: !!(r && r.width > 0 && r.height > 0),
    w: r ? Math.round(r.width) : 0,
    h: r ? Math.round(r.height) : 0,
    shown,
    line: cs ? cs.getPropertyValue('--sm-line').trim() : '',
    pick: !!document.querySelector(`${sel} .ti-guitar-pick`),
  };
}, selector);

const scheme = async (page, id) => {
  await page.evaluate((i) => applyScheme(i), id);
  await wait(320);
};

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || await sparticuz.executablePath(),
    args: [...sparticuz.args, '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  const pageErrors = [];
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const page = await browser.newPage();
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('dialog', async (d) => { await d.dismiss(); });
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(URL, { waitUntil: 'load' });
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload({ waitUntil: 'load' });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; applyScheme(''); });
  await wait(600);

  try {
    // ── 1. Главный экран: стручок вместо медиатора ───────────────────────
    const home = await markState(page, '.home-brand-mark');
    check('Главный экран: знак найден и виден', [home.found, home.visible], [true, true]);
    check('Главный экран: показан стручок', home.shown, ['mark-pod']);
    check('Главный экран: медиатора больше нет', home.pick, false);
    // Корневой шрифт приложения 20 px, поэтому 1,75 rem = 35 px (замер: 48×35).
    check('Главный экран: знак 48×35 px', [home.w, home.h], [48, 35]);
    await page.screenshot({ path: path.join(OUT_DIR, '01-home-light.png') });

    // ── 3. Тема: знак меняет цвет ────────────────────────────────────────
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    await wait(400);
    const homeDark = await markState(page, '.home-brand-mark');
    check('Тёмная тема: знак на месте и виден', [homeDark.visible, homeDark.h], [true, 35]);
    check('Тёмная тема: цвет знака другой, чем на светлой', [home.line.toLowerCase() !== homeDark.line.toLowerCase(), homeDark.line.toLowerCase()], [true, '#f4f0e4']);
    await page.screenshot({ path: path.join(OUT_DIR, '02-home-dark.png') });
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
    await wait(300);

    // ── 2. Шапка редактора ───────────────────────────────────────────────
    await page.evaluate(() => {
      startNewSongFromHome();
      addSection('A');
      const row = (ch) => ({ id: nextId++, repeat: 1, customBeats: 16, events: [{ chord: ch, span: 4 }, { chord: ch, span: 4 }, { chord: ch, span: 4 }, { chord: ch, span: 4 }] });
      sections[0].squares = [row('Am'), row('F')];
      renderSectionsGrid();
    });
    await wait(900);
    const editor = await markState(page, '.app-header');
    check('Шапка редактора: показан стручок', [editor.found, editor.visible, editor.shown], [true, true, ['mark-pod']]);
    check('Шапка редактора: медиатора больше нет', editor.pick, false);
    await page.screenshot({ path: path.join(OUT_DIR, '03-editor-light.png') });

    // ── 4. Схемы: перец, слива, малина, обратно стручок ──────────────────
    const symbols = await page.evaluate(() => ['pod', 'pepper', 'plum', 'raspberry'].map((id) => {
      const s = document.getElementById('struchord-' + id);
      if (!s) return { id, ok: false };
      const b = s.getBBox ? s.getBBox() : { width: 0, height: 0 };
      return { id, ok: true, w: Math.round(b.width), h: Math.round(b.height) };
    }));
    check('В HTML есть все четыре знака, и каждый нарисован',
      symbols.map((x) => [x.id, x.ok, x.w > 100 && x.h > 100]),
      [['pod', true, true], ['pepper', true, true], ['plum', true, true], ['raspberry', true, true]]);

    await scheme(page, 'pepper');
    const pepper = await markState(page, '.home-brand-mark');
    check('Схема «Перец»: показан перец', pepper.shown, ['mark-pepper']);
    check('Схема «Перец», светлая: контур тёмный', pepper.line.toLowerCase(), '#241713');
    await page.screenshot({ path: path.join(OUT_DIR, '04-pepper-light.png') });

    await scheme(page, 'plum');
    const plum = await markState(page, '.home-brand-mark');
    check('Схема «Слива»: показана слива', plum.shown, ['mark-plum']);
    await page.screenshot({ path: path.join(OUT_DIR, '05-plum-light.png') });

    await scheme(page, 'raspberry');
    const rasp = await markState(page, '.home-brand-mark');
    check('Схема «Малина»: показана малина', rasp.shown, ['mark-raspberry']);
    await page.screenshot({ path: path.join(OUT_DIR, '06-raspberry-light.png') });

    await scheme(page, 'forest');
    const forest = await markState(page, '.home-brand-mark');
    check('Другая схема («Хвоя»): снова стручок', forest.shown, ['mark-pod']);

    await scheme(page, '');
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    await wait(350);
    await scheme(page, 'pepper');
    const pepperDark = await markState(page, '.home-brand-mark');
    check('Схема «Перец», тёмная: контур кремовый', pepperDark.line.toLowerCase(), '#f0e2da');
    await page.screenshot({ path: path.join(OUT_DIR, '07-pepper-dark.png') });
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; applyScheme(''); });
    await wait(350);

    // ── 6. PWA: свежий кэш приложения ────────────────────────────────────
    const cache = await page.evaluate(async () => {
      const res = await fetch('sw.js', { cache: 'no-store' });
      const text = await res.text();
      const m = text.match(/CACHE_NAME\s*=\s*'([^']+)'/);
      return { status: res.status, name: m ? m[1] : null };
    });
    check('Кэш приложения обновлён под 0.700', cache, { status: 200, name: 'struchord-v700' });
    // Два обновления подряд: страница открывается заново, версия та же, знак на месте.
    const fresh = await browser.newPage();
    fresh.on('pageerror', (e) => pageErrors.push(`reload: ${e.message}`));
    await fresh.setViewport({ width: 1280, height: 900 });
    await fresh.goto(URL, { waitUntil: 'domcontentloaded' });
    await wait(800);
    await fresh.goto(URL, { waitUntil: 'domcontentloaded' });
    await wait(900);
    const afterTwo = await fresh.evaluate(() => ({
      ver: (document.querySelector('.app-title span') || {}).textContent || '',
      mark: !!document.querySelector('.home-brand-mark svg.struchord-mark'),
    }));
    check('После двух обновлений подряд: версия 0.700 и знак на месте', [/ver 0\.700/.test(afterTwo.ver), afterTwo.mark], [true, true]);
    await fresh.close();

    // ── 5. Телефон ───────────────────────────────────────────────────────
    const ph = await browser.newPage();
    ph.on('pageerror', (e) => pageErrors.push(`phone: ${e.message}`));
    await ph.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await ph.goto(URL, { waitUntil: 'load' });
    await ph.evaluate(() => { document.documentElement.dataset.theme = 'light'; applyScheme(''); });
    await wait(700);
    const phoneHome = await markState(ph, '.home-brand-mark');
    check('Телефон: знак не исчез', [phoneHome.found, phoneHome.visible], [true, true]);
    // 1,25 rem при корневом шрифте 20 px = 25 px.
    check('Телефон: знак уменьшен до 25 px', phoneHome.h, 25);
    await ph.screenshot({ path: path.join(OUT_DIR, '08-home-phone.png') });
    await scheme(ph, 'plum');
    const phonePlum = await markState(ph, '.home-brand-mark');
    check('Телефон, схема «Слива»: слива видна', [phonePlum.visible, phonePlum.shown], [true, ['mark-plum']]);
    await ph.screenshot({ path: path.join(OUT_DIR, '10-plum-phone.png') });
    await scheme(ph, '');

    await ph.evaluate(() => {
      startNewSongFromHome();
      addSection('A');
      sections[0].squares = [{ id: nextId++, repeat: 1, customBeats: 16, events: [{ chord: 'Am', span: 4 }, { chord: 'Am', span: 4 }, { chord: 'Am', span: 4 }, { chord: 'Am', span: 4 }] }];
      renderSectionsGrid();
    });
    await wait(900);
    const phoneEditor = await markState(ph, '.app-header');
    check('Телефон: в шапке редактора знак скрыт (как и было)', [phoneEditor.found, phoneEditor.visible], [true, false]);
    await ph.screenshot({ path: path.join(OUT_DIR, '09-editor-phone.png') });

    await ph.close();

    check('На страницах не было ошибок JavaScript', pageErrors, []);

    const passed = results.filter((r) => r.ok).length;
    fs.writeFileSync(path.join(OUT_DIR, 'checks.json'), JSON.stringify({ version: '0.700', results, passed, total: results.length }, null, 2));
    console.log(`\n${passed}/${results.length} PASS`);
    if (passed !== results.length) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exit(1);
});
