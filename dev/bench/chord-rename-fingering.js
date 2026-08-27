// Смена аккорда в ячейке снимает выбранную аппликатуру.
//
// Форма живёт на самом событии (ev.fingering), а объект события при
// правке имени остаётся ТЕМ ЖЕ. Без явного сброса D с выбранной
// позицией x,5,4,2,3,2 после переименования в G продолжал показывать
// её же: resolveFingeringShape возвращает форму «как есть», даже если
// её нет в списке вариантов нового аккорда (эта ветка нужна для
// схлопнутых хватов).
//
// Отдельно проверяется, что НУЖНОЕ поведение не сломано: тот же аккорд,
// смена регистра и транспонирование форму сохраняют.
//
// Разделы 6-8 — регрессия по «чужой аппликатуре» (замер: последний
// Aadd9 в Every Breath You Take показывал хват D5, x,5,7,7,x,x):
// «Переименовать?» в редакторе аппликатур менял аккорд БЕЗ сброса
// ev.fingering и не откатывался по Отмене, а resolveFingeringShape и
// pinCurrentFingeringsForChord чужую форму читали и цементировали.
// Здесь редактор гоняется по-настоящему, кликами по зонам грифа.
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

  const res = await p.evaluate(async () => {
    const out = {};
    tunerTuningId = 'e-std';
    tunerCustomNotes = null;
    fingeringCache.clear();
    const mk = () => {
      sections = [
        { id: 1, type: 'Verse', repeat: 1, squares: [{ id: 1, repeat: 1, events: [{ chord: 'D', span: 4 }] }] },
      ];
      nextId = 9;
      render();
    };
    const pick = (ev, shape) =>
      setPreferredFingering(buildFingeringPositionKey(ev.chord, globalKey, 1, 1, 0), shape, ev);
    const shown = (ev) => {
      const pk = buildFingeringPositionKey(ev.chord, globalKey, 1, 1, 0);
      return (resolveFingeringShape(ev.chord, globalKey, pk, ev) || []).join(',');
    };
    const best = (ev) =>
      (window.getFingeringVariants(ev.chord, globalKey).shapes[0] || []).join(',');

    // --- 1. Ввод имени руками (saveCurrentChord) ---
    mk();
    await new Promise((r) => setTimeout(r, 300));
    let ev = sections[0].squares[0].events[0];
    const inp = document.querySelector('.chord-input');
    pick(ev, 'x,5,4,2,3,2'); // вторая позиция D, не вариант по умолчанию
    out.picked = { f: ev.fingering, shown: shown(ev) };
    activeChordInput = inp;
    inp.removeAttribute('readonly');
    inp.value = 'G';
    saveCurrentChord();
    await new Promise((r) => setTimeout(r, 250));
    out.typed = { chord: ev.chord, f: ev.fingering || null, shown: shown(ev), best: best(ev) };

    // --- 2. Колесо аккордов (selectChord) идёт своим путём ---
    mk();
    await new Promise((r) => setTimeout(r, 300));
    ev = sections[0].squares[0].events[0];
    pick(ev, 'x,5,4,2,3,2');
    activeChordInput = document.querySelector('.chord-input');
    selectChord('G');
    await new Promise((r) => setTimeout(r, 250));
    out.wheel = { chord: ev.chord, f: ev.fingering || null, shown: shown(ev), best: best(ev) };

    // --- 3. ТОТ ЖЕ аккорд: форма остаётся ---
    mk();
    await new Promise((r) => setTimeout(r, 300));
    ev = sections[0].squares[0].events[0];
    pick(ev, 'x,5,4,2,3,2');
    activeChordInput = inp;
    inp.removeAttribute('readonly');
    inp.value = 'D';
    saveCurrentChord();
    await new Promise((r) => setTimeout(r, 250));
    out.same = { chord: ev.chord, f: ev.fingering || null };

    // --- 4. Смена регистра — тот же аккорд ---
    mk();
    await new Promise((r) => setTimeout(r, 300));
    ev = sections[0].squares[0].events[0];
    pick(ev, 'x,5,4,2,3,2');
    activeChordInput = inp;
    inp.removeAttribute('readonly');
    inp.value = 'd';
    saveCurrentChord();
    await new Promise((r) => setTimeout(r, 250));
    out.caseOnly = { chord: ev.chord, f: ev.fingering || null };

    // --- 5. Транспонирование: форма ПЕРЕЕЗЖАЕТ по грифу ---
    mk();
    await new Promise((r) => setTimeout(r, 300));
    ev = sections[0].squares[0].events[0];
    pick(ev, 'x,5,4,2,3,2');
    transposeAllGlobal(2);
    await new Promise((r) => setTimeout(r, 300));
    out.transposed = { chord: ev.chord, f: ev.fingering || null };

    // --- Общее для разделов 6-8: жёсткая тональность и чистые карты ---
    const prep = () => {
      keyMode = 'manual';
      globalKey = 'C';
      if (typeof DOM !== 'undefined' && DOM.rootKey) DOM.rootKey.value = 'C';
      userFingerings.clear();
      preferredFingeringByChord.clear();
      fingeringCache.clear();
    };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    // Клики по зонам интерактивного грифа редактора. Зоны пересоздаются
    // на каждый redraw, поэтому ищем заново перед каждым кликом.
    const fbZone = (title) =>
      [...document.querySelectorAll('#fingering-editor-fretboard [title]')].find((z) => z.title === title);
    const clickFret = (f, s) =>
      fbZone(`Лад ${f}, струна ${s + 1}`).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const clickTopZone = (s) =>
      [...document.querySelectorAll('#fingering-editor-fretboard [title="Открытая струна / заглушить"]')][s]
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    // «Стереть» -> всё в x -> собрать 3,2,0,0,0,3 = G независимо от
    // того, какой вариант D открылся в редакторе.
    const drawG = () => {
      document.getElementById('clear-fingering').click();
      clickFret(3, 0); clickFret(2, 1);
      clickTopZone(2); clickTopZone(3); clickTopZone(4);
      clickFret(3, 5);
    };

    // --- 6. «Переименовать?» + Отмена: имя и форма ОТКАТЫВАЮТСЯ ---
    // Кнопка меняет модель сразу; закрытие без сохранения обязано вернуть
    // ячейке и прежнее имя, и прежнюю аппликатуру (и в событие, и в карту).
    prep(); mk();
    await sleep(300);
    ev = sections[0].squares[0].events[0];
    let wrapper = document.querySelector('.chord-wrapper');
    pick(ev, 'x,5,4,2,3,2');
    openFingeringEditor('D', 0, wrapper);
    await sleep(60);
    drawG();
    out.rc = {
      detected: document.getElementById('chord-analysis').textContent,
      applyShown: document.getElementById('apply-detected-chord').style.display !== 'none',
    };
    document.getElementById('apply-detected-chord').click();
    out.rc.renamed = {
      chord: ev.chord,
      f: ev.fingering || null,
      mapD: preferredFingeringByChord.get('D|C|1|1|0') || null,
    };
    document.getElementById('cancel-fingering').click();
    await sleep(60);
    out.rc.after = {
      chord: ev.chord,
      f: ev.fingering || null,
      mapD: preferredFingeringByChord.get('D|C|1|1|0') || null,
      ghosts: [...preferredFingeringByChord.keys()].filter((k) => k.endsWith('|1|1|0')),
      closed: !document.getElementById('save-fingering'),
    };

    // --- 7. «Переименовать?» + Сохранить: форма ложится под НОВОЕ имя ---
    // Коммит: ячейка остаётся G, нарисованная форма закреплена за этой
    // ячейкой и добавлена в свои формы G (а не перезаписала варианты D),
    // старых ключей D на этой позиции в карте не осталось.
    prep(); mk();
    await sleep(300);
    ev = sections[0].squares[0].events[0];
    wrapper = document.querySelector('.chord-wrapper');
    pick(ev, 'x,5,4,2,3,2');
    openFingeringEditor('D', 0, wrapper);
    await sleep(60);
    drawG();
    document.getElementById('apply-detected-chord').click();
    document.getElementById('save-fingering').click();
    await sleep(60);
    const userG = (userFingerings.get(buildFingeringChordKey('G', 'C')) || []).map((s) => s.join(','));
    const userD = (userFingerings.get(buildFingeringChordKey('D', 'C')) || []).map((s) => s.join(','));
    out.rs = {
      chord: ev.chord,
      f: ev.fingering || null,
      mapG: preferredFingeringByChord.get('G|C|1|1|0') || null,
      ghosts: [...preferredFingeringByChord.keys()].filter((k) => k.endsWith('|1|1|0')),
      userG,
      userD,
      shownNow: (resolveFingeringShape('G', 'C', buildFingeringPositionKey('G', 'C', 1, 1, 0), ev) || []).join(','),
      closed: !document.getElementById('save-fingering'),
    };

    // --- 8. Наследие битого сохранения: яд ни читается, ни цементируется ---
    // Воспроизводим состояние файла, испорченного старым кодом: на втором
    // Aadd9 лежит чужая форма D5 (x,5,7,7,x,x), в карте — призрак под
    // старым именем D5 на ту же позицию. Проверяем: resolve форму D5 на
    // Aadd9 не возвращает и модель не переписывает, а pin с соседнего
    // вхождения прибивает ячейку к ЛЕГАЛЬНОЙ форме вместо цементации яда.
    prep();
    sections = [
      { id: 1, type: 'Verse', repeat: 1, squares: [{ id: 2, repeat: 1, events: [
        { chord: 'Aadd9', span: 2, fingering: '5,7,9,6,x,x' },
        { chord: 'Aadd9', span: 8, fingering: 'x,5,7,7,x,x' },
      ] }] },
    ];
    nextId = 9;
    render();
    await sleep(300);
    const evMine = sections[0].squares[0].events[0];
    const evSick = sections[0].squares[0].events[1];
    userFingerings.set(buildFingeringChordKey('Aadd9', 'C'), [[5, 7, 9, 6, 'x', 'x']]);
    preferredFingeringByChord.set('D5|C|1|2|1', 'x,5,7,7,x,x'); // призрак под старым именем
    fingeringCache.clear();
    out.pin = {
      variants: window.getFingeringVariants('Aadd9', 'C').shapes.map((s) => s.join(',')),
      rMine: (resolveFingeringShape('Aadd9', 'C', 'Aadd9|C|1|2|0', evMine) || []).join(','),
      rSick: (resolveFingeringShape('Aadd9', 'C', 'Aadd9|C|1|2|1', evSick) || []).join(','),
      rGhost: (resolveFingeringShape('Aadd9', 'C', 'D5|C|1|2|1', evSick) || []).join(','),
      afterRead: evSick.fingering || null, // чтение не должно ничего переписать
    };
    pinCurrentFingeringsForChord('Aadd9', 'C', 'Aadd9|C|1|2|0');
    out.pin.pinnedMap = preferredFingeringByChord.get('Aadd9|C|1|2|1') || null;
    out.pin.pinnedEv = evSick.fingering || null;
    out.pin.mineUntouched = evMine.fingering || null;

    return out;
  });

  console.log('=== 1. Ввод нового имени руками ===');
  ok('выбранная форма закрепилась', res.picked.shown === 'x,5,4,2,3,2', JSON.stringify(res.picked));
  ok('после смены D -> G форма снята', !res.typed.f, String(res.typed.f));
  ok('показывается форма НОВОГО аккорда', res.typed.shown === res.typed.best, `${res.typed.shown} vs ${res.typed.best}`);
  ok('и это не форма старого', res.typed.shown !== 'x,5,4,2,3,2', res.typed.shown);

  console.log('=== 2. Колесо аккордов ===');
  ok('после выбора G форма снята', !res.wheel.f, String(res.wheel.f));
  ok('показывается форма G', res.wheel.shown === res.wheel.best, `${res.wheel.shown} vs ${res.wheel.best}`);

  console.log('=== 3-4. Тот же аккорд форму сохраняет ===');
  ok('повторный ввод D — форма на месте', res.same.f === 'x,5,4,2,3,2', String(res.same.f));
  ok('смена регистра d/D — форма на месте', res.caseOnly.f === 'x,5,4,2,3,2', String(res.caseOnly.f));

  console.log('=== 5. Транспонирование двигает форму ===');
  ok('аккорд стал E', res.transposed.chord === 'E', String(res.transposed.chord));
  ok('форма уехала на два лада', res.transposed.f === 'x,7,6,4,5,4', String(res.transposed.f));

  console.log('=== 6. «Переименовать?» + Отмена — откат ===');
  ok('форму 3,2,0,0,0,3 распознали как G и предложили переименование',
    res.rc.detected === 'G' && res.rc.applyShown, `${res.rc.detected} / кнопка: ${res.rc.applyShown}`);
  ok('«Переименовать?» сняло с ячейки чужую форму (setEventChord)',
    res.rc.renamed.chord === 'G' && !res.rc.renamed.f && !res.rc.renamed.mapD, JSON.stringify(res.rc.renamed));
  ok('Отмена вернула имя D', res.rc.after.chord === 'D', String(res.rc.after.chord));
  ok('Отмена вернула форму на событие', res.rc.after.f === 'x,5,4,2,3,2', String(res.rc.after.f));
  ok('Отмена вернула запись в карту', res.rc.after.mapD === 'x,5,4,2,3,2', String(res.rc.after.mapD));
  ok('на позиции один ключ, призраков G нет',
    res.rc.after.ghosts.length === 1 && res.rc.after.ghosts[0] === 'D|C|1|1|0', JSON.stringify(res.rc.after.ghosts));
  ok('редактор закрылся', res.rc.after.closed);

  console.log('=== 7. «Переименовать?» + Сохранить — коммит под новым именем ===');
  ok('ячейка стала G с нарисованной формой',
    res.rs.chord === 'G' && res.rs.f === '3,2,0,0,0,3', `${res.rs.chord} / ${res.rs.f}`);
  ok('выбор закреплён под G', res.rs.mapG === '3,2,0,0,0,3', String(res.rs.mapG));
  ok('на позиции один ключ, призраков D нет',
    res.rs.ghosts.length === 1 && res.rs.ghosts[0] === 'G|C|1|1|0', JSON.stringify(res.rs.ghosts));
  ok('форма добавлена в свои для G', res.rs.userG.includes('3,2,0,0,0,3'), JSON.stringify(res.rs.userG));
  ok('под D она не записалась', !res.rs.userD.includes('3,2,0,0,0,3'), JSON.stringify(res.rs.userD));
  ok('resolve показывает сохранённую форму', res.rs.shownNow === '3,2,0,0,0,3', res.rs.shownNow);
  ok('редактор закрылся', res.rs.closed);

  console.log('=== 8. Битое наследие: яд ни читается, ни цементируется ===');
  const inVariants = (v) => res.pin.variants.includes(v);
  ok('своя форма читается как была', res.pin.rMine === '5,7,9,6,x,x', res.pin.rMine);
  ok('чужая D5 на Aadd9 НЕ читается (валидна форма аккорда)',
    res.pin.rSick !== 'x,5,7,7,x,x' && inVariants(res.pin.rSick), res.pin.rSick);
  ok('призрачный ключ D5 яд не подсовывает',
    res.pin.rGhost !== 'x,5,7,7,x,x' && inVariants(res.pin.rGhost), res.pin.rGhost);
  ok('чтение модель не переписывает (яд остался явным)',
    res.pin.afterRead === 'x,5,7,7,x,x', String(res.pin.afterRead));
  ok('pin прибил ячейку к ЛЕГАЛЬНОЙ форме, не к яду',
    !!res.pin.pinnedMap && res.pin.pinnedMap !== 'x,5,7,7,x,x' && inVariants(res.pin.pinnedMap), String(res.pin.pinnedMap));
  ok('событие залечено той же формой', res.pin.pinnedEv === res.pin.pinnedMap, `${res.pin.pinnedEv} vs ${res.pin.pinnedMap}`);
  ok('соседнюю свою форму pin не тронул', res.pin.mineUntouched === '5,7,9,6,x,x', String(res.pin.mineUntouched));

  ok('ошибок на странице нет', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(bad ? `\nПРОВАЛОВ: ${bad}` : '\nвсе проверки пройдены');
  process.exit(bad ? 1 : 0);
})();
