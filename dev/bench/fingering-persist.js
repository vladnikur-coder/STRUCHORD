// Выбранная аппликатура не должна слетать от посторонних правок.
//
// Дефект нашёл пользователь, записывая Every Breath You Take: аккорды
// добавляются в хаотичном порядке, переименовываются, ресайзятся — и
// сохранённые аппликатуры сбрасывались.
//
// Причина: выбор жил только в preferredFingeringByChord под ключом
// `аккорд|тональность|секция|квадрат|ИНДЕКС`. Четыре части ключа меняются
// от действий, к аппликатуре отношения не имеющих. Замер до правки:
//
//     смена тональности вручную ..... ПОТЕРЯ
//     вставка ячейки ПЕРЕД выбранной  ПОТЕРЯ
//     удаление ячейки перед ней ..... ПОТЕРЯ
//     добавление секции ............. ПОТЕРЯ (сменилась автотональность)
//     транспонирование .............. ПОТЕРЯ
//
// Решение: форма хранится на самом событии (ev.fingering). Объект
// события переживает переиндексацию и смену тональности.
const puppeteer = require('/home/user/node_modules/puppeteer');
let bad = 0;
const t = (n, c, x = '') => { if (c) console.log('   ok  ', n, x); else { bad++; console.log('  FAIL ', n, x); } };

(async () => {
  const br = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const p = await br.newPage();
  p.setDefaultTimeout(60000);
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).split('\n')[0]));
  await p.setViewport({ width: 1400, height: 950 });
  await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1200));

  // Every Breath You Take: D Bm G A. Метим событие Bm флагом __track —
  // следить по индексу нельзя, он и есть то, что ломается.
  const setup = () => p.evaluate(() => {
    sections = [{ id: 1, type: 'Verse', repeat: 1, squares: [{ id: 1, repeat: 1,
      events: [{ chord: 'D', span: 4 }, { chord: 'Bm', span: 4 },
        { chord: 'G', span: 4 }, { chord: 'A', span: 4 }] }] }];
    nextId = 9; keyMode = 'auto'; render();
    const posKey = buildFingeringPositionKey('Bm', globalKey, 1, 1, 1);
    const v = window.getFingeringVariants('Bm', globalKey).shapes;
    // Берём форму БЕЗ открытых струн, а не просто третью по списку:
    // проверка ниже ждёт сдвиг всех струн ровно на один лад, а открытая
    // струна по грифу не двигается — transposeFingeringShape честно
    // отказывается её переносить. Раньше третьей случайно оказывалась
    // подходящая форма, после смены порядка вариантов — уже нет.
    const movable = v.find((sh) => sh.every((f) => f !== 0)) || v[2];
    setPreferredFingering(posKey, movable.join(','));
    sections[0].squares[0].events[1].__track = true;
    return { key: globalKey, shape: v[2].join(',') };
  });

  const shown = () => p.evaluate(() => {
    let found = null;
    sections.forEach((sec) => sec.squares.forEach((sq) => sq.events.forEach((ev, i) => {
      if (ev.__track) found = { ev, secId: sec.id, sqId: sq.id, i,
        key: sec.key || globalKey };
    })));
    if (!found) return { пропало: true };
    const posKey = buildFingeringPositionKey(found.ev.chord, found.key,
      found.secId, found.sqId, found.i);
    const shape = resolveFingeringShape(found.ev.chord, found.key, posKey, found.ev);
    return { аккорд: found.ev.chord, индекс: found.i,
      наСобытии: found.ev.fingering || null,
      показывает: (shape || []).join(',') };
  });

  const cases = [
    ['смена тональности вручную', () => { DOM.rootKey.value = 'F'; onKeyChange(); }, 'same'],
    ['переименование соседа', () => { sections[0].squares[0].events[0].chord = 'Dmaj7'; render(); }, 'same'],
    ['вставка ячейки ПЕРЕД', () => { sections[0].squares[0].events.splice(1, 0, { chord: 'Em', span: 4 }); render(); }, 'same'],
    ['удаление ячейки перед', () => { sections[0].squares[0].events.splice(0, 1); render(); }, 'same'],
    ['ресайз', () => { sections[0].squares[0].events[1].span = 2; render(); }, 'same'],
    ['добавление секции', () => { sections.push({ id: 99, type: 'Chorus', repeat: 1,
      squares: [{ id: 99, repeat: 1, events: [{ chord: 'A', span: 4 }] }] }); render(); }, 'same'],
    ['удаление другой секции', () => { sections.push({ id: 98, type: 'Solo', repeat: 1,
      squares: [{ id: 98, repeat: 1, events: [{ chord: 'E', span: 4 }] }] }); render();
      sections = sections.filter((s) => s.id !== 98); render(); }, 'same'],
    // Смена размера ПЕРЕСОЗДАЁТ события (migrateEventsForTimeSig), и метка
    // __track на них не переживает. Ищем по аккорду — для этой проверки
    // достаточно: важно, что fingering перенёсся на новый объект.
    ['смена размера 4/4 -> 8/8', () => {
      DOM.globalTimeSig.value = '8/8'; onGlobalTimeSigChange();
      sections.forEach((sec) => sec.squares.forEach((sq) => sq.events.forEach((ev) => {
        if (ev.chord === 'Bm') ev.__track = true;
      })));
    }, 'same'],
  ];

  console.log('=== 1. Выбор переживает посторонние правки ===');
  for (const [name, fn, mode] of cases) {
    await setup();
    await new Promise((r) => setTimeout(r, 400));
    const before = await shown();
    await p.evaluate(fn);
    await new Promise((r) => setTimeout(r, 600));
    const after = await shown();
    const ok = mode === 'same'
      ? before.показывает === after.показывает && !!after.наСобытии
      : true;
    t(name, ok, `${before.показывает} -> ${after.показывает} (аккорд «${after.аккорд}», индекс ${after.индекс})`);
  }

  console.log('\n=== 2. Транспонирование двигает форму по грифу ===');
  await setup();
  await new Promise((r) => setTimeout(r, 400));
  const beforeT = await shown();
  await p.evaluate(() => transposeAllGlobal(1));
  await new Promise((r) => setTimeout(r, 600));
  const afterT = await shown();
  console.log(`      ${beforeT.аккорд} ${beforeT.показывает}  ->  ${afterT.аккорд} ${afterT.показывает}`);
  const shift = (a, b) => {
    const pa = a.split(','), pb = b.split(',');
    if (pa.length !== 6 || pb.length !== 6) return null;
    const d = [];
    for (let i = 0; i < 6; i++) {
      if (pa[i] === 'x' && pb[i] === 'x') continue;
      if (pa[i] === 'x' || pb[i] === 'x') return null;
      d.push(+pb[i] - +pa[i]);
    }
    return d.every((x) => x === d[0]) ? d[0] : null;
  };
  t('аккорд транспонирован', afterT.аккорд === 'Cm', afterT.аккорд);
  t('форма сдвинута ровно на 1 лад', shift(beforeT.показывает, afterT.показывает) === 1,
    `сдвиг ${shift(beforeT.показывает, afterT.показывает)}`);
  t('выбор остался на событии', !!afterT.наСобытии, afterT.наСобытии);

  console.log('\n=== 3. Формы с открытыми струнами при транспонировании снимаются ===');
  // Открытую струну сдвинуть нельзя: 0 — конкретная нота, а не лад.
  const openCase = await p.evaluate(() => {
    const withOpen = transposeFingeringShape('x,0,2,2,1,0', 2);
    const barre = transposeFingeringShape('7,x,x,7,7,7', 2);
    const tooHigh = transposeFingeringShape('14,x,x,14,14,14', 3);
    const tooLow = transposeFingeringShape('2,x,x,2,2,2', -5);
    return { withOpen, barre, tooHigh, tooLow };
  });
  console.log('   ', JSON.stringify(openCase));
  t('форма с открытыми струнами не переносится', openCase.withOpen === null);
  t('баррэ сдвигается', openCase.barre === '9,x,x,9,9,9', openCase.barre);
  t('за 15-й лад не уходим', openCase.tooHigh === null);
  t('за порожек не уходим', openCase.tooLow === null);

  console.log('\n=== 4. Выбор переживает сохранение/загрузку ===');
  await setup();
  await new Promise((r) => setTimeout(r, 400));
  // Полный круг: сохранить в localStorage, сбросить, загрузить обратно.
  const roundTrip = await p.evaluate(async () => {
    localStorage.removeItem('struchord_songs');
    saveCurrentSong();
    await new Promise((r) => setTimeout(r, 400));
    const raw = JSON.parse(localStorage.getItem('struchord_songs') || '[]');
    const inJson = raw[0] && raw[0].sections[0].squares[0].events[1].fingering;
    // Стираем состояние и загружаем заново.
    sections = [];
    preferredFingeringByChord.clear();
    render();
    loadSong(0);
    await new Promise((r) => setTimeout(r, 500));
    const ev = sections[0].squares[0].events[1];
    const posKey = buildFingeringPositionKey(ev.chord, globalKey, 1, 1, 1);
    return { вJSON: inJson || null,
      послеЗагрузки: ev.fingering || null,
      показывает: (resolveFingeringShape(ev.chord, globalKey, posKey, ev) || []).join(',') };
  });
  console.log('   ', JSON.stringify(roundTrip));
  t('форма попала в JSON', !!roundTrip.вJSON, String(roundTrip.вJSON));
  t('и вернулась после загрузки', roundTrip.послеЗагрузки === roundTrip.вJSON,
    `${roundTrip.вJSON} -> ${roundTrip.послеЗагрузки}`);
  t('загруженная песня показывает её', roundTrip.показывает === roundTrip.вJSON,
    roundTrip.показывает);

  console.log('\n=== 5. Клон секции уносит выбор ===');
  await setup();
  await new Promise((r) => setTimeout(r, 400));
  const cloned = await p.evaluate(() => {
    cloneSection(1);
    const last = sections[sections.length - 1];
    return { всегоСекций: sections.length,
      уКлона: last.squares[0].events[1].fingering || null };
  });
  console.log('   ', JSON.stringify(cloned));
  t('клон унёс выбранную форму', !!cloned.уКлона, String(cloned.уКлона));

  console.log('\n=== 6. НАВЕДЕНИЕ мышью не затирает выбор ===');
  // Главный дефект, найденный по журналу пользователя. hideFingeringTooltip
  // записывал «то, что тултип показывал». Если тультип не нашёл выбор по
  // устаревшему ключу (тональность поменялась сама) — он показывал
  // variants[0] и при закрытии затирал им правильную форму. Ничего не
  // редактируя, просто водя мышью.
  await p.evaluate(() => {
    sections = [{ id: 1, type: 'Verse', repeat: 1, squares: [{ id: 2, repeat: 1,
      events: [{ chord: 'Aadd9', span: 4 }, { chord: 'F#madd9', span: 4 }] }] }];
    nextId = 9; keyMode = 'auto'; render();
  });
  await new Promise((r) => setTimeout(r, 500));
  await p.evaluate(() => {
    const sq = sections[0].squares[0];
    setPreferredFingering(buildFingeringPositionKey('Aadd9', globalKey, 1, 2, 0), '5,7,9,6,x,x', sq.events[0]);
    setPreferredFingering(buildFingeringPositionKey('F#madd9', globalKey, 1, 2, 1), '2,4,6,2,x,x', sq.events[1]);
  });
  // Добавляем аккорды — автотональность уедет с F#m на A.
  for (const ch of ['D', 'D', 'E', 'E', 'A']) {
    await p.evaluate((c) => { sections[0].squares[0].events.push({ chord: c, span: 4 }); render(); }, ch);
    await new Promise((r) => setTimeout(r, 200));
  }
  const keyMoved = await p.evaluate(() => globalKey);
  t('автотональность действительно сменилась', keyMoved === 'A', keyMoved);
  // Водим мышью по ячейкам — ничего не редактируем.
  //
  // Порядок важен: сначала ячейка 1, потом 0. Дефект срабатывал на
  // ВТОРОЙ ячейке, когда тултип уже был открыт для первой и шёл по
  // ветке «уже виден» — там форма бралась по устаревшему ключу.
  // Диалог смены тональности может перехватывать мышь — убираем.
  await p.evaluate(() => {
    document.querySelectorAll('.key-change-confirm-overlay').forEach((el) => el.remove());
  });
  for (const i of [1, 0, 1, 0]) {
    const pt = await p.evaluate((k) => {
      const el = document.querySelectorAll('.chord-wrapper')[k];
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    }, i);
    await p.mouse.move(8, 8);
    await new Promise((r) => setTimeout(r, 300));
    await p.mouse.move(pt.x, pt.y, { steps: 6 });
    await new Promise((r) => setTimeout(r, 1100));
  }
  const afterHover = await p.evaluate(() => ({
    ф0: sections[0].squares[0].events[0].fingering,
    ф1: sections[0].squares[0].events[1].fingering,
  }));
  console.log('   ', JSON.stringify(afterHover));
  t('Aadd9 сохранил форму', afterHover.ф0 === '5,7,9,6,x,x', String(afterHover.ф0));
  t('F#madd9 сохранил форму', afterHover.ф1 === '2,4,6,2,x,x', String(afterHover.ф1));

  console.log('\n=== 7. Стрелки вариантов по-прежнему работают ===');
  // Уводим курсор и гасим тултип от предыдущего раздела: если он остался
  // видимым, showFingeringTooltip пойдёт по ветке «уже виден» и не будет
  // перерисовывать кнопки — стенд их не найдёт.
  await p.mouse.move(8, 8);
  await p.evaluate(() => {
    hideFingeringTooltip(false);
    hideFingeringTooltip(true);
    // Диалог подтверждения смены тональности из раздела 1 остаётся на
    // экране и перехватывает мышь — ячейка под ним недостижима.
    document.querySelectorAll('.key-change-confirm-overlay').forEach((el) => el.remove());
  });
  await new Promise((r) => setTimeout(r, 500));
  await p.evaluate(() => {
    sections = [{ id: 1, type: 'Verse', repeat: 1, squares: [{ id: 1, repeat: 1,
      events: [{ chord: 'Am', span: 4 }, { chord: 'C', span: 4 }] }] }];
    nextId = 9; render();
  });
  await new Promise((r) => setTimeout(r, 500));
  const c0 = await p.evaluate(() => {
    const el = document.querySelectorAll('.chord-wrapper')[0];
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
      подЭтойТочкой: (() => {
        const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return e ? (e.className || e.tagName).toString().slice(0, 40) : null;
      })() };
  });
  console.log('      цель:', JSON.stringify(c0));
  // Несколько промежуточных точек: одиночный прыжок мыши иногда не даёт
  // mouseover, если курсор уже стоял рядом.
  await p.mouse.move(c0.x - 60, c0.y - 60, { steps: 4 });
  await new Promise((r) => setTimeout(r, 200));
  await p.mouse.move(c0.x, c0.y, { steps: 8 });
  // Тултип появляется с задержкой и дорисовывает кнопки следующим
  // кадром — ждём именно кнопку, а не фиксированное время.
  await p.waitForSelector('#fingering-tooltip .tooltip-nav-right', { timeout: 5000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 300));
  const arrow = await p.evaluate(() => {
    const b = document.querySelector('#fingering-tooltip .tooltip-nav-right');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });
  if (!arrow) {
    console.log('   диагностика:', JSON.stringify(await p.evaluate(() => {
      const t = document.getElementById('fingering-tooltip');
      return { display: t.style.display, visible: t.classList.contains('visible'),
        кнопок: t.querySelectorAll('button').length,
        закреплено: typeof isFingeringPinned === 'function' ? isFingeringPinned() : '?',
        галка: document.getElementById('showFingering')?.checked,
        лента: typeof timelineMode !== 'undefined' ? timelineMode : '?',
        ячеек: document.querySelectorAll('.chord-wrapper').length };
    })));
  }
  if (arrow) {
    await p.mouse.click(arrow.x, arrow.y);
    await new Promise((r) => setTimeout(r, 500));
    const picked = await p.evaluate(() => sections[0].squares[0].events[0].fingering || null);
    t('выбор стрелкой записан', !!picked, String(picked));
    await p.mouse.move(8, 8);
    await new Promise((r) => setTimeout(r, 500));
    await p.mouse.move(c0.x, c0.y);
    await new Promise((r) => setTimeout(r, 1000));
    const kept = await p.evaluate(() => sections[0].squares[0].events[0].fingering || null);
    t('и пережил повторное наведение', kept === picked, `${picked} -> ${kept}`);
  } else {
    t('стрелка найдена', false, 'нет .tooltip-nav-right');
  }

  t('ошибок страницы нет', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё зелено');
  await br.close();
  process.exit(bad ? 1 : 0);
})();
