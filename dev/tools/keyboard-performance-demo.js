'use strict';
// Creates a completely original test MIDI from the prototype, not from the
// reference library. Usage: node dev/tools/keyboard-performance-demo.js /tmp/demo.mid
const fs = require('fs');
const {writeMidi} = require('midi-file');
const {generatePerformance} = require('../prototypes/keyboard-performance');
const output=process.argv[2];
if (!output) { console.error('Usage: node dev/tools/keyboard-performance-demo.js <output.mid>'); process.exit(2); }
const ppq=960, bpm=90;
const c=[{bassPc:0,tones:[0,4,7],beats:4},{bassPc:9,tones:[9,0,4],beats:4},{bassPc:5,tones:[5,9,0],beats:4},{bassPc:7,tones:[7,11,2],beats:4}];
const result=generatePerformance({chords:c.concat(c),low:36,high:96,bpm,meter:'4/4',genre:'pop',role:'verse',swing:false,sectionSwing:null,seed:21});
if (!result.ok) throw Error('Prototype could not find positions for chord '+result.chordIndex);
function handTrack(hand, channel) {
  const events=[];
  for(const n of result.notes.filter(n=>n.hand===hand)) {
    const start=Math.round(n.beat*ppq), end=Math.max(start+1,Math.round((n.beat+n.duration)*ppq));
    events.push({tick:start,kind:1,type:'noteOn',channel,noteNumber:n.midi,velocity:n.velocity});
    events.push({tick:end,kind:0,type:'noteOff',channel,noteNumber:n.midi,velocity:0});
  }
  events.sort((a,b)=>a.tick-b.tick || a.kind-b.kind || a.noteNumber-b.noteNumber);
  let last=0;
  const track=events.map(({tick,kind,...event})=>{const deltaTime=tick-last;last=tick;return {deltaTime,...event};});
  track.push({deltaTime:Math.max(0,Math.round(result.beats*ppq)-last),meta:true,type:'endOfTrack'});
  return track;
}
const conductor=[{deltaTime:0,meta:true,type:'setTempo',microsecondsPerBeat:Math.round(60000000/bpm)},
  {deltaTime:0,meta:true,type:'timeSignature',numerator:4,denominator:4,metronome:24,thirtyseconds:8},
  {deltaTime:Math.round(result.beats*ppq),meta:true,type:'endOfTrack'}];
fs.writeFileSync(output,Buffer.from(writeMidi({header:{format:1,numTracks:3,ticksPerBeat:ppq},tracks:[conductor,handTrack('left',0),handTrack('right',1)]})));
console.log(`Wrote ${result.notes.length} notes, ${result.beats} quarter notes to ${output}`);
