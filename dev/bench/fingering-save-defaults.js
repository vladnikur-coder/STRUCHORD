// Сквозной UI-стенд ТЗ 2026-08-12 (аппликатуры):
//  A. «Добавление аккорда по аппликатуре»: рисуем 5,7,9,6,x,x ->
//     ячейка стала Aadd9, показывает эту форму, она в userFingerings,
//     кнопка «add9» появилась на колесе (учёба через setEventChord).
//  B. Новая ячейка Badd9 (ручной ввод) по умолчанию получает
//     семейный перенос 7,9,11,8,x,x.
//  C. «Переименовать?» из редактора на C#add9 (9,11,13,10,x,x):
//     ячейка показывает нарисованное, форма стала умолчанием для
//     следующих — новая ячейка Dadd9 берёт 10,12,14,11,x,x (+1,
//     свежайший донор), а не +5 от Aadd9.
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
  await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 900));

  const out = await p.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const out = {};
    tunerTuningId = 'e-std';
    tunerCustomNotes = null;
    keyMode = 'manual';
    globalKey = 'C';
    DOM.rootKey.value = 'C';
    userFingerings.clear();
    preferredFingeringByChord.clear();
    fingeringCache.clear();
    wheelExtModes.length = 0;
    wheelExtModes.push(...WHEEL_EXT_DEFAULTS);
    renderWheelModeTabs();

    sections = [{
      id: 1, type: 'Verse', repeat: 1, squares: [{
        id: 1, repeat: 1,
        events: [
          { chord: 'C', span: 1 },
          { chord: 'C', span: 1 },
          { chord: 'C', span: 1 },
        ],
      }],
    }];
    nextId = 9;
    render();
    await sleep(400);

    const fbZone = (title) =>
      [...document.querySelectorAll('#fingering-editor-fretboard [title]')].find((z) => z.title === title);
    const clickFret = (f, s) =>
      fbZone(`Лад ${f}, струна ${s + 1}`).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    // Окно редактора — 5 ладов: высокую форму пользователь собирает у
    // порожка и поднимает кнопкой ▼ (она сдвигает ВСЮ форму на +1).
    // Окно НЕ следует за «Стереть»: редактор, открытый на баррэ-форме,
    // стартует у неё, поэтому сначала опускаем окно до упора (▲ на
    // всех «x» просто двигает сетку, форму не трогает).
    const shiftDown = () => {
      const btn = [...document.querySelectorAll('#fingering-editor-fretboard button')].find(
        (bb) => bb.title === 'Показать более высокие лады'
      );
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    };
    const shiftUp = () => {
      const btn = [...document.querySelectorAll('#fingering-editor-fretboard button')].find(
        (bb) => bb.title === 'Показать более низкие лады'
      );
      if (!btn) return false;
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return true;
    };
    // Хват 1,3,5,2,x,x у порожка, поднятый на N ладов.
    const drawShifted = (n) => {
      document.getElementById('clear-fingering').click();
      while (shiftUp());
      clickFret(1, 0); clickFret(3, 1); clickFret(5, 2); clickFret(2, 3);
      for (let i = 0; i < n; i++) shiftDown();
    };
    const shownAt = (name, ei) =>
      (resolveFingeringShape(name, 'C', buildFingeringPositionKey(name, 'C', 1, 1, ei), sections[0].squares[0].events[ei]) || []).join(',');

    // --- A. Добавление аккорда ПО АППЛИКАТУРЕ (createMode) ---
    const inp0 = document.querySelectorAll('.chord-wrapper .chord-input')[0];
    activeChordInput = inp0;
    openFingeringEditorForNewChord();
    await sleep(150);
    drawShifted(4); // 5,7,9,6,x,x = Aadd9
    await sleep(60);
    out.A_detected = document.getElementById('chord-analysis').textContent;
    document.getElementById('save-fingering').click(); // «Добавить аккорд»
    await sleep(150);
    const ev0 = sections[0].squares[0].events[0];
    out.A = {
      chord: ev0.chord,
      evShape: ev0.fingering || null,
      shown: shownAt(ev0.chord, 0),
      userHas: (userFingerings.get(buildFingeringChordKey(ev0.chord, 'C')) || []).map((s) => s.join(',')),
      wheelHasAdd9: wheelExtModes.includes('add9'),
    };

    // --- B. Ячейка 1 вручную переименовываем в Badd9 — ждём семейный перенос
    const inp1 = document.querySelectorAll('.chord-wrapper .chord-input')[1];
    activeChordInput = inp1;
    inp1.removeAttribute('readonly');
    inp1.value = 'Badd9';
    saveCurrentChord();
    await sleep(150);
    out.B = { shown: shownAt('Badd9', 1) };

    // --- C. «Переименовать?» Badd9 -> C#add9 со своей формой
    const wrapper1 = document.querySelectorAll('.chord-wrapper')[1];
    openFingeringEditor('Badd9', 0, wrapper1);
    await sleep(150);
    drawShifted(8); // 9,11,13,10,x,x = C#add9
    await sleep(60);
    out.C_detected = document.getElementById('chord-analysis').textContent;
    document.getElementById('apply-detected-chord').click();
    document.getElementById('save-fingering').click();
    await sleep(150);
    const ev1 = sections[0].squares[0].events[1];
    out.C = {
      chord: ev1.chord,
      shown: shownAt(ev1.chord, 1),
      userHas: (userFingerings.get(buildFingeringChordKey(ev1.chord, 'C')) || []).map((s) => s.join(',')),
    };

    // --- D. Третья ячейка -> Dadd9: свежайший донор C#add9 (+1),
    // а не Aadd9 (+5)
    const inp2 = document.querySelectorAll('.chord-wrapper .chord-input')[2];
    activeChordInput = inp2;
    inp2.removeAttribute('readonly');
    inp2.value = 'Dadd9';
    saveCurrentChord();
    await sleep(150);
    out.D = { shown: shownAt('Dadd9', 2) };
    return out;
  });

  console.log('=== A. Добавление по аппликатуре ===');
  console.log('      распознано:', out.A_detected);
  ok('ячейка стала Aadd9', out.A.chord === 'Aadd9', out.A.chord);
  ok('формой на ячейке записано ровно нарисованное', out.A.evShape === '5,7,9,6,x,x', out.A.evShape);
  ok('ячейка показывает её', out.A.shown === '5,7,9,6,x,x', out.A.shown);
  ok('форма легла в userFingerings', out.A.userHas.includes('5,7,9,6,x,x'), JSON.stringify(out.A.userHas));
  ok('кнопка add9 появилась на колесе', out.A.wheelHasAdd9);

  console.log('=== B. Семейный перенос Aadd9 -> Badd9 ===');
  ok('Badd9 по умолчанию = 7,9,11,8,x,x', out.B.shown === '7,9,11,8,x,x', out.B.shown);

  console.log('=== C. «Переименовать?» -> C#add9 ===');
  console.log('      распознано:', out.C_detected);
  ok('ячейка стала C#add9', out.C.chord === 'C#add9', out.C.chord);
  ok('и показывает нарисованную форму', out.C.shown === '9,11,13,10,x,x', out.C.shown);
  ok('форма в userFingerings под C#add9', out.C.userHas.includes('9,11,13,10,x,x'), JSON.stringify(out.C.userHas));

  console.log('=== D. Свежайший донор побеждает ===');
  ok('Dadd9 по умолчанию = 10,12,14,11,x,x (+1 от C#add9)', out.D.shown === '10,12,14,11,x,x', out.D.shown);

  ok('ошибок на странице нет', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(bad ? `\nПРОВАЛОВ: ${bad}` : '\nвсе проверки пройдены');
  process.exit(bad ? 1 : 0);
})();
