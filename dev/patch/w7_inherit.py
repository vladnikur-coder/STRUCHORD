#!/usr/bin/env python3
# Волна-7 (2026-08-25): автонаследование. Совпавший с фасадом (боем секции)
# пин ячейки снимается, ячейка снова наследует общий ритм.
# Решения ask_user: trig_all (4 события), crit_sound (по звуку, не по записи),
# facade_no (без явного боя правило спит), scope custom: «рисунка квадрата
# не существует, мы отменили эту фичу» — область только пины ячеек.
import io

PATH = '/home/user/STRUCHORD.html'
src = io.open(PATH, 'r', encoding='utf-8', errors='surrogateescape').read()
orig_len = len(src)

def must(expr, label):
    assert expr, 'ГВАРД: ' + label

helper = '''// ---------- АВТОНАСЛЕДОВАНИЕ (волна-7, 2026-08) ----------
// Спека пользователя: «если ритм ячейки полностью совпадает с ритмом
// секции, то он не должен считаться кастомным... кастомный ритм внутри
// этой ячейки должен удаляться, а ячейка наследовать общий ритм секции».
// Решения ask_user: проверка на всех четырёх событиях (сейв из редактора,
// отпускание ручки протяжки, установка боя секции, загрузка файла);
// критерий совпадения — по ЗВУКУ (позиции и типы ударов побитово,
// плотность записи безразлична); без явного боя у фасада правило спит
// («один удар» при пустой секции — не совпадение); область — только пины
// ячеек (уровень «рисунок квадрата» отменён; его поле живёт ради старых
// сейвов и участвует в фасаде само по себе).
// Тишина волны-5 не пострадает: заводской фасад пустой секции (один удар)
// ей не равен, а секция из одних пауз — совпадение честное.

// Разбор окна в карту ударов «позиция -> символ» без привязки к плотности
// записи: позиция — дробью (шаг/сетка), символ перебора — отсортированным
// набором струн (порядок внутри щипка косметический, на звук не влияет).
function soundingHitsMap(win) {
  const map = new Map();
  if (!win || !Array.isArray(win.steps)) return map;
  const sub = Math.max(1, win.subdivision || 1);
  win.steps.forEach((sym, k) => {
    let key = null;
    if (typeof sym === 'number' && sym >= 1 && sym <= 6) key = String(sym);
    else if (Array.isArray(sym)) {
      if (!sym.length) return;
      key = sym.map(Number).filter((n) => n >= 1 && n <= 6).sort((a, b) => a - b).join('+');
      if (!key) return;
    } else if (sym === 'D' || sym === 'U' || sym === 'X') key = sym;
    else return; // '_'/null/битый слот — пауза
    map.set(k + '/' + sub, key);
  });
  return map;
}

// Звучание двух окон совпадает побитово: одинаковая длина полосы в долях
// (это одна и та же ячейка — доли общие) и те же удары на тех же
// позициях. Позиции сравниваем перекрёстным умножением знаменателей —
// без плавающей точки.
function soundingWindowsEqual(a, b) {
  if (!a || !b) return false;
  const sa = Math.max(1, a.subdivision || 1), sb = Math.max(1, b.subdivision || 1);
  if (Math.abs(a.steps.length / sa - b.steps.length / sb) > 1e-9) return false;
  const ha = soundingHitsMap(a), hb = soundingHitsMap(b);
  if (ha.size !== hb.size) return false;
  for (const [pos, sym] of ha) {
    const [pn, pd] = pos.split('/').map(Number);
    let found = false;
    for (const [pos2, sym2] of hb) {
      const [qn, qd] = pos2.split('/').map(Number);
      if (pn * qd === qn * pd && sym === sym2) { found = true; break; }
    }
    if (!found) return false;
  }
  return true;
}

// Снятие пинов, совпавших со звучанием фасада, в одном квадрате.
// Возвращает число снятых. Фасада нет (секция без боя, и квадрата из
// старого сейва тоже) — правило спит, ничего не трогаем (facade_no).
function demoteMatchingCellRhythms(sec, sq) {
  const st = songRhythmRolls;
  if (!st || !sec || !sq || !Array.isArray(sq.events)) return 0;
  if (!getEffectiveStrumPattern(null, sq, sec)) return 0;
  let dropped = 0;
  for (let i = 0; i < sq.events.length; i++) {
    const key = rhythmRefKey(sec.id, sq.id, i);
    const ref = st.refs.get(key);
    if (!ref) continue;
    const own = rhythmRollWindowFor(sec.id, sq, i, st);
    const facade = facadeSlicePattern(sec, sq, sq.events[i], i);
    if (!own || !facade) continue;
    if (!soundingWindowsEqual(own, facade)) continue;
    // Пин снимаем — окно уже звучит ровно как фасад: ячейка переходит на
    // наследование без изменения звука, и дальше следует за боем секции.
    st.refs.delete(key);
    collapseOrphanRhythmRoll(st, sec, sq, ref.roll);
    dropped++;
  }
  if (dropped) gcRhythmRolls(st);
  return dropped;
}

// То же по всей секции (правка её боя) и по всей песне (загрузка файла).
function demoteMatchingCellRhythmsInSection(sec) {
  if (!sec) return 0;
  let n = 0;
  for (const sq of sec.squares || []) n += demoteMatchingCellRhythms(sec, sq);
  return n;
}
function demoteMatchingCellRhythmsInSong() {
  let n = 0;
  for (const sec of sections) n += demoteMatchingCellRhythmsInSection(sec);
  return n;
}

'''

anchor1 = '// Точечная правка секционного рулона (волна-4): секционный бой меняет'
must(src.count(anchor1) == 1, 'якорь вставки хелпера')
src = src.replace(anchor1, helper + anchor1)
print('ok  1. хелпер автонаследования вставлен')

anchor2 = '      saveEventPatternToRhythmRoll(sec, sq, evt, sectionId, squareId, eventIndex, saved, subSave);\n'
must(src.count(anchor2) == 1, 'триггер: сейв из редактора')
src = src.replace(anchor2, anchor2 +
  '      // Волна-7: окна, совпавшие с боем секции, пинов не носят — сверяем\n' +
  '      // весь квадрат (правка общего рулона могла совпасть и у соседей).\n' +
  '      demoteMatchingCellRhythms(sec, sq);\n')
print('ok  2. триггер: сейв из редактора (ячейка)')

anchor3 = '      setSectionRhythmRoll(sec, saved);\n'
must(src.count(anchor3) == 1, 'триггер: установка боя секции')
src = src.replace(anchor3, anchor3 +
  '      // Волна-7: пины, совпавшие с НОВЫМ боем секции, сдаются — ячейки\n' +
  '      // снова наследуют секцию (звук не меняется на месте).\n' +
  '      demoteMatchingCellRhythmsInSection(sec);\n')
print('ok  3. триггер: установка боя секции')

anchor4 = '        dissolveSewnRhythmPair(songRhythmRolls, s, sq, ei);\n'
must(src.count(anchor4) == 1, 'триггер: отпускание ручки')
src = src.replace(anchor4, anchor4 +
  '        // Волна-7: итоговые окна, совпавшие с боем секции, распускаются\n' +
  '        // в наследование — пинов больше нет, ячейки следуют за секцией.\n' +
  '        demoteMatchingCellRhythms(s, sq);\n')
print('ok  4. триггер: отпускание ручки (onUp)')

anchor5 = '    stripEventRhythmCache();\n'
must(src.count(anchor5) == 1, 'триггер: загрузка файла')
src = src.replace(anchor5, anchor5 +
  '    // Волна-7: совпавшие с боем секции пины из файла распускаем при\n' +
  '    // загрузке — ячейка наследует секцию; звуковое содержимое песни\n' +
  '    // не меняется (окна и так совпадали посимвольно).\n' +
  '    demoteMatchingCellRhythmsInSong();\n')
print('ok  5. триггер: загрузка файла')

old_comment = """// Приоритет: своя ячейка > секция по умолчанию. (Уровень "свой бой
// квадрата" убран как избыточный — sq здесь оставлен только ради
// сигнатуры вызовов, но не используется.)"""
new_comment = """// Приоритет: своя ячейка > рисунок квадрата > секция по умолчанию.
// Уровень «рисунок квадрата» из UI убран давно (редакторская ветка
// scope='square' недостижима — ни один вызов её не открывает), но поле
// sq.strumPattern читаем: оно приезжает в старых сейвах, и его фасад
// продолжает работать, пока такой файл живёт в песне."""
must(src.count(old_comment) == 1, 'протухший комментарий приоритета')
src = src.replace(old_comment, new_comment)
print('ok  6. комментарий приоритета приведён к реальности')

for alive in ['function demoteMatchingCellRhythms(', 'function demoteMatchingCellRhythmsInSection(',
              'function demoteMatchingCellRhythmsInSong(', 'function soundingWindowsEqual(',
              'demoteMatchingCellRhythms(sec, sq);', 'demoteMatchingCellRhythmsInSection(sec);',
              'demoteMatchingCellRhythmsInSong();', 'demoteMatchingCellRhythms(s, sq);']:
    must(src.count(alive) >= 1, f'нет {alive}')
    print(f'  живо: {alive}')

io.open(PATH, 'w', encoding='utf-8', errors='surrogateescape').write(src)
print(f'\nЗАПИСАНО. Было {orig_len} -> стало {len(src)} (дельта {len(src) - orig_len}).')
