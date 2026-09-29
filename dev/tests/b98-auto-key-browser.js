// B-98: real Chromium proof that the hidden native key select immediately
// propagates its dynamic Auto label to both visible pill adapters.
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
    await page.goto(`${appUrl}?b98-native=${Date.now()}`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() =>
      typeof refreshAutoDetectedKey === 'function' && typeof syncTimelineSongBar === 'function',
    { timeout: 30000 });

    const snapshots = await page.evaluate(() => {
      const snapshot = () => ({
        globalKey,
        rootValue: DOM.rootKey.value,
        rootAuto: document.getElementById('autoKeyOption').textContent.trim(),
        editorPill: document.getElementById('keyPillName').textContent.trim(),
        timelineValue: document.getElementById('tlRootKey').value,
        timelineAuto: document.querySelector('#tlRootKey option[value="auto"]')?.textContent.trim(),
        timelinePill: document.getElementById('tlKeyPillName').textContent.trim(),
      });
      sections = [{
        id: 1, key: null, timeSig: '4/4',
        squares: [{ id: 2, events: [{ chord: 'C', span: 4 }] }],
      }];
      globalTimeSig = '4/4';
      globalKey = 'G';
      keyMode = 'auto';
      autoDetectedKey = null;
      DOM.rootKey.value = 'auto';
      timelineMode = true;
      syncTimelineSongBar();
      refreshAutoDetectedKey();
      const c = snapshot();
      sections[0].squares[0].events[0].chord = 'D';
      refreshAutoDetectedKey();
      const d = snapshot();
      return { c, d };
    });

    for (const [expected, result] of [['C', snapshots.c], ['D', snapshots.d]]) {
      const synchronized = result.globalKey === expected && result.rootValue === 'auto' && result.timelineValue === 'auto' &&
        result.rootAuto === `${expected} (авто)` && result.editorPill === `${expected} (авто)` &&
        result.timelineAuto === `${expected} (авто)` && result.timelinePill === `${expected} (авто)`;
      ok(`native Auto ${expected}: editor and timeline pills update in the same task`, synchronized, JSON.stringify(result));
    }
    ok('native Auto adapter completed without page errors', pageErrors.length === 0, pageErrors.join(' | '));
  } finally {
    await browser.close();
  }

  console.log(failures ? `\n${failures} FAIL` : '\nALL OK — B-98 Chromium native auto-key presentation');
  process.exit(failures ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
