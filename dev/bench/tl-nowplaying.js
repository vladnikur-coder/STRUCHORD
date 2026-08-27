// Бейдж «сейчас играет» (имя аккорда + бой) в транспортной панели удалён
// из приложения совсем.
//
// История. Сначала его убрали только из ленты: имя есть на панели
// «Сейчас», бой — на дорожке ритма, а здесь он дублировал обе вещи
// мелким шрифтом и менял ширину транспортной панели на каждой смене
// аккорда. Потом выяснилось, что в РЕДАКТОРЕ он третий одновременно
// мигающий источник ритма (см. anim-source.js) — и его убрали целиком.
//
// Этот стенд следит, чтобы удаление было полным: ни узла, ни класса, ни
// функции, ни хранилища элементов подсветки. И чтобы то, ради чего
// бейдж существовал, осталось на месте в обоих режимах.
const puppeteer = require('/home/user/node_modules/puppeteer');
const fs = require('fs');
let bad = 0;
const t = (n, c, x = '') => { if (c) console.log('   ok  ', n, x); else { bad++; console.log('  FAIL ', n, x); } };
(async () => {
  const song = JSON.parse(fs.readFileSync('/home/user/dev/fixtures/wind-of-change.json', 'utf8'));
  const b = await puppeteer.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1400, height: 950 });
  p.setDefaultTimeout(90000);
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).split('\n')[0]));
  await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await new Promise((r) => setTimeout(r, 1100));
  await p.evaluate((s) => {
    localStorage.setItem('struchord_songs', JSON.stringify([s]));
    loadSong(0);
    sections[0].strumPattern = { mode: 'pick', subdivision: 2, steps: [['B'], null, ['B', 2], [3], ['B'], [2], ['B', 2], [3]] };
    render();
  }, song);
  await new Promise((r) => setTimeout(r, 700));

  console.log('=== 1. Следов бейджа не осталось ===');
  const gone = await p.evaluate(() => ({
    node: !!document.getElementById('nowPlayingChord'),
    cls: document.querySelectorAll('.now-playing-chord, .now-playing-chord-name').length,
    css: [...document.styleSheets].some((sh) => {
      try { return [...sh.cssRules].some((r) => (r.selectorText || '').includes('now-playing-chord')); }
      catch (e) { return false; }
    }),
    fn: typeof window.renderNowPlayingChordBadge,
    map: typeof window.nowPlayingStrumStepEls,
  }));
  console.log('   ', JSON.stringify(gone));
  t('узла нет', !gone.node);
  t('элементов с классом нет', gone.cls === 0, String(gone.cls));
  t('правил CSS не осталось', !gone.css);
  t('функция удалена', gone.fn === 'undefined', gone.fn);
  t('хранилище элементов удалено', gone.map === 'undefined', gone.map);

  console.log('\n=== 2. Редактор играет, транспортная строка цела ===');
  const pb = await p.evaluate(() => {
    const r = document.getElementById('btnPlay').getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });
  await p.mouse.click(pb.x, pb.y);
  await new Promise((r) => setTimeout(r, 1400));
  const ed = await p.evaluate(() => ({
    playing: playbackState.isPlaying,
    pos: (document.getElementById('playbackPos').textContent || '').trim(),
    bpm: !!document.getElementById('bpmInput'),
    mode: !!document.getElementById('btnModeToggle'),
    barH: Math.round(document.querySelector('.transport-bar').getBoundingClientRect().height),
  }));
  console.log('   ', JSON.stringify(ed));
  t('воспроизведение идёт', ed.playing);
  t('индикатор позиции работает', ed.pos && ed.pos !== '—', ed.pos);
  t('поле BPM на месте', ed.bpm);
  t('кнопка режима на месте', ed.mode);
  t('строка транспорта не схлопнулась', ed.barH > 20, ed.barH + 'px');
  await p.evaluate(() => { if (playbackState.isPlaying) playAll(); });
  await new Promise((r) => setTimeout(r, 400));

  console.log('\n=== 3. Лента: замена бейджу на месте ===');
  await p.evaluate(() => toggleTimelineMode(true));
  await new Promise((r) => setTimeout(r, 700));
  await p.evaluate(() => playAll());
  await new Promise((r) => setTimeout(r, 1600));
  const alt = await p.evaluate(() => ({
    rhythm: document.querySelectorAll('#timelineRhythm .tl-hit').length,
    counts: document.querySelectorAll('#timelineRhythm .tl-count').length,
    nowTxt: (document.querySelector('.tl-panel-label')?.textContent || '').trim(),
  }));
  console.log('   ', JSON.stringify(alt));
  t('дорожка ритма на месте — там и виден бой', alt.rhythm > 0, `${alt.rhythm} ударов`);
  t('счёт долей на месте', alt.counts > 0, `${alt.counts} цифр`);
  t('панель «Сейчас» на месте', /СЕЙЧАС/i.test(alt.nowTxt), alt.nowTxt);
  await p.evaluate(() => { if (playbackState.isPlaying) playAll(); });
  await p.evaluate(() => toggleTimelineMode(false));
  await new Promise((r) => setTimeout(r, 500));

  t('ошибок страницы нет', errs.length === 0, errs.join('; '));
  console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё зелено');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
