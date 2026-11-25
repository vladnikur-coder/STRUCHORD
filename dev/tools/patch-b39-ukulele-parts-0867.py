#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""B-39 «Укулеле», Этап 2 (0.867): 4-струнные «Партии».

Укулеле получает полноценный домен «Партий»: четыре струны, четыре
фиксированных строя (как у дорожек 0.866), лады 0..15, табулатурные рулоны,
гриф, звук нейлонового щипка и экспорт GPX/GP5/MIDI (GM 24, Nylon Guitar).

Правила: только точные замены с проверкой числа вхождений; ничего не
переписываем «на глаз». Запуск: python3 dev/tools/patch-b39-ukulele-parts-0867.py
"""
import io
import sys

PATH = 'STRUCHORD.html'


def rep(text, old, new, count=1, label=''):
    n = text.count(old)
    if n != count:
        sys.exit('FAIL %s: expected %d, found %d for %r' % (label, count, n, old[:90]))
    return text.replace(old, new)


with io.open(PATH, encoding='utf-8') as f:
    html = f.read()
original = html

# ── 1. Строи укулеле и общие помощники ───────────────────────────────────────
anchor = """  { id: 'bass-d-std', group: 'Бас', name: 'Бас: D G C F', notes: ['D1', 'G1', 'C2', 'F2'] },
];
"""
html = rep(html, anchor, anchor + """
// B-39 Этап 2 (0.867): строи укулеле для «Партий» — те же четыре, что у
// дорожек 0.866. Порядок струн — от 4-й к 1-й, как в модели. Своего строя
// у укулеле нет: владелец выбрал фиксированный набор.
const PART_UKULELE_TUNINGS = [
  { id: 'uke-high-g', group: 'Укулеле', name: 'Укулеле: High G (стандартный)', notes: ['G4', 'C4', 'E4', 'A4'] },
  { id: 'uke-low-g', group: 'Укулеле', name: 'Укулеле: Low G', notes: ['G3', 'C4', 'E4', 'A4'] },
  { id: 'uke-baritone', group: 'Укулеле', name: 'Укулеле: Баритон (D G B E)', notes: ['D3', 'G3', 'B3', 'E4'] },
  { id: 'uke-canadian', group: 'Укулеле', name: 'Укулеле: Canadian (A D F# B)', notes: ['A4', 'D4', 'F#4', 'B4'] },
];
const PART_UKULELE_DEFAULT_TUNING = 'uke-high-g';
const PART_UKULELE_MAX_FRET = 15;

// Таблица строёв роли: у баса и укулеле свои наборы, у остальных — гитарные.
function partTuningTable(inst) {
  if (inst === 'bass') return PART_BASS_TUNINGS;
  if (inst === 'ukulele') return PART_UKULELE_TUNINGS;
  return TUNER_TUNINGS;
}

// Потолок лада роли: у укулеле 15, у остальных исторические 24.
function partFretLimit(part) {
  return part && partInstrumentId(part) === 'ukulele' ? PART_UKULELE_MAX_FRET : PART_MAX_FRET;
}
""", label='tables')

# ── 2. Тембр укулеле ────────────────────────────────────────────────────────
html = rep(html, """const PART_TIMBRE = {
  guitar: { gain: 0.42, bright: 0.45, spread: 0.5, ringCap: 3 },
  bass: { gain: 0.5, bright: 0.26, spread: 0.34, ringCap: 3.5 },
};""", """const PART_TIMBRE = {
  guitar: { gain: 0.42, bright: 0.45, spread: 0.5, ringCap: 3 },
  bass: { gain: 0.5, bright: 0.26, spread: 0.34, ringCap: 3.5 },
  // B-39 Этап 2: укулеле — нейлон: тише гитары, светлее баса и короче звенит.
  ukulele: { gain: 0.46, bright: 0.58, spread: 0.4, ringCap: 2.4 },
};""", label='timbre')

# ── 3. Свой строй укулеле запрещён ──────────────────────────────────────────
html = rep(html, """function partCustomStrings(part) {
  const list = part && Array.isArray(part.strings) ? part.strings : null;""",
                 """function partCustomStrings(part) {
  // B-39 Этап 2: у укулеле четыре готовых строя и никакого «своего» —
  // решение владельца для дорожек 0.866 действует и в «Партиях».
  if (part && part.instrument === 'ukulele') return null;
  const list = part && Array.isArray(part.strings) ? part.strings : null;""", label='custom strings guard')

html = rep(html, """function partSongDefaultNotes(inst) {
  if (inst === 'bass') {
    return songTuningNotes().slice(0, PART_INSTRUMENTS.bass.strings).map((note) => bassOctaveDown(note));
  }
  if (inst !== 'guitar') return TUNER_TUNINGS.find((t) => t.id === 'e-std').notes.slice();""",
                 """function partSongDefaultNotes(inst) {
  if (inst === 'bass') {
    return songTuningNotes().slice(0, PART_INSTRUMENTS.bass.strings).map((note) => bassOctaveDown(note));
  }
  // У укулеле нет строя «как в песне»: только свои четыре пресета.
  if (inst === 'ukulele') return PART_UKULELE_TUNINGS[0].notes.slice();
  if (inst !== 'guitar') return TUNER_TUNINGS.find((t) => t.id === 'e-std').notes.slice();""",
                 label='song default notes')

# ── 4. Нотационная роль: укулеле — таб-домен ────────────────────────────────
html = rep(html, """  const inst = partInstrumentId(part);
  return inst !== 'guitar' && inst !== 'bass';
}""", """  const inst = partInstrumentId(part);
  // B-39 Этап 2: укулеле, как гитара и бас, живёт в табулатурном домене —
  // абсолютные MIDI-ноты ему не нужны.
  return inst !== 'guitar' && inst !== 'bass' && inst !== 'ukulele';
}""", label='pitch notes')

html = rep(html, """function partDefaultNotationView(part) {
  const inst = partInstrumentId(part);
  return inst === 'guitar' || inst === 'bass' ? 'tab' : 'staff';
}""", """function partDefaultNotationView(part) {
  const inst = partInstrumentId(part);
  return inst === 'guitar' || inst === 'bass' || inst === 'ukulele' ? 'tab' : 'staff';
}""", label='default notation')

html = rep(html, """    if (inst === 'guitar' || inst === 'bass') flags = { staff: true, tab: true, slash: false };""",
                 """    if (inst === 'guitar' || inst === 'bass' || inst === 'ukulele') flags = { staff: true, tab: true, slash: false };""",
                 label='notation flags')

# ── 5. Лад и позиции ────────────────────────────────────────────────────────
html = rep(html, """    return Number.isInteger(fret) && fret >= 0 && fret <= PART_MAX_FRET ? { line, fret } : null;""",
                 """    return Number.isInteger(fret) && fret >= 0 && fret <= partFretLimit(part) ? { line, fret } : null;""",
                 label='pitch positions')

# ── 6. Строй партии ─────────────────────────────────────────────────────────
html = rep(html, """  const table = inst === 'bass' ? PART_BASS_TUNINGS : TUNER_TUNINGS;
  const preset = part && part.tuning ? table.find((t) => t.id === part.tuning) : null;
  if (preset && preset.notes.length === partStringCount(part)) return preset.notes.slice();
  if (inst === 'ukulele') return ['G4', 'C4', 'E4', 'A4'];""",
                 """  const table = partTuningTable(inst);
  const preset = part && part.tuning ? table.find((t) => t.id === part.tuning) : null;
  if (preset && preset.notes.length === partStringCount(part)) return preset.notes.slice();
  if (inst === 'ukulele') return PART_UKULELE_TUNINGS[0].notes.slice();""",
                 label='part tuning notes')

html = rep(html, """  const table = inst === 'bass' ? PART_BASS_TUNINGS : TUNER_TUNINGS;
  const preset = part && part.tuning ? table.find((t) => t.id === part.tuning) : null;
  if (preset) return preset.name;
  if (inst !== 'guitar' && inst !== 'bass') return 'E Standard';""",
                 """  const table = partTuningTable(inst);
  const preset = part && part.tuning ? table.find((t) => t.id === part.tuning) : null;
  if (preset) return preset.name;
  if (inst === 'ukulele') return 'High G (стандартный)';
  if (inst !== 'guitar' && inst !== 'bass') return 'E Standard';""",
                 label='part tuning name')

# остальные таблицы строёв
html = rep(html, "  const table = inst === 'bass' ? PART_BASS_TUNINGS : TUNER_TUNINGS;",
                 "  const table = partTuningTable(inst);", count=4, label='table helper calls')

html = rep(html, """  const currentTable = current === 'bass' ? PART_BASS_TUNINGS : TUNER_TUNINGS;
  const nextTable = next === 'bass' ? PART_BASS_TUNINGS : TUNER_TUNINGS;""",
                 """  const currentTable = partTuningTable(current);
  const nextTable = partTuningTable(next);""", label='setPartInstrument tables')

html = rep(html, """  const oldTab = current === 'guitar' || current === 'bass';
  const nextTab = next === 'guitar' || next === 'bass';""",
                 """  const oldTab = current === 'guitar' || current === 'bass' || current === 'ukulele';
  const nextTab = next === 'guitar' || next === 'bass' || next === 'ukulele';""",
                 label='string families')

html = rep(html, """  if (next !== 'drums' && nextTuning && !nextTable.some((t) => t.id === nextTuning)) {
    nextTuning = next === 'guitar' || next === 'bass' ? null : 'e-std';
  } else if (!nextTuning && next !== 'guitar' && next !== 'bass' && next !== 'drums') {
    nextTuning = 'e-std';
  }""", """  const fixedDefault = next === 'ukulele' ? PART_UKULELE_DEFAULT_TUNING : 'e-std';
  if (next !== 'drums' && nextTuning && !nextTable.some((t) => t.id === nextTuning)) {
    nextTuning = next === 'guitar' || next === 'bass' ? null : fixedDefault;
  } else if (!nextTuning && next !== 'guitar' && next !== 'bass' && next !== 'drums') {
    nextTuning = fixedDefault;
  }""", label='instrument tuning defaults')

# ── 7. Свой строй: укулеле только пресеты ───────────────────────────────────
html = rep(html, """  const preset = table.find((t) => t.notes.join() === notes.join());
  if (preset) return { tuning: preset.id, strings: null };
  if (notes.join() === partSongDefaultNotes(inst).join()) return { tuning: null, strings: null };
  return { tuning: null, strings: notes.slice() };""",
                 """  const preset = table.find((t) => t.notes.join() === notes.join());
  if (preset) return { tuning: preset.id, strings: null };
  // Укулеле живёт только на четырёх пресетах: произвольный строй отклоним.
  if (inst === 'ukulele') return { tuning: null, strings: null, unsupported: true };
  if (notes.join() === partSongDefaultNotes(inst).join()) return { tuning: null, strings: null };
  return { tuning: null, strings: notes.slice() };""",
                 label='preset match guard')

html = rep(html, """      const match = partStringsMatchPreset(part, notes);
      if (prunePartNotes(part, partInstrumentId(part), match.tuning, match.strings) < 0) return;""",
                 """      const match = partStringsMatchPreset(part, notes);
      if (match.unsupported) { showToast('Для укулеле доступны четыре готовых строя'); return; }
      if (prunePartNotes(part, partInstrumentId(part), match.tuning, match.strings) < 0) return;""",
                 label='dialog apply guard')

html = rep(html, """  const match = partStringsMatchPreset(part, clean);
  if (prunePartNotes(part, inst, match.tuning, match.strings) < 0) return;""",
                 """  const match = partStringsMatchPreset(part, clean);
  if (match.unsupported) { showToast('Для укулеле доступны четыре готовых строя'); return; }
  if (prunePartNotes(part, inst, match.tuning, match.strings) < 0) return;""",
                 label='apply strings guard')

# ── 8. Неиграбельные ноты и потолок лада ────────────────────────────────────
html = rep(html, """  if (instrument !== 'guitar' && instrument !== 'bass') return [];
  // strings: массив нот (свой строй) или null. Явно перебиваем поле part:""",
                 """  if (instrument !== 'guitar' && instrument !== 'bass' && instrument !== 'ukulele') return [];
  // strings: массив нот (свой строй) или null. Явно перебиваем поле part:""",
                 label='unplayable roles')

html = rep(html, """      if (note.string >= stringCount || !open[note.string] || note.fret > PART_MAX_FRET) bad.push(note);""",
                 """      if (note.string >= stringCount || !open[note.string] || note.fret > partFretLimit({ instrument })) bad.push(note);""",
                 label='unplayable fret')

html = rep(html, """    `У этой партии ${bad.length} нот на струнах, которых нет у выбранного инструмента или строя (у него ${playable} струн, лад до ${PART_MAX_FRET}). Убрать их?`""",
                 """    `У этой партии ${bad.length} нот на струнах, которых нет у выбранного инструмента или строя (у него ${playable} струн, лад до ${partFretLimit({ instrument })}). Убрать их?`""",
                 label='prune text')

html = rep(html, """      if (!Number.isInteger(note.fret) || note.fret > PART_MAX_FRET) return; // сохранённые высокие лады пунктиром видны, но недоступны для звука""",
                 """      if (!Number.isInteger(note.fret) || note.fret > partFretLimit(part)) return; // сохранённые высокие лады пунктиром видны, но недоступны для звука""",
                 label='playback fret cap')

html = rep(html, """  if (!Number.isInteger(fret) || fret < 0 || fret > PART_MAX_FRET) return;
  const openFreqs = partOpenFreqs(part);""",
                 """  if (!Number.isInteger(fret) || fret < 0 || fret > partFretLimit(part)) return;
  const openFreqs = partOpenFreqs(part);""",
                 label='preview fret cap')

html = rep(html, """      !Number.isInteger(fret) || fret < 0 || fret > PART_MAX_FRET) return;""",
                 """      !Number.isInteger(fret) || fret < 0 || fret > partFretLimit(st.part)) return;""",
                 label='pitch fret cap')

html = rep(html, """  const fret = combined !== null && combined <= PART_MAX_FRET ? combined : digit;

  if (partUsesPitchNotes(part)) {""",
                 """  const fret = combined !== null && combined <= partFretLimit(part) ? combined : digit;

  if (partUsesPitchNotes(part)) {""",
                 label='input fret cap')

html = rep(html, """    const unplayable = note.string >= stringCount || !tuningNotes[note.string] || note.fret > PART_MAX_FRET;""",
                 """    const unplayable = note.string >= stringCount || !tuningNotes[note.string] || note.fret > partFretLimit(part);""",
                 label='roll unplayable')

html = rep(html, """      : note.string >= stringCount || !tuningNotes[note.string] || note.fret > PART_MAX_FRET);""",
                 """      : note.string >= stringCount || !tuningNotes[note.string] || note.fret > partFretLimit(part));""",
                 label='staff unplayable')

html = rep(html, """    for (let fret = 0; fret <= PART_MAX_FRET; fret++) {""",
                 """    for (let fret = 0; fret <= partFretLimit(part); fret++) {""", label='fretboard frets')

html = rep(html, """  for (let fret = 0; fret <= PART_MAX_FRET; fret++) {""",
                 """  for (let fret = 0; fret <= partFretLimit(part); fret++) {""", label='fretboard header')

# ── 9. Санитайзер партий ────────────────────────────────────────────────────
html = rep(html, """        const rawStrings = partStringsSanitize(rawPart.strings);""",
                 """        // Укулеле: только четыре готовых строя, свой строй не принимаем.
        const rawStrings = inst === 'ukulele' ? null : partStringsSanitize(rawPart.strings);""",
                 label='sanitize strings')

html = rep(html, """              if (!Number.isInteger(fret) || fret < 0 || fret > SONG_LIMITS.MAX_PART_FRET) return;""",
                 """              if (!Number.isInteger(fret) || fret < 0 || fret > (inst === 'ukulele' ? PART_UKULELE_MAX_FRET : SONG_LIMITS.MAX_PART_FRET)) return;""",
                 label='sanitize fret cap')

html = rep(html, """            : (inst === 'guitar' || inst === 'bass' ? 'tab' : 'staff'),""",
                 """            : (inst === 'guitar' || inst === 'bass' || inst === 'ukulele' ? 'tab' : 'staff'),""",
                 label='sanitize view mode')

html = rep(html, """              : (inst === 'keys' || inst === 'vocal' || inst === 'other' ? 'e-std' : null)),""",
                 """              : (inst === 'keys' || inst === 'vocal' || inst === 'other' ? 'e-std' : inst === 'ukulele' ? PART_UKULELE_DEFAULT_TUNING : null)),""",
                 label='sanitize tuning default')

# ── 10. Инструмент в панели партий ──────────────────────────────────────────
html = rep(html, """              <option value="guitar">Гитара</option>
              <option value="bass">Бас</option>""",
                 """              <option value="guitar">Гитара</option>
              <option value="ukulele">Укулеле</option>
              <option value="bass">Бас</option>""",
                 label='instrument option')

# ── 11. Экспорт: GM 24 Nylon Guitar ─────────────────────────────────────────
html = rep(html, """        Number.isInteger(p.gmProgram) ? p.gmProgram : inst === 'bass' ? 32 : inst === 'guitar' ? gpExportSongProgram(p.sound) : 0,""",
                 """        Number.isInteger(p.gmProgram) ? p.gmProgram : inst === 'bass' ? 32 : inst === 'guitar' ? gpExportSongProgram(p.sound) : inst === 'ukulele' ? 24 : 0,""",
                 label='midi program')

html = rep(html, """        gmProgram: Number.isInteger(part.gmProgram) ? part.gmProgram : null,""",
                 """        gmProgram: Number.isInteger(part.gmProgram) ? part.gmProgram : instrument === 'ukulele' ? 24 : null,""",
                 count=2, label='gp program fallback')

# ── 12. Версия ──────────────────────────────────────────────────────────────
html = rep(html, 'ver 0.866', 'ver 0.867', count=1, label='html version')

with io.open(PATH, 'w', encoding='utf-8') as f:
    f.write(html)

print('patched %s: %d -> %d bytes' % (PATH, len(original.encode('utf-8')), len(html.encode('utf-8'))))
