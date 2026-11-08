#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# B-39 · 0.803 (бэклог №27): насыщенность = богатство звука, плавные кривые.
#
# Решения R8 final (2026-11-08, зафиксированы в c738cd5):
#   - семантика «А»: ползунок управляет только вертикалью (ноты в аккорде);
#   - плавные вероятности вместо порогов 60/80: удвоение smoothstep((sat-40)/50),
#     акцент 13/9 smoothstep((sat-70)/30);
#   - «беднее нормы»: ниже 40 — 2-нотный шелл (корень+3-я, для септаккордов
#     и корень+7-я) с вероятностью smoothstep((40-sat)/40);
#   - дефолт 50 чуть богаче (окно 40→90 даёт P(50)≈10%);
#   - плотность атак уходит из-под ползунка (множитель 0.75+sat/250 откатывается;
#     ей станет «Интенсивность» — бэклог №28);
#   - единые правила для всех жанров; панель зеркалит звук (те же кривые).
#
# Применять к чистому HEAD (97d503d). HTML руками не правим (правило README).

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def patch(path, replacements):
    p = ROOT / path
    text = p.read_text(encoding="utf-8")
    for old, new, desc in replacements:
        n = text.count(old)
        if n != 1:
            print(f"FAIL: {path}: паттерн «{desc}» найден {n} раз (ожидался 1)")
            sys.exit(1)
        text = text.replace(old, new)
    p.write_text(text, encoding="utf-8")
    print(f"ok: {path}: {len(replacements)} замен")

HTML = [
    # 1. candidates(): параметр preferShell.
    ("function candidates({low, high, bassPc, tones, shape, strictShape, preferDoubling}) {",
     "function candidates({low, high, bassPc, tones, shape, strictShape, preferDoubling, preferShell}) {",
     "candidates: сигнатура preferShell"),
    # 2. candidates(): 2-нотный шелл как вариант выбора.
    ("""    if (count===3 && pcs.length===3 && preferDoubling) {
      choices.push(base.concat(base[0]));
      choices.push(base.concat(base[2]));
    }
""",
     """    if (count===3 && pcs.length===3 && preferDoubling) {
      choices.push(base.concat(base[0]));
      choices.push(base.concat(base[2]));
    }
    // 0.803 (№27): «беднее нормы» — 2-нотный шелл; для септаккордов есть и
    // вариант корень+7-я (джазовый шелл), выбор остаётся за стоимостью.
    if (count===2 && preferShell && pcs.length>=4) choices.push([pcs[0],pcs[3]]);
""",
     "candidates: шелл-варианты"),
    # 3. candidates(): шелл-бонус в цене.
    ("""      const doubleBonus=choice.length>base.length ? 12 : 0;
      const cost=Math.abs(center(right)-target)*0.8 + Math.abs(bass-43)*0.35 + (Math.min(4,pcs.length)-count)*14 + shapeCost-doubleBonus;""",
     """      const doubleBonus=choice.length>base.length ? 12 : 0;
      const shellBonus=preferShell && count===2 ? (Math.min(4,pcs.length)-count)*14+16 : 0;   // 0.803 (№27): шелл решительно выигрывает у полного голосоведения
      const cost=Math.abs(center(right)-target)*0.8 + Math.abs(bass-43)*0.35 + (Math.min(4,pcs.length)-count)*14 + shapeCost-doubleBonus-shellBonus;""",
     "candidates: shellBonus"),
    # 4. Модуль: хелперы кривой/хэша + сигнатура planSequence.
    ("function planSequence({chords,low,high,bpm,role,saturation}) {   // 0.795 (№22)",
     """// 0.803 (№27): плавная кривая насыщенности (smoothstep) и детерминированный
// хэш (seed, аккорд) для вероятностных решений генератора.
function satSmooth(t) { t=Math.max(0,Math.min(1,t)); return t*t*(3-2*t); }
function satHash(seed,i,salt) { let h=(seed|0)>>>0; h=Math.imul(h^Math.imul(i+1,0x85ebca6b),0xc2b2ae35); h=Math.imul(h^(salt|0),0x27d4eb2f); h^=h>>>15; h=Math.imul(h,0x2545f491); h^=h>>>13; return (h>>>0)/4294967296; }
function planSequence({chords,low,high,bpm,role,saturation,seed}) {   // 0.795 (№22); 0.803 (№27): seed для кривых насыщения""",
     "planSequence: сигнатура + satSmooth/satHash"),
    # 5. planSequence: вероятностные удвоение/шелл.
    ("""    // 0.795 (№22): удвоение корня/квинты — по ползунку насыщенности; absent — прежнее правило припева.
    const satN=Number.isInteger(saturation)?saturation:null;
    const preferDoubling=chord.beats>=2 && bpm<=140 && (satN===null ? role==='chorus' : satN>=60);""",
     """    // 0.803 (№27): насыщенность = богатство звука. Удвоение корня/квинты —
    // плавная вероятность smoothstep((sat-40)/50); ниже нормы — «бедный»
    // 2-нотный шелл (корень+3-я/7-я) с вероятностью smoothstep((40-sat)/40).
    // Окна не пересекаются: доступность нот аккорда монотонна по ползунку.
    // absent — прежнее правило припева (0.795).
    const satN=Number.isInteger(saturation)?saturation:null;
    let preferDoubling=false, preferShell=false;
    if (satN===null) preferDoubling=chord.beats>=2 && bpm<=140 && role==='chorus';
    else {
      preferDoubling=chord.beats>=2 && bpm<=140 && satHash(seed,i,1)<satSmooth((satN-40)/50);
      preferShell=!preferDoubling && satHash(seed,i,2)<satSmooth((40-satN)/40);
    }""",
     "planSequence: вероятностные решения"),
    # 6. planSequence: candidates с preferShell.
    ("    const list=candidates({low,high,bassPc:chord.bassPc,tones:chord.tones,shape:chord.shape,strictShape:chord.strictShape,preferDoubling});",
     "    const list=candidates({low,high,bassPc:chord.bassPc,tones:chord.tones,shape:chord.shape,strictShape:chord.strictShape,preferDoubling,preferShell});",
     "planSequence: вызов candidates"),
    # 7. buildSection: seed в planSequence.
    ("const planned=planSequence({chords,low,high,bpm,role,saturation});   // 0.795 (№22)",
     "const planned=planSequence({chords,low,high,bpm,role,saturation,seed});   // 0.795 (№22); 0.803 (№27): seed для кривых насыщения",
     "buildSection: seed в planSequence"),
    # 8. Плотность больше не масштабируется ползунком (уходит в №28).
    ("""      const satN = Number.isInteger(saturation) ? saturation : null;   // 0.795 (№22): ползунок насыщенности масштабирует плотность роли
      const profileDensity=corpusProfile?1+(corpusProfile.d-1)*0.45:1;
      const strength = ROLE[role]*(satN===null?1:0.75+satN/250)*profileDensity, strong = downbeat ? 1 : (bassBeat ? 0.65 : 0.2);""",
     """      const profileDensity=corpusProfile?1+(corpusProfile.d-1)*0.45:1;
      const strength = ROLE[role]*profileDensity, strong = downbeat ? 1 : (bassBeat ? 0.65 : 0.2);   // 0.803 (№27): плотность — не насыщенность; ей станет «Интенсивность» (№28)""",
     "strength: плотность без ползунка"),
    # 9. saturateNotes: вложенные кривая/хэш.
    ("""  function saturateNotes(trackId, notes, chordName, key, range) {
    var T = tracks(), t = T && T.track(trackId);
    var sat = t && Number.isInteger(t.saturation) ? t.saturation : null;
    if (sat === null || !Array.isArray(notes) || notes.length < 2 || !range) return notes;
    var F = formula(), f = (F && typeof F.chordFormula === 'function') ? F.chordFormula(chordName, key) : null;
    if (!f) return notes;
""",
     """  function saturateNotes(trackId, notes, chordName, key, range) {
    var T = tracks(), t = T && T.track(trackId);
    var sat = t && Number.isInteger(t.saturation) ? t.saturation : null;
    if (sat === null || !Array.isArray(notes) || notes.length < 2 || !range) return notes;
    var F = formula(), f = (F && typeof F.chordFormula === 'function') ? F.chordFormula(chordName, key) : null;
    if (!f) return notes;
    // 0.803 (№27): кривая smoothstep в окне [from,to] и детерминированный хэш.
    function satCurveBetween(v, from, to) {
      var x = Math.max(0, Math.min(1, (v - from) / (to - from)));
      return x * x * (3 - 2 * x);
    }
    function satHashStr(s, salt) {
      var h = 2166136261 >>> 0;
      s = String(s) + '#' + salt;
      for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
      h ^= h >>> 13; h = Math.imul(h, 1274126177) >>> 0; h ^= h >>> 16;
      return h / 4294967296;
    }
""",
     "saturateNotes: вложенные satCurveBetween/satHashStr"),
    # 10. saturateNotes: октава — плавная вероятность (окно 40–90).
    ("""    if (sat >= 60) {
      var dbl = nextPcAbove(f.rootPc);""",
     """    // 0.803 (№27): плавные вероятности вместо порогов 60/80; решение
    // детерминировано по (дорожка, аккорд) — одинаковые аккорды насыщаются
    // одинаково, панель зеркалит звук.
    if (satHashStr(trackId + '|' + chordName, 1) < satCurveBetween(sat, 40, 90)) {
      var dbl = nextPcAbove(f.rootPc);""",
     "saturateNotes: октава по кривой 40–90"),
    # 11. saturateNotes: 13/9 — плавная вероятность (окно 70–100).
    ("    if (sat >= 80 && Array.isArray(f.tones)) {",
     "    if (satHashStr(trackId + '|' + chordName, 2) < satCurveBetween(sat, 70, 100) && Array.isArray(f.tones)) {",
     "saturateNotes: 13/9 по кривой 70–100"),
    # 12. Версия приложения.
    ("· ver 0.802", "· ver 0.803", "версия в шапке"),
]

ACC = [
    # 1. Хэш такта + сигнатура applyExtensionAccent.
    ("    function applyExtensionAccent(steps, C, beats, sub) {",
     """    // 0.803 (№27): детерминированный хэш такта для вероятностного акцента 13/9.
    function accentRand(s) {
      var h = 2166136261 >>> 0;
      s = String(s);
      for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
      h ^= h >>> 13; h = Math.imul(h, 1274126177) >>> 0; h ^= h >>> 16;
      return h / 4294967296;
    }
    function applyExtensionAccent(steps, C, beats, sub, p, hbase) {""",
     "applyExtensionAccent: сигнатура + accentRand"),
    # 2. Вероятностное решение по тактам.
    ("""      var perBar = Math.max(1, Math.round((Number(beats) || 1) * (Number(sub) || 1)));
      for (var bar = 0; bar < steps.length; bar += perBar) {""",
     """      var perBar = Math.max(1, Math.round((Number(beats) || 1) * (Number(sub) || 1)));
      for (var bar = 0; bar < steps.length; bar += perBar) {
        // 0.803 (№27): плавная вероятность вместо порога — такт решает хэш.
        if (p < 1 && accentRand(hbase + '#' + (bar / perBar)) >= p) continue;""",
     "applyExtensionAccent: вероятностный такт"),
    # 3. endAccentEnabled: вероятность 0..1 вместо порога >=80.
    ("      if (t && Number.isInteger(t.saturation)) return t.saturation >= 80;   // 0.795 (№22): акцент 13/9 от ползунка насыщенности",
     """      // 0.803 (№27): вероятность 0..1 — smoothstep((sat-70)/30), окно 70–100.
      if (t && Number.isInteger(t.saturation)) { var ax = Math.max(0, Math.min(1, (t.saturation - 70) / 30)); return ax * ax * (3 - 2 * ax); }""",
     "endAccentEnabled: кривая 70–100"),
    # 4. plan(): вероятность и база хэша считаются один раз.
    ("      var ev = o.ev || {};",
     """      var ev = o.ev || {};
      // 0.803 (№27): вероятность акцента 13/9 и детерминированная база хэша.
      var eaP = endAccentEnabled(o), eaBase = o.trackId + '|' + (o.sec && o.sec.id || '') + '|' + (o.sq || 0);""",
     "plan: eaP/eaBase"),
    # 5. Вызов в default-ветке.
    ("        if (endAccentEnabled(o)) applyExtensionAccent(single, C, span, sub);   // 0.789/0.793: 13-я/9-я сверху, если опция включена",
     "        if (eaP > 0) applyExtensionAccent(single, C, span, sub, eaP, eaBase);   // 0.789/0.793; 0.803 (№27): плавная вероятность",
     "plan: вызов в default-ветке"),
    # 6. Вызов в секционной ветке.
    ("      if (endAccentEnabled(o) && cfg.source !== 'cell' && !(o.pattern && o.pattern.status === 'manual')) out = applyExtensionAccent(out, C, beats, sub);",
     "      if (eaP > 0 && cfg.source !== 'cell' && !(o.pattern && o.pattern.status === 'manual')) out = applyExtensionAccent(out, C, beats, sub, eaP, eaBase);   // 0.803 (№27): плавная вероятность",
     "plan: вызов в секционной ветке"),
]

SW = [
    ("const CACHE_NAME = 'struchord-v802';", "const CACHE_NAME = 'struchord-v803';", "кэш Service Worker"),
]

if __name__ == "__main__":
    patch("STRUCHORD.html", HTML)
    patch("keyboard-accompaniment.js", ACC)
    patch("sw.js", SW)
    print("Готово: 0.803 применён.")
