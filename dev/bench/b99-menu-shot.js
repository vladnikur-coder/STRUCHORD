#!/usr/bin/env node
// Скриншот круга с меню заимствований (круговая диаграмма на весь сектор)
// для живой оценки. Круг открывается программно, снимок кропится к самому
// колесу; скрипт падает, если SVG не виден — никаких «кадров без круга».
const path = require('path');
const { pathToFileURL } = require('url');
const sparticuz = require('@sparticuz/chromium').default;
const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    args: [...sparticuz.args, '--no-sandbox'],
    executablePath: await sparticuz.executablePath(),
    headless: 'shell',
    defaultViewport: { width: 1280, height: 960, deviceScaleFactor: 2 },
    env: {
      ...process.env,
      LD_LIBRARY_PATH: ['/tmp/al2023/lib', '/tmp/libs/al2023/lib', '/tmp/dist/Release/lib', process.env.LD_LIBRARY_PATH]
        .filter(Boolean).join(':'),
    },
  });
  const page = await browser.newPage();
  await page.goto(pathToFileURL(path.resolve(__dirname, '../../STRUCHORD.html')).href, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof drawWheel === 'function');
  const clip = await page.evaluate(() => {
    document.getElementById('showDegrees').checked = true;
    globalKey = 'Am';
    keyMode = 'manual';
    activeSectionKey = null;
    activeChordInput = null;
    updateCellsDegrees();
    DOM.chordWheelModal.classList.add('open', 'is-harmony-highlights-on');
    wheelMode = 'triads';
    drawWheel();
    const sr = document.getElementById('circleSvg').getBoundingClientRect();
    if (sr.width < 100 || sr.height < 100) throw new Error('circleSvg не виден: ' + JSON.stringify(sr));
    const pad = 26;
    return { x: Math.max(0, sr.left - pad), y: Math.max(0, sr.top - pad), width: sr.width + pad * 2, height: sr.height + pad * 2 };
  });
  await new Promise((r) => setTimeout(r, 900));
  await page.screenshot({ path: path.join(__dirname, 'b99-menu-wheel.png'), clip });
  await browser.close();
  console.log('saved dev/bench/b99-menu-wheel.png');
})();
