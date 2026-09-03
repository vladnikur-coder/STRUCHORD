// Живой проб B-34 (0.145): закреплённый ряд при воспроизведении не
// рассинхронизирован. Песня [пустая4][пустая4][F4][C4], BPM 160.
// Проверки: (1) пока звучат пустые — ведомое превью показывает F
// (раньше гасло: «следующее событие» пустое); (2) когда звучит F —
// гриф ведёт F, превью ведёт C; (3) ховер в покое при закреплении
// открывает тултип (раньше глушился всегда).
const path = require('path');
const puppeteer = require(path.join(__dirname, '../../node_modules/puppeteer'));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/tmp/chrome/chrome',
    env: { ...process.env, LD_LIBRARY_PATH: '/tmp/chromelibs/lib' },
    args: ['--no-sandbox', '--disable-gpu', '--window-size=1280,900', '--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.evaluateOnNewDocument(() => {
    const song = {
      schemaVersion: 2, name: 'B-34 pin sync', bpm: 160,
      globalKey: 'C', keyMode: 'manual', globalTimeSig: '4/4', notes: '',
      sections: [
        { id: 1, type: 'Verse', customName: null, key: null, shift: null, timeSig: null, bpm: null, repeat: 1, strumPattern: null,
          squares: [{ id: 2, repeat: 1, customBeats: null, strumPattern: null, events: [
            { chord: '', span: 4, timeSig: null, strumPattern: null },
            { chord: '', span: 4, timeSig: null, strumPattern: null },
            { chord: 'F', span: 4, timeSig: null, strumPattern: null },
            { chord: 'C', span: 4, timeSig: null, strumPattern: null },
          ]}]},
      ],
      nextId: 10, userFingerings: [], preferredFingerings: [], date: '',
    };
    try { localStorage.setItem('struchord_songs', JSON.stringify([song])); } catch (e) {}
  });
  await page.goto('file://' + path.join(__dirname, '../../STRUCHORD.html'), { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 900));
  await page.evaluate(() => loadSong(0));
  await new Promise((r) => setTimeout(r, 500));
  console.log('версия в шапке:', await page.$eval('.app-title span', (s) => s.textContent.trim()));

  let fails = 0;
  const check = (name, cond, info) => {
    console.log(`   ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : ' — ' + info}`);
    if (!cond) fails++;
  };
  const readRow = () => page.evaluate(() => {
    const grip = document.querySelector('#pinnedFingering .fingering-chord-name');
    const next = document.querySelector('#pinnedNext .fingering-chord-name');
    const row = document.getElementById('pinnedRow');
    return {
      row: row ? row.style.display : 'нет',
      grip: grip ? grip.textContent : null,
      next: next ? next.textContent : null,
      nextOpen: document.getElementById('pinnedNext').style.display !== 'none',
    };
  });

  // (3) Ховер в покое при закреплении — до пина и после.
  const cells = await page.$$('.chord-wrapper');
  const cBox = await cells[3].boundingBox(); // C
  await page.mouse.move(cBox.x + cBox.width / 2, cBox.y + cBox.height / 2);
  await new Promise((r) => setTimeout(r, 300));
  const pinned = await page.evaluate(() => {
    if (typeof pinFingeringFromTooltip !== 'function') return 'нет функции';
    return pinFingeringFromTooltip();
  });
  check('закрепили C拖ом в панель', pinned === true, String(pinned));
  await page.mouse.move(5, 5, { steps: 2 });
  await new Promise((r) => setTimeout(r, 500));
  let row = await readRow();
  check('ряд виден, гриф C', row.row === 'flex' && row.grip === 'C', JSON.stringify(row));

  // Ховер на F в ПОКОЕ при закреплении — тултип открывается (0.145).
  const fBox = await cells[2].boundingBox();
  await page.mouse.move(fBox.x + fBox.width / 2, fBox.y + fBox.height / 2);
  await new Promise((r) => setTimeout(r, 350));
  const hoverOpen = await page.evaluate(() => document.getElementById('fingering-tooltip').style.display);
  check('ховер в покое при закреплении открывает тултип', hoverOpen === 'block', hoverOpen);
  const hoverName = await page.evaluate(() => {
    const el = document.querySelector('#fingering-tooltip .fingering-chord-name');
    return el ? el.textContent : null;
  });
  check('в ховер-тултипе F (не закреплённый C)', hoverName === 'F', String(hoverName));
  await page.mouse.move(5, 5, { steps: 2 });
  await new Promise((r) => setTimeout(r, 500));

  // (1)(2) Воспроизведение: пустые → F → C. Такт 4/4@160 = 1.5с.
  await page.evaluate(() => playAll());
  await new Promise((r) => setTimeout(r, 800)); // звучит первая пустая
  row = await readRow();
  check('пустая звучит: ряд жив', row.row === 'flex', JSON.stringify(row));
  check('пустая звучит: ведомое превью ОТКРЫТО и ведёт F', row.nextOpen && row.next === 'F', JSON.stringify(row));
  await new Promise((r) => setTimeout(r, 2500)); // ~3.3с от старта — звучит F
  row = await readRow();
  check('F звучит: гриф ведёт F', row.grip === 'F', JSON.stringify(row));
  check('F звучит: превью ведёт C', row.nextOpen && row.next === 'C', JSON.stringify(row));
  const playing = await page.evaluate(() => playbackState.isPlaying);
  check('воспроизведение ещё идёт (тайминги валидны)', playing);
  await page.evaluate(() => { try { stopPlayback(); } catch (e) {} });
  await new Promise((r) => setTimeout(r, 300));
  row = await readRow();
  check('после остановки вернулся исходный C', row.grip === 'C', JSON.stringify(row));

  console.log(fails ? `PROBE FAIL: ${fails}` : 'PROBE OK');
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
