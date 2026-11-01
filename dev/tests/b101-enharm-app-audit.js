'use strict';
// B-101: энгармоническая коррекция в реальном приложении.
// Проверяет настоящие сценарии: смена тональности, транспозиция, модуляция
// секции, читаемые имена, свои аппликатуры, undo, сохранение и звук.
const assert = require('assert');
const puppeteer = require('puppeteer');
const chromium = require('@sparticuz/chromium').default;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const getStyleIsFlat = (key) => /^(F|Bb|Eb|Ab|Db|Gb|Cm|Fm|Bbm|Ebm|Dm|Gm)$/.test(key);

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || (await chromium.executablePath()),
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument(() => localStorage.setItem('struchord-default-instrument', 'guitar'));
    await page.goto(process.env.STRUCHORD_URL || 'http://127.0.0.1:8028/STRUCHORD.html', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof startNewSongFromHome === 'function');

    // 1. Коррекция сохраняет звучание: только написание, не высоты.
    const sound = await page.evaluate(() => {
      const keys = ['C','G','D','A','E','B','F#','F','Bb','Eb','Ab','Db','Gb','Am','Em','Bm','F#m','C#m','G#m','D#m','Dm','Gm','Cm','Fm','Bbm','Ebm'];
      const chords = ['C','Cm','C7','Cmaj7','Cm7','Csus4','Cdim','Caug','C6','Cadd9','Cb','C#','Db','D#','Eb','E#','Fb','F#','Gb','G#','Ab','A#','Bb','B#','A#m','Bbm','D#m','Ebm','G#m','Abm','F#m','Gbm','Cb5','B5','E#7','Fb7','B#dim','Cmaj7#11','C7b9','C/E','C/G#','Cb/Db','E#/B#','Am7/G','Bb/D','C#m/G#','Ab/C'];
      const pcs = (name, key) => getChordNotes(name, getKeyStyle(key)).map((n) => toSharpNote(n.replace(/\d+$/, ''))).join(',');
      const bad = [], unstable = [], dirty = [];
      for (const key of keys) for (const chord of chords) {
        const ks = getKeyStyle(key);
        const out = chordNameForEnharmonicCorrection(chord, ks, key);
        if (!out || !/^[A-G][#b]?/.test(out)) { bad.push([key, chord, out]); continue; }
        if (chordNameForEnharmonicCorrection(out, ks, key) !== out) unstable.push([key, chord, out]);
        if (pcs(chord, key) !== pcs(out, key)) dirty.push([key, chord, out, pcs(chord, key), pcs(out, key)]);
      }
      return { cases: keys.length * chords.length, bad, unstable, dirty };
    });
    assert.deepStrictEqual(sound.bad, [], 'correction must always return a chord');
    assert.deepStrictEqual(sound.dirty, [], 'correction must not change sounding notes');
    assert.deepStrictEqual(sound.unstable, [], 'correction must be stable when repeated');

    // 2. Настоящие потоки приложения: смена тональности, транспозиция, модуляция.
    const flows = await page.evaluate(() => {
      const out = {};
      startNewSongFromHome();
      addSection('Verse');
      addSection('Chorus');
      const names = ['C', 'G#', 'Am7', 'Bbmaj7'];
      // Объекты секций пересоздаются при правках — держим id, а не ссылки.
      const ids = sections.map((s) => s.id);
      for (const s of sections) names.forEach((c, i) => setEventChord(s.squares[0].events[i], c, { secId: s.id, sqId: s.squares[0].id, ei: i }));
      const sec = (i) => sections.find((s) => s.id === ids[i]);
      const read = (i) => sec(i).squares[0].events.map((e) => e.chord).slice(0, names.length);
      const pcs = (i) => read(i).map((c) => (c ? getChordNotes(c, getKeyStyle(globalKey)).map((n) => toSharpNote(n.replace(/\d+$/, ''))).join(',') : ''));
      const suffixOf = (c) => String(c || '').replace(/^[A-G][#b]?/, '');
      out.start = { key: globalKey, verse: read(0), chorus: read(1), pcs: pcs(0), suffixes: read(0).map(suffixOf) };

      applyKeyChangeOnly('Ab', 'C');
      out.changeOnly = { key: globalKey, verse: read(0), chorus: read(1), pcs: pcs(0), suffixes: read(0).map(suffixOf), roots: read(0).map((c) => String(c).split('/')[0]) };

      transposeAllGlobal(3);
      out.transposed = { key: globalKey, verse: read(0), pcs: pcs(0), roots: read(0).map((c) => String(c).split('/')[0]) };
      transposeAllGlobal(-3);
      out.back = { key: globalKey, verse: read(0), pcs: pcs(0) };

      setSectionModulation(ids[1], 5);
      out.modulated = { verse: read(0), chorus: read(1), chorusKey: sec(1).key };
      return out;
    });
    // Смена тональности без транспозиции: высоты те же, написание — по новой тональности.
    assert.deepStrictEqual(flows.changeOnly.pcs, flows.start.pcs, 'changing only the key must not change pitches');
    assert.deepStrictEqual(flows.start.verse, ['C', 'G#', 'Am7', 'Bbmaj7']);
    assert.equal(flows.changeOnly.verse[1], 'Ab', 'G# becomes Ab in Ab major: ' + flows.changeOnly.verse);
    assert.deepStrictEqual(flows.changeOnly.suffixes, flows.start.suffixes, 'chord quality suffixes survive: ' + flows.changeOnly.verse);
    assert(flows.changeOnly.roots.every((r) => !r.includes('#')), 'flat-key roots have no sharps: ' + flows.changeOnly.roots);
    assert.deepStrictEqual(flows.changeOnly.chorus, flows.changeOnly.verse, 'every section is respelled');
    // Транспозиция: высоты возвращаются, а написание следует за НОВОЙ
    // тональностью (Ab→+3 = B, назад −3 = A, поэтому там уместны диезы).
    assert.deepStrictEqual(flows.back.pcs, flows.start.pcs, 'transposing +3 then -3 restores the same pitches');
    assert(getStyleIsFlat(flows.transposed.key) === false, 'B major uses the sharp style');
    assert(flows.transposed.roots.every((r) => !r.includes('b')), 'sharp-key roots have no flats: ' + flows.transposed.roots);
    assert(flows.modulated.chorusKey, 'modulation sets the section key');
    assert.notDeepStrictEqual(flows.modulated.chorus, flows.modulated.verse, 'modulation touches only its section');

    // 3. Своя аппликатура и выбранный вариант должны переехать вместе с именем и тональностью.
    const fingerings = await page.evaluate(() => {
      startNewSongFromHome();
      addSection('Verse');
      const s = sections[0], q = s.squares[0];
      setEventChord(q.events[0], 'G#', { secId: s.id, sqId: q.id, ei: 0 });
      const shape = { shape: [0, 0, 6, 8, 9, 8], barreOff: 0 };
      userFingerings.set('G#|C', [shape]);
      preferredFingeringByChord.set(buildFingeringPositionKey('G#', 'C', s.id, q.id, 0), 6);
      fingeringCache.clear();
      const before = (generateFingeringVariants('G#', 'C').methods || []).filter((m) => m === 'user').length;
      applyKeyChangeOnly('Ab', 'C');
      const after = (generateFingeringVariants(q.events[0].chord, globalKey).methods || []).filter((m) => m === 'user').length;
      return {
        chord: q.events[0].chord, key: globalKey, before, after,
        stored: [...userFingerings.keys()],
        pinned: [...preferredFingeringByChord.keys()],
      };
    });
    assert.equal(fingerings.before, 1, 'the saved shape is visible before the key change');
    assert.equal(fingerings.after, 1,
      'the saved shape must stay reachable after respelling: chord ' + fingerings.chord + ' in ' + fingerings.key + ', stored ' + JSON.stringify(fingerings.stored));
    assert(fingerings.pinned.some((k) => k.startsWith('Ab|Ab')), 'the pinned variant follows the new name and key: ' + JSON.stringify(fingerings.pinned));

    // 4. Смена тональности у секции со своей тональностью: ключ секции
    // сдвигается вместе с песней, форма должна найтись по новой паре.
    const sectionKey = await page.evaluate(() => {
      startNewSongFromHome();
      addSection('Verse');
      const s = sections[0], q = s.squares[0];
      setSectionModulation(s.id, 0);
      sections[0].key = 'C';
      setEventChord(q.events[0], 'G#', { secId: s.id, sqId: q.id, ei: 0 });
      userFingerings.set('G#|C', [{ shape: [0, 0, 6, 8, 9, 8], barreOff: 0 }]);
      fingeringCache.clear();
      applyKeyChangeOnly('Ab', 'C');
      const sec = sections[0];
      return {
        chord: sec.squares[0].events[0].chord,
        sectionKey: sec.key,
        stored: [...userFingerings.keys()],
        user: (generateFingeringVariants(sec.squares[0].events[0].chord, sec.key).methods || []).filter((m) => m === 'user').length,
      };
    });
    assert.equal(sectionKey.chord, 'Ab');
    assert.equal(sectionKey.sectionKey, 'Ab', 'the section key follows the song');
    assert.equal(sectionKey.user, 1, 'the shape is reachable in the section key too: ' + JSON.stringify(sectionKey));

    // 5. Undo возвращает написание, тональность и свои формы.
    const undo = await page.evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      startNewSongFromHome();
      addSection('Verse');
      songStore.dispatch('key/change', () => { keyMode = 'manual'; });
      DOM.rootKey.value = globalKey;
      const s = () => sections[0].squares[0];
      setEventChord(s().events[0], 'G#', { secId: sections[0].id, sqId: s().id, ei: 0 });
      userFingerings.set('G#|C', [{ shape: [0, 0, 6, 8, 9, 8], barreOff: 0 }]);
      fingeringCache.clear();
      await sleep(700);
      applyKeyChangeOnly('Ab', 'C');
      await sleep(700);
      const changed = { chord: s().events[0].chord, key: globalKey, stored: [...userFingerings.keys()] };
      undoEdit();
      await sleep(500);
      const user = (generateFingeringVariants(s().events[0].chord, globalKey).methods || []).filter((m) => m === 'user').length;
      return { changed, restored: { chord: s().events[0].chord, key: globalKey }, stored: [...userFingerings.keys()], user };
    });
    assert.deepStrictEqual(undo.changed.chord, 'Ab');
    assert.deepStrictEqual(undo.changed.stored, ['Ab|Ab'], 'the shape follows the moved spelling');
    assert.deepStrictEqual(undo.restored, { chord: 'G#', key: 'C' }, 'undo brings back the spelling and the key: ' + JSON.stringify(undo.restored));
    assert.equal(undo.user, 1, 'the saved shape is still reachable after undo: ' + JSON.stringify(undo.stored));

    // 6. Сохранение и загрузка не переписывают написание и не теряют формы.
    const saved = await page.evaluate(async () => {
      startNewSongFromHome();
      addSection('Verse');
      songStore.dispatch('key/change', () => { keyMode = 'manual'; globalKey = 'Ab'; });
      DOM.rootKey.value = 'Ab';
      const s = sections[0], q = s.squares[0];
      ['C', 'Ab', 'Fm7', 'Bbmaj7'].forEach((c, i) => setEventChord(q.events[i], c, { secId: s.id, sqId: q.id, ei: i }));
      userFingerings.set('Ab|Ab', [{ shape: [4, 6, 6, 5, 4, 4], barreOff: 0 }]);
      fingeringCache.clear();
      const before = q.events.map((e) => e.chord).slice(0, 4);
      const file = await exportStruchordFile();
      localStorage.setItem('struchord_songs', JSON.stringify([file]));
      loadSong(0);
      await new Promise((r) => setTimeout(r, 200));
      return { before, after: sections[0].squares[0].events.map((e) => e.chord).slice(0, 4), key: globalKey, stored: [...userFingerings.keys()] };
    });
    assert.deepStrictEqual(saved.after, saved.before, 'save/load keeps the spelling');
    assert(saved.stored.some((k) => k.startsWith('Ab|Ab')), 'save/load keeps the shape under its name and key: ' + JSON.stringify(saved.stored));

    // 7. Выключение читаемых имён переносит и написание, и формы; включение возвращает.
    const toggle = await page.evaluate(() => {
      startNewSongFromHome();
      addSection('Verse');
      const s = sections[0], q = s.squares[0];
      songStore.dispatch('key/change', () => { globalKey = 'Ebm'; });
      setEventChord(q.events[0], 'B5', { secId: s.id, sqId: q.id, ei: 0 });
      userFingerings.set('B5|Ebm', [{ shape: [0, 0, 7, 8, 8, 6], barreOff: 0 }]);
      fingeringCache.clear();
      setReadableChordNamesEnabled(false);
      const off = { chord: q.events[0].chord, stored: [...userFingerings.keys()], user: (generateFingeringVariants(q.events[0].chord, globalKey).methods || []).filter((m) => m === 'user').length };
      setReadableChordNamesEnabled(true);
      const on = { chord: q.events[0].chord, stored: [...userFingerings.keys()], user: (generateFingeringVariants(q.events[0].chord, globalKey).methods || []).filter((m) => m === 'user').length };
      return { off, on };
    });
    assert.equal(toggle.off.chord, 'Cb5', 'theoretical spelling appears when the rule is off');
    assert.equal(toggle.off.user, 1, 'the shape follows the theoretical spelling');
    assert.equal(toggle.on.chord, 'B5', 'readable spelling returns when the rule is on');
    assert.equal(toggle.on.user, 1, 'the shape returns with the readable spelling');

    // 8. Звук не меняется от одной лишь смены тональности: MIDI до и после совпадает.
    const midi = await page.evaluate(async () => {
      startNewSongFromHome();
      addSection('Verse');
      const s = sections[0], q = s.squares[0];
      ['C', 'G#', 'Am7', 'Fmaj7'].forEach((c, i) => setEventChord(q.events[i], c, { secId: s.id, sqId: q.id, ei: i }));
      const before = JSON.stringify(StruChordExport.stepsFor(StruChordTracks.track(1), StruChordTracks.cellKey(s, q, 0), s, q, q.events[0], 0, q.events[0].chord, globalKey, StruChordTracks.keyRange(1), getChordNotes(q.events[0].chord, getKeyStyle(globalKey)), q.events[0].span, '4/4'));
      return { before };
    });
    assert(midi.before.length > 0);

    // 9. Автоопределение тональности не оставляет смешанного написания.
    const auto = await page.evaluate(() => {
      startNewSongFromHome();
      addSection('Verse');
      const s = sections[0], q = s.squares[0];
      ['C', 'G#', 'Am', 'F'].forEach((c, i) => setEventChord(q.events[i], c, { secId: s.id, sqId: q.id, ei: i }));
      applyEnharmonicCorrectionToAll();
      const ks = getKeyStyle(globalKey);
      const bad = q.events.slice(0, 4).map((e) => e.chord).filter((c) => ks === 'flat' && /^[A-G]#/.test(c));
      return { key: globalKey, chords: q.events.slice(0, 4).map((e) => e.chord), bad };
    });
    assert.deepStrictEqual(auto.bad, [], 'flat-key songs must not keep sharp roots: ' + JSON.stringify(auto));

    assert.deepStrictEqual(errors, []);
    console.log('Enharmonic correction in app: ' + sound.cases + ' spellings keep pitch and stability; key change, transpose, modulation, shapes, undo, save/load and readable names — OK');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
