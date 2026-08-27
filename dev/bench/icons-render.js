// Проверка: все иконки Tabler реально РИСУЮТСЯ (глиф есть в сабсете),
// а не показывают пустой прямоугольник.
//
// Ловит две ошибки разом:
//   1) иконка добавлена в разметку, но subset-icons.py не перезапущен —
//      глифа в шрифте нет, ширина ::before схлопывается;
//   2) имя класса собрано в JS конкатенацией ('ti ti-' + name) —
//      субсеттер его не находит регуляркой и не кладёт в шрифт.
const puppeteer = require('/home/user/node_modules/puppeteer');
let bad = 0;
const t = (n, c, x = '') => { if (c) console.log('   ok  ', n, x); else { bad++; console.log('  FAIL ', n, x); } };
(async () => {
  const br = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const p = await br.newPage();
  await p.setViewport({ width: 1400, height: 900 });
  p.setDefaultTimeout(90000);
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).split('\n')[0]));
  await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await new Promise((r) => setTimeout(r, 1200));
  await p.evaluate(() => document.fonts.ready);

  // Собираем ВСЕ имена ti-* из исходника (разметка + строковые литералы в JS).
  const fs = require('fs');
  const src = fs.readFileSync('/home/user/STRUCHORD.html', 'utf8');
  const fontBlock = /<style[^>]*>[^<]*@font-face[\s\S]*?<\/style>/.exec(src);
  const doc = fontBlock ? src.replace(fontBlock[0], '') : src;
  const names = [...new Set([...doc.matchAll(/ti ti-([a-z0-9-]+)/g)].map((m) => m[1]))].sort();
  console.log(`=== имён иконок в исходнике: ${names.length} ===`);

  // Рисуем каждую в тестовом узле и меряем ширину ::before.
  const res = await p.evaluate((list) => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-9999px;top:0;font-size:24px';
    document.body.appendChild(host);
    const out = {};
    for (const n of list) {
      const i = document.createElement('i');
      i.className = 'ti ti-' + n;
      host.appendChild(i);
      const cs = getComputedStyle(i, '::before');
      out[n] = { w: i.getBoundingClientRect().width, content: cs.content };
    }
    host.remove();
    return out;
  }, names);

  const empty = names.filter((n) => !(res[n].w > 4));
  const noRule = names.filter((n) => !res[n].content || res[n].content === 'none');
  t('у каждой иконки есть CSS-правило content', noRule.length === 0, noRule.join(', '));
  t('каждая иконка имеет ненулевую ширину (глиф в сабсете)',
    empty.length === 0, empty.length ? empty.join(', ') : `${names.length} шт.`);

  // Кнопка play должна МЕНЯТЬ иконку, а не терять её при воспроизведении.
  const seq = await p.evaluate(async () => {
    const bp = document.getElementById('btnPlay');
    const cls = () => { const i = bp.querySelector('i.ti'); return i ? i.className : '(нет <i>)'; };
    const before = cls();
    playbackState.isPlaying = true;
    timelineMode = false;
    updateTransportButtons();
    const playingEditor = cls();
    timelineMode = true;
    updateTransportButtons();
    const playingTimeline = cls();
    playbackState.isPlaying = false;
    timelineMode = false;
    updateTransportButtons();
    return { before, playingEditor, playingTimeline, after: cls() };
  });
  console.log('   кнопка play:', JSON.stringify(seq));
  t('в покое — player-play', /ti-player-play$/.test(seq.before), seq.before);
  t('в редакторе при игре — player-stop', /ti-player-stop$/.test(seq.playingEditor), seq.playingEditor);
  t('в ленте при игре — player-pause', /ti-player-pause$/.test(seq.playingTimeline), seq.playingTimeline);
  t('после остановки иконка возвращается', /ti-player-play$/.test(seq.after), seq.after);
  t('узел <i> не пересоздаётся (иконка не теряется)', !/нет <i>/.test(seq.after));

  // Сырых глифов в кнопках интерфейса быть не должно.
  const glyphs = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('button, .action-btn__glyph').forEach((b) => {
      const txt = (b.textContent || '').trim();
      if (/[▶⏸⏹■↶↷⋮✕×−◀⌕]/.test(txt)) out.push((b.className || b.tagName) + ' :: ' + txt.slice(0, 12));
    });
    return out;
  });
  t('в кнопках интерфейса нет сырых глифов', glyphs.length === 0, glyphs.slice(0, 5).join(' | '));

  t('ошибок страницы нет', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё зелено');
  await br.close();
  process.exit(bad ? 1 : 0);
})();
