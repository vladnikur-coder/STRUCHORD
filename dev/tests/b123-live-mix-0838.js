#!/usr/bin/env node
'use strict';

// B-123 · 0.838: громкость, Mute и Solo дорожки (и Solo фоновой записи)
// применяются к уже звучащим голосам, а не со следующего аккорда.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');
const ROOT = path.resolve(__dirname, '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'STRUCHORD.html'), 'utf8')
  .replace('<script src="./keyboard-audio.js"></script>', `<script>${fs.readFileSync(path.join(ROOT, 'keyboard-audio.js'), 'utf8')}</script>`)
  .replace('<script src="./keyboard-accompaniment.js"></script>', `<script>${fs.readFileSync(path.join(ROOT, 'keyboard-accompaniment.js'), 'utf8')}</script>`);

function makeParam(initial) {
  return {
    value: initial,
    ramps: 0,
    cancelScheduledValues() { return this; },
    setValueAtTime(v) { this.value = v; return this; },
    linearRampToValueAtTime(v) { this.value = v; return this; },
    exponentialRampToValueAtTime(v) { this.value = v; return this; },
    setTargetAtTime(v) { this.value = v; this.ramps++; return this; },
  };
}
const audioNode = (extra) => Object.assign({ connect() {}, disconnect() {} }, extra);

const dom = new JSDOM(html, {
  url: 'http://127.0.0.1:8080/STRUCHORD.html',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  beforeParse(win) {
    win.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    win.HTMLCanvasElement.prototype.getContext = function () {
      return {
        font: '', measureText: (t) => ({ width: String(t || '').length * 8 }),
        clearRect() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
        arc() {}, fill() {}, closePath() {}, save() {}, restore() {}, translate() {}, rotate() {},
        fillText() {}, strokeText() {}, setTransform() {}, scale() {},
        createLinearGradient: () => ({ addColorStop() {} }),
      };
    };
    win.__audioInstances = [];
    win.Audio = function () {
      this.paused = true; this.currentTime = 0; this.volume = 1; this.playbackRate = 1;
      this.addEventListener = () => {}; this.setAttribute = () => {}; this.load = () => {};
      this.pause = () => { this.paused = true; };
      this.play = () => { this.paused = false; return Promise.resolve(); };
      win.__audioInstances.push(this);
    };
    win.URL.createObjectURL = () => 'blob:b123-test';
    win.URL.revokeObjectURL = () => {};
    win.HTMLAnchorElement.prototype.click = function () {};
    win.AudioContext = win.webkitAudioContext = function () {
      const self = this;
      this.currentTime = 5;
      this.sampleRate = 44100;
      this.state = 'running';
      this.outputLatency = 0.05;
      this.baseLatency = 0.01;
      this.destination = audioNode();
      this.createGain = () => audioNode({ gain: makeParam(1) });
      this.createStereoPanner = () => audioNode({ pan: makeParam(0) });
      this.createConvolver = () => audioNode({ buffer: null, normalize: true });
      this.createBiquadFilter = () => audioNode({
        type: 'lowpass', frequency: makeParam(1000), Q: makeParam(1), gain: makeParam(0), detune: makeParam(0),
      });
      this.createWaveShaper = () => audioNode({ curve: null, oversample: 'none' });
      this.createBufferSource = () => audioNode({
        buffer: null, playbackRate: makeParam(1), detune: makeParam(0), start() {}, stop() {}, onended: null,
      });
      this.createOscillator = () => audioNode({
        type: 'sine', frequency: makeParam(440), detune: makeParam(0), start() {}, stop() {}, onended: null,
      });
      this.createBuffer = (channels, length, rate) => ({
        length, sampleRate: rate, numberOfChannels: channels,
        getChannelData: () => new Float32Array(length),
      });
      this.resume = () => { self.state = 'running'; return Promise.resolve(); };
      this.close = () => Promise.resolve();
    };
  },
});
const w = dom.window;
function check(name, fn) {
  try { fn(); console.log('ok   ' + name); }
  catch (error) { console.error('FAIL ' + name + '\n' + (error.stack || error)); process.exitCode = 1; }
}

setTimeout(async () => {
  try {
    const T = w.StruChordTracks;
    assert(T, 'StruChordTracks зарегистрирован');
    w.eval(`
      globalTimeSig = '4/4';
      sections = [{ id: 1, type: 'Verse', repeat: 1, timeSig: '4/4', squares: [
        { id: 1, repeat: 1, events: [{ chord: 'C', span: 4 }] },
      ] }];
    `);

    const state = T.state();
    const mainId = state.mainTrackId;
    T.setInstrument(mainId, 'guitar');
    T.setVolume(mainId, 100);
    T.addTrack('guitar');
    const secondId = T.state().tracks[1].id;
    T.setVolume(secondId, 60);

    // Планируем звук по боевому пути: аккорд главной дорожки.
    w.eval(`
      var ctx = getAudioContext();
      var st = StruChordTracks.state();
      var main = st.tracks.find(function (t) { return t.id === st.mainTrackId; });
      b39WithGuitarGain(1, function () {
        playChordScheduled('C', ctx.currentTime + 0.05, 1, { secId: 1, squareId: 1, eventIndex: 0, key: 'C' });
      }, main.id);
      var second = st.tracks.find(function (t) { return t.id !== st.mainTrackId && t.instrument === 'guitar'; });
      b39WithGuitarGain(1, function () {
        playChordScheduled('G', ctx.currentTime + 0.05, 1, { secId: 1, squareId: 1, eventIndex: 0, key: 'C', trackId: second.id });
      }, second.id);
    `);

    const busSize = w.eval(`b39TrackBus.size`);
    check('voice of a track plays through its own live gain node', () => {
      assert.strictEqual(busSize, 2, 'у каждой дорожки свой узел, получено: ' + busSize);
      const mainGain = w.eval(`b39TrackBus.get(${mainId}).node.gain.value`);
      assert.strictEqual(mainGain, 1);
      const secondGain = w.eval(`b39TrackBus.get(${secondId}).node.gain.value`);
      assert.strictEqual(secondGain, 0.6);
    });

    check('mute of a track silences its sounding voices immediately', () => {
      T.setMute(mainId, true);
      assert.strictEqual(w.eval(`b39TrackBus.get(${mainId}).node.gain.value`), 0);
      assert.strictEqual(w.eval(`b39TrackBus.get(${secondId}).node.gain.value`), 0.6,
        'соседняя дорожка не должна гаснуть');
      T.setMute(mainId, false);
      assert.strictEqual(w.eval(`b39TrackBus.get(${mainId}).node.gain.value`), 1);
    });

    check('track volume slider applies while the chord still sounds', () => {
      T.setVolume(mainId, 25);
      assert.strictEqual(w.eval(`b39TrackBus.get(${mainId}).node.gain.value`), 0.25);
      T.setVolume(mainId, 100);
    });

    check('solo of one track ducks the other without waiting for the next chord', () => {
      T.setSolo(secondId, true);
      assert.strictEqual(w.eval(`b39TrackBus.get(${mainId}).node.gain.value`), 0);
      assert.strictEqual(w.eval(`b39TrackBus.get(${secondId}).node.gain.value`), 0.6);
      T.setSolo(secondId, false);
      assert.strictEqual(w.eval(`b39TrackBus.get(${mainId}).node.gain.value`), 1);
    });

    check('dragging the slider previews the level without touching the model', () => {
      w.eval(`b39SetTrackLiveVolume(${mainId}, 10)`);
      assert.strictEqual(w.eval(`b39TrackBus.get(${mainId}).node.gain.value`), 0.1);
      assert.strictEqual(T.track(mainId).volume, 100, 'модель пишется только по change');
      w.eval(`b39SetTrackLiveVolume(${mainId}, null)`);
      assert.strictEqual(w.eval(`b39TrackBus.get(${mainId}).node.gain.value`), 1);
      assert.strictEqual(w.eval(`b39TrackLive.size`), 0);
    });

    // ---- Клавишная дорожка: своя шина внутри модуля звуков ----
    check('keyboard track mute applies to its live bus at once', () => {
      const kid = T.addTrack('keys');
      T.setActive(kid);
      w.eval(`
        var ctx = getAudioContext();
        StruChordAudio.preview('C', ctx, ctx.currentTime + 0.05, null, 'C');
      `);
      const keyChannelGain = () => w.eval(`(mixerChannels.get('b39:keys:${kid}') || {}).input`).gain.value;
      assert.strictEqual(keyChannelGain(), 1);
      T.setMute(kid, true);
      assert.strictEqual(keyChannelGain(), 0);
      T.setMute(kid, false);
      assert.strictEqual(keyChannelGain(), 1);
      T.setSolo(mainId, true);
      assert.strictEqual(keyChannelGain(), 0, 'solo гитары приглушает клавишную дорожку');
      T.setSolo(mainId, false);
      assert.strictEqual(keyChannelGain(), 1);
      T.setActive(mainId);
    });

    // ---- Фоновая запись ----
    const bt = w.StruChordBackingTrack;
    await bt.importEmbedded({ backingTrack: { id: 'b123-test-audio', name: 'test.wav', type: 'audio/wav', size: 4, points: [], embedded: w.btoa('RIFF') } });
    await bt.loadSong({ backingTrack: {
      id: 'b123-test-audio', name: 'test.wav', type: 'audio/wav', size: 512,
      duration: 8, speed: 1, volume: 80, mute: false, solo: false,
      points: [{ bar: 0, time: 0 }, { bar: 4, time: 12 }],
    } });

    check('solo of a track ducks the backing recording without a restart', () => {
      const audio = w.__audioInstances[w.__audioInstances.length - 1];
      assert(audio, 'создан элемент фонового аудио');
      assert(audio.volume > 0, 'до solo запись слышна: ' + audio.volume);
      T.setSolo(mainId, true);
      assert.strictEqual(audio.volume, 0, 'solo дорожки приглушает запись сразу');
      T.setSolo(mainId, false);
      assert(audio.volume > 0, 'после снятия solo запись возвращается');
    });

    check('backing Solo and Mute buttons act at once, in both directions', () => {
      const solo = w.document.querySelector('#btMixerBlock [data-bt-solo]');
      const mute = w.document.querySelector('#btMixerBlock [data-bt-mute]');
      assert(solo && mute, 'кнопки M/S фоновой записи отрисованы');
      const audio = w.__audioInstances[w.__audioInstances.length - 1];
      solo.click();
      assert.strictEqual(w.eval(`b39TrackBus.get(${mainId}).node.gain.value`), 0,
        'Solo записи приглушает гитарные дорожки');
      assert.strictEqual(w.eval(`b39TrackBus.get(${secondId}).node.gain.value`), 0);
      assert(audio.volume > 0, 'сама запись при своём Solo продолжает звучать');
      solo.click();
      assert.strictEqual(w.eval(`b39TrackBus.get(${mainId}).node.gain.value`), 1,
        'повторное нажатие возвращает дорожки');
      mute.click();
      assert.strictEqual(audio.volume, 0, 'Mute записи гасит её сразу');
      mute.click();
      assert(audio.volume > 0, 'повторное нажатие возвращает запись');
    });

    check('backing volume slider applies while the recording plays', () => {
      const vol = w.document.querySelector('#btMixerBlock [data-bt-volume]');
      assert(vol, 'ползунок громкости записи отрисован');
      const audio = w.__audioInstances[w.__audioInstances.length - 1];
      vol.value = '30';
      vol.dispatchEvent(new w.Event('input', { bubbles: true }));
      assert.strictEqual(audio.volume, 0.3, 'громкость записи слышна сразу, без паузы');
      vol.value = '80';
      vol.dispatchEvent(new w.Event('input', { bubbles: true }));
      assert.strictEqual(audio.volume, 0.8);
    });

    check('metronome mute cancels clicks already in the look-ahead window', () => {
      w.eval(`
        setMetronomeMuted(false);
        var ctx = getAudioContext();
        scheduleClick(ctx, ctx.currentTime + 0.2, true, false);
      `);
      assert(w.eval('metronomeScheduledOscillators.size') > 0, 'щелчок запланирован');
      w.eval(`setMetronomeMuted(true)`);
      assert.strictEqual(w.eval('metronomeScheduledOscillators.size'), 0,
        'выключенный метроном не добивает уже запланированные щелчки');
    });

    check('live mix changes are ramped, not stepped', () => {
      const node = w.eval(`b39TrackBus.get(${mainId}).node`);
      const before = node.gain.ramps || 0;
      w.eval(`applyLiveTrackMix()`);
      assert((node.gain.ramps || 0) > before, 'громкость ведётся через setTargetAtTime (без щелчка)');
    });

    console.log('\nB-123 checks completed.');
  } catch (error) {
    console.error('FAIL сценарий B-123\n' + (error.stack || error));
    process.exitCode = 1;
  }
  try { dom.window.close(); } catch (_) {}
  process.exit(process.exitCode || 0);
}, 400);
