#!/usr/bin/env node
// Скриншот круга с меню заимствований (0.546) для живой оценки геометрии.
const fs = require('fs');
const path = require('path');
const sparticuz = require('@sparticuz/chromium').default;
const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    args: [...sparticuz.args, '--no-sandbox', '--font-render-hinting=none'],
    executablePath: await sparticuz.executablePath(),
    headless: 'shell',
    env: {
      ...process.env,
      LD_LIBRARY_PATH: ['/tmp/al2023/lib', '/tmp/libs/al2023/lib', '/tmp/dist/Release/lib', process.env.LD_LIBRARY_PATH]
        .filter(Boolean).join(':'),
    },
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });
  await page.goto('file://' + path.resolve(__dirname, '../../STRUCHORD.html'));
  await page.evaluate(() => {
    document.getElementById('showDegrees').checked = true;
    globalKey = 'Am'; keyMode = 'manual';
    const firstCell = document.querySelector('.chord-input');
    if (firstCell) {
      activeChordInput = firstCell;
      firstCell.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
  });
  await new Promise((r) => setTimeout(r, 1800));
  await page.screenshot({ path: '/home/user/STRUCHORD/dev/bench/b99-menu-wheel.png' });
  await browser.close();
  console.log('saved dev/bench/b99-menu-wheel.png');
})();
