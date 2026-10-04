#!/usr/bin/env node
// Геометрическая проверка единственной pane-раскладки B-99: поля,
// радиальная середина 2+1/3+2, клип карточки и paint order разделителей.
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
    const out = {
      diagrams: 0, panes: 0, clipped: 0, complete: 0,
      dividers: { paths: 0, complete: 0, clipped: 0, paintOrder: 0 },
      midpointSplits: { three: 0, five: 0 }, unevenAreas: { three: 0, five: 0 },
      opacity: null, layouts: {},
    };
    const followsInPaintOrder = (earlier, later) => !!(earlier && later &&
      (earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING));
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
      const dividerLayer = [...document.querySelectorAll('#circleSvg .wheel-mode-divider-overlay')]
        .find((layer) => layer.dataset.paneKey === dg.dataset.paneKey);
      const dividerCount = dividerLayer?.querySelectorAll('.wheel-mode-divider').length || 0;
      const expectedDividerCount = ({ 1: 0, 2: 1, 3: 2, 4: 2, 5: 4 })[expectedCount];
      out.dividers.paths += dividerCount;
      if (dividerCount === expectedDividerCount) out.dividers.complete += 1;
      const volume = [...document.querySelectorAll('#circleSvg .wheel-sector-volume')].find((node) =>
        node.dataset.wheelChordIdentity === dg.dataset.wheelChordIdentity &&
        node.dataset.wheelHoverRing === dg.dataset.wheelHoverRing);
      const paneUnderVolume = followsInPaintOrder(dg, volume);
      const dividerAboveVolume = expectedDividerCount === 0 ||
        (dividerLayer && dividerLayer.getAttribute('clip-path') === dg.getAttribute('clip-path') &&
          followsInPaintOrder(volume, dividerLayer));
      if (expectedDividerCount === 0 || dividerLayer?.getAttribute('clip-path') === dg.getAttribute('clip-path')) {
        out.dividers.clipped += 1;
      }
      if (paneUnderVolume && dividerAboveVolume) out.dividers.paintOrder += 1;
      if (expectedCount === 3 || expectedCount === 5) {
        const band = expectedCount === 3 ? 'three' : 'five';
        const inner = Number(dg.dataset.sectorInnerRadius);
        const outer = Number(dg.dataset.sectorOuterRadius);
        const split = Number(dg.dataset.radialBandSplitRadius);
        if (Math.abs(split - ((inner + outer) / 2)) < 0.0051) out.midpointSplits[band] += 1;
        const shares = panes.map((pane) => Number.parseFloat(pane.dataset.paneAreaShare));
        if (Math.abs(shares.reduce((sum, share) => sum + share, 0) - 1) < 0.001 && new Set(shares).size > 1) out.unevenAreas[band] += 1;
      }
      if (panes[0]) out.opacity = getComputedStyle(panes[0]).fillOpacity;
    });
    return out;
  });
  console.log(JSON.stringify(report));
  await browser.close();
})();
