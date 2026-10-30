'use strict';
// Experimental bridge shape for application work; no STRUCHORD changes.
// A caller supplies already-resolved cells, not MIDI phrases. Unknown input
// fails atomically; explicit manual/rest cells are not changed.
const {generatePerformance} = require('./keyboard-performance');
function formulaToChord(formula) {
  if (!formula || !Number.isInteger(formula.rootPc) || !Array.isArray(formula.tones) || !formula.tones.length ||
      (formula.bass && !Number.isInteger(formula.bass.pitchClass))) throw new TypeError('Invalid chord formula');
  function rank(degree) {
    const d=String(degree||'');
    if (d==='1') return 0;
    if (d==='3' || d==='b3' || d==='2' || d==='4') return 1;
    if (d==='7' || d==='b7') return 2;
    if (d==='#5' || d==='b5') return 3;
    if (['6','b6','9','b9','#9','13','b13'].includes(d)) return 4;
    if (d==='5') return 5;
    if (d==='11' || d==='#11') return 6;
    return 7;
  }
  const tones=formula.tones.map((t,i)=>{
    if (!t || !Number.isInteger(t.pitchClass)) throw new TypeError('Invalid chord tone');
    return {pc:((t.pitchClass%12)+12)%12, rank:rank(t.degree),i};
  }).sort((a,b)=>a.rank-b.rank || a.i-b.i).map(t=>t.pc);
  return {bassPc:((formula.bass ? formula.bass.pitchClass : formula.rootPc)%12+12)%12,tones};
}
function buildSection(options) {
  const o=options||{}, cells=o.cells;
  if (!Array.isArray(cells) || !cells.length || !Number.isInteger(o.seed) || !Number.isInteger(o.low) || !Number.isInteger(o.high) || o.low<0 || o.high>127 || o.low>o.high || !Number.isFinite(o.bpm) || o.bpm<30 || o.bpm>300) throw new TypeError('Invalid section');
  const keys=new Set(), items=[];
  for (const cell of cells) {
    if (!cell || typeof cell.key!=='string' || !cell.key || keys.has(cell.key) ||
        !Number.isFinite(cell.beats) || cell.beats<.25 || cell.beats>32 || cell.beats*4!==Math.round(cell.beats*4)) throw new TypeError('Invalid cell');
    keys.add(cell.key);
    if (cell.manual === true || cell.rest === true) items.push({type:'preserve',cell});
    else {
      if (!cell.chord || !Number.isInteger(cell.chord.bassPc) || !Array.isArray(cell.chord.tones) || !cell.chord.tones.length) throw new TypeError('Unresolved chord');
      items.push({type:'generate',cell});
    }
  }
  const result={}, decisions={}, preserved=[];
  for (let i=0;i<items.length;) {
    if (items[i].type==='preserve') {preserved.push(items[i].cell.key);i++;continue;}
    let j=i;while(j<items.length && items[j].type==='generate')j++;
    const part=items.slice(i,j);
    const chords=part.map(({cell})=>({bassPc:cell.chord.bassPc,tones:cell.chord.tones.slice(),beats:cell.beats}));
    const gen=generatePerformance({chords,low:o.low,high:o.high,bpm:o.bpm,meter:o.meter,genre:o.genre,secondary:o.secondary,role:o.role,swing:o.swing,sectionSwing:o.sectionSwing,seed:(o.seed+i)|0});
    if(!gen.ok) return {ok:false,reason:gen.reason,cellKey:part[gen.chordIndex].cell.key,events:{},decisions:{},preserved:[]};
    let start=0;
    for(let n=0;n<part.length;n++) {
      const cell=part[n].cell;
      result[cell.key]=gen.notes.filter(e=>e.chordIndex===n).map(e=>({hand:e.hand,midi:e.midi,beat:e.beat-start,duration:e.duration,velocity:e.velocity}));
      decisions[cell.key]=gen.decisions[n];
      start+=cell.beats;
    }
    i=j;
  }
  return {ok:true,events:result,decisions,preserved};
}
module.exports={buildSection,formulaToChord};
