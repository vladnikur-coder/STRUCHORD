#!/usr/bin/env node
// Геометрическая проверка меню-диаграммы: клинья внутри своей карточки,
// отступ от краёв сохранён, суммарная площадь клиньев — заметная доля
// карточки (цвет читается, а не точка).
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
    const out = { diagrams: 0, wedges: 0, inside: 0, minMargin: 99, minCoverage: 99, maxCoverage: 0 };
    document.querySelectorAll('#circleSvg .wheel-mode-diagram').forEach((diagram) => {
      out.diagrams += 1;
      const id = diagram.dataset.wheelChordIdentity;
      const ring = diagram.dataset.wheelHoverRing;
      const sector = document.querySelector(`#circleSvg .wheel-sector[data-wheel-chord-identity="${id}"][data-wheel-ring="${ring}"]`);
      if (!sector) return;
      const sb = sector.getBBox();
      const cardArea = sb.width * sb.height;
      let wedgeArea = 0;
      diagram.querySelectorAll('.wheel-mode-wedge').forEach((wedge) => {
        out.wedges += 1;
        const wb = wedge.getBBox();
        wedgeArea += wb.width * wb.height;
        const margin = Math.min(wb.x - sb.x, sb.x + sb.width - (wb.x + wb.width), wb.y - sb.y, sb.y + sb.height - (wb.y + wb.height));
        if (margin < out.minMargin) out.minMargin = Math.round(margin * 10) / 10;
        if (wb.x >= sb.x - 0.5 && wb.x + wb.width <= sb.x + sb.width + 0.5 && wb.y >= sb.y - 0.5 && wb.y + wb.height <= sb.y + sb.height + 0.5) out.inside += 1;
      });
      const coverage = Math.round((wedgeArea / cardArea) * 1000) / 10;
      if (coverage < out.minCoverage) out.minCoverage = coverage;
      if (coverage > out.maxCoverage) out.maxCoverage = coverage;
    });
    return out;
  });
  console.log(JSON.stringify(report));
  await browser.close();
})();
