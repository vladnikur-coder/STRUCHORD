'use strict';
const assert = require('assert');
const {planVoicing,planSequence} = require('../prototypes/keyboard-hand-voicings');
const mod = n => ((n % 12) + 12) % 12;
function check(v, low, high, bass, chord) {
  assert(v, 'expected a feasible candidate');
  assert.strictEqual(v.left.length, 1);
  assert(v.right.length <= 4 && v.right.length > 0);
  assert(v.right[v.right.length - 1] - v.right[0] <= 12);
  assert(v.left[0] < v.right[0]);
  assert.strictEqual(mod(v.left[0]), mod(bass));
  for (const n of [...v.left, ...v.right]) assert(n >= low && n <= high);
  for (const n of v.right) assert(chord.map(mod).includes(mod(n)));
}
let count = 0;
for (const [low, high] of [[48,72], [42,78], [36,84], [24,84], [21,108]]) {
  for (let root = 0; root < 12; root++) {
    for (const intervals of [[0,4,7], [0,3,7], [0,4,10,2,7], [0,3,10,2,7]]) {
      const tones = intervals.map(n => mod(root + n));
      const v = planVoicing({low, high, bassPc: root, tones});
      if (v) { check(v, low, high, root, tones); count++; }
      assert.deepStrictEqual(v, planVoicing({low, high, bassPc: root, tones}));
    }
  }
}
assert(count > 200);
const a = planVoicing({low:36,high:96,bassPc:0,tones:[0,4,7]});
const b = planVoicing({low:36,high:96,bassPc:9,tones:[9,0,4],previous:a,seconds:2});
check(b,36,96,9,[9,0,4]);
const slash = planVoicing({low:36,high:96,bassPc:4,tones:[0,4,7]});
check(slash,36,96,4,[0,4,7]);
assert.strictEqual(planVoicing({low:60,high:60,bassPc:0,tones:[0,4,7]}),null);
assert.throws(() => planVoicing({low:0,high:127,bassPc:0,tones:[0,4,7],previous:a,seconds:0}), TypeError);
assert.strictEqual(planVoicing({low:36,high:96,bassPc:6,tones:[6,10,1],previous:{left:[36],right:[60,64,67]},seconds:0.01}),null);
const rich = planVoicing({low:36,high:96,bassPc:0,tones:[0,4,10,2,7,5]});
assert.deepStrictEqual(rich.omitted,[7,5]);
const seq=planSequence({low:48,high:72,bpm:90,chords:[{bassPc:0,tones:[0,4,7],beats:.5},{bassPc:9,tones:[9,0,4],beats:.5},{bassPc:5,tones:[5,9,0],beats:.5},{bassPc:7,tones:[7,11,2],beats:.5}]});
assert(seq.ok, 'lookahead finds a path on a short keyboard');
assert.strictEqual(seq.voices.length,4);
for (let i=0;i<seq.voices.length;i++) check(seq.voices[i],48,72,[0,9,5,7][i],[[0,4,7],[9,0,4],[5,9,0],[7,11,2]][i]);
assert.throws(()=>planSequence({chords:[],low:48,high:72,bpm:90}),TypeError);
console.log(`prototype checks passed: ${count} feasible range/chord combinations, determinism, transitions, slash bass and failures`);
