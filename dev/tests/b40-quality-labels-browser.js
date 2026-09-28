// B-40: real Chromium regression for the quality-name blink reported in 0.530.
// A quality click must replace the SVG labels synchronously: no ghost exit layer,
// no entering/exiting label class, and exactly one label group per sector on every
// browser-compositor sample.
const path = require('path');
const { pathToFileURL } = require('url');
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
    // Arena's minimal Debian image has no NSS runtime package.  The CI image
    // normally exposes Amazon-Linux libs here; the local fallback is where the
    // real-browser setup places the matching downloaded/built NSS runtime.
    env: {
      ...process.env,
      LD_LIBRARY_PATH: ['/tmp/libs/al2023/lib', '/tmp/dist/Release/lib', process.env.LD_LIBRARY_PATH]
        .filter(Boolean).join(':'),
    },
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  try {
    const appUrl = pathToFileURL(path.resolve(__dirname, '../../STRUCHORD.html')).href;
    await page.goto(`${appUrl}?b40-quality-labels=${Date.now()}`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() =>
      typeof addSection === 'function' &&
      typeof openChordWheel === 'function' &&
      typeof setWheelMode === 'function',
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
    await page.waitForFunction(() =>
      document.getElementById('chordWheelModal')?.classList.contains('open') &&
      !!document.querySelector('.mode-tab[data-wheel-mode="7"]'),
    { timeout: 10000 });
    // Let the opening lifecycle settle. The audit below concerns a quality click,
    // not the deliberately independent floating-stone opening animation.
    await sleep(500);

    const initial = await page.evaluate(() => ({
      labels: document.querySelectorAll('#circleSvg .wheel-chord-label').length,
      sectors: document.querySelectorAll('#circleSvg .wheel-sector').length,
      stale: document.querySelectorAll('#circleSvg .wheel-label-exit-layer, #circleSvg .wheel-label-entering, #circleSvg .wheel-label-exiting').length,
    }));
    ok('Chromium opens one SVG chord-label group per sector before a quality click',
      initial.labels > 0 && initial.labels === initial.sectors && initial.stale === 0,
      JSON.stringify(initial));

    const modes = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.mode-tab')).map((tab) => tab.dataset.wheelMode),
    );
    ok('Chromium exposes the seven live quality buttons for the click audit', modes.length === 7, modes.join(', '));
    const modeResults = [];
    for (const mode of modes) {
      const result = await page.evaluate(async (nextMode) => {
        const svg = document.getElementById('circleSvg');
        const tab = document.querySelector(`.mode-tab[data-wheel-mode="${nextMode}"]`);
        const labels = () => Array.from(svg.querySelectorAll('.wheel-chord-label'));
        const snapshot = (phase) => {
          const currentLabels = labels();
          return {
            phase,
            labels: currentLabels.length,
            sectors: svg.querySelectorAll('.wheel-sector').length,
            ghosts: svg.querySelectorAll('.wheel-label-exit-layer').length,
            transitionLabels: svg.querySelectorAll('.wheel-label-entering, .wheel-label-exiting').length,
            labelAnimations: currentLabels.filter((node) => getComputedStyle(node).animationName !== 'none').length,
            active: document.querySelector('.mode-tab.active')?.dataset.wheelMode || 'triads',
          };
        };
        const observedAddedGhostLayers = [];
        const observer = new MutationObserver((records) => {
          records.forEach((record) => record.addedNodes.forEach((node) => {
            if (node.nodeType !== Node.ELEMENT_NODE) return;
            if (node.matches?.('.wheel-label-exit-layer') || node.querySelector?.('.wheel-label-exit-layer')) {
              observedAddedGhostLayers.push(node.tagName);
            }
          }));
        });
        observer.observe(svg, { childList: true, subtree: true });
        const before = labels().map((node) => node.textContent).join('|');
        tab.click(); // exercise the actual quality-button event route
        const samples = [snapshot('same-task')];
        for (const delay of [0, 16, 50, 120, 220]) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          samples.push(snapshot(`${delay}ms`));
        }
        const after = labels().map((node) => node.textContent).join('|');
        observer.disconnect();
        return { mode: nextMode, before, after, samples, observedAddedGhostLayers };
      }, mode);
      modeResults.push(result);
    }

    for (const result of modeResults) {
      const stable = result.samples.every((sample) =>
        sample.labels > 0 &&
        sample.labels === sample.sectors &&
        sample.ghosts === 0 &&
        sample.transitionLabels === 0 &&
        sample.labelAnimations === 0 &&
        sample.active === result.mode,
      );
      ok(`quality ${result.mode}: Chromium never composites old and new label layers together`,
        stable && result.observedAddedGhostLayers.length === 0 && result.before !== result.after,
        JSON.stringify({ samples: result.samples, ghostAdds: result.observedAddedGhostLayers }));
    }
    ok('real-browser quality switching completed without page errors', pageErrors.length === 0, pageErrors.join(' | '));
  } finally {
    await browser.close();
  }

  console.log(failures ? `\n${failures} FAIL` : '\nALL OK — B-40 Chromium quality-label regression');
  process.exit(failures ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
