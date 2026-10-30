'use strict';
// Experimental editable per-note representation. Not wired to the app.
// Times are quarter-note beats local to a cell, including any generated swing.
// A consumer must not apply swing again. Never silently quantize or clip notes.
const VERSION=1, MAX_CELLS=2048, MAX_NOTES_PER_CELL=1024, EPS=1e-8;
const clone=x=>JSON.parse(JSON.stringify(x));
function validKey(key){return typeof key==='string' && key.length>0 && key.length<=256 && key!=='__proto__' && key!=='constructor' && key!=='prototype';}
function cellSpec(c){
 if(!c || !validKey(c.key) || !Number.isFinite(c.beats) || c.beats<=0 || c.beats>32) throw new TypeError('Invalid cell');
 return {key:c.key,beats:c.beats};
}
function note(n,beats){
 if(!n || !Number.isInteger(n.midi) || n.midi<0 || n.midi>127 || !Number.isFinite(n.beat) || n.beat<0 || n.beat>=beats ||
    !Number.isFinite(n.duration) || n.duration<=0 || n.beat+n.duration>beats+EPS || !Number.isInteger(n.velocity) || n.velocity<1 || n.velocity>127 || !['left','right'].includes(n.hand)) throw new TypeError('Invalid note');
 return {midi:n.midi,beat:n.beat,duration:n.duration,velocity:n.velocity,hand:n.hand};
}
function notesOf(arr,beats){if(!Array.isArray(arr)||arr.length>MAX_NOTES_PER_CELL)throw new TypeError('Invalid notes');return arr.map(n=>note(n,beats));}
function validate(raw){
 if(!raw || raw.version!==VERSION || !Number.isSafeInteger(raw.revision) || raw.revision<0 || !Array.isArray(raw.cells) || raw.cells.length>MAX_CELLS) throw new TypeError('Invalid draft');
 const seen=new Set();
 const cells=raw.cells.map(c=>{const base=cellSpec(c);if(seen.has(base.key))throw new TypeError('Duplicate cell');seen.add(base.key);
   if(!['generated','manual','preserved'].includes(c.status))throw new TypeError('Invalid cell status');
   if(c.status==='preserved' && c.notes!==null)throw new TypeError('Preserved cell has no editable notes');
   return {...base,status:c.status,notes:c.status==='preserved'?null:notesOf(c.notes,base.beats)};
 });
 return {version:VERSION,revision:raw.revision,cells};
}
function create(specs,result){
 if(!Array.isArray(specs)||!result||result.ok!==true||!result.events||!Array.isArray(result.preserved))throw new TypeError('Invalid generation');
 const preserved=new Set(result.preserved), keys=new Set(specs.map(c=>c.key));
 if(preserved.size!==result.preserved.length || [...preserved].some(k=>!keys.has(k)) || Object.keys(result.events).some(k=>!keys.has(k)||preserved.has(k)))throw new TypeError('Invalid generation keys');
 const cells=specs.map(c=>{const spec=cellSpec(c);if(preserved.has(spec.key))return {...spec,status:'preserved',notes:null};
   if(!Object.prototype.hasOwnProperty.call(result.events,spec.key))throw new TypeError('Missing generated cell');
   return {...spec,status:'generated',notes:result.events[spec.key]};});
 return validate({version:VERSION,revision:0,cells});
}
function replaceCell(draft,key,rawNotes,expectedRevision){
 const next=validate(draft);if(expectedRevision!==next.revision)throw new Error('Stale draft');
 const c=next.cells.find(c=>c.key===key);if(!c)throw new Error('Unknown cell');
 if(c.status==='preserved')throw new Error('Preserved cell');
 c.notes=notesOf(rawNotes,c.beats);c.status='manual';next.revision++;return next;
}
// Merge only unedited generated cells, after explicit caller confirmation if
// manual cells are to be replaced. Preserved cells are never touched.
function regenerate(draft,result,expectedRevision,replaceManual=false){
 const next=validate(draft);if(expectedRevision!==next.revision)throw new Error('Stale draft');
 if(typeof replaceManual!=='boolean'||!result||result.ok!==true||!result.events||!Array.isArray(result.preserved))throw new TypeError('Invalid generation');
 const byKey=new Map(next.cells.map(c=>[c.key,c])), preserved=new Set(result.preserved);
 if(preserved.size!==result.preserved.length||[...preserved].some(k=>!byKey.has(k))||Object.keys(result.events).some(k=>!byKey.has(k)||preserved.has(k)))throw new TypeError('Invalid generation keys');
 // Validate even ignored data so a malformed generator never partially succeeds.
 const updates=new Map(Object.entries(result.events).map(([k,v])=>[k,notesOf(v,byKey.get(k).beats)]));
 for(const c of next.cells){
   if(c.status==='preserved')continue;
   // A previously generated cell is now manual or empty in the song. The
   // caller must resolve the conflict instead of retaining a stale part.
   if(preserved.has(c.key))throw new Error('Cell source changed');
   if(!updates.has(c.key))throw new TypeError('Missing generated cell');
   if(c.status==='generated'||replaceManual){c.notes=updates.get(c.key);c.status='generated';}
 }
 next.revision++;return next;
}
function snapshot(draft){return clone(validate(draft));}
module.exports={create,replaceCell,regenerate,snapshot,validate};
