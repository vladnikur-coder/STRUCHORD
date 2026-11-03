'use strict';
// Aggregate-only research aid. Supply a directory of licensed MIDI files.
// Never copies the MIDI files or stores their note sequences in the repository.
const fs = require('fs');
const path = require('path');
const {parseMidi} = require('midi-file');
const root = process.argv[2];
if (!root) { console.error('Usage: node dev/tools/keyboard-midi-summary.js <midi-directory>'); process.exit(2); }
function files(dir) {
  return fs.readdirSync(dir, {withFileTypes:true}).flatMap(e => e.isDirectory() ? files(path.join(dir,e.name)) : /\.midi?$/i.test(e.name) ? [path.join(dir,e.name)] : []);
}
const stats = {files:0, notes:0, noteTracks:{}, channels:{}, sections:{}, velocity:Array(13).fill(0), errors:[]};
const lengths=[], onsetGroupSizes=[], interGestures=[], velocities=[];
for (const file of files(root)) {
  try {
    const midi = parseMidi(fs.readFileSync(file));
    const ppq = midi.header.ticksPerBeat;
    if (!ppq) throw Error('SMPTE division unsupported');
    let noteTracks=0, end=0, notes=0;
    const channels = new Set(), onsets=[];
    for (const track of midi.tracks) {
      let tick=0, hasNotes=false;
      const open=new Map();
      for (const e of track) {
        tick += e.deltaTime;
        const key=e.channel+':'+e.noteNumber;
        if (e.type === 'noteOn' && e.velocity > 0) {
          notes++; hasNotes=true; channels.add(e.channel); onsets.push(tick);
          stats.velocity[Math.floor(e.velocity / 10)]++; velocities.push(e.velocity);
          const queue=open.get(key)||[];queue.push(tick);open.set(key,queue);
        } else if (e.type === 'noteOff' || (e.type === 'noteOn' && e.velocity === 0)) {
          const queue=open.get(key)||[];
          if (queue.length) lengths.push((tick-queue.shift())/ppq);
        }
      }
      end=Math.max(end,tick);
      if (hasNotes) noteTracks++;
    }
    // Nearby attacks within 0.04 quarter notes, not proof of simultaneous
    // fingering; track boundaries are deliberately ignored here.
    onsets.sort((a,b)=>a-b);
    let groupStart=null, groupSize=0;
    for (const t of onsets) {
      if (groupStart===null || t-groupStart>ppq*.04) {
        if (groupSize) { onsetGroupSizes.push(groupSize); interGestures.push((t-groupStart)/ppq); }
        groupStart=t; groupSize=0;
      }
      groupSize++;
    }
    if (groupSize) onsetGroupSizes.push(groupSize);
    stats.files++; stats.notes += notes;
    stats.noteTracks[noteTracks]=(stats.noteTracks[noteTracks]||0)+1;
    stats.channels[channels.size]=(stats.channels[channels.size]||0)+1;
    const role=((path.basename(file).match(/_(Intro|Verse|Chorus|Bridge)_/i)||[])[1]||'other').toLowerCase();
    const row=stats.sections[role]||(stats.sections[role]={files:0,notes:0,quarterNotes:0});
    row.files++; row.notes+=notes; row.quarterNotes+=end/ppq;
  } catch (e) { stats.errors.push({file:path.relative(root,file),message:e.message}); }
}
for (const row of Object.values(stats.sections)) row.notesPerQuarter=row.quarterNotes ? +(row.notes/row.quarterNotes).toFixed(2) : null;
function quartiles(values) {
  values.sort((a,b)=>a-b);
  return values.length ? [0.25,0.5,0.75].map(p=>+values[Math.floor((values.length-1)*p)].toFixed(4)) : [];
}
stats.durationQuarterNoteQuartiles=quartiles(lengths);
stats.onsetGroupSizeQuartiles=quartiles(onsetGroupSizes);
stats.interGestureQuarterNoteQuartiles=quartiles(interGestures);
stats.velocityQuartiles=quartiles(velocities);
console.log(JSON.stringify(stats,null,2));
if (stats.errors.length) process.exitCode=1;
