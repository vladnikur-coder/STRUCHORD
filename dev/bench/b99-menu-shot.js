#!/usr/bin/env node
// Скриншоты единственной production-раскладки B-99: покой и hover карты
// вместе с компактной интерактивной палитрой. Opacity: 0.34 / 0.45.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const sparticuz = require('@sparticuz/chromium').default;
const puppeteer = require('puppeteer-core');

const OUTPUT_DIR = path.resolve(process.env.B99_CAPTURE_DIR || path.join(__dirname, 'captures'));
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const CAPTURES = [
  { theme: 'light', mode: 'rest', caption: 'Светлая тема — panes, покой' },
  { theme: 'dark', mode: 'rest', caption: 'Тёмная тема — panes, покой' },
  { theme: 'light', mode: 'active', caption: 'Светлая тема — panes, hover по A#' },
  { theme: 'dark', mode: 'active', caption: 'Тёмная тема — panes, hover по A#' },
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
      // Hover-подпись у левого цветового поля остаётся видна рядом с открытой палитрой.
      bindWheelHarmonyLegend();
      setWheelHarmonyLegendOpen(true);
      const diagram = document.querySelector('#circleSvg .wheel-mode-diagram[data-wheel-chord-identity="A#"][data-wheel-hover-ring="major"]');
      const pane = diagram?.querySelector('.wheel-mode-pane[data-mode="phrygian"]');
      const sector = document.querySelector('#circleSvg .wheel-sector[data-wheel-chord-identity="A#"][data-wheel-ring="major"]');
      const start = Number(pane.dataset.paneStartAngle);
      const end = Number(pane.dataset.paneEndAngle);
      const inner = Number(pane.dataset.paneInnerRadius);
      const outer = Number(pane.dataset.paneOuterRadius);
      const point = document.getElementById('circleSvg').createSVGPoint();
      point.x = 270 + ((inner + outer) / 2) * Math.cos((start + end) / 2);
      point.y = 270 + ((inner + outer) / 2) * Math.sin((start + end) / 2);
      const screen = point.matrixTransform(diagram.getScreenCTM());
      const eventOptions = { bubbles: true, clientX: screen.x, clientY: screen.y, pointerType: 'mouse' };
      sector.dispatchEvent(new PointerEvent('pointerover', eventOptions));
      sector.dispatchEvent(new PointerEvent('pointermove', eventOptions));
      const lg = document.getElementById('wheelHarmonyLegend').getBoundingClientRect();
      const label = document.getElementById('wheelModeHoverLabel').getBoundingClientRect();
      box = {
        left: Math.min(box.left, lg.left, label.left),
        top: Math.min(box.top, lg.top, label.top),
        right: Math.max(box.right, lg.right, label.right),
        bottom: Math.max(box.bottom, lg.bottom, label.bottom),
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
  const file = path.join(OUTPUT_DIR, `b99-menu-shot-${theme}-${mode}.png`);
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
      path.join(OUTPUT_DIR, 'b99-menu-montage.html'),
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
    await page.goto('file://' + path.join(OUTPUT_DIR, 'b99-menu-montage.html'));
    await new Promise((r) => setTimeout(r, 900));
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'b99-menu-directions.png'), fullPage: true });
    await page.close();
    console.log('saved ' + path.join(OUTPUT_DIR, 'b99-menu-directions.png'));
  } finally {
    await browser.close();
  }
})();
