// B-36 (0.152): превью «Дальше» закреплённого грифа — только во время
// воспроизведения. В покое при закреплении показывается сам гриф БЕЗ
// превью; планировщик во время игры превью ведёт; остановка игры его
// гасит (и возвращает грифу закреплённую форму).
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
    schemaVersion: 2, name: 'B-36', bpm: 100,
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

  const nextDisplay = () => d.getElementById('pinnedNext').style.display;
  const pinnedName = () =>
    ((d.querySelector('#pinnedFingering .fingering-chord-name') || {}).textContent || '').trim();
  const nextName = () =>
    ((d.querySelector('#pinnedNext .fingering-chord-name') || {}).textContent || '').trim();
  // Закрепить через настоящий путь жеста: «тащим тултип ячейки в док».
  const pinCell = (sel) => w.eval(`
    currentTooltipWrapper = document.querySelector('${sel}');
    lastTooltipWrapper = currentTooltipWrapper;
    document.getElementById('fingering-tooltip').dataset.currentShape = 'x,0,2,2,1,0';
    pinFingeringFromTooltip();
  `);

  console.log('=== 1. Закрепление в ПОКОЕ — превью нет ===');
  pinCell('.chord-wrapper[data-sec="1"][data-square="2"][data-ei="0"]');
  ok('закрепление удалось', w.eval('isFingeringPinned()'));
  ok('класс has-pinned-fingering на body', d.body.classList.contains('has-pinned-fingering'));
  ok('гриф показывает закреплённый аккорд Am', pinnedName().includes('Am'), pinnedName());
  ok('превью «Дальше» СКРЫТО в покое', nextDisplay() === 'none', JSON.stringify(nextDisplay()));

  console.log('=== 2. Закрепление ВО ВРЕМЯ ИГРЫ — превью есть ===');
  w.eval('playbackState.isPlaying = true');
  pinCell('.chord-wrapper[data-sec="1"][data-square="3"][data-ei="0"]');
  ok('гриф — новый закреплённый аккорд F', pinnedName().includes('F'), pinnedName());
  ok('превью «Дальше» ВИДНО при игре', nextDisplay() === 'block', JSON.stringify(nextDisplay()));

  console.log('=== 3. Планировщик ведёт ряд: играет C — превью G ===');
  w.eval(`syncPinnedFingeringWithPlayback('C', 4, 5, 0,
    { secId: 4, squareId: 6, eventIndex: 0, chord: 'G' })`);
  ok('гриф — играющий аккорд C', pinnedName().includes('C'), pinnedName());
  ok('превью — следующий аккорд G', nextName().includes('G'), nextName());
  ok('превью видимо', nextDisplay() === 'block', JSON.stringify(nextDisplay()));

  console.log('=== 4. Стоп игры — гриф возвращается к закреплённому, превью гаснет ===');
  w.eval('playbackState.isPlaying = false; restorePinnedFingering()');
  ok('гриф вернул закреплённую форму F', pinnedName().includes('F'), pinnedName());
  ok('превью СКРЫТО после остановки', nextDisplay() === 'none', JSON.stringify(nextDisplay()));

  console.log(bad ? `FAIL: ${bad}` : 'ALL OK');
  process.exit(bad ? 1 : 0);
});
