'use strict';

// Research prototype only: it is not connected to STRUCHORD's player or UI.
// Original procedural rules; no source MIDI phrases are embedded here.
const {planSequence} = require('./keyboard-hand-voicings');
const GENRES = Object.freeze({
  pop:     {chord:0.43, arp:0.23, offbeat:0.18, length:0.70},
  rock:    {chord:0.57, arp:0.08, offbeat:0.10, length:0.56},
  punk:    {chord:0.69, arp:0.03, offbeat:0.15, length:0.40},
  country: {chord:0.38, arp:0.26, offbeat:0.12, length:0.52},
  blues:   {chord:0.43, arp:0.16, offbeat:0.20, length:0.58},
  jazz:    {chord:0.30, arp:0.16, offbeat:0.32, length:0.52},
  soul:    {chord:0.32, arp:0.21, offbeat:0.22, length:0.78},
  funk:    {chord:0.42, arp:0.08, offbeat:0.37, length:0.32},
  fusion:   {chord:0.38, arp:0.24, offbeat:0.30, length:0.48}
});
const ROLE = Object.freeze({intro:0.72, verse:0.82, prechorus:1.0, chorus:1.16, bridge:0.94, solo:0.72, outro:0.62, custom:0.9});
const METERS = Object.freeze({'4/4':4, '3/4':3, '6/8':3}); // quarter-note beats per measure
function rng(seed) {
  let n = seed >>> 0;
  return function () { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n / 4294967296; };
}
function motifRandom(seed, step, beatsPerBar, lane) {
  const barSteps=Math.round(beatsPerBar*4), bar=Math.floor(step/barSteps), position=step%barSteps;
  // Repeat the core gesture each bar; the second bar can answer on its last
  // beat. A reproducible variation makes the result less like white noise.
  const answer=(bar%2===1 && position>=barSteps-4) ? 1 : 0;
  let n=(seed ^ Math.imul(position+1,0x9e3779b1) ^ Math.imul(lane+1,0x85ebca6b) ^ Math.imul(answer,0xc2b2ae35))>>>0;
  n^=n>>>16; n=Math.imul(n,0x7feb352d); n^=n>>>15; n=Math.imul(n,0x846ca68b); n^=n>>>16;
  return (n>>>0)/4294967296;
}
function swingAt(step, enabled) {
  // Sixteenth-note grid with the second eighth delayed to 2/3 of a beat;
  // intermediate sixteenths are interpolated. In 6/8 this remains a research
  // approximation, not a claim about every compound-metre style.
  const offsets=enabled ? [0,1/3,2/3,5/6] : [0,1/4,1/2,3/4];
  return Math.floor(step/4)+offsets[step%4];
}
function resolveSwing(global, section) {
  if (typeof global !== 'boolean' || !(section === null || section === undefined || typeof section === 'boolean')) throw new TypeError('Invalid swing');
  return section == null ? global : section;
}
function generatePerformance(options) {
  const o = options || {};
  const {chords, low, high, bpm, meter, genre, secondary, role, swing, sectionSwing, seed} = o;
  if (!Array.isArray(chords) || !chords.length || !Number.isFinite(bpm) || bpm < 30 || bpm > 300 ||
      !Object.hasOwn(METERS, meter) || !Object.hasOwn(GENRES, genre) ||
      (secondary && (!Object.hasOwn(GENRES, secondary) || secondary === genre)) ||
      !Object.hasOwn(ROLE, role) || !Number.isInteger(seed) || typeof swing !== 'boolean') throw new TypeError('Invalid performance request');
  const useSwing = resolveSwing(swing, sectionSwing), human = rng(seed ^ 0x6d2b79f5), beatsPerBar = METERS[meter];
  let beat = 0;
  const notes = [], decisions = [], gestures = [];
  // Look ahead through the whole phrase rather than greedily choosing each
  // chord. Bounds are heuristics, not a physical fingering model.
  for (const chord of chords) {
    if (!chord || !Number.isFinite(chord.beats) || chord.beats < 0.25 || chord.beats > 32 || chord.beats * 4 !== Math.round(chord.beats * 4)) throw new TypeError('Chord duration must be sixteenth-note aligned');
  }
  const planned=planSequence({chords,low,high,bpm});
  if (!planned.ok) return {ok:false,reason:planned.reason,chordIndex:planned.chordIndex,notes:[],decisions:[]};
  const voices=planned.voices;
  for (let index = 0; index < chords.length; index++) {
    const chord = chords[index];
    const start = beat, end = beat + chord.beats, voice = voices[index], nextVoice = voices[index+1];
    function center(v) { return (v[0] + v[v.length-1]) / 2; }
    function releaseLimit(hand) {
      if (!nextVoice) return end;
      const distance = Math.abs(center(voice[hand]) - center(nextVoice[hand]));
      const gapSeconds = distance ? Math.max(0.06, distance / 20) : 0;
      return Math.max(start, end - gapSeconds * bpm / 60);
    }
    const releases = {left:releaseLimit('left'), right:releaseLimit('right')};
    if (releases.left <= start || releases.right <= start) return {ok:false,reason:'not-enough-transition-time',chordIndex:index,notes:[],decisions:[]};
    const notesBefore = notes.length;
    decisions.push({chordIndex:index, beat:start, left:voice.left.slice(), right:voice.right.slice(), omitted:voice.omitted.slice(), releases});
    // Positions are computed from the global grid so swing does not restart at
    // each chord. Sixteenth alignment is required rather than rounded silently.
    const firstStep = Math.round(start * 4), finalStep = Math.round(end * 4);
    for (let step = firstStep; step < finalStep; step++) {
      const at = swingAt(step, useSwing), next = Math.min(end, swingAt(step + 1, useSwing));
      if (at >= end || next <= at) continue;
      const local = at % beatsPerBar;
      const downbeat = Math.abs(local) < 1e-9;
      const compoundMiddle = meter === '6/8' && step % 12 === 6;
      const bassBeat = downbeat || compoundMiddle || (meter !== '6/8' && Math.abs(local - Math.floor(beatsPerBar / 2)) < 1e-9);
      const isSixteenth = step % 2 === 1, isOff = step % 4 !== 0;
      const profile = secondary && local >= beatsPerBar - 1 ? GENRES[secondary] : GENRES[genre];
      const strength = ROLE[role], strong = downbeat ? 1 : (bassBeat ? 0.65 : 0.2);
      const sectionStart = step === firstStep;
      const choose = lane => motifRandom(seed,step,beatsPerBar,lane);
      const left = sectionStart || (bassBeat && choose(0) < Math.min(0.95, 0.57 * strength));
      let rightMode = null;
      // Sparse sixteenth-note gestures, reduced at very high tempos. This is
      // deliberately a simple heuristic and is not transcribed from MIDI.
      const sixteenthScale = bpm > 160 ? 0 : 0.30;
      const baseline=isSixteenth ? (sixteenthScale ? 0.11 : 0) : isOff ? 0.33 : 0.62;
      const probability = Math.min(0.9, Math.max(baseline*strength,(isSixteenth ? profile.offbeat*sixteenthScale : isOff ? profile.offbeat*1.4 : profile.chord*1.15)*strength) + strong*0.10);
      const roll = choose(1), anchor = step % 8 === 0 && !isSixteenth;
      if (roll < probability || sectionStart || anchor) {
        rightMode = isSixteenth && !sectionStart ? 'single' : (choose(2)<0.52 && voice.right.length>2 ? 'partial' : 'chord');
      } else if (choose(3) < profile.arp * 1.2 * strength * (isSixteenth ? sixteenthScale : 1)) rightMode = 'single';
      const baseDuration = Math.max(0.01, (isSixteenth ? next-at : swingAt(step+2,useSwing)-at)*profile.length);
      const emit = (hand, pitches, base) => {
        const gesture = {hand, chordIndex:index, notes:[], hold:human(), release:releases[hand]};
        for (let k=0; k<pitches.length; k++) {
          // Subtle variation only; note order and duration remain bounded to
          // this grid slot. Explicit hand identity survives in the prototype.
          const offset = Math.min(0.012 * bpm / 60, (next-at) * 0.05) * human();
          const on = at + offset;
          // One hand gesture has a shared base duration; a small difference
          // between notes avoids a mechanically identical note-off. Bass and
          // weaker beats can be shorter, but no note crosses the next slot.
          const articulation = (hand==='left' ? 0.82 : 0.90) + human()*0.20;
          const dur = Math.min(baseDuration*articulation, releases[hand]-on, end-on);
          if (dur <= 0) continue;
          const velocity = Math.max(1, Math.min(127, Math.round(base + (strength-1)*12 + strong*11 + (human()-0.5)*20 - k*1.5)));
          const note={hand, midi:pitches[k], beat:on, duration:dur, velocity, chordIndex:index};
          notes.push(note); gesture.notes.push(note);
        }
        if (gesture.notes.length) gestures.push(gesture);
      };
      if (left) emit('left',voice.left,68);
      if (rightMode === 'chord') {
        // A doubled triad can use both octaves over time without forcing four
        // simultaneous notes into every gesture or overloading one hand.
        const hand=voice.right.length>3 && chord.tones.length===3 ? (choose(5)<.5?voice.right.slice(0,3):voice.right.slice(-3)) : voice.right;
        emit('right',hand,74);
      }
      else if (rightMode === 'partial') {
        const startIndex=Math.floor(choose(4)*(voice.right.length-1));
        emit('right',voice.right.slice(startIndex,startIndex+2),72);
      } else if (rightMode === 'single') emit('right',[voice.right[Math.floor(choose(4)*voice.right.length)]],66);
    }
    const emitted = notes.slice(notesBefore);
    if (!emitted.some(n => n.hand === 'left') || !emitted.some(n => n.hand === 'right')) return {ok:false,reason:'not-enough-transition-time',chordIndex:index,notes:[],decisions:[]};
    beat = end;
  }
  // Some gestures sustain through an unused grid slot until the next gesture
  // of the same hand. Never cross a chord boundary, the next attack, or the
  // movement release limit. This is articulation, not sustain-pedal modelling.
  for (const hand of ['left','right']) {
    const gs=gestures.filter(g=>g.hand===hand);
    for (let i=0;i<gs.length;i++) {
      const g=gs[i], next=gs[i+1], cutoff=Math.min(g.release,next ? Math.min(...next.notes.map(n=>n.beat)) : g.release);
      const holdProbability = hand==='left' ? 0.65 : ((genre==='funk' || genre==='punk') ? 0.18 : 0.48);
      const factor=0.72+g.hold*0.22;
      for (const n of g.notes) {
        const available=cutoff-n.beat;
        n.duration=Math.min(n.duration,available);
        if (g.hold < holdProbability && available > n.duration) n.duration=Math.max(n.duration,Math.min(1.25,available*factor));
      }
    }
  }
  notes.sort((a,b) => a.beat-b.beat || a.midi-b.midi);
  return {ok:true, notes, decisions, beats:beat, swing:useSwing};
}
module.exports = {generatePerformance, resolveSwing, GENRES, METERS};
