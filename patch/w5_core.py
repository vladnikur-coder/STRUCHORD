# -*- coding: utf-8 -*-
# Волна-5, часть 1: ядро ленты соседей.
#  - rhythmRollWindowFor: доли можно передать явно (заморозка по старым долям жеста)
#  - новые функции: facadeSlicePattern / frozenTapeForEvent /
#    sewRhythmPairAtBoundary / dissolveSewnRhythmPair
#  - resliceSharedRhythmsInSquare: сшивка пары ПЕРЕД приватной докруткой
import io

p = '/home/user/STRUCHORD.html'
t = io.open(p, encoding='utf-8', errors='surrogateescape').read()

# ---------- 1. rhythmRollWindowFor + новые функции ленты ----------
old = """function rhythmRollWindowFor(secId, sq, eventIndex, storage) {
  if (!storage) return null;
  const ref = storage.refs.get(`${secId}:${sq.id}:${eventIndex}`);
  if (!ref) return null;
  const roll = storage.pool[ref.roll];
  const evs = sq.events || [];
  const ev = evs[eventIndex];
  if (!roll || !ev) return null;
  const sub = Math.max(1, roll.subdivision || 1);
  const len = roll.steps.length;
  if (!len) return null;
  let off = 0;
  for (let i = 0; i < eventIndex; i++) off += evs[i].span || 1;
  const startStep = Math.round((off - ref.anchor) * sub);
  const need = Math.max(1, Math.round((ev.span || 1) * sub));
  const steps = [];
  for (let k = 0; k < need; k++) steps.push(roll.steps[(((startStep + k) % len) + len) % len]);
  return { mode: roll.mode, subdivision: sub, steps };
}
"""
new = """function rhythmRollWindowFor(secId, sq, eventIndex, storage, spansOverride) {
  if (!storage) return null;
  const ref = storage.refs.get(`${secId}:${sq.id}:${eventIndex}`);
  if (!ref) return null;
  const roll = storage.pool[ref.roll];
  const evs = sq.events || [];
  const ev = evs[eventIndex];
  if (!roll || !ev) return null;
  const sub = Math.max(1, roll.subdivision || 1);
  const len = roll.steps.length;
  if (!len) return null;
  // Доли можно передать явно (волна-5): сшивке нужна геометрия ДО жеста —
  // замороженный кусок ленты читается по старым долям, пока текущие уже
  // съехали под курсором.
  const spanAt = (i) => {
    const v = spansOverride && spansOverride[i] != null ? spansOverride[i] : (evs[i] && evs[i].span);
    return v || 1;
  };
  let off = 0;
  for (let i = 0; i < eventIndex; i++) off += spanAt(i);
  const startStep = Math.round((off - ref.anchor) * sub);
  const need = Math.max(1, Math.round(spanAt(eventIndex) * sub));
  const steps = [];
  for (let k = 0; k < need; k++) steps.push(roll.steps[(((startStep + k) % len) + len) % len]);
  return { mode: roll.mode, subdivision: sub, steps };
}

// Срез фасада (унаследованного боя секции/квадрата) под ячейку — чистая
// форма наследственной ветки getSlicedPatternForEvent с явными долями
// (волна-5, inherit_freeze): фаза в такте застывает в момент касания
// границы — считаем её по долям ДО жеста, а не по съехавшим под курсором.
// Рисунок самой ячейки здесь не читается намеренно: «своё» даёт окно пула.
function facadeSlicePattern(sec, sq, ev, eventIndex, spansOverride) {
  if (!sec || !sq || !ev) return null;
  const pattern = getEffectiveStrumPattern(null, sq, sec);
  if (!pattern || !Array.isArray(pattern.steps) || !pattern.steps.length) return null;
  const ts = getEffectiveTimeSigForEvent(ev, sq, sec);
  const sub = Math.max(1, pattern.subdivision || 1);
  const spanAt = (i) => {
    const v = spansOverride && spansOverride[i] != null ? spansOverride[i] : (sq.events[i] && sq.events[i].span);
    return v || 1;
  };
  const need = Math.max(1, Math.round(spanAt(eventIndex) * sub));
  const patternUnits = pattern.steps.length / sub;
  if (!Number.isInteger(patternUnits) || patternUnits < 1) return null;
  let offsetUnits = 0;
  for (let i = 0; i < eventIndex; i++) {
    const evTs = (sq.events[i] && sq.events[i].timeSig) || ts;
    offsetUnits += convertSpanBetweenTimeSigs(spanAt(i), evTs, ts);
  }
  const total = pattern.steps.length;
  const cycleOffset = ((offsetUnits % patternUnits) + patternUnits) % patternUnits;
  const startStep = Math.round(cycleOffset * sub);
  const steps = [];
  for (let i = 0; i < need; i++) steps.push(pattern.steps[(startStep + i) % total]);
  return { mode: pattern.mode, subdivision: sub, steps };
}

// Замороженное звучащее содержимое ячейки на момент касания границы
// (волна-5): своё — окном рулона по старым долям, наследник — срезом
// фасада по старым долям (застывает навсегда: дальше за боем секции уже
// НЕ следует), рисунка нет вовсе — null (по спеке это лента тишины).
function frozenTapeForEvent(st, sec, sq, i, spansOverride) {
  if (!st || !sq || !(sq.events || [])[i]) return null;
  const win = rhythmRollWindowFor(sec.id, sq, i, st, spansOverride || null);
  if (win) return win;
  return facadeSlicePattern(sec, sq, sq.events[i], i, spansOverride || null);
}

// ---------- СКВОЗНАЯ ЛЕНТА СОСЕДЕЙ (волна-5, 2026-08) ----------
// Спека: при ресайзе ручкой границы двух рядом стоящих ячеек ритм внутри
// них меняться не должен — движется только граница, звук стоит на месте
// (пример: D_DU_UDU|D_XU_UXU -> D_DU_U|DUD_XU_UXU -> D_DU_UDUD_X|U_UXU —
// 16 шагов позиционно сохранны при любом ходе). Реализация: на первом же
// движении пара сшивается в ОДИН временный рулон по долям ДО жеста, оба
// окна читают его позиционно (как честная связка, волна-2), а на
// отпускании мыши растворяется обратно в два приватных рулона
// (link_transient). Перешивать из текущих окон при каждом ходе не нужно:
// куски после каждого среза стыкуются в ту же ось — один раз сшил, дальше
// лента живёт сама побитово так же, как замороженная лента жеста.
//  * пустая ячейка (рисунка нет вообще) — лента тишины;
//  * наследник — текущий срез фасада, застывает при касании;
//  * разные дробления — общая подсетка из ряда до 24 (как у связок);
//    общей сетки нет (триоли против двоичных) — не сшиваем, старые правила;
//  * разные режимы (бой против перебора) — не препятствие: рулону ставится
//    режим 'mixed', режим читается по шагу (массив/число — перебор,
//    D/U/X/«_» — бой).
function sewRhythmPairAtBoundary(st, sec, sq, dragIdx, startSpans) {
  if (!st || !sq || !Array.isArray(sq.events)) return;
  const L = dragIdx, R = dragIdx + 1;
  if (!Number.isInteger(L) || L < 0 || R >= sq.events.length) return;
  const kL = rhythmRefKey(sec.id, sq.id, L);
  const kR = rhythmRefKey(sec.id, sq.id, R);
  const rL = st.refs.get(kL);
  const rR = st.refs.get(kR);
  // Уже одна лента: повторный ход того же жеста либо честная связка —
  // позиционный срез волн-2/3 делает ровно то, что просит спека.
  if (rL && rR && rL.roll === rR.roll) return;
  const spanAt = (i) => {
    const v = startSpans && startSpans[i] != null ? startSpans[i] : (sq.events[i] && sq.events[i].span);
    return v || 1;
  };
  const offs0 = [];
  let acc0 = 0;
  sq.events.forEach((e0, i) => { offs0.push(acc0); acc0 += spanAt(i); });
  const tapeL = frozenTapeForEvent(st, sec, sq, L, startSpans || null);
  const tapeR = frozenTapeForEvent(st, sec, sq, R, startSpans || null);
  const subL = tapeL ? Math.max(1, tapeL.subdivision || 1) : 0;
  const subR = tapeR ? Math.max(1, tapeR.subdivision || 1) : 0;
  const isInt = (x) => Math.abs(x - Math.round(x)) < 1e-9;
  let g = 0;
  for (const cand of [1, 2, 3, 4, 6, 8, 12, 16, 24]) {
    if (subL && cand % subL !== 0) continue;
    if (subR && cand % subR !== 0) continue;
    if (!isInt(spanAt(L) * cand) || !isInt(spanAt(R) * cand)) continue;
    if (!isInt(offs0[L] * cand) || !isInt(offs0[R] * cand)) continue;
    g = cand;
    break;
  }
  if (!g) return; // общей сетки не нашлось — пара едет по старым правилам
  const modeL = tapeL ? (tapeL.mode || 'strum') : null;
  const modeR = tapeR ? (tapeR.mode || 'strum') : null;
  const pairMode = modeL && modeR && modeL !== modeR ? 'mixed' : (modeL || modeR || 'strum');
  const restStep = () => (pairMode === 'pick' ? [] : '_');
  // Лента пары = замороженные куски подряд, якорь — начало левой ячейки
  // старых долей. Сумма долей пары за жест не меняется, значит оба окна
  // всегда укладываются в ленту без заворота.
  const totalL = Math.round(spanAt(L) * g);
  const totalR = Math.round(spanAt(R) * g);
  const steps = Array.from({ length: Math.max(1, totalL + totalR) }, restStep);
  const place = (tape, base, spanUnits, sub) => {
    if (!tape || !Array.isArray(tape.steps) || !tape.steps.length) return;
    const need = Math.max(1, Math.round(spanUnits * sub));
    for (let k = 0; k < need; k++) {
      const pos = base + Math.round((k * g) / sub);
      if (pos < base || pos >= steps.length) continue;
      const sym = tape.steps[k % tape.steps.length];
      if (sym == null || (Array.isArray(sym) && !sym.length)) continue;
      steps[pos] = Array.isArray(sym) ? sym.slice() : sym;
    }
  };
  place(tapeL, 0, spanAt(L), subL || g);
  place(tapeR, totalL, spanAt(R), subR || g);
  const oldRolls = new Set();
  if (rL) oldRolls.add(rL.roll);
  if (rR) oldRolls.add(rR.roll);
  const id = mintRhythmRollId(st);
  st.pool[id] = { mode: pairMode, subdivision: g, steps, transient: true };
  st.refs.set(kL, { roll: id, anchor: offs0[L] });
  st.refs.set(kR, { roll: id, anchor: offs0[L] });
  // Покинутые рулоны: уцелев в одном окне, сводятся к звучащей полосе —
  // как при форке из редактора.
  oldRolls.forEach((rid) => { if (rid !== id) collapseOrphanRhythmRoll(st, sec, sq, rid); });
}

// Отпускание ручки: временная сшивка растворяется — каждая ячейка пары
// получает приватный рулон ровно со своим звучащим куском, якорь на её
// начало по итоговым долям. Честную связку (рулон без метки transient,
// собранную «+» или старым сейвом) жест не разрушает.
function dissolveSewnRhythmPair(st, sec, sq, dragIdx) {
  if (!st || !sq || !Array.isArray(sq.events)) return;
  const L = dragIdx, R = dragIdx + 1;
  if (!Number.isInteger(L) || L < 0 || R >= sq.events.length) return;
  const rL = st.refs.get(rhythmRefKey(sec.id, sq.id, L));
  const rR = st.refs.get(rhythmRefKey(sec.id, sq.id, R));
  if (!rL || !rR || rL.roll !== rR.roll) return;
  const roll = st.pool[rL.roll];
  if (!roll || !roll.transient) return;
  let users = 0;
  for (const r of st.refs.values()) if (r.roll === rL.roll) users++;
  if (users !== 2) return;
  const offs = squareEventOffsets(sq);
  [L, R].forEach((i) => {
    const win = rhythmRollWindowFor(sec.id, sq, i, st);
    if (!win || !Array.isArray(win.steps) || !win.steps.length) return;
    const nid = mintRhythmRollId(st);
    st.pool[nid] = { mode: win.mode, subdivision: win.subdivision, steps: cloneRhythmSteps(win.steps) };
    st.refs.set(rhythmRefKey(sec.id, sq.id, i), { roll: nid, anchor: offs[i] });
  });
  gcRhythmRolls(st);
}
"""
assert t.count(old) == 1, 'P1 anchor not found/ambiguous'
t = t.replace(old, new, 1)

# ---------- 2. reslice: сшивка перед приватной докруткой ----------
old = """// Перенарезка окон после смены долей (волна-2/3). Вызывается из растяжки
// (writeSpans и onUp у .resize-handle) на каждом движении, поэтому обязана
// быть идемпотентной: повторный прогон по тем же долям даёт те же окна.
// Сама лента не переписывается (инвариант «правки не двигают удары»):
// меняются только окна на рулоны. Ячейка без своего рисунка реза не
// замечает вовсе — наследственный срез течёт за долями фасадом (волна-3,
// сшивка смешанных пар отменена). Параметры dragIdx/startSpans оставлены
// в сигнатуре: startSpans по-прежнему задаёт доли ДО жеста для
// перестройки ссылок квадрата, dragIdx совместимости ради.
function resliceSharedRhythmsInSquare(sq, parentTs, sec, dragIdx, startSpans) {
  if (!sq || !Array.isArray(sq.events)) return;
  const st = ensureSquareRhythmRefs(sec, sq, startSpans || null);
  if (!st) return;
  syncPrivateRhythmAnchors(st, sec, sq);
  regridSquareRollsToFit(sec, sq);
  gcRhythmRolls(st);
}
"""
new = """// Перенарезка окон после смены долей (волны-2/3/5). Вызывается из растяжки
// (writeSpans и onUp у .resize-handle) на каждом движении, поэтому обязана
// быть идемпотентной: повторный прогон по тем же долям даёт те же окна.
// Волна-5 встала ПЕРВЫМ шагом: пара на границе жеста сшивается в общую
// ленту по долям ДО жеста (сквозная лента соседей — ритм при растяжке не
// меняется, см. sewRhythmPairAtBoundary), и дальше приватная докрутка её
// уже не трогает — у сшитого рулона два окна, а syncPrivateRhythmAnchors
// работает только с приватными. Пара в общей сетки не имеет (триоли
// против двоичных) — не сшивается и едет по старым правилам волн-2/3:
// свой рисунок докручивается циклом/режется, наследственный срез течёт
// за долями фасадом. startSpans по-прежнему задаёт доли ДО жеста.
function resliceSharedRhythmsInSquare(sq, parentTs, sec, dragIdx, startSpans) {
  if (!sq || !Array.isArray(sq.events)) return;
  const st = ensureSquareRhythmRefs(sec, sq, startSpans || null);
  if (!st) return;
  sewRhythmPairAtBoundary(st, sec, sq, dragIdx, startSpans);
  syncPrivateRhythmAnchors(st, sec, sq);
  regridSquareRollsToFit(sec, sq);
  gcRhythmRolls(st);
}
"""
assert t.count(old) == 1, 'P3 anchor not found/ambiguous'
t = t.replace(old, new, 1)

# ---------- 3. onUp у ручки: растворение пары после финального re-среза ----------
old = """        // Финальная сверка длины могла сдвинуть последнюю ячейку —
        // перерезаем общий ритм ещё раз по итоговым долям.
        resliceSharedRhythmsInSquare(sq, parentTs, s, ei, origSpans);
        requestRender();
"""
new = """        // Финальная сверка длины могла сдвинуть последнюю ячейку —
        // перерезаем общий ритм ещё раз по итоговым долям.
        resliceSharedRhythmsInSquare(sq, parentTs, s, ei, origSpans);
        // Волна-5 (link_transient): жест окончен — временная сшивка пары
        // растворяется в два приватных рулона, ячейки снова независимы.
        dissolveSewnRhythmPair(songRhythmRolls, s, sq, ei);
        requestRender();
"""
assert t.count(old) == 1, 'P4 anchor not found/ambiguous'
t = t.replace(old, new, 1)

# ---------- 4. serialize: режим mixed доезжает до сейва ----------
old = """    pool[id] = {
      mode: r.mode === 'pick' ? 'pick' : 'strum',
      subdivision: Math.max(1, r.subdivision || 1),
      steps: cloneRhythmSteps(r.steps),
    };
"""
new = """    pool[id] = {
      mode: r.mode === 'pick' ? 'pick' : r.mode === 'mixed' ? 'mixed' : 'strum',
      subdivision: Math.max(1, r.subdivision || 1),
      steps: cloneRhythmSteps(r.steps),
    };
"""
assert t.count(old) == 1, 'P9 anchor not found/ambiguous'
t = t.replace(old, new, 1)

# ---------- 5. клонирование квадрата: режим mixed не теряется ----------
old = """      st.pool[nid] = { mode: roll.mode === 'pick' ? 'pick' : 'strum',
        subdivision: Math.max(1, roll.subdivision || 1),
        steps: cloneRhythmSteps(roll.steps) };
"""
new = """      st.pool[nid] = { mode: roll.mode === 'pick' ? 'pick' : roll.mode === 'mixed' ? 'mixed' : 'strum',
        subdivision: Math.max(1, roll.subdivision || 1),
        steps: cloneRhythmSteps(roll.steps) };
"""
assert t.count(old) == 1, 'P10 anchor not found/ambiguous'
t = t.replace(old, new, 1)

io.open(p, 'w', encoding='utf-8', errors='surrogateescape').write(t)
print('core ok')
