# -*- coding: utf-8 -*-
# Чистка-2 (B-02, 2026-08-25): вырезание мёртвых веток scope='square' в
# редакторе паттерна. Основание: фича «рисунок квадрата» отменена решением
# пользователя в волне-7; ни один вызов openStrumPatternEditor не передаёт
# 'square' (проверено grep: вызовы только 'section' — 21678/21710/24711/27492
# и 'event' — 27342, нумерация до правки). Поле sq.strumPattern НЕ трогаем:
# оно живёт ради старых сейвов и фасада getEffectiveStrumPattern.
import io

p = '/home/user/STRUCHORD.html'
s = io.open(p, encoding='utf-8', errors='surrogateescape').read()
applied = []

def rep(name, old, new):
    global s
    c = s.count(old)
    assert c == 1, (name, c)
    s = s.replace(old, new)
    applied.append(name)

# 1. Комментарий у getEffectiveStrumPattern: фиксируем вырезку.
rep('doc-getEffective',
"""// Приоритет: своя ячейка > рисунок квадрата > секция по умолчанию.
// Уровень «рисунок квадрата» из UI убран давно (редакторская ветка
// scope='square' недостижима — ни один вызов её не открывает), но поле
// sq.strumPattern читаем: оно приезжает в старых сейвах, и его фасад
// продолжает работать, пока такой файл живёт в песне.""",
"""// Приоритет: своя ячейка > рисунок квадрата > секция по умолчанию.
// Уровень «рисунок квадрата» отменён решением пользователя (волна-7),
// а его ветки scope='square' в редакторе вырезаны чисткой-2 (B-02,
// 2026-08-25 — ни один вызов их не открывал). Поле sq.strumPattern
// читаем: оно приезжает в старых сейвах, и его фасад продолжает
// работать, пока такой файл живёт в песне.""")

# 2. Комментарий блока РЕДАКТОР ПАТТЕРНА.
rep('doc-editor-block',
"""// ---------- РЕДАКТОР ПАТТЕРНА (модалка) ----------
// scope: 'section' — редактируем sec.strumPattern (значение по умолчанию для
// всех квадратов секции); 'square' — редактируем sq.strumPattern (личное
// переопределение конкретного квадрата, с возможностью сброса к секции).""",
"""// ---------- РЕДАКТОР ПАТТЕРНА (модалка) ----------
// scope: 'section' — редактируем sec.strumPattern (значение по умолчанию для
// всех квадратов секции); 'event' — переопределение конкретной ячейки.
// scope 'square' отменён (волна-7) и вырезан чисткой-2 (B-02).""")

# 3. Док openStrumPatternEditor.
rep('doc-open',
"""// scope: 'section' — по умолчанию для всех квадратов секции;
//        'square'  — переопределение для конкретного квадрата;
//        'event'   — переопределение для конкретной ячейки (аккорда).
// Приоритет при воспроизведении: event > square > section.""",
"""// scope: 'section' — по умолчанию для всех квадратов секции;
//        'event'   — переопределение для конкретной ячейки (аккорда).
// Приоритет при воспроизведении: event > square > section. Третьего
// scope нет (чистка-2, B-02): 'square' был недостижим из UI.""")

# 4. Поиск квадрата: квадрат нужен только ячейке.
rep('sq-lookup',
"""  const sq = scope === 'square' || scope === 'event' ? sec.squares.find((s) => s.id === squareId) : null;
  if ((scope === 'square' || scope === 'event') && !sq) return;""",
"""  const sq = scope === 'event' ? sec.squares.find((s) => s.id === squareId) : null;
  if (scope === 'event' && !sq) return;""")

# 5. Свой существующий рисунок.
rep('ownExisting',
"  const ownExisting = scope === 'event' ? (ownEventWin || evt.strumPattern) : scope === 'square' ? sq.strumPattern : sec.strumPattern;",
"  const ownExisting = scope === 'event' ? (ownEventWin || evt.strumPattern) : sec.strumPattern;")

# 6. Наследуемый рисунок (для показа задником).
rep('inherited',
"""  const inherited =
    scope === 'event' ? getEffectiveStrumPattern(null, sq, sec) : scope === 'square' ? sec.strumPattern : null;""",
"""  const inherited =
    scope === 'event' ? getEffectiveStrumPattern(null, sq, sec) : null;""")

# 7. Подпись области и кнопки сброса в шапке модалки.
rep('labels',
"""  const scopeLabel =
    scope === 'section'
      ? 'по умолчанию для всей секции'
      : scope === 'square'
      ? 'только для этого квадрата (иначе используется бой секции)'
      : 'только для этой ячейки (иначе бой квадрата/секции)';
  const resetLabel = scope === 'section' ? 'Убрать паттерн' : scope === 'square' ? 'Сбросить к секции' : 'Сбросить к квадрату/секции';""",
"""  const scopeLabel =
    scope === 'section'
      ? 'по умолчанию для всей секции'
      : 'только для этой ячейки (иначе бой квадрата/секции)';
  const resetLabel = scope === 'section' ? 'Убрать паттерн' : 'Сбросить к квадрату/секции';""")

# 8. Фильтр «рисунок уже в песне».
rep('editedOwnPattern',
"  const editedOwnPattern = scope === 'event' ? evt.strumPattern : scope === 'square' ? sq.strumPattern : sec.strumPattern;",
"  const editedOwnPattern = scope === 'event' ? evt.strumPattern : sec.strumPattern;")

# 9. Сейв: ветка квадрата.
rep('save-branch',
"""    } else if (scope === 'square') {
      sq.strumPattern = saved;
    } else {""",
"""    } else {""")

# 10. Сброс: ветка квадрата.
rep('reset-branch',
"""    } else if (scope === 'square') {
      sq.strumPattern = null;
    } else {""",
"""    } else {""")

# 11. Тост сброса.
rep('reset-toast',
"""    showToast(
      scope === 'section'
        ? 'Паттерн секции убран'
        : scope === 'square'
        ? 'Квадрат снова наследует бой секции'
        : 'Ячейка снова наследует бой квадрата/секции'
    );""",
"""    showToast(
      scope === 'section'
        ? 'Паттерн секции убран'
        : 'Ячейка снова наследует бой квадрата/секции'
    );""")

io.open(p, 'w', encoding='utf-8', errors='surrogateescape').write(s)
print('применено якорей: %d/11:' % len(applied))
for a in applied:
    print('  ok', a)
