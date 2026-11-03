'use strict';
const assert=require('assert');const {generatePerformance,GENRES}=require('../prototypes/keyboard-performance');
const chords=[[0,[0,4,7],[36,48,52,55]],[9,[9,0,4],[45,48,52,57]],[5,[5,9,0],[41,48,53,57]],[7,[7,11,2],[43,50,55,59]]].map(([bassPc,tones,shape])=>({bassPc,tones,shape,beats:4}));
let count=0;for(const rhythmVersion of [1,2])for(const role of ['verse','chorus'])for(const bpm of [90,120,150,180])for(const genre of Object.keys(GENRES))for(const seed of [1,2,3,4,5,6,7,8,9,10]){
 const o=generatePerformance({chords,low:36,high:96,bpm,meter:'4/4',genre,role,swing:false,seed,rhythmVersion});assert(o.ok);
 for(const d of o.decisions){assert(d.left.length===1&&d.right.length<=4);assert(d.right.at(-1)-d.right[0]<=12);if(role==='verse'||bpm>140)assert(d.right.length<=3,'no artificial doubled grips in quiet or fast sections');}
 for(const n of o.notes){const active=o.notes.filter(m=>m.beat<=n.beat && n.beat<m.beat+m.duration-1e-9);const left=active.filter(m=>m.hand==='left'),right=active.filter(m=>m.hand==='right');assert(left.length<=1&&right.length<=4);if(bpm>160)assert(right.length<=2,'fast passages use at most two simultaneous right-hand notes');if(right.length>1)assert(Math.max(...right.map(x=>x.midi))-Math.min(...right.map(x=>x.midi))<=12);if(left.length&&right.length)assert(left[0].midi<Math.min(...right.map(x=>x.midi)));}
 count++;
}
const chorus=generatePerformance({chords,low:36,high:96,bpm:120,meter:'4/4',genre:'pop',role:'chorus',swing:false,seed:2});assert(chorus.decisions.some(d=>d.right.length===4),'fuller chorus remains possible');assert(chorus.decisions.some(d=>d.right.length<4),'fuller voicings are not mandatory');console.log(`Accompaniment hand/density checks: ${count} role/tempo/genre/seed scenarios — OK (heuristics, not a pianist review)`);
