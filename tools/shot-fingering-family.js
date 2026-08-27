// Скриншот-проверка семейного переноса: сохраняем Aadd9 = 5,7,9,6,x,x,
// наводимся на ячейку Badd9 — тултип обязан показать 7,9,11,8,x,x.
const puppeteer = require('/home/user/node_modules/puppeteer');

(async () => {
  const b = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--allow-file-access-from-files'],
    protocolTimeout: 60000,
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 900));

  const shown = await p.evaluate(async () => {
    tunerTuningId = 'e-std';
    tunerCustomNotes = null;
    keyMode = 'manual';
    globalKey = 'C';
    DOM.rootKey.value = 'C';
    sections = [{
      id: 1, type: 'Verse', repeat: 1, squares: [{
        id: 1, repeat: 1,
        events: [
          { chord: 'Aadd9', span: 2 },
          { chord: 'Badd9', span: 2 },
        ],
      }],
    }];
    nextId = 9;
    render();
    await new Promise((r) => setTimeout(r, 300));
    // Сохранение своей формы для Aadd9 — та же последовательность, что в
    // редакторе: прибивка остальных вхождений -> push в userFingerings ->
    // сброс кэша -> закреп за самой ячейкой.
    pinCurrentFingeringsForChord('Aadd9', 'C', buildFingeringPositionKey('Aadd9', 'C', 1, 1, 0));
    const ck = buildFingeringChordKey('Aadd9', 'C');
    const list = userFingerings.get(ck) || [];
    list.push([5, 7, 9, 6, 'x', 'x']);
    userFingerings.set(ck, list);
    fingeringCache.clear();
    setPreferredFingering(buildFingeringPositionKey('Aadd9', 'C', 1, 1, 0), '5,7,9,6,x,x', sections[0].squares[0].events[0]);
    render();
    await new Promise((r) => setTimeout(r, 300));
    return (resolveFingeringShape('Badd9', 'C', buildFingeringPositionKey('Badd9', 'C', 1, 1, 1), sections[0].squares[0].events[1]) || []).join(',');
  });
  console.log('Badd9 показывает:', shown, errs.length ? 'ОШИБКИ: ' + errs.join('|') : '');

  // Наводимся на вторую ячейку (Badd9).
  const wrappers = await p.$$('.chord-wrapper');
  const box = await wrappers[1].boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 6 });
  await new Promise((r) => setTimeout(r, 1000));
  const clipBox = await p.evaluate(() => {
    const t = document.getElementById('fingering-tooltip');
    if (!t || t.style.display === 'none') return null;
    const r = t.getBoundingClientRect();
    return { x: Math.max(0, r.x - 12), y: Math.max(0, r.y - 12), width: r.width + 24, height: r.height + 24 };
  });
  if (clipBox) {
    await p.screenshot({ path: '/home/user/fingering-family-badd9.png', clip: clipBox });
    console.log('скриншот: /home/user/fingering-family-badd9.png');
  } else {
    console.log('ТУЛТИП НЕ ПОКАЗАЛСЯ');
    process.exitCode = 1;
  }
  await b.close();
})();
