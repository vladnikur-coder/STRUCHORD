// Съёмка B-15: подсказка ритма над счётом при протяжке границы ячейки.
// Ручной зонд (как прочие shot-*/probe-*): запускается напрямую, не входит
// в dev/run-tests.sh. Кадры — в dev/bench/results/.
const path = require('path');
const fs = require('fs');
const sparticuz = require('@sparticuz/chromium').default;
const puppeteer = require('puppeteer-core');

const OUT = path.join(__dirname, '..', 'bench', 'results');
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    args: [...sparticuz.args, '--no-sandbox'],
    executablePath: await sparticuz.executablePath(),
    headless: 'shell',
    defaultViewport: { width: 1400, height: 900 },
    env: { ...process.env, LD_LIBRARY_PATH: '/tmp/stublibs' },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('[pageerror]', String(e)));
  await page.goto(`http://127.0.0.1:8000/STRUCHORD.html?shot-b15=${Date.now()}`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction('typeof addSection === "function"');

  // Сцена: секция 4/4, квадрат, две ячейки по 2 доли.
  // cell0 — СВОЙ бой DUDX (кастом и после отпускания не демотится),
  // cell1 — наследует бой секции DUDUDUDU.
  await page.evaluate(() => {
    sections = [{ id: 1, name: 'Verse', key: 'C', timeSig: null, bpm: 0, squares: [
      { id: 2, timeSig: null, strumPattern: null, customBeats: null, events: [] },
    ] }];
    const strum = (sub, s) => ({ mode: 'strum', subdivision: sub, steps: s.split('') });
    sections[0].squares[0].events = [
      { chord: 'Am', span: 2, timeSig: null, strumPattern: strum(2, 'DUDX') },
      { chord: 'G', span: 2, timeSig: null, strumPattern: null },
    ];
    // Гигиена сцены (как в тестах wave7): иначе чужие ссылки пула от
    // прошлой песни помечают наследующие ячейки «кастомными».
    if (songRhythmRolls) {
      for (const key of [...songRhythmRolls.refs.keys()]) {
        if (key.startsWith('1:2:')) songRhythmRolls.refs.delete(key);
      }
      songRhythmRolls.sectionRolls.delete(1);
    }
    ensureSquareRhythmRefs(sections[0], sections[0].squares[0]);
    sections[0].strumPattern = strum(2, 'DUDUDUDU');
    setSectionRhythmRoll(sections[0], sections[0].strumPattern);
    render();
  });
  await sleep(300);

  const handle = await page.$('.chord-wrapper[data-ei="0"] .resize-handle');
  const hb = await handle.boundingBox();
  if (!hb) throw new Error('ручка не найдена');
  const cx = hb.x + hb.width / 2, cy = hb.y + hb.height / 2;
  console.log('ручка в', Math.round(cx), Math.round(cy));

  const probe = (tag) => page.evaluate((tag) => {
    const hints = [...document.querySelectorAll('.rhythm-hint')];
    const ghost = document.querySelector('body > .rhythm-hints');
    const prev = document.querySelector('.chord-wrapper[data-ei="0"] .event-strum-preview');
    return {
      tag,
      hints: hints.map((h) => {
        const cs = getComputedStyle(h);
        return { opacity: cs.opacity, transform: cs.transform, className: h.className,
                 // Поударно: инлайн-значения и вычисленные трансформы ударов
                 hits: [...h.querySelectorAll('.rhythm-hint-hit')].map((hh) => ({
                   css: hh.style.transform || 'none',
                   now: getComputedStyle(hh).transform,
                   delay: hh.style.transitionDelay || '',
                   sourceIndex: hh.dataset.rhythmSourceIndex || '',
                 })),
                 host: h.parentElement.parentElement === document.body ? 'body' : 'square' };
      }),
      ghost: !!ghost,
      previewOpacity: prev ? getComputedStyle(prev).opacity : null,
      previewClass: prev ? prev.className : null,
      bodyReturning: document.body.classList.contains('is-rhythm-hint-returning'),
    };
  }, tag);

  // Кадр 0: до касания
  await page.screenshot({ path: path.join(OUT, 'b15-0-before.png') });

  await page.mouse.move(cx, cy);
  await page.mouse.down();
  // Кадр 1: середина входа (~90мс из 180/220мс)
  await sleep(90);
  console.log(JSON.stringify(await probe('mid-enter')));
  await page.screenshot({ path: path.join(OUT, 'b15-1-mid-enter.png') });
  // Кадр 2: вход доигран
  await sleep(300);
  console.log(JSON.stringify(await probe('settled')));
  await page.screenshot({ path: path.join(OUT, 'b15-2-settled.png') });
  // Кадр 3: тянем вправо
  await page.mouse.move(cx + 40, cy, { steps: 4 });
  await sleep(120);
  await page.screenshot({ path: path.join(OUT, 'b15-3-drag.png') });
  // Кадр 4: отпустили — сначала fade наследуемых (~180мс), затем
  // кастомные глифы уплывают назад; снимаем уже фазу полёта.
  await page.mouse.up();
  await sleep(260);
  console.log(JSON.stringify(await probe('mid-exit')));
  await page.screenshot({ path: path.join(OUT, 'b15-4-mid-exit.png') });
  // Кадр 5: финал
  await sleep(500);
  console.log(JSON.stringify(await probe('final')));
  await page.screenshot({ path: path.join(OUT, 'b15-5-final.png') });

  await browser.close();
  console.log('кадры в', OUT);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
