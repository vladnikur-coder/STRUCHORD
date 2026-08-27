# -*- coding: utf-8 -*-
# Волна-5, часть 2: потребители смешанной ленты (режим шага: массив —
# перебор, знак — бой) + валидация сейвов + редактор + бамп кэша sw.js.
import io

p = '/home/user/STRUCHORD.html'
t = io.open(p, encoding='utf-8', errors='surrogateescape').read()

# ---------- 1. Звук: пошаговый режим в смешанной ленте ----------
old = """      if (pattern.mode === 'pick') {
        // Басовые токены разворачиваем здесь, по аппликатуре ИМЕННО
        // этого аккорда — так один перебор секции ведёт бас за гармонией."""
new = """      // Смешанная лента (волна-5, решение mode_step): режим привязан к
      // шагу — массив/число щипаем перебором, знаки D/U/X/«_» играем
      // боем. Так соседи с разными типами ритма сшиваются без потерь.
      if (pattern.mode === 'pick' || (pattern.mode === 'mixed' && (Array.isArray(symbol) || typeof symbol === 'number'))) {
        // Басовые токены разворачиваем здесь, по аппликатуре ИМЕННО
        // этого аккорда — так один перебор секции ведёт бас за гармонией."""
assert t.count(old) == 1, 'C1 anchor not found/ambiguous'
t = t.replace(old, new, 1)

# ---------- 2. Превью: режим шага + бейдж ----------
old = "  modeBadge.textContent = pattern.mode === 'pick' ? 'Перебор' : 'Бой';"
new = "  modeBadge.textContent = pattern.mode === 'pick' ? 'Перебор' : pattern.mode === 'mixed' ? 'Бой+перебор' : 'Бой';"
assert t.count(old) == 1, 'C2 anchor not found/ambiguous'
t = t.replace(old, new, 1)

old = """  const hasMultiStringStep =
    pattern.mode === 'pick' && steps.some((s) => normalizePickStep(s).length > 1);"""
new = """  const hasMultiStringStep =
    (pattern.mode === 'pick' || pattern.mode === 'mixed') && steps.some((s) => normalizePickStep(s).length > 1);"""
assert t.count(old) == 1, 'C3 anchor not found/ambiguous'
t = t.replace(old, new, 1)

old = """    if (pattern.mode === 'pick') {
      const nums = normalizePickStep(s);
      if (nums.length) {
        stepEl.classList.add('pick');"""
new = """    // Смешанная лента (волна-5): щипковые шаги рисуем перебором,
    // знаковые — боем, независимо от режима всего рисунка.
    if (pattern.mode === 'pick' || (pattern.mode === 'mixed' && (Array.isArray(s) || typeof s === 'number'))) {
      const nums = normalizePickStep(s);
      if (nums.length) {
        stepEl.classList.add('pick');"""
assert t.count(old) == 1, 'C4 anchor not found/ambiguous'
t = t.replace(old, new, 1)

# ---------- 3. Дорожка ленты: режим шага ----------
old = """      el.className = 'tl-hit';
      if (pattern.mode === 'pick') {"""
new = """      el.className = 'tl-hit';
      // Смешанная лента (волна-5): режим читаем по шагу, как в звуке.
      if (pattern.mode === 'pick' || (pattern.mode === 'mixed' && (Array.isArray(symbol) || typeof symbol === 'number'))) {"""
assert t.count(old) == 1, 'C5 anchor not found/ambiguous'
t = t.replace(old, new, 1)

# ---------- 4. Валидация пула из сейва: mixed ----------
old = """    const mode = r.mode === 'pick' ? 'pick' : 'strum';
    const steps = r.steps.map((step) => {
      // «_» — наш токен тишины из сейвов/фикстур: пропускаем как есть,
      // иначе round-trip стирал бы его в null и текст слепков гулял.
      if (mode === 'strum') return step === 'D' || step === 'U' || step === 'X' || step === '_' ? step : null;
      const items = Array.isArray(step) ? step : [step];"""
new = """    const mode = r.mode === 'pick' ? 'pick' : r.mode === 'mixed' ? 'mixed' : 'strum';
    const steps = r.steps.map((step) => {
      // «_» — наш токен тишины из сейвов/фикстур: пропускаем как есть,
      // иначе round-trip стирал бы его в null и текст слепков гулял.
      if (mode === 'strum') return step === 'D' || step === 'U' || step === 'X' || step === '_' ? step : null;
      // Смешанная лента (волна-5): знаки боя проходят как есть, массив и
      // голое число идут по обычной санитизации перебора.
      if (mode === 'mixed' && (step === 'D' || step === 'U' || step === 'X' || step === '_')) return step;
      const items = Array.isArray(step) ? step : [step];"""
assert t.count(old) == 1, 'C6 anchor not found/ambiguous'
t = t.replace(old, new, 1)

# ---------- 5. cloneSafePattern (санитизация легаси-вкраплений): mixed ----------
old = "    const mode = value.mode === 'pick' ? 'pick' : value.mode === 'strum' ? 'strum' : null;"
new = "    const mode = value.mode === 'pick' ? 'pick' : value.mode === 'strum' ? 'strum' : value.mode === 'mixed' ? 'mixed' : null;"
assert t.count(old) == 1, 'C7 anchor not found/ambiguous'
t = t.replace(old, new, 1)

old = """      if (mode === 'strum') return step === 'D' || step === 'U' || step === 'X' ? step : null;
      const items = Array.isArray(step) ? step : [step];"""
new = """      if (mode === 'strum') return step === 'D' || step === 'U' || step === 'X' ? step : null;
      if (mode === 'mixed' && (step === 'D' || step === 'U' || step === 'X' || step === '_')) return step;
      const items = Array.isArray(step) ? step : [step];"""
assert t.count(old) == 1, 'C8 anchor not found/ambiguous'
t = t.replace(old, new, 1)

# ---------- 6. Редактор: смешанный сид открываем боем с честной подсказкой ----------
old = """  let pattern = JSON.parse(JSON.stringify(seed));
  if (!Array.isArray(pattern.steps) || pattern.steps.length !== fullUnits * (pattern.subdivision || 1)) {
    pattern = getDefaultStrumPattern(pattern.mode || 'strum', ts, scope === 'event' ? fullUnits : null);
  }
"""
new = """  let pattern = JSON.parse(JSON.stringify(seed));
  if (!Array.isArray(pattern.steps) || pattern.steps.length !== fullUnits * (pattern.subdivision || 1)) {
    pattern = getDefaultStrumPattern(pattern.mode || 'strum', ts, scope === 'event' ? fullUnits : null);
  }
  // Смешанная лента (волна-5): после ресайза-сшивки соседей разных режимов
  // в рулоне лежат шаги и боя, и перебора. Редактор однорежимный, поэтому
  // показываем бой с честной подсказкой (шаги перебора тут не видны), а
  // сохранение форкнет ячейку одним режимом — обычным путём
  // saveEventPatternToRhythmRoll: режимы не совпали → FORK.
  let mixedSeed = false;
  if (pattern.mode === 'mixed') {
    mixedSeed = true;
    pattern = {
      mode: 'strum',
      subdivision: pattern.subdivision,
      steps: (pattern.steps || []).map((s) => (s === 'D' || s === 'U' || s === 'X' ? s : null)),
    };
  }
"""
assert t.count(old) == 1, 'C9 anchor not found/ambiguous'
t = t.replace(old, new, 1)

old = """    if (sharedUsers > 1) {
      sharedNoteEl.textContent = 'Этот бой общий для связанных ячеек — правка прозвучит по всей ленте.';
      sharedNoteEl.style.display = '';
    } else {
      sharedNoteEl.style.display = 'none';
    }
  }
"""
new = """    if (sharedUsers > 1) {
      sharedNoteEl.textContent = 'Этот бой общий для связанных ячеек — правка прозвучит по всей ленте.';
      sharedNoteEl.style.display = '';
    } else {
      sharedNoteEl.style.display = 'none';
    }
  }
  if (mixedSeed && sharedNoteEl) {
    sharedNoteEl.textContent = 'Лента смешанная (бой + перебор после растяжки): в редакторе виден только бой, сохранение заменит рисунок ячейки целиком.';
    sharedNoteEl.style.display = '';
  }
"""
assert t.count(old) == 1, 'C10 anchor not found/ambiguous'
t = t.replace(old, new, 1)

io.open(p, 'w', encoding='utf-8', errors='surrogateescape').write(t)
print('consumers ok')

# ---------- 7. Бамп кэша service worker (sw.js требует бампа на каждое
# изменение STRUCHORD.html — см. комментарий в его шапке) ----------
psw = '/home/user/sw.js'
sw = io.open(psw, encoding='utf-8', errors='surrogateescape').read()
old = "const CACHE_NAME = 'struchord-v1';"
assert sw.count(old) == 1, 'SW anchor not found/ambiguous'
sw = sw.replace(old, "const CACHE_NAME = 'struchord-v2';", 1)
io.open(psw, 'w', encoding='utf-8', errors='surrogateescape').write(sw)
print('sw bump ok')
