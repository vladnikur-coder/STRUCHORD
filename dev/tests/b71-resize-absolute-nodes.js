// B-71: граница ячейки при ресайзе ходит по АБСОЛЮТНЫМ узлам сетки зума.
//
// Решения пользователя 2026-09-12:
//  1в) узел берётся, когда курсор до него ДОШЁЛ (обе стороны);
//  2а) исходное дробное положение остаётся узлом до конца жеста;
//  3в) длина ячейки любая > 0;
//  4а) на зуме 150% с «та» первый шаг — ближайшая восьмая.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8');
let bad = 0;
const ok = (n, c, x) => { console.log(`   ${c ? 'ok  ' : 'FAIL'} ${n}${!c && x ? ' — ' + x : ''}`); if (!c) bad++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const W = 1600; // 16 долей → 100px на долю

function boot(spans, zoom) {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/',
    beforeParse(w) { w.HTMLCanvasElement.prototype.getContext = () => ({ font: '', measureText: () => ({ width: 10 }),
      clearRect(){},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},closePath(){},save(){},restore(){},
      translate(){},rotate(){},fillText(){},strokeText(){},setTransform(){},scale(){},setLineDash(){},
      createLinearGradient:()=>({addColorStop(){}}) }); } });
  const w = dom.window;
  w.AudioContext = w.webkitAudioContext = function () { return { currentTime: 0, state: 'running', resume() {} }; };
  w.eval(`
    sections = [{ id: 1, type: 'Verse', customName: null, key: 'C', timeSig: null, bpm: 0, repeat: 1, strumPattern: null,
      squares: [{ id: 11, repeat: 1, customBeats: null, strumPattern: null,
        events: ${JSON.stringify(spans)}.map((sp, i) => ({ chord: ['C','G','Am','F'][i % 4], span: sp, timeSig: null, strumPattern: null })) }] }];
    squareZoom = ${zoom};
    render();
  `);
  return w;
}

// граница после ячейки ei в долях квадрата
const edge = (w, ei) => w.eval(`sections[0].squares[0].events.slice(0, ${ei + 1}).reduce((s, e) => s + e.span, 0)`);
const spansOf = (w) => w.eval(`JSON.stringify(sections[0].squares[0].events.map(e => e.span))`);

// path — список позиций курсора в ДОЛЯХ квадрата (абсолютных); возвращает
// границу после каждого шага (превью по gridTemplateColumns) и финал.
async function drag(spans, zoom, ei, path) {
  const w = boot(spans, zoom);
  await sleep(200);
  const sq = w.document.querySelector('.square-inner');
  sq.getBoundingClientRect = () => ({ left: 0, right: W, width: W, top: 0, bottom: 60, height: 60 });
  Object.defineProperty(sq, 'clientWidth', { value: W, configurable: true });
  sq.querySelectorAll('.chord-wrapper').forEach((cw) => {
    cw.getBoundingClientRect = () => ({ left: 0, right: 100, width: 100, top: 0, bottom: 60, height: 60 });
  });
  const startEdge = edge(w, ei);
  const px = (beats) => beats * (W / 16);
  const h = sq.querySelectorAll('.resize-handle')[ei];
  const down = new w.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: px(startEdge) });
  if (typeof h.onpointerdown === 'function') h.onpointerdown(down); else h.dispatchEvent(down);
  const previews = [];
  for (const b of path) {
    w.document.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, cancelable: true, clientX: px(b) }));
    await sleep(60);
    // превью: доля границы по fr-весам (веса ∝ ширине, gap мал)
    const tpl = sq.style.gridTemplateColumns || '';
    const fr = [...tpl.matchAll(/minmax\(0, ([\d.]+)fr\)/g)].map((m) => +m[1]);
    if (fr.length) {
      const total = fr.reduce((a, b) => a + b, 0);
      const left = fr.slice(0, ei + 1).reduce((a, b) => a + b, 0);
      previews.push(+(16 * left / total).toFixed(2));
    } else previews.push(startEdge);
  }
  const last = path[path.length - 1];
  w.document.dispatchEvent(new w.MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: px(last) }));
  await sleep(400);
  return { startEdge, previews, finalEdge: +edge(w, ei).toFixed(3), spans: spansOf(w) };
}

(async () => {
  console.log('=== граница на «и» (1.5), зум 100%, вправо ===');
  {
    const r = await drag([1.5, 2.5, 4, 4, 4], 1, 0, [1.6, 1.9, 1.99, 2.0, 2.4, 2.99, 3.0]);
    ok('до 2 не дошли — граница стоит на 1.5 (1в)', r.previews[0] === 1.5 && r.previews[1] === 1.5 && r.previews[2] === 1.5, r.previews.join(' '));
    ok('дошли до 2 — граница на 2', Math.abs(r.previews[3] - 2) < 0.05, r.previews.join(' '));
    ok('между 2 и 3 — стоит на 2', Math.abs(r.previews[4] - 2) < 0.05 && Math.abs(r.previews[5] - 2) < 0.05, r.previews.join(' '));
    ok('дошли до 3 — граница на 3, финал 3', Math.abs(r.previews[6] - 3) < 0.05 && r.finalEdge === 3, r.previews.join(' ') + ' / ' + r.finalEdge);
    ok('сумма пары не изменилась (3 + 1 = 4)', r.spans === '[3,1,4,4,4]', r.spans);
  }
  console.log('=== граница на «и» (1.5), зум 100%, влево ===');
  {
    const r = await drag([1.5, 2.5, 4, 4, 4], 1, 0, [1.4, 1.1, 1.01, 1.0, 0.5]);
    ok('до 1 не дошли — стоит на 1.5', r.previews[0] === 1.5 && r.previews[2] === 1.5, r.previews.join(' '));
    ok('дошли до 1 — граница на 1', Math.abs(r.previews[3] - 1) < 0.05, r.previews.join(' '));
    ok('дальше влево узла нет (0 — начало) — стоит на 1, финал 1', Math.abs(r.previews[4] - 1) < 0.05 && r.finalEdge === 1, r.previews.join(' ') + ' / ' + r.finalEdge);
    ok('пара 1 + 3', r.spans === '[1,3,4,4,4]', r.spans);
  }
  console.log('=== обратный путь: 1.5 → 2 → 3 → назад — 1.5 доступна (2а) ===');
  {
    const r = await drag([1.5, 2.5, 4, 4, 4], 1, 0, [3.0, 2.5, 2.0, 1.7, 1.5, 1.2, 1.0]);
    ok('назад до 2 — на 2', Math.abs(r.previews[2] - 2) < 0.05, r.previews.join(' '));
    ok('назад между 2 и 1.5 — ещё на 2', Math.abs(r.previews[3] - 2) < 0.05, r.previews.join(' '));
    ok('дошли до 1.5 — вернулись на исходное 1.5', Math.abs(r.previews[4] - 1.5) < 0.05, r.previews.join(' '));
    ok('дальше — 1', Math.abs(r.previews[6] - 1) < 0.05 && r.finalEdge === 1, r.previews.join(' '));
  }
  console.log('=== граница на «та» (1.25), зум 100% ===');
  {
    const r = await drag([1.25, 2.75, 4, 4, 4], 1, 0, [2.0]);
    ok('вправо — на 2 (ближайшее целое)', r.finalEdge === 2, String(r.finalEdge));
    const l = await drag([1.25, 2.75, 4, 4, 4], 1, 0, [1.0]);
    ok('влево — на 1', l.finalEdge === 1, String(l.finalEdge));
  }
  console.log('=== граница на «та» (1.25), зум 150% — шаг восьмые (4а) ===');
  {
    const r = await drag([1.25, 2.75, 4, 4, 4], 1.5, 0, [1.4, 1.5, 1.9, 2.0]);
    ok('до 1.5 не дошли — на 1.25', Math.abs(r.previews[0] - 1.25) < 0.05, r.previews.join(' '));
    ok('дошли до 1.5 — на 1.5', Math.abs(r.previews[1] - 1.5) < 0.05, r.previews.join(' '));
    ok('дальше по восьмым: 2', Math.abs(r.previews[3] - 2) < 0.05 && r.finalEdge === 2, r.previews.join(' ') + ' / ' + r.finalEdge);
    const l = await drag([1.25, 2.75, 4, 4, 4], 1.5, 0, [1.0]);
    ok('влево — на 1', l.finalEdge === 1, String(l.finalEdge));
  }
  console.log('=== ячейка начинается на «и»: граница 2.5 идёт на целые, не на 3.5 ===');
  {
    const r = await drag([0.5, 2, 1.5, 4, 4, 4], 1, 1, [3.0, 3.5]);
    ok('граница после второй ячейки 2.5 → 3 (абсолютный узел)', Math.abs(r.previews[0] - 3) < 0.05, r.previews.join(' '));
    ok('дальше вправо узла внутри пары нет (сосед кончается на 4) — стоит на 3', r.finalEdge === 3, String(r.finalEdge));
    ok('длина 2.5 законна (3в)', r.spans === '[0.5,2.5,1,4,4,4]', r.spans);
  }
  console.log('=== короткий сосед: длина > 0, но не 0 (3в) ===');
  {
    const r = await drag([1, 1.25, 1.75, 4, 4, 4], 1, 0, [2.0, 2.3, 2.5]);
    ok('граница 1 → 2 (сосед 1.25 → 0.25)', r.finalEdge === 2, String(r.finalEdge));
    ok('спаны', r.spans === '[2,0.25,1.75,4,4,4]', r.spans);
  }
  console.log('=== касание ручки без движения ничего не меняет ===');
  {
    const r = await drag([1.5, 2.5, 4, 4, 4], 1, 0, [1.5, 1.52, 1.5]);
    ok('граница осталась 1.5', r.finalEdge === 1.5 && r.spans === '[1.5,2.5,4,4,4]', r.spans);
  }
  console.log(bad ? `\nFAIL: ${bad}` : '\nALL OK');
  process.exit(bad ? 1 : 0);
})();
