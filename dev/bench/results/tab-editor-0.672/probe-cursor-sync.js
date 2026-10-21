/* Проба рассинхронизации курсора: сравниваем x линии курсора с реальным
 * положением цифры лада на доле. Запуск из папки:
 *   LD_LIBRARY_PATH=/tmp/libs/lib node probe-cursor-sync.js
 */
const puppeteer = require('/home/user/STRUCHORD/node_modules/puppeteer-core');
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/tmp/chromium', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 900 } });
  const p = await b.newPage();
  await p.goto('http://127.0.0.1:8000/STRUCHORD.html', { waitUntil: 'domcontentloaded' });
  await p.waitForFunction('typeof addTabInsert === "function"');
  await p.evaluate(() => { startNewSongFromHome(); if (!sections.length) addSection(); if (!sections[0].squares.length) addSquare(sections[0].id); addTabInsert(sections[0].id); });
  await p.waitForSelector('.tab-at-host svg', { timeout: 20000 });
  await wait(2000);
  // Четыре ноты подряд четвёртями.
  await p.evaluate(() => {
    const ed = tabInsertEditorState;
    ed.draft.notes = [
      { start: 0, string: 0, fret: 5, dur: 1 },
      { start: 1, string: 0, fret: 3, dur: 1 },
      { start: 2, string: 0, fret: 7, dur: 1 },
      { start: 3, string: 0, fret: 2, dur: 1 },
    ];
    tabAtRender(ed);
  });
  await wait(1500);
  console.log(JSON.stringify(await p.evaluate(() => {
    const host = document.querySelector('.tab-at-host');
    const out = { host: host.getBoundingClientRect().toJSON(), rows: [] };
    const bar = tabAtBarBounds(tabAtApi, 0);
    out.bar = bar ? { x: Math.round(bar.x), w: Math.round(bar.w), y: Math.round(bar.y), h: Math.round(bar.h) } : null;
    const beats = [];
    const lb = tabAtApi.boundsLookup;
    for (const sys of (lb.staffSystems || [])) for (const sb of (sys.bars || [])) for (const bb of (sb.bars || [])) for (const bt of (bb.beats || [])) {
      const info = bt.beat && tabAtState.beatInfo.get(bt.beat);
      const heads = (bt.notes || []).filter(n => n.noteHeadBounds).map(n => ({ s: n.note.string, x: Math.round(n.noteHeadBounds.x), y: Math.round(n.noteHeadBounds.y), w: Math.round(n.noteHeadBounds.w) }));
      beats.push({ start: info && info.start, rest: info && info.rest, vb: bt.visualBounds && { x: Math.round(bt.visualBounds.x), w: Math.round(bt.visualBounds.w) }, heads });
    }
    out.beats = beats;
    for (const start of [0, 1, 2, 3]) {
      tabAtSetCursor(start, 0);
      const line = host.querySelector('.tab-at-cursor');
      const dot = host.querySelector('.tab-at-cursor-dot');
      out.rows.push({ start, lineX: line.style.left, dotTop: dot.style.top, hidden: line.hidden });
    }
    return out;
  }), null, 1));
  await p.screenshot({ path: 'sync-before.png' });
  await b.close();
})();
