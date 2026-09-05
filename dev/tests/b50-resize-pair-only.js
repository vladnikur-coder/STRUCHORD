// B-50 (2026-09-05): ресайз границы меняет ТОЛЬКО пару у ручки.
//
// Дефект (найден пользователем на песне «Дешевые Драмы»): в квадрате с
// долями 2|2|1.75|2.25|4|4 протяжка ЛЮБОЙ границы прогоняла через
// Math.round(span/step)*step весь квадрат, и ячейки, к которым никто не
// прикасался, теряли дробные доли. Дробные доли законны: они получаются
// при зуме с шагом 0.25 и приходят из импортированных файлов.
//
// Контракт (решение пользователя 2026-09-05):
//   - меняются только две ячейки по бокам перетаскиваемой границы;
//   - обе встают на текущий шаг сетки (четверти без зума, восьмые дальше);
//   - остальные ячейки сохраняют span бит-в-бит, включая некратные шагу;
//   - длина квадрата не меняется: сумма пары постоянна.
const fs = require('fs');
const { JSDOM } = require('jsdom');

const root = __dirname + '/../..';
const html = fs.readFileSync(root + '/STRUCHORD.html', 'utf8');

let bad = 0;
const ok = (name, cond, extra) => {
  console.log(`   ${cond ? 'ok  ' : 'FAIL'} ${name}${!cond && extra !== undefined ? ' — ' + extra : ''}`);
  if (!cond) bad++;
};

function boot() {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/',
    beforeParse(win) {
      win.HTMLCanvasElement.prototype.getContext = () => ({
        font: '', measureText: () => ({ width: 10 }),
        clearRect(){}, beginPath(){}, arc(){}, fill(){}, stroke(){}, moveTo(){},
        lineTo(){}, closePath(){}, save(){}, restore(){}, translate(){}, rotate(){},
        fillText(){}, strokeText(){}, setTransform(){}, scale(){}, setLineDash(){},
        createLinearGradient: () => ({ addColorStop(){} }),
      });
    },
  });
  const w = dom.window;
  w.AudioContext = w.webkitAudioContext = function () {
    return { currentTime: 0, state: 'running', resume() {} };
  };
  // Квадрат-репро: две дробные ячейки в середине, целые по краям.
  w.eval(`
    globalTimeSig = '4/4';
    squareZoom = 1;
    sections = [{ id: 1, type: 'Verse', customName: null, key: null, timeSig: null, bpm: 0,
      repeat: 1, strumPattern: null, squares: [
        { id: 2, repeat: 1, customBeats: null, strumPattern: null, events: [
          { chord: 'F', span: 2, timeSig: null, strumPattern: null },
          { chord: 'E', span: 2, timeSig: null, strumPattern: null },
          { chord: 'Am', span: 1.75, timeSig: null, strumPattern: null },
          { chord: 'G', span: 2.25, timeSig: null, strumPattern: null },
          { chord: 'F', span: 4, timeSig: null, strumPattern: null },
          { chord: 'E', span: 4, timeSig: null, strumPattern: null },
        ]},
      ]
    }];
    nextId = 20;
  `);
  try { w.render(); } catch (e) {}
  return w;
}

const spans = (w) => JSON.parse(w.eval('JSON.stringify(sections[0].squares[0].events.map(e=>e.span))'));
const W = 800;
const gs = W / 16; // одна доля в px: квадрат 16 долей

function drag(w, handleIndex, fromX, points) {
  const sq = w.document.querySelector('.square-inner');
  sq.getBoundingClientRect = () => ({ left: 0, right: W, width: W, top: 0, bottom: 60, height: 60 });
  sq.querySelectorAll('.chord-wrapper').forEach((cw) => {
    cw.getBoundingClientRect = () => ({ left: 0, right: 100, width: 100, top: 0, bottom: 60, height: 60 });
  });
  const h = sq.querySelectorAll('.resize-handle')[handleIndex];
  const down = new w.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: fromX });
  if (typeof h.onpointerdown === 'function') h.onpointerdown(down); else h.dispatchEvent(down);
  points.forEach((x) => w.document.dispatchEvent(
    new w.MouseEvent('pointermove', { bubbles: true, cancelable: true, clientX: x })));
  w.document.dispatchEvent(
    new w.MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: points[points.length - 1] }));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('B-50: ресайз трогает только пару у ручки\n');

  // 1. Чужая граница не смеет ровнять дробные доли.
  {
    const w = boot();
    ok('шаг сетки без зума = 1 доля', w.eval('getResizeStep()') === 1, w.eval('getResizeStep()'));
    drag(w, 1, 0, [20, 40, gs]); // граница E|Am — пара (1,2)
    await sleep(250);
    const s = spans(w);
    ok('G вне пары сохранил дробный span 2.25', s[3] === 2.25, s.join(' | '));
    ok('крайние F/E не тронуты', s[0] === 2 && s[4] === 4 && s[5] === 4, s.join(' | '));
    ok('длина квадрата = 16', Math.abs(s.reduce((a, b) => a + b, 0) - 16) < 1e-9, s.reduce((a, b) => a + b, 0));
  }

  // 2. Своя граница: обе ячейки пары встают на четверти.
  {
    const w = boot();
    drag(w, 2, 0, [20, 40, gs]); // граница Am|G — пара (2,3)
    await sleep(250);
    const s = spans(w);
    ok('Am встал на целую долю', Number.isInteger(s[2]), s[2]);
    ok('G встал на целую долю', Number.isInteger(s[3]), s[3]);
    ok('сумма пары сохранена (4)', Math.abs(s[2] + s[3] - 4) < 1e-9, s[2] + s[3]);
    ok('соседи вне пары целы', s[0] === 2 && s[1] === 2 && s[4] === 4 && s[5] === 4, s.join(' | '));
    ok('длина квадрата = 16', Math.abs(s.reduce((a, b) => a + b, 0) - 16) < 1e-9, s.reduce((a, b) => a + b, 0));
  }

  // 3. Клик без движения ничего не меняет.
  {
    const w = boot();
    const before = spans(w).join(' | ');
    drag(w, 2, 0, [0]);
    await sleep(250);
    ok('клик по ручке не квантует дроби', spans(w).join(' | ') === before, spans(w).join(' | '));
  }

  // 4. Шаг восьмых: пара встаёт на восьмые, чужие дроби живы.
  {
    const w = boot();
    w.eval('squareZoom = 1.5;');
    ok('шаг при зуме 1.5 = 0.5', w.eval('getResizeStep()') === 0.5, w.eval('getResizeStep()'));
    drag(w, 0, 0, [10, 20, gs / 2]); // граница F|E — пара (0,1)
    await sleep(250);
    const s = spans(w);
    const onEighth = (v) => Math.abs(v / 0.5 - Math.round(v / 0.5)) < 1e-9;
    ok('пара кратна восьмой', onEighth(s[0]) && onEighth(s[1]), `${s[0]} | ${s[1]}`);
    ok('дробные Am/G вне пары не тронуты', s[2] === 1.75 && s[3] === 2.25, s.join(' | '));
    ok('длина квадрата = 16', Math.abs(s.reduce((a, b) => a + b, 0) - 16) < 1e-9, s.reduce((a, b) => a + b, 0));
  }

  console.log(bad ? `\nFAIL: ${bad}` : '\nALL OK');
  process.exit(bad ? 1 : 0);
})();
