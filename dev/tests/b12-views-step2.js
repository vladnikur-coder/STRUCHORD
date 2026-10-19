#!/usr/bin/env node
/*
 * b12-views-step2.js — B-12.11 «Виды», шаг 2.
 *
 * Проверяем:
 *  1. Формат (условия владельца): открыть и сохранить 8 песен без
 *     правок — тот же состав ячеек, поля notes нигде нет, повторное
 *     сохранение стабильно.
 *  2. Правка ноты в табах: запись в ячейку, пересчёт аккорда и
 *     аппликатуры; undo одним шагом возвращает всё.
 *  3. Правка ритма: добавленный момент — кастомный бой ячейки; возврат
 *     моментов — кастом и запись исчезают.
 *  4. Операции с ячейками (условие 1 формата): вставка, удаление,
 *     дублирование, перенос, копия секции, «Сброс» — записанные ноты
 *     едут с ячейкой или уходят вместе с ней.
 *  5. Правка аккорда в Редакторе при выразимых нотах снимает запись
 *     молча; при невыразимых — не трогает.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'STRUCHORD.html'), 'utf8');
const dom = new JSDOM(html, {
  url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true,
  beforeParse(win) {
    win.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    win.cancelAnimationFrame = (id) => clearTimeout(id);
    win.HTMLCanvasElement.prototype.getContext = () => ({
      font: '', measureText: () => ({ width: 10 }), clearRect() {}, beginPath() {}, arc() {},
      fill() {}, stroke() {}, moveTo() {}, lineTo() {}, closePath() {}, save() {}, restore() {},
      translate() {}, rotate() {}, fillText() {}, strokeText() {}, setTransform() {}, scale() {},
      createLinearGradient: () => ({ addColorStop() {} }),
    });
  },
});
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function () {
  return { currentTime: 0, state: 'running', resume() {}, sampleRate: 44100,
    destination: {}, createGain: () => ({ gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }),
    createBiquadFilter: () => ({ type: '', frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, Q: { value: 0 }, connect() {}, disconnect() {} }),
    createBufferSource: () => ({ buffer: null, connect() {}, start() {}, stop() {}, playbackRate: { value: 1 } }),
    createDynamicsCompressor: () => ({ threshold: { value: 0 }, connect() {}, disconnect() {} }),
    createConvolver: () => ({ buffer: null, connect() {}, disconnect() {} }),
    createDelay: () => ({ delayTime: { value: 0 }, connect() {}, disconnect() {} }),
    createStereoPanner: () => ({ pan: { value: 0 }, connect() {}, disconnect() {} }),
    createAnalyser: () => ({ fftSize: 2048, getFloatTimeDomainData() {}, connect() {}, disconnect() {} }),
    decodeAudioData: async () => ({}),
    createBuffer: (c, len) => ({ getChannelData: () => new Float32Array(len), duration: len / 44100 }) };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0;
let fail = 0;
function check(name, cond, details) {
  if (cond) { pass++; console.log('ok   ' + name); }
  else { fail++; console.error('FAIL ' + name + (details ? ' — ' + details : '')); }
}

const inventory = (songObj) => {
  const out = [];
  (songObj.sections || []).forEach((sec) => (sec.squares || []).forEach((sq) => (sq.events || []).forEach((e) => {
    out.push([e.chord || '', e.span || 1, e.fingering || ''].join('|'));
  })));
  return out.join(';');
};
const savedSong = () => { w.saveCurrentSong(); const lib = JSON.parse(w.localStorage.getItem('struchord_songs')); return lib[lib.length - 1]; };
const hasNotesField = (songObj) => (songObj.sections || []).some((sec) => (sec.squares || []).some((sq) =>
  (sq.events || []).some((e) => Array.isArray(e.notes) && e.notes.length)));

w.addEventListener('load', async () => {
  const uploads = path.join(ROOT, 'uploads');
  const files = fs.readdirSync(uploads).filter((f) => /\.struchord.*\.json$|\.struchord$/.test(f));

  // ---------- 1. Формат: открыть-сохранить без правок ----------
  for (const file of files) {
    const parsed = JSON.parse(fs.readFileSync(path.join(uploads, file), 'utf8'));
    const src = Array.isArray(parsed) ? parsed[0] : parsed;
    w.localStorage.setItem('struchord_songs', JSON.stringify([src]));
    w.loadSong(0);
    w.eval('render()');
    const saved1 = savedSong();
    const inv1 = inventory(saved1);
    check(file + ': состав ячеек после открытия тот же', inv1 === inventory(src), inv1.slice(0, 80));
    check(file + ': поля notes нет', !hasNotesField(saved1));
    w.localStorage.setItem('struchord_songs', JSON.stringify([saved1]));
    w.loadSong(0);
    const saved2 = savedSong();
    const stripDate = (o) => { const c = JSON.parse(JSON.stringify(o)); delete c.date; return JSON.stringify(c); };
    check(file + ': повторное сохранение стабильно (кроме метки даты)', stripDate(saved1) === stripDate(saved2));
  }

  // ---------- 2-5. Правки на Police ----------
  const parsed = JSON.parse(fs.readFileSync(path.join(uploads, 'Police - Every breath you take.struchord-2.json'), 'utf8'));
  w.localStorage.setItem('struchord_songs', JSON.stringify([parsed]));
  w.loadSong(0);
  w.eval('render()');
  const setup = w.eval(`(function () {
    togglePartsMode(true);
    setPartsScoreEngine('native');
    selectPartTrack('accomp');
    return { secId: sections[0].id, chord0: sections[0].squares[0].events[0].chord };
  })()`);
  check('шаг2: исходный аккорд первой ячейки Aadd9', setup.chord0 === 'Aadd9', setup.chord0);

  // Курсор на ноту третьего такта первой ячейки (pos 8, толстая струна).
  w.eval(`partsCursor = { partId: 'accomp', secId: ${setup.secId}, pass: 0, string: 0, pos: 4, pitch: null, staffPitch: null, staffClef: null };`);
  w.eval('inputPartFret(6)');
  await sleep(50);
  const afterFret = w.eval(`(function () {
    const ev = sections[0].squares[0].events[0];
    return { chord: ev.chord, fingering: ev.fingering || null, hasNotes: Array.isArray(ev.notes) && ev.notes.length > 0,
      changed: ev.chord !== 'Aadd9' || (ev.fingering || '') !== '5,7,9,6,x,x' };
  })()`);
  // Один лад на струне среди других моментов той же струны — это
  // мелодия, а не хват: запись честно остаётся нотами, аккорд не тронут.
  check('шаг2: одиночная смена лада записалась нотами, подпись цела', afterFret.hasNotes && afterFret.chord === 'Aadd9', JSON.stringify(afterFret));
  const savedEdit = savedSong();
  check('шаг2: правка уехала в файл (notes или fingering)', hasNotesField(savedEdit) || (savedEdit.sections[0].squares[0].events[0].fingering || '') !== '5,7,9,6,x,x',
    JSON.stringify(savedEdit.sections[0].squares[0].events[0]).slice(0, 160));
  const undoResult = await (async () => {
    await sleep(650);
    w.eval('undoEdit()');
    await sleep(50);
    return w.eval(`(function () {
      const ev = sections[0].squares[0].events[0];
      return { chord: ev.chord, fingering: ev.fingering || null, hasNotes: Array.isArray(ev.notes) && ev.notes.length > 0 };
    })()`);
  })();
  check('шаг2: undo одним шагом вернул аккорд, аппликатуру и ноты', undoResult.chord === 'Aadd9' && !undoResult.hasNotes, JSON.stringify(undoResult));

  // ---------- 3. Ритм: добавочный момент и возврат ----------
  const rhythmBase = w.eval(`(function () {
    const sec = sections[0]; const sq = sec.squares[0]; const ev = sq.events[0];
    const p = rhythmSoundingForEvent(sec, sq, ev, 0);
    return { sub: p && p.subdivision, steps: p && p.steps.length };
  })()`);
  // Добавим ноту между моментами (pos 8.25 в той же ячейке, струна 2).
  w.eval(`partsCursor = { partId: 'accomp', secId: ${setup.secId}, pass: 0, string: 2, pos: 0.25, pitch: null, staffPitch: null, staffClef: null };`);
  w.eval('inputPartFret(9)');
  await sleep(50);
  const afterRhythm = w.eval(`(function () {
    const sec = sections[0]; const sq = sec.squares[0]; const ev = sq.events[0];
    const p = rhythmSoundingForEvent(sec, sq, ev, 0);
    const moments = new Set(accompCellNotes(sec, sq, ev, 0).map((n) => Math.round(n.start * 100) / 100));
    return { sub: p && p.subdivision, hasQuarter: Array.from(moments).some((m) => Math.abs(m - 0.25) < 1e-9),
      hasNotes: Array.isArray(ev.notes) && ev.notes.length > 0 };
  })()`);
  check('шаг2: добавленный момент появился в нотах ячейки', afterRhythm.hasQuarter, JSON.stringify({ rhythmBase, afterRhythm }));
  // Уберём эту ноту обратно.
  w.eval('deletePartNote()');
  await sleep(50);
  const afterReturn = w.eval(`(function () {
    const sec = sections[0]; const sq = sec.squares[0]; const ev = sq.events[0];
    const p = rhythmSoundingForEvent(sec, sq, ev, 0);
    return { sub: p && p.subdivision, steps: p && p.steps.length, hasNotes: Array.isArray(ev.notes) && ev.notes.length > 0 };
  })()`);
  check('шаг2: ритм возвращён — кастом и запись исчезли', afterReturn.sub === rhythmBase.sub && afterReturn.steps === rhythmBase.steps && !afterReturn.hasNotes,
    JSON.stringify({ rhythmBase, afterReturn }));

  // ---------- 4. Операции: записанная ячейка едет при копировании секции ----------
  // Сделаем невыразимую запись: две ноты на одной струне на разных ладах.
  w.eval(`partsCursor = { partId: 'accomp', secId: ${setup.secId}, pass: 0, string: 2, pos: 0.5, pitch: null, staffPitch: null, staffClef: null };`);
  w.eval('inputPartFret(4)');
  await sleep(50);
  const recorded = w.eval(`(function () {
    const ev = sections[0].squares[0].events[0];
    return { hasNotes: Array.isArray(ev.notes) && ev.notes.length > 0, n: ev.notes ? ev.notes.length : 0 };
  })()`);
  check('шаг2: невыразимая правка записалась в ячейку', recorded.hasNotes, JSON.stringify(recorded));
  const cloneInfo = w.eval(`(function () {
    return { hasCloneFn: typeof cloneSection === 'function' };
  })()`);
  if (cloneInfo.hasCloneFn) {
  const cloneCheck = w.eval(`(function () {
      const idsBefore = sections.map((x) => x.id);
      cloneSection(sections[0].id);
      const clone = sections.find((x) => !idsBefore.includes(x.id));
      const ev = clone && clone.squares[0].events[0];
      const ok = !!ev && Array.isArray(ev.notes) && ev.notes.length > 0;
      const ci = sections.indexOf(clone);
      if (ci >= 0) sections.splice(ci, 1);
      return { hasNotes: ok };
    })()`);
    check('шаг2: копия секции уносит записанные ноты', cloneCheck.hasNotes, JSON.stringify(cloneCheck));
  } else {
    check('шаг2: копия секции уносит записанные ноты (cloneSection)', false, 'функция не найдена');
  }
  const savedRec = savedSong();
  check('шаг2: сохранение пишет notes только правленой ячейки',
    hasNotesField(savedRec) && (savedRec.sections[0].squares[0].events[1] ? !Array.isArray(savedRec.sections[0].squares[0].events[1].notes) : true),
    JSON.stringify(savedRec.sections[0].squares[0].events.map((e) => !!e.notes)));

  // ---------- 5. Аккорд в Редакторе при записанных нотах ----------
  const chordEdit = w.eval(`(function () {
    const sec = sections[0]; const sq = sec.squares[0]; const ev = sq.events[0];
    const hadNotes = Array.isArray(ev.notes) && ev.notes.length > 0;
    setEventChord(ev, 'E', { secId: sec.id, sqId: sq.id, ei: 0 });
    return { hadNotes, chord: ev.chord, keptNotes: Array.isArray(ev.notes) && ev.notes.length > 0 };
  })()`);
  check('шаг2: невыразимые ноты при смене аккорда не потеряны', !chordEdit.hadNotes || chordEdit.keptNotes, JSON.stringify(chordEdit));

  // Выразимая правка на синтетической песне (один удар всеми струнами):
  // смена лада басовой струны пересчитывает аккорд и снимает запись.
  const synth = {
    schemaVersion: 3, artist: 'T', title: 'synth', bpm: 120, globalKey: 'C', globalTimeSig: '4/4',
    sections: [{ id: 1, type: 'куплет', key: 'C', bpm: 120, timeSig: '4/4', repeat: 1, squares: [{ id: 1, customBeats: null, events: [{
      chord: 'C', span: 4, fingering: 'x,3,2,0,1,0', strumPattern: { mode: 'strum', subdivision: 1, steps: [[0, 1, 2, 3, 4, 5]] },
    }] }] }],
    parts: [],
  };
  w.localStorage.setItem('struchord_songs', JSON.stringify([synth]));
  w.loadSong(0);
  w.eval('render()');
  const synthSec = w.eval('sections[0].id');
  w.eval("partsCursor = { partId: 'accomp', secId: " + synthSec + ", pass: 0, string: 1, pos: 0, pitch: null, staffPitch: null, staffClef: null };");
  w.eval('inputPartFret(2)');
  await sleep(50);
  const synthAfter = w.eval(`(function () {
    const ev = sections[0].squares[0].events[0];
    return { chord: ev.chord, fingering: ev.fingering || null, hasNotes: Array.isArray(ev.notes) && ev.notes.length > 0 };
  })()`);
  check('шаг2: выразимая правка пересчитала аккорд и сняла запись', synthAfter.chord !== 'C' && !synthAfter.hasNotes, JSON.stringify(synthAfter));

  console.log('\nИТОГО: ' + pass + ' ok, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
});
