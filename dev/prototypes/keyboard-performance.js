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
  hiphop:  {chord:0.52, arp:0.10, offbeat:0.14, length:0.86},
  funk:    {chord:0.42, arp:0.08, offbeat:0.37, length:0.32},
  fusion:   {chord:0.38, arp:0.24, offbeat:0.30, length:0.48}
});
// Two-bar gesture vocabularies authored for this generator, not MIDI phrases.
// C = chord, p = two notes, s = one note, . = space; eighth-note positions.
// The original procedural groove remains one of the available families.
const GROOVES = Object.freeze({
 pop:     ['C.s.p.s.','C.sp..s.','C...p.s.','C.s..ps.'],
 rock:    ['C...C.p.','C.p.C...','C...C..p','C.p.C.p.'],
 punk:    ['C.C.C.C.','C.C.p..C','C..pC.C.','C.C..pC.'],
 country: ['C.s.s.s.','C.ss.s.s','C.s.ps.s','C.ss.s..'],
 blues:   ['C..pC..p','C.p..p.s','C..sC.p.','C.p.s..p'],
 jazz:    ['C..p..p.','C.p..p..','C..p.p..','C...p..p'],
 hiphop:  ['C.....s.','C...p..s','C..s...s','C.s...p.'],
 funk:    ['C.p.p..p','C..pp.p.','C.p..pp.','C..p.pp.'],
 fusion:  ['C.s.p.ss','C..sp.sp','C.sp.s.p','C.s..sps']
});
const ROLE = Object.freeze({intro:0.72, verse:0.82, prechorus:1.0, chorus:1.16, bridge:0.94, solo:0.72, outro:0.62, custom:0.9});
// Динамика исполнения (0.772). Записи имеют один слой силы на ноту, поэтому
// velocity управляет только громкостью: удара и яркости forte здесь нет.
// Числа — замысел, а не измерение живого пианиста.
const ROLE_LEVEL = Object.freeze({intro:46, verse:59, prechorus:68, chorus:76, bridge:59, solo:60, outro:49, custom:64});
const ROLE_ARC = Object.freeze({intro:4, verse:6, prechorus:9, chorus:11, bridge:6, solo:6, outro:5, custom:6});
// В jazz/funk метрический акцент слабее: доли ровнее; хип-хоп прямой, доли ровные.
const GENRE_METRIC = Object.freeze({pop:1, rock:1, punk:1.05, country:0.95, blues:0.85, jazz:0.58, hiphop:0.95, funk:0.7, fusion:0.65});
function hash01(a, b, c) {
  let n = (a ^ Math.imul((b | 0) + 1, 0x9e3779b1) ^ Math.imul((c | 0) + 1, 0x85ebca6b)) >>> 0;
  n ^= n >>> 16; n = Math.imul(n, 0x7feb352d); n ^= n >>> 15; n = Math.imul(n, 0x846ca68b); n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}
// Сила шестнадцатой внутри такта: сильная доля, середина такта, слабые доли,
// восьмые между долями и шестнадцатые. Знак и величина — в единицах velocity.
function metricAccent(stepInBar, meter, beatsPerBar) {
  if (stepInBar === 0) return 17;
  if (meter === '6/8') return stepInBar === 12 ? 12 : stepInBar === 6 ? 8 : stepInBar % 4 === 0 ? 4 : stepInBar % 2 ? -11 : -5;
  if (stepInBar % 4 === 0) {
    const b = stepInBar / 4;
    if (beatsPerBar === 3) return b === 2 ? 9 : 5;
    return b === 2 ? 12 : b === 1 ? 6 : 5;
  }
  return stepInBar % 2 ? -11 : -5;
}
// Меняет только velocity: высоты, начала и длительности остаются прежними,
// поэтому рисунок не перегенерируется.
function applyDynamics(notes, o) {
  const barLen = o.beatsPerBar, meter = o.meter, total = Math.max(1e-6, o.totalBeats || 0);
  const level = (ROLE_LEVEL[o.role] ?? 75) + (Number.isFinite(o.corpusVelocityOffset)?o.corpusVelocityOffset:0), metric = GENRE_METRIC[o.genre] ?? 1, arcAmp = ROLE_ARC[o.role] ?? 6;
  const groups = new Map();
  for (const n of notes) {
    const key = n.hand + ':' + Math.round(n.beat * 16);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(n);
  }
  for (const group of groups.values()) group.sort((a, b) => b.midi - a.midi);
  for (const n of notes) {
    const posInBar = ((n.beat % barLen) + barLen) % barLen;
    const stepInBar = Math.round(posInBar * 4) % (barLen * 4);
    const accent = metricAccent(stepInBar, meter, barLen) * metric;
    const x = Math.min(1, Math.max(0, n.beat / total));
    const arc = arcAmp * (x < 0.75 ? x / 0.75 : (1 - x) / 0.25);
    const remaining = total - n.beat;
    const taper = remaining < barLen ? -9 * (1 - Math.max(0, remaining) / barLen) : 0;
    const breath = 2.5 * Math.sin(Math.PI * ((n.beat % (barLen * 2)) / (barLen * 2)));
    const rank = groups.get(n.hand + ':' + Math.round(n.beat * 16)).indexOf(n);
    const balance = n.hand === 'left' ? (stepInBar === 0 ? 4 : stepInBar % 4 === 0 ? 1 : -3) : rank === 0 ? 5 : -2 * rank;
    const register = n.midi < 40 ? 2 : n.midi > 88 ? -1 : 0;
    const humanise = (hash01(o.seed, Math.round(n.beat * 16), n.hand === 'left' ? 7 : 11) - 0.5) * 5 +
      (hash01(o.seed ^ 0x5bd1e995, n.midi, Math.round(n.beat * 16)) - 0.5) * 5;
    n.velocity = Math.max(30, Math.min(118, Math.round(level + accent + arc + taper + breath + balance + register + humanise)));
  }
  return notes;
}
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
  // Old saved sections retain their original algorithm until explicitly
  // regenerated. New sections mix the old and several structured gestures.
  const modern=o.rhythmVersion===2, family=Math.floor(motifRandom(seed,0,beatsPerBar,17)*5);
  const notes = [], decisions = [], gestures = [];
  // Look ahead through the whole phrase rather than greedily choosing each
  // chord. Bounds are heuristics, not a physical fingering model.
  for (const chord of chords) {
    if (!chord || !Number.isFinite(chord.beats) || chord.beats < 0.25 || chord.beats > 32 || chord.beats * 4 !== Math.round(chord.beats * 4)) throw new TypeError('Chord duration must be sixteenth-note aligned');
  }
  const planned=planSequence({chords,low,high,bpm,role});
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
      if (modern && family!==0) {
        // Eighth-note gestures form contrasting two- and four-bar phrases;
        // the bar changes the answer rather than repeating the same contour.
        const bar=Math.floor(step/(beatsPerBar*4)), pos=Math.floor((step%(beatsPerBar*4))/2);
        const grooveGenre=secondary && local>=beatsPerBar-1 ? secondary : genre;
        const pairSeed=seed ^ Math.imul(Math.floor(bar/2)+1,0x9e3779b1);
        const lead=(family-1+Math.floor(motifRandom(pairSeed,0,beatsPerBar,20)*4))%4;
        const answer=1+Math.floor(motifRandom(pairSeed,0,beatsPerBar,21)*3);
        const pattern=GROOVES[grooveGenre][(lead+(bar%2?answer:0))%4];
        const mark=step%2===0 ? pattern[pos] : '.';
        if(sectionStart)rightMode='chord';
        else if(mark==='C')rightMode='chord';
        else if(mark==='p')rightMode='partial';
        else if(mark==='s')rightMode='single';
      } else if (roll < probability || sectionStart || anchor) {
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
        // Dense grips only on strong bar beats of a slower chorus; at higher
        // tempos use fewer fingers. Split wide explicitly selected forms too.
        const limit=bpm>160 ? 2 : (bpm<=140 && role==='chorus' && downbeat ? 4 : 3);
        const hand=voice.right.length>limit ? voice.right.slice(0,limit) : voice.right;
        emit('right',hand,74);
      }
      else if (rightMode === 'partial') {
        const startIndex=Math.floor(choose(4)*(voice.right.length-1));
        emit('right',voice.right.slice(startIndex,startIndex+2),72);
      } else if (rightMode === 'single') {
        const position=modern && family!==0 ? (Math.floor(step/2)+Math.floor(step/(beatsPerBar*4))+family)%voice.right.length : Math.floor(choose(4)*voice.right.length);
        emit('right',[voice.right[position]],66);
      }
    }
    const emitted = notes.slice(notesBefore);
    if (!emitted.some(n => n.hand === 'left') || !emitted.some(n => n.hand === 'right')) return {ok:false,reason:'not-enough-transition-time',chordIndex:index,notes:[],decisions:[]};
    beat = end;
  }
  // 0.772: единая динамика секции поверх уже выбранных нот.
  applyDynamics(notes, {role, genre, meter, beatsPerBar, totalBeats:beat, seed});
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
module.exports = {generatePerformance, resolveSwing, GENRES, METERS, applyDynamics};
