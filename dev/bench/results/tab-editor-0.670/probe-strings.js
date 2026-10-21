const puppeteer = require('/home/user/STRUCHORD/node_modules/puppeteer-core');
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/tmp/chromium', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 900 } });
  const p = await b.newPage();
  await p.goto('http://127.0.0.1:8000/STRUCHORD.html', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction('typeof addTabInsert === "function"');
  await p.evaluate(() => { startNewSongFromHome(); if (!sections.length) addSection(); if (!sections[0].squares.length) addSquare(sections[0].id); addTabInsert(sections[0].id); });
  await p.waitForSelector('.tab-at-host svg', { timeout: 20000 });
  await wait(1500);
  // шесть созвучий: по одной ноте на каждой струне в разных позициях
  await p.evaluate(() => {
    const ed = tabInsertEditorState;
    ed.draft.notes = [];
    for (let i = 0; i < 6; i++) ed.draft.notes.push({ start: i * 0.25, string: i, fret: i, dur: 0.25 });
    tabAtRender(ed);
  });
  await wait(1500);
  console.log(await p.evaluate(() => {
    const out = [];
    const lb = tabAtApi.boundsLookup;
    for (const sys of (lb.staffSystems || [])) for (const sb of (sys.bars || [])) for (const bb of (sb.bars || [])) for (const bt of (bb.beats || [])) for (const n of (bt.notes || [])) out.push({ string: n.note.string, fret: n.note.fret, y: Math.round(n.noteHeadBounds.y), x: Math.round(n.noteHeadBounds.x) });
    return out;
  }));
  await p.screenshot({ path: 'e12-six-strings.png' });
  await b.close();
})();
