#!/usr/bin/env python3
"""B-39 0.800: keep a song-wide groove family and infer roles for named custom sections."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HTML = ROOT / 'STRUCHORD.html'
s = HTML.read_text()
repls = [
("· ver 0.799", "· ver 0.800"),
("    return {primary:raw.primary,secondary:secondary,trackId:trackId,managed:managed,...(raw.autoBass===true?{autoBass:true}:{}),...(typeof raw.swing==='boolean'?{swing:raw.swing}:{}),...(raw.engine==='notes-v1'?{engine:'notes-v1'}:{}),...(raw.shapeAware===true?{shapeAware:true,followShape:raw.followShape===true}:{})};",
 "    return {primary:raw.primary,secondary:secondary,trackId:trackId,managed:managed,...(raw.autoBass===true?{autoBass:true}:{}),...(typeof raw.swing==='boolean'?{swing:raw.swing}:{}),...(raw.engine==='notes-v1'?{engine:'notes-v1'}:{}),...(raw.shapeAware===true?{shapeAware:true,followShape:raw.followShape===true}:{}),...(raw.phraseModel===1&&Number.isInteger(raw.phraseSeed)&&raw.phraseSeed>=0&&raw.phraseSeed<=2147483647?{phraseModel:1,phraseSeed:raw.phraseSeed}:{})};"),
("  const {chords, low, high, bpm, meter, genre, secondary, role, swing, sectionSwing, seed, saturation} = o;   // 0.795 (№22)",
 "  const {chords, low, high, bpm, meter, genre, secondary, role, swing, sectionSwing, seed, saturation, phraseSeed} = o;   // 0.800: song-wide groove family"),
("      !Object.hasOwn(ROLE, role) || !Number.isInteger(seed) || typeof swing !== 'boolean') throw new TypeError('Invalid performance request');",
 "      !Object.hasOwn(ROLE, role) || !Number.isInteger(seed) || !(phraseSeed==null||Number.isInteger(phraseSeed)&&phraseSeed>=0&&phraseSeed<=2147483647) || typeof swing !== 'boolean') throw new TypeError('Invalid performance request');"),
("  const modern=o.rhythmVersion===2, family=Math.floor(motifRandom(seed,0,beatsPerBar,17)*5);",
 "  const modern=o.rhythmVersion===2, familySeed=Number.isInteger(phraseSeed)?phraseSeed:seed, family=Math.floor(motifRandom(familySeed,0,beatsPerBar,17)*5);"),
("        const pairSeed=seed ^ Math.imul(Math.floor(bar/2)+1,0x9e3779b1);\n        const lead=(family-1+Math.floor(motifRandom(pairSeed,0,beatsPerBar,20)*4))%4;\n        const answer=1+Math.floor(motifRandom(pairSeed,0,beatsPerBar,21)*3);",
 "        const pairSeed=familySeed ^ Math.imul(Math.floor(bar/2)+1,0x9e3779b1);\n        const lead=(family-1+Math.floor(motifRandom(pairSeed,0,beatsPerBar,20)*4))%4;\n        const answer=1+Math.floor(motifRandom(pairSeed,0,beatsPerBar,21)*3);   // 0.800: same rhythmic motif language across sections"),
("const gen=generatePerformance({chords,low:o.low,high:o.high,bpm:o.bpm,meter:o.meter,genre:o.genre,secondary:o.secondary,role:o.role,swing:o.swing,sectionSwing:o.sectionSwing,rhythmVersion:o.rhythmVersion,seed:(o.seed+i)|0,saturation:Number.isInteger(o.saturation)?o.saturation:null});",
 "const gen=generatePerformance({chords,low:o.low,high:o.high,bpm:o.bpm,meter:o.meter,genre:o.genre,secondary:o.secondary,role:o.role,swing:o.swing,sectionSwing:o.sectionSwing,rhythmVersion:o.rhythmVersion,seed:(o.seed+i)|0,phraseSeed:Number.isInteger(o.phraseSeed)?o.phraseSeed:null,saturation:Number.isInteger(o.saturation)?o.saturation:null});"),
("role:o.role,swing:o.swing,sectionSwing:o.sectionSwing,rhythmVersion:o.rhythmVersion,seed:o.seed,saturation:Number.isInteger(o.saturation)?o.saturation:null});   // 0.795 (№22)",
 "role:o.role,swing:o.swing,sectionSwing:o.sectionSwing,rhythmVersion:o.rhythmVersion,seed:o.seed,phraseSeed:Number.isInteger(o.phraseSeed)?o.phraseSeed:null,saturation:Number.isInteger(o.saturation)?o.saturation:null});   // 0.800: shared phrase family"),
(" function prepare(sec,cfg,seed,replaceEdited,overrideSwing,overrideRhythmVersion){",
 " function sectionRole(sec){\n  var type=String(sec&&sec.type||'').toLowerCase();if(type&&type!=='custom')return type.replace(/[\\s_-]+/g,'');\n  var name=String(sec&&(sec.customName||sec.name)||'').trim().toLowerCase().replace(/[\\s_-]+/g,'');\n  if(/предприпев|prechorus|prechor/.test(name))return 'prechorus';\n  if(/вступлен|интро|^intro/.test(name))return 'intro';\n  if(/куплет|^verse/.test(name))return 'verse';\n  if(/припев|^chorus/.test(name))return 'chorus';\n  if(/бридж|мост|^bridge/.test(name))return 'bridge';\n  if(/проигрыш|соло|инструментал|^solo|^instrumental/.test(name))return 'solo';\n  if(/аутро|кода|финал|^outro/.test(name))return 'outro';\n  return 'custom';\n }\n function prepare(sec,cfg,seed,replaceEdited,overrideSwing,overrideRhythmVersion){"),
("role:String(sec.type||'Verse').toLowerCase(),shapeAware:cfg.shapeAware===true", "role:sectionRole(sec),shapeAware:cfg.shapeAware===true"),
("seed:seed|0,saturation:Number.isInteger(track.saturation)?track.saturation:null});   // 0.795 (№22)", "seed:seed|0,phraseSeed:cfg.phraseModel===1?cfg.phraseSeed:null,saturation:Number.isInteger(track.saturation)?track.saturation:null});   // 0.800"),
("var next={primary:primary.value,secondary:secondary.value||null,trackId:dialogTrack,managed:managed,autoBass:true,swing:swing.checked,engine:'notes-v1',shapeAware:true};",
 "var next={primary:primary.value,secondary:secondary.value||null,trackId:dialogTrack,managed:managed,autoBass:true,swing:swing.checked,engine:'notes-v1',shapeAware:true,phraseModel:1,phraseSeed:Math.floor(Math.random()*2147483648)};   // 0.800: new plans share a song-level rhythmic family"),
]
for old,new in repls:
    count=s.count(old)
    if count!=1:
        raise SystemExit(f'Ожидалось одно вхождение ({count}): {old[:180]!r}')
    s=s.replace(old,new,1)
HTML.write_text(s)

sw=ROOT/'sw.js'; t=sw.read_text()
if t.count('struchord-v799')!=1: raise SystemExit('Ожидалось одно имя кэша v799')
sw.write_text(t.replace('struchord-v799','struchord-v800',1))
print('OK: B-39 song-wide groove + custom-section role inference; paired version/cache 0.800')
