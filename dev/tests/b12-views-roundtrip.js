#!/usr/bin/env node
/*
 * b12-views-roundtrip.js — B-12.11 «Виды», шаг 1.
 *
 * Проверяем:
 *  1. Круг «аккорд → ноты → аккорд» по всей библиотеке владельца
 *     (uploads/*.struchord*.json): хват и бой — 100%, имя — подпись
 *     удерживается или совпадает в 100% ячеек; голое имя по нотам ≥ 95%.
 *  2. Сверка со звуком (п. 6): расписание извлечения (моменты, струны,
 *     лады) совпадает с независимым перечислением нот звукового
 *     планировщика (та же фаза квадрата, тот же режим шагов).
 *  3. Круг с типовыми правками (п. 1): сдвиг лада, убрать струну,
 *     добавить ноту, заглушить струну, сдвинуть момент удара. Подпись
 *     не остаётся устаревшей ни разу; пальцы прежние только при тех же
 *     ладах (п. 2).
 *  4. Словарь аккордов приложения: круг на типовых именах.
 *  5. Показ без записи: производная строка первая в «Партиях», её нет в
 *     songParts и в файле; ввод нот на ней запрещён и ничего не меняет.
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
    createBuffer: (c, len) => ({ getChannelData: () => new Float32Array(len) }) };
};

let pass = 0;
let fail = 0;
function check(name, cond, details) {
  if (cond) { pass++; console.log('ok   ' + name); }
  else { fail++; console.error('FAIL ' + name + (details ? ' — ' + details : '')); }
}

const DRIVER = `
window.__viewsDrive = function () {
  const stats = {
    cells: 0, noShape: 0, gripOk: 0, rhythmOk: 0, nameRaw: 0, nameKeptOrEq: 0,
    schedCells: 0, schedOk: 0,
    edits: {}, fingersKeptSame: 0, fingersKeptSameOk: 0, fingersChanged: 0, fingersRecalcOk: 0,
  };
  const editInit = () => ({ cells: 0, nameFound: 0, nameChanged: 0, staleKept: 0, gripChanged: 0, rhythmChanged: 0, expressible: 0 });
  ['shiftFret', 'removeString', 'addNote', 'muteString', 'moveMoment'].forEach((k) => { stats.edits[k] = editInit(); });

  function cellCtx(sec, sq, ev, ei) {
    const win = partEventWindowUnits(sec, sq, ei);
    let shape = null;
    try { shape = resolveShapeForScheduledChord(ev.chord, { secId: sec.id, squareId: sq.id, eventIndex: ei, key: sec.key || globalKey }).shape; } catch (e) {}
    let pattern = null;
    try { pattern = getSlicedPatternForEvent(sec, sq, ev, ei); } catch (e) {}
    try {
      const rollWin = (typeof songRhythmRolls !== 'undefined' && songRhythmRolls) ? rhythmRollWindowFor(sec.id, sq, ei, songRhythmRolls) : null;
      if (rollWin && Array.isArray(rollWin.steps) && rollWin.steps.length) pattern = rollWin;
    } catch (e) {}
    return { win, shape, pattern };
  }
  // Независимое перечисление нот звукового планировщика (без извлечения).
  function schedNotes(sec, sq, ev, ei, shape) {
    const ts = sec.timeSig || globalTimeSig;
    const rollWin = (typeof songRhythmRolls !== 'undefined' && songRhythmRolls) ? rhythmRollWindowFor(sec.id, sq, ei, songRhythmRolls) : null;
    const own = rollWin || ev.strumPattern || null;
    const pattern = own || getEffectiveStrumPattern(null, sq, sec);
    const out = [];
    const fretOf = (line) => { const v = shape[line]; if (v === 'x' || v == null) return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
    if (!pattern || !Array.isArray(pattern.steps) || !pattern.steps.length) {
      for (let line = 0; line < shape.length; line++) { const f = fretOf(line); if (f !== null) out.push({ pos: 0, line, fret: f, dead: false }); }
      return out;
    }
    const sub = Math.max(1, pattern.subdivision || 1);
    const stepsInEvent = Math.max(1, Math.round(((ev && ev.span) || 1) * sub));
    let startStep = 0;
    if (!own) {
      const patternUnits = pattern.steps.length / sub;
      const offsetUnits = getSquareEventOffsetUnits(sq, ei, ts);
      startStep = Math.round((((offsetUnits % patternUnits) + patternUnits) % patternUnits) * sub);
    }
    for (let i = 0; i < stepsInEvent; i++) {
      const symbol = pattern.steps[(startStep + i) % pattern.steps.length];
      const pos = i / sub;
      if (pattern.mode === 'pick' || (pattern.mode === 'mixed' && (Array.isArray(symbol) || typeof symbol === 'number'))) {
        let strings = [];
        try { strings = resolvePickStepStrings(symbol, shape, ev.chord) || []; } catch (e) {}
        strings.forEach((num) => { const line = shape.length - Number(num); const f = fretOf(line); out.push({ pos, line, fret: f === null ? 0 : f, dead: false }); });
      } else if (symbol === 'X') {
        for (let line = 0; line < shape.length; line++) { const f = fretOf(line); if (f !== null) out.push({ pos, line, fret: f, dead: true }); }
      } else if (symbol === 'D' || symbol === 'U') {
        for (let line = 0; line < shape.length; line++) { const f = fretOf(line); if (f !== null) out.push({ pos, line, fret: f, dead: false }); }
      }
    }
    return out;
  }
  const keyOf = (arr) => arr.map((n) => [Math.round(n.pos * 10000) / 10000, n.line, n.fret, n.dead ? 1 : 0].join(':')).sort().join('|');

  function runCell(sec, sq, ev, ei, withEdits) {
    const { win, shape, pattern } = cellCtx(sec, sq, ev, ei);
    if (!shape) { stats.noShape++; return; }
    stats.cells++;
    const notes = accompCellNotes(sec, sq, ev, ei);
    const ctx = { chordName: ev.chord, shape, fingers: ev.fingers || null, pattern, start: win.start, span: win.span, key: sec.key || globalKey };
    const back = accompDeriveFromNotes(notes, ctx);
    if (JSON.stringify(back.shape.map(String)) === JSON.stringify(shape.map(String))) stats.gripOk++;
    const moments = Array.from(new Set(notes.map((n) => Math.round((n.start - win.start) * 10000) / 10000))).sort((a, b) => a - b);
    if (pattern && Array.isArray(pattern.steps)) {
      const sub = Math.max(1, pattern.subdivision || 1);
      const want = [];
      pattern.steps.forEach((sym, i) => { if (sym !== '_' && sym !== null) want.push(Math.round((i / sub) * 10000) / 10000); });
      if (JSON.stringify(moments) === JSON.stringify(want)) stats.rhythmOk++;
    } else stats.rhythmOk++;
    let raw = null;
    try { raw = analyzeFingeringShape(shape).chordName; } catch (e) {}
    if (raw === ev.chord) stats.nameRaw++;
    if (back.nameKept || back.chordName === ev.chord) stats.nameKeptOrEq++;
    // Сверка со звуковым расписанием.
    const sched = schedNotes(sec, sq, ev, ei, shape);
    const mine = notes.map((n) => ({ pos: n.start - win.start, line: n.string, fret: n.fret, dead: !!n.dead }));
    stats.schedCells++;
    if (keyOf(sched) === keyOf(mine)) stats.schedOk++;
    if (!withEdits || !notes.length) return;
    // --- типовые правки ---
    const clone = () => JSON.parse(JSON.stringify(notes));
    const judge = (kind, edited) => {
      const st = stats.edits[kind];
      const d = accompDeriveFromNotes(edited, ctx);
      st.cells++;
      if (d.chordName) st.nameFound++;
      if (d.chordName && d.chordName !== ev.chord) st.nameChanged++;
      if (d.nameKept && d.chordName !== ev.chord) st.staleKept++;
      if (JSON.stringify(d.shape.map(String)) !== JSON.stringify(shape.map(String))) st.gripChanged++;
      const m2 = Array.from(new Set(edited.map((n) => Math.round((n.start - win.start) * 10000) / 10000))).sort((a, b) => a - b);
      if (JSON.stringify(m2) !== JSON.stringify(moments)) st.rhythmChanged++;
      if (d.expressible) st.expressible++;
      return d;
    };
    { // сдвинуть ноту на лад
      const ed = clone();
      const n = ed.find((x) => !x.dead && x.fret < 24);
      if (n) { n.fret += 1; const d = judge('shiftFret', ed);
        const sameFrets = JSON.stringify(d.shape.map(String)) === JSON.stringify(shape.map(String));
        if (!sameFrets) { stats.fingersChanged++; if (!ev.fingers || JSON.stringify(d.fingers) !== JSON.stringify(ev.fingers)) stats.fingersRecalcOk++; } }
    }
    { // убрать струну
      const ed0 = clone();
      const counts = {};
      ed0.forEach((x) => { counts[x.string] = (counts[x.string] || 0) + 1; });
      const line = Number(Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0]);
      judge('removeString', ed0.filter((x) => x.string !== line));
    }
    { // добавить ноту (открытая струна, которой не было в первом моменте)
      const ed = clone();
      const first = Math.min(...ed.map((x) => x.start));
      const present = new Set(ed.filter((x) => Math.abs(x.start - first) < 1e-9).map((x) => x.string));
      let added = false;
      for (let line = 0; line < shape.length; line++) {
        if (!present.has(line)) { ed.push({ start: first, dur: 0.5, string: line, fret: 0 }); added = true; break; }
      }
      if (added) judge('addNote', ed);
    }
    { // заглушить струну
      const ed = clone();
      const counts = {};
      ed.forEach((x) => { counts[x.string] = (counts[x.string] || 0) + 1; });
      const line = Number(Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0]);
      ed.forEach((x) => { if (x.string === line) x.dead = true; });
      judge('muteString', ed);
    }
    if (pattern && Array.isArray(pattern.steps)) { // поменять момент удара
      const ed = clone();
      const sub = Math.max(1, pattern.subdivision || 1);
      const first = Math.min(...ed.map((x) => x.start));
      ed.forEach((x) => { if (Math.abs(x.start - first) < 1e-9) x.start = Math.round((x.start + 1 / sub) * 10000) / 10000; });
      judge('moveMoment', ed);
    }
    // Пальцы при тех же ладах — прежние.
    if (Array.isArray(ev.fingers) && ev.fingers.length) {
      stats.fingersKeptSame++;
      if (JSON.stringify(back.fingers) === JSON.stringify(ev.fingers)) stats.fingersKeptSameOk++;
    }
  }

  sections.forEach((sec) => (sec.squares || []).forEach((sq) => (sq.events || []).forEach((ev, ei) => {
    if (ev && ev.chord) runCell(sec, sq, ev, ei, true);
  })));
  return stats;
};

window.__viewsDict = function () {
  const roots = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'Bb', 'F#'];
  const quals = ['', 'm', '7', 'maj7', 'm7', 'm7b5', 'dim', 'aug', 'sus2', 'sus4', 'add9', '6', 'm6', '9', '5', '7sus4'];
  const names = [];
  roots.forEach((r) => quals.forEach((q) => { const nm = r + q; try { if ((getChordNotes(nm, getKeyStyle('C')) || []).length) names.push(nm); } catch (e) {} }));
  // Без перезагрузки песни: считаем на клоне секции текущей, без её боя
  // (иначе перебор секции добавляет в словарь чужие открытые струны).
  const sec = JSON.parse(JSON.stringify(sections[0]));
  sec.strumPattern = null;
  const tplSq = JSON.parse(JSON.stringify(sec.squares[0]));
  const tplEv = tplSq.events[0] || {};
  const squares = [];
  for (let i = 0; i < names.length; i += 4) {
    squares.push(Object.assign({}, tplSq, {
      id: 1000 + i, customBeats: 0,
      events: names.slice(i, i + 4).map((chord, j) => Object.assign({}, tplEv, { chord, span: 1, index: j, fingering: null, strumPattern: null })),
    }));
  }
  sec.squares = squares;
  const st = { cells: 0, noShape: 0, gripOk: 0, nameKeptOrEq: 0, fingersKept: 0, fingersTotal: 0 };
  squares.forEach((sq) => sq.events.forEach((ev, ei) => {
    let shape = null;
    try { shape = resolveShapeForScheduledChord(ev.chord, { secId: sec.id, squareId: sq.id, eventIndex: ei, key: globalKey }).shape; } catch (e) {}
    if (!shape) { st.noShape++; return; }
    st.cells++;
    const win = partEventWindowUnits(sec, sq, ei);
    const notes = accompCellNotes(sec, sq, ev, ei);
    let autoFingers = null;
    try { autoFingers = computeFingersForShape(shape, null); } catch (e) {}
    const back = accompDeriveFromNotes(notes, { chordName: ev.chord, shape, fingers: autoFingers, pattern: null, start: win.start, span: win.span, key: globalKey });
    if (Array.isArray(autoFingers) && autoFingers.length) {
      st.fingersTotal++;
      if (JSON.stringify(back.fingers) === JSON.stringify(autoFingers)) st.fingersKept++;
    }
    if (JSON.stringify(back.shape.map(String)) === JSON.stringify(shape.map(String))) st.gripOk++;
    if (back.nameKept || back.chordName === ev.chord) st.nameKeptOrEq++;
  }));
  return st;
};
`;

w.addEventListener('load', () => {
  const uploads = path.join(ROOT, 'uploads');
  const files = fs.readdirSync(uploads).filter((f) => /\.struchord.*\.json$|\.struchord$/.test(f));
  w.eval(DRIVER);
  const total = { cells: 0, noShape: 0, gripOk: 0, rhythmOk: 0, nameRaw: 0, nameKeptOrEq: 0, schedCells: 0, schedOk: 0, fingersKeptSame: 0, fingersKeptSameOk: 0, fingersChanged: 0, fingersRecalcOk: 0 };
  const edits = {};
  for (const file of files) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(uploads, file), 'utf8'));
      const song = Array.isArray(parsed) ? parsed[0] : parsed;
      w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
      w.loadSong(0);
      w.eval('render()');
      const r = w.eval('window.__viewsDrive()');
      Object.keys(total).forEach((k) => { total[k] += r[k] || 0; });
      Object.entries(r.edits).forEach(([k, v]) => {
        if (!edits[k]) edits[k] = { cells: 0, nameFound: 0, nameChanged: 0, staleKept: 0, gripChanged: 0, rhythmChanged: 0, expressible: 0 };
        Object.keys(edits[k]).forEach((kk) => { edits[k][kk] += v[kk] || 0; });
      });
      console.log('  ' + file + ': ячеек ' + r.cells + ', сверка со звуком ' + r.schedOk + '/' + r.schedCells);
    } catch (e) {
      check('песня ' + file + ' обрабатывается без ошибок', false, e && e.message);
    }
  }
  console.log('КРУГ: ' + JSON.stringify(total));
  console.log('ПРАВКИ: ' + JSON.stringify(edits, null, 1));
  check('круг: ячеек с аппликатурой > 300', total.cells > 300, JSON.stringify(total));
  check('круг: хват обратно 100%', total.gripOk === total.cells, total.gripOk + '/' + total.cells);
  check('круг: бой обратно 100%', total.rhythmOk === total.cells, total.rhythmOk + '/' + total.cells);
  check('круг: имя подпись/совпадение 100%', total.nameKeptOrEq === total.cells, total.nameKeptOrEq + '/' + total.cells);
  check('круг: голое имя по нотам ≥ 95%', total.nameRaw / Math.max(1, total.cells) >= 0.95, (100 * total.nameRaw / total.cells).toFixed(1) + '%');
  check('п.6: расписание извлечения = расписание звука 100%', total.schedOk === total.schedCells, total.schedOk + '/' + total.schedCells);
  Object.entries(edits).forEach(([kind, st]) => {
    check('правка ' + kind + ': устаревшей подписи нет ни разу', st.staleKept === 0 && st.cells > 0, JSON.stringify(st));
    check('правка ' + kind + ': имя определяется ≥ 90%', st.nameFound / Math.max(1, st.cells) >= 0.9, JSON.stringify(st));
  });
  check('п.2: пальцы при тех же ладах сохранены', total.fingersKeptSame === 0 || total.fingersKeptSameOk === total.fingersKeptSame,
    total.fingersKeptSameOk + '/' + total.fingersKeptSame);
  check('п.2: при смене ладов пальцы пересчитаны, а не прежние', total.fingersChanged === 0 || total.fingersRecalcOk > 0,
    total.fingersRecalcOk + '/' + total.fingersChanged);

  const dict = w.eval('window.__viewsDict()');
  console.log('СЛОВАРЬ: ' + JSON.stringify(dict));
  check('словарь: типовых аккордов ≥ 100', dict.cells >= 100, JSON.stringify(dict));
  check('словарь: хват обратно 100%', dict.gripOk === dict.cells, JSON.stringify(dict));
  // Известный предел: dim на гитаре звучит как dim7 (хват добавляет
  // уменьшённую септиму), а подборщик для D в контексте песни может дать
  // хват sus2 — подпись тогда честно переименовывается, не устаревает.
  check('словарь: имя подпись/совпадение ≥ 95%', dict.nameKeptOrEq / Math.max(1, dict.cells) >= 0.95, JSON.stringify(dict));
  check('п.2 (словарь): пальцы при тех же ладах сохранены везде', dict.fingersTotal > 0 && dict.fingersKept === dict.fingersTotal, JSON.stringify(dict));

  // Показ без записи.
  const ui = w.eval(`(function () {
    togglePartsMode(true);
    const derived = accompDerivedPart();
    const list = partVisibleList();
    const inParts = songParts.some((p) => p.id === 'accomp');
    selectPartTrack('accomp');
    const activeIsDerived = partActivePart() && partActivePart().id === 'accomp';
    const before = JSON.stringify(accompDerivedPart().rolls);
    const evBefore = { chord: sections[0].squares[0].events[0].chord, fingering: sections[0].squares[0].events[0].fingering };
    partsCursor = { partId: 'accomp', secId: sections[0].id, pass: 0, string: 5, pos: 0, pitch: null, staffPitch: null, staffClef: null };
    inputPartFret(3);
    const after = JSON.stringify(accompDerivedPart().rolls);
    const cellEv = sections[0].squares[0].events[0];
    const recorded = (Array.isArray(cellEv.notes) && cellEv.notes.length > 0)
      || cellEv.chord !== evBefore.chord || (cellEv.fingering || '') !== (evBefore.fingering || '');
    const chip = document.querySelector('.pt-track-chip.is-derived');
    setSongView('editor');
    const backToEditor = !partsMode;
    setSongView('parts');
    return { hasDerived: !!derived, firstIsDerived: list[0] && list[0].id === 'accomp', inParts, activeIsDerived,
      rollsUnchanged: before === after, recorded, chip: !!chip, backToEditor, viewsOk: partsMode === true };
  })()`);
  console.log('ПОКАЗ: ' + JSON.stringify(ui));
  check('шаг1: производная строка существует и первая', ui.hasDerived && ui.firstIsDerived, JSON.stringify(ui));
  check('шаг1: производной строки нет в songParts (файл не тронут)', ui.inParts === false, JSON.stringify(ui));
  // Шаг 1 запрещал ввод; шаг 2 его разрешил как правку ячейки: рулон
  // показа меняется через записанные ноты ячейки, а не через партию.
  check('шаг2: ввод на аккомпанементе правит ячейку, не партию', ui.activeIsDerived && ui.recorded, JSON.stringify(ui));
  check('шаг4: виды переключаются туда-обратно одной функцией', ui.backToEditor && ui.viewsOk && ui.chip, JSON.stringify(ui));

  console.log('\nИТОГО: ' + pass + ' ok, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
});
