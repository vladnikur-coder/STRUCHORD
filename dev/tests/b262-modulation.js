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
  ok('минус1: ключ B (от базы C)', st().key === 'B', st().key);
  ok('минус1: аккорды транспонированы', JSON.stringify(chords()) === JSON.stringify(['G#m', 'E', 'B', 'F#']), JSON.stringify(chords()));
  ok('минус1: счётчик СВЕЖИЙ (не отстаёт)', span().textContent === '-1', span().textContent);
  pbtn('−').click();
  ok('минус2: сдвиг −2, ключ A#', st().shift === -2 && st().key === 'A#', JSON.stringify(st()));
  ok('минус2: аккорды ещё на полтона ниже', JSON.stringify(chords()) === JSON.stringify(['Gm', 'D#', 'A#', 'F']), JSON.stringify(chords()));
  pbtn('+').click();
  ok('плюс: назад к −1, аккорды вернулись', st().shift === -1 && JSON.stringify(chords()) === JSON.stringify(['G#m', 'E', 'B', 'F#']), JSON.stringify(st()) + ' ' + JSON.stringify(chords()));
  pbtn('+').click();
  ok('возврат к 0: ключ/сдвиг сняты, аккорды = оригинал',
    st().key === null && (st().shift === null || st().shift === undefined) && JSON.stringify(chords()) === JSON.stringify(ORIG), JSON.stringify(st()) + ' ' + JSON.stringify(chords()));
  pbtn('+').click();
  ok('плюс вверх: +1, ключ C#', st().shift === 1 && st().key === 'C#', JSON.stringify(st()));
  ok('плюс вверх: аккорды выше', JSON.stringify(chords()) === JSON.stringify(['A#m', 'F#', 'C#', 'G#']), JSON.stringify(chords()));

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

  console.log(`\n${bad ? 'FAIL: ' + bad : 'OK'} (${bad ? 'есть провалы' : 'все проверки прошли'})`);
  if (bad) process.exitCode = 1;
});
