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
  await wait(1200);
  await p.evaluate(() => {
    const ed = tabInsertEditorState;
    ed.draft.notes = [
      { start: 0, string: 0, fret: 5, dur: 1 },
      { start: 5, string: 2, fret: 3, dur: 1 },
      { start: 9, string: 1, fret: 7, dur: 1 },
      { start: 14, string: 4, fret: 2, dur: 1 },
    ];
    tabAtRender(ed);
  });
  await wait(1600);
  console.log(JSON.stringify(await p.evaluate(() => {
    const host = document.querySelector('.tab-at-host');
    const rows = [];
    for (const start of [0, 5, 9, 14]) {
      tabAtSetCursor(start, 0);
      const line = host.querySelector('.tab-at-cursor');
      const dot = host.querySelector('.tab-at-cursor-dot');
      const bb = tabAtBeatBoundsAt(tabAtApi, start);
      const head = bb && bb.notes && bb.notes[0] && bb.notes[0].noteHeadBounds;
      rows.push({
        start,
        cursorX: Math.round(parseFloat(line.style.left)),
        beatX: bb ? Math.round(bb.visualBounds.x + bb.visualBounds.w / 2) : null,
        lineTop: Math.round(parseFloat(line.style.top)),
        lineH: Math.round(parseFloat(line.style.height)),
        dotY: Math.round(parseFloat(dot.style.top)),
        headY: head ? Math.round(head.y + head.h / 2) : null,
      });
    }
    return { bars: tabAtState.barCount, rows };
  }), null, 1));
  await p.screenshot({ path: 'multibar.png' });
  await b.close();
})();
