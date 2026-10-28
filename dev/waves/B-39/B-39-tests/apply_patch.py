#!/usr/bin/env python3
"""Прикладывает ВСЕ готовые части патча B-39 к ЛЮБОЙ версии STRUCHORD.html.

Никаких номеров строк — только уникальные текстовые якоря. Работает, даже
если файл ушёл вперёд на тысячи строк и вокруг якорей появился новый код.

  python3 apply_patch.py STRUCHORD.html              # применить все части
  python3 apply_patch.py STRUCHORD.html --check      # только проверить
  python3 apply_patch.py STRUCHORD.html --uninstall  # откатить всё

Всегда создаёт резервную копию рядом с файлом.
"""
from pathlib import Path
import sys, datetime, re

HERE = Path(__file__).parent

def block(name):
    return (HERE / name).read_text(encoding="utf-8")

# --- вставляемые блоки (маркеры внутри файлов) ---
BLOCKS = [
    {
        "name": "STAGE0 · B-102 · каноническая формула аккорда",
        "file": "stage0_block.js",
        "begin": "// >>> B-39 STAGE0 BEGIN (B-102) <<<",
        "end": "// <<< B-39 STAGE0 END (B-102) <<<",
        "anchor": "function getChordNotes(cn, ks) {",
        "mode": "before",
        "required": {
            "CHROMATIC": "const CHROMATIC = [",
            "SHARP_TO_FLAT": "const SHARP_TO_FLAT = {",
            "FLAT_TO_SHARP": "const FLAT_TO_SHARP = {",
            "expandChordName": "function expandChordName(chord) {",
            "normalizeAccidentals": "function normalizeAccidentals(name) {",
            "normalizeChordCase": "function normalizeChordCase(ch) {",
            "getKeyStyle": "function getKeyStyle(k) {",
        },
    },
    {
        "name": "STAGE1 · модель дорожек, Store, миграция",
        "file": "stage1_block.js",
        "begin": "// >>> B-39 STAGE1 BEGIN (TRACKS) <<<",
        "end": "// <<< B-39 STAGE1 END (TRACKS) <<<",
        "anchor": "const songStore = (function () {",
        "mode": "before",
        "required": {
            "serializeCurrentSong": "function serializeCurrentSong(options) {",
            "sanitizeSongData": "function sanitizeSongData(rawSong) {",
            "loadSongFromObjectInner": "function loadSongFromObjectInner(song) {",
            "metadata (хук 2)": "      metadata: currentSongMetadata(),",
            "партии (хук 3)": "    // B-12.1 «Партии»: независимые табулатурные слои.",
        },
    },
    {
        "name": "STAGE2 · микшер дорожек (UI)",
        "file": "stage2_block.js",
        "begin": "// >>> B-39 STAGE2 BEGIN (MIXER UI) <<<",
        "end": "// <<< B-39 STAGE2 END (MIXER UI) <<<",
        "anchor": "window.songStore = songStore;",
        "mode": "after",
        "required": {
            "setEventChord": "function setEventChord(ev, newChord, posCtx, keepShape) {",
            "strumChord": "function strumChord(ctx, shape, chordName, key, startTime, duration, baseGain) {",
            "transportDockHint": 'id="transportDockHint"',
            "transport-bar": 'class="transport-bar"',
        },
    },
    {
        "name": "STAGE3 · звук пианино и голоса дорожек",
        "file": "stage3_block.js",
        "begin": "// >>> B-39 STAGE3 BEGIN (KEYS AUDIO) <<<",
        "end": "// <<< B-39 STAGE3 END (KEYS AUDIO) <<<",
        "anchor": "function playChord(c, wrapper) {",
        "mode": "before",
        "required": {
            "scheduleNextEvent": "function scheduleNextEvent(ctx) {",
            "stopAllAudio": "function stopAllAudio() {",
            "soundChannelInstrument": "function soundChannelInstrument(id) {",
            "PART_SOUNDS": "const PART_SOUNDS = {",
        },
    },
    {
        "name": "STAGE4 · клавишные аппликатуры и панель клавиатуры",
        "file": "stage4_block.js",
        "begin": "// >>> B-39 STAGE4 BEGIN (KEYS VOICING UI) <<<",
        "end": "// <<< B-39 STAGE4 END (KEYS VOICING UI) <<<",
        "anchor": "function renderFingeringSVG(fingers, bottomPad, opts) {",
        "mode": "before",
        "required": {
            "showFingeringTooltip": "function showFingeringTooltip(chordName, wrapper, isPreview = false, isCurrentLast = false) {",
            "fillTimelinePanel": "function fillTimelinePanel(kind, chord, posCtx) {",
            "showFingers": 'id="showFingers"',
        },
    },
    {
        "name": "STAGE5 · типы аккомпанимента и панель «Аккомпанемент»",
        "file": "stage5_block.js",
        "begin": "// >>> B-39 STAGE5 BEGIN (KEYS ACCOMPANIMENT) <<<",
        "end": "// <<< B-39 STAGE5 END (KEYS ACCOMPANIMENT) <<<",
        "anchor": "function schedulePatternForEvent(chord, evStart, dur, posCtx, pattern, bpm, ts, square, eventIndex, span, exact, sec) {",
        "mode": "before",
        "required": {
            "getEffectiveStrumPattern": "function getEffectiveStrumPattern(event, sq, sec) {",
            "openStrumPatternEditor": "function openStrumPatternEditor(scope, sectionId, squareId, eventIndex) {",
            "strumChord": "function strumChord(ctx, shape, chordName, key, startTime, duration, baseGain) {",
            "transportDockHint": 'id="transportDockHint"',
        },
    },
    {
        "name": "STAGE6 · экспорт всех дорожек в GP5/GPX/MIDI",
        "file": "stage6_block.js",
        "begin": "// >>> B-39 STAGE6 BEGIN (TRACK EXPORT) <<<",
        "end": "// <<< B-39 STAGE6 END (TRACK EXPORT) <<<",
        "anchor": "  function gpExportEnsureWriter() {",
        "mode": "before",
        "required": {
            "gpExportRun": "function gpExportRun(songData) {",
            "gpExportRunGP5": "function gpExportRunGP5(songData) {",
            "midiExportBuild": "function midiExportBuild(songData, report) {",
            "gpExportPrepareSong": "function gpExportPrepareSong(songData, report) {",
            "openStrumPatternEditor": "function openStrumPatternEditor(scope, sectionId, squareId, eventIndex) {",
        },
    },
]

# --- точечные хуки в существующий код ---
# count — сколько раз встречается старый текст (две функции рендера ячеек).
HOOKS = [
    {
        "name": "sanitizeSongData -> attach",
        "old": "    return normalizeReadableSongChordNames(sanitizedSong);",
        "new": """    const b39ReadySong = normalizeReadableSongChordNames(sanitizedSong);
    // B-39 STAGE1: дорожки — необязательные поля файла песни. Старый файл
    // без tracks получает одну гитарную дорожку, но в сейв она не пишется.
    return window.StruChordTracks
      ? window.StruChordTracks.attach(b39ReadySong, rawSong)
      : b39ReadySong;""",
        "detect": "window.StruChordTracks.attach(b39ReadySong, rawSong)",
    },
    {
        "name": "serializeCurrentSong -> exportForSave",
        "old": "      metadata: currentSongMetadata(),",
        "new": """      // B-39 STAGE1: пока состояние дефолтное (одна гитара), spread пустой —
      // файл старой песни сохраняется байт-в-байт как раньше.
      ...(window.StruChordTracks ? window.StruChordTracks.exportForSave() : {}),
      metadata: currentSongMetadata(),""",
        "detect": "window.StruChordTracks.exportForSave() : {})",
    },
    {
        "name": "loadSongFromObjectInner -> load",
        "old": "    // B-12.1 «Партии»: независимые табулатурные слои.",
        "new": """    // B-39 STAGE1: состояние дорожек загружаем ПОСЛЕ того, как sections
    // уже пересобраны — иначе repairMain() правил бы ячейки прошлой песни.
    if (window.StruChordTracks) window.StruChordTracks.load(song);
    // B-12.1 «Партии»: независимые табулатурные слои.""",
        "detect": "window.StruChordTracks.load(song);",
    },
    {
        "name": "chord-input -> активная дорожка (2 места)",
        "old": """value="${escapeHtml(ev.chord || '')}" placeholder="—\"""",
        "new": """value="${escapeHtml(window.StruChordMixer ? window.StruChordMixer.displayChord(sec, sq, ev, ei) : (ev.chord || ''))}" placeholder="—\"""",
        "detect": "window.StruChordMixer.displayChord(sec, sq, ev, ei) : (ev.chord || '')",
        "count": 2,
    },
    {
        "name": "chord-display -> призрачный аккорд (2 места)",
        "old": """<div class="chord-display" aria-hidden="true">${accompSignatureFits(sec, sq, ev, ei) ? renderChordDisplayHtml(ev.chord) : accompNotesPlateHtml()}</div>""",
        "new": """<div class="chord-display${window.StruChordMixer ? window.StruChordMixer.ghostClass(sec, sq, ei) : ''}" aria-hidden="true">${accompSignatureFits(sec, sq, ev, ei) ? renderChordDisplayHtml(window.StruChordMixer ? window.StruChordMixer.displayChord(sec, sq, ev, ei) : ev.chord) : accompNotesPlateHtml()}</div>""",
        "detect": "window.StruChordMixer.ghostClass(sec, sq, ei) : ''",
        "count": 2,
    },
    {
        "name": "setEventChord -> круг пишет в активную дорожку",
        "old": """function setEventChord(ev, newChord, posCtx, keepShape) {
  if (!ev) return false;""",
        "new": """function setEventChord(ev, newChord, posCtx, keepShape) {
  if (!ev) return false;
  // B-39 STAGE2: круг/ручной ввод пишут аккорд в АКТИВНУЮ дорожку. Если
  // активна неглавая, главная (ev.chord) остаётся нетронутой.
  if (window.StruChordMixer && window.StruChordMixer.redirectChordWrite(ev, newChord, posCtx)) return true;""",
        "detect": "window.StruChordMixer.redirectChordWrite(ev, newChord, posCtx)",
    },
    {
        "name": "strumChord -> M/S влияют на звук",
        "old": """function strumChord(ctx, shape, chordName, key, startTime, duration, baseGain) {
  ensureGuitarBus(ctx);""",
        "new": """function strumChord(ctx, shape, chordName, key, startTime, duration, baseGain) {
  // B-39 STAGE2: M/S дорожек реально влияют на звук. Пока звучит один
  // голос (главная дорожка); отдельные голоса появятся в части 4.
  if (window.StruChordMixer && !window.StruChordMixer.mainAudible()) return;
  ensureGuitarBus(ctx);""",
        "detect": "!window.StruChordMixer.mainAudible()",
    },
    {
        "name": "scheduleNextEvent -> голоса клавишных дорожек",
        "old": """  playbackState.cellStart = evStart;
  playbackState.cellDur = dur;""",
        "new": """  playbackState.cellStart = evStart;
  playbackState.cellDur = dur;
  // B-39 STAGE3: свои голоса клавишных дорожек планируются здесь же,
  // до гитарного боя — время начала то же, рассинхрона нет.
  if (window.StruChordAudio) window.StruChordAudio.scheduleEvent(
    ctx, next.section, next.square, next.event, next.eventIndex, evStart, dur, bpm, ts);""",
        "detect": "window.StruChordAudio.scheduleEvent(",
    },
    {
        "name": "playChord -> мгновенное превью клавиш",
        "old": "    strumChord(ctx, shape, c, key, now, STRUM_RING_SECONDS, 0.42);",
        "new": """    // B-39 STAGE3: к гитарному превью добавляем клавишные голоса.
    if (window.StruChordAudio) window.StruChordAudio.preview(c, ctx, now, wrapper);
    strumChord(ctx, shape, c, key, now, STRUM_RING_SECONDS, 0.42);""",
        "detect": "window.StruChordAudio.preview(c, ctx, now, wrapper);",
    },
    {
        "name": "stopAllAudio -> стоп клавишных голосов",
        "old": """function stopAllAudio() {
  for (const o of activeOscillators)""",
        "new": """function stopAllAudio() {
  // B-39 STAGE3: у клавишных голосов свои источники Web Audio.
  if (window.StruChordAudio) window.StruChordAudio.stopAll();
  for (const o of activeOscillators)""",
        "detect": "window.StruChordAudio.stopAll();",
    },
    {
        "name": "soundChannelInstrument -> инструмент главной дорожки",
        "old": """function soundChannelInstrument(id) {
  const owner = soundChannelOwner(id);
  return owner && owner !== songSoundState ? partInstrumentId(owner) : 'guitar';
}""",
        "new": """function soundChannelInstrument(id) {
  const owner = soundChannelOwner(id);
  if (owner && owner !== songSoundState) return partInstrumentId(owner);
  // B-39 STAGE3: канал «Песня» звучит инструментом главной дорожки.
  if (window.StruChordTracks) {
    const b39Main = window.StruChordTracks.mainTrack();
    if (b39Main && b39Main.instrument === 'keys') return 'keys';
  }
  return 'guitar';
}""",
        "detect": "if (b39Main && b39Main.instrument === 'keys') return 'keys';",
    },
    {
        "name": "PART_SOUNDS.keys -> пресеты клавишных",
        "old": "  keys: [{ id: 'acoustic', label: 'Простой клавишный тон', gain: 1, bright: 0, ring: 1, wet: 0, drive: 0, cab: 0 }],",
        "new": """  keys: [
    { id: 'acoustic', label: 'Простой клавишный тон', gain: 1, bright: 0, ring: 1, wet: 0, drive: 0, cab: 0 },
    { id: 'piano', label: 'Рояль (синтез)', gain: 1, bright: 0.08, ring: 1.3, wet: 0.25, drive: 0, cab: 0 },
    { id: 'epiano', label: 'Электропиано', gain: 0.95, bright: 0.14, ring: 1.1, wet: 0.35, drive: 0.05, cab: 6200 },
    { id: 'organ', label: 'Орган', gain: 0.9, bright: 0.02, ring: 2.2, wet: 0.2, drive: 0, cab: 0 },
  ],""",
        "detect": "{ id: 'piano', label: 'Рояль (синтез)'",
    },
    {
        "name": "тултип -> имя аккорда для клавиатуры",
        "old": "    const svg = renderFingeringSVG(shape, 30, { barreOff: barreOffForShape, customFingers: fingersForShape }) || '';",
        "new": """    // B-39 STAGE4: для клавишной дорожки рендеру нужно имя аккорда.
    const b39CellKey = wrapper && wrapper.dataset
      ? wrapper.dataset.sec + ':' + wrapper.dataset.square + ':' + wrapper.dataset.ei : undefined;
    const svg = renderFingeringSVG(shape, 30, { barreOff: barreOffForShape, customFingers: fingersForShape, chord: chordName, cellKey: b39CellKey }) || '';""",
        "detect": "chord: chordName, cellKey: b39CellKey",
    },
    {
        "name": "pinned now -> chord: name",
        "old": "renderFingeringSVG(form, 24, { scale: 1.08, barreOff: pinnedBarreOff, customFingers: pinnedFingers })",
        "new": "renderFingeringSVG(form, 24, { scale: 1.08, barreOff: pinnedBarreOff, customFingers: pinnedFingers, chord: name })",
        "detect": "customFingers: pinnedFingers, chord: name",
    },
    {
        "name": "pinned next -> chord: pos.chord",
        "old": "renderFingeringSVG(form, 24, { scale: 1.08, barreOff: nextBarreOff, customFingers: nextFingers })",
        "new": "renderFingeringSVG(form, 24, { scale: 1.08, barreOff: nextBarreOff, customFingers: nextFingers, chord: pos.chord })",
        "detect": "customFingers: nextFingers, chord: pos.chord",
    },
    {
        "name": "панель Сейчас -> chord: chord",
        "old": "  const svgHtml = shape ? renderFingeringSVG(shape, undefined, { barreOff, customFingers: fingers }) || '' : '';",
        "new": """  // B-39 STAGE4: панель «Сейчас» в ленте тоже показывает клавиатуру.
  const b39CellKey = posCtx
    ? posCtx.secId + ':' + (posCtx.sqId !== undefined ? posCtx.sqId : posCtx.squareId) + ':' + (posCtx.ei !== undefined ? posCtx.ei : posCtx.eventIndex)
    : undefined;
  const svgHtml = shape ? renderFingeringSVG(shape, undefined, { barreOff, customFingers: fingers, chord: chord, cellKey: b39CellKey }) || '' : '';""",
        "detect": "customFingers: fingers, chord: chord, cellKey: b39CellKey",
    },
    {
        "name": "ритм секции -> общая сетка и свинг для клавишных",
        "old": "    const swingOn = patternHasSwing(pattern);",
        "new": """    const swingOn = patternHasSwing(pattern);
    // B-39 STAGE5: клавишные дорожки видят ту же сетку и тот же свинг.
    if (window.StruChordAccomp) window.StruChordAccomp.adoptRhythm(
      pattern, ts, bpm, sec, square, eventIndex, evStart, dur);""",
        "detect": "window.StruChordAccomp.adoptRhythm(",
    },
    {
        "name": "GPX -> все дорожки отдельными партиями",
        "old": "    const writer = gpExportEnsureWriter();",
        "new": """    // B-39 STAGE6: все дорожки B-39 выносятся отдельными партиями.
    if (window.StruChordExport) songData = window.StruChordExport.withTracks(songData, { grid: true, report: report });
    const writer = gpExportEnsureWriter();""",
        "detect": "withTracks(songData, { grid: true, report: report })",
    },
    {
        "name": "GP5 -> виртуальный широкий строй, GM 0",
        "old": "    const writer = gpExportEnsureGp5Writer();",
        "new": """    // B-39 STAGE6: для GP5 — свои струна/лад на широком строе, GM 0.
    if (window.StruChordExport) songData = window.StruChordExport.withTracks(songData, { gp5: true, grid: true, report: report });
    const writer = gpExportEnsureGp5Writer();""",
        "detect": "withTracks(songData, { gp5: true, grid: true, report: report })",
    },
    {
        "name": "MIDI -> свой трек на дорожку",
        "old": "    const data = serializeCurrentSong({ includeGpAssetData: false });",
        "new": """    // B-39 STAGE6: MIDI получает все дорожки абсолютными высотами.
    const data = window.StruChordExport
      ? window.StruChordExport.withTracks(serializeCurrentSong({ includeGpAssetData: false }))
      : serializeCurrentSong({ includeGpAssetData: false });""",
        "detect": "window.StruChordExport.withTracks(serializeCurrentSong(",
    },
    {
        "name": "без дубля главной дорожки в GP",
        "old": "    if (Object.keys(rolls).length) {",
        "new": """    // B-39 STAGE6: главная дорожка уже экспортирована отдельной партией.
    if (Object.keys(rolls).length && !(window.StruChordExport && window.StruChordExport.hasTracks())) {""",
        "detect": "Object.keys(rolls).length && !(window.StruChordExport",
    },
    {
        "name": "без дубля канала «Песня» в MIDI",
        "old": "    const songTrack = !solo && audible(songData.mix)",
        "new": """    // B-39 STAGE6: канал «Песня» не дублирует главную дорожку B-39.
    const songTrack = !solo && audible(songData.mix) && !(window.StruChordExport && window.StruChordExport.hasTracks())""",
        "detect": "const songTrack = !solo && audible(songData.mix) && !(window.StruChordExport",
    },
]


def backup(target, data):
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    out = target.parent / (target.name + ".bak-" + stamp)
    n = 1
    while out.exists():
        out = target.parent / (target.name + f".bak-{stamp}-{n}")
        n += 1
    out.write_text(data, encoding="utf-8")
    return out


def check(data):
    problems = []
    print("Проверка якорей:")
    for part in BLOCKS:
        print(f"  [{part['name']}]")
        for label, needle in list(part["required"].items()) + [("anchor", part["anchor"])]:
            cnt = data.count(needle)
            loose = label in ("metadata (хук 2)", "партии (хук 3)")
            good = cnt >= 1 if loose else cnt == 1
            print(f"    {label:28} {'OK' if good else 'ПРОБЛЕМА'} ({cnt})")
            if not good:
                problems.append(f"{part['name']} / {label}: вхождений {cnt}")
    for h in HOOKS:
        want = h.get("count", 1)
        applied = data.count(h["detect"]) >= want
        old_cnt = data.count(h["old"])
        good = applied or old_cnt == want
        print(f"    хук {h['name'][:40]:40} {'OK' if good else 'ПРОБЛЕМА'} "
              f"({'уже применён' if applied else 'готов, вхождений ' + str(old_cnt) + '/' + str(want)})")
        if not good:
            problems.append(f"хук {h['name']}: вхождений старого {old_cnt}, ждали {want}")
    return problems


def apply_blocks(data, uninstall=False):
    for part in BLOCKS:
        text = block(part["file"])
        begin, end = part["begin"], part["end"]
        has_block = begin in data and end in data
        if uninstall:
            if has_block:
                # Блоки «после якоря» вставлялись с ведущим \n — его тоже
                # надо съесть, иначе откат оставит лишнюю пустую строку.
                lead = r"\n?" if part.get("mode") == "after" else ""
                pattern = lead + re.escape(begin) + r".*?" + re.escape(end) + r"\n?"
                data = re.sub(pattern, "", data, count=1, flags=re.S)
                print(f"  - {part['name']}: блок удалён")
            continue
        if has_block:
            data = re.sub(re.escape(begin) + r".*?" + re.escape(end) + r"\n?",
                          lambda m: text, data, count=1, flags=re.S)
            print(f"  ~ {part['name']}: блок обновлён")
        elif begin in data or end in data:
            raise SystemExit(f"❌ {part['name']}: найден только один маркер — файл повреждён")
        else:
            anchor = part["anchor"]
            if data.count(anchor) != 1:
                raise SystemExit(f"❌ {part['name']}: якорь вставки не уникален")
            if part.get("mode") == "after":
                data = data.replace(anchor, anchor + "\n" + text, 1)
            else:
                data = data.replace(anchor, text + anchor, 1)
            print(f"  + {part['name']}: блок вставлен")
    return data


def apply_hooks(data, uninstall=False):
    for h in HOOKS:
        want = h.get("count", 1)
        applied = data.count(h["detect"]) >= want
        if uninstall:
            if applied:
                if data.count(h["new"]) != want:
                    raise SystemExit(f"❌ хук {h['name']}: новый текст встречается "
                                    f"{data.count(h['new'])} раз, ждали {want}")
                data = data.replace(h["new"], h["old"])
                print(f"  - хук {h['name']}: откачен")
            continue
        if applied:
            print(f"  ~ хук {h['name']}: уже применён")
            continue
        if data.count(h["old"]) != want:
            raise SystemExit(f"❌ хук {h['name']}: старый текст встречается "
                            f"{data.count(h['old'])} раз, ждали {want}")
        data = data.replace(h["old"], h["new"])
        print(f"  + хук {h['name']}: применён")
    return data


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = {a for a in sys.argv[1:] if a.startswith("--")}
    if not args:
        raise SystemExit("Использование: python3 apply_patch.py STRUCHORD.html [--check|--uninstall]")
    target = Path(args[0]).expanduser().resolve()
    if not target.is_file():
        raise SystemExit(f"Файл не найден: {target}")
    data = target.read_text(encoding="utf-8")
    print(f"Файл: {target}")
    print(f"Размер: {len(data):,} символов, строк: {data.count(chr(10)):,}")

    problems = check(data)
    if problems:
        print("\n❌ Якоря не совпали. Патч НЕ применён.")
        for p in problems:
            print("   -", p)
        print("   Покажи этот вывод программисту: он поправит один якорь в BLOCKS/HOOKS.")
        return 1
    if "--check" in flags:
        print("\n✅ Проверка пройдена. Файл не изменён.")
        return 0

    before = data
    try:
        data = apply_hooks(data, uninstall="--uninstall" in flags)
        data = apply_blocks(data, uninstall="--uninstall" in flags)
    except SystemExit as e:
        print(e)
        return 1
    bak = backup(target, before)
    target.write_text(data, encoding="utf-8")
    action = "откачен" if "--uninstall" in flags else "применён"
    print(f"\n✅ Патч B-39 (части 1–7, волна закрыта) {action}.")
    print(f"   Было: {len(before):,} -> стало: {len(data):,} символов "
          f"({'+' if len(data) >= len(before) else ''}{len(data)-len(before):,})")
    print(f"   Резервная копия: {bak}")
    print("\nПроверка: node B-39-tests/test_stage0.js <оригинал> <файл>")
    print("           node B-39-tests/test_stage1.js <оригинал> <файл>")
    print("           node B-39-tests/test_stage2.js <оригинал> <файл>")
    print("           node B-39-tests/test_stage3.js <оригинал> <файл>")
    print("           node B-39-tests/test_stage4.js <оригинал> <файл>")
    print("           node B-39-tests/test_stage5.js <оригинал> <файл>")
    print("           node B-39-tests/test_stage6.js <оригинал> <файл>")
    print("    Затем R7/R6: python3 B-39-tests/bump_release.py STRUCHORD.html sw.js ROADMAP.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
