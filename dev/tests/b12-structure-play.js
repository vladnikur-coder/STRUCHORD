#!/usr/bin/env node
/*
 * b12-structure-play.js — B-12.7.2 «Порядок прохода»: воспроизведение строго по
 * знакам структуры.
 *
 * Ходьба идёт через настоящий findNextEvent (тот же, что кормит планировщик
 * звука), поэтому тест читает ровно тот порядок, какой услышит пользователь:
 *  1. Песня без знаков играется как раньше — линейно, с прежними повторами
 *     квадрата «×N» и секции;
 *  2. :| без |: повторяет регион от начала пьесы;
 *  3. |: … :| с вольтами: тело региона играется в каждом проходе, 1-я концовка
 *     только в первом, 2-я — во втором; концовок меньше проходов — играет
 *     последняя;
 *  4. D.C.: назад к началу, «al Fine» кончает пьесу на метке Fine;
 *  5. D.S.: от знака Segno, «al Coda» — до To Coda и прыжок на Coda;
 *  6. один и тот же знак срабатывает один раз (счётчик прыжков против кольца);
 *  7. после прыжка повторы больше не берутся (правило Guitar Pro);
 *  8. зацикливание (Loop) начинается с чистого листа знаков;
 *  9. состояние хода иммутабельно: шаг не меняет переданное состояние, поэтому
 *     превью следующего аккорда не сбивает реальную игру.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'STRUCHORD.html'), 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://localhost/',
  beforeParse(win) {
    win.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    win.cancelAnimationFrame = (id) => clearTimeout(id);
    win.HTMLCanvasElement.prototype.getContext = () => ({
      font: '', measureText: () => ({ width: 10 }),
      clearRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {}, moveTo() {},
      lineTo() {}, closePath() {}, save() {}, restore() {}, translate() {}, rotate() {},
      fillText() {}, strokeText() {}, setTransform() {}, scale() {},
      createLinearGradient: () => ({ addColorStop() {} }),
    });
  },
});
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function () {
  return {
    currentTime: 0, state: 'running', resume() {}, sampleRate: 44100,
    createBuffer: (c, len) => ({ getChannelData: () => new Float32Array(len) }),
  };
};

let pass = 0;
let fail = 0;
function check(name, cond, details) {
  if (cond) {
    pass++;
    console.log('ok   ' + name);
  } else {
    fail++;
    console.error('FAIL ' + name + (details ? ' — ' + details : ''));
  }
}

// Квадраты описаны парами «имя → знаки»: имя потом появляется в порядке игры.
// Секция с повтором «×N» — свойством массива, как в модели секции.
function sec(squares, repeat) {
  return Object.assign(squares, { repeat: repeat || 1 });
}
function sq(name, extra) {
  return {
    id: name.charCodeAt(0), repeat: 1, customBeats: null,
    events: [{ chord: name, span: 4, timeSig: null, strumPattern: null }],
    ...(extra || {}),
  };
}
function song(secSquares, extra) {
  return {
    schemaVersion: 5, metadata: { artist: 'A', title: 'Порядок' }, bpm: 120,
    globalKey: 'C', keyMode: 'manual', globalTimeSig: '4/4', tuning: 'e-std',
    tuningNotes: null, notes: '', parts: [], nextId: 90, rhythmPool: null,
    userFingerings: [], preferredFingerings: [], date: '',
    sections: secSquares.map((squares, i) => ({
      id: 100 + i, type: i === 0 ? 'Verse' : 'Chorus', customName: null, key: null,
      shift: null, timeSig: null, bpm: null, repeat: squares.repeat || 1,
      strumPattern: null, squares,
    })),
    ...(extra || {}),
  };
}

w.addEventListener('load', async () => {
  try {
    // Прогон настоящей ходьбы: тем же findNextEvent, что у планировщика.
    const order = (songData, opts) => {
      w.localStorage.setItem('struchord_songs', JSON.stringify([songData]));
      w.loadSong(0);
      if (opts && opts.looping) w.eval('playbackState.isLooping = true');
      else w.eval('playbackState.isLooping = false');
      return JSON.parse(w.eval(`(function () {
        const sr = {};
        const qr = {};
        let walk = structureWalkState(null);
        const out = [];
        let si = 0, sqi = 0, ei = 0;
        for (let i = 0; i < 200; i++) {
          const next = findNextEvent(si, sqi, ei, sr, qr, walk);
          if (!next) break;
          walk = next.walk;
          out.push(next.event.chord);
          si = next.sectionIndex;
          sqi = next.squareIndex;
          ei = next.eventIndex + 1;
        }
        return JSON.stringify(out);
      })()`));
    };
    const eq = (name, got, want) => check(name, got.join(' ') === want, `получено «${got.join(' ')}», ждали «${want}»`);

    // ================= 1. Прежнее поведение =================
    eq('без знаков песня играется линейно',
      order(song([[sq('A'), sq('B')], [sq('C'), sq('D')]])), 'A B C D');
    eq('«×N» на квадрате играет его подряд, как раньше',
      order(song([[sq('A', { repeat: 3 }), sq('B')]])), 'A A A B');
    eq('повтор секции «×N» работает как раньше',
      order(song([sec([sq('A'), sq('B')], 2)])), 'A B A B');
    eq('повтор секции и квадрата вместе не сбиваются',
      order(song([sec([sq('A', { repeat: 2 })], 2)])), 'A A A A');

    // ================= 2. Черты повтора =================
    eq(':| без |: повторяет регион от начала пьесы',
      order(song([[sq('A'), sq('B'), sq('C', { repeatClose: true, repeat: 2 }), sq('D')]])),
      'A B C A B C D');
    eq('|: … :| повторяет только регион',
      order(song([[sq('A'), sq('B', { repeatOpen: true }), sq('C', { repeatClose: true, repeat: 2 }), sq('D')]])),
      'A B C B C D');
    eq('×1 на закрывающей черте всё равно значит два прохода (как :| в GP)',
      order(song([[sq('A', { repeatClose: true, repeat: 1 })]])), 'A A');
    eq('×3 на закрывающей черте — три прохода',
      order(song([[sq('A'), sq('B', { repeatClose: true, repeat: 3 }), sq('C')]])), 'A B A B A B C');

    // ================= 3. Вольты =================
    eq('1-я концовка играет в первом проходе, 2-я — во втором',
      order(song([[sq('X', { repeatOpen: true }), sq('Y', { volta: 1, repeatClose: true, repeat: 2 }),
        sq('Z', { volta: 2 }), sq('W')]])), 'X Y X Z W');
    eq('тело региона играется в каждом проходе, концовка — своя',
      order(song([[sq('X', { repeatOpen: true }), sq('Y'), sq('V1', { volta: 1, repeatClose: true, repeat: 2 }),
        sq('V2', { volta: 2 }), sq('W')]])), 'X Y V1 X Y V2 W');
    eq('концовок меньше проходов — играет старшая',
      order(song([[sq('X', { repeatOpen: true }), sq('V1', { volta: 1, repeatClose: true, repeat: 3 }),
        sq('V2', { volta: 2 }), sq('W')]])), 'X V1 X X V2 W');
    eq('два региона повтора друг за другом не путаются',
      order(song([[sq('A', { repeatOpen: true }), sq('B', { repeatClose: true, repeat: 2 }),
        sq('C', { repeatOpen: true }), sq('D', { repeatClose: true, repeat: 2 })]])), 'A B A B C D C D');

    // ================= 4. D.C. и Fine =================
    eq('D.C. возвращает к началу пьесы и играет до конца',
      order(song([[sq('A'), sq('B', { jump: { type: 'dc', target: 'end' } })], [sq('C')]])),
      'A B A B C');
    eq('D.C. al Fine кончает пьесу на метке Fine',
      order(song([[sq('A', { mark: 'fine' }), sq('B'), sq('C', { jump: { type: 'dc', target: 'fine' } })]])),
      'A B C A');
    eq('D.C. без метки Fine играет до конца пьесы (без кольца)',
      order(song([[sq('A'), sq('B', { jump: { type: 'dc', target: 'fine' } })]])), 'A B A B');
    eq('знак D.C. срабатывает один раз (без кольца)',
      order(song([[sq('A', { jump: { type: 'dc', target: 'end' } }), sq('B')]])), 'A A B');

    // ================= 5. D.S. и Coda =================
    eq('D.S. играет от знака Segno',
      order(song([[sq('A', { mark: 'segno' }), sq('B'), sq('D', { jump: { type: 'ds', target: 'end' } })]])),
      'A B D A B D');
    eq('D.S. без метки Segno играет с начала, как D.C.',
      order(song([[sq('A'), sq('D', { jump: { type: 'ds', target: 'end' } })]])), 'A D A D');
    eq('D.S. al Coda: до To Coda и прыжок на Coda',
      order(song([[sq('A', { mark: 'segno' }), sq('B', { mark: 'toCoda' })],
        [sq('D', { jump: { type: 'ds', target: 'coda' } }), sq('C', { mark: 'coda' })]])),
      'A B D A B C');
    eq('D.C. al Coda: до To Coda и прыжок на Coda',
      order(song([[sq('A', { mark: 'toCoda' })], [sq('B', { jump: { type: 'dc', target: 'coda' } }),
        sq('C', { mark: 'coda' }), sq('D')]])), 'A B A C D');

    // ================= 6. После прыжка повторы не берутся =================
    eq('после D.C. черты повтора не повторяются',
      order(song([[sq('A', { repeatOpen: true }), sq('B', { repeatClose: true, repeat: 2 }),
        sq('C', { jump: { type: 'dc', target: 'end' } })]])), 'A B A B C A B C');
    eq('после D.S. первые концовки пропускаются',
      order(song([[sq('S', { mark: 'segno', repeatOpen: true }), sq('V1', { volta: 1, repeatClose: true, repeat: 2 }),
        sq('V2', { volta: 2 }), sq('J', { jump: { type: 'ds', target: 'end' } })]])),
      'S V1 S V2 J S V2 J');

    // ================= 7. Зацикливание =================
    const looped = order(song([[sq('A'), sq('B', { jump: { type: 'dc', target: 'end' } })]], { looping: true }), { looping: true });
    check('при Loop знаки срабатывают заново на каждом круге',
      looped.slice(0, 6).join(' ') === 'A B A B A B' && looped.length > 30,
      looped.slice(0, 10).join(' '));

    // ================= 8. Иммутабельность состояния хода =================
    w.localStorage.setItem('struchord_songs', JSON.stringify([song([
      [sq('X', { repeatOpen: true }), sq('Y', { volta: 1, repeatClose: true, repeat: 2 }), sq('Z', { volta: 2 })],
    ])]));
    w.loadSong(0);
    const immut = JSON.parse(w.eval(`(function () {
      const sr = {};
      const qr = {};
      const walk = structureWalkState(null);
      const before = JSON.stringify(walk);
      const first = findNextEvent(0, 0, 0, sr, qr, walk);
      const again = findNextEvent(0, 0, 0, sr, qr, walk);
      return JSON.stringify({ before, after: JSON.stringify(walk), same: first.event.chord === again.event.chord });
    })()`));
    check('шаг хода не меняет переданное состояние (превью не сбивает игру)',
      immut.before === immut.after && immut.same, JSON.stringify(immut));
    const preview = JSON.parse(w.eval(`(function () {
      // Превью считает на копиях счётчиков и на том же состоянии хода —
      // как это делает подсказка «Дальше: …» в панели ленты.
      const sr = {};
      const qr = {};
      let walk = structureWalkState(null);
      const order = [];
      let si = 0, sqi = 0, ei = 0;
      for (let i = 0; i < 12; i++) {
        const next = findNextEvent(si, sqi, ei, sr, qr, walk);
        if (!next) break;
        order.push(next.event.chord);
        walk = next.walk;
        // «Заглядывание вперёд» на копиях счётчиков и на том же состоянии хода —
        // как подсказка «Дальше: …» — не должно ничего сдвинуть.
        findNextEvent(next.sectionIndex, next.squareIndex, next.eventIndex + 1, { ...sr }, { ...qr }, walk);
        si = next.sectionIndex; sqi = next.squareIndex; ei = next.eventIndex + 1;
      }
      return JSON.stringify(order);
    })()`));
    check('превью следующего аккорда не съедает повторы и концовки',
      preview.slice(0, 4).join(' ') === 'X Y X Z' && preview.slice(4, 8).join(' ') === 'X Y X Z',
      preview.join(' '));

    // ================= 9. Настоящий планировщик =================
    // Ходьба проверена напрямую, но звук кормит scheduleNextEvent: убеждаемся,
    // что он идёт тем же порядком (щипок подменяем сборщиком сыгранного).
    w.localStorage.setItem('struchord_songs', JSON.stringify([song([
      [sq('X', { repeatOpen: true }), sq('Y', { volta: 1, repeatClose: true, repeat: 2 }), sq('Z', { volta: 2 })],
    ])]));
    w.loadSong(0);
    const sched = JSON.parse(w.eval(`(function () {
      const ctx = { currentTime: 0, state: 'running', resume: function () {} };
      const heard = [];
      const realPlay = window.playChordScheduled;
      window.playChordScheduled = function (chord) { heard.push(chord); };
      playbackState.isPlaying = true;
      playbackState._sectionRepeatCount = {};
      playbackState._squareRepeatCount = {};
      playbackState._structureWalk = structureWalkState(null);
      playbackState.currentSectionIndex = 0;
      playbackState.currentSquareIndex = 0;
      playbackState.currentEventIndex = 0;
      for (let i = 0; i < 4; i++) {
        ctx.currentTime += 0.05;
        scheduleNextEvent(ctx);
      }
      playbackState.isPlaying = false;
      clearTimeout(playbackState.schedulerTimer);
      playbackState.schedulerTimer = null;
      window.playChordScheduled = realPlay;
      stopPlayback();
      return JSON.stringify(heard);
    })()`));
    check('планировщик звука играет порядок по знакам',
      sched.join(' ') === 'X Y X Z', sched.join(' '));

    console.log(`\nитого: ${pass} ok, ${fail} FAIL`);
    if (fail) process.exitCode = 1;
  } catch (e) {
    console.error('ОШИБКА:', e && e.stack ? e.stack : e);
    process.exitCode = 1;
  }
});
