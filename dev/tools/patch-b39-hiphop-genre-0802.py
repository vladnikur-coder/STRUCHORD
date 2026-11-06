#!/usr/bin/env python3
"""B-39 0.802: replace the soul genre with hip-hop everywhere (owner decision, R8 final=yes).

Patches STRUCHORD.html, keyboard-accompaniment.js, dev/prototypes/keyboard-performance.js
and sw.js. The embedded CORPUS_PROFILES table is replaced from the freshly built
dev/audits/b39-corpus-groove-profiles.json (soul dissolved: hip-hop folders -> hiphop,
14 soul-library folders redistributed to funk/pop by measured descriptor distance).
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HTML = ROOT / 'STRUCHORD.html'
ACCOMP = ROOT / 'keyboard-accompaniment.js'
PROTO = ROOT / 'dev/prototypes/keyboard-performance.js'
SW = ROOT / 'sw.js'
PROFILES = ROOT / 'dev/audits/b39-corpus-groove-profiles.json'

GENRES_OLD = "  soul:    {chord:0.32, arp:0.21, offbeat:0.22, length:0.78},"
GENRES_NEW = "  hiphop:  {chord:0.52, arp:0.10, offbeat:0.14, length:0.86},"
GROOVES_OLD = " soul:    ['C...p...','C..p..s.','C...p..s','C..s..p.'],"
GROOVES_NEW = " hiphop:  ['C.....s.','C...p..s','C..s...s','C.s...p.'],"
METRIC_COMMENT_OLD = "// В jazz/funk/soul метрический акцент слабее: доли ровнее."
METRIC_COMMENT_NEW = "// В jazz/funk метрический акцент слабее: доли ровнее; хип-хоп прямой, доли ровные."
METRIC_OLD = "const GENRE_METRIC = Object.freeze({pop:1, rock:1, punk:1.05, country:0.95, blues:0.85, jazz:0.58, soul:0.76, funk:0.7, fusion:0.65});"
METRIC_NEW = "const GENRE_METRIC = Object.freeze({pop:1, rock:1, punk:1.05, country:0.95, blues:0.85, jazz:0.58, hiphop:0.95, funk:0.7, fusion:0.65});"

def apply(path, repls, must_be_unique=True):
    s = path.read_text()
    for old, new in repls:
        count = s.count(old)
        if count != 1:
            raise SystemExit(f'{path.name}: ожидалось одно вхождение ({count}): {old[:160]!r}')
        s = s.replace(old, new, 1)
    path.write_text(s)

# --- keyboard-accompaniment.js: авторные рисунки хип-хопа по статистике корпуса
# (прямой grid-locked грув, луповый повтор, плотность соул-уровня, выдержанные аккорды) ---
apply(ACCOMP, [
    ("""      ['soul','Соул',[
        ['Мягкие аккорды',['H',null,null,null,'H',null,null,null]],
        ['Перебор',['B',null,'A','t3','t5',null,'A',null]],
        ['Пульс',['B',null,'H','H',null,'H','H',null]]]],""",
     """      ['hiphop','Хип-хоп',[
        ['Стабы на 1 и 3',['H',null,null,null,'H',null,null,null]],
        ['Бас и синкопы',['B',null,null,'H',null,null,'H',null]],
        ['Мелодичный луп',['B',null,'t3',null,'t5',null,'t3',null]]]],"""),
    ("""      soul:[
        ['B',null,null,'t3','H',null,null,null],
        ['B',null,'t3','t5','H',null,'t3',null],
        ['B',null,'t3','t5','H',null,'H','t5'],
        [['B','H'],null,'t3','H','B',null,'H','t5'],
        ['B',null,'t3','t5',['B','H'],null,null,null]],""",
     """      hiphop:[
        ['B',null,null,null,'H',null,null,null],
        ['H',null,null,null,'H',null,null,'H'],
        ['B',null,null,'H',null,null,'H',null],
        [['B','H'],null,null,'H',null,null,'H',null],
        ['B',null,null,null,['B','H'],null,null,null]],"""),
])

# --- dev/prototypes/keyboard-performance.js: тот же блок жанров (сверяется тестом 0.772) ---
apply(PROTO, [
    (GENRES_OLD, GENRES_NEW),
    (GROOVES_OLD, GROOVES_NEW),
    (METRIC_COMMENT_OLD, METRIC_COMMENT_NEW),
    (METRIC_OLD, METRIC_NEW),
    # 0.801 добавил в HTML corpus-сдвиг velocity в applyDynamics, но прототип не
    # синхронизировал — сверяемый тестом 0.772 блок разошёлся. Выравниваем.
    ("  const level = ROLE_LEVEL[o.role] ?? 75, metric = GENRE_METRIC[o.genre] ?? 1, arcAmp = ROLE_ARC[o.role] ?? 6;",
     "  const level = (ROLE_LEVEL[o.role] ?? 75) + (Number.isFinite(o.corpusVelocityOffset)?o.corpusVelocityOffset:0), metric = GENRE_METRIC[o.genre] ?? 1, arcAmp = ROLE_ARC[o.role] ?? 6;"),
])

# --- STRUCHORD.html ---
s = HTML.read_text()
html_repls = [
    ("· ver 0.801", "· ver 0.802"),
    ("var AUTO_GENRES = ['pop','rock','punk','country','blues','jazz','soul','funk','fusion'];",
     "var AUTO_GENRES = ['pop','rock','punk','country','blues','jazz','hiphop','funk','fusion'];"),
    (GENRES_OLD, GENRES_NEW),
    (GROOVES_OLD, GROOVES_NEW),
    (METRIC_COMMENT_OLD, METRIC_COMMENT_NEW),
    (METRIC_OLD, METRIC_NEW),
]
for old, new in html_repls:
    count = s.count(old)
    if count != 1:
        raise SystemExit(f'STRUCHORD.html: ожидалось одно вхождение ({count}): {old[:160]!r}')
    s = s.replace(old, new, 1)

# Таблица корпусных профилей: пересобрана билдером (soul -> hiphop + переклейка фанк/поп).
profiles = json.loads(PROFILES.read_text(encoding='utf-8'))['profiles']
if 'soul' in profiles or 'hiphop' not in profiles:
    raise SystemExit('Профили не пересобраны: нужен hiphop без soul')
start = s.index('const CORPUS_PROFILES = ')
end = s.index(';\nfunction corpusProfileFor', start)
blob = json.dumps(profiles, ensure_ascii=False, separators=(',', ':'))
if '"notes"' in blob:
    raise SystemExit('В профилях не должно быть исходных нот')
s = s[:start] + 'const CORPUS_PROFILES = ' + blob + s[end:]

# 0.801 вставил корпусный блок (комментарий + таблицу + corpusProfileFor/corpusGrooveIndex)
# ВНУТРЬ побайтово сверяемого блока ROLE->METERS (тест 0.772 в той сессии не гонялся,
# расхождение не было замечено). Переносим блок выше — между GROOVES и ROLE, —
# восстанавливая инвариант «прототип = HTML» в сверяемой области.
corpus_start = s.index('// 0.801: compact aggregate groove descriptors')
metric_pos = s.index(METRIC_COMMENT_NEW)
if not (corpus_start < metric_pos):
    raise SystemExit('Корпусный блок не найден до метрического комментария')
corpus_block = s[corpus_start:metric_pos]
if 'const CORPUS_PROFILES = ' not in corpus_block or 'function corpusGrooveIndex' not in corpus_block:
    raise SystemExit('Корпусный блок неполон')
s = s[:corpus_start] + s[metric_pos:]
role_pos = s.index('const ROLE = Object.freeze(')
s = s[:role_pos] + corpus_block + s[role_pos:]
HTML.write_text(s)

# --- sw.js: версия и кэш парой (R7) ---
t = SW.read_text()
if t.count('struchord-v801') != 1:
    raise SystemExit('Ожидалось одно имя кэша v801')
SW.write_text(t.replace('struchord-v801', 'struchord-v802', 1))

print('OK: soul -> hip-hop (STYLES, FAMILY, AUTO_GENRES, GENRES, GROOVES, GENRE_METRIC, '
      'CORPUS_PROFILES); вер/кэш 0.802; прототип синхронизирован')
