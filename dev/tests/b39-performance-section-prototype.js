'use strict';
const assert=require('assert');
const {buildSection}=require('../prototypes/keyboard-section-adapter');
const options={low:36,high:96,bpm:90,meter:'4/4',genre:'pop',role:'verse',swing:false,sectionSwing:null,seed:123,
  cells:[{key:'1:1:0',beats:4,chord:{bassPc:0,tones:[0,4,7]}},
    {key:'1:1:1',beats:4,chord:{bassPc:9,tones:[9,0,4]}},
    {key:'1:2:0',beats:4,manual:true,chord:{bassPc:5,tones:[5,9,0]}},
    {key:'1:2:1',beats:4,rest:true},
    {key:'1:3:0',beats:4,chord:{bassPc:7,tones:[7,11,2]}}]};
const before=JSON.stringify(options), out=buildSection(options);
assert(out.ok);assert.strictEqual(JSON.stringify(options),before);
assert.deepStrictEqual(out.preserved,['1:2:0','1:2:1']);
assert.deepStrictEqual(Object.keys(out.events),['1:1:0','1:1:1','1:3:0']);
for(const cell of options.cells.filter(c=>!c.manual&&!c.rest)) for(const n of out.events[cell.key]) {
  assert(n.beat>=0 && n.beat+n.duration<=cell.beats+1e-8);
  assert(n.hand==='left' ? n.midi%12===cell.chord.bassPc : cell.chord.tones.includes(n.midi%12));
}
assert.deepStrictEqual(out,buildSection(options));
assert.throws(()=>buildSection({...options,cells:options.cells.concat(options.cells[0])}));
assert.throws(()=>buildSection({...options,cells:[{key:'x',beats:.375,rest:true}]}));
assert.throws(()=>buildSection({...options,seed:undefined}));
const bad=buildSection({...options,low:60,high:60});
assert(!bad.ok);assert.deepStrictEqual(bad.events,{});assert.deepStrictEqual(bad.decisions,{});
assert.strictEqual(bad.cellKey,'1:1:0');
console.log('Section prototype: cell boundaries, chords, manual/rest preservation, atomic failure and determinism passed');
