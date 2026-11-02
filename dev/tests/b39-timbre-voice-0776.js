'use strict';
// B-104 (0.776): тембр — это исполнение и живость, а не только громкость.
//
// Проверяем то, что слышно владельцу:
//  1) сила удара меняет ЯРКОСТЬ у пианино и Rhodes (фильтр по силе), а у
//     пианино ещё и берётся другая запись (слои силы Salamander v3/v8/v14);
//  2) орган на силу не реагирует громкостью, зато получает щелчок клавиши и
//     перкуссию — атака стала резкой, сустейн ровным;
//  3) pad не играет короткими нотами: реже удары, длинные ноты;
//  4) орган играет легато до следующей атаки, а фанк/панк остаются короткими;
//  5) джаз и блюз включают свинг по умолчанию, ручное выключение главнее.
const assert = require('assert'), puppeteer = require('puppeteer');
const wait = ms => new Promise(r => setTimeout(r, ms));
const URL = process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html';

async function open(browser) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  // Клавишная дорожка по умолчанию: тембр — свойство именно клавишной дорожки.
  await page.evaluateOnNewDocument(() => localStorage.setItem('struchord-default-instrument', 'keys'));
  await page.goto(URL, { waitUntil: 'load', timeout: 120000 });
  if (errors.length) throw Error('ошибки страницы: ' + errors[0]);
  return page;
}

// Офлайн-рендер одного голоса тембра: пик, «наклон» спектра (доля
// высокочастотной энергии) и уровни по окнам.
const renderVoice = (page, timbre, expr, dur) => page.evaluate(async ([timbre, expr, dur]) => {
  const A = window.StruChordAudio, sr = 44100, secs = Math.max(0.9, dur + 0.35);
  const off = new OfflineAudioContext(1, Math.ceil(sr * secs), sr);
  await window.StruChordSampleBank.load(timbre, off);
  const target = off.createGain();
  target.gain.value = 1;
  target.connect(off.destination);
  A.renderSample(off, target, timbre, 55, 0, dur, 0.16, expr);
  const data = (await off.startRendering()).getChannelData(0);
  const win = (t0, ms) => {
    const a = Math.floor(t0 * sr), z = Math.min(data.length, a + Math.floor(ms / 1000 * sr));
    let sum = 0, peak = 0;
    for (let i = a + 1; i < z; i++) {
      sum += data[i] * data[i];
      peak = Math.max(peak, Math.abs(data[i]));
    }
    return { rms: Math.sqrt(sum / Math.max(1, z - a)), peak };
  };
  // Яркость — это не громкость: меряем уровень обертона у 1,5 кГц относительно
  // основного тона (окно Ханна, 200 мс). Полосовой фильтр для этого не годится:
  // его хвосты тянут вниз энергию басовых гармоник.
  const tone = (freq) => {
    const a = Math.floor(0.06 * sr), n = Math.floor(0.2 * sr);
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) {
      const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1));
      re += data[a + i] * w * Math.cos(2 * Math.PI * freq * i / sr);
      im += data[a + i] * w * Math.sin(2 * Math.PI * freq * i / sr);
    }
    return Math.sqrt(re * re + im * im) / n;
  };
  const f0 = 196;                       // G3
  const brightness = 20 * Math.log10(Math.max(tone(f0 * 8), 1e-12) / Math.max(tone(f0), 1e-12));
  const body = win(0.06, 60).rms;
  return {
    attack: win(0.002, 8),
    body: { rms: body },
    sustain: win(Math.max(0.3, dur - 0.3), 40),
    brightness,
    layer: window.StruChordSampleBank.nearest(timbre, 55, 1 + expr * 15)
  };
}, [timbre, expr, dur]);

// Рисунок аккомпанемента для заданного тембра и жанра.
const planFor = (page, timbre, genre, presetId, opts) => page.evaluate(async ([timbre, genre, presetId, opts]) => {
  const T = window.StruChordTracks, A = window.StruChordAccomp;
  startNewSongFromHome();
  addSection('Verse');
  const s = sections[0], q = s.squares[0];
  ['C', 'Am', 'F', 'G'].forEach((c, i) => { q.events[i].chord = c; });
  const track = T.track(1);
  T.setTimbre(track.id, timbre);
  T.setAutoAccomp({ primary: genre, secondary: null, trackId: track.id, managed: {} });
  // Пресет жанра без собственного флага свинга: так проверяется именно
  // умолчание жанра, а не записанная в пресете настройка.
  const pattern = A.list().find(p => p.id === (presetId || 'style-' + genre + '-0'));
  if (!pattern) throw Error('нет пресета жанра ' + genre);
  const steps = A.plan({
    trackId: track.id, cell: 'preview', dur: 4, span: 4,
    chord: 'C', key: 'C', notes: [48, 52, 55], ts: '4/4',
    pattern: { type: pattern.id, subdivision: 2, swing: opts && opts.swing, steps: null },
    patternSource: 'cell', noHighlight: true
  });
  return steps.map(s => ({ at: +s.at.toFixed(3), dur: +s.dur.toFixed(3), swing: !!s.swing, notes: s.notes.length }));
}, [timbre, genre, presetId, opts]);

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/tmp/chromium',
    args: ['--no-sandbox']
  });
  const notes = [];
  try {
    const page = await open(browser);

    // 1. Пианино: слои силы и яркость.
    const pianoSoft = await renderVoice(page, 'acoustic', 0.3, 0.8);
    const pianoLoud = await renderVoice(page, 'acoustic', 0.95, 0.8);
    assert.notDeepStrictEqual(pianoSoft.layer.velocity, pianoLoud.layer.velocity,
      'пианино должно брать разные записи на разную силу');
    assert.ok(pianoLoud.body.rms > pianoSoft.body.rms * 1.15,
      'громкий удар громче тихого: ' + pianoLoud.body.rms.toFixed(4) + ' vs ' + pianoSoft.body.rms.toFixed(4));
    assert.ok(pianoLoud.brightness - pianoSoft.brightness > 4,
      'громкий удар ярче тихого: ' + pianoSoft.brightness.toFixed(1) + ' -> ' + pianoLoud.brightness.toFixed(1) + ' дБ');
    notes.push('piano layers ' + pianoSoft.layer.velocity + '->' + pianoLoud.layer.velocity +
      ', яркость ' + pianoSoft.brightness.toFixed(1) + '->' + pianoLoud.brightness.toFixed(1) + ' дБ');

    // 2. Rhodes: яркость от силы при одной записи.
    const rhodesSoft = await renderVoice(page, 'rhodes', 0.3, 0.8);
    const rhodesLoud = await renderVoice(page, 'rhodes', 0.95, 0.8);
    assert.ok(rhodesLoud.brightness - rhodesSoft.brightness > 4,
      'у Rhodes тихий удар глуше: ' + rhodesSoft.brightness.toFixed(1) + ' -> ' + rhodesLoud.brightness.toFixed(1) + ' дБ');
    notes.push('rhodes яркость ' + rhodesSoft.brightness.toFixed(1) + '->' + rhodesLoud.brightness.toFixed(1) + ' дБ');

    // 3. Орган: щелчок и перкуссия в атаке, ровный сустейн.
    const organSoft = await renderVoice(page, 'organ', 0.35, 0.8);
    const organLoud = await renderVoice(page, 'organ', 0.95, 0.8);
    const attackRatio = organLoud.attack.peak / Math.max(1e-6, organLoud.body.rms);
    assert.ok(attackRatio > 1.2, 'у органа должна быть резкая атака: ' + attackRatio.toFixed(2));
    const sustainSpread = Math.abs(20 * Math.log10(organLoud.sustain.rms / Math.max(1e-9, organSoft.sustain.rms)));
    assert.ok(sustainSpread < 7, 'орган не должен менять громкость сустейна от силы: ' + sustainSpread.toFixed(1) + ' дБ');
    notes.push('organ attack/body ' + attackRatio.toFixed(2) + ', sustain spread ' + sustainSpread.toFixed(1) + ' дБ');

    // 4. Pad: реже и длиннее; орган: легато; фанк остаётся коротким.
    const padPlan = await planFor(page, 'pad', 'pop');
    const rhodesPlan = await planFor(page, 'rhodes', 'pop');
    assert.ok(padPlan.length < rhodesPlan.length,
      'pad играет реже: ' + padPlan.length + ' ударов против ' + rhodesPlan.length);
    const padShortest = Math.min(...padPlan.map(s => s.dur));
    assert.ok(padShortest > 0.35, 'pad не играет короткими нотами: минимум ' + padShortest);
    notes.push('pad ' + padPlan.length + ' удара (rhodes ' + rhodesPlan.length + '), минимум ' + padShortest + ' с');

    const organPlan = await planFor(page, 'organ', 'pop');
    const gaps = organPlan.slice(0, -1).map((s, i) => +(organPlan[i + 1].at - (s.at + s.dur)).toFixed(3));
    assert.ok(Math.max(...gaps) < 0.05, 'орган тянет ноту до следующей атаки, провалы: ' + JSON.stringify(gaps));
    notes.push('organ legato gaps ' + JSON.stringify(gaps));

    const funkRhodes = await planFor(page, 'rhodes', 'funk', 'perform-funk-1');
    const funkAvg = funkRhodes.reduce((s, x) => s + x.dur, 0) / funkRhodes.length;
    const popAvg = rhodesPlan.reduce((s, x) => s + x.dur, 0) / rhodesPlan.length;
    assert.ok(funkAvg < popAvg * 0.9, 'фанк остаётся отрывистее попа: ' + funkAvg.toFixed(2) + ' против ' + popAvg.toFixed(2));
    notes.push('funk ' + funkAvg.toFixed(2) + ' с против попа ' + popAvg.toFixed(2));

    // 5. Свинг: джаз и блюз по умолчанию, ручное «выключено» главнее.
    const jazz = await planFor(page, 'rhodes', 'jazz');
    const blues = await planFor(page, 'rhodes', 'blues');
    const pop = await planFor(page, 'rhodes', 'pop');
    assert.ok(jazz.some(s => s.swing), 'джаз должен качать по умолчанию');
    assert.ok(blues.some(s => s.swing), 'блюз должен качать по умолчанию');
    assert.ok(pop.every(s => !s.swing), 'поп не должен качать сам по себе');
    const jazzOff = await planFor(page, 'rhodes', 'jazz', null, { swing: false });
    assert.ok(jazzOff.every(s => !s.swing), 'ручное выключение свинга главнее умолчания жанра');
    notes.push('swing: jazz+blues on, pop off, jazz off вручную — ok');

    await page.close();
    console.log('Timbre voice: ' + notes.join('; ') + ' — OK');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
