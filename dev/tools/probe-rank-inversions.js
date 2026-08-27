// Поиск инверсий в выдаче аппликатур: форма стоит выше другой с
// меньшей оценкой. Инверсия считается только ВНУТРИ одного блока,
// где порядок обязан быть по чистой оценке (волна-6, 2026-08-14 —
// «OPEN - CAGED - Всё остальное»):
//   — внутри CAGED-блока (стандартный строй);
//   — внутри блока «всё остальное» (modified/fallback);
//   — во всём пуле после своих форм (слэш-аккорды);
// между блоками разница в очках — дизайн (ступени очереди), а
// защищённые якоря (народная G9) вообще стоят в голове намеренно.
// Запуск: node dev/tools/probe-rank-inversions.js [C,G,...]
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM(fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8'), {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://localhost/',
  beforeParse(w) {
    w.HTMLCanvasElement.prototype.getContext = () => ({
      font: '', measureText: () => ({ width: 10 }),
      clearRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
      moveTo() {}, lineTo() {}, closePath() {}, save() {}, restore() {},
      translate() {}, rotate() {}, fillText() {}, strokeText() {},
      setTransform() {}, scale() {},
      createLinearGradient: () => ({ addColorStop() {} }),
    });
  },
});
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function () {
  return { currentTime: 0, state: 'running', resume() {} };
};

const BANK = [
  'Aadd9', 'D7', 'G', 'C9', 'Bm', 'F', 'F#m7', 'Am7', 'Bb', 'Cmaj7',
  'Dm9', 'Gadd9', 'Esus4', 'Dm', 'C', 'Bm7', 'Dadd9', 'A7', 'Cadd9',
  'Am', 'Em', 'E', 'D', 'A', 'E7', 'A7sus4', 'G7', 'Fm', 'Cm', 'B',
  'C#m', 'G/B', 'D/F#', 'C/G', 'Asus2', 'Asus4', 'Dsus4', 'Dsus2',
  'Esus2', 'Gsus4', 'Em7', 'Dm7', 'Fmaj7', 'Dmaj7', 'Amaj7', 'Emaj7',
  'C6', 'G6', 'D6', 'A6', 'B7', 'D9', 'E9', 'G9', 'F7', 'Bb7', 'Eb',
  'Ab', 'Db', 'Gb', 'C#7', 'F#7', 'Badd9', 'Eadd9', 'Fadd9', 'Am6',
  'Em6', 'Gmaj7', 'C7', 'G9sus4', 'Am7/G', 'C/E', 'Dm7b5', 'G7sus4',
  'F#m7b5', 'D#m', 'G#m', 'Edim', 'Adim', 'Fdim7', 'Aaug', 'Caug',
];
const chords = process.argv[2] ? process.argv[2].split(',') : BANK;

w.addEventListener('load', () => {
  const rows = [];
  for (const chord of chords) {
    const res = w.eval(`(() => {
      const v = getFingeringVariants(${JSON.stringify(chord)}, 'C');
      if (!v || !v.shapes) return null;
      const notes = getChordNotes(${JSON.stringify(chord.split('/')[0])}, getKeyStyle('C')) || [];
      const root = ${JSON.stringify(chord)}.match(/^[A-G][#b]?/)[0];
      const bass = ${JSON.stringify(chord)}.includes('/') ? ${JSON.stringify(chord)}.split('/')[1] : null;
      return {
        slash: !!bass,
        list: v.shapes.slice(0, 10).map((s, i) => ({
          s: s.join(','), m: v.methods[i],
          sc: Math.round(scoreShape(s, notes, root, bass) * 10) / 10,
        })),
      };
    })()`);
    if (!res) continue;
    const L = res.list;
    // --- Копии функций семейств из приложения (SYNCH: famFrame/famDist
    // внутри generateFingeringVariants, STRUCHORD.html). ---
    const famFrame = (shape) => {
      let bass = -1, lo = 99, hi = -1;
      const a = shape.split(',').map((x) => (x === 'x' ? 'x' : +x));
      for (let s = 0; s < 6; s++) {
        const v = a[s];
        if (v === 'x') continue;
        if (bass === -1) bass = s;
        if (v !== 0) { if (v < lo) lo = v; if (v > hi) hi = v; }
      }
      return { bass, lo: lo === 99 ? 0 : lo, hi: hi === -1 ? 0 : hi, a };
    };
    const famDist = (x, y) => {
      let d = 0;
      for (let s = 0; s < 6; s++) {
        const u = x[s], v = y[s];
        if (u === v) continue;
        if (u === 'x' || v === 'x') d += 0.5;
        else if (u === 0 || v === 0) d += 1;
        else if (Math.abs(u - v) <= 1) d += 0.5;
        else d += 2;
      }
      return d;
    };
    const sameFamily = (fa, fb) =>
      fa.bass === fb.bass &&
      Math.abs(fa.lo - fb.lo) <= 1 &&
      Math.abs(fa.hi - fb.hi) <= 1 &&
      famDist(fa.a, fb.a) <= 1.5;
    // Чистая оценка: бонусов происхождения в очках нет (CAGED
    // возвращён волной-6 как ступень очереди, не как фора).
    const eff = (x) => x.sc;
    // Защищённые якоря (SYNCH: FINGERING_FIRST_ANCHORS в приложении).
    const ANCHORS = { G9: ['3,0,0,0,0,1'] };
    const frames = L.map((x) => famFrame(x.s));
    // Отложенный дубль семейства: выше в списке есть его якорь.
    const deferred = (j) => {
      for (let k = 0; k < j; k++) {
        if (L[k].m === 'user' || L[k].m === 'derived') continue;
        if (sameFamily(frames[k], frames[j])) return true;
      }
      return false;
    };
    const anchorSet = new Set(ANCHORS[chord.split('/')[0]] || []);
    const isAnchor = (x) => anchorSet.has(x.s);
    const isAuto = (m) => m === 'modified' || m === 'fallback';
    const inRun = (i, j) => {
      if (L[i].m === 'user' || L[i].m === 'derived' || L[j].m === 'user' || L[j].m === 'derived') return false;
      // Волна-7: якорь — самостоятельный метод 'anchor'; пропускаем и его,
      // и строковое совпадение (страховка для будущих якорей).
      if (L[i].m === 'anchor' || L[j].m === 'anchor' || isAnchor(L[i]) || isAnchor(L[j])) return false;
      if (res.slash) return true;
      // Стандарт (волна-6): инверсия возможна только внутри одного
      // блока — CAGED внутри себя и «всё остальное» внутри себя;
      // шов open→CAGED→остальное очки не сравнивает.
      if (L[i].m === 'open' || L[j].m === 'open') return false;
      if (L[i].m === 'caged' || L[j].m === 'caged') return L[i].m === 'caged' && L[j].m === 'caged';
      return isAuto(L[i].m) && isAuto(L[j].m);
    };
    for (let i = 0; i < L.length - 1; i++) {
      for (let j = i + 1; j < L.length; j++) {
        if (!inRun(i, j)) continue;
        if (eff(L[j]) > eff(L[i]) + 2 && !deferred(j) && !deferred(i)) {
          rows.push(
            `${chord}: #${i + 1} ${L[i].s} (${L[i].m} eff ${eff(L[i])}) ВЫШЕ #${j + 1} ${L[j].s} (${L[j].m} eff ${eff(L[j])})`
          );
        }
      }
    }
  }
  console.log(rows.length ? rows.join('\n') : 'инверсий нет');
});
