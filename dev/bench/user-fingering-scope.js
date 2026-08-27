// Умолчание аппликатуры — ПОСЛЕДНЯЯ сохранённая своя форма.
//
// История правила:
//   1) своя форма была variants[0] и молча подставлялась КАЖДОМУ новому
//      вхождению — и стоялым при добавлении формы (починили pin'ом);
//   2) умолчание — первая НЕ-пользовательская форма: своя доступна
//      только ручным выбором стрелкой;
//   3) стало (2026-08-12, продуктовое решение): «сохранил аппликатуру —
//      следующие вхождения берут её». Стоялые ячейки по-прежнему
//      прибиты (pinCurrentFingeringsForChord теперь и при перезаписи),
//      а ячейки ПОСЛЕ сохранения получают последнюю свою форму; если
//      своих нет — семейный перенос по расширению, затем библиотека
//      (см. resolveFingeringShape / collectFamilyDerivedShapes).
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
    protocolTimeout: 60000,
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

  // Тональность фиксируем вручную. В авторежиме globalKey подстраивается
  // под введённые аккорды (Am -> ключ Am), а ключ хранения строится по
  // ней — своя форма просто не нашлась бы. На этом я уже споткнулся
  // при отладке.
  const prep = () =>
    p.evaluate(async () => {
      tunerTuningId = 'e-std';
      tunerCustomNotes = null;
      keyMode = 'manual';
      globalKey = 'C';
      DOM.rootKey.value = 'C';
      fingeringCache.clear();
      userFingerings.clear();
      preferredFingeringByChord.clear();
    });

  console.log('=== 1. Новая ячейка подхватывает сохранённую свою форму ===');
  await prep();
  const grow = await p.evaluate(async () => {
    const out = {};
    sections = [
      { id: 1, type: 'Verse', repeat: 1, squares: [{ id: 1, repeat: 1,
        events: [{ chord: 'Am', span: 1 }, { chord: 'Am', span: 1 }] }] },
    ];
    nextId = 9;
    render();
    await new Promise((r) => setTimeout(r, 300));
    const evs = sections[0].squares[0].events;
    const show = (i) =>
      (resolveFingeringShape('Am', 'C', buildFingeringPositionKey('Am', 'C', 1, 1, i), evs[i]) || []).join(',');
    out.before = [show(0), show(1)];
    // Пользователь рисует свою форму в ПЕРВОЙ ячейке.
    pinCurrentFingeringsForChord('Am', 'C', buildFingeringPositionKey('Am', 'C', 1, 1, 0));
    userFingerings.set(buildFingeringChordKey('Am', 'C'), [['x', 0, 2, 2, 1, 3]]);
    fingeringCache.clear();
    setPreferredFingering(buildFingeringPositionKey('Am', 'C', 1, 1, 0), 'x,0,2,2,1,3', evs[0]);
    out.afterCreate = [show(0), show(1)];
    // И добавляет ТРЕТЬЮ ячейку с тем же аккордом.
    evs.push({ chord: 'Am', span: 1 });
    render();
    await new Promise((r) => setTimeout(r, 200));
    out.newCell = show(2);
    const v = window.getFingeringVariants('Am', 'C');
    out.list = v.shapes.slice(0, 3).map((s, i) => `${s.join('')}[${v.methods[i]}]`);
    return out;
  });
  console.log('      список:', grow.list.join('  '));
  ok('своя форма осталась в первой ячейке', grow.afterCreate[0] === 'x,0,2,2,1,3', grow.afterCreate[0]);
  ok('вторая ячейка не тронута', grow.afterCreate[1] === 'x,0,2,2,1,0', grow.afterCreate[1]);
  ok('НОВАЯ ячейка берёт свеже-сохранённую свою форму', grow.newCell === 'x,0,2,2,1,3', grow.newCell);
  ok('своя форма по-прежнему первая в списке', /\[user\]$/.test(grow.list[0]), grow.list[0]);

  console.log('=== 2. Несколько разных своих форм ===');
  await prep();
  const two = await p.evaluate(async () => {
    sections = [
      { id: 1, type: 'Verse', repeat: 1, squares: [{ id: 1, repeat: 1,
        events: [{ chord: 'Am', span: 1 }, { chord: 'Am', span: 1 }] }] },
    ];
    nextId = 9;
    render();
    await new Promise((r) => setTimeout(r, 300));
    const evs = sections[0].squares[0].events;
    const ck = buildFingeringChordKey('Am', 'C');
    const show = (i) =>
      (resolveFingeringShape('Am', 'C', buildFingeringPositionKey('Am', 'C', 1, 1, i), evs[i]) || []).join(',');
    userFingerings.set(ck, [['x', 0, 2, 2, 1, 3]]);
    fingeringCache.clear();
    setPreferredFingering(buildFingeringPositionKey('Am', 'C', 1, 1, 0), 'x,0,2,2,1,3', evs[0]);
    userFingerings.set(ck, [['x', 0, 2, 2, 1, 3], [5, 7, 7, 5, 5, 8]]);
    fingeringCache.clear();
    setPreferredFingering(buildFingeringPositionKey('Am', 'C', 1, 1, 1), '5,7,7,5,5,8', evs[1]);
    evs.push({ chord: 'Am', span: 1 });
    render();
    await new Promise((r) => setTimeout(r, 200));
    return { cells: [show(0), show(1), show(2)] };
  });
  ok('каждая ячейка держит СВОЮ форму', two.cells[0] === 'x,0,2,2,1,3' && two.cells[1] === '5,7,7,5,5,8', two.cells.join(' | '));
  ok('третья берёт ПОСЛЕДНЮЮ свою форму', two.cells[2] === '5,7,7,5,5,8', two.cells[2]);

  console.log('=== 3. Если ВСЕ формы пользовательские ===');
  // У аккорда, которого движок не знает, заготовок нет вовсе. Оставить
  // ячейку пустой нельзя — откатываемся на первую форму.
  await prep();
  const only = await p.evaluate(async () => {
    sections = [
      { id: 1, type: 'Verse', repeat: 1, squares: [{ id: 1, repeat: 1, events: [{ chord: 'Xyz9', span: 4 }] }] },
    ];
    nextId = 9;
    render();
    await new Promise((r) => setTimeout(r, 200));
    const empty = window.getFingeringVariants('Xyz9', 'C').shapes.length;
    userFingerings.set(buildFingeringChordKey('Xyz9', 'C'), [[1, 2, 3, 4, 5, 6]]);
    fingeringCache.clear();
    const ev = sections[0].squares[0].events[0];
    return {
      empty,
      methods: window.getFingeringVariants('Xyz9', 'C').methods,
      shown: (resolveFingeringShape('Xyz9', 'C', null, ev) || []).join(','),
    };
  });
  ok('заготовок у неизвестного аккорда нет', only.empty === 0, String(only.empty));
  ok('показывается своя форма, ячейка не пуста', only.shown === '1,2,3,4,5,6', only.shown);

  console.log('=== 4. Счётчик и стрелки в тултипе ===');
  await prep();
  await p.evaluate(async () => {
    sections = [
      { id: 1, type: 'Verse', repeat: 1, squares: [{ id: 1, repeat: 1, events: [{ chord: 'Am', span: 4 }] }] },
    ];
    nextId = 9;
    userFingerings.set(buildFingeringChordKey('Am', 'C'), [['x', 0, 2, 2, 1, 3]]);
    fingeringCache.clear();
    render();
    await new Promise((r) => setTimeout(r, 400));
  });
  const box = await p.evaluate(() => {
    const w = document.querySelector('.chord-wrapper');
    const r = w.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  // Одиночный move в занятую точку не даёт mouseover — нужны шаги.
  await p.mouse.move(box.x, box.y, { steps: 6 });
  await new Promise((r) => setTimeout(r, 900));
  const read = () =>
    p.evaluate(() => {
      const t = document.getElementById('fingering-tooltip');
      const c = t.querySelector('.tooltip-controls span');
      const ev = sections[0].squares[0].events[0];
      const L = t.querySelector('.tooltip-nav-left');
      const R = t.querySelector('.tooltip-nav-right');
      return {
        counter: c ? c.textContent.trim() : null,
        leftEnabled: !!L && !L.disabled,
        rightEnabled: !!R && !R.disabled,
        shown: (resolveFingeringShape('Am', 'C', buildFingeringPositionKey('Am', 'C', 1, 1, 0), ev) || []).join(','),
      };
    });
  const t0 = await read();
  ok('ячейка открывается на своей форме с подписью «1/1(польз.)»', /^1\/1\(польз\.\)$/.test(t0.counter), String(t0.counter));
  ok('показана своя форма', t0.shown === 'x,0,2,2,1,3', t0.shown);
  ok('стрелка влево НЕ доступна', !t0.leftEnabled, String(t0.leftEnabled));

  const R = await p.evaluate(() => {
    const n = document.querySelector('#fingering-tooltip .tooltip-nav-right');
    if (!n || n.disabled) return null;
    const r = n.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (R) {
    await p.mouse.click(R.x, R.y);
    await new Promise((r) => setTimeout(r, 700));
  }
  const t1 = await read();
  // Штатные формы идут без подписи: просто «1/5» — число мест у
  // open+caged яруса не фиксируем (оно меняется с ростом таблиц).
  ok('стрелка вправо даёт штатную форму без подписи', /^\d+\/\d+$/.test(t1.counter), String(t1.counter));
  ok('и это библиотечная открытая форма', t1.shown === 'x,0,2,2,1,0', t1.shown);

  console.log('=== 5. Копия уносит форму с собой ===');
  await prep();
  const clone = await p.evaluate(async () => {
    sections = [
      { id: 1, type: 'Verse', repeat: 1, squares: [{ id: 2, repeat: 1, events: [{ chord: 'Am', span: 4 }] }] },
    ];
    nextId = 9;
    render();
    await new Promise((r) => setTimeout(r, 300));
    userFingerings.set(buildFingeringChordKey('Am', 'C'), [['x', 0, 2, 2, 1, 3]]);
    fingeringCache.clear();
    setPreferredFingering(buildFingeringPositionKey('Am', 'C', 1, 2, 0), 'x,0,2,2,1,3', sections[0].squares[0].events[0]);
    cloneSection(1);
    await new Promise((r) => setTimeout(r, 300));
    const cl = sections[1].squares[0].events[0];
    const out = {
      sectionClone: (resolveFingeringShape('Am', 'C',
        buildFingeringPositionKey('Am', 'C', sections[1].id, sections[1].squares[0].id, 0), cl) || []).join(','),
    };
    cloneLastSquare(sections[0].id);
    await new Promise((r) => setTimeout(r, 200));
    const sqc = sections[0].squares[1].events[0];
    out.squareClone = (resolveFingeringShape('Am', 'C',
      buildFingeringPositionKey('Am', 'C', 1, sections[0].squares[1].id, 0), sqc) || []).join(',');
    return out;
  });
  ok('клон секции сохранил форму', clone.sectionClone === 'x,0,2,2,1,3', clone.sectionClone);
  ok('клон квадрата сохранил форму', clone.squareClone === 'x,0,2,2,1,3', clone.squareClone);

  console.log('=== 6. Клон в Drop D уносит и подпись строя ===');
  // Без подписи форма приезжает «безымянной», и в нестандартном строе
  // resolveFingeringShape считает её выбором из ДРУГОГО строя.
  const dropClone = await p.evaluate(async () => {
    tunerTuningId = 'drop-d';
    tunerCustomNotes = null;
    fingeringCache.clear();
    userFingerings.clear();
    preferredFingeringByChord.clear();
    sections = [
      { id: 1, type: 'Verse', repeat: 1, squares: [{ id: 2, repeat: 1, events: [{ chord: 'Am', span: 4 }] }] },
    ];
    nextId = 9;
    render();
    await new Promise((r) => setTimeout(r, 300));
    userFingerings.set(buildFingeringChordKey('Am', 'C'), [['x', 0, 2, 2, 1, 3]]);
    fingeringCache.clear();
    setPreferredFingering(buildFingeringPositionKey('Am', 'C', 1, 2, 0), 'x,0,2,2,1,3', sections[0].squares[0].events[0]);
    cloneSection(1);
    await new Promise((r) => setTimeout(r, 300));
    const cl = sections[1].squares[0].events[0];
    const res = {
      stamp: cl.fingeringTuning,
      shown: (resolveFingeringShape('Am', 'C',
        buildFingeringPositionKey('Am', 'C', sections[1].id, sections[1].squares[0].id, 0), cl) || []).join(','),
    };
    tunerTuningId = 'e-std';
    fingeringCache.clear();
    return res;
  });
  ok('подпись строя уехала с копией', dropClone.stamp === '@D2A2D3G3B3E4', String(dropClone.stamp));
  ok('и форма подставляется', dropClone.shown === 'x,0,2,2,1,3', dropClone.shown);

  ok('ошибок на странице нет', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(bad ? `\nПРОВАЛОВ: ${bad}` : '\nвсе проверки пройдены');
  process.exit(bad ? 1 : 0);
})();
