#!/usr/bin/env node
'use strict';

// B-122 / 0.829+ · Auto-Sync preview, manual first bar, range-safe Apply, and Undo.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM } = require('jsdom');
const ROOT = path.resolve(__dirname, '..', '..');
const analyzerSource = fs.readFileSync(path.join(ROOT, 'dev', 'autosync-analyzer.js'), 'utf8').trim();
const source = fs.readFileSync(path.join(ROOT, 'STRUCHORD.html'), 'utf8');
assert(source.includes(analyzerSource), 'the dependency-free analyzer is inlined verbatim into the one-file app');
const html = source
  .replace('<script src="./keyboard-audio.js"></script>', `<script>${fs.readFileSync(path.join(ROOT, 'keyboard-audio.js'), 'utf8')}</script>`)
  .replace('<script src="./keyboard-accompaniment.js"></script>', `<script>${fs.readFileSync(path.join(ROOT, 'keyboard-accompaniment.js'), 'utf8')}</script>`);

const dom = new JSDOM(html, {
  url: 'http://127.0.0.1:8080/STRUCHORD.html', runScripts: 'dangerously', pretendToBeVisual: true,
  beforeParse(win) {
    win.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    win.HTMLCanvasElement.prototype.getContext = function () { return { font:'', measureText:t=>({width:String(t||'').length*8}), clearRect(){}, fillRect(){}, beginPath(){}, moveTo(){}, lineTo(){}, stroke(){}, arc(){}, fill(){}, closePath(){}, save(){}, restore(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, setTransform(){}, scale(){}, setLineDash(){}, createLinearGradient:()=>({addColorStop(){}}) }; };
    win.Audio = function () { this.paused=true;this.currentTime=0;this.duration=8;this.volume=1;this.playbackRate=1;this.addEventListener=()=>{};this.setAttribute=()=>{};this.removeAttribute=()=>{};this.load=()=>{};this.pause=()=>{this.paused=true;};this.play=()=>{this.paused=false;return Promise.resolve();}; };
    win.Blob = Blob;
    win.URL.createObjectURL = () => 'blob:auto-sync-test'; win.URL.revokeObjectURL = () => {};
    win.HTMLAnchorElement.prototype.click = function () {};
    const samples = new Float32Array(32000); samples[1200] = 1;
    win.__decodedAutoSyncBuffer = { duration:4, length:samples.length, numberOfChannels:1, sampleRate:8000, getChannelData:()=>samples };
    win.AudioContext = win.webkitAudioContext = function () { this.currentTime=10;this.state='running';this.decodeAudioData=()=>Promise.resolve(win.__decodedAutoSyncBuffer);this.close=()=>Promise.resolve(); };
  }
});
const w = dom.window;
const delay = (ms=20) => new Promise(resolve => setTimeout(resolve, ms));
const checks = [];
function check(name, fn) { try { fn(); checks.push(name); console.log('ok   '+name); } catch (error) { console.error('FAIL '+name+'\n'+(error.stack||error)); process.exitCode=1; } }

setTimeout(async () => {
  try {
    const bt = w.StruChordBackingTrack;
    assert(bt, 'backing module registered');
    w.eval(`
      globalTimeSig='4/4'; DOM.bpmInput.value='81';
      sections=[{id:1,type:'Verse',repeat:1,squares:[
        {id:1,repeat:1,events:[{chord:'C',span:4}]},
        {id:2,repeat:1,events:[{chord:'F',span:4}]}
      ]}];
    `);
    const embedded = Buffer.from('auto-sync-decoder-path').toString('base64');
    const original = [{bar:0,time:.2},{bar:1,time:3.2},{bar:2,time:6.2}];
    await bt.importEmbedded({backingTrack:{id:'auto-sync-audio',name:'take.mp3',type:'audio/mpeg',size:22,embedded}});
    await bt.loadSong({backingTrack:{id:'auto-sync-audio',name:'take.mp3',type:'audio/mpeg',size:22,duration:4,points:original}});
    bt.invalidateGrid(); bt.toggleDrawer(true);
    if (w.resetHistory) w.resetHistory();

    let call = null;
    w.StruChordAutoSyncAnalyzer.analyze = async (buffer, song, options) => {
      call = { buffer, song, options };
      options.onProgress({stage:'onsets',fraction:.5});
      await delay(1);
      return {
        mode:options.mode,duration:4,score:{bars:2,quarters:8,events:2},
        tempo:{bpm:81.4,periodSeconds:60/81.4,local:[],localStdBpm:.02},firstBeat:.3,
        points:[{bar:0,time:.3,bpmToNext:81.4},{bar:1,time:3.25,bpmToNext:null}],
        candidates:[{beatOffset:0,startTime:.3,harmonyScore:.67,coverage:1,points:[{bar:0,time:.3,bpmToNext:81.4},{bar:1,time:3.25,bpmToNext:null}]}],
        ambiguousStart:false,confidence:{overall:.82,attacks:.8,tempoStability:.9,harmony:.8,candidateMargin:.8,low:false,reasons:[]},
        mismatches:{regions:[],beatResidualP90Ms:18},eventAttacks:{reliableChanges:2,within30ms:1,medianMs:8,p90Ms:18},shouldApply:true,diagnostics:{}
      };
    };

    w.document.querySelector('[data-bt-action="autosync"]').onclick();
    check('Auto-Sync panel exposes both modes and an optional bar range', () => {
      assert.strictEqual(w.document.querySelectorAll('input[name="btAutoSyncMode"]').length,2);
      assert(w.document.querySelector('[data-autosync-range]'));
    });
    const range = w.document.querySelector('[data-autosync-range]'); range.checked=true;range.onchange();
    const to = w.document.querySelector('[data-autosync-to]');to.value='1';to.onchange();
    w.document.querySelector('[data-autosync-run]').onclick();
    await delay(30);

    check('analysis receives the retained AudioBuffer and selected zero-based range', () => {
      assert.strictEqual(call.buffer,w.__decodedAutoSyncBuffer);
      assert.strictEqual(call.options.fromBar,0);assert.strictEqual(call.options.toBar,1);
      assert.strictEqual(call.options.mode,'steady');
    });
    check('preview reports BPM/confidence without mutating existing Sync Points', () => {
      assert(w.document.querySelector('.bt-autosync-summary').textContent.includes('81.400 BPM'));
      assert(w.document.querySelector('.bt-autosync-summary').textContent.includes('82%'));
      assert.deepStrictEqual(JSON.parse(JSON.stringify(bt.serialize().points)),original);
      assert.strictEqual(w.document.querySelectorAll('.bt-autosync-table tbody tr').length,2);
    });
    const shift=w.document.querySelector('[data-autosync-shift]');shift.value='10';shift.onchange();
    w.document.querySelector('[data-autosync-apply]').onclick();
    check('range Apply replaces only points inside the range and includes manual first-beat shift', () => {
      assert.deepStrictEqual(JSON.parse(JSON.stringify(bt.serialize().points)),[{bar:0,time:.31},{bar:1,time:3.26},{bar:2,time:6.2}]);
    });
    if (w.undoEdit) w.undoEdit();
    await delay(20);
    check('one Undo restores all manual points replaced by Auto-Sync', () => {
      assert.deepStrictEqual(JSON.parse(JSON.stringify(bt.serialize().points)),original);
    });

    // Low confidence stays preview-only until the user explicitly places bar 1.
    bt.toggleDrawer(true);
    w.StruChordAutoSyncAnalyzer.analyze = async () => ({
      mode:'steady',tempo:{bpm:80},firstBeat:.4,
      points:[{bar:0,time:.4,bpmToNext:80},{bar:1,time:3.4,bpmToNext:null}],
      candidates:[{startTime:.4,harmonyScore:.2,points:[{bar:0,time:.4,bpmToNext:80},{bar:1,time:3.4,bpmToNext:null}]}],
      ambiguousStart:false,
      confidence:{overall:.2,low:true,reasons:['Нет чётких ударов.']},mismatches:{regions:[]},shouldApply:false
    });
    w.document.querySelector('[data-bt-action="autosync"]').onclick();
    w.document.querySelector('[data-autosync-run]').onclick();
    await delay(20);
    check('low confidence explains the failure, shows the drag instruction, and initially disables Apply', () => {
      const apply=w.document.querySelector('[data-autosync-apply]');
      assert(apply && apply.disabled);
      assert(w.document.querySelector('#btAutoSyncHost').textContent.includes('Перетащите оранжевый маркер'));
      assert(w.document.querySelector('#btAutoSyncHost').textContent.includes('Нет чётких ударов'));
      assert.deepStrictEqual(JSON.parse(JSON.stringify(bt.serialize().points)),original);
    });
    const wave=w.document.querySelector('#btWaveCanvas');
    // Candidate .4 s is at x=60 on the 600 px / 4 s fixture. Drag to 1 s.
    wave.dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,cancelable:true,clientX:60,clientY:40,button:0}));
    wave.dispatchEvent(new w.MouseEvent('pointermove',{bubbles:true,cancelable:true,clientX:150,clientY:40,button:0}));
    wave.dispatchEvent(new w.MouseEvent('pointerup',{bubbles:true,cancelable:true,clientX:150,clientY:40,button:0}));
    check('dragging the visible bar-1 marker confirms the manual position', () => {
      assert(w.document.querySelector('.bt-autosync-manual-status').textContent.includes('1.000 с'));
      assert(!w.document.querySelector('[data-autosync-apply]').disabled);
    });
    // Drag the now-confirmed marker from 1 s to .75 s for the Apply contract.
    wave.dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,cancelable:true,clientX:150,clientY:40,button:0}));
    wave.dispatchEvent(new w.MouseEvent('pointermove',{bubbles:true,cancelable:true,clientX:112.5,clientY:40,button:0}));
    wave.dispatchEvent(new w.MouseEvent('pointerup',{bubbles:true,cancelable:true,clientX:112.5,clientY:40,button:0}));
    let draggedFirst=0;
    check('manual bar 1 shifts the proposal and explicitly unlocks low-confidence Apply', () => {
      const apply=w.document.querySelector('[data-autosync-apply]');
      assert(apply && !apply.disabled);
      const match=w.document.querySelector('.bt-autosync-manual-status').textContent.match(/([\d.]+) с/);
      draggedFirst=match?Number(match[1]):NaN;
      assert(Number.isFinite(draggedFirst)&&Math.abs(draggedFirst-.75)<.01,String(draggedFirst));
      const times=Array.from(w.document.querySelectorAll('.bt-autosync-table tbody tr td:nth-child(2)')).map(td=>parseFloat(td.textContent));
      assert(Math.abs(times[0]-draggedFirst)<.001&&Math.abs(times[1]-draggedFirst-3)<.001,JSON.stringify(times));
      assert.deepStrictEqual(JSON.parse(JSON.stringify(bt.serialize().points)),original);
    });
    w.document.querySelector('[data-autosync-apply]').onclick();
    check('manual bar 1 applies the computed tempo while preserving points outside the selected range', () => {
      const saved=JSON.parse(JSON.stringify(bt.serialize().points));
      assert(Math.abs(saved[0].time-draggedFirst)<.001&&Math.abs(saved[1].time-draggedFirst-3)<.001,JSON.stringify(saved));
      assert.deepStrictEqual(saved[2],{bar:2,time:6.2});
    });
    if (w.undoEdit) w.undoEdit();
    await delay(20);
    check('manual low-confidence Apply is still one atomic Undo step', () => {
      assert.deepStrictEqual(JSON.parse(JSON.stringify(bt.serialize().points)),original);
    });
    console.log(`\nAuto-Sync integration checks completed: ${checks.length}.`);
  } finally { w.close(); }
},60);
