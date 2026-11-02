'use strict';
// 0.777: повтор одного удара не должен звучать как копия. У пианино и Rhodes
// каждый следующий удар той же ноты чуть расстроен (±6 центов), у органа и
// pad строй ровный: у органа его задаёт генератор, у pad это подложка.
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
    // Только по http: сэмплы приходят из sounds/manifest.json, а fetch с
    // file:// браузер запрещает.
    await page.goto(process.env.STRUCHORD_URL || 'http://127.0.0.1:8031/STRUCHORD.html', { waitUntil: 'load' });

    const report = await page.evaluate(async () => {
      const out = {};
      for (const mode of ['acoustic', 'rhodes', 'organ', 'pad']) {
        // Свой контекст на тембр: офлайн-рендер после реального контекста
        // Web Audio не принимает.
        const off = new OfflineAudioContext(1, 44100 * 8, 44100);
        await window.StruChordSampleBank.load(mode, off);
        const params = [];
        const make = off.createBufferSource.bind(off);
        off.createBufferSource = function () {
          const src = make();
          params.push(src.playbackRate);
          return src;
        };
        const target = off.createGain();
        target.connect(off.destination);
        // Шесть одинаковых ударов одной ноты: так играет аккомпанемент,
        // когда рисунок повторяет аккорд.
        for (let i = 0; i < 6; i++) {
          window.StruChordAudio.renderSample(off, target, mode, 60, 0.1 + i * 0.6, 0.5, 0.3, 0.8);
        }
        const rates = params.map(p => p.value);
        const base = Math.pow(2, (60 - 60) / 12);
        out[mode] = rates.map(r => +(1200 * Math.log2(r / base)).toFixed(1));
      }
      return out;
    });

    const spread = list => list.length ? Math.max(...list) - Math.min(...list) : 0;
    for (const mode of ['acoustic', 'rhodes']) {
      const cents = report[mode];
      assert(cents.length >= 6, mode + ': шесть ударов запланированы, а не ' + cents.length);
      assert(new Set(cents).size >= 4, mode + ': повторы не совпадают бит в бит — ' + JSON.stringify(cents));
      assert(spread(cents) <= 14, mode + ': расстройка в пределах 6 центов, а не ' + spread(cents).toFixed(1));
    }
    for (const mode of ['organ', 'pad']) {
      const cents = report[mode];
      assert(cents.length >= 6, mode + ': шесть ударов запланированы');
      assert(spread(cents) === 0, mode + ': строй ровный, а не ' + JSON.stringify(cents));
    }
    console.log('Повторы: пианино ' + report.acoustic.join('/') + ', Rhodes ' + report.rhodes.join('/') +
      ' центов; орган и pad ровно 0 — OK');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
