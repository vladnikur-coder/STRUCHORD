'use strict';
// B-103 (0.775): смена темпа «на ходу».
//
// Две ошибки, которые ловит этот тест:
//  1) BPM tap менял только число в поле, не пересобирая рисунок аккомпанемента.
//     Рисунок хранит темп, под который собран, и планировщик такой рисунок не
//     играет — аккомпанемент замолкал (замер: 8 нот до тапа, 0 после).
//  2) Любой перезапуск игры ради нового темпа возобновлял её со СЛЕДУЮЩЕЙ
//     ячейки: указатель планировщика уже сдвинут. Звучащая ячейка обрывалась,
//     следующая начиналась раньше срока (Am длиной 0.8 с вместо 2 с).
//
// Проверяем: тап не глушит аккомпанемент; при смене темпа ни одна уже
// поставленная нота не обрывается до своего начала; метроном переходит на
// новый темп без «залпа» прошедших кликов; при смене размера игра
// перезапускается с ЗВУЧАЩЕЙ ячейки, а не со следующей.
const assert = require('assert'), puppeteer = require('puppeteer');
const wait = ms => new Promise(r => setTimeout(r, ms));
const URL = process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html';

(async () => {
  const b = await puppeteer.launch({ executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/tmp/chromium', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  try {
    const p = await b.newPage(), errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.setViewport({ width: 1440, height: 900 });
    await p.evaluateOnNewDocument(() => localStorage.setItem('struchord-default-instrument', 'keys'));
    await p.goto(URL, { waitUntil: 'load' });
    await p.waitForFunction(() => typeof StruChordAccomp !== 'undefined');

    await p.evaluate(() => {
      startNewSongFromHome(); addSection('Chorus');
      const s = sections[0], q = s.squares[0];
      ['C', 'Am', 'F', 'G'].forEach((c, i) => setEventChord(q.events[i], c, { secId: s.id, sqId: q.id, ei: i }));
      StruChordKeys.open();
    });
    await wait(400);
    await p.evaluate(() => document.querySelector('#b39KeysSettingsToggle')?.click());
    await wait(150);
    await p.evaluate(() => document.querySelector('#b39AutoOpen')?.click());
    await wait(150);
    await p.evaluate(() => {
      const s = document.querySelector('#b39AutoPrimary');
      s.value = 'pop'; s.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await wait(100);
    await p.evaluate(() => document.querySelector('#b39AutoApply').click());
    await wait(700);

    // План первой ячейки так, как его зовёт проигрыватель.
    const planCell = () => p.evaluate(() => {
      const T = StruChordTracks, t = T.track(T.state().activeTrackId), s = sections[0], q = s.squares[0];
      const ev = q.events[0], cell = T.cellKey(s, q, 0), pat = t.patterns[cell];
      const steps = StruChordAccomp.plan({
        trackId: t.id, cell, sec: s, sq: q, ev, ei: 0, ts: '4/4', span: Number(ev.span),
        dur: Number(ev.span) * 60 / getEffectiveBpm(s), chord: T.trackChord(t.id, cell, ev),
        key: globalKey, range: T.keyRange(t.id), notes: []
      }) || [];
      return { bpm: getEffectiveBpm(s), storedBpm: pat && pat.bpm, notes: steps.reduce((a, x) => a + (x.notes || []).length, 0) };
    });

    // --- 1. Тап-темп не выключает аккомпанемент -------------------------
    const beforeTap = await planCell();
    assert(beforeTap.notes > 0, 'аккомпанемент звучит до тапа');
    for (let i = 0; i < 4; i++) { await p.evaluate(() => document.getElementById('btnTapTempo')?.click()); await wait(520); }
    const afterTap = await planCell();
    assert.notEqual(afterTap.bpm, beforeTap.bpm, 'тап изменил темп');
    assert.equal(afterTap.storedBpm, afterTap.bpm, 'рисунок пересобран под новый темп');
    assert(afterTap.notes > 0, 'после тапа аккомпанемент по-прежнему звучит');

    // Восстановим ровный темп для дальнейших проверок.
    await p.evaluate(() => { const el = document.getElementById('bpmInput'); el.value = '120'; el.dispatchEvent(new Event('change', { bubbles: true })); });
    await wait(600);

    // --- 2-3. Темп на ходу: без обрыва и без «залпа» метронома ----------
    await p.evaluate(() => {
      window.__notes = []; window.__clicks = [];
      const S = AudioBufferSourceNode.prototype, ostart = S.start, ostop = S.stop;
      S.start = function (when) { this.__rec = { at: +(when || 0).toFixed(3), now: +this.context.currentTime.toFixed(3), stop: null }; window.__notes.push(this.__rec); return ostart.apply(this, arguments); };
      S.stop = function (when) { try { if (this.__rec) this.__rec.stop = +((when === undefined ? this.context.currentTime : when)).toFixed(3); } catch (e) {} return ostop.apply(this, arguments); };
      const O = OscillatorNode.prototype, ocstart = O.start;
      O.start = function (when) { try { window.__clicks.push({ at: +(when || 0).toFixed(3), now: +this.context.currentTime.toFixed(3), f: this.frequency.value }); } catch (e) {} return ocstart.apply(this, arguments); };
      toggleMetronome();
    });
    assert.equal(await p.evaluate(() => playbackState.metronomeMuted), false, 'метроном включён для проверки');
    await p.evaluate(() => document.querySelector('#btnPlay')?.click());
    await wait(2600);

    const before = await p.evaluate(() => ({ sounding: playbackState.soundingCell, next: playbackState.currentEventIndex, dur: playbackState.cellDur }));
    assert(before.sounding, 'планировщик знает, какая ячейка звучит');
    await p.evaluate(() => {
      window.__mark = +getAudioContext().currentTime.toFixed(3);
      const el = document.getElementById('bpmInput'); el.value = '160'; el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await wait(2500);
    const live = await p.evaluate(() => ({ notes: window.__notes, clicks: window.__clicks, mark: window.__mark, dur: playbackState.cellDur }));
    await p.evaluate(() => document.querySelector('#btnPlay')?.click());

    const cut = live.notes.filter(n => n.stop !== null && n.stop < n.at - 1e-6);
    assert.equal(cut.length, 0, `смена темпа не обрывает уже поставленные ноты (оборвано: ${cut.length})`);
    assert(live.dur < before.dur - 1e-6, 'следующая ячейка считается уже в новом темпе');

    const clicks = live.clicks.filter(c => c.f > 600);
    const afterMark = clicks.filter(c => c.now >= live.mark);
    assert(afterMark.length >= 4, 'метроном продолжает идти после смены темпа');
    // «Залп» — это пачка кликов, поставленных задним числом от начала такта.
    // Один опоздавший на кадр клик — норма: сетка от этого не едет.
    const past = afterMark.filter(c => c.at < c.now - 0.02);
    // Порог 2, а не 1: под нагрузкой (весь корпус подряд) на кадр может
    // опоздать и второй клик. «Залп» — это десяток кликов задним числом,
    // его тест по-прежнему ловит; интервалы ниже проверяются отдельно.
    assert(past.length <= 2, `клики не планируются пачкой в прошлом (опоздало: ${past.length})`);
    const gaps = afterMark.slice(1).map((c, i) => +(c.at - afterMark[i].at).toFixed(3));
    assert(gaps.every(g => Math.abs(g - 60 / 160) < 0.03), `метроном перешёл на новый темп (интервалы: ${gaps.join(', ')})`);

    // --- 4. Смена размера: перезапуск со ЗВУЧАЩЕЙ ячейки ----------------
    await p.evaluate(() => { const el = document.getElementById('bpmInput'); el.value = '120'; el.dispatchEvent(new Event('change', { bubbles: true })); });
    await wait(300);
    await p.evaluate(() => document.querySelector('#btnPlay')?.click());
    await wait(2600);
    const soundingBefore = await p.evaluate(() => playbackState.soundingCell?.eventIndex);
    assert(Number.isInteger(soundingBefore) && soundingBefore > 0, 'играем не первую ячейку');
    await p.evaluate(() => { const s = sections[0]; setSectionTimeSig(s.id, '3/4'); });
    await wait(400);
    const soundingAfter = await p.evaluate(() => ({ ei: playbackState.soundingCell?.eventIndex, playing: playbackState.isPlaying }));
    await p.evaluate(() => document.querySelector('#btnPlay')?.click());
    assert.equal(soundingAfter.playing, true, 'после смены размера игра продолжается');
    assert.equal(soundingAfter.ei, soundingBefore, 'продолжаем со звучащей ячейки, а не со следующей');

    assert.deepStrictEqual(errors, []);
    console.log(`Tempo live: tap keeps accompaniment (${beforeTap.notes} -> ${afterTap.notes} notes), tempo change cuts ${cut.length} notes, metronome ${gaps[0]} s, size change resumes cell ${soundingAfter.ei} — OK`);
  } finally { await b.close(); }
})().catch(e => { console.error(e); process.exit(1); });
