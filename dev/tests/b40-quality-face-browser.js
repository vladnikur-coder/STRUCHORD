// B-40: real Chromium regression for the quality-button face itself.
// Selecting a quality must commit old/new active paint atomically: its polar
// host remains fixed, its face gets no CSS paint/transform animation during
// the handoff, and normal transform-only hover returns after that frame.
const path = require('path');
const { pathToFileURL } = require('url');
// The bundled Chromium is an Amazon Linux binary. Ask its loader to unpack
// the matching NSS runtime before it is imported, even on local Linux CI.
process.env.AWS_EXECUTION_ENV ||= 'AWS_Lambda_nodejs22.x';
const sparticuz = require('@sparticuz/chromium').default;
const puppeteer = require('puppeteer-core');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let failures = 0;
function ok(name, condition, detail = '') {
  console.log(`   ${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures += 1;
}

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
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  try {
    const appUrl = pathToFileURL(path.resolve(__dirname, '../../STRUCHORD.html')).href;
    await page.goto(`${appUrl}?view=editor&b40-quality-face=${Date.now()}`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() =>
      typeof addSection === 'function' && typeof openChordWheel === 'function',
    { timeout: 30000 });
    await page.evaluate(() => {
      addSection('Verse');
      render();
      const input = document.querySelector('.chord-input');
      input.value = 'C';
      sections[0].squares[0].events[0].chord = 'C';
      syncChordDisplay(input);
      openChordWheel(input);
    });
    await page.waitForSelector('.mode-tab[data-wheel-mode="7"]', { timeout: 10000 });
    await sleep(500);

    const modes = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.mode-tab')).map((tab) => tab.dataset.wheelMode),
    );
    ok('Chromium opens seven live quality faces', modes.length === 7, modes.join(', '));

    const results = [];
    for (const mode of modes) {
      results.push(await page.evaluate(async (nextMode) => {
        const tab = document.querySelector(`.mode-tab[data-wheel-mode="${nextMode}"]`);
        const face = tab.querySelector('.mode-tab-face');
        const beforeHost = tab.getBoundingClientRect();
        const snapshot = (phase) => {
          const host = tab.getBoundingClientRect();
          return {
            phase,
            active: document.querySelector('.mode-tab.active')?.dataset.wheelMode || 'triads',
            stateSwap: tab.classList.contains('mode-tab-state-swap'),
            faceTransition: getComputedStyle(face).transitionProperty,
            faceAnimations: face.getAnimations().length,
            hostDrift: Math.hypot(host.x - beforeHost.x, host.y - beforeHost.y),
          };
        };
        tab.click();
        const samples = [snapshot('same-task')];
        for (const delay of [0, 16, 50, 120, 220]) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          samples.push(snapshot(`${delay}ms`));
        }
        return { mode: nextMode, samples };
      }, mode));
    }

    for (const result of results) {
      const first = result.samples[0];
      const stable = result.samples.every((sample) =>
        sample.active === result.mode && sample.hostDrift < 0.01 && sample.faceAnimations === 0,
      );
      const atomicallyCommitted = first.stateSwap && first.faceTransition === 'none';
      const hoverRouteRestored = result.samples.at(-1).faceTransition === 'transform';
      ok(`quality ${result.mode}: clicked face has no flashing handoff`,
        stable && atomicallyCommitted && hoverRouteRestored, JSON.stringify(result.samples));
    }

    const sectorClick = await page.evaluate(() => {
      const svg = document.getElementById('circleSvg');
      const sector = svg.querySelector('path.wheel-sector');
      sector.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return {
        whitePulseRings: svg.querySelectorAll('circle[stroke="#ffffff"]').length,
        directPulseFactory: typeof window.addPulse,
      };
    });
    ok('sector click creates no white SVG feedback ring',
      sectorClick.whitePulseRings === 0 && sectorClick.directPulseFactory === 'undefined', JSON.stringify(sectorClick));
    ok('real-browser quality handoff completed without page errors', pageErrors.length === 0, pageErrors.join(' | '));
  } finally {
    await browser.close();
  }

  console.log(failures ? `\n${failures} FAIL` : '\nALL OK — B-40 Chromium quality-face regression');
  process.exit(failures ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
