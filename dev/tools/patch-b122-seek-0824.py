#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
B-122 · перемотка: клик по аккорду в редакторе и перемотка в Ленте (0.823 -> 0.824)

Жалоба владельца после 0.823: «перемотка через клик в редакторе и перемотка
в ленте недоработаны»; на уточнение — «сейчас перескакивают аккорды, но не
запись» (про клик во время игры), клик на паузе менять не нужно, в Ленте
клик по секции по-прежнему ставит паузу, клик по ячейке ленты не нужен.

Что нашлось в коде (read-only разбор + замер в Chromium):

1. Клик по аккорду во время игры вызывал в модуле записи `seekDuringPlayback`:
   он останавливал и перезапускал ТОЛЬКО запись, а песня продолжала старый
   отсчёт — `playbackStartTime`/`nextEventTime` не менялись, метроном шёл по
   прежней сетке. Плюс запись стартовала не «сейчас», а на `nextEventTime`,
   который планировщик держит впереди на 500 мс. Отсюда и наблюдение
   владельца: подсветка уже на нажатом аккорде, а звук ещё старый.
2. Все перемотки считали секунду записи как время сетки (`tAtQ`), забывая
   `trackOffset` — поправку «Сдвиг записи» (Option/Alt + перетаскивание в
   панели волны). При сдвинутой записи любая перемотка попадала мимо ровно
   на этот сдвиг: и старт после Play, и предпросмотр в Ленте, и клик по волне.
3. Лента: после прокрутки панель волны не обновляла ни время, ни бегунок —
   прокрутка меняла только подсветку ячейки.

Правки:
  A. Новая функция основного скрипта `seekPlaybackToCell()` — ОДИН перезапуск
     транспорта с нажатой ячейки (без отсчёта и без тоста). Запись, метроном,
     повторы секций и знаки структуры стартуют тем же путём, что обычный Play.
     Клик по аккорду во время игры теперь идёт через неё.
  B. `trackOffset` учитывается в `preparePlaybackStart`, `seekDuringPlayback`,
     `syncPreviewToPosition`/`pointTimeForPosition` и в клике по волне.
  C. `syncPreviewToPosition` сразу обновляет время и бегунок панели волны.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HTML = 'STRUCHORD.html'
SW = 'sw.js'


def read(rel):
    return (ROOT / rel).read_text(encoding='utf-8')


def write(rel, text):
    (ROOT / rel).write_text(text, encoding='utf-8')


def replace_once(text, old, new, label, count=1):
    found = text.count(old)
    if found != count:
        print(f'  ПАТЧ НЕ ПРИМЕНЁН: «{label}» — найдено {found}, ожидалось {count}')
        sys.exit(1)
    print(f'  ok  {label}')
    return text.replace(old, new)


# ---------------------------------------------------------------------------
# 1. Перемотка кликом во время игры — один перезапуск транспорта
# ---------------------------------------------------------------------------
CLICK_OLD = """            if (window.StruChordBackingTrack && typeof window.StruChordBackingTrack.seekDuringPlayback === 'function') {
              const pass = currentTimelinePasses(si, sqi);
              window.StruChordBackingTrack.seekDuringPlayback({ sectionIndex: si, squareIndex: sqi, eventIndex: ei,
                sectionRepeatCount: { ['sec_' + si]: pass.secPass }, squareRepeatCount: { ['sq_' + si + '_' + sqi]: pass.sqPass } });
            }
            updatePlaybackPosition(si, sqi, ei);"""
CLICK_NEW = """            // 0.824 (B-122): запись, аккорды и метроном перескакивают ВМЕСТЕ.
            // Раньше здесь запись переставлялась отдельно, а песня продолжала
            // старый отсчёт — владелец так это и описал: «перескакивают
            // аккорды, но не запись».
            updatePlaybackPosition(si, sqi, ei);
            seekPlaybackToCell(si, sqi, ei);"""

SEEK_FN_OLD = "function restartPlaybackFromCurrentPosition() {"
SEEK_FN_NEW = """// 0.824 (B-122): перемотка кликом по аккорду — ОДИН перезапуск транспорта.
//
// Почему не «переставить только запись», как было до 0.823: у песни своя
// сетка (`playbackStartTime`/`nextEventTime`), у записи — своя секунда, у
// метронома — фаза квадрата. Переставив одну запись, мы получаем ровно то,
// на что жаловался владелец: подсветка уже на нажатом аккорде, а звук ещё
// доигрывает старый такт, и запись вступает через полсекунды (её время
// берётся из `nextEventTime`, а планировщик заглядывает на 500 мс вперёд).
//
// Здесь транспорт останавливается и стартует заново с нажатой ячейки — тем
// же путём, что обычный Play. Всё, что умеет старт (запись на нужной
// секунде с учётом поправки «Сдвиг записи», метроном, повторы секций, знаки
// структуры), согласовано по построению, а не подгонкой.
var seekRestartInProgress = false;
function seekPlaybackToCell(sectionIndex, squareIndex, eventIndex) {
  if (!playbackState.isPlaying) return false;
  const sec = sections[sectionIndex];
  const sq = sec && sec.squares[squareIndex];
  if (!sq) return false;
  // Позицию запоминаем ДО остановки: stopPlayback сбрасывает и индексы,
  // и ход по знакам структуры.
  const pos = {
    sectionIndex,
    squareIndex,
    eventIndex: Math.max(0, Number(eventIndex) || 0),
    sectionRepeatCount: { ...(playbackState._sectionRepeatCount || {}) },
    squareRepeatCount: { ...(playbackState._squareRepeatCount || {}) },
    structureWalk: playbackState._structureWalk || null,
  };
  stopPlayback();
  if (window.StruChordBackingTrack && typeof window.StruChordBackingTrack.setPendingStart === 'function') {
    window.StruChordBackingTrack.setPendingStart(pos);
  }
  // Отсчёт после клика не нужен: музыка уже звучит, человек просто хочет
  // туда, куда нажал. Тот же флаг гасит тост, иначе серия кликов забивает
  // экран сообщениями.
  seekRestartInProgress = true;
  try {
    playAll();
  } finally {
    seekRestartInProgress = false;
  }
  return true;
}
function restartPlaybackFromCurrentPosition() {"""

COUNTIN_OLD = "  if (countInEnabled) {"
COUNTIN_NEW = "  // 0.824: перемотка кликом идёт без отсчёта — музыка уже звучала.\n  if (countInEnabled && !seekRestartInProgress) {"

TOAST_OLD = "  showToast('Воспроизведение');"
TOAST_NEW = "  if (!seekRestartInProgress) showToast('Воспроизведение');"

# ---------------------------------------------------------------------------
# 2. Поправка «Сдвиг записи» (trackOffset) в перемотках
# ---------------------------------------------------------------------------
POINT_TIME_OLD = "    return tAtQ(q);"
POINT_TIME_NEW = """    // 0.824: поправка «Сдвиг записи» — секунда В ЗАПИСИ, а не в сетке.
    // Без неё любая перемотка сдвинутой записи попадала мимо на этот сдвиг.
    return tAtQ(q) + (Number(meta && meta.trackOffset) || 0);"""

PREPARE_OLD = "const audioT=tAtQ(q), countIn="
PREPARE_NEW = "const offset=Number(meta.trackOffset)||0, audioT=tAtQ(q)+offset, countIn="

SEEKDUR_OLD = "scheduleAudio(ctx,q,Math.max(ctx.currentTime+.02,Number(nextEventTime)||ctx.currentTime+.02),targetOverride);}"
SEEKDUR_NEW = "scheduleAudio(ctx,q,Math.max(ctx.currentTime+.02,Number(nextEventTime)||ctx.currentTime+.02),Number.isFinite(targetOverride)?targetOverride:tAtQ(q)+(Number(meta.trackOffset)||0));}"

WAVESEEK_OLD = "if(audio)audio.currentTime=clamp(t,0,Math.max(0,mediaLen-.02));"
WAVESEEK_NEW = "if(audio)audio.currentTime=clamp(t+(Number(meta.trackOffset)||0),0,Math.max(0,mediaLen-.02));"

# ---------------------------------------------------------------------------
# 3. Лента: панель волны сразу показывает, куда отмотали
# ---------------------------------------------------------------------------
WAVECLICK_OLD = "seekDuringPlayback(pos,t);}"
WAVECLICK_NEW = "seekPlaybackToCell(pos.sectionIndex,pos.squareIndex,pos.eventIndex);}"
SEEKDUR_NOTE_OLD = "  function seekDuringPlayback(pos,targetOverride){"
SEEKDUR_NOTE_NEW = """  // 0.824: интерфейс перемотки — seekPlaybackToCell (перезапуск транспорта
  // целиком). Эта функция переставляет только запись и оставлена ради
  // совместимости: одна запись без песни — это и было расхождение.
  function seekDuringPlayback(pos,targetOverride){"""

PREVIEW_OLD = "try{audio.currentTime=clamp(pointTimeForPosition(pos),0,Math.max(0,(duration||audio.duration||0)-.02));}catch(_){} }"
PREVIEW_NEW = "try{audio.currentTime=clamp(pointTimeForPosition(pos),0,Math.max(0,(duration||audio.duration||0)-.02));}catch(_){}u pdatePreviewStatus();updatePlayheadCursor();}".replace('u pdate', 'update')

# ---------------------------------------------------------------------------
# 4. Модуль записи: внешняя точка старта для перемотки
# ---------------------------------------------------------------------------
API_OLD = "getPathInfo:backingPathInfo,"
API_NEW = "getPathInfo:backingPathInfo, setPendingStart:(next)=>{pendingStart=next?{...next}:null;},"

# ---------------------------------------------------------------------------
# 5. Версии — парой (R7)
# ---------------------------------------------------------------------------
HTML_VERSION_OLD = '· ver 0.823</span>'
HTML_VERSION_NEW = '· ver 0.824</span>'
SW_OLD = "const CACHE_NAME = 'struchord-v823';"
SW_NEW = "const CACHE_NAME = 'struchord-v824';"


def patch_html(text):
    text = replace_once(text, CLICK_OLD, CLICK_NEW, 'клик по аккорду: один перезапуск')
    text = replace_once(text, SEEK_FN_OLD, SEEK_FN_NEW, 'seekPlaybackToCell')
    text = replace_once(text, COUNTIN_OLD, COUNTIN_NEW, 'перемотка без отсчёта')
    text = replace_once(text, TOAST_OLD, TOAST_NEW, 'перемотка без тоста')
    text = replace_once(text, POINT_TIME_OLD, POINT_TIME_NEW, 'pointTimeForPosition: сдвиг записи')
    text = replace_once(text, PREPARE_OLD, PREPARE_NEW, 'preparePlaybackStart: сдвиг записи')
    text = replace_once(text, SEEKDUR_OLD, SEEKDUR_NEW, 'seekDuringPlayback: сдвиг записи')
    text = replace_once(text, WAVESEEK_OLD, WAVESEEK_NEW, 'клик по волне: сдвиг записи')
    text = replace_once(text, WAVECLICK_OLD, WAVECLICK_NEW, 'клик по волне: один перезапуск')
    text = replace_once(text, SEEKDUR_NOTE_OLD, SEEKDUR_NOTE_NEW, 'seekDuringPlayback: пометка о совместимости')
    text = replace_once(text, PREVIEW_OLD, PREVIEW_NEW, 'Лента: панель сразу показывает позицию')
    text = replace_once(text, API_OLD, API_NEW, 'api: setPendingStart')
    text = replace_once(text, HTML_VERSION_OLD, HTML_VERSION_NEW, 'версия в шапке')
    return text


def main():
    check_only = '--check' in sys.argv
    html = read(HTML)
    sw = read(SW)

    if HTML_VERSION_OLD not in html:
        print('  ПАТЧ НЕ ПРИМЕНЁН: в HTML уже не 0.823 — файл правился после волны?')
        sys.exit(1)
    if SW_OLD not in sw:
        print('  ПАТЧ НЕ ПРИМЕНЁН: в sw.js уже не struchord-v823')
        sys.exit(1)

    patched = patch_html(html)
    print(f'  ok  {HTML:<20} 12 якорей')
    print(f'  ok  {SW:<20} 1 якорь')

    if check_only:
        print('ПРОВЕРКА ПРОЙДЕНА: все якоря на месте, файлы не менялись.')
        return

    write(HTML, patched)
    write(SW, sw.replace(SW_OLD, SW_NEW))
    print('ПАТЧ ПРИМЕНЁН: 0.823 -> 0.824 (HTML и sw.js выложены парой).')


if __name__ == '__main__':
    main()
