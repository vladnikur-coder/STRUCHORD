'use strict';
const assert = require('assert');
const {generatePerformance, resolveSwing, GENRES} = require('../prototypes/keyboard-performance');
assert.strictEqual(resolveSwing(false, null),false);
assert.strictEqual(resolveSwing(true, null),true);
assert.strictEqual(resolveSwing(false, true),true);
assert.strictEqual(resolveSwing(true, false),false);
assert.throws(() => resolveSwing(true, 'false'));
const chords = [
  {bassPc:0,tones:[0,4,7],beats:4}, {bassPc:9,tones:[9,0,4],beats:4},
  {bassPc:5,tones:[5,9,0],beats:4}, {bassPc:7,tones:[7,11,2],beats:4}
];
const options={chords,low:36,high:96,bpm:90,meter:'4/4',genre:'pop',secondary:null,role:'verse',swing:false,sectionSwing:null,seed:1};
let cases=0, successes=0;
for (const genre of Object.keys(GENRES)) for (const meter of ['4/4','3/4','6/8']) for (const role of ['intro','verse','prechorus','chorus','bridge','solo','outro','custom']) for (const swing of [true,false]) {
  // One full bar per harmony; no user-provided MIDI notes.
  const measure = meter === '4/4' ? 4 : 3;
  const c = chords.map(x => ({...x, beats:measure}));
  const input={...options,chords:c,genre,meter,role,swing};
  const out=generatePerformance(input);
  assert.deepStrictEqual(out,generatePerformance(input));
  cases++;
  if (!out.ok) { assert.strictEqual(out.notes.length,0); continue; }
  successes++;
  assert.strictEqual(out.decisions.length,c.length);
  for (const n of out.notes) {
    assert(n.beat >= 0 && n.duration > 0 && n.beat+n.duration <= out.beats+1e-8);
    assert(n.midi>=input.low && n.midi<=input.high && n.velocity>=1 && n.velocity<=127);
    assert(['left','right'].includes(n.hand));
    const start=n.chordIndex*measure, end=start+measure;
    assert(n.beat >= start && n.beat+n.duration <= end+1e-8);
    assert(n.hand==='left' ? n.midi%12===c[n.chordIndex].bassPc : c[n.chordIndex].tones.includes(n.midi%12));
  }
  for(const d of out.decisions) {
    assert(d.left.length===1 && d.right.length<=4);
    assert(d.left[0]<d.right[0] && d.right.at(-1)-d.right[0]<=12);
    for (const n of out.notes.filter(n=>n.chordIndex===d.chordIndex)) assert(n.beat+n.duration<=d.releases[n.hand]+1e-8);
    const next=out.decisions[d.chordIndex+1];
    if (next) for (const hand of ['left','right']) {
      const center=a=>(a[0]+a[a.length-1])/2;
      const dist=Math.abs(center(d[hand])-center(next[hand]));
      if (dist) assert((next.beat-d.releases[hand])*60/input.bpm + 1e-8 >= Math.max(0.06,dist/20));
    }
  }
  // Check actual overlapping notes, not only the initially selected voicing.
  for(const n of out.notes) {
    const active=out.notes.filter(m=>m.beat<=n.beat && n.beat<m.beat+m.duration-1e-9);
    const left=active.filter(m=>m.hand==='left').map(m=>m.midi), right=active.filter(m=>m.hand==='right').map(m=>m.midi);
    assert(left.length<=1 && right.length<=4);
    if(right.length>1) assert(Math.max(...right)-Math.min(...right)<=12);
    if(left.length && right.length) assert(Math.max(...left)<Math.min(...right));
  }
  for(const n of out.notes) for(const m of out.notes) if(n!==m && n.hand===m.hand && n.midi===m.midi && n.beat<m.beat) assert(n.beat+n.duration<=m.beat+1e-8);
}
assert(successes>350, `too many infeasible transitions: ${successes}/${cases}`);
let varied=0;
for (const genre of Object.keys(GENRES)) for (const secondary of Object.keys(GENRES)) {
  if (genre===secondary) continue;
  const out=generatePerformance({...options,genre,secondary,low:48,high:72,bpm:160,chords:chords.map(c=>({...c,beats:2}))});
  assert(out.ok || (out.notes.length===0 && Number.isInteger(out.chordIndex)));
  if (out.ok) for (const n of out.notes) assert(n.midi>=48 && n.midi<=72);
  varied++;
}
assert.strictEqual(varied,72);
assert.throws(()=>generatePerformance({...options,genre:'unknown'}));
assert.throws(()=>generatePerformance({...options,secondary:'pop'}));
assert.throws(()=>generatePerformance({...options,chords:[{...chords[0],beats:0.375}]}));
const impossible=generatePerformance({...options,low:60,high:60});
assert.strictEqual(impossible.ok,false);
assert.deepStrictEqual(impossible.notes,[]);
const a=generatePerformance(options), b=generatePerformance({...options,seed:2});
assert(a.ok && b.ok && JSON.stringify(a.notes)!==JSON.stringify(b.notes));
const s=generatePerformance({...options,swing:true,sectionSwing:false});
assert.strictEqual(s.swing,false);
assert.deepStrictEqual(s,generatePerformance({...options,swing:false,sectionSwing:false}));
assert.deepStrictEqual(generatePerformance({...options,swing:false,sectionSwing:true}),generatePerformance({...options,swing:true,sectionSwing:true}));
console.log(`performance prototype: ${successes}/${cases} feasible; determinism, bounds, harmony, hands, swing and errors passed`);
