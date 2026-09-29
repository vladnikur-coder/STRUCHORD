// B-99: Chromium proof that colour-only harmony markers reach real layout,
// while the selected wheel sector remains the existing accent state.
const path = require('path');
const { pathToFileURL } = require('url');
process.env.AWS_EXECUTION_ENV ||= 'AWS_Lambda_nodejs22.x';
const sparticuz = require('@sparticuz/chromium').default;
const puppeteer = require('puppeteer-core');

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
    await page.goto(`${appUrl}?b99-harmony=${Date.now()}`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => typeof analyzeSectionHarmony === 'function' && typeof drawWheel === 'function');
    const state = await page.evaluate(() => {
      globalKey = 'C';
      globalTimeSig = '4/4';
      keyMode = 'manual';
      document.getElementById('showDegrees').checked = false;
      sections = [{ id: 81, type: 'Verse', key: null, timeSig: '4/4', squares: [{
 id: 82, events: [
        { chord: 'C', span: 1 }, { chord: 'D7', span: 1 }, { chord: 'G', span: 1 }, { chord: 'Bb', span: 1 },
      ] }] }];
      render();
      const grid = (ei) => document.querySelector(`.chord-wrapper[data-sec="81"][data-square="82"][data-ei="${ei}"]`);
      const markerWhenDegreesOff = getComputedStyle(grid(1), '::before').backgroundColor;
      const harmonyClassWhenDegreesOff = document.body.classList.contains('is-harmony-highlights-on');
      document.getElementById('showDegrees').checked = true;
      updateCellsDegrees();
      timelineMode = true;
      renderTimeline();
      const timeline = (ei) => document.querySelector(`.tl-cell[data-sec="81"][data-square="82"][data-ei="${ei}"]`);
      activeChordInput = grid(1).querySelector('.chord-input');
      activeSectionKey = null;
      wheelMode = '7';
      drawWheel();
      const d7 = document.querySelector('#circleSvg .wheel-sector[data-wheel-chord-identity="D7"]');
      bindWheelHarmonyLegend();
      document.getElementById('wheelHarmonyLegendToggle').click();
      return {
        markerWhenDegreesOff,
        harmonyClassWhenDegreesOff,
        groups: [grid(0), grid(1), grid(3)].map((cell) => cell.dataset.harmonyGroup),
        gridMarker: getComputedStyle(grid(1), '::before').backgroundColor,
        timelineGroups: [timeline(0), timeline(1), timeline(3)].map((cell) => cell.dataset.harmonyGroup),
        timelineMarker: getComputedStyle(timeline(1), '::after').backgroundColor,
        selected: d7.classList.contains('is-wheel-selected'),
        wheelGroup: d7.dataset.harmonyGroup,
        legendOpen: !document.getElementById('wheelHarmonyLegend').hidden,
        legendExpanded: document.getElementById('wheelHarmonyLegendToggle').getAttribute('aria-expanded'),
      };
    });
    ok('выключенные «Ступени» не показывают B-99 marker',
      !state.harmonyClassWhenDegreesOff && state.markerWhenDegreesOff === 'rgba(0, 0, 0, 0)', JSON.stringify(state));
    ok('editor shows distinct semantic groups and a painted chromatic marker',
      state.groups.join(',') === 'diatonic,chromatic,modal-borrowed' && state.gridMarker !== 'rgba(0, 0, 0, 0)', JSON.stringify(state));
    ok('timeline carries the same groups and a painted marker',
      state.timelineGroups.join(',') === 'diatonic,chromatic,modal-borrowed' && state.timelineMarker !== 'rgba(0, 0, 0, 0)', JSON.stringify(state));
    ok('wheel is chromatic for contextual D7 → G while its selected marker survives',
      state.wheelGroup === 'chromatic' && state.selected, JSON.stringify(state));
    ok('legend ? opens accessibly', state.legendOpen && state.legendExpanded === 'true', JSON.stringify(state));
    ok('B-99 visual route completed without page errors', pageErrors.length === 0, pageErrors.join(' | '));
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n${failures} FAIL` : '\nALL OK — B-99 Chromium harmony UI');
  process.exit(failures ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
