// B-15 (2026-08-28): подсказка ритма над счётом при протяжке границы ячейки.
//
// Дословная постановка пользователя:
//   «это будет не включаемая опция, а подсказка для ресайза. По умолчанию
//    всё должно выглядеть как сейчас. Когда пользователь начинает ресайз,
//    кастомный ритм плавно „переплывает“ в место над счетом (каждый удар
//    или струна на своем месте как в режиме ленты). Если ячейка наследует
//    общий ритм секции, то ритм появляется над счетом через fade in. Когда
//    пользователь отпускает мышь, ритм соответственно исчезает через fade
//    out и уплывает на свое место.»
//
// Реализация: оверлей .rhythm-hints поверх .square-inner (дети в % от
// колонок грида — едут вместе с границами); контент — звучащий рисунок
// ячейки (rhythmSoundingForEvent), символика и позиции — как у .tl-hit.
// На отпускании оверлей пересаживается на body (render() пересобирает
// ячейки мгновенно, а «уплыть обратно» нужно доиграть поверх), гаснет и
// самоубирается по таймеру.
//
// Осознанные рамки (зафиксированы в сдаче волны):
//   - вне скоупа ручка квадрата (она пересобирает ячейки на каждом
//     движении — контент модели расходится с превью);
//   - во время воспроизведения подсказки нет (мини-превью живые).
const fs = require('fs');
const { JSDOM } = require('jsdom');
const file = process.argv[2] || __dirname + '/../../STRUCHORD.html';
const dom = new JSDOM(fs.readFileSync(file, 'utf8'), {
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

let bad = 0;
const ok = (name, cond, extra) => {
  console.log(`   ${cond ? 'ok  ' : 'FAIL'} ${name}${!cond && extra !== undefined ? ' — ' + extra : ''}`);
  if (!cond) bad++;
};
const evl = (code) => w.eval(`(()=>{ ${code} })()`);

// jsdom 20 вызывает по dispatch только addEventListener-подписки;
// onpointerdown на ручке назначается свойством — зовём напрямую тем же
// событием (прецедент — ui-test-zoom.js).
const firePointerDown = (el, x) => {
  const e = new w.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: x });
  if (typeof el.onpointerdown === 'function') el.onpointerdown(e);
  else el.dispatchEvent(e);
};
// Отпускание поймано через document.addEventListener('pointerup', …) —
// его dispatch слышит штатно.
const firePointerUp = (x) =>
  w.document.dispatchEvent(new w.MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: x || 0 }));
const firePointerMove = (x) =>
  w.document.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, cancelable: true, clientX: x }));

// Сцена: секция 4/4, квадрат с заданными ячейками, опционный бой секции.
const scene = (events, secPattern) => evl(`
  sections = [{ id: 1, name: 'A', key: 'C', timeSig: null, bpm: 0, squares: [
    { id: 2, timeSig: null, strumPattern: null, customBeats: null, events: [] }
  ]}];
  sections[0].squares[0].events = ${JSON.stringify(events)};
  if (songRhythmRolls) {
    for (const key of [...songRhythmRolls.refs.keys()]) {
      if (key.startsWith('1:2:')) songRhythmRolls.refs.delete(key);
    }
    songRhythmRolls.sectionRolls.delete(1);
  }
  sections[0].strumPattern = ${JSON.stringify(secPattern || null)};
  ensureSquareRhythmRefs(sections[0], sections[0].squares[0]);
  if (songRhythmRolls) setSectionRhythmRoll(sections[0], sections[0].strumPattern);
  render();
  return 0`);
const strum = (sub, s) => ({ mode: 'strum', subdivision: sub, steps: s.split('') });
const pick = (sub, steps) => ({ mode: 'pick', subdivision: sub, steps });
const D = (pattern, span) => ({ chord: 'C', span, timeSig: null, strumPattern: pattern || null });

const d = w.document;
const overlayIn = () => d.querySelector('.square-inner .rhythm-hints');
const ghostIn = () => d.querySelector('body > .rhythm-hints');
const handle = () => d.querySelector('.chord-wrapper[data-ei="0"] .resize-handle');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

w.addEventListener('load', async () => {
  // --- 1. Кастомная ячейка + наследующая соседка -------------------------
  scene(
    [D(strum(2, 'DUDU'), 2), D(null, 2)],
    strum(2, 'DUDUDUDU')
  );

  console.log('=== 1. Старт протяжки: подсказка появилась ===');
  ok('ручка ресайза между ячейками есть', !!handle());
  firePointerDown(handle(), 100);
  const ov = overlayIn();
  ok('оверлей .rhythm-hints создан в .square-inner', !!ov);
  ok('квадрат помечен is-hinting', !!d.querySelector('.square.is-hinting'));
  const hints = ov ? ov.querySelectorAll('.rhythm-hint') : [];
  ok('полосы на обе ячейки квадрата', hints.length === 2, hints.length);

  const cell0Hits = hints[0] ? [...hints[0].querySelectorAll('.rhythm-hint-hit')] : [];
  ok('у кастомной ячейки 4 удара (DUDU)', cell0Hits.length === 4, cell0Hits.length);
  ok('первый шаг — на левой кромке (is-edge)', !!(cell0Hits[0] && cell0Hits[0].classList.contains('is-edge')));
  ok('позиции — начала шагов (0/25/50/75%)',
    cell0Hits.every((el, j) => Math.abs(parseFloat(el.style.left) - j * 25) < 1e-6),
    cell0Hits.map((el) => el.style.left).join(','));
  ok('символика как в ленте: ↓ и ↑', cell0Hits.some((el) => el.textContent === '↓')
    && cell0Hits.some((el) => el.textContent === '↑'));
  const stableHitNode = evl(`
    const before = document.querySelector('.rhythm-hint .rhythm-hint-hit');
    refreshRhythmHints(sections[0], sections[0].squares[0],
      distributeVisualSpans(sections[0].squares[0].events, '4/4'));
    return before === document.querySelector('.rhythm-hint .rhythm-hint-hit')`);
  ok('refresh без смены рисунка не пересоздаёт hit-узлы (меньше дёрганья)', stableHitNode);
  console.log('=== 2. Наследующая ячейка: свой срез боя секции ===');
  const cell1Hits = hints[1] ? [...hints[1].querySelectorAll('.rhythm-hint-hit')] : [];
  ok('у наследующей ячейки 4 удара (вторая половина DUDUDUDU)', cell1Hits.length === 4, cell1Hits.length);
  ok('кастомная полоса приплывает сразу',
    !!(hints[0] && hints[0].classList.contains('is-in')));
  ok('наследуемая полоса ждёт конца приплывания кастома',
    !!(hints[1] && !hints[1].classList.contains('is-in')));
  await sleep(280);
  ok('наследуемая полоса появляется fade-in после приплывания кастома',
    !!(hints[1] && hints[1].classList.contains('is-in')));
  const inheritedKeepsFadeAfterRefresh = evl(`
    sections[0].squares[0].events[1].strumPattern = { mode: 'strum', subdivision: 2, steps: ['D','U'] };
    refreshRhythmHints(sections[0], sections[0].squares[0],
      distributeVisualSpans(sections[0].squares[0].events, '4/4'));
    return rhythmHintSession && rhythmHintSession.entries[1].custom === false`);
  ok('ячейка, стартовавшая наследуемой, остаётся fade-only даже после временного reslice в custom',
    inheritedKeepsFadeAfterRefresh);
  console.log('=== 3. Отпускание: оверлей уезжает на body и тает ===');
  evl(`
    window.__b15OldRequestRender = requestRender;
    window.__b15RequestRenderCount = 0;
    window.__b25IncrementalSquareSyncCount = 0;
    requestRender = function () {
      window.__b15RequestRenderCount++;
      return window.__b15OldRequestRender.apply(this, arguments);
    };
    return 0`);
  firePointerUp();
  ok('оверлея в квадрате больше нет', !overlayIn());
  ok('ghost пересажен на body (переживает свежий render)', !!ghostIn());
  ok('is-hinting снят', !d.querySelector('.square.is-hinting'));
  ok('на старте уплывания мини-превью ещё скрыто body-классом',
    d.body.classList.contains('is-rhythm-hint-returning'));
  const demotedGhost = ghostIn();
  const demotedHits0 = demotedGhost
    ? [...demotedGhost.querySelectorAll('.rhythm-hint')[0].querySelectorAll('.rhythm-hint-hit')]
    : [];
  const becameCustomHits1 = demotedGhost
    ? [...demotedGhost.querySelectorAll('.rhythm-hint')[1].querySelectorAll('.rhythm-hint-hit')]
    : [];
  // 0.168: переплывание обязано работать всегда, когда кастом рисуется
  // в превью. Здесь ничего не снято (отпускание без сдвига) — кастом
  // уплывает ПОУДАРНО в перестроенное по финальной модели превью.
  ok('кастом без снятия уплывает поударно в своё превью (не fallback-полосой)',
    !!(demotedHits0.length && demotedHits0.every((h) => h.style.transform.includes('translate(')
      && h.dataset.rhythmTargetTransform)),
    demotedHits0.map((h) => h.style.transform || 'none').join(' | '));
  ok('ячейка, ставшая кастомной во время жеста, уплывает в перестроенное превью',
    !!(becameCustomHits1.length && becameCustomHits1.every((h) => h.style.transform.includes('translate(')
      && h.dataset.rhythmTargetTransform)),
    becameCustomHits1.map((h) => h.style.transform || 'none').join(' | '));
  await sleep(100); // середина обратной анимации: полного render нет
  ok('финальный requestRender не вызывается: resize закрывается инкрементальной синхронизацией',
    evl('return window.__b15RequestRenderCount') === 0,
    evl('return window.__b15RequestRenderCount'));
  ok('ghost живёт до инкрементальной синхронизации', !!ghostIn() && !overlayIn());
  await sleep(600); // добиваем staged fade→flight→incremental sync (~570мс от pointerup)
  ok('ghost самоубрался по таймеру', !ghostIn());
  ok('B-31: клик без фактического сдвига не запускает лишнюю синхронизацию',
    evl('return window.__b25IncrementalSquareSyncCount') === 0,
    evl('return window.__b25IncrementalSquareSyncCount'));
  ok('полный requestRender так и не понадобился',
    evl('return window.__b15RequestRenderCount') === 0,
    evl('return window.__b15RequestRenderCount'));
  ok('B-31: клик без фактического сдвига не меняет модель и не демотирует ритм',
    !!d.querySelector('.chord-wrapper[data-ei="0"] .chord-btn-strum--own')
      && !!d.querySelector('.chord-wrapper[data-ei="0"] .event-strum-preview.has-pattern'),
    evl(`
      const btn = document.querySelector('.chord-wrapper[data-ei="0"] .chord-btn-strum');
      const prev = document.querySelector('.chord-wrapper[data-ei="0"] .event-strum-preview');
      return JSON.stringify({ btn: btn && btn.className, prev: prev && prev.className,
        prevHtml: prev && prev.innerHTML.length,
        ev0: sections[0].squares[0].events[0],
        refs: [...songRhythmRolls.refs.keys()] })`));
  evl('requestRender = window.__b15OldRequestRender; delete window.__b15OldRequestRender; delete window.__b15RequestRenderCount; delete window.__b25IncrementalSquareSyncCount; return 0');
  ok('после уплывания body-класс скрытия превью снят',
    !d.body.classList.contains('is-rhythm-hint-returning'));

  console.log('=== 3b. Быстрое отпускание: невидимое наследование не задерживает кастом ===');
  scene(
    [D(strum(2, 'DUDX'), 2), D(null, 2)],
    strum(2, 'DUDUDUDU')
  );
  firePointerDown(handle(), 100);
  const fastHints = overlayIn() ? [...overlayIn().querySelectorAll('.rhythm-hint')] : [];
  ok('перед быстрым отпусканием наследуемая полоса ещё не проявлена',
    !!(fastHints[1] && !fastHints[1].classList.contains('is-in')));
  firePointerUp();
  const fastGhost = ghostIn();
  const fastHits = fastGhost ? [...fastGhost.querySelectorAll('.rhythm-hint')[0].querySelectorAll('.rhythm-hint-hit')] : [];
  ok('если fade-out наследуемого не начался, кастом улетает сразу без лишней паузы',
    !!(fastHits.length && fastHits.every((h) => h.style.transform.includes('translate('))),
    fastHits.map((h) => h.style.transform || 'none').join(' | '));
  await sleep(460);

  console.log('=== 3c. Устаревшее превью в ячейке без финального кастома не возвращается ===');
  scene([D(strum(2, 'DUDX'), 2), D(null, 2)], strum(2, 'DUDUDUDU'));
  firePointerDown(handle(), 100);
  evl(`
    const stale = document.querySelector('.chord-wrapper[data-ei="1"] .event-strum-preview');
    stale.classList.add('has-pattern');
    stale.appendChild(document.createElement('span'));
    return 0`);
  firePointerUp();
  // 0.168: на отпускании превью перестраиваются по ФИНАЛЬНОЙ модели —
  // устаревшее содержимое не «прячется до render», а стирается на месте.
  const staleBox3c = d.querySelector('.chord-wrapper[data-ei="1"] .event-strum-preview');
  ok('stale mini-preview ячейки без финального кастома стёрт перестройкой',
    !!(staleBox3c && !staleBox3c.firstChild && !staleBox3c.classList.contains('has-pattern')),
    staleBox3c ? (staleBox3c.children.length + '/' + staleBox3c.className) : 'no box');
  await sleep(460);

  console.log('=== 3d. Снятый ритм не телепортируется в фасад перед fade-out ===');
  scene(
    [D({ mode: 'strum', subdivision: 2, steps: ['D', '_', 'D', '_'] }, 2), D(null, 2)],
    { mode: 'strum', subdivision: 4, steps: ['D','_','_','_','D','_','_','_','D','_','_','_','D','_','_','_'] }
  );
  evl(`
    const bi = document.querySelector('.square-inner');
    bi.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 76, right: 400, bottom: 76, x: 0, y: 0 });
    return 0`);
  firePointerDown(handle(), 100);
  firePointerMove(200);
  const compactCountBefore = overlayIn().querySelectorAll('.rhythm-hint')[0].querySelectorAll('.rhythm-hint-hit').length;
  ok('до отпускания снятый кандидат ещё в своей компактной плотности (4 шага)',
    compactCountBefore === 4, compactCountBefore);
  // Создаём pending-refresh как от pointermove. Старый баг проявлялся тем,
  // что этот refresh выполнялся уже ПОСЛЕ settle и перестраивал 4 шага
  // кастома в 8 шагов наследуемого фасада — визуальный телепорт перед fade.
  evl(`
    scheduleRhythmHintsRefresh(sections[0], sections[0].squares[0],
      distributeVisualSpans(sections[0].squares[0].events, '4/4'));
    window.__b15OldSettle = settleSquareRhythmWithFacade;
    settleSquareRhythmWithFacade = function (sec, sq, opts) {
      if (opts && Array.isArray(opts.droppedOut)) opts.droppedOut.push(0);
      return 1;
    };
    return 0`);
  firePointerUp(200);
  evl(`settleSquareRhythmWithFacade = window.__b15OldSettle; delete window.__b15OldSettle; return 0`);
  const demoteGhost = ghostIn();
  const demoteHits = demoteGhost
    ? [...demoteGhost.querySelectorAll('.rhythm-hint')[0].querySelectorAll('.rhythm-hint-hit')]
    : [];
  ok('после снятия ghost не телепортируется в 8-шаговый фасад',
    demoteHits.length > 0 && demoteHits.length < 8, demoteHits.length);
  ok('снятый ритм исчезает fade-out и не получает target flight',
    demoteHits.every((h) => !h.dataset.rhythmTargetTransform && !h.style.transform.includes('translate(')),
    demoteHits.map((h) => h.dataset.rhythmTargetTransform || h.style.transform || 'none').join(' | '));
  await sleep(460);

  console.log('=== 3f. Полосы ритма не двигаются во время протяжки ===');
  scene([D(strum(2, 'DUDU'), 2), D(null, 2)], strum(2, 'DUDUDUDU'));
  firePointerDown(handle(), 100);
  await sleep(30);
  const frozenOv = overlayIn();
  const frozenBars = frozenOv ? [...frozenOv.querySelectorAll('.rhythm-hint')] : [];
  const frozenBefore = frozenBars.map((b) => b.style.left + ' ' + b.style.width);
  const gridBefore = evl(`return document.querySelector('.square-inner').style.gridTemplateColumns`);
  firePointerMove(200);
  await sleep(60); // кадр applyResizePreviewAt успевает отработать
  const frozenAfter = frozenBars.map((b) => b.style.left + ' ' + b.style.width);
  const gridAfter = evl(`return document.querySelector('.square-inner').style.gridTemplateColumns`);
  ok('живая сетка ячеек изменилась во время протяжки', gridBefore !== gridAfter,
    gridBefore + ' -> ' + gridAfter);
  ok('полосы ритма стоят на стартовых позициях (не растягиваются)',
    frozenBefore.length === 2 && frozenBefore.every((v, i) => v === frozenAfter[i]),
    frozenBefore.join(' | ') + ' -> ' + frozenAfter.join(' | '));
  firePointerUp(200);
  await sleep(460);

  console.log('=== 3e. Новая кастомная ячейка после ресайза тоже уплывает ===');
  scene([D(strum(2, 'DUDU'), 2), D(null, 2)], strum(2, 'DUDUDUDU'));
  firePointerDown(handle(), 100);
  await sleep(280);
  evl(`
    const sec = sections[0];
    const sq = sec.squares[0];
    sq.events[1].strumPattern = { mode: 'strum', subdivision: 2, steps: ['D','U','X','D'] };
    restoreEventStrumPreview('1:2:1');
    refreshRhythmHints(sec, sq, distributeVisualSpans(sq.events, '4/4'));
    return 0`);
  firePointerUp();
  await sleep(220);
  const newCustomGhost = ghostIn();
  const newCustomHits = newCustomGhost
    ? [...newCustomGhost.querySelectorAll('.rhythm-hint')[1].querySelectorAll('.rhythm-hint-hit')]
    : [];
  ok('ячейка, ставшая кастомной во время ресайза, получает обратный flight',
    !!(newCustomHits.length && newCustomHits.every((h) => h.style.transform.includes('translate('))),
    newCustomHits.map((h) => h.style.transform || 'none').join(' | '));
  ok('новый кастом улетает в свои глифы preview, а не fade-only',
    newCustomHits.map((h) => h.dataset.rhythmSourceIndex).join(',') === '0,1,2,3',
    newCustomHits.map((h) => h.dataset.rhythmSourceIndex).join(','));
  await sleep(460);

  // --- 4. Перебор: столбики цифр струн -----------------------------------
  console.log('=== 4. Перебор: столбики цифр ===');
  scene(
    [D(pick(2, [5, [4, 3, 2], 1, null]), 2), D(null, 2)],
    null
  );
  // ячейка 1 без своего рисунка и без боя секции — подсказки у неё нет
  firePointerDown(handle(), 100);
  const ov2 = overlayIn();
  const pickBox = ov2 && ov2.querySelectorAll('.rhythm-hint')[0];
  const nums = pickBox ? pickBox.querySelectorAll('.rhythm-hint-hit.pick .strum-pick-num') : [];
  ok('перебор рисует цифры струн', nums.length > 0);
  ok('щипок из трёх струн поджат (is-stack3)', !!(pickBox && pickBox.querySelector('.rhythm-hint-hit.pick.is-stack3')));
  const hint1 = ov2 && ov2.querySelectorAll('.rhythm-hint')[1];
  ok('пустой соседке подсказка пустая', hint1 && hint1.querySelectorAll('.rhythm-hint-hit').length === 0);
  firePointerUp();
  await sleep(350);

  // --- 5. Нет рисунка вообще — нет и подсказки ----------------------------
  console.log('=== 5. Тишина: подсказки нет ===');
  scene([D(null, 2), D(null, 2)], null);
  firePointerDown(handle(), 100);
  ok('оверлей не создаётся (подсказывать нечего)', !overlayIn());
  ok('is-hinting не ставился', !d.querySelector('.square.is-hinting'));
  firePointerUp();
  await sleep(50);
  ok('отпускание без подсказки прошло чисто', !ghostIn());

  // --- 6. Геометрия выхода: ghost повторяет квадрат в fixed --------------
  // (в jsdom нет раскладки — подменяем rect квадрата и проверяем перенос
  //  координат один-в-один; в браузере этот же код читает настоящий rect)
  console.log('=== 6. Геометрия выхода: fixed-ghost повторяет квадрат ===');
  scene([D(strum(2, 'DUDX'), 2), D(null, 2)], strum(2, 'DUDUDUDU'));
  firePointerDown(handle(), 100);
  await sleep(280); // наследуемая полоса уже проявлена, значит выход должен начаться с fade-out
  const biEl = d.querySelector('.square-inner');
  biEl.getBoundingClientRect = () =>
    ({ left: 10, top: 50, width: 400, height: 76, right: 410, bottom: 126, x: 10, y: 50 });
  const vpEl = d.querySelector('.squares-viewport');
  vpEl.getBoundingClientRect = () =>
    ({ left: 50, top: 40, width: 300, height: 100, right: 350, bottom: 140, x: 50, y: 40 });
  firePointerUp();
  const g = ghostIn();
  ok('ghost стал fixed', g && g.style.position === 'fixed');
  ok('координаты ghost = rect квадрата',
    g && g.style.left === '10px' && g.style.top === '50px'
      && g.style.width === '400px' && g.style.height === '76px',
    g && [g.style.left, g.style.top, g.style.width, g.style.height].join(' '));
  ok('в зуме ghost сохраняет clip viewport: скрытые части квадрата не вылезают наружу',
    g && g.style.clipPath === 'inset(0px 60px 0px 40px)',
    g && g.style.clipPath);
  const returnPreview = d.querySelector('.chord-wrapper[data-ei="0"] .event-strum-preview');
  ok('mini-preview цели скрыт до конца обратного полёта (финал не виден заранее)',
    !!(returnPreview && returnPreview.classList.contains('is-rhythm-return-target')),
    returnPreview && returnPreview.className);
  const gHints = g ? [...g.querySelectorAll('.rhythm-hint')] : [];
  let gHits0 = gHints[0] ? [...gHints[0].querySelectorAll('.rhythm-hint-hit')] : [];
  ok('кастом ждёт окончания fade-out наследуемых перед уплыванием',
    !!(gHits0.length && gHits0.every((h) => !h.style.transform.includes('translate('))),
    gHits0.map((h) => h.style.transform || 'none').join(' | '));
  ok('полоса кастомной не уезжала целиком (поударный путь, не fallback)',
    !!(gHints[0] && !gHints[0].style.transform.includes('translateY')),
    gHints[0] && gHints[0].style.transform);
  ok('кастом на выходе не гаснет fade-out: остаётся is-in до прилёта',
    !!(gHints[0] && gHints[0].classList.contains('is-in')),
    gHints[0] && gHints[0].className);
  ok('наследуемая полоса на выходе уходит первой через fade-out',
    !!(gHints[1] && !gHints[1].classList.contains('is-in')),
    gHints[1] && gHints[1].className);
  await sleep(200);
  gHits0 = gHints[0] ? [...gHints[0].querySelectorAll('.rhythm-hint-hit')] : [];
  ok('после fade-out наследуемых кастомные УДАРЫ уплывают поодиночке',
    !!(gHits0.length && gHits0.every((h) => h.style.transform.includes('translate('))),
    gHits0.map((h) => h.style.transform).join(' | '));
  ok('обратная лесенка такая же, как входная (0,10,20,30мс для 4 ударов)',
    gHits0.map((h) => h.style.transitionDelay).join(',') === '0ms,10ms,20ms,30ms',
    gHits0.map((h) => h.style.transitionDelay).join(','));
  ok('каждый удар знает, в какой глиф превью он возвращается (j % sourceCount)',
    gHits0.map((h) => h.dataset.rhythmSourceIndex).join(',') === '0,1,2,3',
    gHits0.map((h) => h.dataset.rhythmSourceIndex).join(','));
  const gHits1 = gHints[1] ? [...gHints[1].querySelectorAll('.rhythm-hint-hit')] : [];
  ok('наследуемая полоса только тает (ни ударных, ни полосового сдвига)',
    !!(gHints[1] && gHits1.length && gHits1.every((h) => !h.style.transform.includes('translate('))
      && !gHints[1].style.transform.includes('translateY')),
    gHints[1] && gHints[1].style.transform);
  await sleep(480);
  ok('после обратного полёта mini-preview цели снова разрешён',
    !returnPreview.classList.contains('is-rhythm-return-target'),
    returnPreview.className);

  // --- 7. Входной FLIP: сдвиг «от глифа превью до узла сетки» -----------
  console.log('=== 7. Входной FLIP: формула поударных сдвигов ===');
  scene([D(strum(2, 'DUDU'), 2), D(null, 2)], strum(2, 'DUDUDUDU'));
  const deltas = JSON.parse(evl(`
    const bi = document.querySelector('.square-inner');
    const wrap = bi.querySelector('.chord-wrapper[data-ei="0"]');
    wrap.getBoundingClientRect = () => ({ top: 101, bottom: 173, height: 72, left: 0, width: 200 });
    const stepRects = [
      { left: 6, width: 8, top: 105, height: 12 },
      { left: 16, width: 8, top: 105, height: 12 },
      { left: 26, width: 8, top: 105, height: 12 },
      { left: 36, width: 8, top: 105, height: 12 }];
    bi.querySelectorAll('.chord-wrapper[data-ei="0"] .strum-preview .strum-step')
      .forEach((el, i) => { el.getBoundingClientRect = () => stepRects[i]; });
    const sq = sections[0].squares[0];
    const dist = distributeVisualSpans(sq.events, '4/4');
    const biRect = { left: 0, top: 100, width: 400, height: 76 };
    return JSON.stringify(rhythmHintEnterDeltas(bi, 0,
      { mode: 'strum', subdivision: 2, steps: ['D','U','D','U'] }, dist, 0, biRect))`));
  // Геометрия: ширина полосы (2/4)·400=200, якоря 0/50/100/150; базовая
  // линия 173−100−27=46 от верха bi.
  // ВАЖНО (принцип сопоставления): превью показывает МИНИМАЛЬНЫЙ повтор
  // «DU» (2 глифа + «×2»), то есть степов там двое — удары 2 и 3 полосы
  // берут источником те же глифы (j % 2): dx = 10,−30,−90,−130,
  // а не «по индексу». Это и есть «рассыпание» повторов из одной буквы.
  ok('dx — от центра глифа превью до узла сетки, источник j % unitLen (10,−30,−90,−130)',
    deltas && deltas.map((x) => x.dx).join(',') === '10,-30,-90,-130',
    deltas && deltas.map((x) => x.dx).join(','));
  ok('dy — до базовой линии вниз (центр превью 111−100=11 → базовая 46: −35)',
    deltas && deltas.every((x) => Math.abs(x.dy - (-35)) < 1e-9),
    deltas && deltas.map((x) => x.dy).join(','));
  ok('лесенка задержек 10мс/удар (потолок 60мс)',
    deltas && deltas.map((x) => x.delay).join(',') === '0,10,20,30',
    deltas && deltas.map((x) => x.delay).join(','));
  const dyStrip = evl(`
    return rhythmHintStripDy(document.querySelector('.square-inner .chord-wrapper[data-ei="0"]'))`);
  ok('fallback-полёт полосой при нулевых rect — −30px', dyStrip === -30, dyStrip);

  console.log('=== 8. Выходной FLIP: улетает именно в нужные глифы превью ===');
  const exactExit = JSON.parse(evl(`
    const bi = document.querySelector('.square-inner');
    const stepRects = [
      { left: 6, width: 8, top: 105, height: 12 },
      { left: 16, width: 8, top: 105, height: 12 }];
    bi.querySelectorAll('.chord-wrapper[data-ei="0"] .event-strum-preview .strum-step')
      .forEach((el, i) => { el.getBoundingClientRect = () => stepRects[i]; });
    const hint = document.createElement('div');
    hint.className = 'rhythm-hint';
    [100, 150, 200, 250].forEach((left) => {
      const h = document.createElement('div');
      h.className = 'rhythm-hint-hit';
      h.getBoundingClientRect = () => ({ left, width: 10, top: 150, height: 10 });
      hint.appendChild(h);
    });
    return JSON.stringify(rhythmHintExitDeltas({ custom: true, exitCustom: true, el: hint }, 0, bi))`));
  ok('выход использует тот же источник j % unitLen: 0,1,0,1',
    exactExit && exactExit.map((x) => x.sourceIndex).join(',') === '0,1,0,1',
    exactExit && exactExit.map((x) => x.sourceIndex).join(','));
  ok('dx выхода — от каждого текущего удара к своему глифу превью',
    exactExit && exactExit.map((x) => x.dx).join(',') === '-95,-135,-195,-235',
    exactExit && exactExit.map((x) => x.dx).join(','));
  ok('dy выхода — вверх к компактному превью',
    exactExit && exactExit.every((x) => x.dy === -44),
    exactExit && exactExit.map((x) => x.dy).join(','));
  const removedExit = evl(`
    const hint = document.createElement('div');
    const h = document.createElement('div');
    h.className = 'rhythm-hint-hit';
    hint.appendChild(h);
    return rhythmHintExitDeltas({ custom: true, exitCustom: false, el: hint }, 0,
      document.querySelector('.square-inner')) === null`);
  ok('ритм, снятый к финалу, не получает обратный flight', removedExit);

  // --- 9. CSS-контракт: transition'ы и геометрия на месте ----------------
  console.log('=== 9. CSS-контракт анимаций ===');
  const cssText = fs.readFileSync(file, 'utf8');
  ok('.rhythm-hint: transition по opacity И transform',
    /\.rhythm-hint\s*\{[^}]*transition:\s*opacity[^}]*transform/.test(cssText));
  ok('.rhythm-hint-hit: базовая линия над счётом (bottom: 20px)',
    /\.rhythm-hint-hit\s*\{[^}]*bottom:\s*20px/.test(cssText));
  ok('.rhythm-hints: pointer-events none (клики достаются ячейкам)',
    /\.rhythm-hints\s*\{[^}]*pointer-events:\s*none/.test(cssText));
  ok('.event-strum-preview: плавное гашение за время подсказки',
    /\.event-strum-preview\s*\{[^}]*transition:\s*opacity/.test(cssText));
  ok('мягкая кривая cubic-bezier (не линейная)',
    /cubic-bezier\(0\.2,\s*0\.7,\s*0\.2,\s*1\)/.test(cssText));
  ok('уборка ghost учитывает последовательность fade → flight → handoff',
    /const RHYTHM_HINT_FADE_MS\s*=\s*180/.test(cssText)
      && /const RHYTHM_HINT_MOVE_MS\s*=\s*220/.test(cssText)
      && /const RHYTHM_HINT_EXIT_PAD_MS\s*=\s*40/.test(cssText)
      && /const flyEndMs\s*=/.test(cssText)
      && /setTimeout\(\(\) => \{[\s\S]*is-rhythm-return-target[\s\S]*entry\.el\.classList\.remove\('is-in'\)[\s\S]*\}, flyEndMs\)/.test(cssText)
      && /setTimeout\(\(\) => \{[\s\S]*ghost\.remove\(\);[\s\S]*is-rhythm-hint-returning[\s\S]*\}, exitMs\)/.test(cssText));
  ok('обратная фаза скрывает mini-preview цели до handoff',
    /\.square\.is-rhythm-hint-returning \.event-strum-preview\.is-rhythm-return-target,\s*\n\.square\.is-rhythm-hint-returning \.event-strum-preview\.is-rhythm-removing\s*\{[^}]*opacity:\s*0/.test(cssText));
  ok('мини-превью снятого ритма не проявляется обратно перед render',
    /\.event-strum-preview\.is-rhythm-removing/.test(cssText));
  ok('.rhythm-hint-hit: плывут сами удары (transition transform)',
    /\.rhythm-hint-hit\s*\{[^}]*transition:\s*transform/.test(cssText));
  ok('реальный браузер запускает обратный полёт через Web Animations API (без случайного CSS-jump)',
    /function runRhythmHintHitFlight/.test(cssText)
      && /hitEl\.animate\(/.test(cssText)
      && /duration:\s*RHYTHM_HINT_MOVE_MS/.test(cssText));

  // --- 10. Вычисленные стили (jsdom умеет getComputedStyle по stylesheet) --
  console.log('=== 10. Вычисленные стили анимаций ===');
  scene([D(strum(2, 'DUDU'), 2), D(null, 2)], strum(2, 'DUDUDUDU'));
  firePointerDown(handle(), 100);
  const liveHint = d.querySelector('.square-inner .rhythm-hint');
  const cs = liveHint && w.getComputedStyle(liveHint);
  // jsdom заполняет shorthand «transition», а лонгхенды оставляет пустыми
  // (ограничение CSSOM) — поэтому читаем шортхэнд целиком.
  const tr = cs ? cs.transition : '';
  ok('transition задан и покрывает opacity',
    !!tr && tr.includes('opacity'), tr);
  ok('transition покрывает transform (переплытие)',
    !!tr && tr.includes('transform'), tr);
  ok('длительности на месте: 0.18s (opacity) и 0.22s (transform)',
    !!tr && tr.includes('0.18s') && tr.includes('0.22s'), tr);
  ok('кривая — cubic-bezier, не линейная',
    !!tr && tr.includes('cubic-bezier'), tr);
  ok('в показанном состоянии opacity = 1 (is-in применился)',
    !!cs && cs.opacity === '1', cs && cs.opacity);
  const prevStyle = liveHint && w.getComputedStyle(
    d.querySelector('.chord-wrapper[data-ei="0"] .event-strum-preview'));
  ok('мини-превью кастома погашено на время протяжки (opacity 0)',
    !!prevStyle && prevStyle.opacity === '0', prevStyle && prevStyle.opacity);
  firePointerUp();
  await sleep(350);

  console.log(bad ? `\nFAIL: ${bad}` : '\nвсе проверки ok');
  process.exit(bad ? 1 : 0);
});
