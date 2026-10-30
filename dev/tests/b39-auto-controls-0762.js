'use strict';
// 0.762 stores individual notes, not the old token-only auto UI. Keep the
// protections as focused end-to-end tests against the live application.
const {spawnSync}=require('child_process');const path=require('path');
for(const file of ['b39-note-swing-candidate.js','b39-note-editor-candidate.js','b39-note-priority-candidate.js','b39-note-presets-candidate.js','b39-note-fit-candidate.js','b39-auto-0714.js']){
 const result=spawnSync(process.execPath,[path.join(__dirname,file)],{stdio:'inherit',env:process.env});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);
}
console.log('Auto controls 0.762: inheritance, edits, manual protection, legacy presets and history — OK');
