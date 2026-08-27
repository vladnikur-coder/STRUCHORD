// Калибровочный стенд удобства аппликатур: проигрывает все пары из
// опроса гитариста через scoreShape и сверяет знак разности с его
// вердиктом. Быстрый прогон весов без полного теста: легенда пар и их
// дословное обоснование — в README (раздел про оценку удобства).
//
// Запуск: node dev/tools/probe-comfort-pairs.js
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM(fs.readFileSync('/home/user/STRUCHORD.html', 'utf8'), {
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

// [аккорд, A, B, ожидание]: expect 'A' — A удобнее, 'B' — B удобнее,
// 'B>=' — B не хуже («одинаково, пусть B — звучит красивее»).
const PAIRS = [
  ['Aadd9', '5,2,2,2,2,0', '5,7,7,6,0,0', 'B'],       // «B в принципе невозможно поставить»
  ['Aadd9', '5,4,7,6,0,0', '5,7,7,6,0,0', 'B'],       // чуть
  ['Aadd9', 'x,0,7,6,0,0', '5,7,7,6,0,0', 'A'],       // чуть
  ['Aadd9', '5,4,2,2,0,0', '5,7,7,6,0,0', 'B'],       // «A почти невозможно»
  ['C',     'x,3,5,5,5,3', '8,10,10,9,8,8', 'B'],     // чуть (баррэ 5–8 легче 1–3)
  ['Bm',    'x,2,4,4,3,2', '7,9,9,7,7,7', 'A'],       // чуть
  ['Am7',   '5,7,5,5,5,5', 'x,0,5,5,5,5', 'A'],       // чуть
  ['F#m7',  '2,4,2,2,2,2', '2,4,4,2,2,0', 'A'],       // «B почти невозможно: баррэ + открытая 1-я»
  ['F',     '1,3,3,2,1,1', 'x,x,3,2,1,1', 'A'],       // заметно
  ['Bb',    'x,1,3,3,3,1', '6,8,8,7,6,6', 'B'],       // чуть
  ['Dm',    'x,5,7,7,6,5', 'x,5,3,2,3,5', 'A'],       // «не хватит пальцев»
  ['F#m7',  '2,4,2,2,2,0', 'x,x,4,2,2,0', 'B'],       // «A возможно поставить нельзя»
  ['D7',    'x,5,4,5,3,5', 'x,5,7,5,7,5', 'B'],       // «B заметно»
  ['Dm9',   'x,5,3,2,1,0', 'x,5,7,5,6,0', 'B'],       // заметно
  ['C9',    'x,3,2,3,3,3', 'x,3,5,3,3,0', 'A'],       // «B почти невозможно из-за баррэ»
  ['Aadd9', '5,2,2,2,2,5', '5,4,2,4,0,0', 'B'],       // «сейчас удобнее B»
  ['D7',    '10,0,0,7,7,8', 'x,x,0,5,7,5', 'B'],      // «B удобнее, обе неудобные»
  ['G',     '3,2,0,0,3,3', 'x,2,0,0,0,x', 'A'],       // заметно
  ['Gadd9', '3,0,0,0,0,3', '3,5,0,0,0,5', 'A'],       // заметно
  ['F',     '1,3,x,2,1,1', '1,3,3,2,1,x', 'A'],       // «A реально поставить»
  ['Esus4', '0,2,2,2,0,0', '0,0,2,2,0,0', 'B>='],     // «одинаково, пусть B — красивее»
  ['C',     'x,3,5,5,5,0', 'x,3,5,5,5,3', 'A'],       // чуть
  ['F',     '1,3,3,2,1,x', '1,3,3,2,1,1', 'B'],       // полная > обрезка
  ['D7',    'x,5,4,5,x,5', 'x,5,4,5,3,5', 'A'],       // заметно
  ['Aadd9', 'x,0,2,4,2,0', 'x,0,2,4,0,0', 'B'],       // открытая снимает палец
  ['Aadd9', '5,4,2,4,0,0', '5,4,7,6,0,0', 'B'],       // заметно
  ['G',     '3,5,0,0,0,3', '3,5,5,4,3,3', 'B'],       // «баррэ не поможет из-за разрыва»
  ['D7',    'x,5,7,7,7,8', 'x,5,7,5,7,5', 'B'],       // заметно
  ['G',     '3,2,0,0,0,x', '3,5,0,0,0,3', 'A'],       // B «неудобна» (обрезок терпимее)
  ['F',     '1,0,3,2,1,x', 'x,x,3,2,1,1', 'B'],       // «A абсолютно неиграбельна»
  ['A7',    '5,7,5,6,5,5', 'x,0,5,6,5,5', 'A'],       // чуть
  ['Bm',    '7,5,4,4,0,x', 'x,2,4,4,3,2', 'B'],       // «A неиграбельна»
  ['Cmaj7', 'x,3,5,0,0,0', 'x,3,5,4,5,0', 'A'],       // чуть
  ['D7',    'x,5,7,5,7,5', 'x,x,0,5,7,5', 'A'],       // заметно (q25)
  ['D7',    'x,5,4,5,x,5', 'x,5,4,5,3,x', 'A'],       // заметно (q28)
];

w.addEventListener('load', () => {
  const SHARP = (s) => s; // scoreShape сам нормализует
  let bad = 0;
  const rows = [];
  for (const [chord, a, b_i, expect] of PAIRS) {
    const r = w.eval(`(function(){
      const ks = getKeyStyle('C');
      const main = ${JSON.stringify(chord)}.split('/')[0];
      const notes = getChordNotes(main, ks) || [];
      const root = (notes[0] || '').replace(/\\d+$/, '');
      const score = (str) => scoreShape(str.split(',').map(v => v === 'x' ? 'x' : Number(v)), notes, root, null);
      const ban = (str) => (analyzeShapeGrip(str.split(',').map(v => v === 'x' ? 'x' : Number(v))).ban || '');
      return { sa: score(${JSON.stringify(a)}), sb: score(${JSON.stringify(b_i)}),
               ba: ban(${JSON.stringify(a)}), bb: ban(${JSON.stringify(b_i)}) };
    })()`);
    const ra = Math.round(r.sa * 10) / 10;
    const rb = Math.round(r.sb * 10) / 10;
    let pass;
    let verdict;
    if (expect === 'A') {
      pass = r.sa > r.sb;
      verdict = 'A wins';
    } else if (expect === 'B') {
      pass = r.sb > r.sa;
      verdict = 'B wins';
    } else {
      pass = r.sb >= r.sa;
      verdict = 'B >= A';
    }
    if (!pass) bad++;
    rows.push(
      `   ${pass ? 'ok  ' : 'FAIL'} [${chord}] ${expect === 'A' ? a : '·'} vs ${expect === 'B' ? b_i : '·'}` +
      ` | A=${ra}${r.ba ? ' (ban:' + r.ba + ')' : ''} B=${rb}${r.bb ? ' (ban:' + r.bb + ')' : ''} — ждём: ${verdict}`
    );
  }
  console.log(rows.join('\n'));
  console.log(bad ? `\nПРОВАЛОВ: ${bad} из ${PAIRS.length}` : `\nвсе ${PAIRS.length} пар совпали`);
  process.exitCode = bad ? 1 : 0;
});
