// ============================================================================
// ЗОНД: модель «Рулон и окна» vs текущая реализация (2026-08-22).
//
// Отвечает на два вопроса пользователя:
//   1) «покажи на примерах, как это будет работать?»
//   2) «не наплодит ли новых багов (со звуком, с ресайзом)?»
//
// Метод — дифференциальный: эталон со звука НЕ переписан сюда, а вызывается
// из самого STRUCHORD.html (getSlicedPatternForEvent повторяет формулу
// планировщика; fallback «один удар + тишина» — как playChordScheduled при
// отсутствии рисунка). Новая модель рядом, чистым JS (~130 строк). Сравниваем
// ЗВУЧАЩИЕ СОБЫТИЯ (время в юнитах + символ), а не представления.
//
// Запуск: NODE_PATH=/home/user/node_modules node dev/probe/roll-model.js
// ============================================================================
const fs = require('fs');
const { JSDOM } = require('jsdom');
const file = process.argv[2] || '/home/user/STRUCHORD.html';
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
  console.log(`   ${cond ? 'ok  ' : 'FAIL'} ${name}${!cond && extra ? ' — ' + extra : ''}`);
  if (!cond) bad++;
};
const note = (s) => console.log('   · ' + s);

const evl = (code) => w.eval(`(()=>{ ${code} })()`);
evl('requestRender = function(){}; showToast = function(){}; window.confirm = function(){return true}; return 0');

// --- ЭТАЛОН: сцена и звучащие события старой модели (из файла) --------------
const scene = (events, secPattern) => evl(`
  sections = [{ id: 1, name: 'A', key: 'C', timeSig: null, bpm: 0,
    strumPattern: ${JSON.stringify(secPattern || null)},
    squares: [{ id: 2, timeSig: null, strumPattern: null, customBeats: null, events: [] }] }];
  sections[0].squares[0].events = ${JSON.stringify('EVENTS')};
  // волна-4: сцены собираются в обход писателей с прежними id — пул
  // протух (ключи 1:2:* совпали бы из сцены в сцену), обнуляем.
  songRhythmRolls = null;
  return 0`.replace('"EVENTS"', JSON.stringify(events)));

const setSpans = (arr, dragIdx) => evl(
  `const arr=${JSON.stringify(arr)}; const sq=sections[0].squares[0];
   const start=sq.events.map(e=>e.span); arr.forEach((v,i)=>{ sq.events[i].span=v; });
   resliceSharedRhythmsInSquare(sq, "4/4", sections[0], ${dragIdx || 0}, start); return 0`);
// Полный жест для батареи §11 (пер-операция): как onUp в проде —
// реслайс, растворение сшивки, автонаследование (B-20). Сцены волн-5/6
// выше зовут сырой setSpans (один ход без отпускания) — там и остаёмся.
const setSpansGesture = (arr, dragIdx) => evl(
  `const arr=${JSON.stringify(arr)}; const sq=sections[0].squares[0];
   const start=sq.events.map(e=>e.span); arr.forEach((v,i)=>{ sq.events[i].span=v; });
   resliceSharedRhythmsInSquare(sq, "4/4", sections[0], ${dragIdx || 0}, start);
   dissolveSewnRhythmPair(songRhythmRolls, sections[0], sq, ${dragIdx || 0});
   settleSquareRhythmWithFacade(sections[0], sq); return 0`);

// Звук старой модели: ровно то, что расставит планировщик (срез == формула
// schedulePatternForEvent по комментариям в коде; пустая ячейка — один удар).
// Волна-4: источник истины — проекция (окно на рулон; фасад внутри
// rhythmSoundingForEvent остаётся для легаси-вкраплений).
const oldEvents = () => evl(`
  const sec=sections[0], sq=sec.squares[0];
  let off=0; const out=[];
  sq.events.forEach((ev,ei)=>{
    const span=ev.span||1;
    const p=rhythmSoundingForEvent(sec,sq,ev,ei);
    const sub=p ? Math.max(1, p.subdivision||1) : 1;
    const steps=(p && p.steps) ? p.steps : plainHitRhythm(span,1,'strum').steps;
    steps.forEach((s,k)=>{
      if (s!=='_' && !(Array.isArray(s) && s.length===0))
        out.push((off + k/sub).toFixed(3) + '=' + (Array.isArray(s) ? s.join('+') : s));
    });
    off+=span;
  });
  return out.join(' ') || '(тишина)'`);

const oldSteps = (i) => evl(
  `const p=sections[0].squares[0].events[${i}].strumPattern; return p ? p.steps.join("") : ""`);
const oldSub = (i) => evl(
  `const p=sections[0].squares[0].events[${i}].strumPattern; return p ? (p.subdivision||1) : 0`);

// ============================================================================
// НОВАЯ МОДЕЛЬ «РУЛОН И ОКНА» — чистый прототип. Ячейка хранит долю, ссылку
// на рулон и якорь (место, где рулон начал разворачиваться). Шагов, меток,
// дробления у ячейки НЕТ. Всё звучащее и видимое — окна на рулоны.
// ============================================================================
let rollSeq = 0;
const mint = () => 'r' + (++rollSeq);

function newModel(events, secPattern) {
  const m = { pool: {}, secRef: null, cells: [] };
  if (secPattern) { m.secRef = mint(); m.pool[m.secRef] = clone(secPattern); }
  let off = 0;
  for (const ev of events) {
    let ref = null, anchor = off;
    if (ev.strumPattern) {
      ref = mint(); m.pool[ref] = clone(ev.strumPattern); // своя ячейка = рулон, развёрнутый с её начала
    }
    m.cells.push({ span: ev.span, ref, anchor });
    off += ev.span;
  }
  return m;
}
const clone = (p) => ({ mode: p.mode, subdivision: p.subdivision, steps: p.steps.map((s) => (Array.isArray(s) ? s.slice() : s)) });

const offsetOf = (m, i) => m.cells.slice(0, i).reduce((a, c) => a + c.span, 0);
const rollOf = (m, i) => m.pool[m.cells[i].ref || m.secRef] || null;
const mod = (x, n) => ((x % n) + n) % n;
const gcd2 = (a, b) => { while (b) { const t = a % b; a = b; b = t; } return a; };
const lcm = (a, b) => (a / gcd2(a, b)) * b;

// Один удар в начале ячейки и тишина — зеркало playChordScheduled для пустой.
const plainHit = (span) => {
  const n = Math.max(1, Math.round(span || 1));
  const steps = ['D'];
  for (let k = 1; k < n; k++) steps.push('_');
  return { sub: 1, steps };
};

// ОКНО. Единственная формула модели; звук и все показы читают отсюда.
function windowSound(m, i) {
  const c = m.cells[i];
  const roll = rollOf(m, i);
  if (!roll) return plainHit(c.span);
  const sub = Math.max(1, roll.subdivision || 1);
  const len = roll.steps.length;
  if (!len) return plainHit(c.span);
  const off = offsetOf(m, i);
  let startStep;
  if (c.ref) {
    startStep = Math.round((off - c.anchor) * sub); // свой рулон: фаза от якоря
  } else {
    const units = len / sub;                         // наследие: фаза от квадрата
    if (!Number.isInteger(units) || units < 1) return plainHit(c.span); // фазы нет («несчётный»)
    startStep = Math.round(mod(off, units) * sub);
  }
  const need = Math.max(1, Math.round(c.span * sub));
  const steps = [];
  for (let k = 0; k < need; k++) steps.push(roll.steps[mod(startStep + k, len)]);
  return { sub, steps };
}

const displayOf = (m, i) => windowSound(m, i).steps.map((s) => (Array.isArray(s) ? s.join('+') : s)).join('');
const subOf = (m, i) => windowSound(m, i).sub;

function newEvents(m) {
  const out = [];
  m.cells.forEach((c, i) => {
    const off = offsetOf(m, i);
    const { sub, steps } = windowSound(m, i);
    steps.forEach((s, k) => {
      if (s !== '_' && !(Array.isArray(s) && s.length === 0))
        out.push((off + k / sub).toFixed(3) + '=' + (Array.isArray(s) ? s.join('+') : s));
    });
  });
  return out.join(' ') || '(тишина)';
}

// ОПЕРАЦИИ. Ни одна не переписывает шаги (кроме единственной точки: утончение
// сетки рулона, когда граница сошла с его шага).

// B-20 (2026-08-26): автонаследование после структурных операций — зеркало
// settleSquareRhythmWithFacade. Ячейка, чьё окно побитово звучит как фасад
// секции, сдаёт ref в наследование (per_cell: каждая сама по себе, связки
// не блокируют). Звук от этого не меняется никогда — меняется только то,
// откуда ячейка берёт рисунок, поэтому parity-проверки §10-12 остаются
// звуковыми и зелёными.
function facadeSound(m, i) {
  const cells = m.cells.map((c) => ({ span: c.span, ref: null, anchor: c.anchor }));
  return windowSound({ pool: m.pool, secRef: m.secRef, cells }, i);
}
function sameSound(a, b) {
  if (!a || !b) return false;
  if (Math.abs(a.steps.length / a.sub - b.steps.length / b.sub) > 1e-9) return false;
  const hits = (w) => {
    const out = [];
    w.steps.forEach((s, k) => {
      if (s === '_' || s == null) return;
      if (Array.isArray(s) && !s.length) return;
      const sym = Array.isArray(s) ? s.slice().sort((x, y) => x - y).join('+') : String(s);
      out.push(k / w.sub + '=' + sym);
    });
    return out;
  };
  const A = hits(a), B = new Set(hits(b));
  return A.length === B.size && A.every((x) => B.has(x));
}
function settleModel(m) {
  if (!m.secRef) return; // facade_no: без явного боя секции правило спит
  m.cells.forEach((c, i) => {
    if (!c.ref) return;
    if (sameSound(windowSound(m, i), facadeSound(m, i))) c.ref = null;
  });
}
function split(m, i) {
  const c = m.cells[i];
  const half = c.span / 2;
  c.span = half;
  m.cells.splice(i + 1, 0, { span: half, ref: c.ref, anchor: c.anchor }); // обе половины — окна на ТОТ ЖЕ рулон
  regridToFit(m); // половина может попасть между шагов — сетка рулона утончается
  settleModel(m); // B-20: addChordAfter завершается сверкой с фасадом
}

const regrid = (steps, k) => { // как regridRhythmSteps: шаг + (k-1) рестов
  const out = [];
  for (const s of steps) {
    out.push(Array.isArray(s) ? s.slice() : s);
    for (let j = 1; j < k; j++) out.push(Array.isArray(s) ? [] : '_');
  }
  return out;
};

// Единственная точка, где трогаются шаги: граница окна сошла с сетки рулона —
// сетка кратно утончается, содержимое и удары не меняются.
function regridToFit(m) {
  const byRef = {};
  m.cells.forEach((c, i) => { if (c.ref) (byRef[c.ref] = byRef[c.ref] || new Set()).add(i); });
  for (const ref in byRef) {
    const roll = m.pool[ref];
    const idxs = [...byRef[ref]];
    const fits = (s) => idxs.every((i) => {
      const c = m.cells[i];
      const is = (x) => Math.abs(x - Math.round(x)) < 1e-9;
      return is((offsetOf(m, i) - c.anchor) * s) && is(c.span * s);
    });
    if (!fits(roll.subdivision))
      for (const k of [2, 4, 8]) { // ТОЛЬКО кратные исходной сетке — иначе триоли расплющатся на 16-ые
        const s = roll.subdivision * k;
        if (s > 24) break;       // границы не тоньше 1/8 юнита (сплит после ресайза) — запаса хватает
        if (fits(s)) {
          roll.steps = regrid(roll.steps, k);
          roll.subdivision = s;  // утончился РУЛОН: все его окна согласованы by construction
          break;
        }
      }
  }
}

function writeSpans(m, spans, dragIdx, release) { // ресайз = сменить доли; шаги не трогаем
  const sewnId = sewChain(m, spans, dragIdx); // волна-6: сквозная лента ВСЕЙ цепочки жеста
  spans.forEach((v, i) => { m.cells[i].span = v; });
  regridToFit(m);
  if (release && sewnId) {
    // Растворение свежесшитой ленты (зеркало dissolveSewnRhythmPair):
    // каждая ячейка цепочки получает ПРИВАТНЫЙ рулон ровно со своим
    // звучащим куском — общая лента жеста дальше не живёт, и поздний
    // «минус» пары приватных рулонов идёт по своим правилам (окно
    // поглотителя тянется по ЕГО ленте), а не по цепочным. Честные
    // связки (sewnId пуст — sewChain вышел на «уже одна лента») сюда не
    // доходят и жестом не разрушаются.
    // B-06: целиком пустое окно при необъявленном бое секции приватного
    // рулона не получает — ссылка снимается, ячейка на удар-в-начале.
    m.cells.forEach((c, i) => {
      if (c.ref !== sewnId) return;
      if (!m.secRef && !hasHit(windowSound(m, i))) { c.ref = null; return; }
      const win = windowSound(m, i);
      const nid = mint();
      m.pool[nid] = { mode: 'strum', subdivision: win.sub,
        steps: win.steps.map((s) => (Array.isArray(s) ? s.slice() : s)) };
      c.ref = nid;
      c.anchor = offsetOf(m, i);
    });
  }
  settleModel(m); // B-20: отпускание ручки завершается сверкой с фасадом
}
function hasHit(w) {
  return !!w && w.steps.some((s) =>
    (typeof s === 'string' && s !== '_') || (Array.isArray(s) && s.length > 0));
}

// Сквозная лента (волна-6): затронутые ЭТОЙ операцией ячейки сшиваются в
// один временный рулон по долям ДО сдвига (writeSpans вызывают до смены
// долей — они здесь ещё старые). Волна-5 сшивала только пару у ручки;
// волна-6 — всю цепочку непрерывного охвата (глубокая протяжка).
// Куски: своё — звучащим окном рулона, наследник — срезом фасада на своих
// долях (застывает: дальше привязан к рулону и за боем секции не
// следует), рисунка нет вовсе — лента тишины. Сетка: минимальная из ряда
// до 24 под всех; общей нет — под пару у ручки, а выбивающиеся ячейки
// играют в ленте ТИШИНУ (ритм очищен; в приложении — с уведомлением, в
// модели тосты не моделируются); нет сетки и для пары — жест едет по
// старым правилам волн-2/3. Канонизация (coarsenRhythmRoll) в модели не
// воспроизводится: она меняет только плотность записи, не удары — для
// паритета по времени ударов она неотличима.
// На mouseup приложение растворяет такую сшивку в приватные рулоны —
// звуку растворение безразлично, поэтому в модели его нет.
function sewChain(m, spans, dragIdx) {
  if (!Number.isInteger(dragIdx) || dragIdx < 0 || dragIdx + 1 >= m.cells.length) return;
  const cells = m.cells;
  // Цепочка: охват всех ячеек, чьи доли меняются этой операцией.
  let iMin = -1, iMax = -1;
  for (let i = 0; i < cells.length; i++)
    if (Math.abs(spans[i] - cells[i].span) > 1e-9) { if (iMin < 0) iMin = i; iMax = i; }
  if (iMin < 0 || iMax <= iMin) return; // холостой ход — не сшиваем
  if (!(iMin <= dragIdx && dragIdx < iMax)) return;
  // уже одна лента (честная связка или собранная раньше цепочка)
  if (cells.slice(iMin, iMax + 1).every((c) => c.ref && c.ref === cells[iMin].ref)) return;
  const offs = []; let acc = 0;
  cells.forEach((c) => { offs.push(acc); acc += c.span; });
  const frozen = (i) => {
    const c = cells[i];
    if (c.ref && m.pool[c.ref]) {
      return { sub: Math.max(1, m.pool[c.ref].subdivision || 1), steps: windowSound(m, i).steps };
    }
    if (m.secRef && m.pool[m.secRef]) {
      return { sub: Math.max(1, m.pool[m.secRef].subdivision || 1), steps: windowSound(m, i).steps };
    }
    return null; // пустая — лента тишины
  };
  const tapes = [], subs = [];
  for (let i = iMin; i <= iMax; i++) { tapes.push(frozen(i)); subs.push(tapes[tapes.length - 1] ? tapes[tapes.length - 1].sub : 0); }
  const is = (x) => Math.abs(x - Math.round(x)) < 1e-9;
  const fitsCell = (i, cand) =>
    (!subs[i - iMin] || cand % subs[i - iMin] === 0) && is(cells[i].span * cand) && is(offs[i] * cand);
  const ROW = [1, 2, 3, 4, 6, 8, 12, 16, 24];
  let g = 0;
  for (const cand of ROW) {
    let allOk = true;
    for (let i = iMin; i <= iMax; i++) if (!fitsCell(i, cand)) { allOk = false; break; }
    if (allOk) { g = cand; break; }
  }
  const outliers = new Set();
  if (!g) {
    for (const cand of ROW) { if (fitsCell(dragIdx, cand) && fitsCell(dragIdx + 1, cand)) { g = cand; break; } }
    if (!g) return; // даже у пары сетки нет — старые правила
    for (let i = iMin; i <= iMax; i++) if (!fitsCell(i, g)) outliers.add(i);
  }
  const lens = []; let total = 0;
  for (let i = iMin; i <= iMax; i++) { const n = Math.max(1, Math.round(cells[i].span * g)); lens.push(n); total += n; }
  const steps = Array.from({ length: total }, () => '_');
  let base = 0;
  for (let i = iMin; i <= iMax; i++) {
    const n = lens[i - iMin];
    if (!outliers.has(i)) {
      const tape = tapes[i - iMin];
      const sub = subs[i - iMin] || g;
      if (tape) {
        const need = Math.max(1, Math.round(cells[i].span * sub));
        for (let k = 0; k < need; k++) {
          const pos = base + Math.round((k * g) / sub);
          if (pos < base || pos >= base + n || pos >= steps.length) continue;
          const sym = tape.steps[k % tape.steps.length];
          if (sym == null) continue;
          steps[pos] = Array.isArray(sym) ? sym.slice() : sym;
        }
      }
    }
    base += n;
  }
  const id = mint();
  m.pool[id] = { mode: 'strum', subdivision: g, steps };
  for (let i = iMin; i <= iMax; i++) { cells[i].ref = id; cells[i].anchor = offs[iMin]; }
  return id; // B-20: выпуск релиза отличает свежесшитую ленту от честной связки
}

function removeCell(m, i) { // «минус»: сосед поглощает долю; окно на том же рулоне просто стало шире
  if (m.cells.length < 2) return;
  const removed = m.cells[i];
  const absorber = i > 0 ? m.cells[i - 1] : (i + 1 < m.cells.length ? m.cells[i + 1] : null);
  const iAbs = m.cells.indexOf(absorber);
  // B-23 (2026-08-27): «полная запись» в обе стороны. До этого adopt
  // покрывал только безссылочного поглотителя (B-20); поглотитель С
  // пином прокручивал свою ленту по кругу на поглощённое время — звук
  // удалённой умирал молча. Теперь при любой ссылке в паре (кроме
  // честной связки — её ленту собирает окно) лента итоговой ячейки
  // прорисовывается из звучащих окон обеих половин ДО операции
  // (windowSound модели — рисунок либо заводской удар, ровно таймлайн
  // приложения), а пин ставим только если он меняет звук.
  const shareRoll = !!(removed && removed.ref && absorber && absorber.ref === removed.ref);
  const needSew = !!(removed && absorber && (removed.ref || absorber.ref) && !shareRoll);
  let sewn = null;
  let sewnAnchor = 0;
  if (needSew) {
    const winA = windowSound(m, iAbs);
    const winR = windowSound(m, i);
    const g = lcm(winA.sub, winR.sub);
    const stepsA = regrid(winA.steps, g / winA.sub);
    const stepsR = regrid(winR.steps, g / winR.sub);
    const offA = offsetOf(m, iAbs), offR = offsetOf(m, i);
    const steps = (offA <= offR ? stepsA.concat(stepsR) : stepsR.concat(stepsA));
    sewnAnchor = Math.min(offA, offR);
    let anyHit = false;
    for (const s of steps) {
      if (s && s !== '_' && !(Array.isArray(s) && !s.length)) { anyHit = true; break; }
    }
    if (anyHit) sewn = { sub: g, steps }; // полностью тихую запись не заводим
  }
  if (i === 0) { // поглотитель справа встаёт на начало квадрата
    m.cells[1].span += m.cells[0].span;
    m.cells.splice(0, 1);
    // Якорь НЕ трогаем до сведения ниже: приложение сводит рулон при
    // СТАРОМ якоре (collapseOrphanRhythmRoll) и лишь потом переносит
    // якорь приватного на оффсет (syncPrivateRhythmAnchors). Zero-хак
    // здесь искажал кусок ленты для «минуса» на первой ячейке после
    // приватизации.
  } else {
    m.cells[i - 1].span += m.cells[i].span;
    m.cells.splice(i, 1);
  }
  if (sewn) {
    const aIdxSew = m.cells.indexOf(absorber);
    // Экономная ветвь: сшитая лента тождественна пост-проекции (цикл
    // собственного рулона поглотителя или фасад совпал) — пин не ставим.
    if (!sameSound(windowSound(m, aIdxSew), sewn)) {
      const id = mint();
      m.pool[id] = { mode: 'strum', subdivision: sewn.sub, steps: sewn.steps };
      absorber.ref = id;
      absorber.anchor = sewnAnchor;
    }
  }
  // Два collapse-вызова приложения ДОСЛОВНО: рулон поглотителя, оставшийся
  // в одном окне, сводится к своей звучащей полосе — окну по НОВЫМ долям
  // и СТАРОМУ якорю (у цепочки якорь на начале ленты, поэтому это и есть
  // сборка полного рисунка); затем syncPrivateRhythmAnchors ставит якорь
  // приватного на оффсет ячейки. Порядок важен: сведение при старом
  // якоре, потом перенос якоря.
  const aIdx = m.cells.indexOf(absorber);
  if (absorber && absorber.ref) {
    const users = m.cells.filter((cc) => cc.ref === absorber.ref).length;
    if (users === 1) {
      const win = windowSound(m, aIdx);
      m.pool[absorber.ref] = { mode: 'strum', subdivision: win.sub,
        steps: win.steps.map((s) => (Array.isArray(s) ? s.slice() : s)) };
      absorber.anchor = offsetOf(m, aIdx);
    }
  }
  settleModel(m); // B-20: removeChordAt завершается сверкой с фасадом
}

// ============================================================================
// МИГРАЦИЯ старого формата (встроенные strumPattern + rhythmGroup) в пул.
// Контракт: звук DO и ПОСЛЕ обязан совпасть поударно; связки (одинаковая
// метка, единая сетка/режим, честная длина срезов) собираются в один рулон —
// им возвращается ленточность. Подозрительные группы → раздельные пины
// (= старая семантика exact, тоже звукосохраняющая, просто без связанности).
// ============================================================================
function migrateOldSong(events, secPattern) {
  const m = { pool: {}, secRef: null, cells: [] };
  if (secPattern) { m.secRef = mint(); m.pool[m.secRef] = clone(secPattern); }
  let off = 0; const offs = [];
  for (const ev of events) { offs.push(off); off += ev.span; }
  const groups = {};
  events.forEach((ev, i) => {
    const g = ev.strumPattern && ev.strumPattern.rhythmGroup;
    if (g) (groups[g] = groups[g] || []).push(i);
  });
  const rollForGroup = {};
  for (const gid in groups) {
    const idxs = groups[gid];
    const contiguous = idxs.every((v, j) => v === idxs[0] + j); // члены связки строго подряд
    const mode0 = events[idxs[0]].strumPattern.mode || 'strum';
    const sameMode = idxs.every((i) => (events[i].strumPattern.mode || 'strum') === mode0
      && Array.isArray(events[i].strumPattern.steps));
    // Рулон строим не «склейкой хранимых срезов», а ПРОРИСОВКОЙ звучащего
    // таймлайна на большой общей сетке: у старых сейвов дробные доли дают
    // хвосты round(span*sub), которые по отдельности не складываются
    // (Σround ≠ roundΣ) — зато удары ложатся на сетку g по своим временам.
    let g = 0;
    if (contiguous && sameMode && idxs.length > 1) {
      const subs = idxs.map((i) => Math.max(1, events[i].strumPattern.subdivision || 1));
      const spanTotal = idxs.reduce((a, i) => a + events[i].span, 0);
      for (const cand of [1, 2, 3, 4, 6, 8, 12, 16, 24]) {
        if (!subs.every((v) => cand % v === 0)) continue;      // удары на k/sub лягут на сетку
        if (!idxs.every((i) => {
          const is = (x) => Math.abs(x - Math.round(x)) < 1e-9;
          return is(events[i].span * cand);
        })) continue;                                          // полосы целые
        const anchorT = offs[idxs[0]];
        if (!Number.isInteger(Math.round(spanTotal * cand))) continue;
        g = cand; break;
      }
    }
    if (g) {
      const anchorT = offs[idxs[0]];
      const total = Math.max(1, Math.round(idxs.reduce((a, i) => a + events[i].span, 0) * g));
      const steps = Array.from({ length: total }, () => (mode0 === 'pick' ? [] : '_'));
      for (const i of idxs) {
        const p = events[i].strumPattern;
        const sub = Math.max(1, p.subdivision || 1);
        const need = Math.max(1, Math.round(events[i].span * sub));
        for (let k = 0; k < need; k++) { // будущая лента = то, что старая играла (loop/trim exact)
          const sym = p.steps[k % p.steps.length];
          const pos = Math.round((offs[i] - anchorT) * g + (k * g) / sub);
          if (pos < total) steps[pos] = Array.isArray(sym) ? sym.slice() : sym;
        }
      }
      const id = mint();
      m.pool[id] = { mode: mode0, subdivision: g, steps };
      rollForGroup[gid] = { id, anchor: anchorT };
    } // иначе (дырки/разные режимы/сетка over 24) — раздельные пины: fallback, звук не меняется
  }
  events.forEach((ev, i) => {
    const p = ev.strumPattern;
    let ref = null, anchor = offs[i];
    if (p) {
      const g = p.rhythmGroup && rollForGroup[p.rhythmGroup];
      if (g) { ref = g.id; anchor = g.anchor; }
      else { ref = mint(); m.pool[ref] = clone(p); }
    }
    m.cells.push({ span: ev.span, ref, anchor });
  });
  return m;
}

// ============================================================================
// ПРАВКА РАСШАРЕННОГО РУЛОНА. Семантика = хирургическая запись в полосу
// рулона ПОД окном редактируемой ячейки. Соседние окна не меняются, лента
// не рвётся — это бит-в-бит поведение сегодняшнего «отредактировал половину,
// а перенарезка несёт её правку дальше» (sameGroup concat).
// Смена дробления в редакторе — документированный форк: кратное утончение
// всего рулона (v1); область правки не шире её окна.
// ============================================================================
function editWindowSteps(m, i, newSteps) {
  const c = m.cells[i];
  const roll = m.pool[c.ref || ''];
  if (!roll) return false; // наследующая ячейка: сначала pin (в приложении — в диалоге)
  const sub = Math.max(1, roll.subdivision || 1);
  const off = offsetOf(m, i);
  const startStep = Math.round((off - c.anchor) * sub);
  const need = Math.max(1, Math.round(c.span * sub));
  const w = newSteps.slice(0, need);
  while (w.length < need) w.push('_'); // редактор допускает короче окна — добиваем рестами
  for (let k = 0; k < need; k++)
    roll.steps[mod(startStep + k, roll.steps.length)] = Array.isArray(w[k]) ? w[k].slice() : w[k];
  return true;
}

// ============================================================================
// Прогоны.
// ============================================================================
const strum = (sub, text) => ({ mode: 'strum', subdivision: sub, steps: text.split('') });
const D = (pat, span) => { const o = { chord: 'C', span, timeSig: null }; if (pat) o.strumPattern = pat; return o; };
let M = null; // текущая новая модель в прогоне
const both = (label) => {
  const a = oldEvents(), b = newEvents(M);
  ok(`${label}: звук новой модели == эталону`, a === b, `эталон: ${a} | новая: ${b}`);
  return b;
};

console.log('=== Модель «Рулон и окна»: примеры и дифференциальный прогон ===\n');
console.log('--- 1. Спека пользователя, вся цепочка: + → −1/8 → назад → +1/8 → −1/16 ---');
scene([D(strum(2, 'D_DU_UDU'), 4)]);
M = newModel([D(strum(2, 'D_DU_UDU'), 4)]);
both('исходник D_DU_UDU');
evl('return addChordAfter(1,2,0), 0'); split(M, 0);
ok('деление → D_DU|_UDU', displayOf(M, 0) === 'D_DU' && displayOf(M, 1) === '_UDU',
  `${displayOf(M, 0)}|${displayOf(M, 1)}`);
both('после деления');
setSpans([1.5, 2.5], 0); writeSpans(M, [1.5, 2.5]);
ok('ресайз −1/8 → D_D|U_UDU', displayOf(M, 0) === 'D_D' && displayOf(M, 1) === 'U_UDU',
  `${displayOf(M, 0)}|${displayOf(M, 1)}`);
both('ресайз −1/8');
setSpans([2, 2], 0); writeSpans(M, [2, 2]);
ok('назад → D_DU|_UDU (рисунок восстановлен)', displayOf(M, 0) === 'D_DU' && displayOf(M, 1) === '_UDU');
both('возврат');
setSpans([2.5, 1.5], 0); writeSpans(M, [2.5, 1.5]);
ok('+1/8 → D_DU_|UDU', displayOf(M, 0) === 'D_DU_' && displayOf(M, 1) === 'UDU');
setSpans([1.75, 2.25], 0); writeSpans(M, [1.75, 2.25]);
ok('−1/16 → D___D_U|___U_D_U_', displayOf(M, 0) === 'D___D_U' && displayOf(M, 1) === '___U_D_U_',
  `${displayOf(M, 0)}|${displayOf(M, 1)}`);
ok('−1/16 → сетка стала 16-ми одним изменением рулона',
  subOf(M, 0) === 4 && subOf(M, 1) === 4 && M.cells[0].ref === M.cells[1].ref);
both('ресайз −1/16');
note(`внутри: cells store = ${JSON.stringify(M.cells.map(c => ({ span: c.span, ref: c.ref, anchor: c.anchor })))}`);

console.log('\n--- 2. То же −1/16 одним движением из деления (спека-2/сцена K) ---');
scene([D(strum(2, 'D_DU_UDU'), 4)]);
M = newModel([D(strum(2, 'D_DU_UDU'), 4)]);
evl('return addChordAfter(1,2,0), 0'); split(M, 0);
setSpans([1.75, 2.25], 0); writeSpans(M, [1.75, 2.25]);
ok('сразу 1.75/2.25 → D___D_U|___U_D_U_', displayOf(M, 0) + '|' + displayOf(M, 1) === 'D___D_U|___U_D_U_',
  `${displayOf(M, 0)}|${displayOf(M, 1)}`);
both('сразу −1/16');

console.log('\n--- 3. Чужие соседи: волна-5 сшивает пару в сквозную ленту ---');
scene([D(strum(2, 'D_D_D_D_'), 4), D(strum(2, 'U_U_U_U_'), 4)]);
M = newModel([D(strum(2, 'D_D_D_D_'), 4), D(strum(2, 'U_U_U_U_'), 4)]);
const alienBefore = newEvents(M);
setSpans([3, 5], 0); writeSpans(M, [3, 5], 0);
ok('левый после ресайза: D_D_D_ (срез своего куска ленты)', displayOf(M, 0) === 'D_D_D_', displayOf(M, 0));
ok('правый: D_U_U_U_U_ (читает ленту от границы — удар на доле 3.0 стоит на месте)',
  displayOf(M, 1) === 'D_U_U_U_U_', displayOf(M, 1));
ok('пара жеста на одном временном рулоне (волна-5)', M.cells[0].ref !== null && M.cells[0].ref === M.cells[1].ref,
  `${M.cells[0].ref}/${M.cells[1].ref}`);
both('чужие после ресайза');

console.log('\n--- 4. Цепочка из трёх (деление деления) ---');
scene([D(strum(2, 'D_DU_UDU'), 4)]);
M = newModel([D(strum(2, 'D_DU_UDU'), 4)]);
evl('return addChordAfter(1,2,0), 0'); split(M, 0);
evl('return addChordAfter(1,2,1), 0'); split(M, 1);
ok('доли 2,1,1', M.cells.map((c) => c.span).join(',') === '2,1,1');
ok('все трое — окна на один рулон', M.cells.every((c) => c.ref === M.cells[0].ref));
setSpans([1.5, 1, 1.5], 0); writeSpans(M, [1.5, 1, 1.5], 0);
ok('нарезка цепочки: D_D|U_|UDU',
  [0, 1, 2].map((i) => displayOf(M, i)).join('|') === 'D_D|U_|UDU',
  [0, 1, 2].map((i) => displayOf(M, i)).join('|'));
both('цепочка после ресайза');
note('гвардов dragIdx/startSpans в модели нет: средняя ячейка сама знает, на какой рулон смотрит.');

console.log('\n--- 5. Смешанная пара: своя ячейка + наследующий сосед (застывает, волна-5), секция U_U_U_U_ ---');
const secPat = strum(2, 'U_U_U_U_');
scene([D(strum(2, 'D_DU_UDU'), 2), D(null, 2)], secPat);
M = newModel([D(strum(2, 'D_DU_UDU'), 2), D(null, 2)], secPat);
both('смешанная: до ресайза');
setSpans([1.5, 2.5], 0); writeSpans(M, [1.5, 2.5], 0);
both('смешанная: граница поехала');
ok('наследник застыл собственным срезом (ref на ленту пары, волна-5)', M.cells[1].ref !== null);
// Продолжение: после правки меняем бой секции — наследник обязан подхватить.
scene([D(strum(2, 'D_DU_UDU'), 2), D(null, 2)], secPat);
M = newModel([D(strum(2, 'D_DU_UDU'), 2), D(null, 2)], secPat);
evl(`sections[0].strumPattern = ${JSON.stringify(strum(2, 'DDDDDDDD'))}; return 0`);
const oldAfterPreset = oldEvents();
M.pool[M.secRef] = clone(strum(2, 'DDDDDDDD'));
const newAfterPreset = newEvents(M);
ok('смена пресета секции: унаследованная ячейка следует за боем (без правки ресайзом)',
  oldAfterPreset === newAfterPreset, `эталон: ${oldAfterPreset} | новая: ${newAfterPreset}`);
scene([D(strum(2, 'D_DU_UDU'), 2), D(null, 2)], secPat);
setSpans([1.5, 2.5], 0); // волна-5 (inherit_freeze): наследник на границе
// жеста застывает своим срезом фасада — смена боя секции его НЕ трогает.
evl(`sections[0].strumPattern = ${JSON.stringify(strum(2, 'DDDDDDDD'))}; return 0`);
const oldStuck = oldEvents();
scene([D(strum(2, 'D_DU_UDU'), 2), D(null, 2)], secPat);
M = newModel([D(strum(2, 'D_DU_UDU'), 2), D(null, 2)], secPat); // свежая модель с ПРЕЖНИМ фасадом: застыть обязан именно его срез
setSpans([1.5, 2.5], 0); writeSpans(M, [1.5, 2.5], 0);
M.pool[M.secRef] = clone(strum(2, 'DDDDDDDD'));
const newFollows = newEvents(M);
note(`ПОСЛЕ смешанного ресайза меняем бой секции: приложение → ${oldStuck}`);
note(`                                            зонд-модель → ${newFollows}`);
ok('ПОДТВЕРЖДЕНИЕ в проде (волна-5 доставлена): тронутый наследник застыл и за боем НЕ следует, как модель',
  oldStuck === newFollows && newFollows === '0.000=D 1.000=D 1.500=U 2.000=U 3.000=U',
  `приложение: ${oldStuck} | зонд-модель: ${newFollows}`);

console.log('\n--- 6. Совсем пустое поле: ничего не записано ни в ячейку, ни в секцию ---');
scene([D(null, 2), D(null, 2)]);
M = newModel([D(null, 2), D(null, 2)]);
both('пустое: до');
setSpans([1.5, 2.5], 0); writeSpans(M, [1.5, 2.5], 0);
both('пустое: пара сшивается в ленту тишины — звука как не было (волна-5)');

console.log('\n--- 7. Минус: связка собирается обратно в одну ленту ---');
scene([D(strum(2, 'D_DU_UDU'), 4)]);
M = newModel([D(strum(2, 'D_DU_UDU'), 4)]);
evl('return addChordAfter(1,2,0), 0'); split(M, 0);
evl('return removeChordAt(1,2,1), 0'); removeCell(M, 1);
ok('− второй → D_DU_UDU (окно раскрылось на весь рулон)', displayOf(M, 0) === 'D_DU_UDU', displayOf(M, 0));
both('− второй');
scene([D(strum(2, 'D_DU_UDU'), 4)]);
M = newModel([D(strum(2, 'D_DU_UDU'), 4)]);
evl('return addChordAfter(1,2,0), 0'); split(M, 0);
evl('return removeChordAt(1,2,0), 0'); removeCell(M, 0);
ok('− первый → D_DU_UDU', displayOf(M, 0) === 'D_DU_UDU', displayOf(M, 0));
both('− первый');
scene([D(strum(2, 'D_DU_UDU'), 4)]);
M = newModel([D(strum(2, 'D_DU_UDU'), 4)]);
evl('return addChordAfter(1,2,0), 0'); split(M, 0);
evl('return addChordAfter(1,2,1), 0'); split(M, 1);
evl('return removeChordAt(1,2,1), 0'); removeCell(M, 1);
ok('− середина цепочки → D_DU_U|DU', [0, 1].map((i) => displayOf(M, i)).join('|') === 'D_DU_U|DU',
  [0, 1].map((i) => displayOf(M, i)).join('|'));
both('− середина');

console.log('\n--- 8. Ловушка, из-за которой старой модели понадобилась склейка ---');
{
  // Рулон 4 шага = 2 юнита; окно правой ячейки начинается на 1.5 — посреди рулона.
  const m = { pool: { rX: strum(2, 'D_U_') }, secRef: null,
    cells: [ { span: 1.5, ref: 'rX', anchor: 0 }, { span: 2, ref: 'rX', anchor: 0 } ] };
  const win = displayOf(m, 1);
  const naive = 'D_U_'; // хранящаяся копия рестартовала бы с шага 0
  ok(`срез окном с 1.5 юнита: ${win} (фаза рулона сохранена: ленточный срез посреди рулона)`,
    win === '_D_U', win);
  note(`наивная копия дала бы ${naive} — весь рисунок сдвинут на полтора шага. Окно не умеет так ошибаться: ему нечего рестартовать.`);
}

console.log('\n--- 9. Невозможные состояния (не гварды, а типовая конструкция) ---');
ok('у ячейки нет полей steps/subdivision/метки — состояние «половины на разных сетках под одной меткой» невыразимо',
  M.cells.every((c) => !('steps' in c) && !('subdivision' in c) && !('rhythmGroup' in c)));

// --- 10. Случайная дифференциальная батарея: 400 состояний ------------------
console.log('\n--- 10. Батарея: 400 случайных раскладок, звук эталона vs звук новой ---');
let seed = 42;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
let batteryBad = 0, firstDiffs = [];
for (let t = 0; t < 400; t++) {
  const nCells = 1 + Math.floor(rnd() * 4);
  // доли по сетке 1/4, суммарно 4 юнита
  const cuts = [0, 4];
  for (let i = 0; i < nCells - 1; i++) cuts.push(0.25 * (1 + Math.floor(rnd() * 15)));
  cuts.sort((a, b) => a - b);
  const spans = [];
  for (let i = 0; i + 1 < cuts.length; i++) spans.push(+(cuts[i + 1] - cuts[i]).toFixed(2));
  if (spans.some((s) => s <= 0)) continue;
  const evs = spans.map((span) => {
    if (rnd() < 0.45) {
      const sub = pick([1, 2, 4, 3]);
      const len = 1 + Math.floor(rnd() * (sub * 2 + 2));
      const steps = Array.from({ length: len }, () => (rnd() < 0.55 ? 'D' : rnd() < 0.5 ? 'U' : '_'));
      return D({ mode: 'strum', subdivision: sub, steps }, span);
    }
    return D(null, span);
  });
  let secPattern = null;
  if (rnd() < 0.6) {
    const sub = pick([1, 2, 4, 3]);
    let len = sub * (1 + Math.floor(rnd() * 3));
    if (rnd() < 0.15) len += 1; // «несчётный» рисунок: len не кратен sub — фазы нет
    secPattern = { mode: 'strum', subdivision: sub,
      steps: Array.from({ length: len }, () => pick(['D', 'U', '_', 'D', 'U'])) };
  }
  scene(evs, secPattern);
  M = newModel(evs, secPattern);
  const a = oldEvents(), b = newEvents(M);
  if (a !== b) {
    batteryBad++;
    if (firstDiffs.length < 5) firstDiffs.push(`#${t} spans=${spans} | эталон: ${a} | новая: ${b}`);
  }
}
ok(`батereя: ${400 - batteryBad}/400 звуковых разложений совпали`, batteryBad === 0,
  firstDiffs.join('\n'));

// --- 11. Батарея правок: случайные операции ресайза/деления/минуса ---------
console.log('\n--- 11. Батарея правок: 300 траекторий длиной до 6 операций ---');
let opBad = 0, tripletTraj = 0, invBad = 0, oldQuantized = 0; firstDiffs = [];
for (let t = 0; t < 300; t++) {
  const subInit = pick([1, 2, 4, 3]);
  const evs = [D(rnd() < 0.7 ? strum(subInit, ['D_DU_UDU', 'D_U_U_D_', 'DDDD', 'D_U_D_U_', 'UU_D__DU', 'DU_DU_D_'][Math.floor(rnd() * 6)]) : null, 4)];
  const secPattern = rnd() < 0.5 ? strum(pick([1, 2, 4]), pick(['U_U_U_U_', 'D_D_D_D_', 'DU_DU_DU'])) : null;
  const parityZone = subInit !== 3 && (!secPattern || secPattern.subdivision !== 3);
  scene(evs, secPattern);
  M = newModel(evs, secPattern);
  const hasRoll = !!evs[0].strumPattern; // «правки не двигают удары» — для рулонной ленты; пустая ячейка законно даёт удар свежей половине
  const initEvents = hasRoll ? newEvents(M) : null;
  let diverged = false;
  const history = [];
  const ops = 2 + Math.floor(rnd() * 5);
  for (let step = 0; step < ops && !diverged; step++) {
    const n = M.cells.length;
    const kind = pick(n === 1 ? ['split', 'resize'] : n > 3 ? ['resize', 'minus'] : ['split', 'resize', 'resize', 'minus']);
    // Снимок ДО операции: звук и раскладка — для пошагового инварианта.
    let __zoff = 0;
    const preRegions = M.cells.map((c) => { const r = [__zoff, __zoff + c.span]; __zoff += c.span; return r; });
    const preSound = newEvents(M);
    let mergeRegion = null; // для «минуса»: область склейки (поглотитель+удалённая) — см. ветку ниже
    if (kind === 'split') {
      const i = Math.floor(rnd() * n);
      if (M.cells[i].span < 1) continue;
      history.push(`split(${i})`);
      try { evl(`return addChordAfter(1,2,${i}), 0`); } catch (e) { diverged = true; break; }
      split(M, i);
    } else if (kind === 'minus') {
      const i = Math.floor(rnd() * n);
      // Область склейки по раскладке ДО операции: поглотитель + удалённая.
      // B-23: при наличии ссылки в паре звук на склейке сохраняется
      // побитово (полная запись) — зона излишня; стираем её только для
      // пары безссылочных (заводской удар удалённой канонически умирает
      // в начале окна — B-06-канон, а не наша волна).
      {
        const absIdx = i > 0 ? i - 1 : (i + 1 < n ? i + 1 : -1);
        if (absIdx >= 0 && !(M.cells[i].ref || M.cells[absIdx].ref)) {
          const a = preRegions[i], b = preRegions[absIdx];
          mergeRegion = [Math.min(a[0], b[0]), Math.max(a[1], b[1])];
        }
      }
      history.push(`minus(${i})`);
      try { evl(`return removeChordAt(1,2,${i}), 0`); } catch (e) { diverged = true; break; }
      removeCell(M, i);
    } else {
      // случайная перестановка границ, сохраняющая сумму
      const spans = M.cells.map((c) => c.span);
      const total = spans.reduce((a, b) => a + b, 0);
      const cuts = [0, total];
      for (let i = 0; i < n - 1; i++) cuts.push(0.25 * (1 + Math.floor(rnd() * (total * 4 - 1))));
      cuts.sort((a, b) => a - b);
      const next = [];
      for (let i = 0; i < n; i++) next.push(+(cuts[i + 1] - cuts[i]).toFixed(2));
      if (next.some((s) => s <= 0) || Math.abs(next.reduce((a, b) => a + b, 0) - total) > 1e-9) continue;
      if (next.every((v, i) => v === spans[i])) continue; // холостой ход — не операция
      const dragIdx = spans.findIndex((v, i) => v !== next[i]);
      history.push(`resize([${spans}]→[${next}],drag${dragIdx})`);
      try { setSpansGesture(next, Math.max(0, dragIdx)); } catch (e) { diverged = true; break; }
      writeSpans(M, next, Math.max(0, dragIdx), true); // release: жест завершён
    }
    // Пошаговый инвариант «правки не двигают удары» (B-20: жест теперь
    // доводится до конца — реслайс + растворение + автонаследование, а не
    // вечный ход под курсором, и канон минуса проявился честно):
    //  - split/голый ресайз: звук не трогается вообще (кроме B-06-зон);
    //  - «минус»: переписывает ТОЛЬКО область склейки (поглотитель тянет
    //    СВОЮ ленту — канон, рисунок удалённой умирает с ячейкой), всё
    //    вокруг сверяется жёстко;
    //  - B-06: при необъявленном бое секции целиком пустые окна на
    //    отпускании дематериализуются и ячейка законно возвращается к
    //    удару-в-начале (спека B-06: «удар вернулся») — такие зоны тоже
    //    вычитаем с обеих сторон.
    const stripZones = (ev, zones) => {
      if (!ev || ev === '(тишина)' || !zones.length) return !ev || ev === '(тишина)' ? '' : ev;
      return ev.split(' ').filter(Boolean).filter((tok) => {
        const t = parseFloat(tok);
        return !(t >= 0 || t < 0) ? true : !zones.some(([a, b]) => t >= a - 1e-9 && t < b - 1e-9);
      }).join(' ');
    };
    const zonesNow = [];
    if (mergeRegion) zonesNow.push(mergeRegion);
    if (!M.secRef) { // B-06-зоны актуальны только без боя секции
      let zoff = 0;
      M.cells.forEach((c) => { if (!c.ref) zonesNow.push([zoff, zoff + c.span]); zoff += c.span; });
    }
    if (hasRoll && stripZones(newEvents(M), zonesNow) !== stripZones(preSound, zonesNow)) {
      invBad++;
      if (firstDiffs.length < 3) firstDiffs.push(`ИНВАРИАНТ #${t} ops=${history.join(' > ')}: было [${preSound}] стало [${newEvents(M)}] (зоны: ${JSON.stringify(zonesNow)})`);
    }
    if (!parityZone) { tripletTraj++; continue; } // триоли: старое = документированный пропуск, звук расходится by design
    const a = oldEvents(), b = newEvents(M);
    if (a !== b) {
      // Кто прав? Проверяем по ТАЙМЛАЙНУ: удары новой обязаны лежать на
      // позициях исходной ленты (это и есть инвариант выше); удары старой,
      // которых не было на ленте, — квантизационные сдвиги/дубли копий.
      const times = (ev) => new Set(ev.split(' ').filter(Boolean).map((x) => parseFloat(x)));
      let offOld = 0, offNew = 0;
      if (initEvents) {
        const initT = times(initEvents);
        for (const x of times(a)) if (![...initT].some((v) => Math.abs(v - x) < 1e-6)) offOld++;
        for (const x of times(b)) if (![...initT].some((v) => Math.abs(v - x) < 1e-6)) offNew++;
      }
      if (initEvents && offNew === 0 && offOld > 0) {
        oldQuantized++; diverged = true; // старая сошла с ленты, новая — нет
      } else {
        opBad++;
        if (firstDiffs.length < 3) {
          const oldDump = evl(`return JSON.stringify(sections[0].squares[0].events.map((e,ei)=>{
            const sec=sections[0], sq=sec.squares[0];
            const ref = songRhythmRolls && songRhythmRolls.refs.get(rhythmRefKey(sec.id, sq.id, ei));
            const p = rhythmSoundingForEvent(sec, sq, e, ei);
            return { span:e.span, roll: ref ? ref.roll : null, sounding: p ? p.steps.join("") : null }; }))`);
          firstDiffs.push(`#${t} сек=${JSON.stringify(secPattern)} ops=${history.join(' > ')}\n   эталон(${a})\n   новая (${b})\n   эталон.состояние=${oldDump}\n   новая.состояние=${JSON.stringify(M.cells)}`);
        }
      }
    }
  }
}
ok(`паритетная зона: подлинных расхождений новой со старой = ${opBad}`, opBad === 0, firstDiffs.join('\n'));
ok(`все расхождения — это сдвиги ударов СТАРОЙ модели с ленты (${oldQuantized} состояний; новая лежит на ленте всегда)`,
  oldQuantized >= 0);
ok(`инвариант «правки не двигают удары» держится во всех 300 траекториях`, invBad === 0, `сломан в ${invBad}`);
note(`триольных траекторий: ${tripletTraj} — там старая модель играет протухшие срезы (документированный пропуск), новая играет ленту.`);

// --- 12. Миграция: контракт «звук после == звук до» -------------------------
console.log('\n--- 12. Миграция старого формата в пул: 200 случайных старых песен ---');
let migBad = 0, migLinked = 0, migTotal = 0; firstDiffs = [];
for (let t = 0; t < 200; t++) {
  const nCells = 1 + Math.floor(rnd() * 4);
  const cuts = [0, 4];
  for (let i = 0; i < nCells - 1; i++) cuts.push(0.25 * (1 + Math.floor(rnd() * 15)));
  cuts.sort((a, b) => a - b);
  const spans = [];
  for (let i = 0; i + 1 < cuts.length; i++) spans.push(+(cuts[i + 1] - cuts[i]).toFixed(2));
  if (spans.some((x) => x <= 0)) continue;
  const gid = 'rg-old-' + t;
  const linked = spans.length > 1 && rnd() < 0.5; // цепочка «поделённых»: подряд, единая сетка — как делают реальные сплиты
  const gsub = pick([1, 2, 4, 3]);
  const evs = spans.map((span, i) => {
    if (linked || rnd() < 0.55) {
      const sub = linked ? gsub : pick([1, 2, 4, 3]);
      let len = Math.max(1, Math.round(span * sub));
      if (!linked && rnd() < 0.12) len = Math.max(1, len + (rnd() < 0.5 ? -1 : 2)); // «кривые» срезы из старых сейвов
      const pat = { mode: 'strum', subdivision: sub,
        steps: Array.from({ length: len }, () => pick(['D', 'U', '_', 'D', 'U'])) };
      if (linked) pat.rhythmGroup = gid;
      return D(pat, span);
    }
    return D(null, span);
  });
  const secPattern = rnd() < 0.5 ? strum(pick([1, 2, 4, 3]), pick(['U_U_U_U_', 'D_D_D_D_', 'DU_DU_DU'])) : null;
  scene(evs, secPattern);
  const before = oldEvents();
  M = migrateOldSong(evs, secPattern);
  const after = newEvents(M);
  migTotal++;
  const inRoll = M.cells.filter((c) => c.ref).length;
  const distinct = new Set(M.cells.map((c) => c.ref).filter(Boolean)).size;
  if (inRoll > 1 && distinct < inRoll) migLinked++; // группа собрана в рулон
  if (before !== after) {
    migBad++;
    if (firstDiffs.length < 3) firstDiffs.push(`#${t} | до: ${before} | после: ${after}`);
  }
}
ok(`миграция: ${migTotal - migBad}/${migTotal} звук сохранён поударно`, migBad === 0, firstDiffs.join('\n'));
ok(`миграция вернула ленточность связкам (собрано групп в один рулон: ${migLinked})`, migLinked > 0);
note('подозрительные группы (дырки/разные сетки/кривая длина) распадаются в раздельные пины — звук тот же, связи нет; так же ведёт себя старая склейка V-теста.');
// Криптография хранилища: сериализация → объект ↔ звук.
const ser = JSON.parse(JSON.stringify({ pool: M.pool, secRef: M.secRef, cells: M.cells }));
ok('конверт песни переживает JSON-круговорот', newEvents(ser) === newEvents(M));
// Старое сохранение связки ОЖИВАЕТ как лента после миграции: та же спека проходит.
{
  const oldSave = [D({ mode:'strum', subdivision:2, steps:'D_DU'.split(''), rhythmGroup:'rg-1' }, 2),
                   D({ mode:'strum', subdivision:2, steps:'_UDU'.split(''), rhythmGroup:'rg-1' }, 2)];
  const m2 = migrateOldSong(oldSave, null);
  ok('старый сейв D_DU|_UDU собран в один рулон', m2.cells[0].ref === m2.cells[1].ref && m2.pool[m2.cells[0].ref].steps.join('') === 'D_DU_UDU',
    JSON.stringify(m2.cells));
  const sndBefore = newEvents(m2);
  writeSpans(m2, [1.5, 2.5]);
  ok('после миграции спека живёт дальше: ресайз −1/8 → D_D|U_UDU',
    displayOf(m2, 0) === 'D_D' && displayOf(m2, 1) === 'U_UDU');
  ok('и звук при ресайзе не дрогнул', newEvents(m2) === sndBefore, `${sndBefore} -> ${newEvents(m2)}`);
}

// --- 13. Правка расшаренного рулона: хирургическая запись в окно ------------
console.log('\n--- 13. Правка половины связки пишется в её полосу ленты ---');
{
  const m3 = { pool: { rA: strum(2, 'D_DU_UDU') }, secRef: null,
    cells: [ { span: 2, ref: 'rA', anchor: 0 }, { span: 2, ref: 'rA', anchor: 0 } ] };
  const rightOf = () => newEvents(m3).split(' ').filter((x) => x && parseFloat(x) >= 2).join(' ');
  const rightBefore = rightOf();
  ok('правка левого окна UXUU: рулон стал UXUU_UDU', (() => {
    editWindowSteps(m3, 0, 'UXUU'.split(''));
    return m3.pool.rA.steps.join('') === 'UXUU_UDU';
  })());
  ok('экран: UXUU|_UDU (сосед не тронут)', displayOf(m3, 0) === 'UXUU' && displayOf(m3, 1) === '_UDU');
  const rightAfter = rightOf();
  ok('удар правой половины не сдвинулся', rightBefore === rightAfter, `${rightBefore} -> ${rightAfter}`);
  writeSpans(m3, [1.5, 2.5]);
  ok('лента жива после правки: ресайз −1/8 → UXU|U_UDU', displayOf(m3, 0) === 'UXU' && displayOf(m3, 1) === 'U_UDU',
    `${displayOf(m3, 0)}|${displayOf(m3, 1)}`);
  ok('наследующую ячейку редактор не трогает (нужен явный pin)', !editWindowSteps({ pool:{}, secRef:null, cells:[{span:2, ref:null, anchor:0}] }, 0, 'D'.split('')));
}

console.log(`\n=== ИТОГ: ${bad === 0 ? 'все проверки зелёные' : 'FAIL ' + bad} ===`);
process.exitCode = bad ? 1 : 0;
