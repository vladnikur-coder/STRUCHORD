// 0.800 · B-39: one rhythmic family per newly generated song plan; section role remains expressive.
const fs = require('fs');
const assert = require('assert');
const vm = require('vm');
const html = fs.readFileSync('STRUCHORD.html', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');
const VER = (html.match(/· ver (\d+\.\d+)/) || [])[1];

assert(html.includes("phraseModel:1,phraseSeed:Math.floor(Math.random()*2147483648)"),
  'fresh auto plans persist a song-wide phrase seed');
assert(html.includes("raw.phraseModel===1&&Number.isInteger(raw.phraseSeed)"),
  'the optional phrase model survives song sanitize/load');
assert(html.includes('familySeed=Number.isInteger(phraseSeed)?phraseSeed:seed'),
  'legacy plans without phraseSeed keep section seed behavior');
assert(html.includes('motifRandom(familySeed,0,beatsPerBar,17)'),
  'rhythmic family selection uses phraseSeed');
assert(html.includes('const pairSeed=familySeed ^ Math.imul(Math.floor(bar/2)+1,0x9e3779b1)'),
  'two-bar lead/answer motif shares family across sections');
assert(html.includes('phraseSeed:Number.isInteger(o.phraseSeed)?o.phraseSeed:null'),
  'phrase seed reaches performance generator from section planner');
assert(html.includes("if(/предприпев|prechorus|prechor/.test(name))return 'prechorus'"),
  'custom pre-chorus name is recognized before chorus');
assert(html.includes("if(/проигрыш|соло|инструментал|^solo|^instrumental/.test(name))return 'solo'"),
  'custom Russian instrumental/solo names map to solo role');
assert(html.includes("role:sectionRole(sec)"), 'custom-name-aware role is passed to generator');
assert(html.includes("return 'custom';"), 'unknown custom labels retain neutral custom role');
const roleSource = html.match(/function sectionRole\(sec\)\{[\s\S]*?\n \}/);
assert(roleSource, 'sectionRole helper exists');
const sectionRole = vm.runInNewContext('(' + roleSource[0] + ')');
assert.strictEqual(sectionRole({type:'Custom',customName:'Проигрыш'}), 'solo');
assert.strictEqual(sectionRole({type:'Custom',customName:'Тихий куплет'}), 'verse');
assert.strictEqual(sectionRole({type:'Custom',customName:'Bridge instrumental'}), 'bridge');
assert.strictEqual(sectionRole({type:'Custom',customName:'Новая часть'}), 'custom');
assert.strictEqual(sectionRole({type:'Pre-Chorus'}), 'prechorus');
assert.strictEqual(sectionRole({type:'Chorus'}), 'chorus');
assert(VER && sw.includes('struchord-v' + VER.replace(/^0\./, '')), 'current application version remains registered');
console.log('B-39 auto-cohesion 0.800: 17 assertions passed');
