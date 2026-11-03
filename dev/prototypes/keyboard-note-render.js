'use strict';
// Shared experimental preview/playback representation. The draft already
// contains swing in beat positions; the renderer must never swing it again.
const {validate}=require('./keyboard-note-draft');
function planCell(draft,key,{duration,span,denominator}){
 const model=validate(draft), cell=model.cells.find(c=>c.key===key);
 if(!cell)throw new Error('Unknown cell');
 if(cell.status==='preserved')return null;
 if(!Number.isFinite(duration)||duration<=0||!Number.isFinite(span)||span<=0||!Number.isFinite(denominator)||denominator<=0)throw new TypeError('Invalid timing');
 const factor=4/denominator;
 if(Math.abs(span*factor-cell.beats)>1e-8)throw new Error('Cell duration changed');
 const secondsPerQuarter=duration/cell.beats;
 // Existing consumers treat an empty array as “no planner” and play a
 // fallback chord; an explicit empty step represents a deliberate rest.
 if(!cell.notes.length)return [{index:0,stepIndex:0,at:0,dur:duration,notes:[],gain:1,source:'cell',type:'experimental-note'}];
 // The preview scheduler expects chronological steps. Keep the original
 // index for stable editing while sorting independent of insertion order.
 return cell.notes.map((n,i)=>({index:i,stepIndex:i,at:n.beat*secondsPerQuarter,dur:n.duration*secondsPerQuarter,notes:[n.midi],gain:n.velocity/100,source:'cell',type:'experimental-note'})).sort((a,b)=>a.at-b.at || a.index-b.index);
}
module.exports={planCell};
