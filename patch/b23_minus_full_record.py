# B-23 (2026-08-27): «−» со стороны пиннатого поглотителя терял звук
# удалённой соседки: лента поглотителя крутилась по кругу на новое окно,
# а реально звучавшая там музыка умирала. Спека (дословно): «общий бой
# секции D_DU_UDU; у первой ячейки кастомный бой D_XU_UXU; я нажимаю минус
# на второй ячейке; у получившейся ячейки должен быть бой D_XU_UXUD_DU_UDU».
# Решения ask_user: full_record — сшивать звучавшее по обеим половинам
# всегда (кастом+фасад, кастом+чужой кастом, зеркало B-20); stays_facade —
# пара без ссылок остаётся чистым фасадом. Пин ставим только если он меняет
# звук (soundingWindowsEqual с пост-проекцией). Честная связка (обе ссылки
# на одном рулоне) не трогается — ленту собирает механика окна в collapse.
# Уточнение: половина без звучащего рисунка (sounding == null) на
# таймлайне играет ЗАВОДСКОЙ один удар в начале окна (канон таймлайна:
# selfCheck/promo подставляют plainHitRhythm) — записываем его, а не
# тишину и не прокрутку чужой кассеты.
# Идемпотентно: якоря не найдены -> пропуск.
import io, sys

PATH = 'STRUCHORD.html'

ANCHOR1_OLD = """  let adoptAnchor = 0;
  if (st && removedRef && !absorbRef && absorbIdx >= 0) {"""
ANCHOR1_NEW = """  let adoptAnchor = 0;
  // B-23 (2026-08-27): сшивка теперь работает в ОБЕ стороны. До этого
  // условие removedRef && !absorbRef покрывало только безссылочного
  // поглотителя; поглотитель С пином прокручивал свою ленту по кругу на
  // поглощённое время, и звук удалённой соседки (её фасадное окно либо
  // её чужой рисунок) умирал молча. Теперь сшиваем из звучащих окон
  // обеих половин всегда, когда есть хоть одна ссылка. Исключения:
  // честная связка (removedRef и absorbRef на одном рулоне — её ленту
  // собирает механика окна в collapse ниже) и пара вообще без ссылок
  // (итог остаётся чистым фасадом по построению, stays_facade).
  const shareRoll = !!(removedRef && absorbRef && removedRef.roll === absorbRef.roll);
  if (st && (removedRef || absorbRef) && absorbIdx >= 0 && !shareRoll) {"""

ANCHOR2_OLD = """      if (adoptTape) {
        const adoptId = mintRhythmRollId(st);
        st.pool[adoptId] = { mode: adoptMode, subdivision: adoptSub, steps: adoptTape };
        st.refs.set(rhythmRefKey(sid, sqid, targetIndex), { roll: adoptId, anchor: adoptAnchor });
      }"""
ANCHOR2_NEW = """      if (adoptTape) {
        // B-23: пин ставим, только если он меняет звук. Когда сшитая
        // лента тождественна тому, что прозвучало бы и без неё (лента
        // поглотителя кратно циклится ровно в тот же рисунок; призрачный
        // кастом удалённой, равный продолжению фасада), рулон не
        // материализуем — философия B-06: сущностей без музыки не бывает.
        // Замер пост-проекции идёт по живой модели после splice/shift:
        // звук итога без пина считает сам движок, а не наша догадка.
        const adoptPattern = { mode: adoptMode, subdivision: adoptSub, steps: adoptTape };
        const postSound = rhythmSoundingForEvent(s, sq, target, targetIndex);
        if (!(postSound && soundingWindowsEqual(postSound, adoptPattern))) {
          const adoptId = mintRhythmRollId(st);
          st.pool[adoptId] = { mode: adoptMode, subdivision: adoptSub, steps: adoptTape };
          st.refs.set(rhythmRefKey(sid, sqid, targetIndex), { roll: adoptId, anchor: adoptAnchor });
        }
      }"""

# Якорь 3: первый вариант писал «пустую» половину тишиной — но таймлайн
# для sounding == null играет заводской удар (plainHitRhythm), и запись
# тишиной затирала бы этот удар (само нарушение красной линии). Финал:
# половина без рисунка входит в сшивку заводским ударом, как и звучала.
ANCHOR3_OLD = """    const winAbs = rhythmSoundingForEvent(s, sq, sq.events[absorbIdx], absorbIdx);
    const winRem = rhythmSoundingForEvent(s, sq, removed, ei);
    // B-23 уточнение: тихая половина (звучащего рисунка нет вовсе —
    // секция без боя, а заводский показ одного удара звучанием не
    // является) записывается в ленту явными паузами её длительности.
    // Иначе рулон поглотителя прокручивался бы на молчавшее время, и
    // удаление клетки НАБИВАЛО БЫ удары там, где стояла тишина.
    if (winAbs || winRem) {
      const sa = Math.max(1, (winAbs && winAbs.subdivision) || 1);
      const sb = Math.max(1, (winRem && winRem.subdivision) || 1);
      // Общая сетка — произведение дроблений; regridSquareRollsToFit
      // ниже уплотнит её до канонической.
      adoptSub = sa * sb;
      const modeAbs = (winAbs && winAbs.mode) || null;
      const modeRem = (winRem && winRem.mode) || null;
      adoptMode = (modeAbs && modeRem)
        ? (modeAbs === modeRem ? modeAbs : 'mixed')
        : (modeAbs || modeRem || 'strum');
      const silentStepsFor = (units) => {
        const n = Math.max(0, Math.round(units * adoptSub));
        const arr = new Array(n);
        for (let i = 0; i < n; i++) arr[i] = '_';
        return arr;
      };
      const absorbUnits = getEventSpanInParentUnits(sq.events[absorbIdx], parentTs);
      const absSteps = (winAbs && winAbs.steps && winAbs.steps.length)
        ? regridRhythmSteps(winAbs.steps, sa, adoptSub, winAbs.mode)
        : silentStepsFor(absorbUnits);
      const remSteps = (winRem && winRem.steps && winRem.steps.length)
        ? regridRhythmSteps(winRem.steps, sb, adoptSub, winRem.mode)
        : silentStepsFor(removedParentUnits);
      // Временной порядок частей: кто раньше — тот первый. Якорь —
      // начало будущего окна поглотителя (минимум оффсетов пары).
      const offsPre = squareEventOffsets(sq);
      adoptAnchor = Math.min(offsPre[ei], offsPre[absorbIdx]);
      const sewn = (offsPre[absorbIdx] <= offsPre[ei]
        ? absSteps.concat(remSteps)
        : remSteps.concat(absSteps));
      // Полностью тихую запись не материализуем: тишина и без рулона
      // звучит тишиной (та же философия B-06), сущностей без музыки нет.
      let anyHit = false;
      for (let i = 0; i < sewn.length; i++) {
        const step = sewn[i];
        if (step && step !== '_' && !(Array.isArray(step) && !step.length)) { anyHit = true; break; }
      }
      if (anyHit) adoptTape = sewn;
    }"""
ANCHOR3_NEW = """    const winAbsRaw = rhythmSoundingForEvent(s, sq, sq.events[absorbIdx], absorbIdx);
    const winRemRaw = rhythmSoundingForEvent(s, sq, removed, ei);
    if (winAbsRaw || winRemRaw) {
      // B-23 уточнение: звучащего рисунка у половины может не быть вовсе
      // (секция без боя) — но на таймлайне она играет ЗАВОДСКОЙ один
      // удар в начале окна (канон таймлайна: sounding == null ->
      // plainHitRhythm, как в selfCheck и проигрывателе). Записываем
      // ровно то, что звучало: не тишину (удар бы затёрся) и не
      // прокрутку чужой кассеты (удары бы набились).
      const absorbUnits = getEventSpanInParentUnits(sq.events[absorbIdx], parentTs);
      const winAbs = winAbsRaw
        || { mode: 'strum', subdivision: 1, steps: plainHitRhythm(absorbUnits, 1, 'strum').steps };
      const winRem = winRemRaw
        || { mode: 'strum', subdivision: 1, steps: plainHitRhythm(removedParentUnits, 1, 'strum').steps };
      const sa = Math.max(1, winAbs.subdivision || 1);
      const sb = Math.max(1, winRem.subdivision || 1);
      // Общая сетка — произведение дроблений; regridSquareRollsToFit
      // ниже уплотнит её до канонической.
      adoptSub = sa * sb;
      adoptMode = (winAbs.mode === winRem.mode ? winAbs.mode : 'mixed') || 'strum';
      const absSteps = regridRhythmSteps(winAbs.steps, sa, adoptSub, winAbs.mode);
      const remSteps = regridRhythmSteps(winRem.steps, sb, adoptSub, winRem.mode);
      // Временной порядок частей: кто раньше — тот первый. Якорь —
      // начало будущего окна поглотителя (минимум оффсетов пары).
      const offsPre = squareEventOffsets(sq);
      adoptAnchor = Math.min(offsPre[ei], offsPre[absorbIdx]);
      const sewn = (offsPre[absorbIdx] <= offsPre[ei]
        ? absSteps.concat(remSteps)
        : remSteps.concat(absSteps));
      // Полностью тихую запись не материализуем: тишина и без рулона
      // звучит тишиной (та же философия B-06), сущностей без музыки нет.
      let anyHit = false;
      for (let i = 0; i < sewn.length; i++) {
        const step = sewn[i];
        if (step && step !== '_' && !(Array.isArray(step) && !step.length)) { anyHit = true; break; }
      }
      if (anyHit) adoptTape = sewn;
    }"""

with io.open(PATH, 'r', encoding='utf-8', errors='surrogateescape') as f:
    src = f.read()

if src.count(ANCHOR1_OLD) == 0 and src.count(ANCHOR2_OLD) == 0 and src.count(ANCHOR3_OLD) == 0:
    print('B-23: якоря не найдены (уже применено?) — пропуск')
    sys.exit(0)
applied = []
if src.count(ANCHOR1_OLD) == 1:
    src = src.replace(ANCHOR1_OLD, ANCHOR1_NEW, 1)
    applied.append('условие в обе стороны')
else:
    assert 'shareRoll' in src, 'B-23: якорь 1 не найден и следов нет'
if src.count(ANCHOR2_OLD) == 1:
    src = src.replace(ANCHOR2_OLD, ANCHOR2_NEW, 1)
    applied.append('экономная установка пина')
else:
    assert 'soundingWindowsEqual(postSound, adoptPattern)' in src, 'B-23: якорь 2 не найден'
if src.count(ANCHOR3_OLD) == 1:
    src = src.replace(ANCHOR3_OLD, ANCHOR3_NEW, 1)
    applied.append('половина без рисунка — заводской удар')
else:
    assert 'plainHitRhythm(absorbUnits' in src, 'B-23: якорь 3 не найден'
assert applied, 'B-23: нечего применять'

with io.open(PATH, 'w', encoding='utf-8', errors='surrogateescape') as f:
    f.write(src)
print('B-23: применено — ' + '; '.join(applied))
