// Правила автозума: масштаб поднимается ТОЛЬКО когда имя аккорда
// действительно не помещается, а не по абстрактной ширине доли.
const puppeteer = require('/home/user/node_modules/puppeteer');
const fs = require('fs');
let bad = 0;
const t = (n, c, x = '') => { if (c) console.log('   ok  ', n, x); else { bad++; console.log('  FAIL ', n, x); } };
(async () => {
  const song = JSON.parse(fs.readFileSync('/home/user/dev/fixtures/wind-of-change.json', 'utf8'));
  const br = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
  });
  const p = await br.newPage();
  await p.setViewport({ width: 1400, height: 900 });
  p.setDefaultTimeout(90000);
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).split('\n')[0]));
  await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await new Promise((r) => setTimeout(r, 1100));

  const play = async (setup) => {
    await p.evaluate(setup);
    await new Promise((r) => setTimeout(r, 600));
    await p.evaluate(() => playAll());
    await new Promise((r) => setTimeout(r, 1000));
    const d = await p.evaluate(() => {
      const ws = [...document.querySelectorAll('.chord-wrapper')];
      const over = ws.filter((w) => {
        const inner = w.querySelector('.chord-display-inner');
        if (!inner) return false;
        return inner.getBoundingClientRect().width > w.getBoundingClientRect().width - 6;
      }).length;
      const px = ws.map((w) => w.getBoundingClientRect().width).sort((a, b) => a - b);
      return { zoom: +squareZoom.toFixed(3), min: +px[0].toFixed(0), max: +px[px.length - 1].toFixed(0), over, n: ws.length };
    });
    await p.evaluate(() => { if (playbackState.isPlaying) stopPlayback(); });
    await new Promise((r) => setTimeout(r, 400));
    return d;
  };

  console.log('=== 1. Настоящая песня: короткие имена в коротких ячейках ===');
  await p.evaluate((sng) => { window.__song = sng; }, song);
  const wc = await play(() => {
    localStorage.setItem('struchord_songs', JSON.stringify([window.__song]));
    loadSong(0); render();
  });
  console.log(`      зум ${Math.round(wc.zoom * 100)}%, ячейки ${wc.min}..${wc.max}px, обрезано имён: ${wc.over}`);
  t('масштаб не задран — имена и так помещаются', wc.zoom < 1.05, `${Math.round(wc.zoom * 100)}%`);
  t('ни одно имя не обрезано', wc.over === 0, `${wc.over} из ${wc.n}`);

  console.log('\n=== 2. Длинное имя в короткой ячейке — масштаб нужен ===');
  const long = await play(() => {
    sections = [{ id: 1, type: 'Verse', repeat: 1, squares: [
      { id: 1, repeat: 1, events: [
        { chord: 'Cadd9', span: 1 }, { chord: 'Fmaj7', span: 1 },
        { chord: 'Am', span: 14 }] },
    ] }];
    nextId = 9; squareZoom = 1; applySquareZoom(true); requestRender();
  });
  console.log(`      зум ${Math.round(long.zoom * 100)}%, ячейки ${long.min}..${long.max}px, обрезано: ${long.over}`);
  t('масштаб поднят под длинное имя', long.zoom > 1.2, `${Math.round(long.zoom * 100)}%`);
  t('после автозума имена помещаются', long.over === 0, `${long.over} обрезано`);

  console.log('\n=== 3. Короткое имя в короткой ячейке — масштаб не нужен ===');
  const short = await play(() => {
    sections = [{ id: 1, type: 'Verse', repeat: 1, squares: [
      { id: 1, repeat: 1, events: [
        { chord: 'G', span: 1 }, { chord: 'C', span: 1 },
        { chord: 'Am', span: 14 }] },
    ] }];
    nextId = 9; squareZoom = 1; applySquareZoom(true); requestRender();
  });
  console.log(`      зум ${Math.round(short.zoom * 100)}%, ячейки ${short.min}..${short.max}px, обрезано: ${short.over}`);
  t('масштаб не тронут — «G» и «C» помещаются', short.zoom < 1.05, `${Math.round(short.zoom * 100)}%`);
  t('имена целы', short.over === 0);

  console.log('\n=== 4. Мелкие доли всё ещё поднимают масштаб ===');
  const tiny = await play(() => {
    sections = [{ id: 1, type: 'Verse', repeat: 1, squares: [
      { id: 1, repeat: 1, events: [
        { chord: 'Am', span: 0.25 }, { chord: 'C', span: 3.75 },
        { chord: 'F', span: 4 }, { chord: 'G', span: 8 }] },
    ] }];
    nextId = 9; squareZoom = 1; applySquareZoom(true); requestRender();
  });
  console.log(`      зум ${Math.round(tiny.zoom * 100)}%, ячейки ${tiny.min}..${tiny.max}px, обрезано: ${tiny.over}`);
  t('шестнадцатая доводится до читаемой', tiny.zoom > 1.5, `${Math.round(tiny.zoom * 100)}%`);
  t('имя в мелкой ячейке видно', tiny.over === 0);

  console.log('\n=== 5. Пустая ячейка (пауза) держит минимум под касание ===');
  const empty = await play(() => {
    sections = [{ id: 1, type: 'Verse', repeat: 1, squares: [
      { id: 1, repeat: 1, events: [
        { chord: '', span: 0.5 }, { chord: 'Am', span: 15.5 }] },
    ] }];
    nextId = 9; squareZoom = 1; applySquareZoom(true); requestRender();
  });
  console.log(`      зум ${Math.round(empty.zoom * 100)}%, самая узкая ${empty.min}px`);
  t('пустая ячейка не уже 40px', empty.min >= 40, `${empty.min}px`);

  t('ошибок страницы нет', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё зелено');
  await br.close();
  process.exit(bad ? 1 : 0);
})();
