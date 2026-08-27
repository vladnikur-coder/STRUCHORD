// Дрожание струн на аппликатуре в такт ритму (режим ленты).
//
// Задетые струны на грифе панели «Сейчас» коротко дрожат в момент
// удара: для боя — все звучащие струны формы по очереди (взмах), для
// перебора — только реально щипаемые на этом шаге.
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
  await p.setViewport({ width: 1400, height: 950 });
  p.setDefaultTimeout(90000);
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).split('\n')[0]));
  await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await new Promise((r) => setTimeout(r, 1100));

  // Следим за появлением класса на струнах — иначе короткое дрожание
  // (240 мс) не поймать разовым опросом.
  const startWatch = () => p.evaluate(() => {
    window.__vib = new Set();
    window.__vibSeq = [];
    const host = document.getElementById('tlNowFing');
    window.__obs = new MutationObserver((muts) => {
      muts.forEach((m) => {
        const el = m.target;
        if (el.classList && el.classList.contains('is-vibrating')) {
          const i = el.dataset.string;
          window.__vib.add(i);
          window.__vibSeq.push({ s: +i, at: Math.round(performance.now()) });
        }
      });
    });
    window.__obs.observe(host, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });
  const readWatch = () => p.evaluate(() => ({
    set: [...window.__vib].map(Number).sort((a, b) => a - b),
    seq: window.__vibSeq.slice(0, 12),
  }));

  const setup = async (pattern) => {
    await p.evaluate((pat) => {
      localStorage.setItem('struchord_songs', JSON.stringify([window.__song]));
      loadSong(0);
      sections.forEach((x) => { x.strumPattern = pat; });
      render();
    }, pattern);
    await new Promise((r) => setTimeout(r, 700));
    await p.evaluate(() => { if (!timelineMode) toggleTimelineMode(true); else renderTimeline(); });
    await new Promise((r) => setTimeout(r, 800));
  };
  await p.evaluate((s) => { window.__song = s; }, song);

  console.log('=== 1. Разметка струн в SVG ===');
  await setup({ mode: 'strum', subdivision: 2, steps: ['D', null, 'D', 'U', null, 'U', 'D', 'U'] });
  const svg = await p.evaluate(() => {
    const host = document.getElementById('tlNowFing');
    const lines = [...host.querySelectorAll('.fing-string')];
    return { count: lines.length, idx: lines.map((e) => e.dataset.string).join(',') };
  });
  console.log(`      струн в SVG: ${svg.count} [${svg.idx}]`);
  t('струны помечены data-string', svg.count === 6 && svg.idx === '0,1,2,3,4,5', svg.idx);

  console.log('\n=== 2. Бой: дрожат звучащие струны ===');
  await startWatch();
  await p.evaluate(() => playAll());
  await new Promise((r) => setTimeout(r, 2600));
  let w = await readWatch();
  await p.evaluate(() => stopPlayback());
  await new Promise((r) => setTimeout(r, 300));
  console.log(`      дрожали струны: [${w.set.join(', ')}]`);
  console.log(`      порядок первых ударов: ${w.seq.slice(0, 6).map((x) => x.s).join(' -> ')}`);
  t('струны дрожат при бое', w.set.length > 0, `${w.set.length} шт.`);
  t('задействовано несколько струн (аккорд)', w.set.length >= 3, `${w.set.length}`);
  // Проверяем, что дрожат ИМЕННО звучащие: у F (баррэ) звучат все 6,
  // у Dm верхние струны заглушены.
  const shapeInfo = await p.evaluate(() => {
    const host = document.getElementById('tlNowFing');
    const dead = [...host.querySelectorAll('text')].filter((e) => e.textContent === '✕').length;
    return { dead };
  });
  console.log(`      заглушённых струн на форме: ${shapeInfo.dead}`);
  t('дрожащих не больше, чем звучащих струн', w.set.length <= 6 - shapeInfo.dead + 1,
    `${w.set.length} при ${6 - shapeInfo.dead} звучащих`);

  console.log('\n=== 3. Перебор: дрожат только щипаемые ===');
  await setup({ mode: 'pick', subdivision: 2,
    steps: [['B'], null, [3], null, [2], null, [3], null] });
  await startWatch();
  await p.evaluate(() => playAll());
  await new Promise((r) => setTimeout(r, 2600));
  w = await readWatch();
  await p.evaluate(() => stopPlayback());
  await new Promise((r) => setTimeout(r, 300));
  console.log(`      дрожали струны (индексы формы): [${w.set.join(', ')}]`);
  t('струны дрожат при переборе', w.set.length > 0, `${w.set.length} шт.`);
  // В переборе на шаг приходится 1-2 струны, значит за такт их заметно
  // меньше шести — иначе перевод номеров в индексы был бы неверен.
  t('щипается подмножество струн, а не все', w.set.length <= 4, `${w.set.length}`);
  // Струна 3 (номер) = индекс 6-3 = 3. Она есть в рисунке дважды.
  t('струна №3 переведена в индекс 3', w.set.includes(3), JSON.stringify(w.set));

  console.log('\n=== 4. Остановка гасит дрожание ===');
  const after = await p.evaluate(() => ({
    vibrating: document.querySelectorAll('#tlNowFing .fing-string.is-vibrating').length,
    playing: playbackState.isPlaying,
  }));
  t('после остановки ничего не дрожит', after.vibrating === 0, `${after.vibrating}`);
  await new Promise((r) => setTimeout(r, 1200));
  const late = await p.evaluate(() =>
    document.querySelectorAll('#tlNowFing .fing-string.is-vibrating').length);
  t('дрожание не всплывает позже', late === 0, `${late}`);

  console.log('\n=== 5. В редакторе не дрожит ===');
  // Панели «Сейчас» там нет; функция не должна падать и что-то искать.
  await p.evaluate(() => { if (timelineMode) toggleTimelineMode(false); });
  await new Promise((r) => setTimeout(r, 700));
  await p.evaluate(() => playAll());
  await new Promise((r) => setTimeout(r, 1500));
  const inEditor = await p.evaluate(() => ({
    playing: playbackState.isPlaying,
    vibrating: document.querySelectorAll('.fing-string.is-vibrating').length,
  }));
  await p.evaluate(() => stopPlayback());
  t('в редакторе игра идёт без ошибок', inEditor.playing);
  t('в редакторе дрожания нет', inEditor.vibrating === 0, `${inEditor.vibrating}`);

  console.log('\n=== 6. Анимация не трогает раскладку ===');
  const css = await p.evaluate(() => {
    const el = document.querySelector('.fing-string');
    const cs = getComputedStyle(el);
    return { box: cs.transformBox, origin: cs.transformOrigin };
  });
  t('transform-box: fill-box (иначе струна улетит)', css.box === 'fill-box', css.box);

  t('ошибок страницы нет', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё зелено');
  await br.close();
  process.exit(bad ? 1 : 0);
})();
