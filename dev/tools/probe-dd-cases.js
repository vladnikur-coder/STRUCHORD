// Зонд к дефекту «ресайз одной границы ломает соседние ячейки».
// Песня «Дешевые Драмы»: в квадрате 2 ячейки Am/G стоят на 1.75/2.25 —
// вне текущего шага сетки (getResizeStep() === 1 при zoom 1).
// Тянем ЧУЖУЮ границу (F|E) — и Am/G молча схлопываются в 1/2.
const fs = require('fs'), { JSDOM } = require('jsdom');
const root = __dirname + '/../..';
const html = fs.readFileSync(root + '/STRUCHORD.html', 'utf8');
const song = JSON.parse(fs.readFileSync(root + '/uploads/Дешевые Драмы.struchord.json', 'utf8'));

function boot() {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/',
    beforeParse(win) { win.HTMLCanvasElement.prototype.getContext = () => ({ font: '', measureText: () => ({ width: 10 }),
      clearRect(){}, beginPath(){}, arc(){}, fill(){}, stroke(){}, moveTo(){}, lineTo(){}, closePath(){}, save(){},
      restore(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, setTransform(){}, scale(){},
      createLinearGradient: () => ({ addColorStop(){} }) }); } });
  const w = dom.window;
  w.AudioContext = w.webkitAudioContext = function () { return { currentTime: 0, state: 'running', resume() {} }; };
  w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
  w.loadSong(0);
  try { w.render(); } catch (e) {}
  return w;
}
const spans = (w) => JSON.parse(w.eval(`JSON.stringify(sections[0].squares[1].events.map(e=>e.span))`));
const W = 800, gs = W / 16;

function gesture(w, hi, dxs) {
  const sq = w.document.querySelectorAll('.square-inner')[1];
  sq.getBoundingClientRect = () => ({ left: 0, right: W, width: W, top: 0, bottom: 60, height: 60 });
  sq.querySelectorAll('.chord-wrapper').forEach((cw) => {
    cw.getBoundingClientRect = () => ({ left: 0, right: 100, width: 100, top: 0, bottom: 60, height: 60 });
  });
  const h = sq.querySelectorAll('.resize-handle')[hi];
  const e = new w.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 0 });
  if (typeof h.onpointerdown === 'function') h.onpointerdown(e); else h.dispatchEvent(e);
  dxs.forEach((x) => w.document.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, cancelable: true, clientX: x })));
  w.document.dispatchEvent(new w.MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: dxs.length ? dxs[dxs.length - 1] : 0 }));
}

(async () => {
  const cases = [
    ['КЛИК без движения (0px), ручка Am|G', 2, []],
    ['микродвижение 3px, ручка Am|G', 2, [3]],
    ['ЧУЖАЯ граница F|E (handle 1) на 1 долю', 1, [gs]],
    ['своя граница Am|G (handle 2) на 1 долю', 2, [gs]],
  ];
  for (const [name, hi, dxs] of cases) {
    const w = boot();
    const before = spans(w).join(' | ');
    gesture(w, hi, dxs);
    await new Promise((r) => setTimeout(r, 250));
    const after = spans(w).join(' | ');
    console.log(`\n${name}\n  до:    ${before}\n  после: ${after}\n  ${before === after ? 'не тронуто' : '<<< дробные 1.75/2.25 снесены'}`);
  }
})();
