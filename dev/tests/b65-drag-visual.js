// B-65: перетаскивание секций в редакторе — вид приведён к панели.
//
// Замечание пользователя (2026-09-06): «когда просто перетаскиваешь
// секцию по полю, выглядит не очень» — на фоне панели структуры, где
// то же действие читается верно.
//
// Что было не так:
//   1) .section-card.dragging имел opacity 0.12 — карточка почти
//      исчезала, на её месте зияла дыра;
//   2) линия вставки всегда рисовалась СНИЗУ цели, хотя секция может
//      встать и перед ней — результат жеста был непредсказуем.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8');
const song = JSON.parse(fs.readFileSync(__dirname + '/../../uploads/Police - Every breath you take.struchord-2.json', 'utf8'));
let bad = 0;
const ok = (n, c, x) => { console.log(`   ${c ? 'ok  ' : 'FAIL'} ${n}${!c && x ? ' — ' + x : ''}`); if (!c) bad++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

(async () => {
  console.log('=== 1. Карточка не пропадает при перетаскивании ===');
  {
    const m = html.match(/\.section-card\.dragging\s*\{[^}]*opacity:\s*([0-9.]+)/s);
    ok('opacity задан', !!m, 'правило не найдено');
    const val = m ? parseFloat(m[1]) : 0;
    ok('карточка остаётся различимой (>= 0.3)', val >= 0.3, String(val));
    ok('совпадает с панелью структуры (0.4)', val === 0.4, String(val));
  }

  console.log('=== 2. Линия вставки показывает СТОРОНУ ===');
  {
    ok('есть правило для линии СНИЗУ', /\.section-card\.drag-over::after\s*\{\s*bottom:/s.test(html));
    ok('есть правило для линии СВЕРХУ', /\.section-card\.drag-over-before::after\s*\{\s*top:/s.test(html));
  }

  console.log('=== 3. Сторона выбирается по положению курсора ===');
  {
    const w = boot();
    await sleep(300);
    const cards = [...w.document.querySelectorAll('.section-card')];
    const target = cards[3];
    target.getBoundingClientRect = () => ({ top: 300, height: 200, bottom: 500, left: 0, right: 800, width: 800 });
    // Имитируем начатое перетаскивание другой секции.
    w.eval('draggedItemId = sections[0].id; isDragging = true;');
    const fire = (y) => {
      const e = new w.MouseEvent('dragover', { bubbles: true, cancelable: true });
      Object.defineProperty(e, 'clientY', { value: y });
      target.dispatchEvent(e);
      return [...target.classList].filter((c) => c.startsWith('drag-over'));
    };
    ok('выше середины -> линия сверху', fire(350).includes('drag-over-before'), fire(350).join(','));
    const below = fire(450);
    ok('ниже середины -> линия снизу',
       below.includes('drag-over') && !below.includes('drag-over-before'), below.join(','));
    ok('одновременно только одна сторона', fire(450).length === 1, fire(450).join(','));

    target.dispatchEvent(new w.MouseEvent('dragleave', { bubbles: true }));
    ok('dragleave убирает ОБА класса',
       ![...target.classList].some((c) => c.startsWith('drag-over')), [...target.classList].join(','));
  }

  console.log('=== 4. Общая уборка не забывает новый класс ===');
  {
    // endDrag снимает классы со всех карточек — если забыть
    // drag-over-before, линия останется висеть после броска.
    ok('endDrag чистит drag-over-before',
       /remove\('dragging',\s*'drag-over',\s*'drag-over-before'\)/.test(html));
  }

  console.log(bad ? `\nFAIL: ${bad}` : '\nALL OK');
  if (bad) process.exitCode = 1;
})();
