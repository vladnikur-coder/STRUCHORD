// Скриншот-проверка подписей счётчика вариантов (2026-08-12, вечер):
// у C сохраняем свою форму 3,5,5,4,3,3 — тултип обязан показать
// «1/1(польз.)», а после стрелки вправо — штатную форму с счётчиком
// без подписи («1/5», «2/5»... — локальная нумерация яруса).
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

  const info = await p.evaluate(async () => {
    tunerTuningId = 'e-std';
    tunerCustomNotes = null;
    keyMode = 'manual';
    globalKey = 'C';
    DOM.rootKey.value = 'C';
    sections = [{
      id: 1, type: 'Verse', repeat: 1, squares: [{
        id: 1, repeat: 1,
        events: [{ chord: 'C', span: 4 }],
      }],
    }];
    nextId = 9;
    render();
    await new Promise((r) => setTimeout(r, 300));
    pinCurrentFingeringsForChord('C', 'C', buildFingeringPositionKey('C', 'C', 1, 1, 0));
    const ck = buildFingeringChordKey('C', 'C');
    const list = userFingerings.get(ck) || [];
    list.push([3, 5, 5, 4, 3, 3]);
    userFingerings.set(ck, list);
    fingeringCache.clear();
    setPreferredFingering(buildFingeringPositionKey('C', 'C', 1, 1, 0), '3,5,5,4,3,3', sections[0].squares[0].events[0]);
    render();
    await new Promise((r) => setTimeout(r, 300));
    const r = window.getFingeringVariants('C', 'C');
    return {
      resolved: (resolveFingeringShape('C', 'C', buildFingeringPositionKey('C', 'C', 1, 1, 0), sections[0].squares[0].events[0]) || []).join(','),
      counterUser: fingeringCounterText(r.shapes, r.methods, r.shapes[0]),
      counterNamed1: fingeringCounterText(r.shapes, r.methods, r.shapes[1]),
      firstAuto: (() => {
        const i = r.methods.findIndex((m) => m === 'fallback' || m === 'modified');
        return fingeringCounterText(r.shapes, r.methods, r.shapes[i]);
      })(),
    };
  });
  console.log('показано:', info.resolved,
    '| user:', info.counterUser,
    '| named:', info.counterNamed1,
    '| auto:', info.firstAuto,
    errs.length ? 'ОШИБКИ: ' + errs.join('|') : '');

  const shot = async (file) => {
    const clipBox = await p.evaluate(() => {
      const t = document.getElementById('fingering-tooltip');
      if (!t || t.style.display === 'none') return null;
      const r = t.getBoundingClientRect();
      return { x: Math.max(r.x - 14, 0), y: Math.max(r.y - 14, 0), w: r.width + 28, h: r.height + 28 };
    });
    if (!clipBox) throw new Error('тултип не показан');
    await p.screenshot({
      path: file,
      clip: { x: clipBox.x, y: clipBox.y, width: clipBox.w, height: clipBox.h },
    });
    console.log('shot:', file);
  };

  const wrappers = await p.$$('.chord-wrapper');
  const box = await wrappers[0].boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 6 });
  await new Promise((r) => setTimeout(r, 1000));
  await shot('/home/user/counter-labels-user.png');

  // Стрелка вправо — первая штатная форма, подписи нет.
  await p.click('#fingering-tooltip .tooltip-nav-right');
  await new Promise((r) => setTimeout(r, 500));
  await shot('/home/user/counter-labels-named.png');

  if (errs.length) { console.error('ОШИБКИ СТРАНИЦЫ:', errs.join(' | ')); process.exitCode = 1; }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
