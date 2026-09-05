// B-27: дебаунсинг частых событий — КОНТРАКТ СХЛОПЫВАНИЯ.
// Аудит 2026-09-05 показал: ввод и жесты уже схлопнуты ранними волнами
// (B-25 — коммит ввода локальным DOM-sync, B-31 — rAF-превью ресайза и
// границы квадрата, B-32 — rAF-барабан + debounce BPM-коммита). Тест
// запирает это от регрессий: всплески событий НЕ должны рождать
// полный render() на каждое событие и коммиты модели на каждый тик.
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
    schemaVersion: 2, name: 'B-27', bpm: 100,
    globalKey: 'C', keyMode: 'manual', globalTimeSig: '4/4', notes: '',
    sections: [
      { id: 1, type: 'Verse', customName: null, key: null, shift: null, timeSig: null, bpm: null, repeat: 1, strumPattern: null,
        squares: [
          { id: 2, repeat: 1, customBeats: null, strumPattern: null, events: [
            { chord: 'Am', span: 4, timeSig: null, strumPattern: null }] },
          { id: 3, repeat: 1, customBeats: null, strumPattern: null, events: [
            { chord: 'F', span: 4, timeSig: null, strumPattern: null }] },
        ]},
    ],
    nextId: 10, userFingerings: [], preferredFingerings: [], date: '',
  };
  w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
  w.loadSong(0);
  await sleep(300);

  // --- Счётчики: полный render, коммиты BPM, снимки истории ---
  const counters = w.eval(`(() => {
    window.__c = { render: 0, bpm: 0, hist: 0 };
    const origRender = window.render;
    window.render = (...a) => { window.__c.render++; return origRender(...a); };
    const origBpm = window.applyBpmChange;
    window.applyBpmChange = (...a) => { window.__c.bpm++; return origBpm(...a); };
    if (window.scheduleHistorySnapshot) {
      const origHist = window.scheduleHistorySnapshot;
      window.scheduleHistorySnapshot = (...a) => { window.__c.hist++; return origHist(...a); };
    }
    return true;
  })()`);
  ok('счётчики установлены', counters);
  const c = () => w.eval('window.__c');
  const snap = () => JSON.stringify(c());

  console.log('=== 1. Всплеск набора аккорда (10 input-событий) ===');
  const input = d.querySelector('.chord-wrapper[data-sec="1"][data-square="2"][data-ei="0"] .chord-input');
  // Настоящий путь: ввод активируется (клик по ячейке), слушатели
  // blur/keydown вешает activateManualInput.
  w.eval(`activateManualInput(document.querySelector(
    '.chord-wrapper[data-sec="1"][data-square="2"][data-ei="0"] .chord-input'))`);
  const before = c();
  'Cmaj7xxxx'.split('').forEach((ch) => {
    input.value += ch;
    input.dispatchEvent(new w.Event('input', { bubbles: true }));
  });
  await sleep(80);   // пара кадров
  const afterTyping = c();
  ok('ни одного полного render() на 10 нажатий', afterTyping.render === before.render,
    `${before.render} → ${afterTyping.render}`);
  ok('снимков истории — не больше одного на кадр', afterTyping.hist - before.hist <= 2,
    `${before.hist} → ${afterTyping.hist}`);

  console.log('=== 2. Ввод в поле BPM: коммит ДЕБАУНСИТСЯ ===');
  // Свежая страница: в общем DOM фокусные переходы активации ввода
  // порождают лишний 'change' по BPM-полю (легитимный продукт), он
  // шумит базу счётчика; debounce проверяем в чистом окружении.
  {
    const dom2 = new JSDOM(html, {
      runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/',
      beforeParse(win) {
        win.HTMLCanvasElement.prototype.getContext = () => ({
          font: '', measureText: () => ({ width: 10 }), clearRect(){}, beginPath(){},
          arc(){}, fill(){}, stroke(){}, moveTo(){}, lineTo(){}, closePath(){},
          save(){}, restore(){}, translate(){}, rotate(){}, fillText(){},
          strokeText(){}, setTransform(){}, scale(){},
          createLinearGradient: () => ({ addColorStop(){} }),
        });
      },
    });
    const w2 = dom2.window;
    w2.AudioContext = w2.webkitAudioContext = function () {
      return { currentTime: 0, state: 'running', resume() {} };
    };
    await new Promise((r) => w2.addEventListener('load', r));
    w2.localStorage.setItem('struchord_songs', JSON.stringify([song]));
    w2.loadSong(0);
    await sleep(300);
    w2.eval(`(() => {
      window.__bpm = { commits: 0 };
      const oa = window.applyBpmChange;
      window.applyBpmChange = (...a) => { window.__bpm.commits++; return oa(...a); };
    })()`);
    const base = w2.eval('window.__bpm.commits');
    for (let i = 0; i < 5; i++) w2.eval('bumpBpm(1)');
    await sleep(80);
    ok('5 bumpBpm подряд — коммит ещё не прошёл (debounce 260мс)',
      w2.eval('window.__bpm.commits') === base,
      `${base} → ${w2.eval('window.__bpm.commits')}`);
    await sleep(400);
    ok('после тишины — ровно один коммит',
      w2.eval('window.__bpm.commits') === base + 1,
      `${base} → ${w2.eval('window.__bpm.commits')}, bpm=${w2.eval('document.getElementById("bpmInput").value')}`);
    w2.close();
  }

  console.log('=== 3. Ресайз ячейки и граница квадрата — rAF-гейты на месте ===');
  const src = html;
  ok('у движения ручки ресайза есть rAF-гейт (resizeMoveRAF)',
    /pendingResizeClientX/.test(src) && /resizeMoveRAF = requestAnimationFrame/.test(src));
  ok('у превью границы квадрата — свой rAF-гейт (squareResizeRAF)',
    /pendingSquareResizeClientX/.test(src) && /squareResizeRAF = requestAnimationFrame/.test(src));
  ok('барабан BPM рисуется rAF-циклом, а не на каждое движение',
    /bpmDrumLoop/.test(src) && /d\.raf = requestAnimationFrame\(bpmDrumLoop\)/.test(src));

  console.log('=== 4. Коммит аккорда (blur) — без полного render (B-25) ===');
  input.value = 'Fmaj7';
  input.dispatchEvent(new w.Event('blur', { bubbles: true }));
  await sleep(50);
  const afterCommit = c();
  ok('коммит прошёл без полного render()', afterCommit.render === afterTyping.render,
    `${afterTyping.render} → ${afterCommit.render}`);
  const modelChord = w.eval(`sections[0].squares[0].events[0].chord`);
  ok('модель обновлена (Fmaj7)', modelChord === 'Fmaj7', String(modelChord));

  console.log(bad ? `FAIL: ${bad}` : 'ALL OK');
  process.exit(bad ? 1 : 0);
});
