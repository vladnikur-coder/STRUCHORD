#!/usr/bin/env node
/* tmp-0595-check.js — юнит-пробы патча 0.595 (ханки 1-9). */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const htmlPath = path.join(__dirname, '..', '..', 'STRUCHORD.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://localhost/',
  beforeParse(win) {
    win.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    win.cancelAnimationFrame = (id) => clearTimeout(id);
    win.HTMLCanvasElement.prototype.getContext = () => ({
      font: '', measureText: () => ({ width: 10 }),
      clearRect(){}, beginPath(){}, arc(){}, fill(){}, stroke(){},
      lineTo(){}, closePath(){}, save(){}, restore(){}, translate(){},
      fillText(){}, strokeText(){}, setTransform(){}, scale(){},
      createLinearGradient: () => ({ addColorStop(){} }),
    });
  },
});
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function () {
  return { currentTime: 0, state: 'running', resume() {}, sampleRate: 44100,
    createBuffer: (c, len) => ({ getChannelData: () => new Float32Array(len) }) };
};

let pass = 0, fail = 0;
function check(name, cond, details) {
  if (cond) { pass++; console.log('ok   ' + name); }
  else { fail++; console.error('FAIL ' + name + (details !== undefined ? ' (' + details + ')' : '')); }
}

// ---- ханк 2: sus-качества в parseChordForKeyDetection ----
const p9sus = w.eval('parseChordForKeyDetection("C9sus4")');
check('h2: C9sus4 quality null', p9sus && p9sus.quality === null, JSON.stringify(p9sus));
check('h2: C9sus4 isDominant7 true', p9sus && p9sus.isDominant7 === true);
const p7sus = w.eval('parseChordForKeyDetection("G7sus")');
check('h2: G7sus isDominant7 true', p7sus && p7sus.isDominant7 === true);
const p13sus = w.eval('parseChordForKeyDetection("F13sus")');
check('h2: F13sus isDominant7 true', p13sus && p13sus.isDominant7 === true);
const p9 = w.eval('parseChordForKeyDetection("G9")');
check('h2: G9 isDominant7 true (регресс)', p9 && p9.isDominant7 === true);
const pMaj9 = w.eval('parseChordForKeyDetection("Cmaj9")');
check('h2: Cmaj9 not dominant-7-flag (регресс)', pMaj9 && pMaj9.isDominant7 === false);
const pAm7 = w.eval('parseChordForKeyDetection("Am7")');
check('h2: Am7 quality min (регресс)', pAm7 && pAm7.quality === 'min' && !pAm7.isDominant7);

// ---- ханк 3: 13-е и b13 ----
const hasNote = (arr, name) => arr.some((x) => x.startsWith(name) || x === name);
const n13 = w.eval('getChordNotes("C13", "sharp")');
check('h3: C13 без F (11-я)', !hasNote(n13, 'F'), JSON.stringify(n13));
check('h3: C13 с Bb/D/A', hasNote(n13, 'A#') && hasNote(n13, 'D') && hasNote(n13, 'A'), JSON.stringify(n13));
const n13m = w.eval('getChordNotes("Cm13", "sharp")');
check('h3: Cm13 с F (11-я)', hasNote(n13m, 'F'), JSON.stringify(n13m));
const n11 = w.eval('getChordNotes("C11", "sharp")');
check('h3: C11 с F (11-я) не тронута', hasNote(n11, 'F'), JSON.stringify(n11));
const n7b13 = w.eval('getChordNotes("C7b13", "sharp")');
check('h3: C7b13 без G (квинты)', !hasNote(n7b13, 'G4') && !hasNote(n7b13, 'G,'), JSON.stringify(n7b13));
check('h3: C7b13 с Ab (b13) и Bb (7)', hasNote(n7b13, 'G#') && hasNote(n7b13, 'A#'), JSON.stringify(n7b13));
const n7 = w.eval('getChordNotes("G7", "sharp")');
check('h3: G7 с D (квинта, регресс)', hasNote(n7, 'D'), JSON.stringify(n7));

// ---- ханк 6: порядок quality ----
check('h6: C -> maj', w.eval('getHarmonyChordTertianQuality("C", "C")') === 'maj');
check('h6: Am -> min', w.eval('getHarmonyChordTertianQuality("Am", "C")') === 'min');
check('h6: Cdim -> dim', w.eval('getHarmonyChordTertianQuality("Cdim", "C")') === 'dim');
check('h6: Caug -> aug', w.eval('getHarmonyChordTertianQuality("Caug", "C")') === 'aug');
check('h6: G7 -> maj (доминанта — мажор)', w.eval('getHarmonyChordTertianQuality("G7", "C")') === 'maj');

// ---- ханк 7: sus без ступени ----
check('h7: Csus4 -> degree ""', w.eval('getHarmonyRootDegree({ root: "C", quality: null, chordName: "Csus4" }, "C")') === '');
check('h7: C9sus4 -> degree ""', w.eval('getHarmonyRootDegree({ root: "C", quality: null, chordName: "C9sus4" }, "C")') === '');
check('h7: Am в C -> vi/VI (регресс)', ['vi', 'VI'].includes(w.eval('getHarmonyRootDegree({ root: "A", quality: "min", chordName: "Am" }, "C")')),
  w.eval('getHarmonyRootDegree({ root: "A", quality: "min", chordName: "Am" }, "C")'));
check('h7: C в C -> I (регресс)', w.eval('getHarmonyRootDegree({ root: "C", quality: "maj", chordName: "C" }, "C")') === 'I');

// ---- ханк 4/5: correctChordName со ключом ----
check('h4: C в C не меняется', w.eval('correctChordName("Cmaj7", "sharp", "C")') === 'Cmaj7');
check('h4: Db в Db = эталон без ключа', w.eval('correctChordName("DbMaj7", "flat", "Db")') === w.eval('correctChordName("DbMaj7", "flat")'),
  w.eval('correctChordName("DbMaj7", "flat", "Db")') + ' vs ' + w.eval('correctChordName("DbMaj7", "flat")'));
check('h4: Bb в Bb не меняется', w.eval('correctChordName("Bb", "flat", "Bbm")') === 'Bb',
  w.eval('correctChordName("Bb", "flat", "Bbm")'));
check('h4: без ключа — старое поведение', w.eval('correctChordName("DbMaj7", "sharp")') === w.eval('correctChordName("DbMaj7", "sharp", "")'),
  w.eval('correctChordName("DbMaj7", "sharp")'));
check('h4: бас сохраняется', w.eval('correctChordName("Db/C", "flat", "Db")') === 'Db/C',
  w.eval('correctChordName("Db/C", "flat", "Db")'));
check('h4: sus не ломается', w.eval('correctChordName("Csus4", "sharp", "C")') === 'Csus4',
  w.eval('correctChordName("Csus4", "sharp", "C")'));

// ---- ханк 8: scheduleClick(mid) не падает ----
const sc8 = w.eval('(function(){ try { scheduleClick(null, 0, false, true); scheduleClick(null, 0, true, false); return "ok"; } catch(e) { return "ERR:" + e.message; } })()');
check('h8: scheduleClick с mid не бросает', sc8 === 'ok', sc8);

// ---- регрессия: корпусные детекторы ----
const pSlash = w.eval('parseChordForKeyDetection("C/E")');
check('reg: C/E бас E', pSlash && pSlash.bassRoot === 'E');
const pBm7b5 = w.eval('parseChordForKeyDetection("Bm7b5")');
check('reg: Bm7b5 dim', pBm7b5 && pBm7b5.quality === 'dim');

console.log('\n' + pass + ' ok, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
