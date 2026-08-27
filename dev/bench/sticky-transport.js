// Панель транспорта (▶, повтор, стоп, метроном, BPM, «Лента») прилипает
// к верху окна при прокрутке.
//
// До правки строка уезжала вместе со страницей: на длинной песне, чтобы
// нажать «стоп» или включить метроном, приходилось скроллить наверх.
//
// Ключевое условие sticky — ни у одного предка нет overflow/transform/
// filter. Стенд проверяет и это: любой такой стиль, добавленный позже,
// молча превратит sticky в relative, и панель снова начнёт уезжать.
const puppeteer = require('/home/user/node_modules/puppeteer');
const fs = require('fs');
let bad = 0;
const t = (n, c, x = '') => { if (c) console.log('   ok  ', n, x); else { bad++; console.log('  FAIL ', n, x); } };

(async () => {
  const br = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const p = await br.newPage();
  p.setDefaultTimeout(60000);
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).split('\n')[0]));
  await p.setViewport({ width: 1400, height: 800 });
  await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1100));
  // Длинная песня — чтобы было куда прокручивать.
  const song = JSON.parse(fs.readFileSync('/home/user/dev/fixtures/wind-of-change.json', 'utf8'));
  await p.evaluate((s) => {
    localStorage.setItem('struchord_songs', JSON.stringify([s]));
    loadSong(0);
  }, song);
  await new Promise((r) => setTimeout(r, 800));

  console.log('=== 1. Стиль применён ===');
  const css = await p.evaluate(() => {
    const el = document.querySelector('.transport-bar');
    const cs = getComputedStyle(el);
    return { pos: cs.position, top: cs.top, z: cs.zIndex,
      bg: cs.backgroundColor, alpha: (cs.backgroundColor.match(/[\d.]+\)$/) || ['1)'])[0] };
  });
  console.log('   ', JSON.stringify(css));
  t('position: sticky', css.pos === 'sticky', css.pos);
  t('прижата к верху', css.top !== 'auto', css.top);
  t('слой выше содержимого', +css.z >= 10, css.z);
  t('фон непрозрачный', !/rgba/.test(css.bg) || !/0\.\d+\)$/.test(css.bg), css.bg);

  console.log('\n=== 2. Ни один предок не ломает sticky ===');
  const anc = await p.evaluate(() => {
    const bad = [];
    let el = document.querySelector('.transport-bar').parentElement;
    while (el) {
      const cs = getComputedStyle(el);
      const why = [];
      if (cs.overflow !== 'visible') why.push('overflow:' + cs.overflow);
      if (cs.transform !== 'none') why.push('transform');
      if (cs.filter !== 'none') why.push('filter');
      if (cs.perspective !== 'none') why.push('perspective');
      if (cs.contain !== 'none') why.push('contain:' + cs.contain);
      if (why.length) bad.push({ tag: el.tagName + (el.className ? '.' + String(el.className).split(' ')[0] : ''), why });
      el = el.parentElement;
    }
    return bad;
  });
  console.log('   ', anc.length ? JSON.stringify(anc) : 'чисто');
  t('нет предка с overflow/transform/filter', anc.length === 0,
    anc.map((a) => `${a.tag}: ${a.why.join(',')}`).join(' | '));

  console.log('\n=== 3. При прокрутке панель остаётся видимой ===');
  const measure = () => p.evaluate(() => {
    const r = document.querySelector('.transport-bar').getBoundingClientRect();
    return { top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1),
      visible: r.top >= -1 && r.bottom <= innerHeight + 1 && r.height > 10,
      scroll: Math.round(scrollY), maxScroll: Math.round(document.body.scrollHeight - innerHeight) };
  });
  const before = await measure();
  console.log('      без прокрутки:', JSON.stringify(before));
  t('в начале панель видна', before.visible);

  for (const y of [300, 700, 1500]) {
    await p.evaluate((yy) => window.scrollTo(0, yy), y);
    await new Promise((r) => setTimeout(r, 350));
    const m = await measure();
    console.log(`      scrollY=${m.scroll}:`, JSON.stringify(m));
    if (m.scroll < 20) { console.log('      (прокрутки нет — пропуск)'); continue; }
    t(`scrollY=${m.scroll}: панель видна`, m.visible, `top=${m.top}`);
    t(`scrollY=${m.scroll}: прижата к верху`, m.top >= -1 && m.top <= 20, `top=${m.top}`);
  }

  console.log('\n=== 4. Кнопки кликабельны в прилипшем состоянии ===');
  const hit = await p.evaluate(() => {
    const b = document.getElementById('btnPlay');
    const r = b.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { onTop: !!(el && (el === b || b.contains(el))), tag: el ? el.tagName : null,
      id: el ? (el.id || el.closest('button')?.id || '') : '' };
  });
  console.log('   ', JSON.stringify(hit));
  t('кнопка ▶ поверх содержимого', hit.onTop, `${hit.tag} ${hit.id}`);

  console.log('\n=== 5. Настройки метронома открываются под кнопкой ===');
  const metro = await p.evaluate(() => {
    toggleMetronomeSettings();
    const s = document.getElementById('metronomeSettings');
    const bar = document.querySelector('.transport-bar');
    const r = s.getBoundingClientRect(), br = bar.getBoundingClientRect();
    return { shown: getComputedStyle(s).display !== 'none',
      below: r.top >= br.bottom - 2, inWin: r.top >= 0 && r.bottom <= innerHeight + 1,
      top: +r.top.toFixed(1), barBottom: +br.bottom.toFixed(1) };
  });
  console.log('   ', JSON.stringify(metro));
  t('панель метронома открылась', metro.shown);
  t('и висит под транспортом', metro.below, `${metro.top} против ${metro.barBottom}`);
  await p.evaluate(() => toggleMetronomeSettings());

  console.log('\n=== 6. Тултип аппликатуры выше панели ===');
  const layers = await p.evaluate(() => ({
    bar: +getComputedStyle(document.querySelector('.transport-bar')).zIndex,
    tip: +getComputedStyle(document.getElementById('fingering-tooltip')).zIndex,
  }));
  console.log('   ', JSON.stringify(layers));
  t('тултип перекрывает панель, а не наоборот', layers.tip > layers.bar,
    `тултип ${layers.tip} против панели ${layers.bar}`);

  console.log('\n=== 7. Строка тональности НЕ прилипает ===');
  const meta = await p.evaluate(() => getComputedStyle(document.querySelector('.meta-row')).position);
  t('.meta-row осталась обычной', meta !== 'sticky' && meta !== 'fixed', meta);

  console.log('\n=== 8. Мобильные раскладки: sticky не сломан overflow ===');
  // Отдельная ловушка. На мобильном body и .container получают
  // overflow-x, чтобы страница не ездила вбок. Со значением hidden
  // браузер вычисляет overflow-y как auto — предок становится
  // прокручиваемым, и sticky отсчитывается от НЕГО, а не от окна.
  // Замер на 390x844: панель уезжала на top=-462. Значение clip
  // обрезает так же, но прокручиваемым контейнером не делает.
  for (const [w, h, name] of [[390, 844, 'телефон'], [820, 1180, 'iPad'], [844, 390, 'ландшафт']]) {
    const mp = await br.newPage();
    await mp.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await mp.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 1100));
    await mp.evaluate((sg) => {
      localStorage.setItem('struchord_songs', JSON.stringify([sg]));
      loadSong(0);
    }, song);
    await new Promise((r) => setTimeout(r, 800));
    await mp.evaluate(() => window.scrollTo(0, 800));
    await new Promise((r) => setTimeout(r, 400));
    const m = await mp.evaluate(() => {
      const el = document.querySelector('.transport-bar');
      const r = el.getBoundingClientRect();
      const ov = (n) => { const c = getComputedStyle(n); return c.overflowX + '/' + c.overflowY; };
      return { top: +r.top.toFixed(0), scroll: Math.round(scrollY),
        visible: r.top >= -1 && r.bottom <= innerHeight + 1,
        body: ov(document.body), cont: ov(document.querySelector('.container')) };
    });
    console.log(`      ${name.padEnd(9)} ${w}x${h}  top=${m.top}  body ${m.body}  .container ${m.cont}`);
    t(`${name}: панель прилипла`, m.visible && m.top >= -1 && m.top <= 20, `top=${m.top}`);
    t(`${name}: предки не прокручиваемые`,
      !/(auto|scroll)/.test(m.body) && !/(auto|scroll)/.test(m.cont),
      `body ${m.body}, .container ${m.cont}`);
    await mp.close();
  }

  t('ошибок страницы нет', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё зелено');
  await br.close();
  process.exit(bad ? 1 : 0);
})();
