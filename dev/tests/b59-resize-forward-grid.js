// B-59: ресайз ВПЕРЁД не должен мельчить сетку подсказки.
//
// Пользователь 2026-09-06: «при ресайзе назад бой в порядке, а при
// ресайзе вперёд ломается до отпускания мыши». Замер показал: вперёд в
// подсказке появлялся шаг 1.56% — сетка sub4, вдвое мельче настоящей,
// хотя subdivision в модели оставался 2.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8');
const song = JSON.parse(fs.readFileSync(__dirname + '/../../uploads/Дешевые Драмы.struchord.json', 'utf8'));
let bad = 0;
const ok = (n, c, x) => { console.log(`   ${c ? 'ok  ' : 'FAIL'} ${n}${!c && x ? ' — ' + x : ''}`); if (!c) bad++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const W = 800;

function boot() {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/',
    beforeParse(w) { w.HTMLCanvasElement.prototype.getContext = () => ({ font: '', measureText: () => ({ width: 10 }),
      clearRect(){},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},closePath(){},save(){},restore(){},
      translate(){},rotate(){},fillText(){},strokeText(){},setTransform(){},scale(){},setLineDash(){},
      createLinearGradient:()=>({addColorStop(){}}) }); } });
  const w = dom.window;
  w.AudioContext = w.webkitAudioContext = function () { return { currentTime: 0, state: 'running', resume() {} }; };
  w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
  w.loadSong(0);
  try { w.render(); } catch (e) {}
  return w;
}

// Звучащие удары подсказки, абсолютные % ширины квадрата.
const hits = (w) => {
  const out = [];
  w.document.querySelectorAll('.rhythm-hint').forEach((strip) => {
    const L = parseFloat(strip.style.left) || 0;
    const WD = parseFloat(strip.style.width) || 0;
    strip.querySelectorAll('.rhythm-hint-hit').forEach((h) => {
      if (h.classList.contains('rest')) return;
      if (h.style.display === 'none') return;
      out.push(+(L + WD * (parseFloat(h.style.left) || 0) / 100).toFixed(2));
    });
  });
  return out.sort((a, b) => a - b);
};

// Квадрат 16 долей при sub2: узел = кратное 3.125%.
//
// ИСКЛЮЧЕНИЕ: ячейка G начинается на дробной доле 5.75, и билдер
// подсказки кладёт её удары от начала ЯЧЕЙКИ (6.25, 6.75, 7.25, 7.75),
// а не от узлов квадрата. Это исходное поведение 0.176, к направлению
// жеста отношения не имеет — отдельный дефект B-57. Здесь проверяем
// именно жалобу пользователя: НЕ ПОЯВЛЯЮТСЯ ли в жесте удары на сетке
// ВДВОЕ МЕЛЬЧЕ (sub4, шаг 1.5625%), которых до жеста не было.
const offGrid = (arr) => arr.filter((v) => Math.abs(v / 3.125 - Math.round(v / 3.125)) > 0.02);
// Узлы «чужой» мелкой сетки: кратны 1.5625, но не 3.125.
const onSub4Only = (arr) => arr.filter((v) =>
  Math.abs(v / 1.5625 - Math.round(v / 1.5625)) < 0.02
  && Math.abs(v / 3.125 - Math.round(v / 3.125)) > 0.02);

async function drag(dir) {
  const w = boot();
  await sleep(300);
  const sq = w.document.querySelectorAll('.square-inner')[1];
  sq.getBoundingClientRect = () => ({ left: 0, right: W, width: W, top: 0, bottom: 60, height: 60 });
  sq.querySelectorAll('.chord-wrapper').forEach((cw) => {
    cw.getBoundingClientRect = () => ({ left: 0, right: 100, width: 100, top: 0, bottom: 60, height: 60 });
  });
  const gs = W / 16;
  const h = sq.querySelectorAll('.resize-handle')[1];
  const down = new w.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 0 });
  if (typeof h.onpointerdown === 'function') h.onpointerdown(down); else h.dispatchEvent(down);
  const before = hits(w);
  const during = [];
  for (const frac of [0.25, 0.5, 0.75, 1.0]) {
    w.document.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, cancelable: true, clientX: dir * gs * frac }));
    await sleep(70);
    during.push(hits(w));
  }
  w.document.dispatchEvent(new w.MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: dir * gs }));
  await sleep(350);
  return { before, during, after: hits(w) };
}

(async () => {
  console.log('=== 1. ВПЕРЁД: сетка не мельчает в жесте ===');
  const fwd = await drag(1);
  // Внесеточные точки, которых НЕ БЫЛО до движения. Ячейка G стоит мимо
  // узлов изначально (B-57) — её мы не считаем регрессией направления.
  const fresh = (snap, before) => onSub4Only(snap)
    .filter((v) => !before.some((u) => Math.abs(u - v) < 0.02));
  let worst = [];
  fwd.during.forEach((snap) => { const o = fresh(snap, fwd.before); if (o.length > worst.length) worst = o; });
  ok('в жесте не появилась мелкая сетка sub4', worst.length === 0, worst.join(' '));
  ok('после отпускания её тоже нет', fresh(fwd.after, fwd.before).length === 0,
     fresh(fwd.after, fwd.before).join(' '));

  console.log('=== 2. НАЗАД: как было ===');
  const back = await drag(-1);
  let worstB = [];
  back.during.forEach((snap) => { const o = fresh(snap, back.before); if (o.length > worstB.length) worstB = o; });
  ok('в жесте не появилась мелкая сетка sub4', worstB.length === 0, worstB.join(' '));
  ok('после отпускания её тоже нет', fresh(back.after, back.before).length === 0,
     fresh(back.after, back.before).join(' '));
  console.log('=== 2b. Вперёд и назад ведут себя ОДИНАКОВО ===');
  ok('число ударов совпадает', fwd.after.length === back.after.length,
     fwd.after.length + ' vs ' + back.after.length);

  console.log('=== 3. Нет задвоенных ударов на стыке ячеек ===');
  const dupes = (a) => a.filter((v, i) => i > 0 && Math.abs(v - a[i - 1]) < 1e-9);
  ok('вперёд: дублей нет', dupes(fwd.after).length === 0, dupes(fwd.after).join(' '));
  ok('назад: дублей нет', dupes(back.after).length === 0, dupes(back.after).join(' '));


  console.log('=== 4. Ячейки, ЗАТРОНУТЫЕ жестом, встают на узлы ===');
  {
    // Прямая проверка исправления: у пары ячеек вокруг ручки (#1 и #2)
    // все удары обязаны лежать на узлах квадрата. Без пересчёта по
    // геометрии выросшая ячейка сохраняла координаты от старой ширины.
    const cellHits = (w, idx) => {
      const strip = w.document.querySelectorAll('.rhythm-hint')[idx];
      if (!strip) return [];
      const L = parseFloat(strip.style.left) || 0;
      const WD = parseFloat(strip.style.width) || 0;
      return Array.from(strip.querySelectorAll('.rhythm-hint-hit'))
        .filter((h) => !h.classList.contains('rest') && h.style.display !== 'none')
        .map((h) => +(L + WD * (parseFloat(h.style.left) || 0) / 100).toFixed(2));
    };
    const w = boot();
    await sleep(300);
    const sq = w.document.querySelectorAll('.square-inner')[1];
    sq.getBoundingClientRect = () => ({ left: 0, right: W, width: W, top: 0, bottom: 60, height: 60 });
    sq.querySelectorAll('.chord-wrapper').forEach((cw) => {
      cw.getBoundingClientRect = () => ({ left: 0, right: 100, width: 100, top: 0, bottom: 60, height: 60 });
    });
    const gs = W / 16;
    const h = sq.querySelectorAll('.resize-handle')[1];
    const down = new w.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 0 });
    if (typeof h.onpointerdown === 'function') h.onpointerdown(down); else h.dispatchEvent(down);
    for (const frac of [0.5, 1.0]) {
      w.document.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, cancelable: true, clientX: gs * frac }));
      await sleep(70);
    }
    const pair = [...cellHits(w, 1), ...cellHits(w, 2)];
    console.log('      пара у ручки:', pair.join(' '));
    ok('все удары пары на узлах сетки', offGrid(pair).length === 0, offGrid(pair).join(' '));
  }

  console.log(bad ? `\nFAIL: ${bad}` : '\nALL OK');
  if (bad) process.exitCode = 1;
})();
