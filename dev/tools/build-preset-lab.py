#!/usr/bin/env python3
"""Собирает preset-lab.html и fingering-lab.html из STRUCHORD.html.

Единый источник правды — приложение. Движок гитарного звука, математика
пресетов боя и генератор аппликатур вырезаются из основного <script>
STRUCHORD.html и подставляются в шаблоны лабораторий (плейсхолдеры
/*__ENGINE__*/ и /*__PRESETS__*/). Руками собранные файлы не править:
после любой правки звука, пресетов или генератора аппликатур лаборатории
пересобираются заново:

    python3 dev/tools/build-preset-lab.py

Перед записью сборщик проверяет, что всё, чем пользуется извлечённый
движок, либо извлечено вместе с ним, либо есть в шаблоне лаборатории.
Если после правки приложения сборка упала на недостающем имени — это
сигнал, что новую функцию/константу надо добавить в списки ниже.
"""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent.parent
SRC = ROOT / "STRUCHORD.html"
OUT = ROOT / "preset-lab.html"
OUT_FRET = ROOT / "fingering-lab.html"

# ---------------------------------------------------------------------------
# Что вырезаем из STRUCHORD.html
# ---------------------------------------------------------------------------

# Константы и переменные для ритм-лаборатории (регулярные выражения по
# тексту объявления — вырезается весь блок целиком).
DECLS = [
    r"const STRING_OPEN_FREQ = \[[^\]]*\];",
    r"const pluckBufferCache = new Map\(\);",
    r"let guitarDryBus = null,[\s\S]*?guitarMasterGain = null;",
    r"const PICK_BASS_TOKEN = '.';",
    r"const PICK_ALT_BASS_TOKEN = '.';",
    r"let ringingVoices = \[\];",
    r"const PLUCK_CACHE_LIMIT = \d+;",
    r"const TUNER_TUNINGS = \[[\s\S]*?\n\];",
    r"let tunerTuningId = '[^']*';",
    r"let tunerCustomNotes = null;",
    r"const STD_TUNING_NOTES = \[[^\]]*\];",
    r"const CHROMATIC = \[[^\]]*\];",
    r"const SHARP_TO_FLAT = \{[\s\S]*?\n\};",
    r"const FLAT_TO_SHARP = \{[\s\S]*?\n\};",
]

# Функции для ритм-лаборатории (вырезаются по имени, с примыкающими
# сверху строками комментариев).
FUNCS = [
    # гитарный звук
    "buildGuitarBodyImpulse", "ensureGuitarBus", "synthesizePluck",
    "getPluckBuffer", "pluckString", "shapeToPluckNotes",
    "strumChordDirectional", "playMuteChunk", "strumMute",
    "pluckSingleGuitarString", "dampRingingVoicesAt", "computeEnvValueAt",
    # строй, ноты, частоты
    "songTuningNotes", "songStringFreqs", "tunerActiveNotes",
    "tunerCurrentTuning", "getKeyStyle", "noteToFrequency", "getChordNotes",
    "normalizeChordCase",
    # ритм-сетка и пресеты
    "getGridUnitDurationSeconds", "parseTimeSig", "getGridUnitsPerBar",
    "isCompoundMeter", "normalizePickStep", "isPickBassToken",
    "pickStepSortValue", "pickTokenLabel", "getBassStringsForShape",
    "resolvePickStepStrings", "buildPatternFromPreset", "isPresetCompatible",
    "findRepeatUnit", "patternsEqual", "resamplePatternSteps",
    "getPatternUnits",
]

# Лаборатория аппликатур: тот же звуковой тракт и строй плюс таблицы
# аккордов и генератор вариантов. Токены перебора (PICK_*_TOKEN) не нужны.
FRET_DECLS = [
    r"const STRING_OPEN_FREQ = \[[^\]]*\];",
    r"const pluckBufferCache = new Map\(\);",
    r"let guitarDryBus = null,[\s\S]*?guitarMasterGain = null;",
    r"let ringingVoices = \[\];",
    r"const PLUCK_CACHE_LIMIT = \d+;",
    r"const TUNER_TUNINGS = \[[\s\S]*?\n\];",
    r"let tunerTuningId = '[^']*';",
    r"let tunerCustomNotes = null;",
    r"const STD_TUNING_NOTES = \[[^\]]*\];",
    r"const CHROMATIC = \[[^\]]*\];",
    r"const SHARP_TO_FLAT = \{[\s\S]*?\n\};",
    r"const FLAT_TO_SHARP = \{[\s\S]*?\n\};",
    r"const FINGERING_FIRST_ANCHORS = \{[\s\S]*?\n\};",
    r"const OPEN_CHORDS = \{[\s\S]*?\n\};",
    r"const CAGED_SHAPES = \{[\s\S]*?\n\};",
    r"const FINGERING_WEIGHTS = \{[\s\S]*?\n\};",
    r"const GRIP_ETALONS_EXACT = new Set\(\[[\s\S]*?\]\);",
    r"const GRIP_ETALONS_REL = new Set\(\[[\s\S]*?\]\);",
    r"const fingeringCache = new Map\(\);",
    r"const userFingerings = new Map\(\);",
]

FRET_FUNCS = [
    # гитарный звук
    "buildGuitarBodyImpulse", "ensureGuitarBus", "synthesizePluck",
    "getPluckBuffer", "pluckString", "shapeToPluckNotes",
    "strumChordDirectional", "playMuteChunk", "dampRingingVoicesAt",
    "computeEnvValueAt", "pluckSingleGuitarString",
    # строй, ноты, частоты
    "songTuningNotes", "songStringFreqs", "songStringNotes",
    "tunerActiveNotes", "tunerCurrentTuning", "isStandardTuning",
    "shapeMatchesChord", "tuningKeySuffix", "buildFingeringChordKey",
    "adaptShapeToTuning", "tuningSemitoneDrops", "tunerNoteToMidi",
    "openFreedStrings", "getKeyStyle", "noteToFrequency", "getChordNotes",
    "normalizeChordCase", "toSharpNote", "expandChordName",
    # генератор аппликатур
    "dimColorPc", "scoreShape", "checkFormValidity", "detectBarre",
    "detectAllBarres", "solveFingerAssignment", "analyzeShapeGrip", "isEtalonGrip",
    "shapeMissingDefiningTones",
    "detectBaseChordType",
    "tryCagedVariants", "tryModifiedCagedVariants", "_generateCoreVariants",
    "collectFamilyDerivedShapes", "generateFingeringVariants",
    "fingeringCounterText",
    "renderFingeringSVG",
    "createInteractiveFretboard",
]

# Имена, которые сборщик НЕ должен требовать в движке: их даёт шаблон
# лаборатории (заглушки и лабораторные замены приложения) либо они
# намеренно не переносятся (код, который в лаборатории никогда не
# вызывается, но статически виден в извлечённых функциях).
PROVIDED_BY_LAB = {
    "audioCtx", "activeOscillators", "globalTimeSig", "getAudioContext",
    "STRUM_PRESETS", "DEMO_SHAPES",
    "guitarWetBus", "guitarBodyConvolver", "guitarMasterGain",
    "strumChord", "cn", "count", "bass",
    "getFingeringVariants", "preferredFingeringByChord",
    "globalKey", "activeSectionKey", "CONFIG",
    # Упоминаются только в поясняющих комментариях шаблонов
    # (проверка зависимостей работает по голому тексту, комментарии
    # не вырезает). В коде лабораторий этих имён нет.
    "playbackState", "setPreferredFingering",
}

# ---------------------------------------------------------------------------
# Вырезание кусков из приложения
# ---------------------------------------------------------------------------

def read_main_script(html):
    """Текст основного (самого длинного) <script> документа."""
    scripts = re.findall(r"<script[^>]*>(.*?)</script>", html, re.S)
    if not scripts:
        sys.exit("В STRUCHORD.html нет ни одного <script> — нечего извлекать.")
    return max(scripts, key=len)


def grab_decl(src, pattern):
    """Вырезает объявление по регулярному выражению."""
    m = re.search(pattern, src, re.S)
    if not m:
        sys.exit(f"Не нашёл объявление по шаблону {pattern!r} в STRUCHORD.html")
    return m.group(0)


def grab_function(src, name):
    """Вырезает функцию целиком, включая примыкающие сверху // комментарии."""
    idx = src.find("function " + name + "(")
    if idx == -1:
        sys.exit(f"Не нашёл функцию {name}() в STRUCHORD.html")
    # Поднимаемся вверх по строкам-комментариям, прилипшим к функции.
    start = idx
    while start > 0:
        line_start = src.rfind("\n", 0, start) + 1
        prev_end = line_start - 1
        if prev_end <= 0:
            break
        prev_start = src.rfind("\n", 0, prev_end) + 1
        if src[prev_start:prev_end].strip().startswith("//"):
            start = prev_start
        else:
            break
    # Баланс скобок от открывающей фигурной сигнатуры.
    i = src.index("{", idx)
    depth = 0
    while True:
        c = src[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                break
        i += 1
    return src[start:i + 1]


def grab_strum_presets(src):
    """Текущий массив STRUM_PRESETS целиком (для вкладки пресетов)."""
    start = src.index("const STRUM_PRESETS")
    end = src.index("\n];", start) + 3
    return src[start:end]

# ---------------------------------------------------------------------------
# Проверка зависимостей
# ---------------------------------------------------------------------------

def check_dependencies(engine, template, src):
    """Имена приложения, используемые в лаборатории, но нигде не объявленные.

    Смотрим только на имена, которые существуют на верхнем уровне
    приложения, — использование чего-то лабораторного или встроенного
    нас не волнует. Осталось → в лаборатории будет ReferenceError.
    """
    code = engine + "\n" + template
    defined = set(re.findall(r"^function\s+([A-Za-z_$][\w$]*)", code, re.M))
    defined |= set(re.findall(r"^(?:const|let|var)\s+([A-Za-z_$][\w$]*)", code, re.M))
    defined |= set(re.findall(r"^\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)", code, re.M))
    defined |= PROVIDED_BY_LAB

    app_names = set(re.findall(r"^function\s+([A-Za-z_$][\w$]*)\s*\(", src, re.M))
    # Объявления верхнего уровня построчно: так продолжения многострочных
    # let («let guitarDryBus = null,\n  guitarWetBus = null,…») попадают
    # в список, а одноимённые локальные переменные внутри функций — нет.
    in_decl = False
    for line in src.split("\n"):
        m = re.match(r"^(?:const|let|var)\s+([A-Za-z_$][\w$]*)", line)
        if m:
            app_names.add(m.group(1))
            in_decl = ";" not in line
            continue
        if in_decl:
            m = re.match(r"^\s+([A-Za-z_$][\w$]*)\s*=\s*[^=]", line)
            if m:
                app_names.add(m.group(1))
            if ";" in line:
                in_decl = False
        if not line.strip():
            in_decl = False

    used = set(re.findall(r"[A-Za-z_$][\w$]*", code))
    return sorted(n for n in (used & app_names) - defined if len(n) > 2)

# ---------------------------------------------------------------------------
# Сборка
# ---------------------------------------------------------------------------

def build(template_name, out_path, decls, funcs, caption):
    html = SRC.read_text(encoding="utf-8")
    src = read_main_script(html)
    template = (Path(__file__).resolve().parent / template_name).read_text(encoding="utf-8")

    parts = [grab_decl(src, p) for p in decls]
    parts += [grab_function(src, name) for name in funcs]
    engine = "\n\n".join(parts)

    missing = check_dependencies(engine, template, src)
    if missing:
        print(f"[{caption}] в движке используются имена из приложения,"
              f" которых нет в лаборатории:")
        for n in missing:
            print(f"  - {n}")
        print("Добавьте их в DECLS/FUNCS выше (или в заглушки шаблона).")
        sys.exit(1)

    out = template.replace("/*__ENGINE__*/", engine)
    if "/*__PRESETS__*/" in out:
        out = out.replace("/*__PRESETS__*/", grab_strum_presets(src))
    out_path.write_text(out, encoding="utf-8")
    print(f"[{caption}] {out_path.name}: {out_path.stat().st_size / 1024:.0f} КБ "
          f"(движок {len(engine) / 1024:.0f} КБ, {len(funcs)} функций)")


def main():
    build("preset-lab.template.html", OUT, DECLS, FUNCS, "ритмы")
    build("fingering-lab.template.html", OUT_FRET, FRET_DECLS, FRET_FUNCS, "аппликатуры")


if __name__ == "__main__":
    main()
