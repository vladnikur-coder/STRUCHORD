'use strict';
// 0.778: три вещи, которых не хватало даже живому тембру.
//  1. Аккорд берётся не строго одновременно: клавиши встают вразнобой до
//     9 мс (у органа контакты — до 2 мс, у pad подложка ровная).
//  2. Вторая атака по той же клавише слабее первой: палец не успевает
//     ударить с той же силой.
//  3. У пианино в момент отпускания клавиши слышно демпфер, а не просто
//     обрыв звука. Уровень — примерно −23 дБ от ноты. У Rhodes, органа и
//     pad демпфера нет.
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

    const data = await page.evaluate(async () => {
      // В странице свой помощник: снаружи он недоступен.
      const rms = (buf, from, to) => {
        let sum = 0;
        const a = Math.floor(from * 44100), b = Math.min(buf.length, Math.floor(to * 44100));
        for (let i = a; i < b; i++) sum += buf[i] * buf[i];
        return Math.sqrt(sum / Math.max(1, b - a));
      };
      // Буфер назначают уже после создания источника, поэтому длительность
      // читаем в момент запуска.
      function watch(off, starts) {
        const make = off.createBufferSource.bind(off);
        off.createBufferSource = function () {
          const src = make();
          const start = src.start.bind(src);
          src.start = function (when) {
            starts.push({ when, dur: src.buffer ? +src.buffer.duration.toFixed(3) : 0 });
            return start(when);
          };
          return src;
        };
      }

      const modes = ['acoustic', 'rhodes', 'organ', 'pad'];
      const notes = {}, chords = {};

      // --- Демпфер: один и тот же удар с ним и без него --------------------
      {
        const off = new OfflineAudioContext(1, 44100 * 3, 44100);
        await window.StruChordSampleBank.load('acoustic', off);
        const starts = [];
        watch(off, starts);
        const out = off.createGain();
        out.connect(off.destination);
        window.StruChordAudio.setDamper(true);
        window.StruChordAudio.renderSample(off, out, 'acoustic', 60, 0.1, 0.3, 0.5, 0.8);
        window.StruChordAudio.setDamper(false);
        // Далеко от первого удара, иначе сработает «вторая атака тише».
        window.StruChordAudio.renderSample(off, out, 'acoustic', 60, 1.1, 0.3, 0.5, 0.8);
        window.StruChordAudio.setDamper(true);
        const buf = (await off.startRendering()).getChannelData(0);
        const withDamper = rms(buf, 0.402, 0.47), without = rms(buf, 1.402, 1.47);
        notes.acoustic = {
          dampers: starts.filter(x => x.dur > 0.05 && x.dur < 0.12).length,
          level: 20 * Math.log10(Math.sqrt(Math.max(0, withDamper * withDamper - without * without)) /
            rms(buf, 1.105, 1.30))
        };
      }
      // У остальных тембров демпфера быть не должно.
      for (const mode of ['rhodes', 'organ', 'pad']) {
        const off = new OfflineAudioContext(1, 44100, 44100);
        await window.StruChordSampleBank.load(mode, off);
        const starts = [];
        watch(off, starts);
        const out = off.createGain();
        out.connect(off.destination);
        window.StruChordAudio.renderSample(off, out, mode, 60, 0.1, 0.3, 0.5, 0.8);
        await off.startRendering();
        notes[mode] = { dampers: starts.filter(x => x.dur > 0.05 && x.dur < 0.12).length };
      }

      // --- Аккорд: разброс атак -------------------------------------------
      for (const mode of modes) {
        const off = new OfflineAudioContext(1, 44100 * 2, 44100);
        await window.StruChordSampleBank.load(mode, off);
        const starts = [];
        watch(off, starts);
        const out = off.createGain();
        out.connect(off.destination);
        for (const midi of [60, 64, 67, 72]) {
          window.StruChordAudio.renderSample(off, out, mode, midi, 0.2, 0.4, 0.5, 0.8);
        }
        await off.startRendering();
        // Первые четыре источника — ноты аккорда; демпфер идёт следом.
        chords[mode] = { starts: starts.filter(x => x.dur > 0.12).slice(0, 4).map(x => x.when) };
      }

      // --- Повтор одной ноты: вторая атака слабее -------------------------
      for (const mode of ['acoustic', 'rhodes']) {
        const off = new OfflineAudioContext(1, 44100 * 3, 44100);
        await window.StruChordSampleBank.load(mode, off);
        const out = off.createGain();
        out.connect(off.destination);
        // 0,35 с между ударами — это и есть «вторая атака подряд». Оба удара
        // далеко от аккорда выше, чтобы расстройка и softening не путались.
        window.StruChordAudio.renderSample(off, out, mode, 60, 1.0, 0.3, 0.6, 0.8);
        window.StruChordAudio.renderSample(off, out, mode, 60, 1.35, 0.3, 0.6, 0.8);
        const buf = (await off.startRendering()).getChannelData(0);
        chords[mode].first = rms(buf, 1.02, 1.20);
        chords[mode].second = rms(buf, 1.37, 1.55);
      }
      return { notes, chords };
    });

    // 1. Микротайминг аккорда.
    const spread = list => (list.length ? Math.max(...list) - Math.min(...list) : 0);
    for (const mode of ['acoustic', 'rhodes', 'organ']) {
      const s = data.chords[mode].starts;
      assert.equal(s.length, 4, mode + ': в аккорде четыре ноты, а не ' + s.length);
      const ms = spread(s) * 1000;
      assert(new Set(s).size >= 3, mode + ': ноты аккорда не совпадают бит в бит');
      assert(ms <= 9.5, mode + ': разброс аккорда в пределах 9 мс, а не ' + ms.toFixed(1));
      assert(ms >= 1, mode + ': аккорд не идеально ровный, разброс ' + ms.toFixed(1) + ' мс');
    }
    assert(spread(data.chords.pad.starts) === 0, 'pad остаётся ровной подложкой');

    // 2. Вторая атака слабее первой.
    for (const mode of ['acoustic', 'rhodes']) {
      const { first, second } = data.chords[mode];
      assert(first > 0 && second > 0, mode + ': обе атаки звучат');
      const ratio = second / first;
      assert(ratio < 0.97, mode + ': вторая атака тише первой, а не ' + ratio.toFixed(3));
      assert(ratio > 0.75, mode + ': вторая атака не проваливается, а не ' + ratio.toFixed(3));
    }

    // 3. Демпфер у пианино и его отсутствие у остальных.
    assert(data.notes.acoustic.dampers >= 1, 'у пианино есть шум демпфера');
    const db = data.notes.acoustic.level;
    assert(db > -30 && db < -15, 'демпфер слышен, но тише ноты на 15–30 дБ, а не ' + db.toFixed(1));
    for (const mode of ['rhodes', 'organ', 'pad']) {
      assert.equal(data.notes[mode].dampers, 0, mode + ': демпфера нет');
    }

    console.log('Живость: аккорд ' +
      ['acoustic', 'rhodes', 'organ'].map(m => m + ' ' + (spread(data.chords[m].starts) * 1000).toFixed(1) + ' мс').join(', ') +
      '; pad 0 мс; вторая атака ' +
      ['acoustic', 'rhodes'].map(m => m + ' ×' + (data.chords[m].second / data.chords[m].first).toFixed(2)).join(', ') +
      '; демпфер ' + db.toFixed(1) + ' дБ от ноты, у остальных тембров 0 — OK');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
