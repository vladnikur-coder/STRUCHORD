#!/usr/bin/env python3
"""B-39, итерация 0.797 (бэклог №24): ползунок «Насыщенность» влияет и на
отображаемое/звучащее расположение выбранной ячейки в панели клавиш.

saturateNotes: sat>=60 — октавное удвоение корня сверху (если влезает в диапазон
и спан правой руки <= 15); sat>=80 — плюс 13-я (иначе 9-я) сверху, если ступень
есть в аккорде. Ручной выбор (exactNotes / voicings[cell] / v:аккорд) — якорь и
не насыщается. Единый путь: voicingProvider (звук/превью/экспорт), renderPanel,
renderKeysVoicingSVG. R8 final=yes 2026-11-05 (ответы: double_ext, auto_only, unified).
"""
import sys

PATH = "STRUCHORD.html"

ANCHORS = [
    # 1. Новая функция saturateNotes перед listVoicingVariants.
    (
        """  // Единый список вариантов для UI (стрелки/тоггл), ручного выбора и звука:
  // ручной индекс всюду резолвится одинаково.
  function listVoicingVariants(chord, key, range, prev, opts) {""",
        """  // 0.797 (№24): ползунок «Насыщенность» действует и на расположение в панели
  // (авто-вариант; ручные exactNotes/voicings[cell] побеждают и не насыщаются).
  // sat>=60 — октавное удвоение корня сверху (если влезает и спан руки <= 15);
  // sat>=80 — плюс 13-я (иначе 9-я) сверху, если ступень есть в аккорде и влезает.
  function saturateNotes(trackId, notes, chordName, key, range) {
    var T = tracks(), t = T && T.track(trackId);
    var sat = t && Number.isInteger(t.saturation) ? t.saturation : null;
    if (sat === null || !Array.isArray(notes) || notes.length < 2 || !range) return notes;
    var F = formula(), f = (F && typeof F.chordFormula === 'function') ? F.chordFormula(chordName, key) : null;
    if (!f) return notes;
    var out = notes.slice().sort(function (a, b) { return a - b; });
    var high = range.high;
    function nextPcAbove(pc) {
      var top = out[out.length - 1];
      var m = top + mod12(pc - mod12(top));
      return (m > top && m <= high) ? m : null;
    }
    function spanOk(extra) {
      var rh = out.slice(1);
      var lo = rh.length ? rh[0] : out[0];
      return (extra - lo) <= 15;   // потолок генератора, как везде (0.793)
    }
    if (sat >= 60) {
      var dbl = nextPcAbove(f.rootPc);
      if (dbl !== null && spanOk(dbl)) out.push(dbl);
    }
    if (sat >= 80 && Array.isArray(f.tones)) {
      var extPc = null;
      for (var j = 0; j < f.tones.length; j++) if (f.tones[j].semitones === 21) { extPc = f.tones[j].pitchClass; break; }   // 13-я
      if (extPc === null) for (var k = 0; k < f.tones.length; k++) if (f.tones[k].semitones === 14) { extPc = f.tones[k].pitchClass; break; }   // 9-я
      if (extPc !== null) {
        var ext = nextPcAbove(extPc);
        if (ext !== null && spanOk(ext)) out.push(ext);
      }
    }
    return out.sort(function (a, b) { return a - b; });
  }

  // Единый список вариантов для UI (стрелки/тоггл), ручного выбора и звука:
  // ручной индекс всюду резолвится одинаково.
  function listVoicingVariants(chord, key, range, prev, opts) {""",
    ),
    # 2. voicingProvider: насыщение авто-варианта (звук/превью/экспорт — единый путь).
    (
        """    A.setVoicingProvider(function (chordName, key, range, prev, trackId, cell) {
      var exact=T.exactNotes(trackId,cell,chordName);if(exact)return exact;
      var linked=linkedSelection(trackId,cell);if(linked && linked.chord===chordName)return linked.notes.slice();
      var variants = trackVariantList(trackId, chordName, key, range, prev);   // 0.794: voicingsVersion
      if (!variants.length) return null;
      var idx = variantIndex(trackId, chordName, cell) % variants.length;   // 0.795 (№21): per-cell якорь
      return variants[idx];
    });""",
        """    A.setVoicingProvider(function (chordName, key, range, prev, trackId, cell) {
      var exact=T.exactNotes(trackId,cell,chordName);if(exact)return exact;
      var t=T.track(trackId), tv=(t && t.voicings) || {};
      var manualIdx=Number.isInteger(tv[cell]) ? tv[cell] : (typeof T.voicingForChord==='function' ? T.voicingForChord(trackId,chordName) : null);
      var linked=linkedSelection(trackId,cell);
      if(linked && linked.chord===chordName){
        if(linked.manual || Number.isInteger(manualIdx)) return linked.notes.slice();   // ручной выбор — якорь, без насыщения
        return saturateNotes(trackId, linked.notes, chordName, key, range);   // 0.797 (№24)
      }
      var variants = trackVariantList(trackId, chordName, key, range, prev);   // 0.794: voicingsVersion
      if (!variants.length) return null;
      var idx = variantIndex(trackId, chordName, cell) % variants.length;   // 0.795 (№21): per-cell якорь
      var notes = variants[idx];
      return Number.isInteger(manualIdx) ? notes : saturateNotes(trackId, notes, chordName, key, range);   // 0.797 (№24)
    });""",
    ),
    # 3. renderPanel: насыщение авто-расположения в панели.
    (
        """    var notes = exact || (selected && selected.chord===chord ? selected.notes.slice() : (variants.length ? variants[idx] : []));
    var acc=HOST.StruChordAccomp, sec=acc && acc.sectionFromCell(lastCellKey);""",
        """    var notes = exact || (selected && selected.chord===chord ? selected.notes.slice() : (variants.length ? variants[idx] : []));
    // 0.797 (№24): ползунок насыщенности действует и на авто-расположение в панели; ручной выбор не насыщается.
    if (!exact && chord && !(selected && selected.chord===chord && selected.manual)) {
      var tv=(active.track.voicings)||{};
      if (!Number.isInteger(tv[lastCellKey]) && !Number.isInteger(tv['v:'+chord])) notes=saturateNotes(active.track.id, notes, chord, panelKey(), range);
    }
    var acc=HOST.StruChordAccomp, sec=acc && acc.sectionFromCell(lastCellKey);""",
    ),
    # 4. renderKeysVoicingSVG: насыщение на карточке/SVG.
    (
        """    var notes = exact || (linked && linked.chord===chordName ? linked.notes.slice() : variants[idx]), acc=HOST.StruChordAccomp, sec=acc && acc.sectionFromCell(o.cellKey);""",
        """    var notes = exact || (linked && linked.chord===chordName ? linked.notes.slice() : variants[idx]);
    // 0.797 (№24): насыщенность и на карточке/SVG; ручной выбор не насыщается.
    if (!exact && chordName && !(linked && linked.chord===chordName && linked.manual)) {
      var tv2=((T.track(trackId)||{}).voicings)||{};
      if (!Number.isInteger(tv2[o.cellKey]) && !Number.isInteger(tv2['v:'+chordName])) notes=saturateNotes(trackId, notes, chordName, currentKey(), range);
    }
    var acc=HOST.StruChordAccomp, sec=acc && acc.sectionFromCell(o.cellKey);""",
    ),
    # 5. Экспорт saturateNotes в API (для тестов).
    (
        "    generateKeysVoicings: generateKeysVoicings, listVoicingVariants: listVoicingVariants, trackVariantList: trackVariantList, voicingVariantStructure: voicingVariantStructure,",
        "    generateKeysVoicings: generateKeysVoicings, listVoicingVariants: listVoicingVariants, trackVariantList: trackVariantList, voicingVariantStructure: voicingVariantStructure, saturateNotes: saturateNotes,   // 0.797 (№24)",
    ),
]


def main():
    with open(PATH, "r", encoding="utf-8") as f:
        s = f.read()
    for i, (old, new) in enumerate(ANCHORS, 1):
        n = s.count(old)
        if n != 1:
            print(f"ПАТЧ НЕ ПРИМЕНЁН: якорь {i} найден {n} раз (ожидался 1)")
            sys.exit(1)
        s = s.replace(old, new)
    with open(PATH, "w", encoding="utf-8") as f:
        f.write(s)
    print(f"OK: применено якорей {len(ANCHORS)}")


if __name__ == "__main__":
    main()
