// B-16 (2026-08-26): живой прогон жеста в Chrome. Десктоп — правый
// клик и геометрия поповера; мобильный (iPhone 13) — тач-удержание,
// нижний лист, выбор пункта и персист схемы после перезагрузки.
const puppeteer = require('/home/user/node_modules/puppeteer');

const URL = 'file:///home/user/STRUCHORD.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const ok = (name, cond, detail) => {
  if (cond) console.log('   ok   ' + name);
  else { bad++; console.log('   FAIL ' + name + (detail !== undefined ? ' — ' + detail : '')); }
};

(async () => {
  const br = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  console.log('\n=== десктоп 1400x900 ===');
  const p = await br.newPage();
  p.setDefaultTimeout(90000);
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.setViewport({ width: 1400, height: 900 });
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sleep(900);

  const btnBox = await p.evaluate(() => {
    const r = document.getElementById('themeToggleBtn').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, bottom: r.bottom, right: r.right };
  });
  // Короткий клик мышью: тема переключается, поповер закрыт.
  const themeBefore = await p.evaluate(() => document.documentElement.getAttribute('data-theme') || 'light');
  await p.mouse.click(btnBox.x, btnBox.y);
  await sleep(200);
  ok('клик: тема переключилась',
     (await p.evaluate(() => document.documentElement.getAttribute('data-theme') || 'light')) !== themeBefore);
  ok('клик: поповер не открылся',
     await p.evaluate(() => !document.getElementById('schemePopover').classList.contains('is-open')));
  await p.mouse.click(btnBox.x, btnBox.y); // вернули тему
  await sleep(200);
  // Правый клик — поповер у кнопки.
  await p.mouse.click(btnBox.x, btnBox.y, { button: 'right' });
  await sleep(250);
  const geom = await p.evaluate(() => {
    const pEl = document.getElementById('schemePopover');
    const btn = document.getElementById('themeToggleBtn');
    const pr = pEl.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    return { open: pEl.classList.contains('is-open'),
      top: pr.top, btnBottom: br.bottom, right: pr.right, btnRight: br.right,
      left: pr.left, vw: innerWidth, items: pEl.querySelectorAll('.scheme-item').length };
  });
  ok('правый клик: поповер открыт', geom.open);
  ok('16 пунктов', geom.items === 16, 'пунктов: ' + geom.items);
  ok('привязан под кнопкой (top ≈ bottom + 8)',
     Math.abs(geom.top - (geom.btnBottom + 8)) <= 2, `${geom.top} vs ${geom.btnBottom + 8}`);
  ok('правый край к кнопке, в пределах вьюпорта',
     Math.abs(geom.right - geom.btnRight) <= 30 && geom.left >= 0 && geom.right <= geom.vw,
     `right ${geom.right} vs btn ${geom.btnRight}`);
  await p.screenshot({ path: '/home/user/dev/bench/scheme-popover-desktop.png' });

  await p.evaluate(() => document.querySelector('#schemePopover [data-scheme-id="forest"]').click());
  await sleep(300);
  ok('выбор «Хвоя» применился', await p.evaluate(() => document.documentElement.getAttribute('data-scheme') === 'forest'));
  ok('поповер закрылся', await p.evaluate(() => !document.getElementById('schemePopover').classList.contains('is-open')));
  await p.reload({ waitUntil: 'domcontentloaded' });
  await sleep(700);
  ok('схема пережила перезагрузку', await p.evaluate(() => document.documentElement.getAttribute('data-scheme') === 'forest'));
  ok('ошибок страницы нет', errs.length === 0, errs.join(' | '));
  await p.close();

  console.log('\n=== мобильный iPhone 13 ===');
  const m = await br.newPage();
  m.setDefaultTimeout(90000);
  const merrs = [];
  m.on('pageerror', (e) => merrs.push(String(e)));
  await m.emulate({
    viewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  await m.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await sleep(1000);
  const mBtn = await m.evaluate(() => {
    const r = document.getElementById('themeToggleBtn').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  const mTheme = await m.evaluate(() => document.documentElement.getAttribute('data-theme') || 'light');
  // Удержание пальца 650мс — лонгпресс.
  await m.touchscreen.touchStart(mBtn.x, mBtn.y);
  await sleep(650);
  const midOpen = await m.evaluate(() => document.getElementById('schemePopover').classList.contains('is-open'));
  await m.touchscreen.touchEnd();
  await sleep(250);
  ok('тач-удержание: поповер открылся ещё до отпускания', midOpen);
  const sheet = await m.evaluate(() => {
    const pEl = document.getElementById('schemePopover');
    const r = pEl.getBoundingClientRect();
    return { open: pEl.classList.contains('is-open'),
      left: r.left, right: innerWidth - r.right, bottom: innerHeight - r.bottom,
      theme: document.documentElement.getAttribute('data-theme') || 'light' };
  });
  ok('поповер остался открыт после отпускания', sheet.open);
  ok('тема НЕ щёлкнулась от лонгпресса', sheet.theme === mTheme, `${mTheme} -> ${sheet.theme}`);
  ok('нижний лист: отступы ~8px слева/справа/снизу',
     Math.abs(sheet.left - 8) <= 2 && Math.abs(sheet.right - 8) <= 2 && Math.abs(sheet.bottom - 8) <= 2,
     `l${sheet.left} r${sheet.right} b${sheet.bottom}`);
  await m.screenshot({ path: '/home/user/dev/bench/scheme-popover-mobile.png' });
  // Тап по пункту «Океан».
  const item = await m.evaluate(() => {
    const el = document.querySelector('#schemePopover [data-scheme-id="ocean"]');
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await m.touchscreen.tap(item.x, item.y);
  await sleep(300);
  ok('тап по «Океан»: схема применилась', await m.evaluate(() => document.documentElement.getAttribute('data-scheme') === 'ocean'));
  ok('…и поповер закрылся', await m.evaluate(() => !document.getElementById('schemePopover').classList.contains('is-open')));
  // Обычный короткий тап по кнопке всё ещё щёлкает тему.
  const mTheme2 = await m.evaluate(() => document.documentElement.getAttribute('data-theme') || 'light');
  await m.touchscreen.tap(mBtn.x, mBtn.y);
  await sleep(300);
  ok('короткий тап: тема переключается',
     (await m.evaluate(() => document.documentElement.getAttribute('data-theme') || 'light')) !== mTheme2);
  ok('ошибок страницы нет', merrs.length === 0, merrs.join(' | '));
  await m.close();

  await br.close();
  console.log(bad ? `\n=== FAIL (${bad}) ===` : '\n=== все проверки прошли ===');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('CRASH:', e); process.exit(1); });
