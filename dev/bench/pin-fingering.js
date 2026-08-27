// Аппликатуру можно перетащить из всплывающего тултипа в панель
// транспорта и закрепить там.
//
// Договорённости с пользователем (пересмотрены 2026-08-12, вечер):
//   - док — ВСЯ панель: на время жеста её содержимое плавно гаснет,
//     по периметру бежит пунктир, посередине подпись «закрепить»;
//     после сброса панель возвращается к прежнему виду;
//   - закреплённый ряд стоит у НАЧАЛА панели (под кнопкой play),
//     а не посередине;
//   - гриф не перекрывает ячейки: сетка секций опускается на его
//     высоту (padding-top по --pinned-shift, с переходом);
//   - закреплённый следует за воспроизведением; пока закреплён,
//     всплывающий тултип по наведению НЕ появляется;
//   - место одно, откреплять — вытащить перетаскиванием наружу.
const puppeteer = require('/home/user/node_modules/puppeteer');
let bad = 0;
const t = (n, c, x = '') => { if (c) console.log('   ok  ', n, x); else { bad++; console.log('  FAIL ', n, x); } };

(async () => {
  const br = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'] });
  const p = await br.newPage();
  p.setDefaultTimeout(60000);
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).split('\n')[0]));
  await p.setViewport({ width: 1400, height: 950 });
  await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1100));
  await p.evaluate(() => {
    sections = [{ id: 1, type: 'Verse', repeat: 1, squares: [{ id: 1, repeat: 1,
      events: [{ chord: 'Am', span: 4 }, { chord: 'C', span: 4 },
        { chord: 'F', span: 4 }, { chord: 'G', span: 4 }] }] }];
    nextId = 9; render();
  });
  await new Promise((r) => setTimeout(r, 600));

  console.log('=== 1. В ПОКОЕ дока не видно вовсе ===');
  const dock0 = await p.evaluate(() => {
    const hint = document.getElementById('transportDockHint');
    const bar = document.querySelector('.transport-bar');
    const grid = document.getElementById('sectionsContainer');
    return {
      hintShown: getComputedStyle(hint).display !== 'none',
      labelOpacity: +getComputedStyle(hint.querySelector('.fingering-dock-label')).opacity,
      barH: Math.round(bar.getBoundingClientRect().height),
      gridPad: parseFloat(getComputedStyle(grid).paddingTop),
      cls: document.body.classList.contains('has-pinned-fingering'),
      pinShown: document.getElementById('pinnedRow').style.display !== 'none',
    };
  });
  console.log('   ', JSON.stringify(dock0));
  t('подсказки нет', !dock0.hintShown);
  t('подпись невидима', dock0.labelOpacity === 0 || !dock0.hintShown, String(dock0.labelOpacity));
  t('сетка без сдвига', dock0.gridPad === 0, `${dock0.gridPad}px`);
  t('класса pinned нет', !dock0.cls);
  t('ряд скрыт', !dock0.pinShown);
  const barBefore = dock0.barH;

  console.log('\n=== 1б. При перетаскивании панель СТАНОВИТСЯ доком ===');
  const dockOn = await p.evaluate(async () => {
    document.body.classList.add('is-pin-dragging');
    await new Promise((x) => setTimeout(x, 400));
    const bar = document.querySelector('.transport-bar');
    const hint = document.getElementById('transportDockHint');
    const rect = hint.querySelector('rect');
    const o1 = getComputedStyle(rect).strokeDashoffset;
    await new Promise((x) => setTimeout(x, 200));
    const o2 = getComputedStyle(rect).strokeDashoffset;
    const hb = hint.getBoundingClientRect();
    const bb = bar.getBoundingClientRect();
    const hcs = getComputedStyle(hint);
    const res = {
      shown: hcs.display,
      label: hint.querySelector('.fingering-dock-label').textContent.trim(),
      labelCentered: Math.abs((hb.left + hb.width / 2) - (bb.left + bb.width / 2)),
      coverW: hb.width / bb.width, coverH: hb.height / bb.height,
      dash: getComputedStyle(rect).strokeDasharray,
      strokeW: getComputedStyle(rect).strokeWidth,
      anim: getComputedStyle(rect).animationName,
      moved: o1 !== o2,
      playGone: +getComputedStyle(document.getElementById('btnPlay')).opacity,
      barH: Math.round(bb.height),
      noTarget: bar.classList.contains('is-drop-target'),
      runAnim: getComputedStyle(rect).strokeDasharray,
    };
    document.body.classList.remove('is-pin-dragging');
    return res;
  });
  console.log('   ', JSON.stringify(dockOn));
  t('подсказка показана', dockOn.shown === 'flex', dockOn.shown);
  t('подпись «закрепить»', dockOn.label === 'закрепить', dockOn.label);
  t('подпись по центру панели', dockOn.labelCentered <= 4, `смещение ${dockOn.labelCentered}px`);
  t('рамка покрывает панель по ширине', dockOn.coverW > 0.9, `${(dockOn.coverW * 100).toFixed(1)}%`);
  t('и по высоте', dockOn.coverH > 0.8, `${(dockOn.coverH * 100).toFixed(1)}%`);
  t('пунктир заметный (толщина >= 2)', parseFloat(dockOn.strokeW) >= 2, dockOn.strokeW);
  t('обводка пунктирная', /\d/.test(dockOn.dash) && dockOn.dash !== 'none', dockOn.dash);
  t('штрихи анимированы', dockOn.anim === 'struchord-dock-march', dockOn.anim);
  t('и реально движутся', dockOn.moved);
  t('кнопки погашены', dockOn.playGone < 0.05, String(dockOn.playGone));
  t('панель не выросла', dockOn.barH === barBefore, `${barBefore} -> ${dockOn.barH}`);
  t('без курсора над панелью цель не активна', !dockOn.noTarget);

  const restored = await p.evaluate(async () => {
    await new Promise((x) => setTimeout(x, 400));
    return {
      playBack: +getComputedStyle(document.getElementById('btnPlay')).opacity,
      hintShown: getComputedStyle(document.getElementById('transportDockHint')).display !== 'none',
    };
  });
  console.log('   после снятия класса:', JSON.stringify(restored));
  t('панель вернулась к прежнему виду', restored.playBack === 1 && !restored.hintShown,
    `play=${restored.playBack}, hint=${restored.hintShown}`);

  console.log('\n=== 2. Перетаскивание тултипа в панель ===');
  const cell = await p.evaluate(() => {
    const r = document.querySelectorAll('.chord-wrapper')[1].getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });
  const cellTopBefore = await p.evaluate(() =>
    Math.round(document.querySelector('.chord-wrapper').getBoundingClientRect().top));
  await p.mouse.move(cell.x - 25, cell.y - 25);
  await p.mouse.move(cell.x, cell.y);
  await new Promise((r) => setTimeout(r, 950));
  t('тултип всплыл', await p.evaluate(() =>
    document.getElementById('fingering-tooltip').style.display === 'block'));

  const tip = await p.evaluate(() => {
    const r = document.getElementById('fingering-tooltip').getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 8) };
  });
  const barPt = await p.evaluate(() => {
    const r = document.querySelector('.transport-bar').getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
      left: Math.round(r.left), bottom: Math.round(r.bottom) };
  });
  await p.mouse.move(tip.x, tip.y);
  await p.mouse.down();
  // Половина пути — курсор ещё НЕ над панелью: муравьи бегут, цель не активна.
  for (let i = 1; i <= 4; i++) {
    await p.mouse.move(tip.x + (barPt.x - tip.x) * i / 8, tip.y + (barPt.y - tip.y) * i / 8);
    await new Promise((r) => setTimeout(r, 35));
  }
  const mid1 = await p.evaluate(() => ({
    dragging: document.body.classList.contains('is-pin-dragging'),
    target: document.querySelector('.transport-bar').classList.contains('is-drop-target'),
    anim: getComputedStyle(document.querySelector('#transportDockHint rect')).animationName,
  }));
  t('в полёте до панели цель не активна', mid1.dragging && !mid1.target);
  t('муравьи бегут', mid1.anim === 'struchord-dock-march', mid1.anim);
  // Вторая половина — над панелью: «попал».
  for (let i = 5; i <= 8; i++) {
    await p.mouse.move(tip.x + (barPt.x - tip.x) * i / 8, tip.y + (barPt.y - tip.y) * i / 8);
    await new Promise((r) => setTimeout(r, 35));
  }
  const mid2 = await p.evaluate(() => {
    const rect = document.querySelector('#transportDockHint rect');
    return {
      target: document.querySelector('.transport-bar').classList.contains('is-drop-target'),
      dash: getComputedStyle(rect).strokeDasharray,
      anim: getComputedStyle(rect).animationName,
    };
  });
  console.log('   над панелью:', JSON.stringify(mid2));
  t('панель подсвечена как цель', mid2.target);
  t('рамка стала сплошной', mid2.dash === 'none', mid2.dash);
  t('и штрихи остановлены', mid2.anim === 'none', mid2.anim);

  await p.mouse.up();
  await new Promise((r) => setTimeout(r, 700));
  const pinned = await p.evaluate(() => {
    const bar = document.querySelector('.transport-bar').getBoundingClientRect();
    const rowEl = document.getElementById('pinnedRow');
    const row = rowEl.getBoundingClientRect();
    const grid = document.getElementById('sectionsContainer');
    const wrap0 = document.querySelector('.chord-wrapper').getBoundingClientRect();
    return {
      shown: rowEl.style.display !== 'none',
      chord: (document.querySelector('#pinnedFingering .fingering-chord-name') || {}).textContent,
      hasSvg: !!document.querySelector('#pinnedFingering svg'),
      rowLeft: Math.round(row.left), rowTop: Math.round(row.top), rowBottom: Math.round(row.bottom),
      rowH: Math.round(row.height),
      barLeft: Math.round(bar.left), barBottom: Math.round(bar.bottom),
      barH: Math.round(bar.height),
      gridPad: parseFloat(getComputedStyle(grid).paddingTop),
      cellTop: Math.round(wrap0.top),
      cls: document.body.classList.contains('has-pinned-fingering'),
      playBack: +getComputedStyle(document.getElementById('btnPlay')).opacity,
      hintGone: getComputedStyle(document.getElementById('transportDockHint')).display === 'none',
      appearingCleared: !rowEl.classList.contains('is-appearing'),
      state: isFingeringPinned(),
    };
  });
  console.log('   ', JSON.stringify(pinned));
  t('гриф закреплён', pinned.shown && pinned.hasSvg && pinned.state);
  t('показан нужный аккорд', (pinned.chord || '').replace(/\s/g, '') === 'C', pinned.chord);
  t('у НАЧАЛА панели (под play)', Math.abs(pinned.rowLeft - (pinned.barLeft + 16)) <= 2,
    `rowLeft=${pinned.rowLeft}, ожидали ${pinned.barLeft + 16}`);
  t('свисает ПОД панелью', Math.abs(pinned.rowTop - (pinned.barBottom + 10)) <= 2,
    `rowTop=${pinned.rowTop}, barBottom=${pinned.barBottom}`);
  t('панель не выросла', pinned.barH === barBefore, `${barBefore} -> ${pinned.barH}`);
  // Сдвиг = высота ряда + свисание (10) + зазор (8) минус margin панели
  // (20): 216+18-20=214. Константы не зашиваем — коридор вокруг высоты.
  t('сетка сдвинулась на высоту грифа',
    pinned.gridPad >= pinned.rowH - 24 && pinned.gridPad <= pinned.rowH + 18,
    `pad=${pinned.gridPad}, высота ряда ${pinned.rowH}`);
  t('ячейки уехали ровно на сдвиг', pinned.cellTop - cellTopBefore === Math.round(pinned.gridPad),
    `было ${cellTopBefore}, стало ${pinned.cellTop}, pad ${pinned.gridPad}`);
  t('гриф не перекрывает ячейки', pinned.rowBottom <= pinned.cellTop + 2,
    `низ грифа ${pinned.rowBottom}, верх ячейки ${pinned.cellTop}`);
  t('всплывающий тултип скрылся', await p.evaluate(() =>
    document.getElementById('fingering-tooltip').style.display === 'none'));
  t('после сброса панель восстановилась', pinned.playBack === 1 && pinned.hintGone,
    `play=${pinned.playBack}, hintGone=${pinned.hintGone}`);
  t('класс анимации появления снят', pinned.appearingCleared);

  console.log('\n=== 2б. Превью следующего аккорда справа ===');
  const nx = await p.evaluate(() => {
    const nextEl = document.getElementById('pinnedNext');
    const pin = document.getElementById('pinnedFingering').getBoundingClientRect();
    const nr = nextEl.getBoundingClientRect();
    return { shown: nextEl.style.display !== 'none',
      chord: (nextEl.querySelector('.fingering-chord-name') || {}).textContent,
      hasSvg: !!nextEl.querySelector('svg'),
      right: nr.left >= pin.right - 1,
      sameRow: Math.abs(nr.top - pin.top) < 30,
      dashed: getComputedStyle(nextEl).borderTopStyle };
  });
  console.log('   ', JSON.stringify(nx));
  t('превью показано', nx.shown && nx.hasSvg);
  t('это СЛЕДУЮЩИЙ аккорд', (nx.chord || '').replace(/\s/g, '') === 'F', nx.chord);
  t('стоит СПРАВА от закреплённого', nx.right);
  t('в одном ряду с ним', nx.sameRow);
  t('оформлено как превью (пунктир)', nx.dashed === 'dashed', nx.dashed);

  console.log('\n=== 3. Пока закреплён, тултип по наведению не всплывает ===');
  await p.mouse.move(8, 8);
  await new Promise((r) => setTimeout(r, 400));
  const other = await p.evaluate(() => {
    const r = document.querySelectorAll('.chord-wrapper')[3].getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });
  await p.mouse.move(other.x, other.y);
  await new Promise((r) => setTimeout(r, 1000));
  t('всплывающего тултипа нет', await p.evaluate(() =>
    document.getElementById('fingering-tooltip').style.display === 'none'));
  t('закреплённый на месте', await p.evaluate(() =>
    document.getElementById('pinnedRow').style.display !== 'none'));

  console.log('\n=== 4. Следует за воспроизведением ===');
  const pb = await p.evaluate(() => {
    const r = document.getElementById('btnPlay').getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });
  await p.mouse.move(8, 8);
  await p.mouse.click(pb.x, pb.y);
  await new Promise((r) => setTimeout(r, 500));
  if (!(await p.evaluate(() => playbackState.isPlaying))) {
    await p.evaluate(() => playAll());
    await new Promise((r) => setTimeout(r, 500));
  }
  const seen = new Set(), seenNext = new Set();
  for (let i = 0; i < 14; i++) {
    await new Promise((r) => setTimeout(r, 400));
    const c = await p.evaluate(() => ({
      cur: (document.querySelector('#pinnedFingering .fingering-chord-name') || {}).textContent,
      nxt: (document.querySelector('#pinnedNext .fingering-chord-name') || {}).textContent,
    }));
    if (c.cur) seen.add(c.cur.replace(/\s/g, ''));
    if (c.nxt) seenNext.add(c.nxt.replace(/\s/g, ''));
  }
  console.log('      аккорды на закреплённом грифе:', [...seen].join(', '));
  t('гриф менялся вслед за игрой', seen.size > 1, [...seen].join(', '));
  t('превью тоже вело за игрой', seenNext.size > 1, [...seenNext].join(', '));
  await p.evaluate(() => { if (playbackState.isPlaying) playAll(); });
  await new Promise((r) => setTimeout(r, 600));
  const back = await p.evaluate(() => {
    const n = document.querySelector('#pinnedFingering .fingering-chord-name');
    return n ? n.textContent.replace(/\s/g, '') : null;
  });
  t('после остановки вернулся закреплённый аккорд', back === 'C', back);
  t('сдвиг сетки держится всю игру', await p.evaluate(() =>
    parseFloat(getComputedStyle(document.getElementById('sectionsContainer')).paddingTop) > 0));

  console.log('\n=== 4б. Кнопки панели остаются доступны ===');
  const btns = await p.evaluate(() => ['btnPlay', 'btnLoop', 'btnMetronome', 'btnModeToggle']
    .map((id) => {
      const b = document.getElementById(id);
      const r = b.getBoundingClientRect();
      if (r.width === 0) return { id, skip: true };
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { id, ok: !!(el && (el === b || b.contains(el))) };
    }));
  console.log('   ', JSON.stringify(btns));
  t('кнопки панели не перекрыты грифом',
    btns.every((b) => b.skip || b.ok), btns.filter((b) => !b.skip && !b.ok).map((b) => b.id).join(', '));

  console.log('\n=== 5. Открепление: вытащить наружу ===');
  const pinPt = await p.evaluate(() => {
    const r = document.getElementById('pinnedFingering').getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 10) };
  });
  await p.mouse.move(pinPt.x, pinPt.y);
  await p.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await p.mouse.move(pinPt.x + 60 * i, pinPt.y + i * 55);
    await new Promise((r) => setTimeout(r, 35));
  }
  await p.mouse.up();
  await new Promise((r) => setTimeout(r, 600));
  const off = await p.evaluate(() => ({
    pinnedGone: document.getElementById('pinnedRow').style.display === 'none',
    nextGone: document.getElementById('pinnedNext').style.display === 'none',
    state: isFingeringPinned(),
    cls: document.body.classList.contains('has-pinned-fingering'),
    gridPad: parseFloat(getComputedStyle(document.getElementById('sectionsContainer')).paddingTop),
  }));
  console.log('   ', JSON.stringify(off));
  t('гриф откреплён', off.pinnedGone);
  t('превью тоже убрано', off.nextGone);
  t('состояние сброшено', !off.state && !off.cls);
  t('сетка вернулась на место', off.gridPad === 0, `${off.gridPad}px`);

  console.log('\n=== 6. Тултип снова работает по наведению ===');
  await p.mouse.move(8, 8);
  await new Promise((r) => setTimeout(r, 400));
  await p.mouse.move(cell.x, cell.y);
  await new Promise((r) => setTimeout(r, 1000));
  t('всплывающий тултип вернулся', await p.evaluate(() =>
    document.getElementById('fingering-tooltip').style.display === 'block'));

  console.log('\n=== 6б. В ленте док не действует, закрепление снимается ===');
  await p.evaluate(() => {
    currentTooltipWrapper = document.querySelectorAll('.chord-wrapper')[1];
    pinFingeringFromTooltip();
  });
  await new Promise((r) => setTimeout(r, 300));
  t('перед переходом закреплено', await p.evaluate(() => isFingeringPinned()));
  await p.evaluate(() => toggleTimelineMode(true));
  await new Promise((r) => setTimeout(r, 800));
  const inTl = await p.evaluate(async () => {
    // Форсируем класс перетаскивания: подсказка в ленте всё равно
    // обязана молчать (правило стоит позднее показа).
    document.body.classList.add('is-pin-dragging');
    await new Promise((x) => setTimeout(x, 300));
    const hintShown = getComputedStyle(document.getElementById('transportDockHint')).display !== 'none';
    document.body.classList.remove('is-pin-dragging');
    return {
      hintShown,
      unpinned: !isFingeringPinned(),
      pinHidden: document.getElementById('pinnedRow').style.display === 'none',
    };
  });
  console.log('   ', JSON.stringify(inTl));
  t('подсказка в ленте скрыта даже при жесте', !inTl.hintShown);
  t('закрепление снято', inTl.unpinned);
  t('гриф убран', inTl.pinHidden);
  await p.evaluate(() => toggleTimelineMode(false));
  await new Promise((r) => setTimeout(r, 700));

  console.log('\n=== 7. Мобильная раскладка (390px) ===');
  const mp = await br.newPage();
  await mp.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await mp.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1100));
  const mob = await mp.evaluate(async () => {
    sections = [{ id: 1, type: 'Verse', repeat: 1, squares: [{ id: 1, repeat: 1,
      events: [{ chord: 'Am', span: 4 }, { chord: 'C', span: 4 }] }] }];
    nextId = 9; render();
    await new Promise((r) => setTimeout(r, 400));
    const hint = document.getElementById('transportDockHint');
    const restHidden = getComputedStyle(hint).display === 'none';
    currentTooltipWrapper = document.querySelectorAll('.chord-wrapper')[1];
    pinFingeringFromTooltip();
    await new Promise((r) => setTimeout(r, 500));
    const row = document.getElementById('pinnedRow').getBoundingClientRect();
    const bar = document.querySelector('.transport-bar').getBoundingClientRect();
    const W = document.documentElement.clientWidth;
    return { restHidden, inView: row.right <= W + 1, rowLeft: Math.round(row.left),
      barLeft: Math.round(bar.left), W,
      pad: parseFloat(getComputedStyle(document.getElementById('sectionsContainer')).paddingTop) };
  });
  console.log('   ', JSON.stringify(mob));
  t('в покое подсказки нет', mob.restHidden);
  t('ряд у начала панели', Math.abs(mob.rowLeft - (mob.barLeft + 16)) <= 2,
    `rowLeft=${mob.rowLeft}, barLeft=${mob.barLeft}`);
  t('ряд влезает в экран', mob.inView, `right=${mob.rowLeft} при ширине ${mob.W}`);
  t('сетка сдвинулась', mob.pad > 0, `${mob.pad}px`);
  await mp.close();

  t('ошибок страницы нет', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё зелено');
  await br.close();
  process.exit(bad ? 1 : 0);
})();
