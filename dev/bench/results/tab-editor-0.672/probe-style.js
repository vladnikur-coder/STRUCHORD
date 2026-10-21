const puppeteer = require('/home/user/STRUCHORD/node_modules/puppeteer-core');
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/tmp/chromium', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 900 } });
  const p = await b.newPage();
  await p.goto('http://127.0.0.1:8000/STRUCHORD.html', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction('typeof addTabInsert === "function"');
  await p.evaluate(() => { startNewSongFromHome(); if (!sections.length) addSection(); if (!sections[0].squares.length) addSquare(sections[0].id); addTabInsert(sections[0].id); });
  await p.waitForSelector('.tab-at-host svg', { timeout: 20000 });
  await wait(1800);
  console.log(await p.evaluate(() => {
    const st = tabAtApi.settings.display.resources.stylesheet;
    const apiSt = tabAtApi.score && tabAtApi.score.stylesheet;
    return {
      hasSheet: !!st,
      keys: st ? Object.keys(st).length : 0,
      barNumberDisplay: st && st.barNumberDisplay,
      globalDisplayTuning: st && st.globalDisplayTuning,
      apiSheet: apiSt ? { barNumberDisplay: apiSt.barNumberDisplay, globalDisplayTuning: apiSt.globalDisplayTuning, single: apiSt.singleTrackTrackNamePolicy } : null,
      renderSheet: tabAtApi.renderer && tabAtApi.renderer.settings ? tabAtApi.renderer.settings.display.resources.stylesheet.barNumberDisplay : 'n/a',
    };
  }));
  await b.close();
})();
