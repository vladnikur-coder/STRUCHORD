// Один анимированный источник ритма в редакторе.
//
// Было: бейдж секции + бейдж «сейчас играет» + тултип аппликатуры мигали
// одновременно (замер: по 98 вспышек за 6 с, центры в пределах 280px).
// Стало: бейдж «сейчас играет» убран, из оставшихся анимируется ровно
// один — тултип, если аппликатуры показаны, иначе бейдж секции.
// Лента не меняется: там свои источники.
const puppeteer = require('/home/user/node_modules/puppeteer');
const fs = require('fs');
let bad = 0;
const t = (n, c, x = '') => { if (c) console.log('   ok  ', n, x); else { bad++; console.log('  FAIL ', n, x); } };

const LABEL = () => {
  window.__hits = {};
  const label = (el) => {
    if (el.closest('#tooltipLiveStrum')) return 'тултип';
    if (el.closest('.event-strum-preview')) return 'ячейка';
    if (el.closest('#timelineRhythm')) return 'дорожка ленты';
    if (el.classList.contains('fing-string')) return 'струны';
    if (el.closest('.section-card')) return 'бейдж секции';
    return 'прочее';
  };
  window.__obs = new MutationObserver((ms) => {
    ms.forEach((m) => {
      const el = m.target;
      if (!(el instanceof Element)) return;
      if (!(el.classList.contains('strum-step-active') ||
            el.classList.contains('tl-hit-on') ||
            el.classList.contains('is-vibrating'))) return;
      const k = label(el);
      window.__hits[k] = (window.__hits[k] || 0) + 1;
    });
  });
  window.__obs.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
};

(async () => {
  const br = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'] });
  const p = await br.newPage();
  await p.setViewport({ width: 1500, height: 1000 });
  p.setDefaultTimeout(90000);
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).split('\n')[0]));
  await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await new Promise((r) => setTimeout(r, 1200));
  const song = JSON.parse(fs.readFileSync('/home/user/dev/fixtures/wind-of-change.json', 'utf8'));
  await p.evaluate((s) => {
    localStorage.setItem('struchord_songs', JSON.stringify([s]));
    loadSong(0);
    sections = [sections.find((x) => x.strumPattern)];
    render();
  }, song);
  await new Promise((r) => setTimeout(r, 800));

  console.log('=== 1. Бейджа «сейчас играет» больше нет ===');
  const gone = await p.evaluate(() => ({
    node: !!document.getElementById('nowPlayingChord'),
    cls: document.querySelectorAll('.now-playing-chord').length,
    fn: typeof window.renderNowPlayingChordBadge,
    map: typeof window.nowPlayingStrumStepEls,
  }));
  console.log('   ', JSON.stringify(gone));
  t('узла нет в разметке', !gone.node);
  t('класс нигде не используется', gone.cls === 0);
  t('функция удалена', gone.fn === 'undefined', gone.fn);

  const cellPt = await p.evaluate(() => {
    const cw = document.querySelector('.chord-wrapper');
    const r = cw.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });
  const pb = await p.evaluate(() => {
    const r = document.getElementById('btnPlay').getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });
  const run = async (secs) => {
    await p.evaluate(LABEL);
    await p.mouse.click(pb.x, pb.y);
    await new Promise((r) => setTimeout(r, 400));
    if (!(await p.evaluate(() => playbackState.isPlaying))) {
      await p.evaluate(() => playAll());
      await new Promise((r) => setTimeout(r, 400));
    }
    await p.mouse.move(cellPt.x, cellPt.y);
    await new Promise((r) => setTimeout(r, secs * 1000));
    const h = await p.evaluate(() => { window.__obs.disconnect(); return window.__hits; });
    await p.evaluate(() => { if (playbackState.isPlaying) playAll(); });
    await new Promise((r) => setTimeout(r, 500));
    return h;
  };
  const show = (h) => Object.entries(h).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}=${v}`).join('  ') || '(пусто)';

  console.log('\n=== 2. Аппликатуры ВКЛЮЧЕНЫ: анимируется тултип ===');
  await p.evaluate(() => { document.getElementById('showFingering').checked = true; toggleFingering(); });
  const on = await run(6);
  console.log('   ', show(on));
  t('тултип анимируется', (on['тултип'] || 0) > 20, String(on['тултип'] || 0));
  t('бейдж секции НЕ анимируется', !(on['бейдж секции'] > 0), String(on['бейдж секции'] || 0));
  t('мини-превью ячейки НЕ анимируется', !(on['ячейка'] > 0), String(on['ячейка'] || 0));

  console.log('\n=== 3. Аппликатуры ВЫКЛЮЧЕНЫ: анимируется секция ===');
  await p.evaluate(() => { document.getElementById('showFingering').checked = false; toggleFingering(); });
  await new Promise((r) => setTimeout(r, 400));
  const off = await run(6);
  console.log('   ', show(off));
  t('бейдж секции анимируется', (off['бейдж секции'] || 0) > 20, String(off['бейдж секции'] || 0));
  t('тултипа нет вовсе', !(off['тултип'] > 0), String(off['тултип'] || 0));

  console.log('\n=== 4. Лента не изменилась ===');
  await p.evaluate(() => { document.getElementById('showFingering').checked = true; toggleFingering(); });
  await p.evaluate(() => toggleTimelineMode(true));
  await new Promise((r) => setTimeout(r, 800));
  const tl = await run(6);
  console.log('   ', show(tl));
  t('дорожка ритма анимируется', (tl['дорожка ленты'] || 0) > 20, String(tl['дорожка ленты'] || 0));
  t('струны на грифе дрожат', (tl['струны'] || 0) > 10, String(tl['струны'] || 0));
  await p.evaluate(() => toggleTimelineMode(false));
  await new Promise((r) => setTimeout(r, 500));

  t('ошибок страницы нет', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё зелено');
  await br.close();
  process.exit(bad ? 1 : 0);
})();
