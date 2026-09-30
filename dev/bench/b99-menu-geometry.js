#!/usr/bin/env node
// Геометрическая проверка меню-точек: внутри своей карточки, под именем,
// не пересекаются ни с именем, ни со степенью.
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
    const out = { labels: 0, dots: 0, inside: 0, nameOverlap: 0, degreeOverlap: 0, radiusPx: [] };
    document.querySelectorAll('#circleSvg .wheel-chord-label').forEach((label) => {
      if (!label.querySelector('.wheel-mode-dot')) return;
      out.labels += 1;
      const id = label.dataset.wheelChordIdentity;
      const ring = label.dataset.wheelHoverRing;
      const sector = document.querySelector(`#circleSvg .wheel-sector[data-wheel-chord-identity="${id}"][data-wheel-ring="${ring}"]`);
      const lb = label.getBoundingClientRect();
      const sb = sector.getBoundingClientRect();
      const nameText = label.querySelector('text');
      const nb = nameText.getBoundingClientRect();
      const degreeText = label.querySelector('.wheel-degree-label');
      label.querySelectorAll('.wheel-mode-dot').forEach((dot) => {
        out.dots += 1;
        const db = dot.getBoundingClientRect();
        out.radiusPx.push(Math.round(db.width * 10) / 10);
        if (db.left >= sb.left - 1 && db.right <= sb.right + 1 && db.top >= sb.top - 1 && db.bottom <= sb.bottom + 1) out.inside += 1;
        const hit = (a, b) => !(a.right < b.left || b.right < a.left || a.bottom < b.top || b.bottom < a.top);
        if (!hit(db, nb)) out.nameOverlap += 1;
        if (!degreeText || !hit(db, degreeText.getBoundingClientRect())) out.degreeOverlap += 1;
      });
    });
    return out;
  });
  console.log(JSON.stringify(report));
  await browser.close();
})();
