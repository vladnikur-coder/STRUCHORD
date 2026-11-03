'use strict';
// 0.779: pad перестал играть чужой рисунок. Раньше он его разрежал — и от
// аккорда оставалась одна басовая нота, а второй удар в фанке был пустым.
// Теперь pad собирает свой рисунок: аккорд целиком, от смены гармонии до
// следующей. В плотных жанрах (фанк, панк, блюз, джаз) добавляется вторая
// атака в середине такта, иначе пульсация пропадает.
const assert = require('assert'), puppeteer = require('puppeteer');

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
      const T = window.StruChordTracks, A = window.StruChordAccomp;
      const genres = A.styles().map(s => s.id);
      const chord = [48, 52, 55, 60];
      const plan = (timbre, type, extra) => {
        T.setTimbre(1, timbre);
        const o = Object.assign({
          trackId: 1, chord: 'C', key: 'C', range: T.keyRange(1), notes: chord.slice(),
          ts: '4/4', span: 4, dur: 2, ev: { span: 4 }, sq: { events: [] }, ei: 0,
          pattern: { type: type, subdivision: 2, swing: null }, patternSource: 'section',
          noHighlight: true
        }, extra || {});
        return A.plan(o).map(s => ({ at: +(s.at || 0).toFixed(3), dur: +(s.dur || 0).toFixed(3), notes: (s.notes || []).slice() }));
      };
      // Первый рисунок каждого из девяти жанров.
      const presetFor = {};
      for (const g of genres) {
        const found = A.list().filter(p => new RegExp('^perform-' + g + '-').test(p.id))[0] ||
          A.list().filter(p => new RegExp('^style-' + g + '-').test(p.id))[0];
        if (found) presetFor[g] = found.id;
      }
      const out = { genres: {}, twoBars: {}, manual: {}, mute: {}, sizes: {} };
      for (const [genre, id] of Object.entries(presetFor)) {
        out.genres[genre] = { type: id, pad: plan('pad', id), acoustic: plan('acoustic', id) };
      }
      out.twoBars.pad = plan('pad', presetFor.pop, { span: 8, dur: 4, ev: { span: 8 } });
      out.twoBars.acoustic = plan('acoustic', presetFor.pop, { span: 8, dur: 4, ev: { span: 8 } });
      // Ручной рисунок не трогаем: pad его не переписывает.
      const manualPattern = { type: presetFor.pop, subdivision: 2, swing: null, status: 'manual', steps: ['B', 'C', 'B', 'C', 'B', 'C', 'B', 'C'] };
      const manual = plan('pad', presetFor.pop, { pattern: manualPattern });
      // Соседние тембры pad-фигуру не получают.
      out.others = {
        acoustic: out.genres.pop.acoustic,
        organ: plan('organ', presetFor.pop),
        rhodes: plan('rhodes', presetFor.pop),
        pad: out.genres.pop.pad
      };
      // 3/4: атака на начало такта, длина — три доли.
      out.sizes.threeFour = plan('pad', presetFor.pop, { ts: '3/4', span: 3, dur: 1.5, ev: { span: 3 } });
      return { presetFor, manualPattern, data: out };
    });

    const byGenre = data.data.genres;
    const all = Object.keys(byGenre);
    assert(all.length >= 9, 'проверяем все девять жанров, а не ' + all.length);
    const DENSE = ['funk', 'punk', 'blues', 'jazz'];

    for (const genre of all) {
      const { pad, acoustic } = byGenre[genre];
      assert(pad.length >= 1, genre + ': pad что-то играет');
      for (const step of pad) {
        assert(step.notes.length === 4, genre + ': pad держит весь аккорд, а не ' + step.notes.length + ' нот');
        assert(step.notes.join(',') === '48,52,55,60', genre + ': те же высоты, что в аккорде');
        assert(step.dur >= 0.85, genre + ': pad тянет ноту, а не тыкает (' + step.dur + ' с)');
      }
      // Плотные жанры пульсируют половинками, остальные держат такт.
      const want = DENSE.indexOf(genre) >= 0 ? 2 : 1;
      assert.equal(pad.length, want, genre + ': атак у pad ' + pad.length + ', ожидалось ' + want);
      if (want === 2) assert(Math.abs(pad[1].at - 1) < 1e-6, genre + ': вторая атака в середине такта');
      // Пианино при этом играет свой рисунок, а не pad-фигуру.
      assert(acoustic.length > pad.length, genre + ': у пианино рисунок плотнее, чем у pad');
      assert(acoustic.some(x => x.notes.length < 4), genre + ': пианино играет разложенный рисунок, а не блок');
    }

    // Два такта: две атаки по границам тактов.
    const two = data.data.twoBars.pad;
    assert.equal(two.length, 2, 'два такта — две атаки, а не ' + two.length);
    assert(Math.abs(two[1].at - 2) < 1e-6, 'вторая атака на втором такте: ' + two[1].at);
    assert(two.every(x => x.notes.length === 4), 'оба такта держат аккорд целиком');

    // 3/4: такт из трёх долей.
    const three = data.data.sizes.threeFour;
    assert.equal(three.length, 1, 'в 3/4 один такт — одна атака');
    assert(Math.abs(three[0].dur - 1.4) < 0.11, 'нота держится почти весь такт: ' + three[0].dur);

    // Ручной рисунок не переписывается.
    const padOnManual = await page.evaluate(([p, t]) => {
      window.StruChordTracks.setTimbre(1, 'pad');
      const A = window.StruChordAccomp;
      return A.plan({ trackId: 1, chord: 'C', key: 'C', range: window.StruChordTracks.keyRange(1),
        notes: [48, 52, 55, 60], ts: '4/4', span: 4, dur: 2, ev: { span: 4 }, sq: { events: [] }, ei: 0,
        pattern: p, patternSource: 'section', noHighlight: true }).length;
    }, [data.manualPattern]);
    const manualCount = await page.evaluate(([p]) => {
      window.StruChordTracks.setTimbre(1, 'acoustic');
      const A = window.StruChordAccomp;
      return A.plan({ trackId: 1, chord: 'C', key: 'C', range: window.StruChordTracks.keyRange(1),
        notes: [48, 52, 55, 60], ts: '4/4', span: 4, dur: 2, ev: { span: 4 }, sq: { events: [] }, ei: 0,
        pattern: p, patternSource: 'section', noHighlight: true }).length;
    }, [data.manualPattern]);
    assert.equal(padOnManual, manualCount, 'ручной рисунок не переписывается тембром');

    // Другие тембры pad-фигуру не получают.
    const others = data.data.others;
    assert(others.organ.length > 1 && others.rhodes.length > 1, 'орган и Rhodes играют рисунок жанра');
    assert(others.pad.length === 1, 'pad играет свою фигуру');

    console.log('Pad: ' + all.map(g => g + ' ' + byGenre[g].pad.length + '×' +
      (byGenre[g].pad[0] ? byGenre[g].pad[0].dur : 0) + 'с').join(', ') +
      '; два такта — 2 атаки; ручной рисунок цел — OK');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
