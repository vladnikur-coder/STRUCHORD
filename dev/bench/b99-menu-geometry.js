#!/usr/bin/env node
// Геометрическая проверка меню-диаграммы (круговая, на весь сектор):
// у каждой карточки лучи сходятся в её центр, геометрия лучей накрывает
// карточку целиком, и группа обрезана clipPath по форме карточки.
const path = require('path');
const { pathToFileURL } = require('url');
const sparticuz = require('@sparticuz/chromium').default;
const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    args: [...sparticuz.args, '--no-sandbox'],
    executablePath: await sparticuz.executablePath(),
    headless: 'shell',
    defaultViewport: { width: 1440, height: 1000 },
    env: {
      ...process.env,
      LD_LIBRARY_PATH: ['/tmp/al2023/lib', '/tmp/libs/al2023/lib', '/tmp/dist/Release/lib', process.env.LD_LIBRARY_PATH]
        .filter(Boolean).join(':'),
    },
  });
  const page = await browser.newPage();
  await page.goto(pathToFileURL(path.resolve(__dirname, '../../STRUCHORD.html')).href, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof drawWheel === 'function');
  const report = await page.evaluate(() => {
    globalKey = 'Am'; keyMode = 'manual'; activeSectionKey = null; activeChordInput = null;
    document.getElementById('showDegrees').checked = true;
    updateCellsDegrees();
    DOM.chordWheelModal.classList.add('open', 'is-harmony-highlights-on');
    wheelMode = 'triads';
    drawWheel();
    const out = { diagrams: 0, wedges: 0, clipped: 0, sameCenter: 0, covers: 0 };
    document.querySelectorAll('#circleSvg .wheel-mode-diagram').forEach((dg) => {
      out.diagrams += 1;
      const id = dg.dataset.wheelChordIdentity;
      const ring = dg.dataset.wheelHoverRing;
      const sector = document.querySelector(`#circleSvg .wheel-sector[data-wheel-chord-identity="${id}"][data-wheel-ring="${ring}"]`);
      if (!sector) return;
      if (/^url\(#wheel-menu-clip-/.test(dg.getAttribute('clip-path') || '')) out.clipped += 1;
      const wedges = [...dg.querySelectorAll('.wheel-mode-wedge')];
      out.wedges += wedges.length;
      // Центр диаграммы: у лучей — первая точка M, у сплошного диска —
      // середина между концами его дуги (M-точка диска лежит за радиус).
      const centerOf = (w) => {
        const d = w.getAttribute('d') || '';
        const disc = d.match(/^M(-?[\d.]+) (-?[\d.]+) A[\d.]+ [\d.]+ 0 1 0 (-?[\d.]+) (-?[\d.]+)/);
        if (disc && !/ L/.test(d)) {
          return {
            x: (Number.parseFloat(disc[1]) + Number.parseFloat(disc[3])) / 2,
            y: (Number.parseFloat(disc[2]) + Number.parseFloat(disc[4])) / 2,
          };
        }
        const m = d.match(/^M(-?[\d.]+) (-?[\d.]+)/);
        return { x: Number.parseFloat(m[1]), y: Number.parseFloat(m[2]) };
      };
      const centers = wedges.map(centerOf).filter((c) => !Number.isNaN(c.x));
      if (centers.length === wedges.length && centers.every((p) => Math.hypot(p.x - centers[0].x, p.y - centers[0].y) < 0.5)) out.sameCenter += 1;
      // Неклипнутая геометрия лучей (их объединение) накрывает карточку
      // целиком, а центр диаграммы лежит внутри самой карточки.
      const sb = sector.getBBox();
      const c0 = centers[0];
      const inCard = c0.x > sb.x && c0.x < sb.x + sb.width && c0.y > sb.y && c0.y < sb.y + sb.height;
      const boxes = wedges.map((w) => w.getBBox());
      const ux = Math.min(...boxes.map((b) => b.x));
      const uy = Math.min(...boxes.map((b) => b.y));
      const ur = Math.max(...boxes.map((b) => b.x + b.width));
      const ub = Math.max(...boxes.map((b) => b.y + b.height));
      const covers = ux <= sb.x + 1 && uy <= sb.y + 1 && ur >= sb.x + sb.width - 1 && ub >= sb.y + sb.height - 1;
      if (inCard && covers) out.covers += 1;
    });
    return out;
  });
  console.log(JSON.stringify(report));
  await browser.close();
})();
