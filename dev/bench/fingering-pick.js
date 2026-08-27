// Качество подбора аппликатур: первая показанная форма.
//
// Проверяем не «красиво ли», а измеримое:
//   - нет ли формы с ЛУЧШЕЙ собственной оценкой ниже по списку;
//   - звучат ли все ноты аккорда, стоит ли нужный бас;
//   - не разъезжается ли форма по грифу.
const puppeteer = require('puppeteer');

let bad = 0;
const ok = (n, c, x) => { console.log(`   ${c ? 'ok  ' : 'FAIL'} ${n}${!c && x !== undefined ? ' — ' + x : ''}`); if (!c) bad++; };

(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'] });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 900));

  console.log('=== 1. Первая форма против лучшей по оценке ===');
  // Порядок выдачи ступенчатый (уточнённая волна-4, 2026-08-13):
  //   1) формы пользователя и переносы;
  //   2) открытая форма из OPEN_CHORDS — вперёд в обход оценки (стена
  //      подтверждена прямым вопросом гитариста про C7: «действительно
  //      8,7,5,0,5,6 нужно показывать раньше, чем x,3,2,3,1,0?»);
  //   3) ОБЩИЙ пул: caged + авто, внутри по ЧИСТОЙ оценке — фора
  //      CAGED_POOL_BONUS=18 волны-2 снята («пусть open и caged тоже
  //      сортируются по удобству»); неполные и неиграбельные — под
  //      валидными; в голове списка — разнообразие рамок: дубль
  //      семейства откладывается за представителей других рамок.
  //
  // Открытая форма ставится первой намеренно, в обход сортировки: для
  // C, G, C7 это и есть то, как их играют, хотя формула предпочла бы
  // иную. Поэтому расхождение с «лучшей по оценке» норма только для
  // open/User; внутри пула первая обязана быть лучшей по чистой
  // оценке среди валидных полных.
  const audit = await p.evaluate(() => {
    const roots = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const types = ['', 'm', '7', 'm7', 'maj7', 'sus4', 'sus2', 'add9', 'dim', 'aug', '6', 'm6'];
    const out = [];
    for (const rt of roots) for (const ty of types) {
      const ch = rt + ty;
      const notes = getChordNotes(ch, getKeyStyle('C')) || [];
      if (!notes.length) continue;
      const res = window.getFingeringVariants(ch, 'C');
      if (!res || !res.shapes.length) continue;
      // Чистая оценка удобства; CAGED-бонусы в очках никогда не
      // возвращались (волна-6 вернула CAGED как ступень ОЧЕРЕДИ,
      // а не как фору).
      const eff = (s) => scoreShape(s, notes, rt, null);
      const list = res.shapes.map((s) => ({
        f: s.join(','),
        v: eff(s),
        cls: analyzeShapeGrip(s).ban ? 2 : shapeMissingDefiningTones(s, notes, rt) ? 1 : 0,
      }));
      // Лучшая среди валидных полных форм пула по чистой оценке.
      const good = list.filter((x) => x.cls === 0);
      const best = good.reduce((a, x) => (x.v > a.v ? x : a), good[0]);
      // Волна-6 (2026-08-14): ступени стандартного строя — свои(0) <
      // защищённые якоря(0.5) < open(1) < CAGED(2) < всё остальное(3);
      // неполные +3, бан 7. Точная копия siftRank из приложения (SYNCH).
      // Волна-7: якоря — объекты {shape,label,reason}, метод 'anchor'.
      const anchorSet = new Set(
        (typeof FINGERING_FIRST_ANCHORS !== 'undefined' && FINGERING_FIRST_ANCHORS[ch]
          ? FINGERING_FIRST_ANCHORS[ch] : []).map((a) => (a.shape || a).join(',')));
      const isAnchor = (i) => anchorSet.has(res.shapes[i].join(','));
      const siftKey = (i) => {
        const m = res.methods[i];
        if (m === 'user' || m === 'derived') return 0;
        const cls = list[i].cls;
        const tier = (m === 'anchor' || isAnchor(i)) ? 0.5 : m === 'open' ? 1 : m === 'caged' ? 2 : 3;
        return cls === 0 ? tier : cls === 1 ? tier + 3 : 7;
      };
      const isOpen = res.methods[0] === 'open';
      const isUser = res.methods[0] === 'user' || res.methods[0] === 'derived';
      const isAnchor0 = isAnchor(0);
      const isCaged0 = res.methods[0] === 'caged';
      // Копии функций семейств из приложения (SYNCH: famFrame/famDist).
      const famFrame = (shape) => {
        let bass = -1, lo = 99, hi = -1;
        for (let s = 0; s < 6; s++) {
          const x = shape[s];
          if (x === 'x') continue;
          if (bass === -1) bass = s;
          if (x !== 0) { if (x < lo) lo = x; if (x > hi) hi = x; }
        }
        return { bass, lo: lo === 99 ? 0 : lo, hi: hi === -1 ? 0 : hi };
      };
      const famDist = (a, b) => {
        let d = 0;
        for (let s = 0; s < 6; s++) {
          const x = a[s], y = b[s];
          if (x === y) continue;
          if (x === 'x' || y === 'x') d += 0.5;
          else if (x === 0 || y === 0) d += 1;
          else if (Math.abs(x - y) <= 1) d += 0.5;
          else d += 2;
        }
        return d;
      };
      const frames = res.shapes.map(famFrame);
      const sameFam = (i, j) =>
        frames[i].bass === frames[j].bass &&
        Math.abs(frames[i].lo - frames[j].lo) <= 1 &&
        Math.abs(frames[i].hi - frames[j].hi) <= 1 &&
        famDist(res.shapes[i], res.shapes[j]) <= 1.5;
      const deferred = (j) => {
        for (let k = 0; k < j; k++) {
          const mk = res.methods[k];
          if (mk === 'user' || mk === 'derived') continue;
          if (sameFam(k, j)) return true;
        }
        return false;
      };
      // Порядок по ступеням волны-6; внутри ступени — чистая оценка.
      // Границы между блоками (open→CAGED→остальное) и пары с
      // отложенным дублём семейства законны — их пропускаем.
      let tailOk = true;
      for (let i = 1; i < list.length; i++) {
        const ka = siftKey(i - 1);
        const kb = siftKey(i);
        // Отложенный дубль семейства (диверсификация топ-12) законно
        // стоит ниже своей ступени — границу с ним пропускаем.
        if (kb < ka && !deferred(i - 1) && !deferred(i)) { tailOk = false; break; }
        if (kb === ka && !deferred(i - 1) && !deferred(i) &&
            list[i].v > list[i - 1].v + 0.01) { tailOk = false; break; }
      }
      out.push({ ch, gap: best && list[0] ? best.v - list[0].v : 0,
                 isOpen: !!isOpen, isUser, isAnchor: isAnchor0, isCaged: isCaged0, tailOk });
    }
    return out;
  });
  const worse = audit.filter((x) => x.gap > 0.01);
  const byRule = worse.filter((x) => !x.isOpen && !x.isUser && !x.isAnchor && !x.isCaged);
  const tailBroken = audit.filter((x) => !x.tailOk);
  console.log(`      аккордов ${audit.length}, первая не лучшая (по чистой оценке пула) у ${worse.length}`);
  console.log(`      из них объяснимо правилом (open/user/якорь/caged): ${worse.length - byRule.length}`);
  // Расхождение допустимо, если наверху стоит своя форма, защищённый
  // якорь (народная G9), открытая из таблицы или верхняя CAGED-форма:
  // волна-6 вернула блоки «OPEN - CAGED - всё остальное», внутри
  // блока решает чистая оценка, между блоками — ступень.
  const byRule2 = worse.filter((x) => !x.isOpen && !x.isUser && !x.isAnchor && !x.isCaged);
  ok('первой стоит лучшая по чистой оценке, либо своя/якорь/open/caged', byRule2.length === 0,
    byRule2.slice(0, 5).map((x) => x.ch).join(', '));
  ok('внутри ступеней сортировка по (класс, чистая оценка) не сломана', tailBroken.length === 0,
    tailBroken.slice(0, 5).map((x) => x.ch).join(', '));

  console.log('\n=== 2. Состав нот и бас ===');
  const notesCheck = await p.evaluate(() => {
    const sn = ['E', 'A', 'D', 'G', 'B', 'E'];
    const roots = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    const types = ['', 'm', '7', 'm7', 'maj7', 'sus4', 'sus2', 'add9', '6'];
    const broken = [];
    for (const rt of roots) for (const ty of types) {
      const ch = rt + ty;
      const notes = getChordNotes(ch, getKeyStyle('C')) || [];
      if (!notes.length) continue;
      const first = window.getFingeringVariants(ch, 'C').shapes[0];
      if (!first) continue;
      const have = new Set();
      first.forEach((f, i) => { if (f === 'x') return;
        have.add(CHROMATIC[(CHROMATIC.indexOf(sn[i]) + f) % 12]); });
      const target = notes.map((n) => toSharpNote(n.replace(/\d+$/, '')));
      // Квинту пропускать МОЖНО — так играют. Терцию и септиму нельзя.
      const rootIdx = CHROMATIC.indexOf(toSharpNote(rt));
      const missing = target.filter((n) => !have.has(n))
        .filter((n) => ((CHROMATIC.indexOf(n) - rootIdx + 12) % 12) !== 7);
      if (missing.length) broken.push(`${ch}: нет ${missing.join(',')}`);
    }
    return broken;
  });
  ok('ни один аккорд не потерял окраску', notesCheck.length === 0,
    notesCheck.slice(0, 5).join(' | '));

  console.log('\n=== 3. Пропуск квинты больше не топит форму ===');
  // Главный дефект: MISSING_NOTE был 60 на ЛЮБУЮ ноту, и классический
  // C7 = x,3,2,3,1,0 получал -64 балла за единственную отсутствующую
  // квинту — уходил в конец списка, хотя именно так его и играют.
  const fifth = await p.evaluate(() => {
    const notes = getChordNotes('C7', getKeyStyle('C'));
    const classic = ['x', 3, 2, 3, 1, 0];
    return {
      score: +scoreShape(classic, notes, 'C', null).toFixed(1),
      first: window.getFingeringVariants('C7', 'C').shapes[0].join(','),
    };
  });
  console.log('      C7 x,3,2,3,1,0 =', fifth.score, '| первой показана', fifth.first);
  ok('классический C7 больше не в глубоком минусе', fifth.score > -30, String(fifth.score));
  // Стена «open вперёд» подтверждена уточнённой волной-4 (2026-08-13)
  // дословным вопросом гитариста: «действительно 8,7,5,0,5,6 нужно
  // показывать раньше, чем x,3,2,3,1,0?» — нет: табличная форма выше
  // всех авто (авто 8,7,5,0,5,6 сидит на 8-й позиции, замер
  // dev/tools/probe-rank-position.js).
  ok('и показывается первым (стена open)', fifth.first === 'x,3,2,3,1,0', fifth.first);

  console.log('\n=== 4. Добавленные формы ===');
  const added = await p.evaluate(() => {
    const sn = ['E', 'A', 'D', 'G', 'B', 'E'];
    return ['Bm', 'Bm7', 'Dadd9'].map((ch) => {
      const t = (getChordNotes(ch, getKeyStyle('C')) || [])
        .map((n) => toSharpNote(n.replace(/\d+$/, '')));
      const f = window.getFingeringVariants(ch, 'C').shapes[0];
      const have = new Set();
      f.forEach((x, i) => { if (x === 'x') return;
        have.add(CHROMATIC[(CHROMATIC.indexOf(sn[i]) + x) % 12]); });
      const low = f.findIndex((x) => x !== 'x');
      return { ch, shape: f.join(','),
        missing: t.filter((n) => !have.has(n)),
        bass: CHROMATIC[(CHROMATIC.indexOf(sn[low]) + f[low]) % 12],
        wantBass: t[0] };
    });
  });
  added.forEach((x) => {
    console.log(`      ${x.ch.padEnd(6)} ${x.shape.padEnd(14)} бас ${x.bass}`);
    ok(`${x.ch}: все ноты на месте`, x.missing.length === 0, x.missing.join(','));
    ok(`${x.ch}: тоника в басу`, x.bass === x.wantBass, `${x.bass} вместо ${x.wantBass}`);
  });

  console.log('\n=== 5. Слэш-аккорды: нужный бас снизу ===');
  const slash = await p.evaluate(() => {
    const sn = ['E', 'A', 'D', 'G', 'B', 'E'];
    return ['G/B', 'D/F#', 'C/G', 'Am/G', 'Em/B'].map((ch) => {
      const f = window.getFingeringVariants(ch, 'C').shapes[0];
      const low = f.findIndex((x) => x !== 'x');
      return { ch, shape: f.join(','),
        bass: CHROMATIC[(CHROMATIC.indexOf(sn[low]) + f[low]) % 12],
        want: toSharpNote(ch.split('/')[1]) };
    });
  });
  slash.forEach((x) => ok(`${x.ch}: бас ${x.want}`, x.bass === x.want, `${x.bass} (${x.shape})`));

  console.log('\n=== 6. Формы физически берутся ===');
  const playable = await p.evaluate(() => {
    const roots = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    const types = ['', 'm', '7', 'm7', 'maj7', 'sus4', 'add9'];
    const hard = [];
    for (const rt of roots) for (const ty of types) {
      const ch = rt + ty;
      const f = window.getFingeringVariants(ch, 'C').shapes[0];
      if (!f) continue;
      const frets = f.filter((x) => x !== 'x' && x !== 0);
      if (!frets.length) continue;
      const spread = Math.max(...frets) - Math.min(...frets);
      if (spread > 4) hard.push(`${ch}: растяжка ${spread} (${f.join(',')})`);
    }
    return hard;
  });
  ok('нет форм с растяжкой больше 4 ладов', playable.length === 0, playable.slice(0, 4).join(' | '));

  ok('ошибок страницы нет', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё зелено');
  await b.close();
})();
