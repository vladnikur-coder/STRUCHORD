// Съёмка B-31: правый край квадрата, shrink «4 такта → 1 такт».
// Ручной зонд (как прочие shot-*/probe-*): запускается напрямую, не входит
// в dev/run-tests.sh. Кадры — в dev/bench/results/.
//
// Сценарий пользователя (handoff 2026-09-01): кадр 1 до resize, кадр 2 до
// отпускания мыши (после visual settle), кадр 3 после отпускания. Ищем
// серый/тёмный участок справа и отвечаем, идентичны ли кадры 2 и 3.
//
// Требует @sparticuz/chromium; в песочнице без системного nss —
// LD_LIBRARY_PATH с libnss3 из al2023-архива пакета (см. analyze-b31).
const path = require('path');
const fs = require('fs');
const sparticuz = require('@sparticuz/chromium').default;
const puppeteer = require('puppeteer-core');

const OUT = path.join(__dirname, '..', 'bench', 'results');
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// DOM-зонд правого края: что реально нарисовано в точках сетки ПО ВСЕЙ
// ширине .square (включая область справа от сжавшегося квадрата).
const PROBE_FN = () => {
  const sq = document.querySelector('.square');
  const sqInner = document.querySelector('.square-inner');
  const sqRect = sq.getBoundingClientRect();
  const innerRect = sqInner.getBoundingClientRect();
  const cs = getComputedStyle(sqInner);
  const y = innerRect.top + innerRect.height / 2;
  const points = [];
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const x = sqRect.left + (sqRect.width * i) / N;
    const stack = document.elementsFromPoint(x, y).slice(0, 4).map((el) => {
      const s = getComputedStyle(el);
      const cls = el.className && el.className.baseVal !== undefined ? el.className : String(el.className);
      return `${el.tagName}.${String(cls).split(' ').slice(0, 2).join('.')}|${s.backgroundColor}|${s.backgroundImage !== 'none' ? 'img' : '-'}`;
    });
    points.push({ x: Math.round(x - sqRect.left), stack });
  }
  const layerBg = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const s = getComputedStyle(el);
    return `${s.backgroundColor} ${s.backgroundImage !== 'none' ? 'img' : '-'}`;
  };
  const overlay = document.querySelector('.square-edge-freeze-overlay');
  const strip = document.querySelector('.square-edge-removed-strip');
  return {
    page: { sqLeft: Math.round(sqRect.left), sqTop: Math.round(sqRect.top), sqW: Math.round(sqRect.width), sqH: Math.round(sqRect.height), y: Math.round(y) },
    innerRect: {
      left: Math.round(innerRect.left - sqRect.left),
      width: Math.round(innerRect.width),
      right: Math.round(innerRect.right - sqRect.left),
    },
    innerWidthStyle: sqInner.style.width,
    innerWidthComputed: cs.width,
    innerBg: `${cs.backgroundColor} ${cs.backgroundImage !== 'none' ? 'img' : '-'}`,
    layers: {
      square: layerBg('.square'),
      squareRow: layerBg('.square-row'),
      squaresList: layerBg('.squares-list'),
      squaresViewport: layerBg('.squares-viewport'),
      sectionCard: layerBg('.section-card'),
      body: `${getComputedStyle(document.body).backgroundColor} -`,
    },
    grid: sqInner.style.gridTemplateColumns.slice(0, 80),
    classes: sqInner.className,
    overlay: overlay
      ? { mode: overlay.dataset.mode, hiding: overlay.classList.contains('is-hiding'), slide: overlay.classList.contains('is-slide-out') }
      : null,
    strip: strip
      ? { left: strip.style.left, width: strip.style.width, transform: getComputedStyle(strip).transform.slice(0, 40) }
      : null,
    badge: document.querySelector('.square-beats-badge')?.textContent || '',
    wrappers: document.querySelectorAll('.square-inner > .chord-wrapper').length,
    points,
  };
};

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
  await page.goto(`http://127.0.0.1:8000/STRUCHORD.html?shot-b31=${Date.now()}`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction('typeof addSection === "function"');

  // Сцена: секция 4/4, ОДИН квадрат на 4 такта (4 ячейки по 4 доли).
  await page.evaluate(() => {
    sections = [{ id: 1, type: 'Verse', customName: null, key: 'C', timeSig: null, bpm: 0,
      repeat: 1, strumPattern: null, squares: [
        { id: 2, repeat: 1, customBeats: null, strumPattern: null, events: [
          { chord: 'C', span: 4, timeSig: null, strumPattern: null },
          { chord: 'G', span: 4, timeSig: null, strumPattern: null },
          { chord: 'Am', span: 4, timeSig: null, strumPattern: null },
          { chord: 'F', span: 4, timeSig: null, strumPattern: null },
        ]},
      ]
    }];
    if (songRhythmRolls) {
      for (const key of [...songRhythmRolls.refs.keys()]) songRhythmRolls.refs.delete(key);
      songRhythmRolls.sectionRolls.delete(1);
    }
    render();
  });
  await sleep(300);

  const handle = await page.$('.square[data-square="2"] .square-resize-handle');
  const hb = await handle.boundingBox();
  if (!hb) throw new Error('ручка правого края не найдена');
  const cx = hb.x + hb.width / 2, cy = hb.y + hb.height / 2;
  const inner = await page.$eval('.square[data-square="2"] .square-inner', (el) => el.getBoundingClientRect().width);
  console.log('ручка', Math.round(cx), Math.round(cy), 'ширина квадрата', Math.round(inner));

  const shot = (name, clip) => page.screenshot({ path: path.join(OUT, name), clip });

  // Кадр 1: до resize
  const p1 = await page.evaluate(PROBE_FN);
  await shot('b31-1-before.png');

  // Тянем влево к 1 такту (через 3 и 2 — как рукой), мышь зажата.
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  const targetX = cx - inner * 0.75; // 16 долей -> 4 доли
  await page.mouse.move(targetX, cy, { steps: 14 });

  // Кадр 2a: середина анимации (~80мс из 160мс)
  await sleep(80);
  await shot('b31-2a-mid-drag.png');
  const p2a = await page.evaluate(PROBE_FN);

  // Кадр 2: после visual settle, мышь ещё зажата (это главный кадр)
  await sleep(600);
  const p2 = await page.evaluate(PROBE_FN);
  await shot('b31-2-settled-hold.png');

  // Кадр 3: отпустили
  await page.mouse.up();
  await sleep(500);
  const p3 = await page.evaluate(PROBE_FN);
  await shot('b31-3-after-up.png');

  const dump = { p1, p2a, p2, p3 };
  fs.writeFileSync(path.join(OUT, 'b31-probes.json'), JSON.stringify(dump, null, 2));

  // Компактный отчёт по зондам
  const brief = (p) => ({
    inner: p.innerRect, style: p.innerWidthStyle, computed: p.innerWidthComputed,
    bg: p.innerBg, classes: p.classes, grid: p.grid, overlay: p.overlay, strip: p.strip,
    badge: p.badge, wrappers: p.wrappers,
  });
  console.log('P1', JSON.stringify(brief(p1)));
  console.log('P2a', JSON.stringify(brief(p2a)));
  console.log('P2', JSON.stringify(brief(p2)));
  console.log('P3', JSON.stringify(brief(p3)));

  await browser.close();
  console.log('кадры в', OUT);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
