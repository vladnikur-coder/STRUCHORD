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
  await p.evaluate(() => tabInsertSetBeats(tabInsertEditorState.secId, tabInsertEditorState.sqId, 16));
  await wait(1000);
  await p.evaluate(() => {
    const ed = tabInsertEditorState;
    ed.draft.notes = [{ start: 14, string: 4, fret: 2, dur: 1 }, { start: 15, string: 1, fret: 3, dur: 1 }];
    tabAtRender(ed);
  });
  await wait(1500);
  console.log(JSON.stringify(await p.evaluate(() => {
    const g = tabAtStringGeometry(tabAtApi, 3);
    const bar = tabAtBarBounds(tabAtApi, 3);
    const pts = tabAtHeadPoints(bar);
    return {
      bar: { x: bar.x, y: bar.y, w: bar.w, h: bar.h },
      pts,
      geom: g ? { gap: g.gap, approx: !!g.approx, shifted: g.shifted, ys: [1,2,3,4,5,6].map(s => Math.round(g.yAt(s))) } : null,
      sys: tabAtSystemBounds(tabAtApi, 3),
    };
  }), null, 1));
  await b.close();
})();
