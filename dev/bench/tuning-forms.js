// Аппликатуры при СМЕНЕ СТРОЯ.
//
// Проверяется три вещи, о которых просил пользователь:
//   1. свои (user) формы, собранные в стандартном строе, в другом
//      строе НЕ подставляются — они отложены до возврата строя;
//   2. заготовки open/caged в чужом строе либо подходят как есть,
//      либо дорабатываются сдвигом ладов на перестроенных струнах,
//      либо не показываются вовсе (звучать чужим аккордом нельзя);
//   3. закреплённый в ячейке выбор формы действует только в том
//      строе, в котором сделан, и не теряется при возврате.
const puppeteer = require('/home/user/node_modules/puppeteer');

let bad = 0;
const ok = (n, c, x) => {
  console.log(`   ${c ? 'ok  ' : 'FAIL'} ${n}${!c && x !== undefined ? ' — ' + x : ''}`);
  if (!c) bad++;
};

(async () => {
  const b = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--allow-file-access-from-files'],
    protocolTimeout: 240000, // §4б считает ~1092 генерации одним
    // evaluate; на нагруженной песочнице это > 60 с (замерено в
    // волне-9: движок не замедлился, 29.6 с против 30.6 с у
    // волны-8 в jsdom — чистый шум машины; флейк инфраструктуры).
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  p.on('dialog', (d) => d.accept());
  await p.goto('file:///home/user/STRUCHORD.html', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await new Promise((r) => setTimeout(r, 1000));

  console.log('=== 1. Подпись строя в ключах ===');
  const keys = await p.evaluate(() => {
    const out = {};
    tunerTuningId = 'e-std';
    tunerCustomNotes = null;
    out.stdSuffix = tuningKeySuffix();
    out.stdKey = buildFingeringChordKey('Am', 'C');
    tunerTuningId = 'drop-d';
    out.dropSuffix = tuningKeySuffix();
    out.dropKey = buildFingeringChordKey('Am', 'C');
    out.posKey = buildFingeringPositionKey('Am', 'C', 1, 2, 0);
    tunerTuningId = 'e-std';
    fingeringCache.clear();
    return out;
  });
  ok('в стандартном строе подписи нет (старые ключи целы)', keys.stdSuffix === '' && keys.stdKey === 'Am|C', JSON.stringify(keys));
  ok('в Drop D ключ помечен строем', keys.dropKey === 'Am|C@D2A2D3G3B3E4', keys.dropKey);
  ok('позиционный ключ: подпись у тональности, хвост числовой', /\|C@D2A2D3G3B3E4\|1\|2\|0$/.test(keys.posKey), keys.posKey);

  console.log('=== 2. Свои формы отложены в чужом строе ===');
  const own = await p.evaluate(() => {
    const out = {};
    tunerTuningId = 'e-std';
    tunerCustomNotes = null;
    fingeringCache.clear();
    userFingerings.clear();
    // Своя форма Am, собранная в стандартном строе.
    userFingerings.set('Am|C', [['x', 0, 2, 2, 1, 3]]);
    let r = window.getFingeringVariants('Am', 'C');
    out.stdFirst = r.shapes[0].join(',');
    out.stdMethod = r.methods[0];
    tunerTuningId = 'drop-d';
    fingeringCache.clear();
    r = window.getFingeringVariants('Am', 'C');
    out.dropFirst = r.shapes[0].join(',');
    out.dropHasUser = r.methods.includes('user');
    out.dropHasOwnShape = r.shapes.some((s) => s.join(',') === 'x,0,2,2,1,3');
    // Возврат строя — форма снова на месте.
    tunerTuningId = 'e-std';
    fingeringCache.clear();
    r = window.getFingeringVariants('Am', 'C');
    out.backFirst = r.shapes[0].join(',');
    out.backMethod = r.methods[0];
    userFingerings.clear();
    fingeringCache.clear();
    return out;
  });
  ok('в стандартном своя форма первая', own.stdFirst === 'x,0,2,2,1,3' && own.stdMethod === 'user', JSON.stringify(own));
  ok('в Drop D своих форм нет', !own.dropHasUser && !own.dropHasOwnShape, own.dropFirst);
  ok('возврат строя возвращает свою форму', own.backFirst === 'x,0,2,2,1,3' && own.backMethod === 'user', JSON.stringify(own));

  console.log('=== 3. Доработка заготовок сдвигом ладов ===');
  const adapt = await p.evaluate(() => {
    const out = {};
    tunerTuningId = 'drop-d';
    tunerCustomNotes = null;
    fingeringCache.clear();
    out.drops = tuningSemitoneDrops().join(',');
    out.gStd = adaptShapeToTuning([3, 2, 0, 0, 3, 3]);
    out.dStd = adaptShapeToTuning(['x', 'x', 0, 2, 3, 2]);
    tunerTuningId = 'e-std';
    fingeringCache.clear();
    return out;
  });
  ok('Drop D: опущена только шестая на тон', adapt.drops === '2,0,0,0,0,0', adapt.drops);
  ok('G 3,2,0,0,3,3 -> 5,2,0,0,3,3', String(adapt.gStd) === '5,2,0,0,3,3', String(adapt.gStd));
  ok('D x,x,0,2,3,2 не тронут (шестая молчит)', String(adapt.dStd) === 'x,x,0,2,3,2', String(adapt.dStd));

  console.log('=== 4. Чужих нот в выдаче нет ни в одном строе ===');
  const notes = await p.evaluate(() => {
    const CH = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const chords = ['C', 'G', 'D', 'A', 'E', 'Am', 'Em', 'Dm', 'F', 'Bm', 'C7', 'G7', 'Cmaj7', 'Asus4', 'Dsus2'];
    const tunings = ['e-std', 'drop-d', 'drop-c', 'open-g', 'dadgad', 'eb-std'].filter((id) =>
      TUNER_TUNINGS.some((t) => t.id === id)
    );
    const bad = [];
    let checked = 0;
    for (const id of tunings) {
      tunerTuningId = id;
      tunerCustomNotes = null;
      fingeringCache.clear();
      const sn = songStringNotes();
      for (const c of chords) {
        const r = window.getFingeringVariants(c, 'C');
        const want = new Set((getChordNotes(c, 'sharp') || []).map((n) => toSharpNote(n.replace(/\d+$/, ''))));
        if (!want.size) continue;
        // Проверяем только «осмысленные» формы: open/caged/user.
        r.shapes.forEach((sh, i) => {
          const m = r.methods[i];
          if (m !== 'open' && m !== 'caged' && m !== 'user') return;
          checked++;
          for (let s = 0; s < 6; s++) {
            const f = sh[s];
            if (f === 'x') continue;
            const note = CH[(CH.indexOf(sn[s]) + f) % 12];
            if (!want.has(note)) bad.push(`${id} ${c} ${sh.join(',')} -> ${note}`);
          }
        });
      }
    }
    tunerTuningId = 'e-std';
    fingeringCache.clear();
    return { checked, bad: bad.slice(0, 6), count: bad.length };
  });
  console.log(`      проверено форм: ${notes.checked}`);
  ok('чужих нот в open/caged/user нет', notes.count === 0, notes.bad.join(' | '));

  console.log('=== 5. Аккорд не остаётся без форм ===');
  const cover = await p.evaluate(() => {
    const chords = ['C', 'G', 'D', 'A', 'E', 'Am', 'Em', 'Dm', 'F', 'Bm', 'C7', 'Cmaj7'];
    const tunings = ['drop-d', 'drop-c', 'open-g', 'dadgad'].filter((id) =>
      TUNER_TUNINGS.some((t) => t.id === id)
    );
    const empty = [];
    for (const id of tunings) {
      tunerTuningId = id;
      tunerCustomNotes = null;
      fingeringCache.clear();
      for (const c of chords) {
        const r = window.getFingeringVariants(c, 'C');
        if (!r.shapes.length) empty.push(id + ' ' + c);
      }
    }
    tunerTuningId = 'e-std';
    fingeringCache.clear();
    return empty;
  });
  ok('в каждом строе у каждого аккорда есть формы', cover.length === 0, cover.join(', '));

  console.log('=== 3б. Освободившиеся струны добираются в форму ===');
  // Заготовка глушит струну, потому что в СТАНДАРТНОМ строе на ней
  // лежала чужая нота. Перестройка это меняет: в Drop D шестая даёт D,
  // и для аккорда D глушить её незачем.
  const freed = await p.evaluate(() => {
    const out = {};
    tunerTuningId = 'drop-d';
    tunerCustomNotes = null;
    fingeringCache.clear();
    const notes = getChordNotes('D', 'sharp');
    out.tbl = OPEN_CHORDS['D'].join(',');
    // Табличная форма проходит проверку состава БЕЗ правок — глушёные
    // струны чужих нот не дают. Поэтому adaptShapeToTuning тут не
    // срабатывал, и дефект жил именно здесь.
    out.tblMatches = shapeMatchesChord(OPEN_CHORDS['D'], notes, 'D');
    out.first = window.getFingeringVariants('D', 'C').shapes[0].join(',');
    out.scoreTbl = +scoreShape(OPEN_CHORDS['D'], notes, 'D', null).toFixed(1);
    out.scoreFull = +scoreShape([0, 0, 0, 2, 3, 2], notes, 'D', null).toFixed(1);
    // Dm в Drop D — тот же случай.
    out.dm = window.getFingeringVariants('Dm', 'C').shapes[0].join(',');
    // А в стандартном строе ничего не меняется.
    tunerTuningId = 'e-std';
    fingeringCache.clear();
    out.std = window.getFingeringVariants('D', 'C').shapes[0].join(',');
    return out;
  });
  ok('табличный D проходит состав и без правок', freed.tblMatches === true, String(freed.tblMatches));
  ok('но полная форма оценивается выше', freed.scoreFull > freed.scoreTbl, `${freed.scoreFull} vs ${freed.scoreTbl}`);
  ok('в Drop D у D первой идёт 0,0,0,2,3,2', freed.first === '0,0,0,2,3,2', freed.first);
  ok('у Dm — 0,0,0,2,3,1', freed.dm === '0,0,0,2,3,1', freed.dm);
  ok('в стандартном строе D остался x,x,0,2,3,2', freed.std === 'x,x,0,2,3,2', freed.std);

  console.log('=== 3в. Струна не открывается, если форма от этого хуже ===');
  // Открытие струны не должно проделывать дырку между звучащими.
  // Замер: в Open G у Dsus2 получалось 0,x,0,2,3,0 — за это штраф
  // INNER_MUTE, и оценка такую форму отвергает.
  const nowiden = await p.evaluate(() => {
    tunerTuningId = 'open-g';
    tunerCustomNotes = null;
    fingeringCache.clear();
    const first = window.getFingeringVariants('Dsus2', 'C').shapes[0].join(',');
    tunerTuningId = 'e-std';
    fingeringCache.clear();
    return first;
  });
  ok('Open G, Dsus2 без дырки между струнами', !/^0,x/.test(nowiden), nowiden);

  console.log('=== 4б. Ступени очереди держатся во всех строях ===');
  // С подписанным счётчиком вариантов («1/1(польз.)», «2/5»,
  // «1/…(авто)» — см. fingeringCounterText) очередь держится на
  // ступенях ВО ВСЕХ строях: заготовки лежат перед авто-подстановками.
  // Единый пул по оценке остался только у слэш-аккордов — здесь они не
  // проверяются.
  //
  // С 2026-08-13 (калибровка удобства, уточнённая волна-4) модель
  // такая:
  //   — стандартный строй: ступени «свои < open < общий пул caged +
  //     авто», пул отсортирован по ЧИСТОЙ оценке (фора
  //     CAGED_POOL_BONUS=18 волны-2 снята — «пусть open и caged тоже
  //     сортируются по удобству»; стена open оставлена: «действительно
  //     8,7,5,0,5,6 нужно показывать раньше, чем x,3,2,3,1,0?» — нет);
  //   — нестандартный строй: ступени «свои < open/caged < авто»,
  //     как прежде;
  //   — в голове списка (до 12) действует разнообразие рамок: дубль
  //     семейства откладывается за представителей других семейств.
  // Порядок считается по КЛЮЧУ просадки siftRank и по чистой оценке;
  // неполные (без определяющей ступени) и неиграбельные тонут ниже
  // валидных авто независимо от происхождения (иначе в Open G у Dsus2
  // первой всплывала табличная 0,x,0,2,3,0 без ноны-сути sus2).
  //
  // Инварианты:
  //   1. ключ siftRank не убывает по списку (ступени + класс);
  //   2. пул внутри равного ключа идёт по убыванию чистой оценки.
  //      Пары с отложенными дублями семейств (любой из двух)
  //      пропускаются — отложение законно. Открытая форма стоит на
  //      своей ступени в обход сортировки намеренно (OPEN_CHORDS —
  //      одна форма на аккорд, сортировать там нечего).
  //   3. в стандартном строе весь список целиком по оценке НЕ
  //      отсортирован хотя бы у одного аккорда — признак того, что
  //      стена «open вперёд» и разнообразие реально работают, а не
  //      совпали с оценкой случайно.
  const order = await p.evaluate(() => {
    const roots = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const sfx = ['', 'm', '7', 'm7', 'maj7', 'sus2', 'sus4', 'dim', 'aug', '6', 'm6', '9', 'add9'];
    const out = {};
    const broken = [];
    for (const id of ['e-std', 'eb-std', 'drop-d', 'drop-c', 'open-g', 'dadgad', 'open-d']) {
      if (!TUNER_TUNINGS.some((t) => t.id === id)) continue;
      tunerTuningId = id;
      tunerCustomNotes = null;
      fingeringCache.clear();
      let checked = 0;
      let desc = 0; // весь список по убыванию оценки (для проверки 3)
      let tierBad = 0;
      let tailBad = 0;
      for (const r of roots)
        for (const s of sfx) {
          const c = r + s;
          const v = window.getFingeringVariants(c, 'C');
          if (v.shapes.length < 2) continue;
          const notes = getChordNotes(c, 'sharp');
          if (!notes || !notes.length) continue;
          checked++;
          const sc = v.shapes.map((sh) => scoreShape(sh, notes, r, null));
          const std = isStandardTuning();
          // Ключ просадки — точная копия siftRank из приложения (SYNCH).
          // Волна-6 (2026-08-14): стандарт — свои(0) < якоря(0.5) <
          // open(1) < CAGED(2) < всё остальное(3); прочие строи — ярус
          // заготовок open+caged(1) < авто(2). Неполные +3, бан 7.
          // Волна-7: якоря — объекты {shape,label,reason} и носят
          // собственный метод 'anchor'; волна-6 требовала .shape из объекта.
          const anchorSet = new Set(
            (std && typeof FINGERING_FIRST_ANCHORS !== 'undefined' && FINGERING_FIRST_ANCHORS[c]
              ? FINGERING_FIRST_ANCHORS[c] : []).map((a) => (a.shape || a).join(',')));
          const key = (i) => {
            const m = v.methods[i];
            if (m === 'user' || m === 'derived') return 0;
            const cls = analyzeShapeGrip(v.shapes[i]).ban
              ? 2
              : shapeMissingDefiningTones(v.shapes[i], notes, r)
                ? 1
                : 0;
            const tier = std
              ? (m === 'anchor' || anchorSet.has(v.shapes[i].join(','))) ? 0.5
                : m === 'open' ? 1
                : m === 'caged' ? 2
                : 3
              : m === 'open' || m === 'caged' ? 1 : 2;
            return cls === 0 ? tier : cls === 1 ? tier + 3 : 7;
          };
          // Чистая оценка без фор — просадка очков между блоками
          // одной ступени не бывает; границы ступеней — законные швы.
          const eff = sc;
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
          const frames = v.shapes.map(famFrame);
          const sameFam = (i, j) =>
            frames[i].bass === frames[j].bass &&
            Math.abs(frames[i].lo - frames[j].lo) <= 1 &&
            Math.abs(frames[i].hi - frames[j].hi) <= 1 &&
            famDist(v.shapes[i], v.shapes[j]) <= 1.5;
          // Отложенный дубль семейства: якорь-семья выше в списке.
          const deferred = (j) => {
            for (let k = 0; k < j; k++) {
              const mk = v.methods[k];
              if (mk === 'user' || mk === 'derived') continue;
              if (sameFam(k, j)) return true;
            }
            return false;
          };
          let keyBad = false;
          let scoreBad = false;
          const isAuto = (m) => m === 'modified' || m === 'fallback';
          const inPool = (m) =>
            std ? m === 'open' || isAuto(m) || m === 'caged' : isAuto(m);
          for (let i = 1; i < sc.length; i++) {
            const ka = key(i - 1);
            const kb = key(i);
            // Разнообразие рамок откладывает дубль семейства ниже
            // поздних представителей — на такой границе ключ siftRank
            // законно качнётся (дубль мог быть валидной заготовкой).
            if (kb < ka && !deferred(i - 1) && !deferred(i)) {
              keyBad = true;
              break;
            }
            // Монотонность пула по чистой оценке (уточнённая волна-4:
            // форы caged больше нет). Отложенные дубли семейств законно
            // сидят ниже — такие пары пропускаем.
            if (
              !keyBad &&
              kb === ka &&
              inPool(v.methods[i - 1]) &&
              inPool(v.methods[i]) &&
              !deferred(i - 1) &&
              !deferred(i) &&
              eff[i] > eff[i - 1] + 0.001
            ) {
              scoreBad = true;
              break;
            }
          }
          if (keyBad) {
            tierBad++;
            if (broken.length < 3)
              broken.push(`${id} ${c} блоки: ${v.methods.slice(0, 8).join(',')}`);
          }
          if (!keyBad && scoreBad) {
            tailBad++;
            if (broken.length < 3)
              broken.push(`${id} ${c} хвост: ...${sc.slice(0, 6).map((x) => x.toFixed(1)).join(' ')}`);
          }
          // 3. для контрольной проверки в стандартном строе.
          let ordered = true;
          for (let i = 1; i < sc.length; i++)
            if (sc[i] > sc[i - 1] + 0.001) {
              ordered = false;
              break;
            }
          if (ordered) desc++;
        }
      out[id] = { desc, checked, tierBad, tailBad };
    }
    tunerTuningId = 'e-std';
    fingeringCache.clear();
    return { out, broken };
  });
  Object.entries(order.out).forEach(([id, v]) =>
    console.log(
      `      ${id.padEnd(8)} аккордов: ${v.checked}, ключи перемешаны: ${v.tierBad}, оценки в классе неубывательны сбиты: ${v.tailBad}`
    )
  );
  Object.entries(order.out).forEach(([id, v]) =>
    ok(`${id}: ступени и классы не перемешаны`, v.tierBad === 0, `смешано у ${v.tierBad}`)
  );
  Object.entries(order.out).forEach(([id, v]) =>
    ok(`${id}: внутри класса хвост по убыванию оценки`, v.tailBad === 0, `нарушено у ${v.tailBad}`)
  );
  ok('примеры нарушений пусты', order.broken.length === 0, order.broken.join(' | '));
  // Стандартный строй: ступени отличаются от «всё по оценке» — открытая
  // форма идёт вперёд на своей ступени независимо от баллов, и полное
  // совпадение с чистой сортировкой означало бы, что стена молча
  // отключилась.
  ok(
    'в стандартном строе ступени на месте',
    order.out['e-std'].desc < order.out['e-std'].checked,
    `${order.out['e-std'].desc}/${order.out['e-std'].checked} по оценке целиком`
  );

  console.log('=== 5б. Разброс не больше четырёх ладов ===');
  // Правило общее для всего приложения, но в tryCagedVariants стоял
  // порог 5. В стандартном строе это ничего не меняло — шаблоны CAGED
  // компактны. В чужом строе заготовка растягивается при переносе, и
  // через щель пролезало x,10,7,5,6,7 (Open G, F).
  const spread = await p.evaluate(() => {
    const roots = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const sfx = ['', 'm', '7', 'm7', 'maj7', 'sus2', 'sus4', 'dim', 'aug', '6', 'm6', '9', '5', 'add9'];
    const bad = [];
    let total = 0;
    for (const id of ['e-std', 'drop-d', 'drop-c', 'open-g', 'dadgad', 'eb-std', 'open-d']) {
      if (!TUNER_TUNINGS.some((t) => t.id === id)) continue;
      tunerTuningId = id;
      tunerCustomNotes = null;
      fingeringCache.clear();
      for (const r of roots)
        for (const s of sfx) {
          const v = window.getFingeringVariants(r + s, 'C');
          v.shapes.forEach((sh, i) => {
            total++;
            const f = sh.filter((x) => typeof x === 'number' && x > 0);
            if (!f.length) return;
            const sp = Math.max(...f) - Math.min(...f);
            if (sp > 4) bad.push(`${id} ${r + s} ${sh.join(',')} sp=${sp} ${v.methods[i]}`);
          });
        }
    }
    tunerTuningId = 'e-std';
    fingeringCache.clear();
    return { total, count: bad.length, sample: bad.slice(0, 4) };
  });
  console.log(`      проверено форм: ${spread.total}`);
  ok('ни одной формы с разбросом больше 4 ладов', spread.count === 0, spread.sample.join(' | '));

  console.log('=== 6. Выбор в ячейке привязан к строю ===');
  const pinned = await p.evaluate(() => {
    const out = {};
    tunerTuningId = 'e-std';
    tunerCustomNotes = null;
    fingeringCache.clear();
    // Форма НАРОЧНО не совпадает с вариантом по умолчанию ни в одном
    // из двух строёв: иначе «выбор не подставился» и «подставился»
    // выглядят одинаково. Легальная для Am (ни одной чужой ноты):
    // голый pin на событии resolve валидирует через shapeMatchesChord,
    // поэтому старая x,0,2,2,1,3 (с чужой нотой G) больше не подходит.
    const ev = { chord: 'Am', span: 1 };
    setPreferredFingering(null, '5,7,7,5,5,5', ev);
    out.stamp = ev.fingeringTuning || '';
    out.stdResolved = (resolveFingeringShape('Am', 'C', null, ev) || []).join(',');
    tunerTuningId = 'drop-d';
    fingeringCache.clear();
    out.dropResolved = (resolveFingeringShape('Am', 'C', null, ev) || []).join(',');
    out.stillStored = ev.fingering;
    tunerTuningId = 'e-std';
    fingeringCache.clear();
    out.backResolved = (resolveFingeringShape('Am', 'C', null, ev) || []).join(',');
    return out;
  });
  ok('в стандартном строе подписи нет', pinned.stamp === '', pinned.stamp);
  ok('выбор действует в своём строе', pinned.stdResolved === '5,7,7,5,5,5', pinned.stdResolved);
  ok('в Drop D выбор не подставляется', pinned.dropResolved !== '5,7,7,5,5,5', pinned.dropResolved);
  ok('но и не стёрт', pinned.stillStored === '5,7,7,5,5,5', String(pinned.stillStored));
  ok('вернулся строй — вернулся выбор', pinned.backResolved === '5,7,7,5,5,5', pinned.backResolved);

  console.log('=== 7. Сохранение и загрузка ===');
  const round = await p.evaluate(async () => {
    const out = {};
    tunerTuningId = 'drop-d';
    tunerCustomNotes = null;
    fingeringCache.clear();
    userFingerings.clear();
    userFingerings.set(buildFingeringChordKey('Am', 'C'), [[5, 0, 2, 2, 1, 0]]);
    sections = [{ id: 1, type: 'Verse', repeat: 1, squares: [{ id: 1, repeat: 1,
      events: [{ chord: 'Am', span: 4 }] }] }];
    nextId = 9;
    const ev = sections[0].squares[0].events[0];
    setPreferredFingering(null, '5,0,2,2,1,0', ev);
    document.getElementById('songTitle').value = 'tuning-forms-' + Date.now();
    saveCurrentSong();
    const songs = JSON.parse(localStorage.getItem('struchord_songs') || '[]');
    const last = songs[songs.length - 1];
    out.savedTuning = last.tuning;
    out.savedUserKey = (last.userFingerings[0] || [])[0];
    out.savedStamp = last.sections[0].squares[0].events[0].fingeringTuning;
    return out;
  });
  ok('строй записан в файл', round.savedTuning === 'drop-d', round.savedTuning);
  ok('ключ своей формы помечен строем', round.savedUserKey === 'Am|C@D2A2D3G3B3E4', String(round.savedUserKey));
  ok('выбор в ячейке помечен строем', round.savedStamp === '@D2A2D3G3B3E4', String(round.savedStamp));

  const p2 = await b.newPage();
  p2.on('dialog', (d) => d.accept());
  await p2.goto('file:///home/user/STRUCHORD.html', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await new Promise((r) => setTimeout(r, 800));
  const back = await p2.evaluate(() => {
    const songs = JSON.parse(localStorage.getItem('struchord_songs') || '[]');
    const idx = songs.findIndex((s) => String(s.name).startsWith('tuning-forms-'));
    loadSong(idx);
    const out = {};
    out.tuning = tunerTuningId;
    out.userKey = [...userFingerings.keys()][0];
    const ev = sections[0].squares[0].events[0];
    out.stamp = ev.fingeringTuning;
    out.resolved = (resolveFingeringShape('Am', 'C', null, ev) || []).join(',');
    return out;
  });
  ok('строй восстановлен', back.tuning === 'drop-d', back.tuning);
  ok('ключ своей формы пережил круг', back.userKey === 'Am|C@D2A2D3G3B3E4', String(back.userKey));
  ok('подпись выбора пережила круг', back.stamp === '@D2A2D3G3B3E4', String(back.stamp));
  ok('форма подставляется после загрузки', back.resolved === '5,0,2,2,1,0', back.resolved);

  console.log('=== 8. Старый файл без подписей ===');
  const legacy = await p2.evaluate(() => {
    const songs = JSON.parse(localStorage.getItem('struchord_songs') || '[]');
    const idx = songs.findIndex((s) => String(s.name).startsWith('tuning-forms-'));
    const old = JSON.parse(JSON.stringify(songs[idx]));
    old.name = 'legacy-' + Date.now();
    // Так выглядели файлы до этой правки: строй есть, подписей нет.
    old.userFingerings = [['Am|C', [[5, 0, 2, 2, 1, 0]]]];
    delete old.sections[0].squares[0].events[0].fingeringTuning;
    songs.push(old);
    localStorage.setItem('struchord_songs', JSON.stringify(songs));
    loadSong(songs.length - 1);
    const ev = sections[0].squares[0].events[0];
    return {
      tuning: tunerTuningId,
      userKey: [...userFingerings.keys()][0],
      stamp: ev.fingeringTuning,
      resolved: (resolveFingeringShape('Am', 'C', null, ev) || []).join(','),
    };
  });
  ok('ключ старого файла подписан строем песни', legacy.userKey === 'Am|C@D2A2D3G3B3E4', String(legacy.userKey));
  ok('выбор старого файла подписан', legacy.stamp === '@D2A2D3G3B3E4', String(legacy.stamp));
  ok('и работает', legacy.resolved === '5,0,2,2,1,0', legacy.resolved);

  ok('ошибок на странице нет', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(bad ? `\nПРОВАЛОВ: ${bad}` : '\nвсе проверки пройдены');
  process.exit(bad ? 1 : 0);
})();
