#!/usr/bin/env python3
"""B-103 (0.775): темп меняется «на ходу» без потерь.

Найдено две ошибки при смене темпа во время воспроизведения:

1. BPM tap (кнопка в транспорте) менял только число в поле, но не пересобирал
   рисунок клавишного аккомпанемента. Рисунок хранит темп, под который он
   собран; планировщик считает устаревший рисунок непригодным и молчит.
   Замер: до тапа план ячейки давал 8 нот, после четырёх тапов (120 -> 119) —
   0 нот, то есть аккомпанемент выключался до перегенерации.

2. Перезапуск игры ради нового темпа (applyBpmChange, tapTempo, смена размера)
   возобновлял её с индекса СЛЕДУЮЩЕЙ ячейки: планировщик к этому моменту уже
   сдвинул указатель (currentEventIndex = next.eventIndex + 1). Звучащая
   ячейка обрывалась, следующая начиналась раньше срока. Замер (поп, 4 ячейки
   по 2 с): перемена темпа в середине второй ячейки давала Am длиной 0,8 с
   вместо 2 с, а F начинался в 2.92 с вместо 4.12 с. Каждое изменение темпа
   съедало часть песни.

Исправление:
* рисунок аккомпанемента пересобирается под новый темп из одного места
  (regenerateManagedAccompaniment) — и для поля BPM, и для тапа;
* tempo-изменения больше не перезапускают игру: звучащая ячейка доигрывает в
  прежнем темпе, новый вступает со следующей. Без обрыва, без повтора и без
  пропуска;
* метроном перевешивается на новый темп без «залпа» уже прошедших кликов
  (новый параметр resumeAtNow у scheduleMetronomeEvents);
* если перезапуск всё же нужен (меняется размер такта — сетка другая),
  restartPlaybackFromCurrentPosition берёт ЗВУЧАЩУЮ ячейку (soundingCell),
  а не указатель на следующую.
"""
import sys

PATH = sys.argv[1] if len(sys.argv) > 1 else 'STRUCHORD.html'
src = open(PATH, encoding='utf-8').read()


def sub(old, new, count=1, label=''):
    global src
    assert src.count(old) == count, f'anchor not unique ({src.count(old)}): {label or old[:60]}'
    src = src.replace(old, new, count)


# 1. Поле «звучащая ячейка» в состоянии воспроизведения.
sub("""  savedEventIndex: 0,
  currentTimeSig: null,""",
    """  savedEventIndex: 0,
  // 0.775: ячейка, которая ЗВУЧИТ сейчас. currentEventIndex — указатель на
  // следующую, его планировщик сдвигает сразу после постановки звука, поэтому
  // для перезапуска «с того же места» нужен именно этот.
  soundingCell: null,
  currentTimeSig: null,""", label='playbackState init')

# 2. Планировщик запоминает, что поставил.
sub("""  playbackState.cellStart = evStart;
  playbackState.cellDur = dur;""",
    """  playbackState.cellStart = evStart;
  playbackState.cellDur = dur;
  // 0.775: помним звучащую ячейку (индекс указателя ниже уже станет следующим).
  playbackState.soundingCell = {
    sectionIndex: next.sectionIndex,
    squareIndex: next.squareIndex,
    eventIndex: next.eventIndex,
  };""", label='scheduleNextEvent sounding cell')

# 3. Остановка забывает её.
sub("""  playbackState.savedEventIndex = -1;
  playbackState.currentTimeSig = null;""",
    """  playbackState.savedEventIndex = -1;
  playbackState.soundingCell = null;
  playbackState.currentTimeSig = null;""", label='stopPlayback reset')

# 4. Перезапуск — со звучащей ячейки, а не со следующей.
sub("""  const ss = playbackState.currentSectionIndex;
  const ssq = playbackState.currentSquareIndex;
  const se = playbackState.currentEventIndex;""",
    """  // 0.775: currentEventIndex — указатель на СЛЕДУЮЩУЮ ячейку (планировщик
  // сдвигает его сразу после постановки звука). Перезапуск по нему обрывал
  // звучащую ячейку и начинал следующую раньше срока: каждое изменение темпа
  // съедало часть песни. Берём ту ячейку, что реально звучит.
  const sounding = playbackState.soundingCell;
  const ss = sounding ? sounding.sectionIndex : playbackState.currentSectionIndex;
  const ssq = sounding ? sounding.squareIndex : playbackState.currentSquareIndex;
  const se = sounding ? sounding.eventIndex : playbackState.currentEventIndex;""",
    label='restart from sounding cell')

# 5. Метроном: перевешивание без «залпа» прошедших кликов.
sub("function scheduleMetronomeEvents(ctx, st, ts, bpm) {",
    "function scheduleMetronomeEvents(ctx, st, ts, bpm, resumeAtNow) {",
    label='metronome signature')
sub("""  let last = -1;
  function check() {""",
    """  // 0.775: resumeAtNow — смена темпа на ходу перевешивает клики. Без этого
  // отсчёт начинался с нуля такта, все прошедшие клики планировались в
  // прошлом и звучали разом (залп).
  // ceil, а не floor: следующий клик должен быть ВПЕРЕДИ, иначе при задержке
  // кадра он ставится задним числом и звучит вместе с предыдущим.
  let last = resumeAtNow ? Math.max(-1, Math.ceil((ctx.currentTime - st) / cd) - 1) : -1;
  function check() {""", label='metronome resume index')

# 6. Общие помощники перед applyBpmChange.
sub("""function applyBpmChange() {""",
    """// 0.775: «темп на ходу» — одна точка правды для всех способов его сменить.
//  * Рисунок клавишного аккомпанемента хранит темп, под который собран.
//    Не пересобрать его — значит оставить ячейку с устаревшим темпом, а
//    планировщик такие рисунки не играет (молчащая ячейка). Именно это
//    делал тап-темп: менял число в поле, но не рисунки.
//  * Перезапускать игру ради темпа больше не нужно: звучащая ячейка
//    доигрывает в прежнем темпе, новый вступает со следующей. Так нет ни
//    обрыва, ни повтора аккорда, ни пропуска ячейки.
function regenerateManagedAccompaniment() {
  if (!window.StruChordNoteCandidate || !window.StruChordTracks) return;
  const cfg = window.StruChordTracks.state().autoAccomp;
  if (!cfg || cfg.engine !== 'notes-v1') return;
  songStore.dispatch('b39/auto-tempo', () =>
    sections
      .filter((sec) => !sec.bpm)
      .forEach((sec) => window.StruChordNoteCandidate.refreshManaged(sec)));
}
function reanchorMetronomeForTempo(bpm) {
  if (!playbackState.isPlaying || playbackState.metronomeMuted) return;
  const ctx = getAudioContext();
  const anchor = playbackState.squareAnchorTime;
  if (!ctx || !Number.isFinite(anchor)) return;
  const ts = playbackState.currentTimeSig || globalTimeSig;
  const section = sections[playbackState.currentSectionIndex];
  scheduleMetronomeEvents(ctx, anchor, ts, getEffectiveBpm(section) || bpm, true);
}
function applyBpmChange() {""", label='tempo helpers')

# 7. applyBpmChange: пересборка через помощник, без перезапуска игры.
sub("""  if(window.StruChordNoteCandidate && window.StruChordTracks && window.StruChordTracks.state().autoAccomp && window.StruChordTracks.state().autoAccomp.engine==='notes-v1')
    songStore.dispatch('b39/auto-tempo',()=>sections.filter(sec=>!sec.bpm).forEach(sec=>window.StruChordNoteCandidate.refreshManaged(sec)));""",
    """  regenerateManagedAccompaniment();""", label='applyBpmChange regeneration')

sub("""  if (playbackState.isPlaying) {
    restartPlaybackFromCurrentPosition();
    showToast(`BPM изменён на ${v}, воспроизведение продолжено`);
  }""",
    """  if (playbackState.isPlaying) {
    // 0.775: не перезапускаем игру. Раньше здесь стоял
    // restartPlaybackFromCurrentPosition(), и он начинал со СЛЕДУЮЩЕЙ ячейки —
    // звучащая обрывалась. Теперь текущая доигрывает, новый темп вступает со
    // следующей; метроном перевешивается на новый темп.
    reanchorMetronomeForTempo(v);
    showToast(`BPM ${v}: новый темп со следующего аккорда`);
  }""", label='applyBpmChange no restart')

# 8. Тап-темп: та же пересборка и тот же метроном, без обрыва.
sub("""      showToast(`BPM: ${clamped}`);
      if (playbackState.isPlaying) restartPlaybackFromCurrentPosition();
      maybeUnlockPowerAchievementFromBpm(clamped);""",
    """      showToast(`BPM: ${clamped}`);
      // 0.775: без пересборки рисунка аккомпанемент замолкал (рисунок хранил
      // прежний темп), а перезапуск обрывал звучащую ячейку.
      regenerateManagedAccompaniment();
      reanchorMetronomeForTempo(clamped);
      maybeUnlockPowerAchievementFromBpm(clamped);""", label='tapTempo')

open(PATH, 'w', encoding='utf-8').write(src)
print('patched', PATH)
