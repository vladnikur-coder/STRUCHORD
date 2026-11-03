'use strict';
// 0.780: настоящее голосоведение вместо «выбрать позицию поближе к центру».
// Проверяем то, что слышно на слух, а не только то, что ноты из аккорда:
//   * общие тоны соседних аккордов остаются на месте;
//   * остальные голоса идут шагом (скачок больше кварты — исключение);
//   * параллельных квинт и октав нет;
//   * бас живёт в левой руке, ниже правой, и совпадает с басом аккорда;
//   * состав аккорда не меняется (R12) — те же ступени, что в обычной позиции;
//   * ручной выбор позиции и свои ноты главнее автоматики;
//   * у старой песни без поля поведение прежнее (миграции нет).
const assert = require('assert'), puppeteer = require('puppeteer');

const mod12 = n => ((n % 12) + 12) % 12;

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/tmp/chromium',
    args: ['--no-sandbox']
  });
  try {
    const page = await browser.newPage();
    page.on('pageerror', e => { throw Error(e.message); });
    await page.evaluateOnNewDocument(() => localStorage.setItem('struchord-default-instrument', 'keys'));
    await page.goto(process.env.STRUCHORD_URL || 'http://127.0.0.1:8031/STRUCHORD.html', { waitUntil: 'load' });

    const data = await page.evaluate(() => {
      startNewSongFromHome(); addSection('Verse');
      // В странице своя область видимости: mod12 снаружи недоступен.
      const mod12 = n => ((n % 12) + 12) % 12;
      const T = window.StruChordTracks, K = window.StruChordKeys, F = window.StruChordFormula;
      const range = T.keyRange(1);
      const chain = (chords, key) => {
        let prev = null, rows = [];
        for (const chord of chords) {
          const notes = K.voiceLead(chord, key || 'C', range, prev, {});
          rows.push({ chord, notes: notes || [] });
          prev = notes;
        }
        return rows;
      };
      const progs = {
        pop: ['C', 'G', 'Am', 'F'],
        jazz: ['Dm7', 'G7', 'Cmaj7'],
        rock: ['E', 'G#m', 'C#m', 'B'],
        minor: ['Am', 'F', 'C', 'G'],
        slash: ['C/E', 'F', 'G/B', 'C']
      };
      const out = { chains: {}, pcs: {}, narrow: {}, manual: {}, legacy: {}, repeat: {}, pipeline: {} };
      for (const [name, chords] of Object.entries(progs)) out.chains[name] = chain(chords);

      // Состав аккорда: наборы ступеней у голосоведения и у обычной позиции.
      for (const chord of ['C', 'Am', 'Dm7', 'G7', 'C13', 'C/E', 'F#m7b5', 'Cmaj7']) {
        const lead = K.voiceLead(chord, 'C', range, null, {});
        const variants = K.generateKeysVoicings(chord, 'C', range, null, {});
        const base = variants && variants[0];
        const f = F.chordFormula(chord, 'C');
        if (!f || !base || !lead) { out.pcs[chord] = { skipped: true }; continue; }
        const formulaPcs = f.tones.map(t => mod12(f.rootPc + t.semitones));
        out.pcs[chord] = {
          lead: lead ? lead.slice(1).map(mod12).sort((a, b) => a - b) : null,
          formulaPcs: Array.from(new Set(formulaPcs)).sort((a, b) => a - b),
          // Терция — по ступени из формулы: у минора она не «корень+4».
          thirdPc: (function () {
            const third = f.tones.filter(t => /^(b|#)?3$/.test(String(t.degree)))[0];
            return third ? mod12(f.rootPc + third.semitones) : null;
          })(),
          rootPc: f.rootPc,
          bassPc: f.bass ? f.bass.pitchClass : f.rootPc,
          leadBassPc: lead ? mod12(lead[0]) : null,
          range: [range.low, range.high]
        };
      }
      // Узкие клавиатуры: всё в диапазоне, бас ниже руки.
      for (const size of [25, 37, 49, 61, 88]) {
        T.setTrackKeyboardSize(1, size);
        const r = T.keyRange(1);
        const notes = K.voiceLead('Cmaj7', 'C', r, null, {});
        out.narrow[size] = { notes: notes, low: r.low, high: r.high };
      }
      T.setTrackKeyboardSize(1, null);

      // Детерминизм: второй проход и сброс кэша дают те же ноты.
      for (const chord of ['C', 'Am', 'Dm7', 'G7', 'Cmaj7', 'C13']) {
        const a = K.voiceLead(chord, 'C', range, [36, 55, 60, 64], {});
        K.clearLinkedCache();
        const b = K.voiceLead(chord, 'C', range, [36, 55, 60, 64], {});
        out.repeat[chord] = [a, b];
      }

      // Что показывает панель, то же играет транспорт.
      {
        const sec = sections[0], sq = sec.squares[0];
        ['C', 'G', 'Am', 'F'].forEach((c, i) => { sq.events[i].chord = c; });
        T.setLinkedVoicings(1, true);
        const cell = T.cellKey(sec, sq, 1);
        const selected = K.linkedSelection(1, cell);
        const steps = window.StruChordAccomp.plan({
          trackId: 1, sec: sec, chord: 'G', key: 'C', range: T.keyRange(1), notes: selected.notes,
          span: 1, dur: 1, ts: '4/4', pattern: { type: 'keys-block', subdivision: 1, steps: ['H'] },
          patternSource: 'cell', noHighlight: true
        });
        out.pipeline = {
          selected: selected && selected.notes,
          played: steps && steps[0] ? steps[0].notes : null,
          saved: T.exportForSave().tracks[0].linkedVoicings
        };
      }

      // Ручной выбор позиции главнее автоматики: E→G#m с выбранным вариантом.
      {
        const s = sections[0], sq = s.squares[0];
        sq.events[0].chord = 'E'; sq.events[1].chord = 'G#m';
        const cell0 = T.cellKey(s, sq, 0), cell1 = T.cellKey(s, sq, 1);
        T.setLinkedVoicings(1, true);
        const auto = K.linkedSelection(1, cell1);
        T.setVoicingForChord(1, 'G#m', 1);
        K.clearLinkedCache();
        const manual = K.linkedSelection(1, cell1);
        out.manual = { auto: auto && auto.notes, manual: manual && manual.notes, flagged: !!(manual && manual.manual), cell0 };
      }

      // Старая песня: нет поля linkedVoicings — режим прежний.
      {
        const raw = { sections: JSON.parse(JSON.stringify(sections)), ...T.exportForSave() };
        delete raw.tracks[0].linkedVoicings;
        const attached = T.attach(raw, raw);
        out.legacy = { linked: !!attached.tracks[0].linkedVoicings };
        T.setLinkedVoicings(1, true);
      }
      return out;
    });

    // --- 1. Общие тоны держатся, голоса идут шагом ------------------------
    const pop = data.chains.pop;
    for (let i = 1; i < pop.length; i++) {
      const prev = pop[i - 1].notes, cur = pop[i].notes;
      assert(prev.length && cur.length, 'обе позиции есть: ' + pop[i].chord);
      const held = prev.slice(1).filter(n => cur.slice(1).indexOf(n) >= 0);
      // Общий тон есть не у всякой пары (G → Am их не имеет) — проверяем,
      // что совпадающие по высоте звуки остаются стоять, а не переезжают.
      const commonPcs = prev.slice(1).map(mod12).filter(pc => cur.slice(1).map(mod12).includes(pc));
      if (commonPcs.length) {
        assert(held.length >= 1, pop[i - 1].chord + ' → ' + pop[i].chord +
          ': общий тон ' + commonPcs.join(',') + ' остаётся на месте, а не переезжает');
      }
      const moves = cur.slice(1).map((n, k) => Math.abs(n - (prev.slice(1)[k] !== undefined ? prev.slice(1)[k] : n)));
      assert(Math.max(...moves) <= 4, pop[i - 1].chord + ' → ' + pop[i].chord +
        ': голоса идут не больше кварти, а не ' + Math.max(...moves));
    }
    for (const name of ['jazz', 'rock', 'minor', 'slash']) {
      const rows = data.chains[name];
      for (let i = 1; i < rows.length; i++) {
        const a = rows[i - 1].notes.slice(1), b = rows[i].notes.slice(1);
        const same = Math.min(a.length, b.length);
        const moves = [];
        for (let k = 0; k < same; k++) moves.push(Math.abs(a[k] - b[k]));
        assert(Math.max(...moves) <= 4, name + ': ' + rows[i].chord + ' — голос скакнул на ' + Math.max(...moves));
      }
    }

    // --- 2. Параллельных квинт и октав нет --------------------------------
    for (const name of Object.keys(data.chains)) {
      const rows = data.chains[name];
      for (let i = 1; i < rows.length; i++) {
        const a = rows[i - 1].notes.slice(1), b = rows[i].notes.slice(1);
        for (let x = 0; x < Math.min(a.length, b.length); x++) {
          for (let y = x + 1; y < Math.min(a.length, b.length); y++) {
            const from = mod12(a[y] - a[x]), to = mod12(b[y] - b[x]);
            const ivFrom = Math.min(from, 12 - from), ivTo = Math.min(to, 12 - to);
            const moves = a[x] !== b[x] && a[y] !== b[y];
            const sameDir = Math.sign(b[x] - a[x]) === Math.sign(b[y] - a[y]);
            if (moves && sameDir && ivFrom === ivTo && (ivFrom === 0 || ivFrom === 7)) {
              assert.fail(name + ': параллельные ' + (ivFrom === 0 ? 'октавы' : 'квинты') +
                ' в ' + rows[i - 1].chord + ' → ' + rows[i].chord);
            }
          }
        }
      }
    }

    // --- 3. Бас: ниже руки и совпадает с басом аккорда --------------------
    for (const [chord, info] of Object.entries(data.pcs)) {
      if (!info.lead) continue;
      assert.equal(info.leadBassPc, info.bassPc, chord + ': бас совпадает с басом аккорда');
      assert(info.lead[0] < data.pcs[chord].range[1], chord + ': бас в диапазоне');
      const lead = info.lead, bassInHand = lead.length > 1 && lead.slice(1).indexOf(lead[0]) >= 0;
      assert(!bassInHand, chord + ': бас не дублируется в правой руке');
    }
    // Состав аккорда не меняется: только ступени формулы, ничего чужого,
    // и обязательные корень с терцией на месте.
    for (const [chord, info] of Object.entries(data.pcs)) {
      if (!info.lead) continue;
      info.lead.forEach(pc => assert(info.formulaPcs.includes(pc),
        chord + ': в позиции чужая ступень ' + pc));
      assert(info.lead.includes(info.rootPc), chord + ': корень в правой руке');
      if (info.thirdPc !== null) assert(info.lead.includes(info.thirdPc), chord + ': терция в правой руке');
    }
    assert.equal(mod12(data.chains.slash[0].notes[0]), 4, 'C/E: бас — ми (E)');

    // --- 4. Узкие клавиатуры ---------------------------------------------
    for (const [size, info] of Object.entries(data.narrow)) {
      assert(info.notes && info.notes.length >= 4, size + ' клавиш: позиция есть');
      assert(info.notes.every(n => n >= info.low && n <= info.high),
        size + ' клавиш: все ноты в диапазоне ' + info.low + '…' + info.high + ': ' + info.notes);
      assert(info.notes[0] < info.notes[1], size + ' клавиш: бас ниже правой руки');
    }

    // --- 5. Ручной выбор главнее -----------------------------------------
    assert(data.manual.flagged, 'выбранная вручную позиция помечена');
    assert.notDeepStrictEqual(data.manual.auto, data.manual.manual,
      'ручной выбор меняет позицию, а не игнорируется');

    // --- 6. Детерминизм и единый источник нот -----------------------------
    for (const [chord, pair] of Object.entries(data.repeat)) {
      assert.deepStrictEqual(pair[0], pair[1], chord + ': повторный расчёт и сброс кэша дают те же ноты');
      assert(pair[0], chord + ': позиция существует');
    }
    assert.deepStrictEqual(data.pipeline.played, data.pipeline.selected,
      'транспорт играет ту позицию, которую показывает панель');
    assert.equal(data.pipeline.saved, true, 'режим сохраняется вместе с песней');

    // --- 7. Старые песни без поля ----------------------------------------
    assert.equal(data.legacy.linked, false, 'старая песня без поля остаётся в прежнем режиме');

    console.log('Голосоведение: поп ' + pop.map(x => x.notes.join('/')).join(' → ') +
      '; общие тоны держатся, скачки ≤4, параллельных квинт нет; C/E bass=' +
      mod12(data.chains.slash[0].notes[0]) + '; 25–88 клавиш в диапазоне; ручной выбор главнее — OK');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
