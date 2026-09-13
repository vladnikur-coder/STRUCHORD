// B-72: толкание — дойдя до дальнего края соседа, граница толкает его
// дальше цепочкой; сосед фиксируется на шаге зума; назад всё возвращается.
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
  console.log('=== 100%: 2|2|2|2|4|4, тянем первую границу до 7 ===');
  {
    const r = await drag([2, 2, 2, 2, 4, 4], 1, 0, [3.0, 4.0, 5.0, 6.0, 7.0]);
    ok('до 3: 3|1 — обычная пара', Math.abs(r.previews[0] - 3) < 0.05, r.previews.join(' '));
    ok('до 4: сосед на шаге, толкаем третью', Math.abs(r.previews[1] - 4) < 0.05, r.previews.join(' '));
    ok('до 7: граница дошла до 7', Math.abs(r.previews[4] - 7) < 0.05 && r.finalEdge === 7, r.previews.join(' ') + ' / ' + r.finalEdge);
    ok('раскладка: 7 | 1 | 1 | 1 | 2 | 4 (проеханные на шаге, следующая обрезана, дальняя цела)', r.spans === '[7,1,1,1,2,4]', r.spans);
  }
  console.log('=== 100%: назад в том же жесте всё возвращается ===');
  {
    const r = await drag([2, 2, 2, 2, 4, 4], 1, 0, [7.0, 5.0, 3.0, 2.0]);
    ok('назад до 5: 5 | 1 | 1 | 1 | 4 | 4', Math.abs(r.previews[1] - 5) < 0.05, r.previews.join(' '));
    ok('назад до 2: исходное 2|2|2|2|4|4', r.finalEdge === 2 && r.spans === '[2,2,2,2,4,4]', r.spans);
  }
  console.log('=== 100%: толкание влево ===');
  {
    const r = await drag([2, 2, 2, 2, 4, 4], 1, 2, [3.0, 1.0]);
    ok('тянем к 1, но левее 3 нельзя (три ячейки по шагу): 1 | 1 | 1 | 5 | 4 | 4, граница 3', r.spans === '[1,1,1,5,4,4]' && r.finalEdge === 3, r.spans + ' / ' + r.finalEdge);
  }
  console.log('=== 100%: до самого края — дальше стена ===');
  {
    const r = await drag([2, 2, 2, 2, 4, 4], 1, 0, [12.0, 15.0, 16.0]);
    ok('дальше 11 нельзя — последняя ячейка тоже ≥ шаг: 11 | 1 | 1 | 1 | 1 | 1', r.finalEdge === 11 && r.spans === '[11,1,1,1,1,1]', r.spans + ' / ' + r.finalEdge);
  }
  console.log('=== 150%: шаг восьмые — проеханные фиксируются на 0.5 ===');
  {
    const r = await drag([2, 2, 2, 2, 4, 4], 1.5, 0, [5.0]);
    ok('5 | 0.5 | 0.5 | 2 | 4 | 4', r.spans === '[5,0.5,0.5,2,4,4]', r.spans);
  }
  console.log('=== дробный сосед 1.5|2.5|4: толкаем через 4 ===');
  {
    const r = await drag([1.5, 2.5, 4, 4, 4], 1, 0, [5.0]);
    ok('5 | 0.5 | 2.5 | 4 | 4 — сосед оставил остаток 0.5, следующая отдала недостающее', r.spans === '[5,0.5,2.5,4,4]', r.spans);
  }
  console.log('=== нетронутые дальние ячейки бит-в-бит (1.75/2.25 в конце) ===');
  {
    const r = await drag([2, 2, 2, 2, 1.75, 2.25, 4], 1, 0, [5.0]);
    ok('5 | 1 | 1 | 1 | 1.75 | 2.25 | 4', r.spans === '[5,1,1,1,1.75,2.25,4]', r.spans);
  }
  console.log('=== пример пользователя 2026-09-12: 2|1.25|1.75|0.5|4|4 → к 7 ===');
  {
    const r = await drag([2, 1.25, 1.75, 0.5, 4, 6.5], 1, 0, [3.0, 4.0, 5.0, 6.0, 7.0]);
    ok('7 | 0.25 | 0.75 | 0.5 | 1 | 6.5 (квадрат 16)', r.spans === '[7,0.25,0.75,0.5,1,6.5]', r.spans);
    ok('граница 7', r.finalEdge === 7, String(r.finalEdge));
    const b = await drag([2, 1.25, 1.75, 0.5, 4, 6.5], 1, 0, [7.0, 4.0, 2.0]);
    ok('назад — исходное', b.spans === '[2,1.25,1.75,0.5,4,6.5]', b.spans);
  }
  console.log(bad ? `\nFAIL: ${bad}` : '\nALL OK');
  process.exit(bad ? 1 : 0);
})();
