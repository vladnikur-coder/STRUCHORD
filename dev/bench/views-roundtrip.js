#!/usr/bin/env node
/* Этап «Виды», ворота риска (п. 1 поправок владельца): обратный пересчёт
 * «ноты → аккорд, аппликатура, бой» как чистая функция; цикл
 * «аккорд → ноты → аккорд» по всей библиотеке песен. Ничего не записываем.
 * Запуск: node dev/bench/views-roundtrip.js */
'use strict';
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

const ANALYZE = `
window.__roundtrip = function () {
  const out = { cells: 0, noChord: 0, noShape: 0, noPattern: 0, swing: 0,
    nameOk: 0, gripOk: 0, rhythmOk: 0, dirLost: 0, multiFret: 0, examples: [] };
  const ex = (kind, info) => { if (out.examples.length < 14) out.examples.push(kind + ': ' + info); };
  sections.forEach((sec) => {
    (sec.squares || []).forEach((sq) => {
      (sq.events || []).forEach((ev, ei) => {
        if (!ev || !ev.chord) return;
        out.cells++;
        const key = sec.key || globalKey;
        const posCtx = { secId: sec.id, squareId: sq.id, eventIndex: ei, key };
        let shape = null;
        try { shape = resolveShapeForScheduledChord(ev.chord, posCtx).shape; } catch (e) {}
        if (!shape) { out.noShape++; ex('нет аппликатуры', ev.chord + ' @ ' + (sec.customName || sec.type)); return; }
        let pattern = null;
        try { pattern = getSlicedPatternForEvent(sec, sq, ev, ei); } catch (e) {}
        if (pattern && pattern.swing) out.swing++;
        // --- вперёд: аккорд+хват+бой -> ноты [{pos, string(0=толстая), fret, dead}] ---
        const notes = [];
        const pushStrum = (pos, dead) => {
          shapeToPluckNotes(shape).forEach((n) => notes.push({ pos, string: n.stringIndex, fret: n.fret !== undefined ? n.fret : null, dead: !!dead }));
          if (dead) { /* X: все звучащие струны как dead */ }
        };
        if (!pattern || !Array.isArray(pattern.steps) || !pattern.steps.length) {
          out.noPattern++;
          pushStrum(0, false);
        } else {
          const sub = Math.max(1, pattern.subdivision || 1);
          pattern.steps.forEach((symbol, i) => {
            const pos = i / sub;
            if (Array.isArray(symbol) || typeof symbol === 'number') {
              let strings = [];
              try { strings = resolvePickStepStrings(symbol, shape, ev.chord) || []; } catch (e) {}
              strings.forEach((sn) => {
                const si = 6 - sn;
                const f = shape[si];
                const fret = (f === 'x' || f === undefined || f === null) ? null : Number(f);
                notes.push({ pos, string: si, fret, dead: false });
              });
            } else if (symbol === 'D' || symbol === 'U') {
              shapeToPluckNotes(shape).forEach((n) => notes.push({ pos, string: n.stringIndex, fret: (function(){ const f = shape[n.stringIndex]; return (f==='x'||f===undefined||f===null)?null:Number(f); })(), dead: false }));
            } else if (symbol === 'X') {
              shapeToPluckNotes(shape).forEach((n) => notes.push({ pos, string: n.stringIndex, fret: (function(){ const f = shape[n.stringIndex]; return (f==='x'||f===undefined||f===null)?null:Number(f); })(), dead: true }));
            }
          });
        }
        if (!notes.length) { ex('нет нот из боя', ev.chord); return; }
        // --- назад: ноты -> хват ---
        const fretsByString = {};
        notes.forEach((n) => { if (!n.dead && n.fret !== null) { (fretsByString[n.string] = fretsByString[n.string] || new Set()).add(n.fret); } });
        let gripBad = false;
        const grip = shape.slice();
        Object.keys(fretsByString).forEach((s) => {
          const set = fretsByString[s];
          if (set.size > 1) { gripBad = true; }
          else { const f = Array.from(set)[0]; if (Number(shape[s]) !== f && shape[s] !== 'x') gripBad = true; grip[s] = f; }
        });
        if (gripBad) out.multiFret++; else out.gripOk++;
        // --- назад: имя ---
        let name = null;
        try { name = analyzeFingeringShape(grip).chordName; } catch (e) {}
        if (name === ev.chord) out.nameOk++;
        else {
          // То же звучание другим написанием? Сравниваем классы высот.
          let sameSound = false;
          try {
            const pcs = (nm) => Array.from(new Set((getChordNotes(nm, getKeyStyle(key)) || []).map((t) => t.replace(/[0-9]/g, '')))).sort().join(' ');
            sameSound = pcs(ev.chord) === pcs(name);
          } catch (e) {}
          if (sameSound) { out.nameRespell = (out.nameRespell || 0) + 1; ex('имя-написание', ev.chord + ' -> ' + name); }
          else ex('имя', ev.chord + ' -> ' + name + ' (' + (sec.customName || sec.type) + ')');
        }
        // --- назад: бой по моментам ---
        if (pattern && Array.isArray(pattern.steps) && pattern.steps.length) {
          const sub = Math.max(1, pattern.subdivision || 1);
          const moments = Array.from(new Set(notes.map((n) => Math.round(n.pos * sub)))).sort((a, b) => a - b);
          const want = [];
          pattern.steps.forEach((symbol, i) => { if (symbol !== '_' && symbol !== null) want.push(i); });
          const momentsOk = JSON.stringify(moments) === JSON.stringify(want);
          let stepsOk = momentsOk;
          if (stepsOk) {
            for (const i of want) {
              const symbol = pattern.steps[i];
              const here = notes.filter((n) => Math.round(n.pos * sub) === i);
              if (Array.isArray(symbol) || typeof symbol === 'number') {
                let strings = [];
                try { strings = resolvePickStepStrings(symbol, shape, ev.chord) || []; } catch (e) {}
                const got = here.map((n) => 6 - n.string).sort((a, b) => a - b).join(',');
                if (got !== strings.slice().sort((a, b) => a - b).join(',')) { stepsOk = false; break; }
              } else if (symbol === 'D' || symbol === 'U') {
                if (here.length < 2) { stepsOk = false; break; }
                if (symbol === 'U') out.dirLost++;
              } else if (symbol === 'X') {
                if (!here.length || !here.every((n) => n.dead)) { stepsOk = false; break; }
              }
            }
          }
          if (stepsOk) out.rhythmOk++;
          else ex('бой', ev.chord + ' mode=' + pattern.mode + ' (' + (sec.customName || sec.type) + ')');
        } else {
          out.rhythmOk++; // боя не было — один удар, выводить нечего
        }
      });
    });
  });
  return out;
};
`;

w.addEventListener('load', async () => {
  const files = [];
  const uploads = path.join(ROOT, 'uploads');
  fs.readdirSync(uploads).filter((f) => /\.struchord.*\.json$|\.struchord$/.test(f)).forEach((f) => files.push(path.join(uploads, f)));
  const fixtures = path.join(ROOT, 'dev', 'fixtures');
  if (fs.existsSync(fixtures)) fs.readdirSync(fixtures).filter((f) => f.endsWith('.struchord')).forEach((f) => files.push(path.join(fixtures, f)));
  const total = { cells: 0, noShape: 0, noPattern: 0, swing: 0, nameOk: 0, nameRespell: 0, gripOk: 0, rhythmOk: 0, dirLost: 0, multiFret: 0 };
  for (const file of files) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      const song = Array.isArray(parsed) ? parsed[0] : parsed;
      w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
      w.loadSong(0);
      w.eval('render()');
      w.eval(ANALYZE);
      const r = w.eval('window.__roundtrip()');
      console.log('\n== ' + path.basename(file));
      console.log(JSON.stringify(r));
      Object.keys(total).forEach((k) => { total[k] += r[k] || 0; });
    } catch (e) {
      console.log('\n== ' + path.basename(file) + ' ОШИБКА ' + (e && e.message));
    }
  }
  const denom = total.cells - total.noShape;
  const pct = (x) => denom > 0 ? (100 * x / denom).toFixed(2) + '%' : '—';
  console.log('\nИТОГО ячеек с аккордами: ' + total.cells + ', без аппликатуры: ' + total.noShape +
    ', без боя (один удар): ' + total.noPattern + ', со свингом: ' + total.swing);
  console.log('Имя совпало: ' + total.nameOk + ' (' + pct(total.nameOk) + '), то же звучание другим написанием: ' + (total.nameRespell || 0) +
    ', хват совпал: ' + total.gripOk +
    ' (' + pct(total.gripOk) + '), бой совпал: ' + total.rhythmOk + ' (' + pct(total.rhythmOk) + ')');
  console.log('Несколько ладов на струне (хват не выводится чисто): ' + total.multiFret +
    ', ударов вверх, теряющих направление: ' + total.dirLost);
  process.exit(0);
});
