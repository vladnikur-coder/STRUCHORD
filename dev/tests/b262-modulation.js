#!/usr/bin/env node
// 0.262: модуляция секции — по-настоящему + пилюля тональности на ленте.
//
// Часть 1 — панель модуляции (showSectionModulationControls):
//  - «−»/«+» транспонируют АККОРДЫ секции (раньше — только плашка);
//  - счётчик панели и бейдж шапки показывают СВЕЖИЙ сдвиг (раньше
//    бейдж отставал на шаг: sec.shift писался после синка шапки);
//  - возврат к 0 и кнопка «✕» возвращают исходные аккорды;
//  - undo откатывает модуляцию вместе с аккордами;
//  - в авто-режиме явная модуляция переключает на ручной и считает
//    от текущей (автоопределённой) базы — авто больше не уводит базу.
//
// Часть 2 — пилюля тональности на ленте (как в редакторе, B-80):
//  - разметка: скрытый нативный select + пилюля + список;
//  - подпись пилюли синхронится при входе в ленту (syncTimelineSongBar);
//  - список строится из опций редактора, текущий подсвечен;
//  - выбор пункта пишет select → change → onKeyChange (changeOnly);
//  - зеркало редактор → лента; подпись авто-режима «Am (авто)».
//
// 0.263:
// Часть 8 — энгармоника модуляции: написание ВСЕХ аккордов секции под
//  стиль ЕЁ тональности (диезная песня → бемольная секция Ab — бемоли),
//  undo/redo откатывают коррекцию атомарно; валидация ключа (A#→Bb).
// Часть 9 — наследование: новая секция берёт модуляцию соседа СВЕРХУ
//  (снапшот, не связь); клон больше не теряет сдвиг; перестановка
//  секций не трогает статусы.
// Часть 10 — счётчик «(N модуляций)» рядом с пилюлей: редактор + лента,
//  падежи русского, при нуле скрыт.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM(fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8'), {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/',
  beforeParse(w) {
    w.HTMLCanvasElement.prototype.getContext = () => ({ font: '', measureText: () => ({ width: 10 }),
      clearRect(){}, beginPath(){}, arc(){}, fill(){}, stroke(){}, moveTo(){},
      lineTo(){}, closePath(){}, save(){}, restore(){}, translate(){}, rotate(){},
      fillText(){}, strokeText(){}, setTransform(){}, scale(){}, setLineDash(){},
      createLinearGradient: () => ({ addColorStop(){} }) });
    w.HTMLElement.prototype.scrollIntoView = function () {};
  },
});
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function () {
  return { currentTime: 0, state: 'running', resume() {} };
};
w.prompt = () => 'Бридж'; // jsdom: prompt не реализован
let bad = 0;
const ok = (n, c, x) => { console.log(`   ${c ? 'ok  ' : 'FAIL'} ${n}${!c && x ? ' — ' + x : ''}`); if (!c) bad++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ORIG = ['Am', 'F', 'C', 'G'];

w.addEventListener('load', async () => {
  const d = w.document;
  const evalv = (code) => w.eval(code);
  const chords = () => evalv('sections[0].squares[0].events.map(e=>e.chord)').filter((c) => c && c.trim() !== '');
  const st = () => ({ key: evalv('sections[0].key'), shift: evalv('sections[0].shift') });
  const panel = () => d.querySelector('.section-modulation-controls');
  const pbtn = (t) => panel() && [...panel().querySelectorAll('button')].find((b) => b.textContent.trim() === t);
  const span = () => panel() && panel().querySelector('span');
  const headerBadges = () => d.querySelector('.section-card[data-id="' + evalv('sections[0].id') + '"] .section-mod-badges');

  // --- Подготовка: секция с аккордами Am F C G, тональность C, ручной режим
  evalv("sections = []; globalTimeSig = '4/4'; addSection('Verse');");
  const sid = evalv('sections[0].id');
  evalv("sections[0].squares[0].events.forEach((e, i) => { e.chord = ['Am','F','C','G'][i]; });");
  evalv("globalKey = 'C'; keyMode = 'manual'; DOM.rootKey.value = 'C'; render();");

  console.log('=== 1. Модуляция транспонирует аккорды ===');
  evalv(`showSectionModulationControls(${sid})`);
  ok('панель открылась', !!panel());
  ok('счётчик панели = 0', span() && span().textContent === '0', span() && span().textContent);
  ok('старт: без ключа/сдвига', st().key === null && (st().shift === null || st().shift === undefined), JSON.stringify(st()));
  pbtn('−').click();
  ok('минус1: сдвиг −1', st().shift === -1, JSON.stringify(st()));
  ok('минус1: ключ B (от базы C, валиден без правки)', st().key === 'B', st().key);
  ok('минус1: аккорды транспонированы', JSON.stringify(chords()) === JSON.stringify(['G#m', 'E', 'B', 'F#']), JSON.stringify(chords()));
  ok('минус1: счётчик СВЕЖИЙ (не отстаёт)', span().textContent === '-1', span().textContent);
  pbtn('−').click();
  ok('минус2: сдвиг −2, ключ Bb (валидация: A# нет в списке)', st().shift === -2 && st().key === 'Bb', JSON.stringify(st()));
  ok('минус2: аккорды в бемолях стиля Bb (0.263)', JSON.stringify(chords()) === JSON.stringify(['Gm', 'Eb', 'Bb', 'F']), JSON.stringify(chords()));
  pbtn('+').click();
  ok('плюс: назад к −1, аккорды вернулись', st().shift === -1 && JSON.stringify(chords()) === JSON.stringify(['G#m', 'E', 'B', 'F#']), JSON.stringify(st()) + ' ' + JSON.stringify(chords()));
  pbtn('+').click();
  ok('возврат к 0: ключ/сдвиг сняты, аккорды = оригинал',
    st().key === null && (st().shift === null || st().shift === undefined) && JSON.stringify(chords()) === JSON.stringify(ORIG), JSON.stringify(st()) + ' ' + JSON.stringify(chords()));
  pbtn('+').click();
  ok('плюс вверх: +1, ключ Db (валидация: C# нет в списке)', st().shift === 1 && st().key === 'Db', JSON.stringify(st()));
  ok('плюс вверх: аккорды в бемолях стиля Db (0.263)', JSON.stringify(chords()) === JSON.stringify(['Bbm', 'Gb', 'Db', 'Ab']), JSON.stringify(chords()));

  console.log('\n=== 2. Бейдж шапки и сброс ===');
  const bd = headerBadges();
  ok('бейдж модуляции в шапке: «модуляция +1»', bd && /модуляция\s*\+1/.test(bd.textContent), bd && bd.textContent.trim());
  pbtn('✕').click();
  ok('сброс: панель закрылась', !panel());
  ok('сброс: ключ/сдвиг сняты', st().key === null && st().shift === null, JSON.stringify(st()));
  ok('сброс: аккорды возвращены', JSON.stringify(chords()) === JSON.stringify(ORIG), JSON.stringify(chords()));
  ok('сброс: бейдж исчез', headerBadges() && !/модуляция/.test(headerBadges().textContent), headerBadges() && headerBadges().textContent.trim());

  console.log('\n=== 3. Undo откатывает модуляцию с аккордами ===');
  await sleep(500); // модуляция улеглась в снимок истории
  evalv(`showSectionModulationControls(${sid})`);
  pbtn('−').click();
  ok('модуляция −1 записана', st().shift === -1 && chords()[0] === 'G#m', JSON.stringify(st()) + ' ' + chords()[0]);
  await sleep(500); // снимок «после модуляции» зафиксирован
  w.undoEdit();
  await sleep(100); // восстановление синхронно, флаг сбрасывается через rAF
  ok('undo: сдвиг снят', st().key === null && st().shift === null, JSON.stringify(st()));
  ok('undo: аккорды восстановлены', JSON.stringify(chords()) === JSON.stringify(ORIG), JSON.stringify(chords()));

  console.log('\n=== 4. Авто-режим уступает модуляции ===');
  evalv('switchToAutoKeyMode()');
  ok('авто определил Am по аккордам', evalv('globalKey') === 'Am' && evalv('keyMode') === 'auto', evalv('globalKey') + '/' + evalv('keyMode'));
  evalv(`showSectionModulationControls(${sid})`);
  pbtn('−').click();
  ok('модуляция переключила на ручной режим', evalv('keyMode') === 'manual', evalv('keyMode'));
  ok('база НЕ уехала (Am)', evalv('globalKey') === 'Am', evalv('globalKey'));
  ok('ключ секции G#m от базы Am', st().key === 'G#m' && st().shift === -1, JSON.stringify(st()));
  ok('аккорды транспонированы от Am', JSON.stringify(chords()) === JSON.stringify(['G#m', 'E', 'B', 'F#']), JSON.stringify(chords()));
  ok('селектор редактора показывает ручную тональность', d.getElementById('rootKey').value === 'Am', d.getElementById('rootKey').value);

  console.log('\n=== 5. Пилюля тональности на ленте ===');
  evalv('toggleTimelineMode(); renderTimeline(); attachTimelineSongBar(); syncTimelineSongBar();');
  const tlSel = d.getElementById('tlRootKey'), tlPill = d.getElementById('tlKeyPill'),
        tlName = d.getElementById('tlKeyPillName'), tlList = d.getElementById('tlKeyPickerList');
  ok('разметка: select + пилюля + подпись + список', !!tlSel && !!tlPill && !!tlName && !!tlList);
  ok('нативный select скрыт (meta-select-native)', tlSel.classList.contains('meta-select-native'));
  ok('обёртка больше не label (клик не дёргает нативный select)', tlSel.parentElement.tagName === 'SPAN', tlSel.parentElement.tagName);
  ok('опции скопированы из редактора (25)', tlSel.options.length === 25, tlSel.options.length + '');
  ok('подпись пилюли = текущая тональность при входе в ленту', tlName.textContent === 'Am', tlName.textContent);
  evalv("toggleMetaPicker('tlKey', true)");
  ok('список открылся', !tlList.hidden);
  ok('пункты построены (с группами)', tlList.children.length >= 25, tlList.children.length + '');
  ok('текущий пункт подсвечен', !!tlList.querySelector('.is-current'));
  ok('смещение списка посчитано от шапки ленты', tlList.style.getPropertyValue('--meta-list-left') !== '', tlList.style.getPropertyValue('--meta-list-left'));
  evalv("toggleMetaPicker('key', true)");
  evalv("toggleMetaPicker('tlKey', true)");
  ok('открытие ленточного закрывает редакторский', d.getElementById('keyPickerList').hidden === true);
  evalv("toggleMetaPicker('tlKey', false)");
  ok('закрылся', tlList.hidden && tlPill.getAttribute('aria-expanded') === 'false');

  console.log('\n=== 6. Выбор в пилюле ленты ===');
  evalv("showKeyChangeConfirm = (o, n) => Promise.resolve('changeOnly')");
  evalv("toggleMetaPicker('tlKey', true)");
  const itemG = [...tlList.querySelectorAll('.meta-pill-item')].find((li) => li.dataset.value === 'G');
  ok('пункт G в списке', !!itemG);
  itemG.click();
  await sleep(150); // change → onKeyChange → RAF-зеркало syncTimelineSongBar
  ok('select ленты = G', tlSel.value === 'G', tlSel.value);
  ok('зеркало: селектор редактора = G', d.getElementById('rootKey').value === 'G', d.getElementById('rootKey').value);
  ok('globalKey = G (changeOnly, аккорды не тронуты)', evalv('globalKey') === 'G' && JSON.stringify(chords()) === JSON.stringify(['G#m', 'E', 'B', 'F#']), evalv('globalKey') + ' ' + JSON.stringify(chords()));
  ok('подпись пилюли обновилась', tlName.textContent === 'G', tlName.textContent);
  ok('список закрылся после выбора', tlList.hidden);

  console.log('\n=== 7. Зеркало редактор → лента и авто-подпись ===');
  evalv("DOM.rootKey.value = 'D'; DOM.rootKey.dispatchEvent(new Event('change'));");
  await sleep(150);
  ok('лента увидела D', tlSel.value === 'D' && tlName.textContent === 'D', tlSel.value + '/' + tlName.textContent);
  evalv('switchToAutoKeyMode()');
  await sleep(50);
  w.eval('syncTimelineSongBar()');
  ok('авто: value = auto', tlSel.value === 'auto', tlSel.value);
  ok('авто: подпись с бейджем «(авто)»', /\(авто\)/.test(tlName.textContent), tlName.textContent);

  console.log('\n=== 8. Энгармоника: бемоли в бемольной секции (0.263) ===');
  evalv("sections = []; globalTimeSig = '4/4'; addSection('Verse');");
  const sid8 = evalv('sections[0].id');
  evalv("globalKey = 'C'; keyMode = 'manual'; DOM.rootKey.value = 'C'; render();");
  evalv("sections[0].squares[0].events.forEach((e, i) => { e.chord = ['C','F','G','D'][i]; }); render();");
  await sleep(500); // разорвать цепочку фиксаций истории (как в части 3)
  evalv(`showSectionModulationControls(${sid8})`);
  for (let i = 0; i < 4; i++) pbtn('−').click();
  ok('C −4: ключ Ab (валидированный, не G#)', st().key === 'Ab' && st().shift === -4, JSON.stringify(st()));
  ok('аккорды в бемолях стиля Ab', JSON.stringify(chords()) === JSON.stringify(['Ab', 'Db', 'Eb', 'Bb']), JSON.stringify(chords()));
  await sleep(500);
  w.undoEdit();
  await sleep(100);
  ok('undo откатил модуляцию с коррекцией', st().key === null && JSON.stringify(chords()) === JSON.stringify(['C', 'F', 'G', 'D']), JSON.stringify(st()) + ' ' + JSON.stringify(chords()));
  w.redoEdit();
  await sleep(100);
  ok('redo вернул бемольную секцию', st().key === 'Ab' && JSON.stringify(chords()) === JSON.stringify(['Ab', 'Db', 'Eb', 'Bb']), JSON.stringify(chords()));
  // обратный кейс: бемольная песня → диезная секция
  evalv(`showSectionModulationControls(${sid8})`); pbtn('✕').click(); // снять модуляцию
  evalv("globalKey = 'F'; DOM.rootKey.value = 'F'; render();");
  evalv("sections[0].squares[0].events.forEach((e, i) => { e.chord = ['Bb','F','C','G'][i]; }); render();");
  evalv(`showSectionModulationControls(${sid8})`); pbtn('+').click();
  ok('F +1: секция F# (диезная в бемольной песне)', st().key === 'F#' && st().shift === 1, JSON.stringify(st()));
  ok('аккорды в диезах стиля F#', JSON.stringify(chords()) === JSON.stringify(['B', 'F#', 'C#', 'G#']), JSON.stringify(chords()));
  // бемольный аккорд после транспонирования переписывается под стиль
  // диезной секции (охват «все аккорды», выбор пользователя)
  evalv(`showSectionModulationControls(${sid8})`); pbtn('✕').click();
  evalv("sections[0].squares[0].events.forEach((e, i) => { e.chord = ['Bb','Eb','Ab','F'][i]; }); render();");
  evalv(`showSectionModulationControls(${sid8})`); pbtn('+').click(); pbtn('+').click();
  ok('F +2: секция G, бемоль Ab+Bb → диез A#',
    st().key === 'G' && st().shift === 2 && JSON.stringify(chords()) === JSON.stringify(['C', 'F', 'A#', 'G']),
    JSON.stringify(st()) + ' ' + JSON.stringify(chords()));

  console.log('\n=== 9. Наследование модуляции и клон (0.263) ===');
  evalv("sections = []; globalKey = 'C'; keyMode = 'manual'; DOM.rootKey.value = 'C'; render();");
  evalv("addSection('Verse')"); // первая — без соседа сверху
  await sleep(80); // карточка должна отрисоваться: панель ищет кнопку в DOM
  ok('первая секция без модуляции', evalv('sections[0].key') === null);
  evalv(`showSectionModulationControls(${evalv('sections[0].id')})`);
  pbtn('+').click(); pbtn('+').click();
  ok('секция 1 модулирована (+2 → D)', evalv('sections[0].key') === 'D' && evalv('sections[0].shift') === 2, JSON.stringify({ k: evalv('sections[0].key'), s: evalv('sections[0].shift') }));
  evalv("addSection('Chorus')");
  ok('новая секция наследует модуляцию соседа сверху',
    evalv('sections[1].key') === 'D' && evalv('sections[1].shift') === 2, JSON.stringify({ k: evalv('sections[1].key'), s: evalv('sections[1].shift') }));
  await sleep(80);
  evalv(`showSectionModulationControls(${evalv('sections[1].id')})`); pbtn('✕').click();
  evalv("addSection('Verse')");
  ok('после безмодуляционной — без модуляции', evalv('sections[2].key') === null && evalv('sections[2].shift') === null);
  evalv(`cloneSection(${evalv('sections[0].id')})`);
  // клон вставляется СРАЗУ ПОСЛЕ оригинала → индекс 1
  ok('клон несёт и ключ, и сдвиг (фикс потери shift)',
    evalv('sections[1].key') === 'D' && evalv('sections[1].shift') === 2, JSON.stringify({ k: evalv('sections[1].key'), s: evalv('sections[1].shift') }));
  await sleep(80);
  evalv(`showSectionModulationControls(${evalv('sections[3].id')})`); pbtn('+').click();
  ok('последняя секция модулирована (+1 → Db)', evalv('sections[3].key') === 'Db' && evalv('sections[3].shift') === 1, JSON.stringify({ k: evalv('sections[3].key'), s: evalv('sections[3].shift') }));
  w.addCustomSection('Бридж');
  ok('кастомная секция тоже наследует (от последней)',
    evalv('sections[4].key') === 'Db' && evalv('sections[4].shift') === 1, JSON.stringify({ k: evalv('sections[4].key'), s: evalv('sections[4].shift') }));
  // перестановка (механика drag = splice) не трогает статусы
  const beforeMove = evalv('JSON.stringify(sections.map(s=>[s.key,s.shift]))');
  evalv("songStore.dispatch('test/move', () => { const [m] = sections.splice(0, 1); sections.splice(2, 0, m); }); render();");
  const afterMove = evalv('JSON.stringify(sections.map(s=>[s.key,s.shift]))');
  ok('перестановка секций не меняет статусы модуляции',
    beforeMove.split('],[').sort().join('|') === afterMove.split('],[').sort().join('|'), beforeMove + ' → ' + afterMove);

  console.log('\n=== 10. Счётчик модуляций (0.263) ===');
  const mc = () => d.getElementById('modCount');
  const tlmc = () => d.getElementById('tlModCount');
  await sleep(80); // renderMetaLayer — по requestRender
  ok('4 модулированные секции → «(4 модуляции)»', mc().textContent === '(4 модуляции)', mc().textContent);
  await sleep(80);
  evalv(`showSectionModulationControls(${evalv('sections[0].id')})`); pbtn('✕').click();
  await sleep(80);
  ok('сброс одной → «(3 модуляции)»', mc().textContent === '(3 модуляции)', mc().textContent);
  // падежи
  // заглушки-секции для больших чисел (syncModulationCount читает только s.key)
  evalv("for (let i = sections.length; i < 22; i++) sections.push({ id: 900 + i, type: 'Verse', squares: [], key: null });");
  const setN = (n) => { evalv(`sections.forEach((s, i) => { s.key = i < ${n} ? 'D' : null; }); syncModulationCount();`); };
  const cases = [[1, '(1 модуляция)'], [2, '(2 модуляции)'], [5, '(5 модуляций)'], [11, '(11 модуляций)'], [21, '(21 модуляция)'], [22, '(22 модуляции)']];
  let plur = true, plx = '';
  for (const [n, exp] of cases) { setN(n); if (mc().textContent !== exp) { plur = false; plx += n + '→«' + mc().textContent + '» '; } }
  ok('падежи: 1 модуляция / 2 модуляции / 5 модуляций / 11 / 21 / 22', plur, plx);
  evalv("sections.forEach(s => { s.key = null; }); syncModulationCount();");
  ok('при нуле скрыт', mc().hidden === true && mc().textContent === '', JSON.stringify({ h: mc().hidden, t: mc().textContent }));
  await sleep(80);
  evalv(`showSectionModulationControls(${evalv('sections[1].id')})`); pbtn('+').click();
  await sleep(80);
  evalv('toggleTimelineMode(); renderTimeline(); attachTimelineSongBar(); syncTimelineSongBar();');
  ok('на ленте тот же счётчик «(1 модуляция)»', tlmc().textContent === '(1 модуляция)', tlmc().textContent);

  console.log(`\n${bad ? 'FAIL: ' + bad : 'OK'} (${bad ? 'есть провалы' : 'все проверки прошли'})`);
  if (bad) process.exitCode = 1;
});
