// B-65 (0.200): перетаскивание секций в редакторе — ярлык + слот.
//
// Спека пользователя (2026-09-10): при захвате секция сворачивается в
// компактный ярлык (как строка панели структуры), соседи открывают слот
// размером с ярлык, ярлык догоняет курсор, при отпускании летит в слот
// и секция разворачивается на месте; Esc/бросок вне поля — возврат.
// Нативный DnD (0.192 и раньше) снят — им не управлялись ни картинка,
// ни запаздывание.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8');
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
  if (!w.PointerEvent) w.PointerEvent = w.MouseEvent;
  w.Element.prototype.animate = w.Element.prototype.animate || function () { return { cancel() {}, onfinish: null }; };
  w.Element.prototype.setPointerCapture = w.Element.prototype.setPointerCapture || function () {};
  const mk = (id, type, n) => ({ id, type, customName: null, key: 'C', timeSig: null, bpm: 0, repeat: 1, strumPattern: null,
    squares: Array.from({ length: n }, (_, i) => ({ id: id * 100 + i, repeat: 1, customBeats: null, strumPattern: null,
      events: [{ chord: 'C', span: 4, timeSig: null, strumPattern: null }] })) });
  const song = { title: 'b65', sections: [mk(1, 'Intro', 1), mk(2, 'Verse', 2), mk(3, 'Chorus', 1)] };
  w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
  w.loadSong(0);
  try { w.render(); } catch (e) {}
  return w;
}
const SD = (w) => w.eval('sectionDrag');
const ISD = (w) => w.eval('isDragging');
const pe = (w, type, target, x, y, extra = {}) => target.dispatchEvent(new w.PointerEvent(type, Object.assign({ bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: 0 }, extra)));

(async () => {
  console.log('=== 1. Нативный DnD снят, жест на pointer-событиях ===');
  {
    ok('startDrag/endDrag нативного DnD больше нет', !/function startDrag\(e, card, id\)/.test(html) && !/setDragImage\(ghost/.test(html));
    ok('заголовок не draggable', /header\.removeAttribute\('draggable'\)/.test(html));
    ok('старые правила .dragging/.drag-over сняты', !/\.section-card\.dragging\s*\{/.test(html) && !/\.section-card\.drag-over::after/.test(html));
    ok('ярлык и слот описаны в CSS', /\.section-drag-chip\s*\{/.test(html) && /\.section-card\.is-drag-slot\s*\{/.test(html));
  }
  console.log('=== 2. Сворачивание в слот и ярлык ===');
  const w = boot();
  const d = w.document;
  const card2 = d.querySelector('.section-card[data-id="2"]');
  const hdr = card2 && card2.querySelector('.section-header .drag-handle');
  ok('карточки отрисованы', !!hdr);
  if (hdr) {
    pe(w, 'pointerdown', hdr, 100, 200);
    ok('до порога 5px жест не начат', SD(w) && SD(w).pending && !SD(w).active);
    pe(w, 'pointermove', d, 102, 202);
    ok('2px — всё ещё ожидание', SD(w) && !!SD(w).pending);
    pe(w, 'pointermove', d, 120, 230);
    ok('после порога жест активен', SD(w) && SD(w).active === true);
    ok('карточка стала слотом', card2.classList.contains('is-drag-slot'));
    ok('высота слота — инлайн (анимируется)', /px$/.test(card2.style.height));
    const chip = d.getElementById('sectionDragChip');
    ok('ярлык создан и виден', !!chip && chip.style.display === 'flex');
    ok('ярлык несёт имя секции и класс типа', !!chip && /Куплет/.test(chip.textContent) && chip.classList.contains('verse'));
    ok('тултипы аппликатур заглушены на время жеста', ISD(w) === true);
    console.log('=== 3. Слот переставляется, модель — только при броске ===');
    // курсор ниже середины третьей карточки — jsdom без раскладки даёт нули, поэтому подменим кэш rect'ов
    const cards = [...d.querySelectorAll('.section-card')];
    w.__cards = cards; w.eval('sectionDrag.rects = window.__cards.map((el, i) => ({ el, top: i * 100, bottom: i * 100 + 100, mid: i * 100 + 50 })); sectionDrag.rectsDirty = false;');
    pe(w, 'pointermove', d, 120, 290);   // y=290 > mid(3-й)=250 → слот после третьей
    const order = [...d.querySelectorAll('.section-card')].map((c) => c.dataset.id).join(',');
    ok('DOM: слот ушёл в конец', order === '1,3,2', order);
    ok('модель не тронута до броска', w.eval('sections.map((s) => s.id).join(",")') === '1,2,3');
    console.log('=== 4. Бросок: модель, разворот, уборка ===');
    pe(w, 'pointerup', d, 120, 290);
    ok('модель переставлена в момент броска', w.eval('sections.map((s) => s.id).join(",")') === '1,3,2', w.eval('sections.map((s) => s.id).join(",")'));
    ok('посадка идёт (landing)', SD(w) && SD(w).landing === true);
    await sleep(1200);
    ok('жест завершён', SD(w) === null);
    const c2 = d.querySelector('.section-card[data-id="2"]');
    ok('инлайн-высота/ширина сняты', !!c2 && !c2.style.height && !c2.style.width && !c2.style.overflow);
    ok('классы слота сняты', !!c2 && !c2.classList.contains('is-drag-slot') && !c2.classList.contains('is-drag-expanding'));
    ok('ярлык спрятан', d.getElementById('sectionDragChip').style.display === 'none');
    ok('isDragging снят', ISD(w) === false);
    console.log('=== 5. Esc — возврат без правки модели ===');
    const before = w.eval('sections.map((s) => s.id).join(",")');
    const c3 = d.querySelector('.section-card[data-id="3"] .drag-handle');
    pe(w, 'pointerdown', c3, 100, 100);
    pe(w, 'pointermove', d, 130, 130);
    ok('второй жест активен', SD(w) && SD(w).active);
    const cards2 = [...d.querySelectorAll('.section-card')];
    w.__cards = cards2; w.eval('sectionDrag.rects = window.__cards.map((el, i) => ({ el, top: i * 100, bottom: i * 100 + 100, mid: i * 100 + 50 })); sectionDrag.rectsDirty = false;');
    pe(w, 'pointermove', d, 130, 10);   // выше середины первой → слот в начало
    ok('DOM переставлен', [...d.querySelectorAll('.section-card')][0].dataset.id === '3');
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(1200);
    ok('после Esc модель прежняя', w.eval('sections.map((s) => s.id).join(",")') === before);
    ok('после Esc DOM вернулся', [...d.querySelectorAll('.section-card')].map((c) => c.dataset.id).join(',') === before);
    console.log('=== 6. Клик по кнопке заголовка — не жест ===');
    const btn = d.querySelector('.section-card .section-settings-btn');
    pe(w, 'pointerdown', btn, 10, 10);
    ok('pointerdown по кнопке не создаёт состояние', SD(w) === null);
  }
  console.log('=== 7. Перф-контракт ===');
  ok('на pointermove нет render()/innerHTML', (() => {
    const m = html.match(/function onSectionDragMove\(e\) \{[\s\S]*?\n\}/);
    return m && !/render\(\)|innerHTML/.test(m[0]);
  })());
  ok('хит-тест по кэшу rect\'ов', /rectsDirty/.test(html) && /sectionDragRefreshRects/.test(html));
  console.log(bad ? `\nFAIL: ${bad}` : '\nALL OK');
  process.exit(bad ? 1 : 0);
})();
