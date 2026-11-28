#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""0.871 · B-39 Этап 3, волна 2: экспорт и Лента для укулельной таб-вставки.

Что делает патч:
  • GP5/GPX/GPIF: таб-вставки выгружаются по домену — гитарная дорожка «Табы»
    остаётся прежней (6 струн, строй песни, капо), укулельная получает свою
    дорожку на 4 струны со строем вставки; писатели уже знают
    `instrument === 'ukulele'` → FretCount 15 и GM 24.
  • MIDI: укулельная вставка не попадает в гитарный строй песни (раньше
    высота считалась по 6-струнному строю и была неверной) — для каждой
    укулельной настройки создаётся своя 4-струнная дорожка (GM 24).

Лента и закреп используют тот же `renderTabInsertHtml`, поэтому домен
(4-струнная миниатюра, серость чужой вставки) приходит и туда — проверяется
тестом, правок кода не требует.

Только точные замены с проверкой числа вхождений.
"""
import io
import sys

PATH = 'STRUCHORD.html'


def rep(text, old, new, count=1, label=''):
    n = text.count(old)
    if n != count:
        sys.exit('FAIL %s: expected %d, found %d for %r' % (label, count, n, old[:120]))
    return text.replace(old, new)


with io.open(PATH, encoding='utf-8') as f:
    html = f.read()
size0 = len(html.encode('utf-8'))

i = html.index('  function gpExportBuildTabPart(songData, plans, report, nativeRepeats = false) {')
j = html.index('  function gpExportBuildModel(songData, report) {')
old_block = html[i:j]

new_block = r'''  // 0.871 (B-39 Этап 3, волна 2): таб-вставки выгружаются по домену.
  // Гитара — прежняя отдельная дорожка «Табы» (6 струн, строй песни, капо);
  // укулеле — своя дорожка на 4 струны со строем вставки. Писатели GP5 и GPIF
  // уже знают `instrument === 'ukulele'`: 15 ладов и GM 24 (Nylon).
  function gpExportTabDomainKey(obj) {
    const domain = tabInsertDomainFrom(obj);
    return domain.instrument === 'ukulele' ? 'uke:' + domain.tuning : 'guitar';
  }

  function gpExportBuildTabParts(songData, plans, report, nativeRepeats = false) {
    const buckets = new Map();
    const bucketFor = (obj) => {
      const key = gpExportTabDomainKey(obj);
      if (buckets.has(key)) return buckets.get(key);
      const domain = tabInsertDomainFrom(obj);
      let part;
      if (domain.instrument === 'ukulele') {
        const list = typeof PART_UKULELE_TUNINGS !== 'undefined' && Array.isArray(PART_UKULELE_TUNINGS) ? PART_UKULELE_TUNINGS : [];
        const preset = list.find((t) => t.id === domain.tuning) || list[0] || null;
        const short = preset ? String(preset.name || '').replace(/^Укулеле:\s*/, '').split(' (')[0] : '';
        const tuning = preset && Array.isArray(preset.notes) ? preset.notes.slice(0, domain.strings) : [];
        part = {
          name: 'Табы (укулеле' + (short ? ', ' + short : '') + ')',
          instrument: 'ukulele', viewMode: 'tab', capo: 0, gmProgram: 24,
          tuning, mix: null, lyrics: [], notes: [],
        };
        if (!tuning.length) gpExportLoss(report, 'Табы (укулеле): строй не найден, записан строй High G', 1);
        else gpExportGain(report, 'Дорожка «Табы (укулеле)»: 4 струны, лады 0–15, GM 24', 1);
      } else {
        part = {
          name: 'Табы', instrument: 'guitar', viewMode: 'tab',
          capo: Number(songData.capo) || 0, gmProgram: gpExportSongProgram(songData.sound),
          tuning: gpExportSongTuning(songData), mix: songData.mix || null, lyrics: [], notes: [],
        };
      }
      const item = { key, domain, part, hadSource: false };
      buckets.set(key, item);
      return item;
    };
    const appendTabSegment = (item, plan, rawNotes, segBeats, baseOffset) => {
      const part = item.part;
      const raw = tabInsertCleanNotes(rawNotes, segBeats, plan.parentTimeSig, item.domain), edges = tabTechEdges(raw);
      if (raw.some((n) => !n.pause)) item.hadSource = true;
      for (const n of raw) {const issue=tabTechIssue(n,part.tuning,part.capo);if(issue)gpExportLoss(report,'TAB: '+issue+' — нота не экспортирована',1);}
      for (const n of raw) for (const key of ['legato','slur',...(['legato','shift'].includes(n.slide)?['slide']:[])] )
        if (n[key] && !edges.some(e=>e.from===n&&e.key===key)) gpExportLoss(report,'TAB: незавершённая связь H/P, фразировки или слайда без соседней ноты не экспортирована',1);
      const clean = tabTechExportNotes(raw, part.tuning, part.capo);
      for (let pass = 0; pass < (nativeRepeats ? 1 : plan.repeatCount); pass++) {
        for (const note of clean) {
          if (note.pause) continue;
          const placed = gpExportPlace(plan, baseOffset + note.start, tabInsertNoteDuration(note), report, 'Табулатура', pass);
          if (!placed) continue;
          part.notes.push({ ...note, ...placed, voice: 1, string: note.string, fret: note.fret });
          if (nativeRepeats && note.harm?.type === 'artificial' && note.harmonicFret == null) gpExportLoss(report, 'GP5: искусственный флажолет вне поддержанных узлов записан октавным', 1);
          if (nativeRepeats && note.vibrato === "wide") gpExportLoss(report, "GP5: широкое вибрато записано обычным — амплитуда не кодируется", 1);
          if (nativeRepeats && note.phraseOrigin) gpExportLoss(report, "GP5: отдельная фразировочная лига не кодируется; H/P и лиги длительности сохранены", 1);
        }
      }
    };
    for (const plan of plans) {
      let offset = 0;
      for (const sq of plan.section.squares || []) {
        const length = getSquareBeats(sq, plan.parentTimeSig);
        if (sq.type === 'tab') {
          appendTabSegment(bucketFor(sq), plan, sq.notes, length, offset);
        } else if (Array.isArray(sq.events)) {
          let evOff = 0;
          for (const ev of sq.events) {
            const evSpan = getEventSpanInParentUnits(ev, plan.parentTimeSig);
            if (isInlineTabEvent(ev)) appendTabSegment(bucketFor(ev), plan, ev.tabNotes, Math.max(1 / 16, Number(ev.span) || 1), offset + evOff);
            evOff += evSpan;
          }
        }
        offset += length;
      }
    }
    const out = [];
    for (const item of buckets.values()) {
      if (!item.part.notes.length && !item.hadSource) continue;
      if (item.part.notes.length) {
        gpExportGain(report, item.domain.instrument === 'ukulele' ? 'Ноты табулатуры укулеле' : 'Ноты табулатуры (B-12.12)', item.part.notes.length);
      }
      out.push(item.part);
    }
    // Гитара идёт первой: у песен без укулеле порядок дорожек прежний.
    out.sort((a, b) => (a.instrument === 'ukulele' ? 1 : 0) - (b.instrument === 'ukulele' ? 1 : 0));
    return out;
  }

'''

html = html[:i] + new_block + html[j:]

# --- вызовы в двух моделях -------------------------------------------------
html = rep(
    html,
    """    // Таб-вставки B-12.12 — отдельная дорожка
    const tabPart = gpExportBuildTabPart(songData, plans, report);
    if (tabPart) model.parts.push(tabPart);""",
    """    // Таб-вставки B-12.12 — отдельные дорожки по домену (0.871)
    for (const tabPart of gpExportBuildTabParts(songData, plans, report)) model.parts.push(tabPart);""",
    1,
    'gpx tab parts call',
)

html = rep(
    html,
    """    // Таб-вставки B-12.12 — отдельная дорожка
    const tabPartGp5 = gpExportBuildTabPart(songData, plans, report, true);
    if (tabPartGp5) model.parts.push(tabPartGp5);""",
    """    // Таб-вставки B-12.12 — отдельные дорожки по домену (0.871)
    for (const tabPartGp5 of gpExportBuildTabParts(songData, plans, report, true)) model.parts.push(tabPartGp5);""",
    1,
    'gp5 tab parts call',
)

# --- MIDI: свои 4-струнные дорожки ----------------------------------------
html = rep(
    html,
    """    const tabTrack=!songTrack && !solo && audible(songData.mix) && hasTab
      ? makeTrack('Таб-вставки','guitar',songData.mix,gpExportSongProgram(songData.sound),gpExportSongTuning(songData),songData.capo) : null;""",
    """    const tabTrack=!songTrack && !solo && audible(songData.mix) && hasTab
      ? makeTrack('Таб-вставки','guitar',songData.mix,gpExportSongProgram(songData.sound),gpExportSongTuning(songData),songData.capo) : null;
    // 0.871: укулельная вставка звучит на своих 4 струнах и в своём строе.
    // Раньше высота считалась по 6-струнному строю песни — ноты уезжали.
    const ukeTabTunings = [];
    if (!solo && audible(songData.mix)) {
      const noteUkeDomain = (obj) => {
        const d = tabInsertDomainFrom(obj);
        if (d.instrument !== 'ukulele' || ukeTabTunings.includes(d.tuning)) return;
        ukeTabTunings.push(d.tuning);
      };
      sections.forEach((sec) => (sec.squares || []).forEach((sq) => {
        if (sq.type === 'tab') noteUkeDomain(sq);
        else (sq.events || []).forEach((ev) => { if (isInlineTabEvent(ev)) noteUkeDomain(ev); });
      }));
    }
    const ukeTabTracks = new Map(ukeTabTunings.map((tuning) => [tuning, makeTrack('Табы (укулеле)', 'ukulele', songData.mix, 24,
      tabAtTuningNotesFor(tabInsertDomainFrom({ tabInstrument: 'ukulele', tabTuning: tuning })), 0)]));""",
    1,
    'midi uke tracks',
)

html = rep(
    html,
    """      const isTab=sq.type==='tab' || isInlineTabEvent(ev);
      const legacyTrack=isTab ? (songTrack || tabTrack) : songTrack;
      if (legacyTrack) {
        const program = gpExportSongProgram(songSoundAt(sec.id, win.start));
        if (!legacyTrack.programs.length || legacyTrack.programs[legacyTrack.programs.length - 1].program !== program) legacyTrack.programs.push({ at, program });
        if (isTab) {
          const tabSpan = sq.type === 'tab' ? getSquareBeats(sq, ts) : Math.max(1 / 16, Number(ev.span) || 1);
          const notes = tabInsertCleanNotes(sq.type === 'tab' ? sq.notes : ev.tabNotes, tabSpan, ts);""",
    """      const isTab=sq.type==='tab' || isInlineTabEvent(ev);
      // 0.871: у каждой таб-вставки свой домен — и своя дорожка в MIDI.
      const tabDomain=isTab ? tabInsertDomainFrom(sq.type==='tab' ? sq : ev) : null;
      const legacyTrack=isTab
        ? (tabDomain.instrument==='ukulele' ? (ukeTabTracks.get(tabDomain.tuning) || null) : (songTrack || tabTrack))
        : songTrack;
      if (legacyTrack) {
        const program = gpExportSongProgram(songSoundAt(sec.id, win.start));
        // У укулельной дорожки тембр фиксирован — GM 24, автоматику не пишем.
        if (tabDomain && tabDomain.instrument === 'ukulele') { /* GM 24 */ }
        else if (!legacyTrack.programs.length || legacyTrack.programs[legacyTrack.programs.length - 1].program !== program) legacyTrack.programs.push({ at, program });
        if (isTab) {
          const tabSpan = sq.type === 'tab' ? getSquareBeats(sq, ts) : Math.max(1 / 16, Number(ev.span) || 1);
          const notes = tabInsertCleanNotes(sq.type === 'tab' ? sq.notes : ev.tabNotes, tabSpan, ts, tabDomain);""",
    1,
    'midi domain routing',
)

with io.open(PATH, 'w', encoding='utf-8') as f:
    f.write(html)

size1 = len(html.encode('utf-8'))
print('OK %d -> %d (%+d)' % (size0, size1, size1 - size0))
