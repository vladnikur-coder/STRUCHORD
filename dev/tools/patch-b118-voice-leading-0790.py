#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""B-118 / 0.790 — голосоведение по всей песне (переход через границы секций).

Патч по якорям, без `git apply`. Применяется один раз к 0.789:

    python3 dev/tools/patch-b118-voice-leading-0790.py --check
    python3 dev/tools/patch-b118-voice-leading-0790.py

Кирпич B-39 «улучшение расположений»: владелец выбрал на R8 (2026-11-04)
обход **по всей песне** (включая границы секций и повторы) и цель
«минимум движения нот + лёгкий штраф за уход от середины клавиатуры»
(это уже считает chooseLinked/motionCost), ручной выбор и старые песни
защищены, полный комплект 0.790.

Диагноз (чтение кода до правки): кэш linkedSelection строился на ключ
`trackId:secId` — т.е. на ОДНУ секцию, `prev` начинался с null в начале
каждой секции, поэтому первый аккорд новой секции выбирался только по
центру руки и не продолжал последний аккорд предыдущей секции.

Решение: кэш на всю песню (ключ `trackId`), события — все ячейки всех
секций в порядке документа, `prev` перетекает через границы секций;
ключ каждой ячейки берётся из её собственной секции (e.sec.key).
Повторы и скачки (D.S./Coda) не раскрываются: повтор получает тот же
выбор, что первый проход — детерминированно, звук/превью/экспорт/
схема совпадают (все потребители ходят в linkedSelection).
Ручные exactNotes и индекс варианта по-прежнему имеют приоритет.
UI-подпись «Голосоведение внутри секции» → «Голосоведение по всей песне».

R7: версия в шапке HTML и CACHE_NAME в sw.js меняются парой.
"""
import argparse
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]


def replace_once(text, old, new, label):
    n = text.count(old)
    if n != 1:
        raise SystemExit('ПАТЧ НЕ ПРИМЕНЁН: якорь «%s» найден %d раз (нужен ровно 1)' % (label, n))
    return text.replace(old, new, 1)


CACHE_OLD = """  // Линейно обходим соседние ячейки внутри секции, с ограничением.
  // Кэш сбрасывается при любой команде песни и при загрузке/undo.
  function linkedSelection(trackId,cell) {
    var T=tracks(), t=T && T.track(trackId);
    if(!t || !t.linkedVoicings || !cell)return null;
    var secId=String(cell).split(':')[0], sec;
    try { sec=sections.find(function(s){return String(s.id)===secId;}); } catch(e) {return null;}
    if(!sec)return null;
    var cacheKey=String(trackId)+':'+secId, cache=linkedCache.get(cacheKey);
    if(!cache){
      cache={entries:{}, events:[], indexes:{}, next:0, prev:null, range:T.keyRange(trackId)};
      (sec.squares||[]).forEach(function(sq){(sq.events||[]).forEach(function(ev,ei){var k=T.cellKey(sec,sq,ei);cache.indexes[k]=cache.events.length;cache.events.push({sq:sq,ev:ev,ei:ei,cell:k});});});
      linkedCache.set(cacheKey,cache);
    }
    // Очень длинная секция после 2048 ячеек использует прежний алгоритм.
"""
CACHE_NEW = """  // 0.790 (B-118): линейно обходим ячейки ВСЕЙ песни (секции в порядке
  // документа), prev перетекает через границы секций. Повторы и скачки
  // (D.S./Coda) не раскрываются: у повтора тот же выбор, что у первого
  // прохода — детерминированно, звук/превью/экспорт/схема совпадают.
  // Кэш сбрасывается при любой команде песни и при загрузке/undo.
  function linkedSelection(trackId,cell) {
    var T=tracks(), t=T && T.track(trackId);
    if(!t || !t.linkedVoicings || !cell)return null;
    var secId=String(cell).split(':')[0], sec;
    try { sec=sections.find(function(s){return String(s.id)===secId;}); } catch(e) {return null;}
    if(!sec)return null;
    var cacheKey=String(trackId), cache=linkedCache.get(cacheKey);
    if(!cache){
      cache={entries:{}, events:[], indexes:{}, next:0, prev:null, range:T.keyRange(trackId)};
      sections.forEach(function(sec2){(sec2.squares||[]).forEach(function(sq){(sq.events||[]).forEach(function(ev,ei){var k=T.cellKey(sec2,sq,ei);cache.indexes[k]=cache.events.length;cache.events.push({sec:sec2,sq:sq,ev:ev,ei:ei,cell:k});});});});
      linkedCache.set(cacheKey,cache);
    }
    // Очень длинная песня после 2048 ячеек использует прежний алгоритм.
"""

KEY_OLD = """      var key=sec.key || currentKey(), exact=T.exactNotes(trackId,e.cell,chord);
"""
KEY_NEW = """      var key=(e.sec&&e.sec.key) || currentKey(), exact=T.exactNotes(trackId,e.cell,chord);
"""

FAR_OLD = """    // За пределом лимита выбираем независимо от истории воспроизведения:
    // схема, звук и экспорт должны совпадать даже в длинной секции.
    if(!cache.entries[cell] && cache.indexes[cell]>=2048){
      var far=cache.events[cache.indexes[cell]], name=T.trackChord(trackId,cell,far.ev);
      var exactFar=T.exactNotes(trackId,cell,name);
      if(exactFar) return {chord:name,notes:exactFar,manual:true,exact:true};
      var vi=t.voicings['v:'+name];if(!Number.isInteger(vi))vi=t.voicings[cell];
      var fallback=voiceLead(name,sec.key||currentKey(),cache.range,null,{}) ? [voiceLead(name,sec.key||currentKey(),cache.range,null,{})] : generateKeysVoicings(name,sec.key||currentKey(),cache.range,null,{});
"""
FAR_NEW = """    // За пределом лимита выбираем независимо от истории воспроизведения:
    // схема, звук и экспорт должны совпадать даже в длинной песне.
    if(!cache.entries[cell] && cache.indexes[cell]>=2048){
      var far=cache.events[cache.indexes[cell]], name=T.trackChord(trackId,cell,far.ev);
      var exactFar=T.exactNotes(trackId,cell,name);
      if(exactFar) return {chord:name,notes:exactFar,manual:true,exact:true};
      var vi=t.voicings['v:'+name];if(!Number.isInteger(vi))vi=t.voicings[cell];
      var fallback=voiceLead(name,(far.sec&&far.sec.key)||currentKey(),cache.range,null,{}) ? [voiceLead(name,(far.sec&&far.sec.key)||currentKey(),cache.range,null,{})] : generateKeysVoicings(name,(far.sec&&far.sec.key)||currentKey(),cache.range,null,{});
"""

LABEL_OLD = """linkRow.appendChild(doc.createTextNode(' Голосоведение внутри секции'));"""
LABEL_NEW = """linkRow.appendChild(doc.createTextNode(' Голосоведение по всей песне'));"""

HTML_OLD = """· ver 0.789</span></span>"""
HTML_NEW = """· ver 0.790</span></span>"""

SW_OLD = """const CACHE_NAME = 'struchord-v789';"""
SW_NEW = """const CACHE_NAME = 'struchord-v790';"""


def main():
    ap = argparse.ArgumentParser(description='B-118 / 0.790: голосоведение по всей песне (через границы секций)')
    ap.add_argument('--check', action='store_true', help='только проверить якоря, файлы не менять')
    args = ap.parse_args()
    jobs = [
        ('STRUCHORD.html', [
            (CACHE_OLD, CACHE_NEW, 'linkedSelection: кэш на всю песню, события всех секций, prev через границы'),
            (KEY_OLD, KEY_NEW, 'ключ ячейки из её секции (e.sec.key) в основном цикле'),
            (FAR_OLD, FAR_NEW, 'fallback за пределом 2048: ключ из секции дальней ячейки + комментарий'),
            (LABEL_OLD, LABEL_NEW, 'UI-подпись «Голосоведение по всей песне»'),
            (HTML_OLD, HTML_NEW, 'версия в шапке'),
        ]),
        ('sw.js', [
            (SW_OLD, SW_NEW, 'CACHE_NAME'),
        ]),
    ]
    out = {}
    for rel, edits in jobs:
        p = ROOT / rel
        text = p.read_text(encoding='utf-8')
        for old, new, label in edits:
            text = replace_once(text, old, new, rel + ': ' + label)
        out[rel] = text
        print('  ok  %-32s %d якорей' % (rel, len(edits)))
    if args.check:
        print('ПРОВЕРКА ПРОЙДЕНА: все якоря на месте, файлы не менялись.')
        return 0
    for rel, text in out.items():
        (ROOT / rel).write_text(text, encoding='utf-8')
    print('ПАТЧ ПРИМЕНЁН: 0.789 -> 0.790 (R7: HTML и sw.js выложены парой).')
    return 0


if __name__ == '__main__':
    sys.exit(main())
