'use strict';
// Experimental adapter for the application's cell-pattern storage. It does
// not install a player or editor: never write these patterns into a real song
// until all consumers understand experimental-notes-v1.
const {validate}=require('./keyboard-note-draft');
const TYPE='experimental-notes-v1',MAX_PATTERN_CHARS=32768; // special validated note patterns only
function encode(cell){
 const data={type:TYPE,beats:cell.beats,notes:cell.notes,status:cell.status};
 if(JSON.stringify(data).length>MAX_PATTERN_CHARS)throw new Error('Cell pattern exceeds storage limit');
 return data;
}
function prepare(draft,existing,{replaceManual=false}={}){
 const model=validate(draft);
 if(!existing||typeof existing!=='object'||Array.isArray(existing)||typeof replaceManual!=='boolean')throw new TypeError('Invalid existing patterns');
 const writes=[];
 for(const cell of model.cells){
  if(cell.status==='preserved')continue;
  if(!/^\d+:\d+:\d+$/.test(cell.key))throw new Error('Invalid application cell key');
  const old=Object.prototype.hasOwnProperty.call(existing,cell.key)?existing[cell.key]:null;
  // Never overwrite an existing unrelated pattern without explicit consent.
  if(old && old.type!==TYPE && !replaceManual)throw new Error('Manual pattern conflict: '+cell.key);
  if(old && old.type===TYPE && old.status==='manual' && cell.status==='generated' && !replaceManual)throw new Error('Manual note conflict: '+cell.key);
  writes.push({key:cell.key,pattern:encode(cell)});
 }
 const newKeys=writes.filter(w=>!Object.prototype.hasOwnProperty.call(existing,w.key)).length;
 if(Object.keys(existing).length+newKeys>4096)throw new Error('Track pattern count exceeds storage limit');
 return writes;
}
function decode(specs,patterns){
 if(!Array.isArray(specs)||!patterns||typeof patterns!=='object')throw new TypeError('Invalid stored patterns');
 const cells=specs.map(s=>{const p=patterns[s.key];if(!p||p.type!==TYPE)return {key:s.key,beats:s.beats,status:'preserved',notes:null};
  if(p.beats!==s.beats)throw new Error('Cell duration changed: '+s.key);
  return {key:s.key,beats:s.beats,status:p.status,notes:p.notes};});
 return validate({version:1,revision:0,cells});
}
module.exports={prepare,decode,TYPE,MAX_PATTERN_CHARS};
