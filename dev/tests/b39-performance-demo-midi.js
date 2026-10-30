'use strict';
const assert=require('assert');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {execFileSync}=require('child_process');
const {parseMidi}=require('midi-file');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'b39-performance-'));
try {
  const file=path.join(tmp,'demo.mid');
  execFileSync(process.execPath,[path.join(__dirname,'../tools/keyboard-performance-demo.js'),file]);
  const midi=parseMidi(fs.readFileSync(file));
  assert.strictEqual(midi.header.format,1);
  assert.strictEqual(midi.header.ticksPerBeat,960);
  assert.strictEqual(midi.tracks.length,3);
  assert(midi.tracks[0].some(e=>e.type==='setTempo' && e.microsecondsPerBeat===Math.round(60000000/90)));
  for (const [index,channel] of [[1,0],[2,1]]) {
    let tick=0,on=0,off=0;const open=new Map();
    for(const e of midi.tracks[index]) {
      tick+=e.deltaTime;
      if(e.type==='noteOn' && e.velocity>0) {
        assert.strictEqual(e.channel,channel);
        assert(!open.has(e.noteNumber),'overlapping identical note');
        open.set(e.noteNumber,tick);on++;
      } else if(e.type==='noteOff' || (e.type==='noteOn' && e.velocity===0)) {
        assert(open.has(e.noteNumber),'unmatched note-off');
        assert(tick>open.get(e.noteNumber),'zero-length note');
        open.delete(e.noteNumber);off++;
      }
    }
    assert(on>0 && on===off && open.size===0);
    assert.strictEqual(tick,32*960);
  }
  console.log('Original prototype MIDI round trip: tempo, hands, paired notes and duration passed');
} finally { fs.rmSync(tmp,{recursive:true,force:true}); }
