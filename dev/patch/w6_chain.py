#!/usr/bin/env python3
# Волна-6 (2026-08-25): канонизация сетки + лента по цепочке + шапка-PWA.
# Решения ask_user: all_three (всё вместе), dissolve_all (растворять цепочку
# в приватные рулоны), outlier -> сброс сетки до подавляющей + ритм очищен +
# уведомление (custom). Плюс замечание пользователя: сетка НЕ должна оставаться
# перегруженной после возврата границ на грубую решётку — coarsenRhythmRoll.
import io

PATH = '/home/user/STRUCHORD.html'
src = io.open(PATH, 'r', encoding='utf-8', errors='surrogateescape').read()
orig_len = len(src)

def must(expr, label):
    assert expr, 'ГВАРД: ' + label

# ---------- 1. Правила модели «Рулон и окна»: допускаем обратную запись ----------
old_rules = """//  * сама лента при нарезке не переписывается; единственная запись в
//    рулон — кратное утончение его сетки (k: 2, 4, 8; потолок 24), когда
//    граница окна сошла с шага, да хирургическая правка из редактора в
//    свою полосу;"""
new_rules = """//  * сама лента при нарезке не переписывается; записи в рулон три, и все
//    сохраняют звук побитово: кратное утончение сетки (k: 2, 4, 8; потолок
//    24), когда граница окна сошла с шага; обратная канонизация сетки
//    (волна-6, coarsenRhythmRoll) — укрупнение до самой грубой сетки без
//    потерь, когда контент и геометрия снова это позволяют; да
//    хирургическая правка из редактора в свою полосу;"""
must(src.count(old_rules) == 1, 'правила модели')
src = src.replace(old_rules, new_rules)
print('ok  1. правила модели: + канонизация')

# ---------- 2. Точка вызова сшивки: пара -> цепочка ----------
old_call = '  sewRhythmPairAtBoundary(st, sec, sq, dragIdx, startSpans);\n'
must(src.count(old_call) == 1, 'вызов sew в reslice')
src = src.replace(old_call, '  sewRhythmChainAtBoundary(st, sec, sq, dragIdx, startSpans);\n')
print('ok  2. reslice зовёт цепочку')

# ---------- 2б. Док над reslice: семантика цепочки ----------
old_doc = """// Перенарезка окон после смены долей (волны-2/3/5). Вызывается из растяжки
// (writeSpans и onUp у .resize-handle) на каждом движении, поэтому обязана
// быть идемпотентной: повторный прогон по тем же долям даёт те же окна.
// Волна-5 встала ПЕРВЫМ шагом: пара на границе жеста сшивается в общую
// ленту по долям ДО жеста (сквозная лента соседей — ритм при растяжке не
// меняется, см. sewRhythmPairAtBoundary), и дальше приватная докрутка её
// уже не трогает — у сшитого рулона два окна, а syncPrivateRhythmAnchors
// работает только с приватными. Пара в общей сетки не имеет (триоли
// против двоичных) — не сшивается и едет по старым правилам волн-2/3:
// свой рисунок докручивается циклом/режется, наследственный срез течёт
// за долями фасадом. startSpans по-прежнему задаёт доли ДО жеста."""
new_doc = """// Перенарезка окон после смены долей (волны-2/3/5/6). Вызывается из растяжки
// (writeSpans и onUp у .resize-handle) на каждом движении, поэтому обязана
// быть идемпотентной: повторный прогон по тем же долям даёт те же окна.
// Сквозная лента встала ПЕРВЫМ шагом: цепочка затронутых жестом ячеек
// сшивается в общий временный рулон по долям ДО жеста (ритм при растяжке
// не меняется, см. sewRhythmChainAtBoundary), и дальше приватная докрутка
// её не трогает — у сшитого рулона окон несколько, а
// syncPrivateRhythmAnchors работает только с приватными. Общей сетки для
// всех нет: сетка под пару у ручки, а выбивающиеся ячейки играют тишину с
// уведомлением (решение волны-6); сетки нет даже для пары — цепочка не
// сшивается и едет по старым правилам волн-2/3: свой рисунок
// докручивается циклом/режется, наследственный срез течёт за долями
// фасадом. startSpans по-прежнему задаёт доли ДО жеста."""
must(src.count(old_doc) == 1, 'док над reslice')
src = src.replace(old_doc, new_doc)
print('ok  2б. док над reslice: цепочка')

# ---------- 3. Сшивка: полная замена блока (док + функция) ----------
start_marker = '// ---------- СКВОЗНАЯ ЛЕНТА СОСЕДЕЙ (волна-5, 2026-08) ----------'
end_marker = '\n// Отпускание ручки:'
must(src.count(start_marker) == 1, 'начало блока сшивки')
must(src.count(end_marker) == 1, 'конец блока сшивки')
i0 = src.index(start_marker)
i1 = src.index(end_marker, i0)

new_sew = """// ---------- СКВОЗНАЯ ЛЕНТА (волна-5: пара; волна-6: цепочка) ----------
// Спека волны-5: при ресайзе ручкой границы двух рядом стоящих ячеек ритм
// внутри них меняться не должен — движется только граница, звук стоит на
// месте (пример: D_DU_UDU|D_XU_UXU -> D_DU_U|DUD_XU_UXU -> D_DU_UDUD_X|U_UXU
// — 16 шагов позиционно сохранны при любом ходе). Реализация: на первом же
// движении пара сшивается в ОДИН временный рулон по долям ДО жеста, оба
// окна читают его позиционно (как честная связка, волна-2), а на
// отпускании мыши растворяется обратно в приватные рулоны (link_transient).
// Перешивать из текущих окон при каждом ходе не нужно: куски после каждого
// среза стыкуются в ту же ось — один раз сшил, дальше лента живёт сама
// побитово так же, как замороженная лента жеста.
//
// Волна-6 (решение deep_bad): ГЛУБОКАЯ протяжка — правая ячейка упёрлась
// в минимум, начала резаться следующая — сшивает в одну ленту ВСЮ цепочку
// затронутых ячеек, а не пару у ручки. Охват определяется сравнением долей
// с долями до жеста: каждая съехавшая ячейка в ленте. Ход назад охват
// съёживает — пересшивать не надо: вернувшиеся ячейки (если остались
// лишними на ленте) стоят на старой геометрии, их окна читают исходные
// куски, на mouseup все растворятся в приватные рулоны. Пересшивается
// только РОСТ: в охват вошла ячейка, которой на ленте ещё нет.
//  * пустая ячейка (рисунка нет вообще) — лента тишины;
//  * наследник — текущий срез фасада, застывает при касании;
//  * разные дробления — общая подсетка из ряда до 24 (как у связок);
//    «выбивающаяся» ячейка (контент или геометрия не легли на общую
//    сетку) — играет ТИШИНУ на сетке большинства: её ритм очищен навсегда
//    на этот жест, сетка сброшена до подавляющей, пользователю вылетает
//    уведомление (решение пользователя волны-6); общей сетки нет даже для
//    пары у ручки — жест целиком по старым правилам;
//  * разные режимы (бой против перебора) — не препятствие: рулону ставится
//    режим 'mixed', режим читается по шагу (массив/число — перебор,
//    D/U/X/«_» — бой). Тишина выбившихся режима не несёт.
function sewRhythmChainAtBoundary(st, sec, sq, dragIdx, startSpans) {
  if (!st || !sq || !Array.isArray(sq.events)) return;
  if (!Number.isInteger(dragIdx) || dragIdx < 0 || dragIdx + 1 >= sq.events.length) return;
  const spanAt = (i) => {
    const v = startSpans && startSpans[i] != null ? startSpans[i] : (sq.events[i] && sq.events[i].span);
    return v || 1;
  };
  const curSpan = (i) => (sq.events[i] && sq.events[i].span) || 1;
  const isInt = (x) => Math.abs(x - Math.round(x)) < 1e-9;
  // Охват ленты: все ячейки, чьи доли уехали от долей ДО жеста. Без
  // замороженных долей (startSpans) сшивать нечего — писатели-перепроверки
  // и клики без протяжки сюда не доходят за счёт пустого охвата
  // (гвард «граница не сдвинулась» волны-5).
  let iMin = -1, iMax = -1;
  if (startSpans) {
    for (let i = 0; i < sq.events.length; i++) {
      if (Math.abs(curSpan(i) - spanAt(i)) > 1e-9) { if (iMin < 0) iMin = i; iMax = i; }
    }
  }
  if (iMin < 0 || iMax <= iMin) return;
  if (!(iMin <= dragIdx && dragIdx < iMax)) return; // ручка обязана быть внутри цепочки
  const keys = [];
  for (let i = iMin; i <= iMax; i++) keys.push(rhythmRefKey(sec.id, sq.id, i));
  const refs = keys.map((k) => st.refs.get(k));
  // Уже одна лента ровно этого охвата: честная связка (волна-2, срез и так
  // позиционный) либо собранная на этом жесте временная цепочка. Хвост
  // временной ленты может быть ШИРЕ нынешнего охвата (ход назад) — это не
  // повод пересшивать: наружные ячейки звучат исходными кусками (см.
  // комментарий выше). Пересшивка — только рост охвата.
  if (refs.every((r) => r && r.roll === refs[0].roll)) return;
  const offs0 = [];
  let acc0 = 0;
  sq.events.forEach((e0, i) => { offs0.push(acc0); acc0 += spanAt(i); });
  const tapes = [], subs = [];
  for (let i = iMin; i <= iMax; i++) {
    tapes.push(frozenTapeForEvent(st, sec, sq, i, startSpans || null));
    subs.push(tapes[tapes.length - 1] ? Math.max(1, tapes[tapes.length - 1].subdivision || 1) : 0);
  }
  const fitsCell = (i, cand) =>
    (!subs[i - iMin] || cand % subs[i - iMin] === 0) &&
    isInt(spanAt(i) * cand) && isInt(offs0[i] * cand);
  const ROW = [1, 2, 3, 4, 6, 8, 12, 16, 24];
  let g = 0;
  for (const cand of ROW) {
    let allOk = true;
    for (let i = iMin; i <= iMax; i++) if (!fitsCell(i, cand)) { allOk = false; break; }
    if (allOk) { g = cand; break; }
  }
  const outliers = new Set();
  if (!g) {
    // Общей сетки для всех нет — сетка под пару у ручки (критерий
    // волны-5), а кому она не легла — выбивающиеся в тишину (см. док).
    for (const cand of ROW) {
      if (fitsCell(dragIdx, cand) && fitsCell(dragIdx + 1, cand)) { g = cand; break; }
    }
    if (!g) return; // даже пара без сетки — жест целиком по старым правилам
    for (let i = iMin; i <= iMax; i++) if (!fitsCell(i, g)) outliers.add(i);
  }
  const modes = new Set();
  for (let i = iMin; i <= iMax; i++) {
    if (outliers.has(i)) continue;
    const t = tapes[i - iMin];
    if (t) modes.add(t.mode || 'strum');
  }
  const chainMode = modes.size > 1 ? 'mixed' : (modes.size ? [...modes][0] : 'strum');
  const restStep = () => (chainMode === 'pick' ? [] : '_');
  // Лента цепочки = замороженные куски подряд, якорь — начало левой
  // ячейки охвата на старых долях. Сумма долей квадрата за жест не
  // меняется: сумма долей цепочки постоянна, все окна всегда укладываются
  // в ленту без заворота.
  const lens = [];
  let total = 0;
  for (let i = iMin; i <= iMax; i++) {
    const n = Math.max(1, Math.round(spanAt(i) * g));
    lens.push(n);
    total += n;
  }
  const steps = Array.from({ length: total }, restStep);
  let base = 0;
  for (let i = iMin; i <= iMax; i++) {
    const n = lens[i - iMin];
    if (!outliers.has(i)) {
      const tape = tapes[i - iMin];
      const sub = subs[i - iMin] || g;
      if (tape && Array.isArray(tape.steps) && tape.steps.length) {
        const need = Math.max(1, Math.round(spanAt(i) * sub));
        for (let k = 0; k < need; k++) {
          const pos = base + Math.round((k * g) / sub);
          if (pos < base || pos >= base + n || pos >= steps.length) continue;
          const sym = tape.steps[k % tape.steps.length];
          if (sym == null) continue; // битый слот: остаётся заглушка ленты
          // Щипковая пауза остаётся щипковой (режим шага, mode_step).
          if (Array.isArray(sym) && !sym.length) { steps[pos] = []; continue; }
          steps[pos] = Array.isArray(sym) ? sym.slice() : sym;
        }
      }
    }
    base += n;
  }
  // Уведомления об очищенных выбивающихся — один раз на ячейку за жест:
  // пересшивка при росте цепочки наследует журнал показанных (иначе на
  // каждом движении глубокой протяжки тост спамился бы заново).
  const oldRolls = new Set();
  refs.forEach((r) => { if (r) oldRolls.add(r.roll); });
  const seen = new Set();
  oldRolls.forEach((rid) => {
    const rl = st.pool[rid];
    if (rl && rl.transient && Array.isArray(rl._clearedKeys)) rl._clearedKeys.forEach((k) => seen.add(k));
  });
  outliers.forEach((i) => {
    const k = keys[i - iMin];
    if (!seen.has(k)) {
      if (typeof showToast === 'function')
        showToast(`Ритм ячейки ${i + 1} очищен: не легла общая сетка ленты`);
      seen.add(k);
    }
  });
  const id = mintRhythmRollId(st);
  st.pool[id] = { mode: chainMode, subdivision: g, steps, transient: true, _clearedKeys: [...seen] };
  for (let i = iMin; i <= iMax; i++)
    st.refs.set(keys[i - iMin], { roll: id, anchor: offs0[iMin] });
  // Покинутые рулоны: уцелев в одном окне, сводятся к звучащей полосе —
  // как при форке из редактора.
  oldRolls.forEach((rid) => { if (rid !== id) collapseOrphanRhythmRoll(st, sec, sq, rid); });
}
"""
src = src[:i0] + new_sew + src[i1:]
print('ok  3. сшивка заменена на цепочку (с выбивающимися + тостами)')

# ---------- 4. Растворение: пара -> вся цепочка + канонизация ----------
d0_marker = '// Отпускание ручки: временная сшивка растворяется'
d1_marker = '\n// Самопроверка:'
must(src.count(d0_marker) == 1, 'начало dissolve')
must(src.count(d1_marker) == 1, 'конец dissolve')
i0 = src.index(d0_marker)
i1 = src.index(d1_marker, i0)

new_dissolve = """// Отпускание ручки: временная сшивка растворяется — каждая ячейка
// ЦЕПОЧКИ (волна-6; в волне-5 растворялась только пара у ручки, имя
// функции историческое) получает приватный рулон ровно со своим звучащим
// куском, якорь на её начало по итоговым долям. Лишние хвосты ленты
// (вернувшиеся ячейки при ходе назад) растворяются так же — их окна на
// старой геометрии дают ровно исходные куски. Честную связку (рулон без
// метки transient, собранную «+» или старым сейвом) жест не разрушает.
function dissolveSewnRhythmPair(st, sec, sq, dragIdx) {
  if (!st || !sq || !Array.isArray(sq.events)) return;
  if (!Number.isInteger(dragIdx) || dragIdx < 0 || dragIdx >= sq.events.length) return;
  const r0 = st.refs.get(rhythmRefKey(sec.id, sq.id, dragIdx));
  if (!r0) return;
  const roll = st.pool[r0.roll];
  if (!roll || !roll.transient) return;
  let users = 0;
  for (const r of st.refs.values()) if (r.roll === r0.roll) users++;
  if (users < 2) return;
  const offs = squareEventOffsets(sq);
  for (let i = 0; i < sq.events.length; i++) {
    const key = rhythmRefKey(sec.id, sq.id, i);
    const ref = st.refs.get(key);
    if (!ref || ref.roll !== r0.roll) continue;
    const win = rhythmRollWindowFor(sec.id, sq, i, st);
    if (!win || !Array.isArray(win.steps) || !win.steps.length) continue;
    const nid = mintRhythmRollId(st);
    st.pool[nid] = { mode: win.mode, subdivision: win.subdivision, steps: cloneRhythmSteps(win.steps) };
    st.refs.set(key, { roll: nid, anchor: offs[i] });
  }
  gcRhythmRolls(st);
  // Волна-6: свежие приватные рулоны сразу канонизируются — лента
  // цепочки жила на общей подсетке (обычно мельче нужного отдельной
  // ячейке), и без уплотнения каждая наследовала бы её перегруженной.
  regridSquareRollsToFit(sec, sq);
}
"""
src = src[:i0] + new_dissolve + src[i1:]
print('ok  4. растворение по цепочке + канонизация на выходе')

# ---------- 5. coarsenRhythmRoll перед regridSquareRollsToFit ----------
coarsen_anchor = '// Кратное утончение сетки рулона, когда граница хотя бы одного окна этого\n// квадрата сошла с его шага'
must(src.count(coarsen_anchor) == 1, 'якорь вставки coarsen')
coarsen_fn = """// Канонизация сетки рулона (волна-6): укрупнение до самой грубой сетки,
// на которую БЕЗ ПОТЕРЬ ложатся контент (каждый непустой шаг стоит на
// позиции, кратной коэффициенту укрупнения, между ними — только пустые)
// и геометрия окон (доли и расстояния от якоря — целые на кандидатной
// сетке), причём длина ленты делится нацело, чтобы не сместить фазу
// заворота. Звук не меняется НИКОГДА: окна читают ту же
// последовательность ударов. Зачем: ресайз умеет сетку только утончать
// (x2/x4/x8 до 24), и без обратного хода один шестнадцаточный сдвиг
// навсегда помечал ритм шестнадцатыми, хотя следующий такой же сдвиг
// снова укладывался в восьмые (замечание пользователя 2026-08:
// «перегружено и нелогично»). Выбранное руками дробление в редакторе
// сюда не попадает: функцию зовёт только механика ресайза/растворения.
function coarsenRhythmRoll(roll, fits) {
  if (!roll || !Array.isArray(roll.steps) || !roll.steps.length) return;
  const sub = Math.max(1, roll.subdivision || 1);
  if (sub <= 1) return;
  const restLike = (v) => v == null || v === '_' || (Array.isArray(v) && v.length === 0);
  for (let cand = 1; cand < sub; cand++) {
    if (sub % cand !== 0) continue;
    const k = sub / cand;
    if (roll.steps.length % k !== 0) continue;
    let contentOk = true;
    for (let i = 0; i < roll.steps.length; i++) {
      if (i % k === 0) continue;
      if (!restLike(roll.steps[i])) { contentOk = false; break; }
    }
    if (!contentOk) continue;
    if (fits && !fits(cand)) continue;
    const out = [];
    for (let i = 0; i < roll.steps.length; i += k) {
      const v = roll.steps[i];
      out.push(Array.isArray(v) ? v.slice() : v);
    }
    roll.steps = out;
    roll.subdivision = cand;
    return;
  }
}

"""
src = src.replace(coarsen_anchor, coarsen_fn + coarsen_anchor)
print('ok  5. coarsenRhythmRoll вставлен')

# ---------- 6. Интеграция coarsen в regridSquareRollsToFit ----------
old_regrid = """    let sub = Math.max(1, roll.subdivision || 1);
    const fits = (s) => users.every((u) => {
      const span = (sq.events[u.i] && sq.events[u.i].span) || 1;
      return isInt(span * s) && isInt((offs[u.i] - u.ref.anchor) * s);
    });
    for (const k of [2, 4, 8]) {"""
new_regrid = """    let sub = Math.max(1, roll.subdivision || 1);
    const fits = (s) => users.every((u) => {
      const span = (sq.events[u.i] && sq.events[u.i].span) || 1;
      return isInt(span * s) && isInt((offs[u.i] - u.ref.anchor) * s);
    });
    // Волна-6: сначала пробуем укрупнить (обратный ход утончения —
    // сетка не застревает на мелком шаге после возврата границ).
    coarsenRhythmRoll(roll, fits);
    sub = Math.max(1, roll.subdivision || 1);
    for (const k of [2, 4, 8]) {"""
must(src.count(old_regrid) == 1, 'интеграция coarsen в regrid')
src = src.replace(old_regrid, new_regrid)
print('ok  6. regrid: coarsen перед утончением')

# ---------- 7. Шапка: раздача по сети -> хостинг + PWA ----------
old_head = """    <!-- ===== Установка на «Экран Домой» (iPhone/iPad) =====
         Safari на iOS НЕ открывает локальные html-файлы, а встроенный
         просмотрщик в «Файлах» с 2019 года не выполняет JavaScript —
         Apple отключила его из соображений безопасности. Поэтому
         приложение раздаётся по сети с компьютера, а на планшет
         ставится ярлыком: «Поделиться» → «На экран Домой».
         Иконка и метатеги ниже нужны именно для этого. Всё встроено
         в файл (data:), внешних запросов не появляется. -->"""
new_head = """    <!-- ===== Установка на «Экран Домой» (iPhone/iPad) =====
         Safari на iOS НЕ открывает локальные html-файлы, а встроенный
         просмотрщик в «Файлах» с 2019 года не выполняет JavaScript —
         Apple отключила его из соображений безопасности. Поэтому файл
         выкладывается на хостинг (у нас — GitHub Pages, см. ЧИТАЙ_МЕНЯ.md
         рядом с файлом) и оттуда ставится ярлыком: «Поделиться» →
         «На экран Домой»; manifest.json + sw.js делают его полноценным
         PWA-приложением с офлайном после первого визита. (Исторический
         способ — раздача по локальной сети с компьютера — зафиксирован
         в README, с PWA он больше не нужен.)
         Иконка и метатеги ниже нужны именно для этого. Всё встроено
         в файл (data:), внешних запросов не появляется. -->"""
must(src.count(old_head) == 1, 'шапка комментария')
src = src.replace(old_head, new_head)
print('ok  7. шапка: хостинг + PWA')

# ---------- ГВАРДЫ ----------
for gone in ['sewRhythmPairAtBoundary']:
    must(src.count(gone) == 0, f'{gone} упоминается ещё где-то: {src.count(gone)}')
print('  имя sewRhythmPairAtBoundary исчезло полностью')
for alive in ['function sewRhythmChainAtBoundary', 'function coarsenRhythmRoll',
              'sewRhythmChainAtBoundary(st, sec, sq, dragIdx, startSpans);',
              'function dissolveSewnRhythmPair', '_clearedKeys',
              'coarsenRhythmRoll(roll, fits);']:
    must(src.count(alive) >= 1, f'нет {alive}')
    print(f'  живо: {alive}')

io.open(PATH, 'w', encoding='utf-8', errors='surrogateescape').write(src)
print(f'\nЗАПИСАНО. Было {orig_len} символов -> стало {len(src)} (дельта {len(src) - orig_len}).')
