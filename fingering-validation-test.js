const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function toSharpNote(note) {
  const m = note.match(/^([A-G][#b]?)(\d*)$/);
  if (!m) return note;
  let root = m[1];
  const octave = m[2];
  if (root === 'Db') root = 'C#';
  else if (root === 'Eb') root = 'D#';
  else if (root === 'Gb') root = 'F#';
  else if (root === 'Ab') root = 'G#';
  else if (root === 'Bb') root = 'A#';
  else if (root === 'Cb') root = 'B';
  return root + octave;
}
function songStringNotes() { return ['E','A','D','G','B','E']; }
function shapeMatchesChord(shape, chordNotes, bassNote) {
  if (!shape || !chordNotes || !chordNotes.length) return true;
  const sn = songStringNotes();
  const target = new Set(chordNotes.map((n) => toSharpNote(String(n).replace(/-?\d+$/, ''))));
  let lowest = -1;
  for (let i = 0; i < 6; i++) {
    const f = shape[i];
    if (f === 'x' || f === undefined || f === null) continue;
    const fret = typeof f === 'number' ? f : parseInt(f, 10);
    if (!Number.isFinite(fret)) continue;
    const note = CHROMATIC[(CHROMATIC.indexOf(sn[i]) + fret) % 12];
    if (!target.has(note)) return false; // чужая нота — форма не та
    if (lowest === -1) lowest = i;
  }
  if (lowest === -1) return false;
  if (bassNote) {
    const want = toSharpNote(String(bassNote).replace(/-?\d+$/, ''));
    const fret = typeof shape[lowest] === 'number' ? shape[lowest] : parseInt(shape[lowest], 10);
    const got = CHROMATIC[(CHROMATIC.indexOf(sn[lowest]) + fret) % 12];
    if (got !== want) return false;
  }
  return true;
}
// --- тесты валидации resolveFingeringShape (ветка «как есть») ---
function check(name, shapeStr, chordNotes, bassNote, expect) {
  const parsed = shapeStr.split(',').map(v => v.trim() === 'x' ? 'x' : Number(v));
  const got = shapeMatchesChord(parsed, chordNotes, bassNote || null);
  const ok = got === expect;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + '  got=' + got + ' want=' + expect);
  return ok;
}
const AADD9 = ['A','C#','E','B'];
const AM    = ['A','C','E'];
const C     = ['C','E','G'];
let all = true;
// 1) БАГ из файла: хват D5 на Aadd9 — должен ОТКЛОНЯТЬСЯ
all &= check('D5 grip on Aadd9 (the bug)', 'x,5,7,7,x,x', AADD9, null, false);
// 2) Своя рисованная форма Aadd9 — принимается
all &= check('user shape 5,7,9,6,x,x on Aadd9', '5,7,9,6,x,x', AADD9, null, true);
// 3) Схлопнутый дубль Am (x вместо 0 на 1-й) — принимается
all &= check('collapsed Am x,0,2,2,1,x', 'x,0,2,2,1,x', AM, null, true);
all &= check('stock Am x,0,2,2,1,0', 'x,0,2,2,1,0', AM, null, true);
// 4) Инверсия без слэша (E в басу у C) — не отсекаем
all &= check('C with E in bass 0,3,2,0,1,0', '0,3,2,0,1,0', C, null, true);
// 5) Слэш-аккорд: чужой бас отклоняется
all &= check('C/G with C in bass x,3,2,0,1,0', 'x,3,2,0,1,0', C, 'G', false);
all &= check('C/G with G in bass 3,3,2,0,1,0', '3,3,2,0,1,0', C, 'G', true);
// 6) Форма с чужой нотой (G в Aadd9) — отклоняется
all &= check('foreign note G on Aadd9', '5,7,9,6,3,x', AADD9, null, false);
// 7) Пустая форма x,x,x,x,x,x — отклоняется
all &= check('all-muted', 'x,x,x,x,x,x', AADD9, null, false);
process.exit(all ? 0 : 1);
