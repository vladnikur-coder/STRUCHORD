// Зонд B-67: покадровая телеметрия перелёта тултипа в док.
// На каждом rAF после отпускания меряем: rect/opacity летящего тултипа,
// opacity/transform карточки грифа в доке, opacity кнопок панели,
// --pinned-shift сетки. Ручной зонд, в тесты не входит.
// Запуск: node dev/tools/probe-b67-fly.js  (нужен http://127.0.0.1:8000)
const path = require('path');
const fs = require('fs');
const sparticuz = require('@sparticuz/chromium').default;
const puppeteer = require('puppeteer-core');

const OUT = path.join(__dirname, '..', 'bench', 'results');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = process.argv.includes('--shots');

(async () => {
  const browser = await puppeteer.launch({
    args: [...sparticuz.args, '--no-sandbox'],
    executablePath: await sparticuz.executablePath(),
    headless: 'shell',
    defaultViewport: { width: 1400, height: 900 },
    env: { ...process.env, LD_LIBRARY_PATH: '/tmp/libs/al2023/lib' },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('[pageerror]', String(e)));
  await page.goto(`http://127.0.0.1:8000/STRUCHORD.html?probe-b67=${Date.now()}`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction('typeof addSection === "function"');
  await page.evaluate(() => {
    sections = [{ id: 1, type: 'Verse', customName: null, key: 'C', timeSig: null, bpm: 0,
      repeat: 1, strumPattern: null, squares: [
        { id: 2, repeat: 1, customBeats: null, strumPattern: null, events: [
          { chord: 'Dm', span: 4, timeSig: null, strumPattern: null },
          { chord: 'G', span: 4, timeSig: null, strumPattern: null },
        ]},
      ]
    }];
    render();
  });
  await sleep(300);

  // Наводим на ячейку Dm — ждём тултип.
  const cell = await page.$('.chord-wrapper');
  const cb = await cell.boundingBox();
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
  await page.waitForFunction(() => {
    const t = document.getElementById('fingering-tooltip');
    return t && getComputedStyle(t).opacity === '1' && t.getBoundingClientRect().width > 0;
  }, { timeout: 5000 });
  await sleep(400);

  const tb = await page.$eval('#fingering-tooltip', (t) => { const r = t.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const bar = await page.$eval('.transport-bar', (t) => { const r = t.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  console.log('tooltip', tb, 'bar', bar);

  // Тащим тултип за заголовок (не по кнопкам) в док.
  const gx = tb.x + 20, gy = tb.y + 10;
  await page.mouse.move(gx, gy);
  await page.mouse.down();
  const tx = bar.x + bar.w * 0.5, ty = bar.y + bar.h * 0.5;
  for (let i = 1; i <= 25; i++) {
    await page.mouse.move(gx + (tx - gx) * i / 25, gy + (ty - gy) * i / 25);
    await sleep(16);
  }
  await sleep(500); // дать догоняющей петле дойти

  // Сэмплер.
  await page.evaluate(() => {
    window.__fly = [];
    window.__flyOn = true;
    const t0 = performance.now();
    const q = (sel) => document.querySelector(sel);
    const sample = () => {
      if (!window.__flyOn) return;
      const tip = q('#fingering-tooltip');
      const card = q('#pinnedRow .pinned-fingering');
      const row = q('#pinnedRow');
      const btn = q('.transport-bar > button, .transport-bar > .transport-group, .transport-bar > *:not(.transport-dock-hint):not(.pinned-row)');
      const grid = q('#sectionsContainer');
      const tr = tip && tip.getBoundingClientRect();
      const cr = card && card.getBoundingClientRect();
      window.__fly.push({
        t: Math.round(performance.now() - t0),
        tipOp: tip ? +getComputedStyle(tip).opacity : null,
        tipCls: tip ? tip.className : null,
        tipX: tr ? Math.round(tr.x) : null, tipY: tr ? Math.round(tr.y) : null, tipH: tr ? Math.round(tr.height) : null,
        rowDisp: row ? getComputedStyle(row).display : null,
        cardOp: card ? +getComputedStyle(card).opacity : null,
        cardTf: card ? getComputedStyle(card).transform : null,
        cardY: cr ? Math.round(cr.y) : null, cardH: cr ? Math.round(cr.height) : null,
        rowCls: row ? row.className : null,
        btnOp: btn ? +getComputedStyle(btn).opacity : null,
        bodyPin: document.body.classList.contains('is-pin-dragging'),
        shift: grid ? getComputedStyle(grid).paddingTop : null,
      });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });

  const shotsDir = path.join(OUT, 'b67-frames');
  if (SHOTS) { fs.rmSync(shotsDir, { recursive: true, force: true }); fs.mkdirSync(shotsDir, { recursive: true }); }
  await page.mouse.up();
  if (SHOTS) {
    for (let i = 0; i < 30; i++) {
      await page.screenshot({ path: path.join(shotsDir, `f${String(i).padStart(2, '0')}.png`), clip: { x: 0, y: 0, width: 900, height: 420 } });
    }
  } else {
    await sleep(1100);
  }
  await page.evaluate(() => { window.__flyOn = false; });
  const data = await page.evaluate(() => window.__fly);

  // --- Часть 2 (0.199): вынос грифа из дока — догонялка + возврат полётом.
  await sleep(300);
  const card0 = await page.$eval('#pinnedRow .pinned-fingering', (t) => { const r = t.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await page.mouse.move(card0.x + 20, card0.y + 8);
  await page.mouse.down();
  await page.mouse.move(card0.x + 20 + 60, card0.y + 8 + 300, { steps: 2 }); // резкий рывок
  const lag = [];
  for (let i = 0; i < 12; i++) {
    lag.push(await page.$eval('#pinnedRow', (t) => { const r = t.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), getComputedStyle(t).opacity]; }));
    await sleep(16);
  }
  console.log('лаг грифа после рывка (x,y,opacity по кадрам):', JSON.stringify(lag));
  // возвращаем в док
  await page.mouse.move(bar.x + bar.w / 2, bar.y + bar.h / 2, { steps: 10 });
  await sleep(400);
  await page.mouse.up();
  const back = [];
  for (let i = 0; i < 28; i++) {
    back.push(await page.$eval('#pinnedRow', (t) => { const r = t.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), t.className, getComputedStyle(t).position]; }));
    await sleep(16);
  }
  console.log('возврат в док (x,y,class,position):'); back.forEach((b) => console.log('  ', JSON.stringify(b)));
  console.log('pinned после возврата:', await page.evaluate(() => !!pinnedFingering));
  fs.writeFileSync(path.join(OUT, 'b67-fly.json'), JSON.stringify(data, null, 1));
  // Компактная таблица.
  console.log('t\ttipOp\ttipY\ttipH\trowDisp\tcardOp\tcardY\tbtnOp\tpin\tshift\tcardTf');
  for (const s of data) {
    console.log([s.t, s.tipOp, s.tipY, s.tipH, s.rowDisp, s.cardOp && s.cardOp.toFixed(2), s.cardY, s.btnOp && s.btnOp.toFixed(2), s.bodyPin ? 1 : 0, s.shift, s.cardTf].join('\t'));
  }
  await browser.close();
})();
