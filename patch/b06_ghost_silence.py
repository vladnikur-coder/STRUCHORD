#!/usr/bin/env python3
# B-06 (2026-08-26): ресайз — пустой бой при необъявленном бое секции не
# материализуется кастомным. Финал: дематериализация (ссылки и рулона нет,
# удар-в-начале возвращается). Правило одно: пустое звучащее окно + у секции
# нет явного общего боя = боя нет; бой был и уехал — тост, как выбивающиеся
# волны-6. «Не объявлен» — только явный бой СЕКЦИИ. Промежуточный показ при
# протяжке прячем. Тишина при объявленном бое секции живёт (волна-7).
# Идемпотентно: при наличии маркера isGhostSilenceCell патч пропускается.
import io, sys

P = '/home/user/STRUCHORD.html'
with io.open(P, encoding='utf-8', errors='surrogateescape') as f:
    c = f.read()

if 'function isGhostSilenceCell(' in c:
    print('SKIP: патч B-06 уже применён (маркер isGhostSilenceCell на месте)')
    sys.exit(0)

reps = []

# --- A. Помощники: объявленный бой секции + призрачная тишина ---------------
reps.append((
"""// Снятие пинов, совпавших со звучанием фасада, в одном квадрате.
// Возвращает число снятых. Фасад — ТОЛЬКО явный бой секции, заданный""",
"""// ---------- ПРИЗРАЧНАЯ ТИШИНА (B-06, 2026-08-26) ----------
// Спека пользователя: «ещё про ресайз: если общий бой секции не обьявлен,
// а в резуьтате ресайза оказалось, что у ячейки бой пустой, то он не должен
// магическим образом появляться и показываться как кастомный». Решения
// ask_user: финал — дематериализация (ссылки и рулона нет вообще, ячейка
// как до жеста: удар-в-начале возвращается — принятый в волне-5 регресс
// отменён); правило одно — пустое звучащее окно + у секции нет явного
// общего боя = боя нет (бой БЫЛ и уехал к соседям — с уведомлением, как
// выбивающиеся волны-6); «не объявлен» — только про явный бой СЕКЦИИ
// (дословно: «рисунка квадрата не существует, мы отменили эту концепцию.
// общий ритм можно задать только для секции, больше никак» — снос фасада
// квадрата вынесен в чистку-4, B-18); промежуточный показ при протяжке
// тоже прячем. Тишина при ОБЪЯВЛЕННОМ бое секции — не призрак: она глушит
// общий бой, осмысленна и живёт (волна-7).
function sectionRhythmDeclared(sec) {
  const p = sec && sec.strumPattern;
  return !!(p && Array.isArray(p.steps) && p.steps.length);
}

// Звучащее содержимое ячейки целиком пустое (окно пула либо легаси-
// вкрапление), а у секции явного общего боя нет: такая тишина ничего не
// глушит — показывать её кастомом нельзя и хранить отдельным рулоном
// бессмысленно. Пустая ячейка без рисунка — НЕ призрак (ему нечем быть).
function isGhostSilenceCell(sec, sq, ei) {
  if (!sec || !sq || !(sq.events || [])[ei]) return false;
  if (sectionRhythmDeclared(sec)) return false;
  const win = songRhythmRolls ? rhythmRollWindowFor(sec.id, sq, ei, songRhythmRolls) : null;
  const pat = win || sq.events[ei].strumPattern;
  if (!pat || !Array.isArray(pat.steps) || !pat.steps.length) return false;
  return soundingHitsMap(pat).size === 0;
}

// Снятие приватных пинов-тишин (B-06). Тишину внутри честной связки
// (рулон общий, авторский контент) не трогаем: снимаем только рулоны,
// которыми владеет ровно одна ячейка, — такие создавал ресайз до B-06.
// Звук меняется: паузы записанной тишины -> удар-в-начале, как у обычной
// пустой ячейки (планировщик, plainHitRhythm).
function dematerializeGhostSilenceInSquare(sec, sq) {
  const st = songRhythmRolls;
  if (!st || !sec || !sq || !Array.isArray(sq.events)) return 0;
  if (sectionRhythmDeclared(sec)) return 0;
  let dropped = 0;
  for (let i = 0; i < sq.events.length; i++) {
    const key = rhythmRefKey(sec.id, sq.id, i);
    const ref = st.refs.get(key);
    if (!ref || !st.pool[ref.roll]) continue;
    let users = 0;
    for (const r of st.refs.values()) if (r.roll === ref.roll) users++;
    if (users !== 1) continue;
    const win = rhythmRollWindowFor(sec.id, sq, i, st);
    if (!win || soundingHitsMap(win).size) continue;
    st.refs.delete(key);
    collapseOrphanRhythmRoll(st, sec, sq, ref.roll);
    dropped++;
  }
  if (dropped) gcRhythmRolls(st);
  return dropped;
}

function dematerializeGhostSilenceInSection(sec) {
  if (!sec) return 0;
  let n = 0;
  for (const sq of sec.squares || []) n += dematerializeGhostSilenceInSquare(sec, sq);
  return n;
}

function dematerializeGhostSilenceInSong() {
  let n = 0;
  for (const sec of sections) n += dematerializeGhostSilenceInSection(sec);
  return n;
}

// Снятие пинов, совпавших со звучанием фасада, в одном квадрате.
// Возвращает число снятых. Фасад — ТОЛЬКО явный бой секции, заданный"""))

# --- B1. Журнал ячеек со звуком (для тоста в dissolve) ----------------------
reps.append((
"""  const seen = new Set();
  oldRolls.forEach((rid) => {
    const rl = st.pool[rid];
    if (rl && rl.transient && Array.isArray(rl._clearedKeys)) rl._clearedKeys.forEach((k) => seen.add(k));
  });""",
"""  const seen = new Set();
  oldRolls.forEach((rid) => {
    const rl = st.pool[rid];
    if (rl && rl.transient && Array.isArray(rl._clearedKeys)) rl._clearedKeys.forEach((k) => seen.add(k));
  });
  // B-06: журнал ячеек, пришедших в ленту СО ЗВУКОМ (замороженный кусок
  // непустой). Растворение молча снимает только изначально пустые пины;
  // за потерянный бой — уведомление, как у выбивающихся. Пересшивка при
  // росте охвата журнал наследует — как журнал показанных тостов.
  // Выбивающиеся сюда не попадают: своё уведомление они уже получили.
  const sounded = new Set();
  oldRolls.forEach((rid) => {
    const rl = st.pool[rid];
    if (rl && rl.transient && Array.isArray(rl._soundedKeys)) rl._soundedKeys.forEach((k) => sounded.add(k));
  });
  for (let i = iMin; i <= iMax; i++) {
    if (outliers.has(i)) continue;
    const tape = tapes[i - iMin];
    if (tape && soundingHitsMap(tape).size) sounded.add(keys[i - iMin]);
  }"""))

# --- B2. Рулон ленты несёт журнал звучащих ----------------------------------
reps.append((
"""  st.pool[id] = { mode: chainMode, subdivision: g, steps, transient: true, _clearedKeys: [...seen] };""",
"""  st.pool[id] = { mode: chainMode, subdivision: g, steps, transient: true, _clearedKeys: [...seen], _soundedKeys: [...sounded] };"""))

# --- C. Растворение: призрачная тишина не материализуется -------------------
reps.append((
"""    const win = rhythmRollWindowFor(sec.id, sq, i, st);
    if (!win || !Array.isArray(win.steps) || !win.steps.length) continue;
    const nid = mintRhythmRollId(st);""",
"""    const win = rhythmRollWindowFor(sec.id, sq, i, st);
    if (!win || !Array.isArray(win.steps) || !win.steps.length) continue;
    // B-06: пустой бой при необъявленном бое секции не записывается —
    // «магического» кастома нет: ссылку снимаем, приватный рулон не
    // создаём, ячейка снова без своего рисунка (удар-в-начале
    // возвращается). Бой БЫЛ и уехал к соседям — уведомление.
    if (!sectionRhythmDeclared(sec) && soundingHitsMap(win).size === 0) {
      st.refs.delete(key);
      if (Array.isArray(roll._soundedKeys) && roll._soundedKeys.includes(key)
          && typeof showToast === 'function')
        showToast(`Ритм ячейки ${i + 1} очищен: в окне не осталось ни одного удара`);
      continue;
    }
    const nid = mintRhythmRollId(st);"""))

# --- C2. Шапка растворения: строчка про B-06 --------------------------------
reps.append((
"""// старой геометрии дают ровно исходные куски. Честную связку (рулон без
// метки transient, собранную «+» или старым сейвом) жест не разрушает.""",
"""// старой геометрии дают ровно исходные куски. Честную связку (рулон без
// метки transient, собранную «+» или старым сейвом) жест не разрушает.
// B-06: при необъявленном бое секции ячейки с целиком пустым окном
// приватный рулон НЕ получают (дематериализация, см. ниже) — но журнал
// звучащих ленты (_soundedKeys) отличает «пустая была всегда» (молча)
// от «бой уехал к соседям» (тост)."""))

# --- D. Показ кастома на ячейке: призрак не считается -----------------------
reps.append((
"""        // Волна-4: «свой ритм» у ячейки = ссылка на рулон (кэша нет);
        // встроенный рисунок здесь — легаси-вкрапление (выливка).
        const hasOwnRhythm = !!(ev.strumPattern
          || (songRhythmRolls && songRhythmRolls.refs.has(`${sec.id}:${sq.id}:${ei}`)));""",
"""        // Волна-4: «свой ритм» у ячейки = ссылка на рулон (кэша нет);
        // встроенный рисунок здесь — легаси-вкрапление (выливка).
        // B-06: призрачная тишина кастомом не считается — ни в финале,
        // ни по дороге (ссылка сшитой ленты при протяжке жива, но пустое
        // окно плашкой не светим).
        const hasOwnRhythm = !!(ev.strumPattern
          || (songRhythmRolls && songRhythmRolls.refs.has(`${sec.id}:${sq.id}:${ei}`)))
          && !isGhostSilenceCell(sec, sq, ei);"""))

# --- E. Мини-превью боя: призрака не рисуем ----------------------------------
reps.append((
"""    const rollWinCell = songRhythmRolls ? rhythmRollWindowFor(secId, sq, ei, songRhythmRolls) : null;
    const cellPattern = rollWinCell || (ev && ev.strumPattern);
    if (!ev || !cellPattern) return;""",
"""    const rollWinCell = songRhythmRolls ? rhythmRollWindowFor(secId, sq, ei, songRhythmRolls) : null;
    const cellPattern = rollWinCell || (ev && ev.strumPattern);
    if (!ev || !cellPattern) return;
    // B-06: призрачную тишину превью не рисуем — ни в финале, ни по
    // дороге (окно сшитой ленты при протяжке бывает целиком пустым).
    if (isGhostSilenceCell(sec, sq, ei)) return;"""))

# --- F. Возврат превью после воспроизведения ---------------------------------
reps.append((
"""  const rollWinCell = sq && songRhythmRolls ? rhythmRollWindowFor(secId, sq, ei, songRhythmRolls) : null;
  const cellPattern = rollWinCell || (ev && ev.strumPattern);
  if (!ev || !cellPattern) {
    box.parentElement?.classList.remove('has-cell-rhythm');
    return;
  }""",
"""  const rollWinCell = sq && songRhythmRolls ? rhythmRollWindowFor(secId, sq, ei, songRhythmRolls) : null;
  const cellPattern = rollWinCell || (ev && ev.strumPattern);
  // B-06: призрачная тишина и здесь не показывается (иначе после стопа
  // воспроизведения превью пауз вернулось бы на место).
  if (!ev || !cellPattern || isGhostSilenceCell(sec, sq, ei)) {
    box.parentElement?.classList.remove('has-cell-rhythm');
    return;
  }"""))

# --- G. Загрузка файла: призраки из старых сейвов дематериализуем ------------
reps.append((
"""    demoteMatchingCellRhythmsInSong();
    updateCachedMeasuresForTimeSig(globalTimeSig);""",
"""    demoteMatchingCellRhythmsInSong();
    // B-06: призрачные пины-тишины из старых сейвов (ресайз до B-06
    // записывал пустой бой кастомным) дематериализуем: у секции без
    // явного боя они ничего не глушили. Звук: возвращается
    // удар-в-начале (отмена принятой в волне-5 регрессии).
    dematerializeGhostSilenceInSong();
    updateCachedMeasuresForTimeSig(globalTimeSig);"""))

# --- H. Сброс боя секции: глушившие его пины-тишины стали призраками ---------
reps.append((
"""  modal.querySelector('#reset-pattern').onclick = () => {
    if (scope === 'section') {
      sec.strumPattern = null;
      setSectionRhythmRoll(sec, null);""",
"""  modal.querySelector('#reset-pattern').onclick = () => {
    if (scope === 'section') {
      sec.strumPattern = null;
      setSectionRhythmRoll(sec, null);
      // B-06: общего боя больше нет — пины-тишины, глушившие его, стали
      // призраками: дематериализуем, иначе останется скрытое состояние
      // (показ плашки выключен, а тишина в звуке продолжала бы жить).
      dematerializeGhostSilenceInSection(sec);"""))

# --- I. Документация ленты: строчка про судьбу тишины -----------------------
reps.append((
"""//  * пустая ячейка (рисунка нет вообще) — лента тишины;""",
"""//  * пустая ячейка (рисунка нет вообще) — лента тишины (B-06: при
//    отпускании такая тишина при необъявленном бое секции
//    дематериализуется — кастомом не показывается и не хранится);"""))

fail = 0
for old, new in reps:
    n = c.count(old)
    if n != 1:
        print('FAIL: якорь встречается %d раз (нужен 1): %s...' % (n, old[:70].replace('\n', ' | ')))
        fail += 1
        continue
    c = c.replace(old, new, 1)

if fail:
    print('Патч НЕ применён: %d якорей не совпали' % fail)
    sys.exit(1)

with io.open(P, 'w', encoding='utf-8', errors='surrogateescape') as f:
    f.write(c)
print('OK: патч B-06 применён, якорей: %d' % len(reps))
