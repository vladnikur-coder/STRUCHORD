'use strict';

// Research prototype only; it is not used by STRUCHORD. All limits and
// movement costs are conservative engineering hypotheses, not guarantees of
// piano fingering or human playability.
function mod12(n) { return ((n % 12) + 12) % 12; }
function enumerateHand(pcs, low, high, maxSpan) {
  const choices = pcs.map(pc => {
    const a = [];
    for (let n = low; n <= high; n++) if (mod12(n) === pc) a.push(n);
    return a;
  });
  const seen = new Set(), out = [];
  function visit(i, notes) {
    if (i === choices.length) {
      const sorted = notes.slice().sort((a, b) => a - b);
      if (new Set(sorted).size !== sorted.length || sorted[sorted.length - 1] - sorted[0] > maxSpan) return;
      const sig = sorted.join(',');
      if (!seen.has(sig)) { seen.add(sig); out.push(sorted); }
      return;
    }
    for (const n of choices[i]) visit(i + 1, notes.concat(n));
  }
  visit(0, []);
  return out;
}
function movement(a, b) {
  const d = Array.from({length: a.length + 1}, () => Array(b.length + 1).fill(Infinity));
  d[0][0] = 0;
  for (let i = 0; i <= a.length; i++) for (let j = 0; j <= b.length; j++) {
    if (i < a.length) d[i + 1][j] = Math.min(d[i + 1][j], d[i][j] + 6);
    if (j < b.length) d[i][j + 1] = Math.min(d[i][j + 1], d[i][j] + 6);
    if (i < a.length && j < b.length) d[i + 1][j + 1] = Math.min(d[i + 1][j + 1], d[i][j] + Math.abs(a[i] - b[j]));
  }
  return d[a.length][b.length];
}
function center(notes) { return (notes[0] + notes[notes.length-1]) / 2; }
function candidates({low, high, bassPc, tones, shape, strictShape, preferDoubling}) {
  if (!Number.isInteger(low) || !Number.isInteger(high) || low < 0 || high > 127 || low > high ||
      !Number.isInteger(bassPc) || !Array.isArray(tones) || !tones.length) throw new TypeError('Invalid voicing request');
  const pcs = [];
  for (const pc of tones) {
    if (!Number.isInteger(pc)) throw new TypeError('Invalid chord tone');
    const p = mod12(pc); if (!pcs.includes(p)) pcs.push(p);
  }
  const selected=Array.isArray(shape) ? Array.from(new Set(shape)).sort((a,b)=>a-b) : [];
  if (strictShape) {
    if (selected.length < 2 || selected.length > 6 || selected.some(n=>!Number.isInteger(n) || n<low || n>high)) return [];
    const right=selected.slice(1);
    if (right[right.length-1]-right[0]>12) return [];
    return [{left:[selected[0]],right,omitted:[],cost:0}];
  }
  const basses = [];
  for (let n = low; n <= Math.min(high, 60); n++) if (mod12(n) === mod12(bassPc)) basses.push(n);
  const out=[];
  // Preserve the caller's priority order, preferring all of the first four
  // pitches, but allow fewer when the keyboard or a transition demands it.
  for (let count=Math.min(4,pcs.length); count>=Math.min(2,pcs.length); count--) {
    const base=pcs.slice(0,count), choices=[base];
    // A triad can double its root in another octave, within the same hand span.
    if (count===3 && pcs.length===3) choices.push(base.concat(base[0]));
    for (const choice of choices) for (const right of enumerateHand(choice,low,high,12)) for (const bass of basses) {
      if (bass >= right[0]) continue;
      const omitted=pcs.slice(count);
      const target=selected.length>1 ? center(selected.slice(1)) : Math.min(high,Math.max(low,64));
      const shapeCost=selected.length>1 ? movement(selected.slice(1),right)*0.35 + Math.abs(selected[0]-bass)*0.15 : 0;
      const doubleBonus=choice.length>base.length ? (preferDoubling ? 70 : -12) : 0;
      const cost=Math.abs(center(right)-target)*0.8 + Math.abs(bass-43)*0.35 + (Math.min(4,pcs.length)-count)*14 + shapeCost-doubleBonus;
      out.push({left:[bass],right,omitted,cost});
    }
  }
  out.sort((a,b)=>a.cost-b.cost || a.left[0]-b.left[0] || a.right.join(',').localeCompare(b.right.join(',')));
  // Keep the search bounded. Not a proof that no valid alternative exists.
  return out.slice(0,120);
}
function transition(a,b,seconds) {
  const reach=Math.max(2,20*seconds);
  if (Math.abs(center(a.right)-center(b.right))>reach || Math.abs(a.left[0]-b.left[0])>reach) return Infinity;
  return movement(a.right,b.right)*2+Math.abs(a.left[0]-b.left[0])*1.5;
}
function clean(v) { return {left:v.left.slice(),right:v.right.slice(),omitted:v.omitted.slice()}; }
function planVoicing(options) {
  const {previous,seconds}=options||{};
  if (previous && (!Number.isFinite(seconds) || seconds <= 0)) throw new TypeError('Invalid transition time');
  let best=null,bestCost=Infinity;
  for (const v of candidates(options||{})) {
    const cost=v.cost+(previous?transition(previous,v,seconds):0);
    if (cost<bestCost) {best=v;bestCost=cost;}
  }
  return best?clean(best):null;
}
function planSequence({chords,low,high,bpm,seed}) {
  if (!Array.isArray(chords) || !chords.length || chords.length>256 || !Number.isFinite(bpm) || bpm<=0) throw new TypeError('Invalid sequence');
  const layers=[];
  for (let i=0;i<chords.length;i++) {
    const chord=chords[i];
    // Stable per-cell variation: doubling is encouraged for some cells, not all.
    const preferDoubling=Number.isInteger(seed) && ((i + (seed >>> 0)) % 3 === 0);
    const list=candidates({low,high,bassPc:chord.bassPc,tones:chord.tones,shape:chord.shape,strictShape:chord.strictShape,preferDoubling});
    if (!list.length) return {ok:false,reason:'no-playable-candidate',chordIndex:i};
    const layer=[];
    if (!i) for (const v of list) layer.push({v,total:v.cost,previous:-1});
    else {
      const before=layers[i-1], sec=chords[i-1].beats*60/bpm;
      if (!Number.isFinite(sec) || sec<=0) throw new TypeError('Invalid chord duration');
      for (const v of list) {
        let best=Infinity, pick=-1;
        for (let j=0;j<before.length;j++) {
          const value=before[j].total+transition(before[j].v,v,sec)+v.cost;
          if (value<best) {best=value;pick=j;}
        }
        if (pick>=0) layer.push({v,total:best,previous:pick});
      }
    }
    if (!layer.length) return {ok:false,reason:'no-playable-transition',chordIndex:i};
    layers.push(layer);
  }
  let idx=0;const last=layers[layers.length-1];
  for(let i=1;i<last.length;i++) if(last[i].total<last[idx].total) idx=i;
  const result=Array(layers.length);
  for(let i=layers.length-1;i>=0;i--){const item=layers[i][idx];result[i]=clean(item.v);idx=item.previous;}
  return {ok:true,voices:result};
}
module.exports = {planVoicing,planSequence};
