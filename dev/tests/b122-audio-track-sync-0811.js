#!/usr/bin/env node
'use strict';

// B-122 · audio track metadata, sync-point tempo mapping, Solo, and playback-rate timing.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');
const ROOT = path.resolve(__dirname, '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'STRUCHORD.html'), 'utf8')
  .replace('<script src="./keyboard-audio.js"></script>', `<script>${fs.readFileSync(path.join(ROOT, 'keyboard-audio.js'), 'utf8')}</script>`)
  .replace('<script src="./keyboard-accompaniment.js"></script>', `<script>${fs.readFileSync(path.join(ROOT, 'keyboard-accompaniment.js'), 'utf8')}</script>`);
const dom = new JSDOM(html, {
  url: 'http://127.0.0.1:8080/STRUCHORD.html',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  beforeParse(win) {
    win.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    win.HTMLCanvasElement.prototype.getContext = function () { const canvas = this; return { font: '', measureText: text => ({ width: String(text || '').length * 8 }), clearRect() { if (canvas.id === 'btWaveCanvas') win.__btWaveXs = []; }, fillRect() {}, beginPath() {}, moveTo(x, y) { if (canvas.id === 'btWaveCanvas' && y === 0) (win.__btWaveXs ||= []).push(x); }, lineTo() {}, stroke() {}, arc() {}, fill() {}, closePath() {}, save() {}, restore() {}, translate() {}, rotate() {}, fillText() {}, strokeText() {}, setTransform() {}, scale() {}, createLinearGradient: () => ({ addColorStop() {} }) }; };
    win.__audioInstances = [];
    win.Audio = function () { this.paused = true; this.currentTime = 0; this.volume = 1; this.playbackRate = 1; this.addEventListener = () => {}; this.setAttribute = () => {}; this.load = () => {}; this.pause = () => { this.paused = true; }; this.play = () => { this.paused = false; return Promise.resolve(); }; win.__audioInstances.push(this); };
    win.Blob = Blob;
    win.URL.createObjectURL = () => 'blob:b122-test';
    win.URL.revokeObjectURL = () => {};
    win.HTMLAnchorElement.prototype.click = function () {};
    win.AudioContext = win.webkitAudioContext = function () { this.currentTime = 10; this.state = 'running'; this.close = () => Promise.resolve(); };
  },
});
const w = dom.window;
function check(name, fn) {
  try { fn(); console.log('ok   ' + name); }
  catch (error) { console.error('FAIL ' + name + '\n' + (error.stack || error)); process.exitCode = 1; }
}

setTimeout(async () => {
  try {
    const bt = w.StruChordBackingTrack;
    assert(bt, 'module registered');
    check('25 MB input limit is exposed and metadata is compact', () => {
      assert.strictEqual(bt.limit, 25 * 1024 * 1024);
      const meta = bt.sanitize({ id: 'audio-1', name: 'take.wav', size: 512, points: [{ bar: 0, time: 0 }, { bar: 1, time: 2 }] });
      assert.strictEqual(meta.syncMode, 'sync_points_gp');
      assert.strictEqual(meta.points.length, 2);
      assert.strictEqual(bt.sanitize({ id: 'too-large', size: bt.limit + 1 }), null);
    });
    check('drawer and transport control are present; no-audio state hides transport button', () => {
      assert(w.document.getElementById('btDrawer'));
      assert(w.document.getElementById('btMixerBlock'));
      assert(w.document.getElementById('btTransportBtn').hidden);
    });
    w.eval(`
      globalTimeSig = '4/4';
      sections = [{ id: 1, type: 'Verse', repeat: 1, timeSig: '4/4', squares: [
        { id: 1, repeat: 1, events: [{ chord: 'C', span: 4 }] },
        { id: 2, repeat: 1, events: [{ chord: 'G', span: 4 }] },
      ] }];
    `);
    await bt.importEmbedded({ backingTrack: { id: 'b122-test-audio', name: 'test.wav', type: 'audio/wav', size: 4, points: [], embedded: w.btoa('RIFF') } });
    await bt.loadSong({ backingTrack: {
      id: 'b122-test-audio', name: 'test.wav', type: 'audio/wav', size: 512,
      duration: 8, speed: 1, volume: 80, mute: false, solo: true,
      points: [{ bar: 0, time: 0 }, { bar: 4, time: 12 }],
    } });
    check('wave drawer provides standalone MP3 audition controls', () => {
      bt.toggleDrawer(true);
      const preview = w.document.querySelector('#btDrawer [data-bt-action="preview"]');
      assert(preview, 'preview button exists');
      assert(w.document.getElementById('btPlayhead'), 'playhead time is visible');
      preview.click();
      assert.strictEqual(w.document.querySelector('#btDrawer [data-bt-action="preview"]').textContent, 'Пауза MP3');
      w.document.querySelector('#btDrawer [data-bt-action="preview"]').click();
      assert.strictEqual(w.document.querySelector('#btDrawer [data-bt-action="preview"]').textContent, '▶ Прослушать MP3');
    });
    check('.struchord export offers embed vs lightweight sync metadata', () => {
      w.exportStruchordFile();
      assert(w.document.getElementById('btEmbedAudio'));
      assert(w.document.getElementById('btLinkAudio'));
      w.document.getElementById('btExportCancel').click();
    });
    const lightExport = await w.exportStruchordFile({ embedBackingAudio: false });
    check('programmatic lightweight export bypasses the prompt and includes only track metadata', () => {
      assert.strictEqual(lightExport.backingTrack.id, 'b122-test-audio');
      assert(!Object.prototype.hasOwnProperty.call(lightExport.backingTrack, 'embedded'));
      assert(!w.document.getElementById('btEmbedAudio'));
    });
    await bt.importEmbedded({ backingTrack: { id: 'embed-test', name: 'embedded.wav', type: 'audio/wav', size: 4, points: [], embedded: w.btoa('RIFF') } });
    const embeddedExport = await bt.exportStoredSong({ backingTrack: { id: 'embed-test', name: 'embedded.wav', type: 'audio/wav', size: 4, points: [] } }, true);
    check('embedded .struchord export pulls bytes from the separate audio store', () => {
      assert.strictEqual(embeddedExport.backingTrack.embedded, w.btoa('RIFF'));
    });
    await bt.deleteAudio('embed-test');
    check('sync grid is cached across event lookups and retains an out-of-grid GP bar anchor', () => {
      w.document.getElementById('songTitle').value = 'Renamed while audio is attached';
      const cachedGrid = bt.getBarGrid();
      assert.strictEqual(bt.getBarGrid(), cachedGrid);
      assert.strictEqual(cachedGrid.bars, 2);
      w.eval('sections[0].repeat = 2');
      bt.invalidateGrid();
      assert.strictEqual(bt.getBarGrid().bars, 4);
      w.eval('sections[0].repeat = 1');
      bt.invalidateGrid();
      assert.strictEqual(bt.getBarGrid().bars, 2);
      assert.deepStrictEqual(Array.from(bt.state.points, p => p.bar), [0, 4]);
      assert.strictEqual(bt.state.id, 'b122-test-audio');
    });
    check('piecewise sync points derive 80 BPM at native speed', () => {
      assert.strictEqual(bt.getBpmForBar(0), 80);
      assert.strictEqual(bt.getBpmForBar(1), 80);
      const normal = bt.resolveScheduledEvent(null, 0, 0, 0, 0, 0, 10, 4, '4/4', 120);
      assert.strictEqual(normal.bpm, 80);
      assert.strictEqual(normal.dur, 3);
    });
    check('sync-point time can be entered precisely in seconds', () => {
      const time = w.document.querySelector('#btDrawer [data-point-time="1"]');
      assert(time, 'numeric time editor exists');
      time.value = '11.25';
      time.dispatchEvent(new w.Event('change', { bubbles: true }));
      assert.strictEqual(bt.state.points[1].time, 11.25);
      assert.strictEqual(w.document.querySelector('#btDrawer [data-point-time="1"]').value, '11.250');
      const focusedTime = w.document.querySelector('#btDrawer [data-point-time="1"]');
      let undoCalls = 0, redoCalls = 0;
      const originalUndo = w.undoEdit, originalRedo = w.redoEdit;
      w.undoEdit = () => { undoCalls++; };
      w.redoEdit = () => { redoCalls++; };
      const undoKey = new w.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true });
      focusedTime.dispatchEvent(undoKey);
      assert.strictEqual(undoKey.defaultPrevented, true, 'Ctrl+Z is handled while the Sync Point time field has focus');
      assert.strictEqual(undoCalls, 1, 'Ctrl+Z invokes the song undo command');
      const redoKey = new w.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true });
      focusedTime.dispatchEvent(redoKey);
      assert.strictEqual(redoKey.defaultPrevented, true, 'Ctrl+Shift+Z redoes while the Sync Point time field has focus');
      assert.strictEqual(redoCalls, 1, 'Ctrl+Shift+Z invokes the song redo command');
      w.undoEdit = originalUndo;
      w.redoEdit = originalRedo;
      const invalid = w.document.querySelector('#btDrawer [data-point-time="1"]');
      invalid.value = '0';
      invalid.dispatchEvent(new w.Event('change', { bubbles: true }));
      assert.strictEqual(bt.state.points[1].time, 11.25, 'invalid order leaves the model unchanged');
    });
    check('waveform zoom supports two-finger pinch and Ctrl+wheel gestures', () => {
      bt.toggleDrawer(true);
      const canvas = w.document.getElementById('btWaveCanvas');
      canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 600, bottom: 108, width: 600, height: 108 });
      canvas.parentElement.getBoundingClientRect = () => ({ left: 0, top: 0, right: 600, bottom: 108, width: 600, height: 108 });
      const pointer = (type, id, x, y) => {
        const event = new w.Event(type, { bubbles: true, cancelable: true });
        Object.defineProperties(event, { pointerType: { value: 'touch' }, pointerId: { value: id }, clientX: { value: x }, clientY: { value: y } });
        return event;
      };
      const beforePinch = canvas.style.width;
      canvas.dispatchEvent(pointer('pointerdown', 11, 160, 50));
      canvas.dispatchEvent(pointer('pointerdown', 12, 440, 50));
      canvas.dispatchEvent(pointer('pointermove', 12, 520, 50));
      assert.notStrictEqual(canvas.style.width, beforePinch, 'pinch gesture changes zoom');
      canvas.dispatchEvent(pointer('pointerup', 11, 160, 50));
      canvas.dispatchEvent(pointer('pointerup', 12, 520, 50));
      const beforeWheel = canvas.style.width;
      const wheel = new w.WheelEvent('wheel', { ctrlKey: true, deltaY: -80, clientX: 300, bubbles: true, cancelable: true });
      canvas.dispatchEvent(wheel);
      assert.strictEqual(wheel.defaultPrevented, true, 'Ctrl+wheel is captured for zoom');
      assert.notStrictEqual(canvas.style.width, beforeWheel, 'Ctrl+wheel changes zoom');
      const zoom = w.document.querySelector('#btZoom');
      assert.strictEqual(zoom.value, String(Math.round(parseFloat(canvas.style.width))));
      assert.strictEqual(zoom.max, '10000', 'zoom control supports magnification well beyond the old 500% limit');
      zoom.value = '1200';
      zoom.dispatchEvent(new w.Event('input', { bubbles: true }));
      assert.strictEqual(canvas.style.width, '1200%', 'wave can be zoomed past 500%');
    });
    await bt.importEmbedded({ backingTrack: { id: 'wave-grid-test', name: 'grid.wav', type: 'audio/wav', size: 4, duration: 12, points: [], embedded: w.btoa('RIFF') } });
    await bt.loadSong({ backingTrack: { id: 'wave-grid-test', name: 'grid.wav', type: 'audio/wav', size: 4, duration: 12, speed: 1, volume: 80, mute: false, solo: false, points: [{ bar: 0, time: 0 }, { bar: 2, time: 4 }] } });
    check('bar grid extrapolates through the end of audio beyond the score bars', () => {
      bt.toggleDrawer(true);
      const canvas = w.document.getElementById('btWaveCanvas');
      canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 600, bottom: 108, width: 600, height: 108 });
      const zoom = w.document.querySelector('#btZoom');
      zoom.dispatchEvent(new w.Event('input', { bubbles: true }));
      assert(bt.getBarGrid().bars < 6, 'test score is shorter than the audio');
      assert(w.__btWaveXs.length >= 9, 'extended bars and sync markers reach the full recording duration');
    });
    w.eval('timelineMode = false');
    await new Promise(resolve => w.setTimeout(resolve, 10));
    const gridCanvas = w.document.getElementById('btWaveCanvas');
    gridCanvas.dispatchEvent(new w.MouseEvent('click', { clientX: 590, clientY: 50, bubbles: true }));
    const outsideStart = bt.consumePendingStartPosition();
    const startsAtAudioZero = bt.consumePendingAudioStartFromZero();
    check('seeking into audio outro lets Play restart from score and audio beginnings', () => {
      assert(outsideStart && outsideStart.sectionIndex === 0 && outsideStart.squareIndex === 0 && outsideStart.eventIndex === 0);
      assert.strictEqual(startsAtAudioZero, true);
    });
    bt.preparePlaybackStart({ currentTime: 0 }, { currentSectionIndex: 0, currentSquareIndex: 0, currentEventIndex: 0, _sectionRepeatCount: {}, _squareRepeatCount: {} }, 0, 0, startsAtAudioZero);
    await new Promise(resolve => w.setTimeout(resolve, 20));
    check('boundary-seek playback starts the backing audio at zero seconds', () => {
      assert.strictEqual(w.__audioInstances[w.__audioInstances.length - 1].currentTime, 0);
    });
    await bt.loadSong({ backingTrack: { id: 'track-drag-test', name: 'drag.wav', type: 'audio/wav', size: 512, duration: 8, speed: 1, volume: 80, mute: false, solo: false, points: [{ bar: 0, time: 1 }, { bar: 2, time: 5 }] } });
    check('Alt+drag shifts the backing recording against bars while preserving sync spacing', () => {
      bt.toggleDrawer(true);
      const canvas = w.document.getElementById('btWaveCanvas');
      canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 600, bottom: 108, width: 600, height: 108 });
      const pointer = (type, x) => {
        const event = new w.Event(type, { bubbles: true, cancelable: true });
        Object.defineProperties(event, { pointerType: { value: 'mouse' }, pointerId: { value: 21 }, clientX: { value: x }, clientY: { value: 52 }, altKey: { value: true } });
        return event;
      };
      canvas.dispatchEvent(pointer('pointerdown', 200));
      canvas.dispatchEvent(pointer('pointermove', 260));
      canvas.dispatchEvent(pointer('pointerup', 260));
      assert(Math.abs(bt.state.points[0].time - 0.2) < 0.001);
      assert(Math.abs(bt.state.points[1].time - 4.2) < 0.001);
      assert(Math.abs((bt.state.points[1].time - bt.state.points[0].time) - 4) < 0.001, 'relative sync interval is unchanged');
      assert(Math.abs(bt.state.trackOffset - 0.8) < 0.001, 'waveform offset records the visible track movement');
    });
    await bt.loadSong({ backingTrack: { id: 'b122-test-audio', name: 'test.wav', type: 'audio/wav', size: 512, duration: 8, speed: 0.5, volume: 80, mute: false, solo: true, points: [{ bar: 0, time: 0 }, { bar: 2, time: 6 }] } });
    check('50 percent speed scales scheduler BPM and duration without pitch shifting', () => {
      const slow = bt.resolveScheduledEvent(null, 0, 0, 0, 0, 0, 10, 4, '4/4', 120);
      assert.strictEqual(slow.bpm, 40);
      assert.strictEqual(slow.dur, 6);
      assert.strictEqual(bt.isSolo(), true);
    });
    check('Solo participates in the shared mixer matrix', () => assert.strictEqual(bt.isSolo(), true));
    w.eval(`sections = [
      { id: 1, type: 'Verse', repeat: 2, timeSig: '4/4', squares: [
        { id: 11, repeat: 2, events: [{ chord: 'C', span: 4 }] },
        { id: 12, repeat: 1, events: [{ chord: 'G', span: 4 }] },
      ] },
      { id: 2, type: 'Chorus', repeat: 1, timeSig: '4/4', squares: [
        { id: 21, repeat: 1, events: [{ chord: 'F', span: 4 }] },
      ] },
    ];`);
    await bt.loadSong({ backingTrack: { id: 'b122-repeat-audio', name: 'repeat.wav', type: 'audio/wav', size: 512, speed: 1, points: [{ bar: 0, time: 0 }, { bar: 7, time: 21 }] } });
    check('unrolled bar grid counts square and section repeats for downstream tempo mapping', () => {
      assert.strictEqual(bt.getBarGrid().bars, 7);
      assert.strictEqual(bt.getBpmForEvent(1, 0, 0, 0, 0, 4, '4/4'), 80);
    });
    const wav = Buffer.alloc(44 + 8000 * 2);
    wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVE', 8);
    wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
    wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
    await bt.importEmbedded({ backingTrack: { id: 'wav-fallback', name: 'fallback.wav', type: 'audio/wav', size: wav.length, points: [], embedded: wav.toString('base64') } });
    await bt.loadSong({ backingTrack: { id: 'wav-fallback', name: 'fallback.wav', type: 'audio/wav', size: wav.length, points: [] } });
    check('pure-JS PCM WAV peak fallback recovers duration in an offline/JSDOM AudioContext', () => {
      assert.strictEqual(bt.state.duration, 1);
    });
    console.log('\nB-122 checks completed.');
  } finally {
    w.close();
  }
}, 50);
