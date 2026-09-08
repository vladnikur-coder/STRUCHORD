// B-58: триоли недоступны в простых чётных размерах (2/4, 4/4, 8/8).
//
// Решение пользователя 2026-09-06: «уберём sub3 из чётных размеров»,
// уточнено — только простые чётные. 6/8 остаётся с тройками: это
// СОСТАВНОЙ размер, там доля делится на три по своей природе.
// Старые песни с sub3 в чётном размере «не поддерживаются в новой
// версии» — сворачиваем в свинг, если это была свинговая запись.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8');
let bad = 0;
const ok = (n, c, x) => { console.log(`   ${c ? 'ok  ' : 'FAIL'} ${n}${!c && x ? ' — ' + x : ''}`); if (!c) bad++; };

const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/',
  beforeParse(w) { w.HTMLCanvasElement.prototype.getContext = () => ({ font: '', measureText: () => ({ width: 10 }),
    clearRect(){},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},closePath(){},save(){},restore(){},
    translate(){},rotate(){},fillText(){},strokeText(){},setTransform(){},scale(){},setLineDash(){},
    createLinearGradient:()=>({addColorStop(){}}) }); } });
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function () { return { currentTime: 0, state: 'running', resume() {} }; };

w.addEventListener('load', () => {
  console.log('=== 1. Где триоли запрещены ===');
  const allows = (ts) => w.eval(`timeSigAllowsTriplets('${ts}')`);
  ok('2/4 без триолей', allows('2/4') === false);
  ok('4/4 без триолей', allows('4/4') === false);
  ok('8/8 без триолей', allows('8/8') === false);
  console.log('=== 2. Где остаются ===');
  ok('3/4 с триолями (нечётный)', allows('3/4') === true);
  ok('5/4 с триолями (нечётный)', allows('5/4') === true);
  ok('7/8 с триолями (нечётный)', allows('7/8') === true);
  ok('6/8 с триолями (СОСТАВНОЙ, хоть и чётный)', allows('6/8') === true);

  console.log('=== 3. Кнопка «3» в редакторе ===');
  const openFor = (ts) => {
    const song = { name: 't', bpm: 100, globalKey: 'C', globalTimeSig: ts,
      sections: [{ id: 's1', name: 'A', timeSig: ts,
        strumPattern: { mode: 'strum', subdivision: 2, steps: ['D', 'U'] },
        squares: [{ id: 'q1', events: [{ chord: 'Am', span: 4 }] }] }] };
    w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
    w.loadSong(0);
    const secId = JSON.parse(w.eval('JSON.stringify(sections[0].id)'));
    w.openStrumPatternEditor('section', secId);
    const btn = Array.from(w.document.querySelectorAll('.pattern-sub-btn'))
      .find((b) => b.dataset.sub === '3');
    const hidden = !btn || btn.hidden;
    const cancel = w.document.querySelector('#cancel-pattern');
    if (cancel && cancel.onclick) cancel.onclick();
    return hidden;
  };
  ok('в 4/4 кнопка «3» спрятана', openFor('4/4') === true);
  ok('в 3/4 кнопка «3» видна', openFor('3/4') === false);
  ok('в 6/8 кнопка «3» видна', openFor('6/8') === false);

  console.log('=== 4. Триольные пресеты не предлагаются в 4/4 ===');
  const compat = (sub, ts) => w.eval(
    `isPresetCompatible({ base: 1, subdivision: ${sub} }, '${ts}', 4)`);
  ok('sub3-пресет несовместим с 4/4', compat(3, '4/4') === false);
  ok('sub2-пресет совместим с 4/4', compat(2, '4/4') === true);
  ok('sub3-пресет совместим с 3/4', compat(3, '3/4') === true);

  console.log('=== 5. Импорт: sub3 в 4/4 не проходит как есть ===');
  const load = (ts, pat) => {
    const song = { name: 't', bpm: 100, globalKey: 'C', globalTimeSig: ts,
      sections: [{ id: 's1', name: 'A', timeSig: ts, strumPattern: pat,
        squares: [{ id: 'q1', events: [{ chord: 'Am', span: 4 }] }] }] };
    w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
    w.loadSong(0);
    return JSON.parse(w.eval('JSON.stringify(sections[0].strumPattern)'));
  };
  // Свинговая запись (средняя треть пуста) — сворачивается, звук тот же.
  const swung = load('4/4', { mode: 'strum', subdivision: 3,
    steps: ['D', null, null, 'D', null, 'U', null, null, 'U', 'D', null, 'U'] });
  ok('свинговый sub3 в 4/4 свернулся в sub2+swing',
     swung && swung.subdivision === 2 && swung.swing === true, JSON.stringify(swung));
  // Настоящая триоль в 4/4 — рисунок отбрасывается (не поддерживается).
  const real = load('4/4', { mode: 'strum', subdivision: 3,
    steps: ['D', 'U', 'D', 'D', 'U', 'D', 'D', 'U', 'D', 'D', 'U', 'D'] });
  ok('настоящая триоль в 4/4 не осела как sub3',
     !real || real.subdivision !== 3, JSON.stringify(real));
  // В 6/8 триоль обязана уцелеть.
  const kept = load('6/8', { mode: 'strum', subdivision: 3,
    steps: ['D', 'U', 'D', 'D', 'U', 'D', 'D', 'U', 'D', 'D', 'U', 'D', 'D', 'U', 'D', 'D', 'U', 'D'] });
  ok('в 6/8 триоль сохранилась', kept && kept.subdivision === 3, JSON.stringify(kept));

  console.log(bad ? `\nFAIL: ${bad}` : '\nALL OK');
  if (bad) process.exitCode = 1;
});
