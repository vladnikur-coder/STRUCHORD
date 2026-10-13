#!/usr/bin/env node
/*
 * b12-mixer.js — B-12.5.1 «Микшер»: полоса каналов.
 *
 * Проверяем:
 *  1. Полосу каналов в окне «Партии»: «Песня» + дорожки + мастер, у каждой
 *     свои M/S, громкость и панорама, у мастера — ещё ручка focus;
 *  2. Правила микшера (чистый расчёт): mute глушит канал, solo глушит все
 *     остальные (включая «Песню», как в Guitar Pro), громкость масштабирует,
 *     мастер глушит всё, focus поднимает АКТИВНУЮ дорожку;
 *  3. Протяжку ползунка: во время input модель НЕ меняется (правило 60 fps),
 *     меняется звук; по change — одна команда Store и значение в модели;
 *  4. Карточки каналов не пересобираются при перерисовке окна: протяжка не
 *     теряет элемент, по которому тянут;
 *  5. Звук идёт в канал дорожки (голос получает channel: part:N), а
 *     предпросмотр ноты — в канал той же дорожки;
 *  6. Файл: значения микшера уезжают в песню (партии, «Песня», мастер) и
 *     читаются назад; мусор отбрасывается поштучно, числа зажимаются;
 *  7. Отмену: смена громкости откатывается одним Ctrl+Z.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'STRUCHORD.html'), 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://localhost/',
  beforeParse(win) {
    win.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    win.cancelAnimationFrame = (id) => clearTimeout(id);
    win.HTMLCanvasElement.prototype.getContext = () => ({
      font: '', measureText: () => ({ width: 10 }),
      clearRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {}, moveTo() {},
      lineTo() {}, closePath() {}, save() {}, restore() {}, translate() {}, rotate() {},
      fillText() {}, strokeText() {}, setTransform() {}, scale() {},
      createLinearGradient: () => ({ addColorStop() {} }),
    });
  },
});
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function () {
  return {
    currentTime: 0, state: 'running', resume() {}, sampleRate: 44100,
    createBuffer: (c, len) => ({ getChannelData: () => new Float32Array(len) }),
  };
};

let pass = 0;
let fail = 0;
function check(name, cond, details) {
  if (cond) {
    pass++;
    console.log('ok   ' + name);
  } else {
    fail++;
    console.error('FAIL ' + name + (details ? ' — ' + details : ''));
  }
}
function eqJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

const square = (id, chord) => ({
  id, repeat: 1, customBeats: 4,
  events: [{ chord, span: 4, timeSig: null, strumPattern: null }],
});
const song = (parts, extra) => ({
  schemaVersion: 5, metadata: { artist: 'A', title: 'B' }, bpm: 120, globalKey: 'C',
  keyMode: 'manual', globalTimeSig: '4/4', tuning: 'e-std', tuningNotes: null, notes: '',
  sections: [{
    id: 1, type: 'Verse', customName: null, key: null, shift: null, timeSig: null,
    bpm: null, repeat: 1, strumPattern: null, squares: [square(11, 'C')],
  }],
  parts, nextId: 90, rhythmPool: null, userFingerings: [], preferredFingerings: [], date: '',
  ...(extra || {}),
});
const notes = [
  { start: 0, dur: 1, string: 5, fret: 7 },
  { start: 1, dur: 1, string: 5, fret: 5 },
  { start: 2, dur: 1, string: 4, fret: 3 },
];
const guitar = { id: 1, name: 'Соло', instrument: 'guitar', tuning: null, visible: true, rolls: { '1': notes } };
const bass = { id: 2, name: 'Бас', instrument: 'bass', tuning: null, visible: true, rolls: { '1': [] } };

w.addEventListener('load', async () => {
  try {
    const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
    const settle = () => new Promise((resolve) => setTimeout(resolve, 460));
    const load = (parts, extra) => {
      w.localStorage.setItem('struchord_songs', JSON.stringify([song(parts, extra)]));
      w.loadSong(0);
      w.eval('render()');
      w.confirm = () => true;
    };
    const channels = () => Array.from(w.document.querySelectorAll('#mixChannels .pt-mix-ch')).map((c) => c.dataset.ch);
    const card = (id) => w.document.querySelector(`#mixChannels [data-ch="${id}"]`);
    const act = (id, action) => card(id).querySelector(`[data-act="${action}"]`);
    const plan = () =>
      JSON.parse(w.eval(
        'JSON.stringify(Array.from(mixerPlan(songParts, songMixerState, mixerFocus, partsActiveId).entries()))'
      ));
    const planFor = (id) => {
      const found = plan().filter((entry) => entry[0] === id)[0];
      return found ? found[1] : null;
    };
    const mixOf = (index) => JSON.parse(w.eval(`JSON.stringify(songParts[${index}].mix || null)`));
    const mixChannelValueOf = (id) =>
      JSON.parse(w.eval(`JSON.stringify(mixChannelValue(${JSON.stringify(id)}, 'eq'))`));
    const mixEqOf = (raw) => JSON.parse(w.eval(`JSON.stringify(mixEqArray(${JSON.stringify(raw)}))`));
    // Санитайз/карточки могут завести пустой объект микшера — «правок нет»
    // проверяем по отсутствию ключей, а не по строгому null.
    const mixEmpty = (index) => JSON.stringify(mixOf(index) || {}) === '{}';
    // Санитайз при загрузке переназначает id дорожек — каналы адресуем по
    // модели (songParts[i].id), а не по числам из файла-заготовки.
    const chId = (index) => `part:${w.eval(`songParts[${index}].id`)}`;
    const roll = (i) => JSON.parse(w.eval(`JSON.stringify(songParts[${i}].rolls[String(sections[0].id)] || [])`));

    // ---------- 1. Полоса каналов ----------
    load([guitar, bass]);
    w.eval('togglePartsMode(true)');
    check('в полосе микшера три канала: песня, две дорожки и мастер',
      eqJson(channels(), ['song', chId(0), chId(1), 'master']), JSON.stringify(channels()));
    check('подписи каналов — имена дорожек и «Песня»/«Мастер»',
      card('song').querySelector('.pt-mix-name').textContent === 'Песня' &&
      card(chId(1)).querySelector('.pt-mix-name').textContent === 'Бас' &&
      card('master').querySelector('.pt-mix-name').textContent === 'Мастер',
      JSON.stringify(channels().map((id) => card(id).querySelector('.pt-mix-name').textContent)));
    check('у дорожки есть M, S, громкость и панорама',
      !!act(chId(0), 'mute') && !!act(chId(0), 'solo') &&
      !!act(chId(0), 'volume') && !!act(chId(0), 'pan'), card(chId(0)).innerHTML);
    check('у мастера нет solo, но есть focus, громкость и панорама',
      !!act('master', 'mute') && !act('master', 'solo') && !!act('master', 'focus') &&
      !!act('master', 'volume') && !!act('master', 'pan'), card('master').innerHTML);
    check('по умолчанию все каналы открыты, по центру и с ровным эквалайзером',
      eqJson(planFor('song'), { gain: 1, pan: 0, eq: [0, 0, 0] }) &&
      eqJson(planFor(chId(0)), { gain: 1, pan: 0, eq: [0, 0, 0] }) &&
      eqJson(planFor('master'), { gain: 1, pan: 0, eq: [0, 0, 0] }), JSON.stringify(plan()));
    check('активная дорожка подсвечена в полосе', card(chId(0)).classList.contains('is-active'));

    // ---------- 2. Правила: mute, solo, громкость, мастер, focus ----------
    const clickAct = (id, action) =>
      act(id, action).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    clickAct(chId(0), 'mute');
    check('M глушит канал дорожки', eqJson(mixOf(0), { mute: true }) && planFor(chId(0)).gain === 0,
      JSON.stringify([mixOf(0), planFor(chId(0))]));
    clickAct(chId(0), 'mute');
    check('повторный M снимает mute', !mixOf(0) || mixOf(0).mute !== true, JSON.stringify(mixOf(0)));
    clickAct('song', 'mute');
    check('M на канале «Песня» глушит аккомпанемент', planFor('song').gain === 0,
      JSON.stringify(w.eval('JSON.stringify(songMixerState)')));
    clickAct('song', 'mute');
    clickAct(chId(1), 'solo');
    check('solo глушит все остальные каналы, включая «Песню» (как в GP)',
      planFor(chId(1)).gain === 1 && planFor(chId(0)).gain === 0 && planFor('song').gain === 0 &&
      planFor('master').gain === 1, JSON.stringify(plan()));
    clickAct(chId(1), 'solo');
    check('снятие solo возвращает каналы', planFor(chId(0)).gain === 1 && planFor('song').gain === 1);

    // Громкость — протяжкой: сначала input (без модели), потом change.
    const volSlider = act(chId(0), 'volume');
    volSlider.value = '50';
    volSlider.dispatchEvent(new w.Event('input', { bubbles: true }));
    check('во время протяжки модель НЕ меняется (правило 60 fps)',
      !(mixOf(0) && mixOf(0).volume !== undefined), JSON.stringify(mixOf(0)));
    check('но звук уже приглушён: ползунок отражён в расчёте',
      Math.abs(planFor(chId(0)).gain - 0.5) < 1e-9, JSON.stringify(planFor(chId(0))));
    volSlider.dispatchEvent(new w.Event('change', { bubbles: true }));
    check('по отпускании значение уезжает в модель',
      mixOf(0) && mixOf(0).volume === 50, JSON.stringify(mixOf(0)));
    check('протяжка не оставила временного значения',
      w.eval('mixerPending.size') === 0, String(w.eval('mixerPending.size')));

    const panSlider = act(chId(0), 'pan');
    panSlider.value = '-60';
    panSlider.dispatchEvent(new w.Event('input', { bubbles: true }));
    panSlider.dispatchEvent(new w.Event('change', { bubbles: true }));
    check('панорама дорожки уезжает в расчёт и в модель',
      Math.abs(planFor(chId(0)).pan + 0.6) < 1e-9 && mixOf(0).pan === -60,
      JSON.stringify([planFor(chId(0)), mixOf(0)]));

    const masterVol = act('master', 'volume');
    masterVol.value = '50';
    masterVol.dispatchEvent(new w.Event('input', { bubbles: true }));
    masterVol.dispatchEvent(new w.Event('change', { bubbles: true }));
    check('громкость мастера масштабирует всю песню',
      Math.abs(planFor('master').gain - 0.5) < 1e-9,
      JSON.stringify(w.eval('JSON.stringify(songMixerState)')));
    clickAct('master', 'mute');
    check('M мастера глушит всё', planFor('master').gain === 0);
    clickAct('master', 'mute');

    // Focus — ручка мастера: поднимает только активную дорожку.
    const focusSlider = act('master', 'focus');
    focusSlider.value = String(w.eval('MIX_FOCUS_MAX'));
    focusSlider.dispatchEvent(new w.Event('input', { bubbles: true }));
    // У первой дорожки громкость 50% (проверялась выше), поэтому надбавка
    // focus считается от неё: 0,5 × 1,36 = 0,68.
    check('focus поднимает АКТИВНУЮ дорожку и не трогает остальные',
      Math.abs(planFor(chId(0)).gain - 0.68) < 1e-9 && planFor(chId(1)).gain === 1 &&
      planFor('song').gain === 1, JSON.stringify(plan()));
    check('focus — не данные песни: в модели его нет',
      w.eval('songParts[0].mix && songParts[0].mix.focus') === undefined &&
      w.eval('songMixerState.focus') === undefined);
    w.eval('selectPartTrack(songParts[1].id)');
    check('при смене дорожки надбавка focus переезжает на неё',
      Math.abs(planFor(chId(1)).gain - 1.36) < 1e-9 && Math.abs(planFor(chId(0)).gain - 0.5) < 1e-9,
      JSON.stringify(plan()));
    focusSlider.value = '100';
    focusSlider.dispatchEvent(new w.Event('input', { bubbles: true }));
    check('focus возвращается в нейтраль', planFor(chId(1)).gain === 1, JSON.stringify(planFor(chId(1))));

    // ---------- 3. Карточки не пересобираются ----------
    const songCard = card('song');
    w.eval('renderPartsScreen()');
    check('перерисовка окна не пересобирает карточку канала',
      card('song') === songCard, 'карточка заменена');
    check('мастер остаётся последним каналом полосы',
      channels()[channels().length - 1] === 'master', JSON.stringify(channels()));

    // ---------- 4. Звук идёт в канал дорожки ----------
    w.eval(`
      window.__plucks = [];
      pluckString = function(ctx, opts) { window.__plucks.push(opts); };
    `);
    w.eval('schedulePartsForEvent({}, sections[0], sections[0].squares[0], 0, 0, 4)');
    const plucks = JSON.parse(w.eval('JSON.stringify(window.__plucks)'));
    check('голоса дорожки играют в её канал (part:N)',
      plucks.length > 0 && plucks.every((p) => /^part:\d+$/.test(p.channel)),
      JSON.stringify(plucks.map((p) => p.channel)));
    check('свой канал только свой: у нот одной дорожки один и тот же канал',
      new Set(plucks.map((p) => p.channel)).size === 1, JSON.stringify(plucks.map((p) => p.channel)));
    w.eval(`
      window.__plucks = [];
      // Предпросмотр играет через живой контекст; в jsdom его нет, поэтому
      // подменяем только источник контекста — сам голос идёт в pluckString.
      getAudioContext = function() { return { currentTime: 0 }; };
      resumeAudioContext = function() {};
      // Активна бас-дорожка (её выбрали выше), поэтому струна — из её строя:
      // у баса четыре струны, шестой индекс вернул бы функцию ни с чем.
      previewPartNote(sections[0], 2, 7, 1);
    `);
    const preview = JSON.parse(w.eval('JSON.stringify(window.__plucks)'));
    check('предпросмотр ноты слышен через канал своей дорожки',
      preview.length === 1 && preview[0].channel === `part:${w.eval('partsActiveId')}`,
      JSON.stringify(preview.mode || preview));

    // ---------- 5. Файл и мусор ----------
    load([guitar, bass]);
    w.eval('togglePartsMode(true)');
    clickAct(chId(0), 'solo');
    const volume50 = act(chId(1), 'volume');
    volume50.value = '40';
    volume50.dispatchEvent(new w.Event('input', { bubbles: true }));
    volume50.dispatchEvent(new w.Event('change', { bubbles: true }));
    clickAct('master', 'mute');
    w.saveCurrentSong();
    const lib = JSON.parse(w.localStorage.getItem('struchord_songs'));
    const saved = lib[lib.length - 1];
    check('значения микшера уехали в файл: solo дорожки, громкость второй и mute мастера',
      saved.parts[0].mix && saved.parts[0].mix.solo === true &&
      saved.parts[1].mix && saved.parts[1].mix.volume === 40 &&
      saved.mix && saved.mix.master && saved.mix.master.mute === true,
      JSON.stringify({ parts: saved.parts.map((p) => p.mix), mix: saved.mix }));
    w.loadSong(lib.length - 1);
    w.eval('render()');
    check('микшер пережил перезагрузку песни',
      w.eval('JSON.stringify(songParts[0].mix)') === '{"solo":true}' &&
      w.eval('JSON.stringify(songParts[1].mix)') === '{"volume":40}' &&
      w.eval('JSON.stringify(songMixerState.master)') === '{"mute":true}',
      w.eval('JSON.stringify([songParts[0].mix, songParts[1].mix, songMixerState.master])'));
    check('после загрузки полоса показывает значения песни',
      w.eval('JSON.stringify(songMixerState.master.mute)') === 'true' && planFor('master').gain === 0);
    // Песня без микшера вообще не пишет поле — файл обычной песни не растёт.
    load([guitar]);
    w.saveCurrentSong();
    const plain = JSON.parse(w.localStorage.getItem('struchord_songs'));
    const plainSaved = plain[plain.length - 1];
    check('микшер по умолчанию в файл не пишется',
      !plainSaved.mix && !plainSaved.parts[0].mix,
      JSON.stringify({ mix: plainSaved.mix, part: plainSaved.parts[0].mix }));

    const mixGarbage = (idx, raw) => JSON.parse(w.eval(`JSON.stringify(songMixSanitize(${JSON.stringify(raw)}))`));
    check('мусор в микшере песни: числа зажаты, флаги строго true',
      eqJson(mixGarbage(0, { volume: 999, pan: -400, mute: 'yes', solo: true }),
        { volume: 150, pan: -100 }) &&
      eqJson(mixGarbage(0, { volume: 'много', mute: true }), { mute: true }) &&
      mixGarbage(0, 'громко') === null,
      JSON.stringify(mixGarbage(0, { volume: 999, pan: -400, mute: 'yes', solo: true })));
    check('мастер читается отдельной полосой и solo ему не приписывают',
      eqJson(mixGarbage(0, { master: { volume: 80, solo: true } }).master, { volume: 80 }),
      JSON.stringify(mixGarbage(0, { master: { volume: 80, solo: true } })));
    check('микшер дорожки: solo разрешён, мусор отброшен',
      eqJson(JSON.parse(w.eval('JSON.stringify(partSanitizeMix({ volume: -5, solo: true, mute: 1 }))')),
        { volume: 0, solo: true }) &&
      w.eval('JSON.stringify(partSanitizeMix("громко"))') === 'null');
    load([{ ...guitar, mix: { volume: 200, pan: 30, mute: true } }]);
    check('битые значения из файла зажаты, а не отброшены целиком',
      JSON.parse(w.eval('JSON.stringify(songParts[0].mix)')).volume === 150 &&
      JSON.parse(w.eval('JSON.stringify(songParts[0].mix)')).pan === 30 &&
      JSON.parse(w.eval('JSON.stringify(songParts[0].mix)')).mute === true,
      w.eval('JSON.stringify(songParts[0].mix)'));

    // ---------- 6. Отмена ----------
    load([guitar]);
    w.eval('togglePartsMode(true)');
    await settle();
    const undoVol = act(chId(0), 'volume');
    undoVol.value = '20';
    undoVol.dispatchEvent(new w.Event('input', { bubbles: true }));
    undoVol.dispatchEvent(new w.Event('change', { bubbles: true }));
    check('громкость поставлена на 20 перед проверкой отмены',
      mixOf(0) && mixOf(0).volume === 20, JSON.stringify(mixOf(0)));
    await tick();
    await settle();
    w.eval('undoEdit()');
    await tick();
    check('Ctrl+Z возвращает прежнюю громкость одним шагом',
      !mixOf(0) || mixOf(0).volume !== 20, JSON.stringify(mixOf(0)));
    check('звук после отмены снова полный', Math.abs(planFor(chId(0)).gain - 1) < 1e-9,
      JSON.stringify(planFor(chId(0))));

    // ================= 7. Эквалайзер: полоса каналов =================
    load([guitar, bass]);
    w.eval('togglePartsMode(true)');
    check('у канала и мастера есть кнопка EQ, а блок полос по умолчанию свёрнут',
      !!act(chId(0), 'eq') && !!act('master', 'eq') &&
      card(chId(0)).querySelector('.pt-mix-eq').hidden === true &&
      card('master').querySelector('.pt-mix-eq').hidden === true);
    check('в блоке три полосы: низ, середина, верх',
      !!act(chId(0), 'eq0') && !!act(chId(0), 'eq1') && !!act(chId(0), 'eq2'),
      card(chId(0)).querySelector('.pt-mix-eq').innerHTML);
    check('по умолчанию полосы по нулям', eqJson(mixChannelValueOf(chId(0)), [0, 0, 0]),
      JSON.stringify(mixChannelValueOf(chId(0))));
    clickAct(chId(0), 'eq');
    check('кнопка EQ разворачивает блок полос',
      card(chId(0)).querySelector('.pt-mix-eq').hidden === false);
    check('разворот блока — не правка песни: модель и монитор чисты',
      mixEmpty(0) && w.eval('mixerPending.size') === 0 && w.eval('mixerEqOpen.has(songParts[0] && ("part:" + songParts[0].id))') === true,
      JSON.stringify(mixOf(0)));
    w.eval('renderPartsScreen()');
    check('развёрнутый блок переживает перерисовку окна',
      card(chId(0)).querySelector('.pt-mix-eq').hidden === false);

    const eqLow = act(chId(0), 'eq0');
    eqLow.value = '6';
    eqLow.dispatchEvent(new w.Event('input', { bubbles: true }));
    check('во время протяжки полосы модель не меняется, а расчёт уже с полосой',
      mixEmpty(0) && eqJson(planFor(chId(0)).eq, [6, 0, 0]),
      JSON.stringify([mixOf(0), planFor(chId(0)).eq]));
    eqLow.dispatchEvent(new w.Event('change', { bubbles: true }));
    check('по отпускании полоса уезжает в модель',
      mixOf(0) && eqJson(mixOf(0).eq, [6, 0, 0]), JSON.stringify(mixOf(0)));
    check('подпись полосы показывает знак', card(chId(0)).querySelector('[data-eq-value="0"]').textContent === '+6',
      card(chId(0)).querySelector('[data-eq-value="0"]').textContent);
    const eqHigh = act('master', 'eq2');
    eqHigh.value = '-4';
    eqHigh.dispatchEvent(new w.Event('input', { bubbles: true }));
    eqHigh.dispatchEvent(new w.Event('change', { bubbles: true }));
    check('EQ мастера живёт в полосе мастера',
      w.eval('JSON.stringify(songMixerState.master.eq)') === '[-0,-0,-4]' ||
      eqJson(JSON.parse(w.eval('JSON.stringify(songMixerState.master.eq)')), [0, 0, -4]),
      w.eval('JSON.stringify(songMixerState.master.eq)'));
    check('кнопка EQ подсвечена, когда полосы не по нулям',
      card(chId(0)).querySelector('[data-act="eq"]').classList.contains('is-on') &&
      card('master').querySelector('[data-act="eq"]').classList.contains('is-on'));
    // Нулевую полосу модель не хранит: вернули в ноль — ключ ушёл.
    eqLow.value = '0';
    eqLow.dispatchEvent(new w.Event('input', { bubbles: true }));
    eqLow.dispatchEvent(new w.Event('change', { bubbles: true }));
    check('полоса, вернувшаяся в ноль, из модели уходит',
      mixEmpty(0), JSON.stringify(mixOf(0)));

    // ================= 8. Эквалайзер: звук =================
    // Мини-подделка Web Audio: jsdom его не умеет, а нам нужно проверить, что
    // полосы реально стоят в цепочке канала и получают свои децибелы.
    const fakeCtx = (() => {
      const param = (v) => ({
        value: v, setValueAtTime() {}, linearRampToValueAtTime() {},
        exponentialRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {},
      });
      const mk = (kind) => {
        const node = { kind, connections: [], connect(d) { this.connections.push(d); return d; }, disconnect() {} };
        if (kind === 'gain') node.gain = param(1);
        if (kind === 'panner') node.pan = param(0);
        if (kind === 'filter') {
          node.frequency = param(1000);
          node.Q = param(1);
          node.gain = param(0);
          node.type = 'lowpass';
        }
        if (kind === 'source') {
          node.playbackRate = param(1);
          node.detune = param(0);
          node.start = () => {};
          node.stop = () => {};
        }
        return node;
      };
      return {
        currentTime: 0, sampleRate: 44100, state: 'running',
        destination: mk('destination'),
        createGain: () => mk('gain'),
        createStereoPanner: () => mk('panner'),
        createConvolver: () => mk('convolver'),
        createBiquadFilter: () => mk('filter'),
        createBufferSource: () => mk('source'),
        createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len) }),
        resume() {},
        close() { return Promise.resolve(); },
      };
    })();
    w.__fakeCtx = fakeCtx;
    w.eval('mixerChannels = new Map(); guitarMasterGain = null; guitarMasterPanner = null; masterFilters = [];');
    const channelInfo = JSON.parse(w.eval(
      '(function(){ const ch = ensureMixerChannel(__ctx, "song"); return JSON.stringify({ types: ch.filters.map((f) => f.type), freqs: ch.filters.map((f) => f.frequency.value) }); })()'.replace('__ctx', '__fakeCtx')
    ));
    check('канал получает цепочку из трёх полос нужных типов и частот',
      eqJson(channelInfo.types, ['lowshelf', 'peaking', 'highshelf']) &&
      eqJson(channelInfo.freqs, [250, 1000, 4000]), JSON.stringify(channelInfo));
    check('эквалайзер стоит в цепочке ДО панорамы: хвост — панорама, а не мастер',
      JSON.parse(w.eval(
        '(function(){ const ch = mixerChannels.get("song"); const last = ch.filters[ch.filters.length - 1]; return JSON.stringify(last.connections.map((n) => n.kind)); })()'
      ))[0] === 'panner');
    check('у мастера своя тройка полос',
      JSON.parse(w.eval('JSON.stringify(masterFilters.map((f) => f.type))')).length === 3,
      w.eval('JSON.stringify(masterFilters.map((f) => f.type))'));
    w.eval('songMixerState.eq = [5, -3, 2]; songMixerState.master.eq = [-2, 0, 4]; applyMixerValues(__fakeCtx);');
    check('децибелы каналов уезжают в фильтры',
      eqJson(JSON.parse(w.eval('JSON.stringify(mixerChannels.get("song").filters.map((f) => f.gain.value))')), [5, -3, 2]),
      w.eval('JSON.stringify(mixerChannels.get("song").filters.map((f) => f.gain.value))'));
    check('децибелы мастера уезжают в фильтры мастера',
      eqJson(JSON.parse(w.eval('JSON.stringify(masterFilters.map((f) => f.gain.value))')), [-2, 0, 4]),
      w.eval('JSON.stringify(masterFilters.map((f) => f.gain.value))'));
    check('громкость, панорама и эквалайзер применяются вместе',
      Math.abs(w.eval('mixerChannels.get("song").input.gain.value') - 1) < 1e-9 &&
      Math.abs(w.eval('mixerChannels.get("song").panner.pan.value')) < 1e-9);
    w.eval('mixerChannels = new Map(); guitarMasterGain = null; guitarMasterPanner = null; masterFilters = []; songMixerState.eq = undefined; songMixerState.master.eq = undefined;');

    // ================= 9. Эквалайзер: файл =================
    load([guitar]);
    w.eval('togglePartsMode(true)');
    const fileEq = act(chId(0), 'eq1');
    fileEq.value = '8';
    fileEq.dispatchEvent(new w.Event('input', { bubbles: true }));
    fileEq.dispatchEvent(new w.Event('change', { bubbles: true }));
    w.saveCurrentSong();
    const eqLib = JSON.parse(w.localStorage.getItem('struchord_songs'));
    check('полосы эквалайзера уезжают в файл массивом',
      eqJson(eqLib[eqLib.length - 1].parts[0].mix.eq, [0, 8, 0]),
      JSON.stringify(eqLib[eqLib.length - 1].parts[0].mix));
    w.loadSong(eqLib.length - 1);
    w.eval('render()');
    check('полосы пережили перезагрузку песни',
      eqJson(mixOf(0).eq, [0, 8, 0]) && eqJson(planFor(chId(0)).eq, [0, 8, 0]),
      JSON.stringify(mixOf(0)));
    check('файл не хранит нулевые полосы',
      JSON.parse(w.eval('JSON.stringify(mixCompact({ volume: 100, eq: [0, 0, 0] }, true))')).eq === undefined);
    check('мусор в полосах: нечисло — ноль, выход за ±12 дБ зажат',
      eqJson(mixEqOf({ eq: ['громко', 99, -99] }), [0, 12, -12]) &&
      eqJson(mixEqOf({ eq: 'ровно' }), [0, 0, 0]),
      JSON.stringify(mixEqOf({ eq: ['громко', 99, -99] })));

    console.log(`\nитого: ${pass} ok, ${fail} FAIL`);
    if (fail) process.exitCode = 1;
  } catch (e) {
    console.error('ОШИБКА:', e && e.stack ? e.stack : e);
    process.exitCode = 1;
  }
});
