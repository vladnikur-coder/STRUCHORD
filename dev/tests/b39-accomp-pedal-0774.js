'use strict';
// B-102 (0.774): педаль в клавишном аккомпанементе.
// Ноты аккомпанемента раньше обрывались на записанной длительности, и между
// атаками оставались провалы в тишину (замер: pop 0,54 с, jazz 0,58 с,
// funk 0,38 с внутри двух ячеек). Теперь звук тянется до следующей атаки,
// но не дальше конца ячейки и не для ручных рисунков.
const assert = require('assert'), puppeteer = require('puppeteer');
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/tmp/chromium', args: ['--no-sandbox'] });
  try {
    const p = await b.newPage(), errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.setViewport({ width: 1440, height: 900 });
    await p.evaluateOnNewDocument(() => localStorage.setItem('struchord-default-instrument', 'keys'));
    await p.goto(process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html');
    await p.waitForFunction(() => typeof StruChordAccomp !== 'undefined');

    async function generate(genre) {
      await p.evaluate(() => {
        startNewSongFromHome(); addSection('Chorus');
        const s = sections[0], q = s.squares[0];
        ['C', 'Am', 'F', 'G'].forEach((c, i) => setEventChord(q.events[i], c, { secId: s.id, sqId: q.id, ei: i }));
        StruChordKeys.open();
      });
      await wait(300);
      await p.evaluate(() => document.querySelector('#b39KeysSettingsToggle')?.click());
      await wait(150);
      await p.evaluate(() => document.querySelector('#b39AutoOpen')?.click());
      await wait(150);
      await p.evaluate(g => {
        const s = document.querySelector('#b39AutoPrimary');
        s.value = g; s.dispatchEvent(new Event('change', { bubbles: true }));
      }, genre);
      await wait(100);
      await p.evaluate(() => document.querySelector('#b39AutoApply').click());
      await wait(600);
    }

    // План ячейки так, как его зовёт проигрыватель: dur в секундах.
    const planCell = (cellIndex, bpm) => p.evaluate(({ cellIndex, bpm }) => {
      const T = StruChordTracks, s = sections[0], q = s.squares[0], t = T.track(T.state().activeTrackId);
      const ei = cellIndex, ev = q.events[ei], cell = T.cellKey(s, q, ei), pat = t.patterns[cell];
      const beats = pat.beats, dur = beats * 60 / bpm;
      const o = {
        trackId: t.id, cell, sec: s, sq: q, ev, ei, ts: '4/4', span: beats, dur,
        chord: T.trackChord(t.id, cell, ev), key: s.key || globalKey,
        range: T.keyRange(t.id), notes: []
      };
      const steps = StruChordAccomp.plan(o) || [];
      const raw = StruChordAccomp.plan(Object.assign({}, o, { noPedal: true })) || [];
      const exported = StruChordExport.stepsFor(t, cell, s, q, ev, ei, o.chord, o.key, o.range, [], beats, '4/4');
      return {
        dur, beats, status: pat.status, genre: (T.state().autoAccomp || {}).primary,
        steps: steps.map((st, i) => ({ at: st.at, dur: st.dur, notes: (st.notes || []).length, raw: (raw[i] || {}).dur })),
        exported: (exported || []).map(st => ({ at: st.at, dur: st.dur, notes: (st.notes || []).length })),
        stored: pat.notes.map(n => ({ beat: n.beat, duration: n.duration }))
      };
    }, { cellIndex, bpm });

    await generate('pop');
    const pop = await planCell(0, 120);
    assert.equal(pop.genre, 'pop');
    assert(pop.steps.length > 1, 'аккомпанемент раскладывается по шагам');
    // Каждая атака (весь аккорд, а не последняя нота) дотянута до следующей:
    // провалов в тишину нет, и ни один голос не гаснет раньше остальных.
    const atTol = pop.dur / pop.beats * 0.05, gap = pop.dur / pop.beats * 0.04;
    const attacks = [];
    for (const st of pop.steps) if (!attacks.length || st.at - attacks[attacks.length - 1] > atTol) attacks.push(st.at);
    let extended = 0, checked = 0;
    for (const st of pop.steps) {
      const next = attacks.find(a => a > st.at + atTol);
      if (!Number.isFinite(next) || !st.notes || !(st.raw > 0)) continue;
      const room = Math.min(next, pop.dur) - gap - st.at;
      if (st.raw >= room) { assert.equal(st.dur, st.raw, 'уже длинная нота не укорачивается'); continue; }
      checked++;
      assert(st.dur <= room + 1e-6, 'нота не выходит за следующую атаку');
      assert(st.dur > room - 1e-3, 'все голоса атаки тянутся до следующей');
      extended++;
    }
    assert(checked >= 6 && extended === checked, `педаль закрывает все провалы (${extended}/${checked})`);

    // Ни одна нота не потеряна и не добавлена: педаль — про длительность.
    const totals = z => z.steps.reduce((a, s) => a + s.notes, 0);
    assert.equal(totals(pop), pop.stored.length, 'педаль не меняет набор нот');
    // Экспорт получает то же, что звучит. Единицы времени у экспорта свои
    // (доли такта), поэтому сравниваем нормированные значения.
    const norm = (list, scale) => list.map(s => [Math.round(s.at / scale * 1e4), Math.round(s.dur / scale * 1e4)]);
    assert.equal(pop.exported.length, pop.steps.length, 'экспорт получает тот же рисунок');
    const A = norm(pop.exported, pop.beats), B = norm(pop.steps, pop.dur);
    if (JSON.stringify(A) !== JSON.stringify(B)) console.log('DIFF', JSON.stringify(A), JSON.stringify(B), 'beats', pop.beats, 'dur', pop.dur);
    assert.deepStrictEqual(A, B, 'экспорт совпадает со звуком');

    // Фанк остаётся собранным: отрывистость — часть грува.
    await generate('funk');
    const funk = await planCell(0, 120);
    const funkGap = funk.dur / funk.beats * 0.04;
    const funkShort = funk.steps.filter((st, i) => {
      const next = funk.steps.slice(i + 1).find(x => x.at > st.at + 1e-6);
      const room = (next ? next.at : funk.dur) - st.at - funkGap;
      return room > 0.05 && st.notes && st.dur < room - 0.005;
    });
    assert(funkShort.length >= 2, 'в фанке часть нот остаётся короткой');

    // Ручной рисунок не переписываем: длительности остаются как расставил пользователь.
    const manual = await p.evaluate(() => {
      const T = StruChordTracks, s = sections[0], q = s.squares[0], t = T.track(1);
      const cell = T.cellKey(s, q, 0), pat = t.patterns[cell];
      const stored = pat.notes.map(n => ({ beat: n.beat, duration: n.duration }));
      pat.status = 'manual';
      T.setPattern(t.id, cell, pat);
      const ev = q.events[0], beats = pat.beats, dur = beats * 60 / 120;
      const steps = StruChordAccomp.plan({
        trackId: t.id, cell, sec: s, sq: q, ev, ei: 0, ts: '4/4', span: beats, dur,
        chord: T.trackChord(t.id, cell, ev), key: globalKey, range: T.keyRange(t.id), notes: []
      }) || [];
      return { steps: steps.map(st => ({ at: st.at, dur: st.dur })), unit: dur / beats, stored };
    });
    for (const st of manual.steps) {
      const source = manual.stored.find(n => Math.abs(n.beat * manual.unit - st.at) < 1e-6);
      if (source) assert(Math.abs(st.dur - source.duration * manual.unit) < 1e-6, 'ручная длительность сохранена');
    }
    assert.deepStrictEqual(errors, []);
    console.log(`Accompaniment pedal: ${checked} steps reach the next attack in pop, funk keeps ${funkShort.length} short steps, manual durations and export untouched — OK`);
  } finally { await b.close(); }
})().catch(e => { console.error(e); process.exit(1); });
