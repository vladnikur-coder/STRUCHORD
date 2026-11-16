#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""B-122 / 0.823 — фоновая запись и сетка песни на одних часах.

Жалоба владельца (2026-11-12, Mac Safari): «рассинхронизация аудио с
плейбеком и дикие фризы аудио». Уточнения по R8: расходится и звук с
звуком, и звук с картинкой; разъезд идёт скачками; замирает ТОЛЬКО
фоновая запись (гитара, клавиши и метроном идут ровно).

Read-only разбор кода показал две причины в модуле B-122:

1. Ноль модели записи считался по НАМЕРЕНИЮ: `audioZeroCtxTime = when -
   target/speed`, где `when` — запланированный момент. Фактический старт
   элемента <audio> наступает позже: setTimeout главного потока, поиск
   нужной секунды, запуск воспроизведения. Ошибка в модель не попадала.
2. Догон трогал элемент каждую секунду: `playbackRate` присваивался заново
   (Safari пересобирает «сохранение высоты тона» и слышимо спотыкается), а
   при разъезде больше 1,25 с запись переставлялась `currentTime = expected`
   не чаще раза в 5 с. Это и есть периодические рывки.

Решения владельца (R8, 2026-11-12):
  * route  = hybrid  — на скорости 100 % запись играет «одними часами»
    (тот же AudioContext, что гитара/клавиши/метроном: дрейфа нет по
    построению), на скорости 50–150 % остаётся элемент <audio>, потому что
    Web Audio не умеет менять темп без смены высоты тона;
  * slider = often   — ползунок скорости нужен, поэтому путь элемента
    чинится, а не выбрасывается;
  * policy = song_follows — при крупном разъезде запись НЕ трогаем: песня
    один раз «ждёт» её (сдвиг сетки), дальше идут в ногу.

Что меняется:
  * decodePeaks теперь сохраняет раскодированный звук (он и так
    раскодировался для волны) в пределах BUFFER_MEMORY_LIMIT = 96 МБ;
  * startBufferPath / startElementPath — два пути вместо одного;
  * ноль модели элемента уточняется по факту (probeElementAnchor) —
    измерением, а не намерением;
  * тихий догон: интервал 250 мс, медиана из 8 проб, мёртвая зона 90 мс,
    шаг ±0,8 %, не чаще раза в 2,5 с, без периодических перестановок;
  * shiftPlaybackGrid в основном скрипте — «песня ждёт запись»;
  * смена скорости на ходу переключает путь без сдвига опоры сетки;
  * всё это пишется в существующий аудиожурнал («Audio log» в dev-панели).

Не меняется: карта Sync Points и расчёт темпов, экспорт, волна, микшер,
замороженный импорт GP. R7: версия в шапке HTML и CACHE_NAME в sw.js —
парой.
"""
import argparse
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]


def read(rel):
    with open(ROOT / rel, 'r', encoding='utf-8', newline='') as fh:
        return fh.read()


def write(rel, text):
    with open(ROOT / rel, 'w', encoding='utf-8', newline='') as fh:
        fh.write(text)


def replace_once(text, old, new, label, count=1):
    n = text.count(old)
    if n != count:
        raise SystemExit('ПАТЧ НЕ ПРИМЕНЁН: якорь «%s» найден %d раз (нужно %d)' % (label, n, count))
    return text.replace(old, new, count)


def replace_line(text, prefix, new, label):
    lines = text.split('\n')
    idx = [i for i, ln in enumerate(lines) if ln.startswith(prefix)]
    if len(idx) != 1:
        raise SystemExit('ПАТЧ НЕ ПРИМЕНЁН: строка «%s» найдена %d раз (нужна ровно 1)' % (label, len(idx)))
    lines[idx[0]] = new
    return '\n'.join(lines)


# ---------------------------------------------------------------------------
# 1. Новое состояние модуля B-122
# ---------------------------------------------------------------------------
STATE_OLD = """  let canvasCssHeight = 108;
"""
STATE_NEW = """  let canvasCssHeight = 108;
  // 0.823 (B-122): «одни часы» для записи на скорости 100 %.
  //
  // Раскодированный звук уже существовал — он нужен был для волны, — но его
  // выбрасывали. Теперь он остаётся, и запись играет тем же AudioContext,
  // что гитара, клавиши и метроном: дрейфа нет по построению, а не «по
  // догону», и переставлять запись во время игры не приходится вовсе.
  //
  // Предел памяти: запись длиннее ~5 минут (стерео 44,1 кГц) остаётся на
  // элементе <audio>, как раньше. Пиковый расход не растёт: этот же буфер
  // всё равно создавался при построении волны.
  const BUFFER_MEMORY_LIMIT = 96 * 1024 * 1024;
  let audioBuffer = null;
  let bufferBytes = 0;
  let bufferSource = null;
  let bufferGain = null;
  let bufferCtx = null;
  let playbackPath = 'none';      // 'buffer' | 'element' | 'none'
  let anchorProbeTimer = 0;
  let anchorSamples = [];
  let driftSamples = [];
  let driftStableSince = 0;
  let lastNudgeAt = 0;
  let lastReanchorAt = 0;
  let rateApplied = 1;
"""

# ---------------------------------------------------------------------------
# 2. audibleBackingTime — позиция в режиме «одних часов»
# ---------------------------------------------------------------------------
AUDIBLE_OLD = """  function audibleBackingTime() {
    if (!audio) return 0;
    const mediaTime = Math.max(0, Number(audio.currentTime) || 0);
"""
AUDIBLE_NEW = """  function audibleBackingTime() {
    // 0.823: в режиме «одних часов» элемент <audio> не играет вовсе, его
    // currentTime замирает. Позицию берём из модели Web Audio — она же и
    // есть звук, поэтому playhead физически не может уехать от записи.
    try {
      if (playbackPath === 'buffer' && audioZeroCtxTime !== null && meta) {
        const clockCtx = playbackState.isPlaying && typeof getAudioContext === 'function' ? getAudioContext() : audioCtx;
        if (clockCtx) return Math.max(0, (audibleAudioContextTime(clockCtx) - audioZeroCtxTime) * meta.speed);
      }
    } catch (_) {}
    if (!audio) return 0;
    const mediaTime = Math.max(0, Number(audio.currentTime) || 0);
"""

# ---------------------------------------------------------------------------
# 3. decodePeaks — сохраняем раскодированный звук в пределах лимита
# ---------------------------------------------------------------------------
DECODE_HEAD_OLD = """  async function decodePeaks(blob, token) {
    let nextPeaks = [];
"""
DECODE_HEAD_NEW = """  async function decodePeaks(blob, token) {
    let nextPeaks = [];
    // 0.823: тот же буфер, что нужен для волны, теперь годится и для
    // воспроизведения «одними часами» — второй раз файл не декодируется.
    let nextBuffer = null;
    let nextBufferBytes = 0;
"""

DECODE_BUF_OLD = """            const buffer = await ctx.decodeAudioData(bytes.slice(0));
            nextDuration = buffer.duration;
"""
DECODE_BUF_NEW = """            const buffer = await ctx.decodeAudioData(bytes.slice(0));
            nextDuration = buffer.duration;
            nextBuffer = buffer;
            nextBufferBytes = (Number(buffer.length) || 0) * (Number(buffer.numberOfChannels) || 1) * 4;
"""

DECODE_COMMIT_OLD = """    if (token !== blobLoadToken) return;
    peaks = nextPeaks;
"""
DECODE_COMMIT_NEW = """    if (token !== blobLoadToken) return;
    // 0.823: держим буфер только в пределах лимита памяти; иначе — прежний
    // путь через элемент <audio>, звук и сохранение песни не меняются.
    if (nextBuffer && nextBufferBytes > 0 && nextBufferBytes <= BUFFER_MEMORY_LIMIT) {
      audioBuffer = nextBuffer;
      bufferBytes = nextBufferBytes;
    } else {
      audioBuffer = null;
      bufferBytes = 0;
    }
    peaks = nextPeaks;
"""

# ---------------------------------------------------------------------------
# 4. loadBlob — новый файл начинается с чистого состояния
# ---------------------------------------------------------------------------
LOADBLOB_NEW = """  async function loadBlob(blob){
    if(!blob)return;
    const token=++blobLoadToken;
    missingAudio=false;
    // 0.823: источник прошлого файла не должен дожить до нового.
    stopBackingOutput();
    audioBuffer=null;bufferBytes=0;
    await decodePeaks(blob,token);
    if(token!==blobLoadToken)return;
    const el=ensureAudio();
    if(audioUrl)try{URL.revokeObjectURL(audioUrl);}catch(_){}
    audioUrl=URL.createObjectURL(blob);
    el.src=audioUrl;el.load();renderDrawer();
  }"""

# ---------------------------------------------------------------------------
# 5. Новые помощники + переписанные stopAudio/driftPlaybackRate/scheduleAudio
# ---------------------------------------------------------------------------
HELPERS_NEW = """  // ── 0.823 (B-122): воспроизведение записи ────────────────────────────
  // Три помощника, общих для обоих путей:
  //  * stopBackingOutput — выключатель звука записи (элемент и Web Audio),
  //    метаданные и волну не трогает;
  //  * applyBackingVolume — единственная точка громкости/мьюта, чтобы
  //    микшер и источник не расходились;
  //  * recordBacking — запись в существующий аудиожурнал (dev-панель
  //    «Audio log»), без новой отладочной обвязки.
  function round3(n) { return Math.round((Number(n) || 0) * 1000) / 1000; }
  // 0.823: «запись звучит» больше не значит «элемент играет». На 100 % звук
  // идёт источником Web Audio, а элемент стоит на паузе — если проверять
  // только элемент, картинка в панели замирает при живом звуке.
  function backingRunning() {
    if (playbackPath === 'buffer') return !!bufferSource;
    return !!(audio && !audio.paused && !audioStartTimer);
  }
  function recordBacking(type, details) {
    try { if (typeof recordAudioDiagnostic === 'function') recordAudioDiagnostic(type, details || {}); } catch (_) {}
  }
  function stopBackingOutput() {
    if (anchorProbeTimer) { clearTimeout(anchorProbeTimer); anchorProbeTimer = 0; }
    anchorSamples = [];
    driftSamples = [];
    driftStableSince = 0;
    const src = bufferSource, gain = bufferGain, ctx = bufferCtx;
    bufferSource = null; bufferGain = null; bufferCtx = null;
    if (!src) return;
    try {
      // 20 мс на спад: обрыв буфера на середине волны слышен щелчком.
      if (gain && ctx) {
        gain.gain.cancelScheduledValues(ctx.currentTime);
        gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.02);
      }
    } catch (_) {}
    try { if (ctx) src.stop(ctx.currentTime + 0.03); else src.stop(); } catch (_) {}
    try {
      src.onended = () => {
        try { src.disconnect(); } catch (_) {}
        if (gain) try { gain.disconnect(); } catch (_) {}
      };
    } catch (_) {}
  }
  function applyBackingVolume() {
    const level = meta && audioAllowed() ? meta.volume / 100 : 0;
    if (audio && playbackPath !== 'buffer') {
      try { audio.volume = level; } catch (_) {}
    }
    if (bufferGain && bufferCtx) {
      try {
        bufferGain.gain.cancelScheduledValues(bufferCtx.currentTime);
        bufferGain.gain.setTargetAtTime(level, bufferCtx.currentTime, 0.02);
      } catch (_) {}
    }
  }
  function backingPathInfo() {
    // Позиция в модели — для журнала и тестов: в режиме «одних часов»
    // элемент молчит, и другого способа увидеть, где идёт запись, нет.
    return {
      path: playbackPath,
      hasBuffer: !!audioBuffer,
      bufferBytes: bufferBytes,
      zero: audioZeroCtxTime,
      backingTime: playbackPath === 'none' ? 0 : (Number(round3(audibleBackingTime())) || 0)
    };
  }
  function bufferPathAvailable(ctx, speed) {
    return !!audioBuffer && !!ctx && typeof ctx.createBufferSource === 'function' && Math.abs(speed - 1) < 0.001;
  }
  // «Одни часы»: запись — обычный источник Web Audio. start() точен до
  // сэмпла, поэтому никакого догона здесь не нужно в принципе.
  function startBufferPath(ctx, when, target, speed) {
    stopBackingOutput();
    // Переход со скорости ≠ 100 % на 100 %: элемент обязан замолчать, иначе
    // запись зазвучит дважды — элементом и источником.
    if (audio && !audio.paused) { try { audio.pause(); } catch (_) {} }
    const total = Math.max(0, Number(audioBuffer.duration) || duration || 0);
    let offset = clamp(Number(target) || 0, 0, Math.max(0, total - 0.001));
    let startAt = Number(when) || ctx.currentTime;
    // start() в прошлом Web Audio понимает как «сейчас». Без этой поправки
    // запись отставала бы ровно на опоздание вызывающего кода.
    if (startAt < ctx.currentTime) {
      offset += (ctx.currentTime - startAt) * speed;
      startAt = ctx.currentTime;
    }
    const src = ctx.createBufferSource();
    src.buffer = audioBuffer;
    let gain = null;
    try {
      src.playbackRate.value = speed;
      gain = ctx.createGain();
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start(startAt, offset);
    } catch (error) {
      try { src.disconnect(); } catch (_) {}
      if (gain) try { gain.disconnect(); } catch (_) {}
      return false;
    }
    // 8 мс на вход вместо щелчка; на точность начала не влияет.
    try {
      const level = audioAllowed() ? meta.volume / 100 : 0;
      gain.gain.setValueAtTime(0, startAt);
      gain.gain.linearRampToValueAtTime(level, startAt + 0.008);
    } catch (_) {}
    bufferSource = src; bufferGain = gain; bufferCtx = ctx;
    playbackPath = 'buffer';
    audioZeroCtxTime = startAt - offset / speed;
    recordBacking('backing-buffer-start', { offset: round3(offset), at: round3(startAt), zero: round3(audioZeroCtxTime) });
    // Событий элемента здесь не будет — картинку панели запускаем сами.
    try { syncPlayheadAnimation(); } catch (_) {}
    return true;
  }
  // Элемент <audio> — только для скорости 50–150 % (Web Audio не умеет
  // менять темп без смены высоты). Секунду ставим ДО play(): поиск внутри
  // уже играющего элемента — отдельная операция браузера, на Safari она
  // слышна рывком. Ноль модели потом уточняется измерением.
  function startElementPath(ctx, when, target, speed) {
    stopBackingOutput();
    const el = ensureAudio();
    const total = Math.max(0, Number(duration) || Number(el.duration) || 0);
    const seekTo = clamp(Number(target) || 0, 0, Math.max(0, total - 0.02));
    let startAt = Number(when) || ctx.currentTime;
    if (startAt < ctx.currentTime) startAt = ctx.currentTime;
    try { el.pause(); } catch (_) {}
    // Громкость в ноль ДО разблокировки: иначе «пустой» play() на секунду
    // выпускает запись на полной громкости из прошлого запуска.
    el.volume = 0;
    // Разблокировка autoplay: Safari/iOS разрешают отложенный play() только
    // после удачного play() в жесте пользователя. Звука не даём — сразу пауза.
    try { const warm = el.play(); if (warm && warm.catch) warm.catch(() => {}); el.pause(); } catch (_) {}
    el.playbackRate = speed; rateApplied = speed;
    try { el.currentTime = seekTo; } catch (_) {}
    if (audioStartTimer) clearTimeout(audioStartTimer);
    audioStartTimer = window.setTimeout(() => {
      audioStartTimer = 0;
      try {
        el.volume = audioAllowed() ? meta.volume / 100 : 0;
        const playing = el.play();
        if (playing && playing.catch) playing.catch(() => {});
      } catch (_) {}
      probeElementAnchor(ctx, seekTo);
    }, Math.max(0, startAt - ctx.currentTime) * 1000);
    audioZeroCtxTime = startAt - seekTo / speed;
    playbackPath = 'element';
    recordBacking('backing-element-start', { target: round3(seekTo), at: round3(startAt) });
    startDriftControl();
  }
  // Измерение фактического старта элемента: три-пять проб пары
  // (часы контекста, позиция записи). Медиана — ноль модели.
  function probeElementAnchor(ctx, target) {
    if (anchorProbeTimer) clearTimeout(anchorProbeTimer);
    anchorSamples = [];
    let tries = 0;
    const step = () => {
      anchorProbeTimer = 0;
      if (!meta || playbackPath !== 'element' || !audio) return;
      const speed = Number(meta.speed) || 1;
      const pos = Number(audio.currentTime) || 0;
      if (pos > target + 0.06) anchorSamples.push(ctx.currentTime - pos / speed);
      tries++;
      if (anchorSamples.length >= 5 || tries >= 24) { applyElementAnchor(); return; }
      anchorProbeTimer = window.setTimeout(step, 80);
    };
    anchorProbeTimer = window.setTimeout(step, 80);
  }
  function applyElementAnchor() {
    if (!anchorSamples.length || !meta || audioZeroCtxTime === null) return;
    const sorted = anchorSamples.slice().sort((a, b) => a - b);
    const measured = sorted[Math.floor(sorted.length / 2)];
    const delta = measured - audioZeroCtxTime;
    audioZeroCtxTime = measured;
    // Опоздание в десятки мс сетку не трогаем — его снимает тихий догон.
    // Крупное опоздание означает, что Safari собирал запись долго: тогда
    // по решению владельца песня один раз ждёт запись.
    if (Math.abs(delta) >= 0.09) shiftPlaybackGridFromBacking(delta, false);
    recordBacking('backing-anchor', { delta: round3(delta), samples: anchorSamples.length });
  }
  function shiftPlaybackGridFromBacking(delta, cut) {
    try {
      if (typeof window.StruChordShiftPlaybackGrid === 'function') {
        window.StruChordShiftPlaybackGrid(delta, { reason: 'backing', cut: !!cut });
      }
    } catch (_) {}
  }
  // Тихий догон. Отличия от прежнего: пробы 250 мс с медианой (Safari
  // отдаёт позицию записи грубо), мёртвая зона 90 мс, шаг ±0,8 % не чаще
  // раза в 2,5 с и НИ ОДНОЙ периодической перестановки currentTime.
  function startDriftControl() {
    if (driftTimer) clearInterval(driftTimer);
    driftSamples = [];
    driftStableSince = 0;
    lastNudgeAt = 0;
    lastReanchorAt = 0;
    driftTimer = setInterval(() => {
      if (!meta || playbackPath !== 'element' || !audio || audio.paused || audioZeroCtxTime === null) return;
      const ctx = typeof getAudioContext === 'function' ? getAudioContext() : null;
      if (!ctx) return;
      const speed = Number(meta.speed) || 1;
      const expected = Math.max(0, (ctx.currentTime - audioZeroCtxTime) * speed);
      const drift = expected - (Number(audio.currentTime) || 0);
      driftSamples.push(drift);
      if (driftSamples.length > 8) driftSamples.shift();
      if (driftSamples.length < 4) return;
      const sorted = driftSamples.slice().sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const now = performance.now();
      if (Math.abs(median) < 0.09) {
        driftStableSince = 0;
        // В норме элемент играет ровно на скорости ползунка. Раньше он
        // получал новую скорость каждую секунду — Safari пересобирал
        // сохранение высоты тона и слышимо спотыкался.
        if (Math.abs(rateApplied - speed) > 1e-4) {
          try { audio.playbackRate = speed; } catch (_) {}
          rateApplied = speed;
        }
        return;
      }
      if (!driftStableSince) { driftStableSince = now; return; }
      if (now - driftStableSince < 1200) return;
      if (median > 0.35 && now - lastReanchorAt > 8000) {
        // Крупный разъезд: запись не трогаем, песня один раз её ждёт.
        lastReanchorAt = now;
        const shift = median / speed;
        audioZeroCtxTime += shift;
        shiftPlaybackGridFromBacking(shift, true);
        driftSamples = []; driftStableSince = 0;
        recordBacking('backing-reanchor', { drift: round3(median), shift: round3(shift) });
        return;
      }
      if (now - lastNudgeAt > 2500) {
        lastNudgeAt = now;
        const rate = driftPlaybackRate(median, speed);
        if (Math.abs(rate - speed) > 1e-4) {
          try { audio.playbackRate = rate; } catch (_) {}
          rateApplied = rate;
        }
        recordBacking('backing-nudge', { drift: round3(median), rate: Math.round(rate * 10000) / 10000 });
      }
    }, 250);
  }
  // Скорость меняется на ходу: путь переключается, но ОПОРА СЕТКИ стоит на
  // месте — точку выводим из неё же, поэтому песня продолжается с того же
  // места, а запись встаёт на нужную секунду.
  function restartBackingForSpeed() {
    const ctx = typeof getAudioContext === 'function' ? getAudioContext() : null;
    if (!ctx || !meta || !audioAllowed()) { applyBackingVolume(); return; }
    const speed = Number(meta.speed) || 1;
    const wantBuffer = Math.abs(speed - 1) < 0.001;
    // Текущий путь уже умеет эту скорость — перезапуск не нужен. Без этой
    // проверки каждое движение ползунка обрывало бы запись.
    if (wantBuffer && playbackPath === 'buffer') return;
    if (!wantBuffer && playbackPath === 'element') {
      if (Math.abs(rateApplied - speed) > 1e-4) {
        try { audio.playbackRate = speed; } catch (_) {}
        rateApplied = speed;
      }
      return;
    }
    const when = ctx.currentTime + 0.03;
    const target = audioZeroCtxTime === null ? audibleBackingTime() : Math.max(0, (when - audioZeroCtxTime) * speed);
    if (bufferPathAvailable(ctx, speed)) startBufferPath(ctx, when, target, speed);
    else startElementPath(ctx, when, target, speed);
  }
  function stopAudio(){
    if(audioStartTimer){clearTimeout(audioStartTimer);audioStartTimer=0;}
    if(driftTimer){clearInterval(driftTimer);driftTimer=0;}
    stopBackingOutput();
    driftSamples=[];driftStableSince=0;lastNudgeAt=0;lastReanchorAt=0;
    if(audio){
      try{audio.pause();}catch(_){}
      audio.playbackRate=meta?meta.speed:1;
      rateApplied=audio.playbackRate;
      audio.volume=meta&&meta.mute?0:(meta?meta.volume/100:0);
    }
    audioZeroCtxTime=null;
    playbackPath='none';
  }
  function driftPlaybackRate(drift,base){const error=Number(drift)||0,speed=clamp(Number(base)||1,.5,1.5);if(Math.abs(error)<=.09)return speed;return clamp(speed*(1+(error>0?.008:-.008)),.5,1.5);}
  function scheduleAudio(ctx, q, launchAt, targetOverride){
    if(!audioAllowed())return;
    const speed=Number(meta&&meta.speed)||1;
    const target=Math.max(0,targetOverride===undefined?tAtQ(q):targetOverride);
    const when=Number(launchAt)||ctx.currentTime;
    if(bufferPathAvailable(ctx,speed)&&startBufferPath(ctx,when,target,speed))return;
    // Буфер не завёлся (контекст закрыт и т. п.) — без звука не остаёмся.
    startElementPath(ctx,when,target,speed);
  }"""

STOPAUDIO_PREFIX = '  function stopAudio(){if(audioStartTimer)'

# ---------------------------------------------------------------------------
# 6. Микшер и панель — громкость через одну точку
# ---------------------------------------------------------------------------
MIX_VOL_OLD = "meta.volume=Number(e.target.value);if(audio)audio.volume=audioAllowed()?meta.volume/100:0;"
MIX_VOL_NEW = "meta.volume=Number(e.target.value);applyBackingVolume();"
MUTE_OLD = "if(m)m.onclick=()=>{meta.mute=!meta.mute;if(audio)audio.volume=audioAllowed()?meta.volume/100:0;"
MUTE_NEW = "if(m)m.onclick=()=>{meta.mute=!meta.mute;applyBackingVolume();"
SYNCMIX_OLD = "if(btn){btn.hidden=!meta;btn.classList.toggle('is-missing',!!missingAudio);}if(audio)audio.volume=audioAllowed()?meta.volume/100:0;"
SYNCMIX_NEW = "if(btn){btn.hidden=!meta;btn.classList.toggle('is-missing',!!missingAudio);}applyBackingVolume();"
DRAWER_VOL_OLD = "    if(audio){audio.volume=audioAllowed()?meta.volume/100:0;audio.playbackRate=meta.speed;}\n"
DRAWER_VOL_NEW = "    applyBackingVolume();\n    if(audio&&playbackPath!=='buffer')audio.playbackRate=meta.speed;\n"
SPEED_OLD = "if(audio)audio.playbackRate=meta.speed;drawWave();};speed.onchange=captureEdit;"
SPEED_NEW = ("if(playbackState.isPlaying)restartBackingForSpeed();"
             "else{applyBackingVolume();if(audio)audio.playbackRate=meta.speed;}drawWave();};speed.onchange=captureEdit;")

# ---------------------------------------------------------------------------
# 6b. Панель волны: бегунок и секунды живут по тому же признаку «звучит»
# ---------------------------------------------------------------------------
# На 100 % элемент молчит, поэтому «audio.paused» больше не признак тишины:
# без этих правок бегунок и подпись времени замирали бы во время живого звука.
PLAYHEAD_RUN_OLD = "    const running = !!(audio && !audio.paused && meta && !audioStartTimer);"
PLAYHEAD_RUN_NEW = "    const running = !!(meta && backingRunning());"
PLAYHEAD_FRAME_OLD = """  function playheadAnimationFrame() {
    playheadRaf = 0;
    const drawer = $('btDrawer');
    if (!drawer || drawer.hidden || !audio || audio.paused) { updatePlayheadCursor(); return; }
    updatePlayheadCursor();
    playheadRaf = requestAnimationFrame(playheadAnimationFrame);
  }"""
PLAYHEAD_FRAME_NEW = """  function playheadAnimationFrame() {
    playheadRaf = 0;
    const drawer = $('btDrawer');
    if (!drawer || drawer.hidden || !backingRunning()) { updatePlayheadCursor(); return; }
    updatePlayheadCursor();
    // У источника Web Audio нет события timeupdate: секунды обновляем в
    // этом же кадре, иначе подпись стоит на месте, пока звук идёт.
    const output = $('btPlayhead');
    if (output) {
      const shown = secText(Math.max(0, audibleBackingTime()));
      if (output.textContent !== shown) output.textContent = shown;
    }
    playheadRaf = requestAnimationFrame(playheadAnimationFrame);
  }"""
PLAYHEAD_ACTIVE_OLD = "    const playbackActive = !!(playbackState.isPlaying || (audio && !audio.paused));"
PLAYHEAD_ACTIVE_NEW = "    const playbackActive = !!(playbackState.isPlaying || backingRunning());"
PLAYHEAD_GUARD_OLD = """    if (!drawer || drawer.hidden || !audio || audio.paused) {
      if (playheadRaf) cancelAnimationFrame(playheadRaf);"""
PLAYHEAD_GUARD_NEW = """    if (!drawer || drawer.hidden || !backingRunning()) {
      if (playheadRaf) cancelAnimationFrame(playheadRaf);"""

# ---------------------------------------------------------------------------
# 7. api — состояние пути и сброс буфера
# ---------------------------------------------------------------------------
API_PATH_OLD = "getDriftPlaybackRate:driftPlaybackRate,"
API_PATH_NEW = "getDriftPlaybackRate:driftPlaybackRate, getPathInfo:backingPathInfo,"
API_RESET_OLD = "resetForNewSong:()=>{loadToken++;blobLoadToken++;"
API_RESET_NEW = "resetForNewSong:()=>{loadToken++;blobLoadToken++;stopBackingOutput();"
BUFFER_RESET_OLD = "peaks=[];duration=0;stopAudio();"
BUFFER_RESET_NEW = "peaks=[];duration=0;audioBuffer=null;bufferBytes=0;stopAudio();"

# ---------------------------------------------------------------------------
# 8. Основной скрипт — «песня ждёт запись»
# ---------------------------------------------------------------------------
GRID_ANCHOR_OLD = """  for (const o of activeOscillators)
    try {
      o.stop();
    } catch (e) {}
  activeOscillators.clear();
  ringingVoices = [];
}
"""
GRID_ANCHOR_NEW = """  for (const o of activeOscillators)
    try {
      o.stop();
    } catch (e) {}
  activeOscillators.clear();
  ringingVoices = [];
}
// 0.823 (B-122): «песня подстраивается под запись».
//
// Решение владельца (R8, 2026-11-12): при крупном разъезде фоновую запись
// НЕ трогаем — она звучит цельно, — а сетка, подсветка и метроном один раз
// подстраиваются под неё. Раньше было наоборот: запись переставлялась
// `currentTime = expected`, и это слышалось рывком каждые пять секунд.
//
// Уже поставленные в Web Audio голоса погасить выборочно нельзя, поэтому
// для крупного сдвига (cut) они гасятся целиком: аккорды «подождут» запись,
// зато дальше идут с ней в ногу. Мелкий сдвиг (< 90 мс) сюда не попадает —
// его снимает тихий догон скоростью без единого разрыва.
function stopScheduledSongVoices() {
  if (window.StruChordAudio) window.StruChordAudio.stopAll();
  for (const o of activeOscillators) {
    try { o.stop(); } catch (e) {}
  }
  activeOscillators.clear();
  ringingVoices = [];
}
function shiftPlaybackGrid(delta, opts) {
  if (!playbackState.isPlaying) return;
  const shift = Number(delta);
  if (!Number.isFinite(shift) || Math.abs(shift) < 0.001) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const cut = !!(opts && opts.cut);
  playbackStartTime += shift;
  nextEventTime += shift;
  if (Number.isFinite(playbackState.cellStart)) playbackState.cellStart += shift;
  if (Number.isFinite(playbackState.squareAnchorTime)) playbackState.squareAnchorTime += shift;
  // Клики метронома перевешиваем на новую сетку: ключ обнуляем, следующее
  // же событие пересоберёт их от фактического времени.
  metronomeGridKey = null;
  clearPlaybackVisualUpdates();
  if (cut) {
    stopScheduledSongVoices();
    stopMetronomeScheduler();
  }
  clearTimeout(playbackState.schedulerTimer);
  const wait = Math.max(0, (nextEventTime - ctx.currentTime) * 1000 - PLAYBACK_SCHEDULER_LOOKAHEAD_MS);
  playbackState.schedulerTimer = setTimeout(() => scheduleNextEvent(ctx), wait);
  try {
    recordAudioDiagnostic('playback-grid-shift', {
      shift: Math.round(shift * 1000) / 1000,
      reason: (opts && opts.reason) || 'backing',
      cut
    });
  } catch (e) {}
}
window.StruChordShiftPlaybackGrid = shiftPlaybackGrid;
"""

# ---------------------------------------------------------------------------
# 9. Версии — парой (R7)
# ---------------------------------------------------------------------------
HTML_VERSION_OLD = '· ver 0.822</span>'
HTML_VERSION_NEW = '· ver 0.823</span>'
SW_OLD = "const CACHE_NAME = 'struchord-v822';"
SW_NEW = "const CACHE_NAME = 'struchord-v823';"


def patch_html(text):
    text = replace_once(text, STATE_OLD, STATE_NEW, 'состояние модуля B-122')
    text = replace_once(text, AUDIBLE_OLD, AUDIBLE_NEW, 'audibleBackingTime: режим одних часов')
    text = replace_once(text, DECODE_HEAD_OLD, DECODE_HEAD_NEW, 'decodePeaks: захват буфера')
    text = replace_once(text, DECODE_BUF_OLD, DECODE_BUF_NEW, 'decodePeaks: размер буфера')
    text = replace_once(text, DECODE_COMMIT_OLD, DECODE_COMMIT_NEW, 'decodePeaks: сохранение буфера')
    text = replace_line(text, '  async function loadBlob(blob){', LOADBLOB_NEW, 'loadBlob: чистый старт файла')
    # Старые однострочные версии этих трёх функций обязаны исчезнуть:
    # объявления функций поднимаются, и последнее перекрыло бы новое.
    text = replace_line(text, '  function driftPlaybackRate(drift,base){', '', 'старый driftPlaybackRate')
    text = replace_line(text, '  function scheduleAudio(ctx, q, launchAt, targetOverride){', '', 'старый scheduleAudio')
    text = replace_line(text, STOPAUDIO_PREFIX, HELPERS_NEW, 'помощники записи + stopAudio/scheduleAudio')
    text = replace_once(text, MIX_VOL_OLD, MIX_VOL_NEW, 'микшер: громкость записи', count=2)
    text = replace_once(text, MUTE_OLD, MUTE_NEW, 'микшер: mute записи')
    text = replace_once(text, SYNCMIX_OLD, SYNCMIX_NEW, 'микшер: громкость после отрисовки')
    text = replace_once(text, DRAWER_VOL_OLD, DRAWER_VOL_NEW, 'панель: громкость и скорость')
    text = replace_once(text, SPEED_OLD, SPEED_NEW, 'ползунок скорости на ходу')
    text = replace_once(text, PLAYHEAD_RUN_OLD, PLAYHEAD_RUN_NEW, 'панель: признак «звучит» в бегунке')
    text = replace_once(text, PLAYHEAD_FRAME_OLD, PLAYHEAD_FRAME_NEW, 'панель: бегунок и секунды при источнике Web Audio')
    text = replace_once(text, PLAYHEAD_ACTIVE_OLD, PLAYHEAD_ACTIVE_NEW, 'панель: активное воспроизведение')
    text = replace_once(text, PLAYHEAD_GUARD_OLD, PLAYHEAD_GUARD_NEW, 'панель: остановка бегунка')
    text = replace_once(text, API_PATH_OLD, API_PATH_NEW, 'api: getPathInfo')
    text = replace_once(text, API_RESET_OLD, API_RESET_NEW, 'api: сброс буфера для новой песни')
    text = replace_once(text, BUFFER_RESET_OLD, BUFFER_RESET_NEW, 'loadSong/removeTrack/reset: сброс буфера', count=3)
    text = replace_once(text, GRID_ANCHOR_OLD, GRID_ANCHOR_NEW, 'основной скрипт: сдвиг сетки')
    text = replace_once(text, HTML_VERSION_OLD, HTML_VERSION_NEW, 'версия в шапке')
    return text


def main():
    ap = argparse.ArgumentParser(description='B-122 / 0.823: фоновая запись и сетка на одних часах')
    ap.add_argument('--check', action='store_true', help='только проверить якоря, файлы не менять')
    args = ap.parse_args()
    html = patch_html(read('STRUCHORD.html'))
    sw = replace_once(read('sw.js'), SW_OLD, SW_NEW, 'sw.js CACHE_NAME')
    print('  ok  %-20s 17 якорей' % 'STRUCHORD.html')
    print('  ok  %-20s 1 якорь' % 'sw.js')
    if args.check:
        print('ПРОВЕРКА ПРОЙДЕНА: все якоря на месте, файлы не менялись.')
        return 0
    write('STRUCHORD.html', html)
    write('sw.js', sw)
    print('ПАТЧ ПРИМЕНЁН: 0.822 -> 0.823 (HTML и sw.js выложены парой).')
    return 0


if __name__ == '__main__':
    sys.exit(main())
