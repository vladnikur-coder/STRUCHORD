// Стенд: общий ритм поделённых ячеек при РЕАЛЬНОЙ протяжке ручки мышью
// (волна «нарезка при ресайзе», 2026-08-22). Дословная спека:
// D_DU_UDU -> «+» -> D_DU|_UDU -> -1/8 -> D_D|U_UDU; на 16-х:
// D___D_U___U_D_U_ -> «+» -> ... -> -1/16 -> D___D_U|___U_D_U_.
// Данные проверяются после отпускания кнопки мыши — то, что реально
// получит пользователь, а не промежуточный кадр.
// Волна-4: кэша у событий нет — read() читает звучащую проекцию (окно
// рулона через rhythmSoundingForEvent), а «меткой» служит id рулона из
// refs (связанность = тождество рулона).
const puppeteer = require('puppeteer');
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1400, height: 800 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).split('\n')[0]));
  await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 900));

  const setup = async (zoom, events) => {
    await p.evaluate((z, ev) => {
      sections = []; globalTimeSig = '4/4'; addSection('Verse');
      sections[0].squares[0].events = ev;
      setSquareZoom(1); render(); setSquareZoom(z); render();
    }, zoom, events);
    await new Promise((r) => setTimeout(r, 300));
  };
  const splitFirst = async () => {
    await p.evaluate(() => {
      addChordAfter(sections[0].id, sections[0].squares[0].id, 0);
      render();
    });
    await new Promise((r) => setTimeout(r, 250));
  };
  const read = () => p.evaluate(() => {
    const sec = sections[0], sq = sec.squares[0];
    return sq.events.map((e, i) => {
      const p = rhythmSoundingForEvent(sec, sq, e, i);
      const ref = songRhythmRolls && songRhythmRolls.refs.get(rhythmRefKey(sec.id, sq.id, i));
      return {
        span: e.span,
        steps: p ? p.steps.map((s) => (Array.isArray(s) ? s.join('+') : s)).join('') : null,
        sub: p ? p.subdivision || 1 : 0,
        gid: ref ? ref.roll : null, // id рулона — современная «метка»
      };
    });
  });
  const innerW = () => p.evaluate(() => Math.round(document.querySelector('.square-inner').getBoundingClientRect().width));

  const dragNth = async (n, dx) => {
    const hs = await p.$$('.resize-handle');
    if (!hs[n]) return 'нет ручки #' + n;
    await p.evaluate((i) => {
      document.querySelectorAll('.resize-handle')[i]
        .scrollIntoView({ block: 'nearest', inline: 'center' });
    }, n);
    await new Promise((r) => setTimeout(r, 220));
    const box = await hs[n].boundingBox();
    if (!box) return 'ручка #' + n + ' не видна';
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await p.mouse.move(x, y); await p.mouse.down();
    const steps = Math.max(6, Math.min(30, Math.abs(Math.round(dx / 5))));
    for (let i = 1; i <= steps; i++) {
      await p.mouse.move(x + dx * i / steps, y);
      await new Promise((r) => setTimeout(r, 8));
    }
    await new Promise((r) => setTimeout(r, 60));
    await p.mouse.up(); await new Promise((r) => setTimeout(r, 320));
    return null;
  };

  let fails = 0;
  const eq = (label, got, want) => {
    const good = JSON.stringify(got) === JSON.stringify(want);
    if (!good) fails++;
    console.log(`${good ? 'ok' : 'ПЛОХО'.padEnd(5)} ${label}`);
    console.log(`       получено: ${JSON.stringify(got)}`);
    if (!good) console.log(`       ждали:    ${JSON.stringify(want)}`);
  };
  const pat = (sub, text, gid) => {
    const o = { mode: 'strum', subdivision: sub, steps: text.split('') };
    if (gid) o.rhythmGroup = gid;
    return o;
  };
  const pad = [{ chord: '', span: 4 }, { chord: '', span: 4 }, { chord: '', span: 4 }];

  console.log('=== A. Спека: D_DU_UDU -> деление ===');
  await setup(1, [{ chord: 'C', span: 4, timeSig: null, strumPattern: pat(2, 'D_DU_UDU') }, ...pad]);
  await splitFirst();
  let r = await read();
  eq('A доли и рисунки половин',
    [r[0].span, r[1].span, r[0].steps, r[1].steps, r[0].gid !== null && r[0].gid === r[1].gid],
    [2, 2, 'D_DU', '_UDU', true]);

  console.log('=== B. Зум 1.5, тянем границу влево на восьмую ===');
  await setup(1.5, [{ chord: 'C', span: 4, timeSig: null, strumPattern: pat(2, 'D_DU_UDU') }, ...pad]);
  await splitFirst();
  let beatPx = (await innerW()) / 16;
  let err = await dragNth(0, -Math.round(beatPx * 0.5));
  if (err) { fails++; console.log('ОШИБКА ' + err); }
  r = await read();
  eq('B -1/8: D_D|U_UDU',
    [r[0].span, r[1].span, r[0].steps, r[1].steps],
    [1.5, 2.5, 'D_D', 'U_UDU']);

  console.log('=== C. Назад вправо на восьмую ===');
  err = await dragNth(0, Math.round(beatPx * 0.5));
  if (err) { fails++; console.log('ОШИБКА ' + err); }
  r = await read();
  eq('C назад: D_DU|_UDU',
    [r[0].span, r[1].span, r[0].steps, r[1].steps],
    [2, 2, 'D_DU', '_UDU']);

  console.log('=== D. Ещё вправо на восьмую ===');
  err = await dragNth(0, Math.round(beatPx * 0.5));
  if (err) { fails++; console.log('ОШИБКА ' + err); }
  r = await read();
  eq('D +1/8: D_DU_|UDU',
    [r[0].span, r[1].span, r[0].steps, r[1].steps],
    [2.5, 1.5, 'D_DU_', 'UDU']);

  console.log('=== E. Зум 2.5, шестнадцатые, влево на 1/16 ===');
  await setup(2.5, [{ chord: 'C', span: 4, timeSig: null, strumPattern: pat(4, 'D___D_U___U_D_U_') }, ...pad]);
  await splitFirst();
  beatPx = (await innerW()) / 16;
  err = await dragNth(0, -Math.round(beatPx * 0.25));
  if (err) { fails++; console.log('ОШИБКА ' + err); }
  r = await read();
  eq('E -1/16: D___D_U|___U_D_U_',
    [r[0].span, r[1].span, r[0].steps, r[1].steps],
    [1.75, 2.25, 'D___D_U', '___U_D_U_']);

  console.log('=== F. Чужие соседи: протяжка сшивает пару в сквозную ленту (волна-5) ===');
  await setup(1.5, [
    { chord: 'C', span: 4, timeSig: null, strumPattern: pat(2, 'D_D_D_D_') },
    { chord: 'G', span: 4, timeSig: null, strumPattern: pat(2, 'U_U_U_U_') },
    ...pad.slice(0, 2),
  ]);
  beatPx = (await innerW()) / 16;
  err = await dragNth(0, -Math.round(beatPx * 0.5));
  if (err) { fails++; console.log('ОШИБКА ' + err); }
  r = await read();
  eq('F доли сдвинулись', [r[0].span, r[1].span], [3.5, 4.5]);
  // Волна-5: пара сшита в одну ленту по долям до жеста, обе читают её
  // позиционно — удары стоят на месте, ползёт только граница: пауза на
  // доле 3.5 (шаг 7) доигрывает уже в правой ячейке. На mouseup — два
  // приватных рулона с тем же звуком.
  eq('F рисунки — лента от границы, рулоны приватные', [r[0].steps, r[1].steps, r[0].gid !== r[1].gid],
    ['D_D_D_D', '_U_U_U_U_', true]);

  console.log('=== G. Редактор ритма не рвёт связь (сохранение без правок) ===');
  await setup(1.5, [{ chord: 'C', span: 4, timeSig: null, strumPattern: pat(2, 'D_DU_UDU') }, ...pad]);
  await splitFirst();
  beatPx = (await innerW()) / 16;
  await dragNth(0, -Math.round(beatPx * 0.5));
  const gidBefore = await p.evaluate(() => {
    const ref = songRhythmRolls.refs.get(rhythmRefKey(sections[0].id, sections[0].squares[0].id, 0));
    return ref && ref.roll;
  });
  await p.evaluate(() => {
    openStrumPatternEditor('event', sections[0].id, sections[0].squares[0].id, 0);
  });
  await new Promise((r2) => setTimeout(r2, 400));
  await p.evaluate(() => document.querySelector('#save-pattern').click());
  await new Promise((r2) => setTimeout(r2, 300));
  const afterG = await p.evaluate(() => {
    const sq = sections[0].squares[0];
    const ref = songRhythmRolls.refs.get(rhythmRefKey(sections[0].id, sq.id, 0));
    const p2 = rhythmSoundingForEvent(sections[0], sq, sq.events[0], 0);
    return { gid: ref ? ref.roll : null, steps: p2 ? p2.steps.join('') : null };
  });
  eq('G рулон и рисунок пережили редактор', [!!afterG.gid && afterG.gid === gidBefore, afterG.steps], [true, 'D_D']);

  console.log('=== H. Спека-2: связанная пара, тянем на 1/16 при восьмых ===');
  // D_DU|_UDU (sub 2), зум 2.5, граница влево на шестнадцатую: сетка
  // пары утончается до 16-х, рисунок пересекается удар+пустой шаг.
  await setup(2.5, [{ chord: 'C', span: 4, timeSig: null, strumPattern: pat(2, 'D_DU_UDU') }, ...pad]);
  await splitFirst();
  beatPx = (await innerW()) / 16;
  err = await dragNth(0, -Math.round(beatPx * 0.25));
  if (err) { fails++; console.log('ОШИБКА ' + err); }
  r = await read();
  eq('H -1/16: D___D_U|___U_D_U_, sub 4',
    [r[0].span, r[1].span, r[0].steps, r[1].steps, r[0].sub, r[1].sub, r[0].gid !== null && r[0].gid === r[1].gid],
    [1.75, 2.25, 'D___D_U', '___U_D_U_', 4, 4, true]);

  console.log('=== I. Своя ячейка + наследующий сосед: наследник застывает (волна-5) ===');
  // Записанный D_D_D_D_ у левой, правая пустая (наследует X_X_X_X_
  // квадрата). Тянем влево на восьмую: при касании границы правая
  // получает свой срез фасада по долям до жеста (inherit_freeze) —
  // звук прежний, а дальше за боем квадрата она уже не следует.
  await p.evaluate(() => {
    sections = []; globalTimeSig = '4/4'; addSection('Verse');
    sections[0].squares[0].events = [
      { chord: 'C', span: 4, timeSig: null, strumPattern: { mode: 'strum', subdivision: 2, steps: 'D_D_D_D_'.split('') } },
      { chord: '', span: 4 }, { chord: '', span: 4 }, { chord: '', span: 4 }, { chord: '', span: 4 },
    ];
    sections[0].squares[0].strumPattern = { mode: 'strum', subdivision: 2, steps: 'X_X_X_X_'.split('') };
    setSquareZoom(1); render(); setSquareZoom(1.5); render();
  });
  await new Promise((r2) => setTimeout(r2, 300));
  beatPx = (await innerW()) / 20;
  err = await dragNth(0, -Math.round(beatPx * 0.5));
  if (err) { fails++; console.log('ОШИБКА ' + err); }
  r = await read();
  // Волна-5: проекция правая — застывший срез (тот же текст, что давал
  // живой фасад волны-3).
  // Волна-7, уточнение (2026-08-25): фасад этой сцены — рисунок КВАДРАТА
  // (sq.strumPattern), а секция без ЯВНОГО боя. Общим боем секции это не
  // считается («одиночный удар, который звучит если ритм не определен, не
  // должен считаться за общий бой секции»), демоция спит: правая
  // остаётся застывшим наследником (поведение волны-5), звук прежний
  // _X_X_X_X_. Зеркальная сцена с явным боем секции — I2 ниже.
  eq('I левая со ссылкой; правая застыла: фасад — рисунок квадрата, демоция спит (волна-7 уточённая)',
    [r[0].span, r[1].span, r[0].steps, r[1].steps, r[0].gid !== null && r[1].gid !== null],
    [3.5, 4.5, 'D_D_D_D', '_X_X_X_X_', true]);

  console.log('=== I2. То же, но бой задан ЯВНО секции: правая распускается (волна-7) ===');
  await p.evaluate(() => {
    sections = []; globalTimeSig = '4/4'; addSection('Verse');
    sections[0].squares[0].events = [
      { chord: 'C', span: 4, timeSig: null, strumPattern: { mode: 'strum', subdivision: 2, steps: 'D_D_D_D_'.split('') } },
      { chord: '', span: 4 }, { chord: '', span: 4 }, { chord: '', span: 4 }, { chord: '', span: 4 },
    ];
    sections[0].strumPattern = { mode: 'strum', subdivision: 2, steps: 'X_X_X_X_'.split('') };
    if (songRhythmRolls) setSectionRhythmRoll(sections[0], sections[0].strumPattern);
    setSquareZoom(1); render(); setSquareZoom(1.5); render();
  });
  await new Promise((r2) => setTimeout(r2, 300));
  beatPx = (await innerW()) / 20;
  err = await dragNth(0, -Math.round(beatPx * 0.5));
  if (err) { fails++; console.log('ОШИБКА ' + err); }
  r = await read();
  // Явный бой секции: застывший срез '_X_X_X_X_' == живой фасад по новым
  // долям (у X_X_X_X_ фаза со сдвигом 3.5 доли даёт тот же текст) — пин
  // избыточен, распущен; правая снова наследует бой секции. Звук прежний.
  eq('I2 явный бой секции: правая совпала с фасадом — распущена',
    [r[0].span, r[1].span, r[0].steps, r[1].steps, r[0].gid !== null && r[1].gid === null],
    [3.5, 4.5, 'D_D_D_D', '_X_X_X_X_', true]);

  console.log('=== J. Сосед вообще без рисунка: входит лентой тишины (волна-5) ===');
  await setup(1.5, [
    { chord: 'C', span: 4, timeSig: null, strumPattern: pat(2, 'D_D_D_D_') },
    { chord: '', span: 4 }, { chord: '', span: 4 }, { chord: '', span: 4 },
  ]);
  beatPx = (await innerW()) / 16;
  err = await dragNth(0, -Math.round(beatPx * 0.5));
  if (err) { fails++; console.log('ОШИБКА ' + err); }
  r = await read();
  // Спека волны-5: рядом стоящая ячейка без ритма = пустой ритм
  // (________). Регрессия волны-5 (пропадает удар-в-начале) ОТМЕНЕНА
  // решением B-06 (2026-08-26): при необъявленном бое секции пустое окно
  // не записывается — тронутая пустая остаётся БЕЗ рисунка и ссылки,
  // «магического» кастома нет; звук — удар-в-начале, как до жеста.
  eq('J тронутая пустая — дематериализована (B-06): ни ссылки, ни записанной тишины',
    [r[0].span, r[1].span, r[0].steps, r[1].steps, r[0].gid !== null, r[1].gid === null],
    [3.5, 4.5, 'D_D_D_D', null, true, true]);

  console.log('=== J2. Свой бой уехал к соседу целиком: дематериализация с тостом (B-06) ===');
  // Обе со своим D в начале (sub 2). Глубокое врастание левой на +1.5
  // доли: правая (0.5 доли) видит лишь паузу ленты — её D проглочен окном
  // левой. Кастом не записывается, вылетает уведомление «ни одного удара».
  await setup(1.5, [
    { chord: 'C', span: 2, timeSig: null, strumPattern: pat(2, 'D___') },
    { chord: 'D', span: 2, timeSig: null, strumPattern: pat(2, 'D___') },
    { chord: '', span: 4 }, { chord: '', span: 4 }, { chord: '', span: 4 },
  ]);
  await p.evaluate(() => {
    window.__toastLog = [];
    const orig = showToast;
    showToast = (m) => { window.__toastLog.push(m); return orig(m); };
  });
  beatPx = (await innerW()) / 16;
  err = await dragNth(0, Math.round(beatPx * 1.5));
  if (err) { fails++; console.log('ОШИБКА ' + err); }
  r = await read();
  const toastJ2 = await p.evaluate(() =>
    (window.__toastLog || []).filter((m) => m.indexOf('в окне не осталось') >= 0));
  eq('J2 правая потеряла бой: без ссылки (B-06); левая вобрала D позиционно; один тост',
    [r[0].span, r[1].span, r[0].steps, r[1].steps, r[1].gid === null,
     toastJ2.length === 1 && toastJ2[0].indexOf('ячейки 2') >= 0],
    [3.5, 0.5, 'D___D__', null, true, true]);

  console.log('=== K. Превью ритма перерисовывается ДО отпускания мыши (волна-3) ===');
  // Смешанная сцена: смотрим на DOM до mouse.up. Волна-5: пара уже во
  // время протяжки сшита в ленту — левая пересобирается на своё окно.
  // B-06: пустая правая (окно — чистая тишина при необъявленном бое
  // секции) кастомом не показывается ни по дороге, ни после отпускания.
  await setup(1.5, [
    { chord: 'C', span: 4, timeSig: null, strumPattern: pat(2, 'D_D_D_D_') },
    { chord: '', span: 4 }, { chord: '', span: 4 }, { chord: '', span: 4 },
  ]);
  beatPx = (await innerW()) / 16;
  {
    const hs = await p.$$('.resize-handle');
    const box = await hs[0].boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    const dx = -Math.round(beatPx * 0.5);
    await p.mouse.move(x, y); await p.mouse.down();
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      await p.mouse.move(x + dx * i / steps, y);
      await new Promise((r2) => setTimeout(r2, 25));
    }
    await new Promise((r2) => setTimeout(r2, 150));
    const live = await p.evaluate(() => {
      const q = (ei) => document.querySelector(`.event-strum-preview[data-ei="${ei}"]`);
      return {
        a: q(0).classList.contains('has-pattern') ? q(0).querySelectorAll('.strum-step').length : -1,
        b: q(1).classList.contains('has-pattern') ? q(1).querySelectorAll('.strum-step').length : -1,
      };
    });
    eq('K лента обновлена на удержании (левая — окно; пустая скрыта, B-06)', [live.a, live.b], [7, -1]);
    await p.mouse.up();
    await new Promise((r2) => setTimeout(r2, 320));
    const after = await p.evaluate(() => {
      const q = (ei) => document.querySelector(`.event-strum-preview[data-ei="${ei}"]`);
      return {
        a: q(0).classList.contains('has-pattern') ? q(0).querySelectorAll('.strum-step').length : -1,
        b: q(1).classList.contains('has-pattern') ? q(1).querySelectorAll('.strum-step').length : -1,
      };
    });
    eq('K после отпускания пустая так и не показана (B-06)', [after.a, after.b], [7, -1]);
  }

  console.log('=== L. Кнопка «−» на половине связки собирает ритм целиком ===');
  await setup(1, [{ chord: 'C', span: 4, timeSig: null, strumPattern: pat(2, 'D_DU_UDU') }, ...pad]);
  await splitFirst();
  // Удаляем ВТОРУЮ половину настоящим кликом по кнопке.
  await p.evaluate(() => {
    document.querySelector('.chord-wrapper[data-ei="1"] .chord-btn-del').click();
  });
  await new Promise((r2) => setTimeout(r2, 350));
  r = await read();
  eq('L1 удаление второй: D_DU_UDU целиком, span 4',
    [r[0].span, r[0].steps], [4, 'D_DU_UDU']);
  // Удаляем ПЕРВУЮ половину: та же склейка.
  await setup(1, [{ chord: 'C', span: 4, timeSig: null, strumPattern: pat(2, 'D_DU_UDU') }, ...pad]);
  await splitFirst();
  await p.evaluate(() => {
    document.querySelector('.chord-wrapper[data-ei="0"] .chord-btn-del').click();
  });
  await new Promise((r2) => setTimeout(r2, 350));
  r = await read();
  eq('L2 удаление первой: D_DU_UDU целиком, span 4',
    [r[0].span, r[0].steps], [4, 'D_DU_UDU']);

  console.log(errs.length ? `ОШИБКИ СТРАНИЦЫ: ${errs.join(' | ')}` : 'ошибок страницы нет');
  if (errs.length) fails++;
  console.log(fails ? `\nПЛОХО: ${fails}` : '\nвсе сценарии прошли');
  await b.close();
  process.exit(fails ? 1 : 0);
})();
