#!/usr/bin/env node
// Скриншоты единственной production-раскладки B-99 (panes): покой и
// hover одной карты. Opacity: 0.34 в светлой / 0.45 в тёмной теме.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const sparticuz = require('@sparticuz/chromium').default;
const puppeteer = require('puppeteer-core');

const CAPTURES = [
  { theme: 'light', mode: 'rest', caption: 'Светлая тема — panes, покой' },
  { theme: 'dark', mode: 'rest', caption: 'Тёмная тема — panes, покой' },
  { theme: 'light', mode: 'active', caption: 'Светлая тема — panes, hover по D' },
  { theme: 'dark', mode: 'active', caption: 'Тёмная тема — panes, hover по D' },
];

async function launch() {
  return puppeteer.launch({
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
}

async function shot(browser, mode, theme, caption) {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(path.resolve(__dirname, '../../STRUCHORD.html')).href, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof drawWheel === 'function');
  const clip = await page.evaluate(({ frameMode, themeName }) => {
    if (themeName === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
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
    let box = { left: sr.left, top: sr.top, right: sr.right, bottom: sr.bottom };
    if (frameMode === 'active') {
      // Макет состояния наведения: подсветка карточки D + меню в легенде.
      const sec = document.querySelector('#circleSvg .wheel-sector[data-wheel-chord-identity="D"][data-wheel-ring="major"]');
      sec?.classList.add('is-wheel-hovered');
      setWheelHarmonyLegendOpen(true);
      const cur = document.getElementById('wheelHarmonyLegendCurrent');
      const chip = (m) =>
        `<span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:var(--harmony-${m});margin:0 4px 0 0;vertical-align:-1px"></span>`;
      cur.innerHTML =
        '<strong>D: ступень IV</strong> — ' +
        chip('melodic-minor') + 'мелодический минор · ' +
        chip('dorian') + 'дорийский · ' +
        chip('mixolydian') + 'миксолидийский';
      const lg = document.getElementById('wheelHarmonyLegend').getBoundingClientRect();
      box = {
        left: Math.min(box.left, lg.left),
        top: Math.min(box.top, lg.top),
        right: Math.max(box.right, lg.right),
        bottom: Math.max(box.bottom, lg.bottom),
      };
    }
    const pad = 26;
    return {
      x: Math.max(0, box.left - pad),
      y: Math.max(0, box.top - pad),
      width: box.right - box.left + pad * 2,
      height: box.bottom - box.top + pad * 2,
    };
  }, { frameMode: mode, themeName: theme });
  await new Promise((r) => setTimeout(r, 900));
  await page.evaluate((cap) => {
    const el = document.createElement('div');
    el.textContent = cap;
    el.style.cssText =
      'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:2147483647;' +
      'background:#1f3b4c;color:#fff;padding:9px 18px;border-radius:10px;' +
      "font:600 17px/1.25 system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25);white-space:nowrap;";
    document.body.appendChild(el);
  }, caption);
  const file = path.join(__dirname, `b99-menu-shot-${theme}-${mode}.png`);
  await page.screenshot({ path: file, clip });
  await page.close();
  console.log('  кадр panes/' + theme + '/' + mode + ' → ' + path.basename(file));
  return file;
}

(async () => {
  const browser = await launch();
  try {
    const files = [];
    for (const capture of CAPTURES) {
      files.push(await shot(browser, capture.mode, capture.theme, capture.caption));
    }
    const cells = CAPTURES.map(
      (capture, i) =>
        `<figure><img src="${path.basename(files[i])}"><figcaption>${capture.caption}</figcaption></figure>`
    ).join('\n');
    fs.writeFileSync(
      path.join(__dirname, 'b99-menu-montage.html'),
      `<!doctype html><meta charset="utf-8"><style>
        body{margin:0;padding:20px;background:#f2efe9;font:500 15px/1.3 system-ui,sans-serif;
             display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;width:1480px;}
        figure{margin:0;background:#fff;border-radius:14px;overflow:hidden;
               box-shadow:0 3px 12px rgba(0,0,0,.12);}
        img{display:block;width:100%;}
        figcaption{padding:9px 14px;color:#1f3b4c;font-weight:600;}
      </style>\n${cells}\n`
    );
    const page = await browser.newPage();
    await page.setViewport({ width: 860, height: 600, deviceScaleFactor: 1.5 });
    await page.goto('file://' + path.join(__dirname, 'b99-menu-montage.html'));
    await new Promise((r) => setTimeout(r, 900));
    await page.screenshot({ path: path.join(__dirname, 'b99-menu-directions.png'), fullPage: true });
    await page.close();
    console.log('saved dev/bench/b99-menu-directions.png');
  } finally {
    await browser.close();
  }
})();
