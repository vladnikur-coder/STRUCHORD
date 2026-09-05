// B-37 (0.153): закреплённая карточка — «просмотрщик». В ПОКОЕ наведение
// на ячейку показывает её аккорд в самой карточке (тултип подавлен);
// мышь ушла с ячеек — возврат к закреплённому аккорду; во время игры
// ховер не действует (карточку ведёт планировщик); превью «Дальше»
// в покое по-прежнему скрыто (B-36).
const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://localhost/',
  beforeParse(win) {
    win.HTMLCanvasElement.prototype.getContext = () => ({
      font: '', measureText: () => ({ width: 10 }),
      clearRect(){}, beginPath(){}, arc(){}, fill(){}, stroke(){}, moveTo(){},
      lineTo(){}, closePath(){}, save(){}, restore(){}, translate(){}, rotate(){},
      fillText(){}, strokeText(){}, setTransform(){}, scale(){},
      createLinearGradient: () => ({ addColorStop(){} }),
    });
  },
});
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function () {
  return { currentTime: 0, state: 'running', resume() {} };
};
let bad = 0;
const ok = (n, c, x) => { console.log(`   ${c ? 'ok  ' : 'FAIL'} ${n}${!c && x ? ' — ' + x : ''}`); if (!c) bad++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

w.addEventListener('load', async () => {
  const d = w.document;
  const song = {
    schemaVersion: 2, name: 'B-37', bpm: 100,
    globalKey: 'C', keyMode: 'manual', globalTimeSig: '4/4', notes: '',
    sections: [
      { id: 1, type: 'Verse', customName: null, key: null, shift: null, timeSig: null, bpm: null, repeat: 1, strumPattern: null,
        squares: [
          { id: 2, repeat: 1, customBeats: null, strumPattern: null, events: [
            { chord: 'Am', span: 4, timeSig: null, strumPattern: null }] },
          { id: 3, repeat: 1, customBeats: null, strumPattern: null, events: [
            { chord: 'F', span: 4, timeSig: null, strumPattern: null }] },
        ]},
      { id: 4, type: 'Chorus', customName: null, key: null, shift: null, timeSig: null, bpm: null, repeat: 1, strumPattern: null,
        squares: [
          { id: 5, repeat: 1, customBeats: null, strumPattern: null, events: [
            { chord: 'C', span: 4, timeSig: null, strumPattern: null }] },
          { id: 6, repeat: 1, customBeats: null, strumPattern: null, events: [
            { chord: 'G', span: 4, timeSig: null, strumPattern: null }] },
        ]},
    ],
    nextId: 10, userFingerings: [], preferredFingerings: [], date: '',
  };
  w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
  w.loadSong(0);
  await sleep(300);

  const rowName = () =>
    ((d.querySelector('#pinnedFingering .fingering-chord-name') || {}).textContent || '').trim();
  const nextDisplay = () => d.getElementById('pinnedNext').style.display;
  const hover = (sel) =>
    d.querySelector(sel).dispatchEvent(new w.MouseEvent('mouseover', { bubbles: true }));
  const pinCell = (sel) => w.eval(`
    currentTooltipWrapper = document.querySelector('${sel}');
    lastTooltipWrapper = currentTooltipWrapper;
    document.getElementById('fingering-tooltip').dataset.currentShape = 'x,0,2,2,1,0';
    pinFingeringFromTooltip();
  `);

  console.log('=== 1. Закреп в покое, ховер ячейки F — карточка показывает F ===');
  pinCell('.chord-wrapper[data-sec="1"][data-square="2"][data-ei="0"]');
  ok('закреп: карточка Am', rowName().includes('Am'), rowName());
  hover('.chord-wrapper[data-sec="1"][data-square="3"][data-ei="0"] .chord-input');
  await sleep(250);   // 0.154: ховер-смена — анимация свапа
  ok('ховер F → карточка F', rowName().includes('F'), rowName());
  ok('тултип по-прежнему подавлен',
    d.getElementById('fingering-tooltip').style.display === 'none');
  ok('превью «Дальше» скрыто и при ховере (B-36)', nextDisplay() === 'none');

  console.log('=== 2. Ховер другой ячейки (G) — карточка едет дальше ===');
  hover('.chord-wrapper[data-sec="4"][data-square="6"][data-ei="0"] .chord-input');
  await sleep(250);
  ok('ховер G → карточка G', rowName().includes('G'), rowName());

  console.log('=== 3. Мышь ушла с ячеек (300мс таймер) — возврат к Am ===');
  d.body.dispatchEvent(new w.MouseEvent('mouseover', { bubbles: true }));
  await sleep(450);
  ok('карточка вернула закреплённый Am', rowName().includes('Am'), rowName());
  ok('hover-режим сброшен', w.eval('pinnedHoverWrapper') === null);

  console.log('=== 4. Во время игры ховер НЕ действует ===');
  w.eval(`playbackState.isPlaying = true;
    syncPinnedFingeringWithPlayback('C', 4, 5, 0, { secId: 4, squareId: 6, eventIndex: 0, chord: 'G' })`);
  hover('.chord-wrapper[data-sec="1"][data-square="3"][data-ei="0"] .chord-input');
  await sleep(250);
  ok('играет C — ховер F проигнорирован, карточка C', rowName().includes('C'), rowName());
  w.eval('playbackState.isPlaying = false; restorePinnedFingering()');
  await sleep(250);
  ok('стоп — карточка вернула закреплённый Am', rowName().includes('Am'), rowName());

  console.log('=== 5. Открепление во время ховера — ряд скрыт, режим чист ===');
  hover('.chord-wrapper[data-sec="1"][data-square="3"][data-ei="0"] .chord-input');
  await sleep(250);
  ok('ховер F → карточка F', rowName().includes('F'), rowName());
  w.eval('unpinFingering()');
  ok('ряд скрыт после открепления', d.getElementById('pinnedRow').style.display === 'none');
  ok('hover-режим сброшен при откреплении', w.eval('pinnedHoverWrapper') === null);

  console.log(bad ? `FAIL: ${bad}` : 'ALL OK');
  process.exit(bad ? 1 : 0);
});
