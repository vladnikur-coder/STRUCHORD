#!/usr/bin/env node
// Геометрическая проверка единственной pane-раскладки B-99: количество
// полей, ожидаемые доли площади и обрезка по форме карточки.
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
    const out = { diagrams: 0, panes: 0, clipped: 0, complete: 0, equalAreaShares: 0, opacity: null, layouts: {} };
    document.querySelectorAll('#circleSvg .wheel-mode-diagram').forEach((dg) => {
      out.diagrams += 1;
      const panes = [...dg.querySelectorAll('.wheel-mode-pane')];
      const expectedCount = Number(dg.dataset.paneCount);
      out.panes += panes.length;
      const layout = dg.dataset.paneLayout || 'missing';
      out.layouts[layout] = (out.layouts[layout] || 0) + 1;
      const clipId = (dg.getAttribute('clip-path') || '').match(/^url\(#([^)]+)\)$/)?.[1];
      if (clipId && document.getElementById(clipId)?.querySelector('path')) out.clipped += 1;
      if (panes.length === expectedCount && expectedCount >= 1 && expectedCount <= 5) out.complete += 1;
      const shares = panes.map((pane) => Number.parseFloat(pane.dataset.paneAreaShare));
      if (shares.length === expectedCount && shares.every((share) => Math.abs(share - 1 / expectedCount) < 0.0001)) out.equalAreaShares += 1;
      if (panes[0]) out.opacity = getComputedStyle(panes[0]).fillOpacity;
    });
    return out;
  });
  console.log(JSON.stringify(report));
  await browser.close();
})();
