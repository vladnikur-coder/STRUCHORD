// В списке вариантов не должно быть форм с ОДИНАКОВЫМ ХВАТОМ.
//
// Дефект нашёл пользователь: «при перелистывании авто очень часто
// встречаются по сути одинаковые аппликатуры». Дедупликация сравнивала
// формы дословно по строке, и подряд шли позиции вроде
//
//     x,0,2,2,1,0   x,0,2,2,1,x
//     x,0,7,5,5,0   x,0,7,5,5,x   x,x,7,5,5,0
//
// Пальцы стоят одинаково, меняется лишь то, сколько струн задето правой
// рукой. Замер до правки по 96 аккордам: 1920 показанных форм на 1743
// разных хвата — 9% повторов; у Am 13 хватов на 20 позиций, у C — 15.
const puppeteer = require('/home/user/node_modules/puppeteer');
let bad = 0;
const t = (n, c, x = '') => { if (c) console.log('   ok  ', n, x); else { bad++; console.log('  FAIL ', n, x); } };

(async () => {
  const br = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const p = await br.newPage();
  p.setDefaultTimeout(60000);
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).split('\n')[0]));
  await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1200));

  console.log('=== 1. Повторов хвата нет ===');
  const dup = await p.evaluate(() => {
    const grip = (sh) => sh.map((f, i) => (f !== 'x' && f !== 0 ? i + ':' + f : '')).filter(Boolean).join(' ');
    const roots = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
    const types = ['', 'm', '7', 'm7', 'maj7', 'sus2', 'sus4', 'add9'];
    let shown = 0, uniq = 0;
    const worst = [];
    for (const r of roots) for (const ty of types) {
      const res = window.getFingeringVariants(r + ty, 'C');
      const top = res.shapes.slice(0, 20);
      const set = new Set(top.map(grip));
      shown += top.length;
      uniq += set.size;
      if (set.size < top.length) worst.push(`${r + ty}: ${top.length} форм на ${set.size} хватов`);
    }
    return { shown, uniq, worst: worst.slice(0, 6) };
  });
  console.log(`      показано ${dup.shown} форм, различных хватов ${dup.uniq}`);
  t('в первых 20 нет одинаковых хватов', dup.uniq === dup.shown,
    dup.worst.join(' | '));

  console.log('\n=== 2. Классические аппликатуры не пропали ===');
  const classic = await p.evaluate(() => {
    const want = {
      C: 'x,3,2,0,1,0', G: '3,2,0,0,0,3', D: 'x,x,0,2,3,2', A: 'x,0,2,2,2,0',
      E: '0,2,2,1,0,0', Am: 'x,0,2,2,1,0', Em: '0,2,2,0,0,0', Dm: 'x,x,0,2,3,1',
      F: '1,3,3,2,1,1', Bm: 'x,2,4,4,3,2', C7: 'x,3,2,3,1,0', G7: '3,2,0,0,0,1',
      D7: 'x,x,0,2,1,2', A7: 'x,0,2,0,2,0', E7: '0,2,0,1,0,0', Am7: 'x,0,2,0,1,0',
      Dm7: 'x,x,0,2,1,1', Cmaj7: 'x,3,2,0,0,0', Gmaj7: '3,2,0,0,0,2',
    };
    const gone = [];
    for (const [ch, w] of Object.entries(want)) {
      const res = window.getFingeringVariants(ch, 'C');
      if (!res.shapes.some((s) => s.join(',') === w)) gone.push(`${ch} ${w}`);
    }
    return { total: Object.keys(want).length, gone };
  });
  t(`все ${classic.total} классических форм на месте`, classic.gone.length === 0,
    classic.gone.join(', '));

  console.log('\n=== 3. Первая выдача не изменилась ===');
  // Схлопывание не должно менять то, что человек видит по умолчанию.
  // Уточнённая волна-4 (2026-08-13): стена «open вперёд» подтверждена,
  // все первые из OPEN_CHORDS на месте; снята только фора caged в
  // общем пуле (на публикуемые первые она не влияла).
  const first = await p.evaluate(() => {
    const want = {
      C: 'x,3,2,0,1,0', D: 'x,x,0,2,3,2', A: 'x,0,2,2,2,0', E: '0,2,2,1,0,0',
      Am: 'x,0,2,2,1,0', Em: '0,2,2,0,0,0', Dm: 'x,x,0,2,3,1', F: '1,3,3,2,1,1',
      Bm: 'x,2,4,4,3,2', C7: 'x,3,2,3,1,0', G7: '3,2,0,0,0,1', D7: 'x,x,0,2,1,2',
      A7: 'x,0,2,0,2,0', E7: '0,2,0,1,0,0', Am7: 'x,0,2,0,1,0', Dm7: 'x,x,0,2,1,1',
      Cmaj7: 'x,3,2,0,0,0', Gmaj7: '3,2,0,0,0,2',
    };
    const bad = [];
    for (const [ch, w] of Object.entries(want)) {
      const got = window.getFingeringVariants(ch, 'C').shapes[0].join(',');
      if (got !== w) bad.push(`${ch}: ${got} вместо ${w}`);
    }
    return bad;
  });
  t('первая форма прежняя', first.length === 0, first.join(' | '));

  console.log('\n=== 4. Выбранная форма не теряется при схлопывании ===');
  // Ключевой риск: если форму схлопнули как повтор, а пользователь её
  // уже выбрал, resolveFingeringShape обязан всё равно её вернуть.
  const kept = await p.evaluate(() => {
    sections = [{ id: 1, type: 'Verse', repeat: 1, squares: [{ id: 1, repeat: 1,
      events: [{ chord: 'Am', span: 4 }] }] }];
    nextId = 9; render();
    const victim = 'x,0,2,2,1,x';   // тот же хват, что у первой формы
    const before = window.getFingeringVariants('Am', 'C').shapes.some((s) => s.join(',') === victim);
    const ev = sections[0].squares[0].events[0];
    const posKey = buildFingeringPositionKey('Am', globalKey, 1, 1, 0);
    setPreferredFingering(posKey, victim, ev);
    const after = window.getFingeringVariants('Am', 'C').shapes.some((s) => s.join(',') === victim);
    const resolved = (resolveFingeringShape('Am', 'C', posKey, ev) || []).join(',');
    return { before, after, resolved, victim };
  });
  console.log('   ', JSON.stringify(kept));
  t('до выбора форма схлопнута', !kept.before);
  t('после выбора она в списке', kept.after);
  t('и резолвится правильно', kept.resolved === kept.victim, kept.resolved);

  console.log('\n=== 5. Список стал короче ===');
  const size = await p.evaluate(() => ({
    Am: window.getFingeringVariants('Am', 'C').shapes.length,
    C: window.getFingeringVariants('C', 'C').shapes.length,
    G: window.getFingeringVariants('G', 'C').shapes.length,
  }));
  console.log('   ', JSON.stringify(size));
  // До правки было Am 269, C 251, G 275.
  t('Am сократился', size.Am < 269, `${size.Am} против 269`);
  t('C сократился', size.C < 251, `${size.C} против 251`);

  t('ошибок страницы нет', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё зелено');
  await br.close();
  process.exit(bad ? 1 : 0);
})();
