// >>> B-39 STAGE0 BEGIN (B-102) <<<
// ==========================================================================
// B-102 · ЭТАП 0 (B-39, stage 0) — КАНОНИЧЕСКАЯ ФОРМУЛА АККОРДА
// --------------------------------------------------------------------------
// Зачем. Функция getChordNotes() ниже — ГИТАРНАЯ реализация аккорда. Она
// обязана звучать ровно как в 0.691, включая принятые упрощения: C11 без
// терции, C13 без 11-й ступени, b13 вместо квинты. Для фортепиано (B-39)
// такие пропуски недопустимы (правило R12: «Упрощение набора нот, допустимое
// на гитаре, не переносится в режим фортепиано»).
//
// Что сделано. Рядом добавлена честная формула chordFormula(): полный набор
// тонов аккорда без пропусков, с интервалами, классами высоты и басом для
// слэш-аккордов. СТАРЫЙ КОД НЕ ИЗМЕНЁН ВООБЩЕ — ни одной строки в
// getChordNotes, поэтому корпус тестов b101/b262 и золотая таблица
// аппликатур проходят с прежними ожиданиями.
//
// Правило для следующих этапов: звук клавиш, клавишные аппликатуры,
// голосоведение, типы аккомпанимента и экспорт нотного стана берут ноты
// ТОЛЬКО из chordFormula(). Гитарный путь продолжает пользоваться
// getChordNotes(). Два домена больше не перемешиваются.
// ==========================================================================

// Интервал в полутонах -> теоретическая ступень. 6 и 8 намеренно названы
// b5 и #5 (в аккордах так пишут чаще, чем #4/b6); замена написания — задача
// спеллера тональности, а не формулы.
const FORMULA_SEMITONE_DEGREE = Object.freeze({
  0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4', 6: 'b5', 7: '5',
  8: '#5', 9: '6', 10: 'b7', 11: '7', 13: 'b9', 14: '9', 15: '#9',
  17: '11', 18: '#11', 20: 'b13', 21: '13'
});
const FORMULA_ROOT_ALIAS = Object.freeze({ 'E#': 'F', 'B#': 'C', Fb: 'E', Cb: 'B' });

function formulaRootPc(root) {
  // Тот же порядок, что в getChordNotes: бемольный корень -> диезный,
  // затем энгармонические E#/B#/Fb/Cb, затем поиск в хроматической гамме.
  const sharp = FLAT_TO_SHARP[root] || FORMULA_ROOT_ALIAS[root] || root;
  return CHROMATIC.indexOf(sharp);
}

function formulaKeyStyle(k) {
  // getKeyStyle объявлена ниже по файлу, но function declaration всплывает.
  if (typeof getKeyStyle === 'function') return getKeyStyle(k);
  return typeof k === 'string' && /b/i.test(k) ? 'flat' : 'sharp';
}

function formulaNoteName(pc, keyStyle, octave) {
  let note = CHROMATIC[((pc % 12) + 12) % 12];
  if (keyStyle === 'flat') note = SHARP_TO_FLAT[note] || note;
  // Cb4 = B3: та же поправка научной нотации, что в getChordNotes (B-101).
  const oct = octave + (note === 'Cb' ? 1 : 0);
  return note + oct;
}

function parseChordFormula(name) {
  if (name === null || name === undefined) return null;
  let raw = String(name).trim();
  if (!raw) return null;
  // Те же помощники, что и в основном разборе: Δ/°/(9)/+ -> обычные суффиксы,
  // типографские ♭/♯ и джазовый минус -> ASCII, регистр -> канон.
  raw = String(expandChordName(raw));
  raw = String(normalizeChordCase(normalizeAccidentals(raw)));
  const parts = raw.split('/');
  let main = parts[0].trim();
  let bassRaw = parts.length > 1 ? parts.slice(1).join('/').trim() : '';
  // «6/9» — НЕ слэш-бас, а секста + нона (в getChordNotes это тоже особый
  // случай). normalizeChordCase уже разделил строку по «/», поэтому без этой
  // склейки «9» уезжало в бас и формула теряла нону.
  if (/6$/.test(main) && /^9/.test(bassRaw)) { main += '9'; bassRaw = ''; }
  const rm = main.match(/^([A-G][#b]?)/);
  if (!rm) return null;
  const root = rm[1];
  const rootPc = formulaRootPc(root);
  if (rootPc < 0) return null;                 // незнакомый корень — честный null
  const suffix = main.slice(root.length).toLowerCase();
  const bm = bassRaw.match(/^([A-G][#b]?)/);
  const bass = bm ? bm[1] : null;
  const bassPc = bass ? formulaRootPc(bass) : -1;
  return {
    raw, main, root, rootPc, suffix,
    bass, bassPc: bassPc < 0 ? null : bassPc
  };
}

/**
 * Каноническая формула аккорда. Возвращает null для нераспознанного имени —
 * никогда не подставляет «похожий» аккорд (R12).
 *
 * @param {string} name  например 'C13', 'Cm7b5', 'C/E', 'C7(#11)', 'Cadd9'
 * @param {string} [key] тональность для спеллинга ('F' -> бемоли)
 * @returns {{name,root,rootPc,quality,intervals,degrees,pitchClasses,tones,bass,keyStyle}|null}
 */
function chordFormula(name, key) {
  const p = parseChordFormula(name);
  if (!p) return null;
  const s = p.suffix;
  const keyStyle = formulaKeyStyle(key);

  const isHalfDim = /m7b5|ø/.test(s);
  const isDim = /dim|°/.test(s) && !isHalfDim;
  const isAug = /aug|\+/.test(s);
  const isSus = /sus/.test(s);
  const isPower = /^5($|[^a-z0-9])/.test(s);
  const isMin = /^m(?!aj)/.test(s) && !isHalfDim;
  const isMaj7 = /maj/.test(s);

  // 1. База: полное трезвучие / септаккорд. Здесь НИЧЕГО не выкидывается.
  let ints;
  if (isPower) ints = [0, 7];
  else if (isHalfDim) ints = [0, 3, 6, 10];
  else if (isDim) ints = [0, 3, 6];
  else if (isAug) ints = [0, 4, 8];
  else if (isSus) ints = /sus2/.test(s) ? [0, 2, 7] : [0, 5, 7];
  else if (isMin) ints = [0, 3, 7];
  else ints = [0, 4, 7];

  // 2. Цифровой стек. add-хвосты и альтерации в скобках не должны читаться
  //    как номер расширения — то же правило, что отработано в B-101.
  let ext = s.replace(/add\d+/g, '');
  ext = ext.replace(/\((?:[#b]?\d+)(?:,[#b]?\d+)*\)/g, '');
  const has69 = /(^|\D)6\/?9(\D|$)/.test(ext);
  if (has69) ext = ext.replace(/6\/?9/, '');
  const nums = ext.match(/\d+/g);
  const n = nums ? parseInt(nums[0], 10) : 0;

  if (has69) { ints.push(9); ints.push(14); }       // секста + нона
  if (n >= 7) {
    // 11-я для 13-го НЕ опускается: каноническая формула полная.
    // Решение, что реально возьмёт рука, принимает голосоведение (этап 4).
    let seventh = 10;                               // малая септима
    if (isMaj7) seventh = 11;                      // большая септима
    else if (isDim) seventh = 9;                   // уменьшённая септима
    ints.push(seventh);
  }
  if (n >= 9) ints.push(14);
  if (n >= 11) ints.push(17);
  if (n >= 13) ints.push(21);
  if (n === 6) ints.push(9);

  // 3. Альтерации. b13 НЕ удаляет квинту — это гитарная конвенция, здесь она
  //    не применяется. Обе ноты остаются в формуле.
  if (!isPower) {
    if (/b5|-5/.test(s)) ints = ints.map((i) => (i === 7 ? 6 : i));
    if (/#5|\+5/.test(s)) ints = ints.map((i) => (i === 7 ? 8 : i));
  }
  if (/b6/.test(s)) { ints = ints.filter((i) => i !== 9); ints.push(8); }
  if (/b9/.test(s)) ints.push(13);
  if (/#9/.test(s)) ints.push(15);
  if (/#11/.test(s)) ints.push(18);
  if (/b13/.test(s)) ints.push(20);
  if (/alt/.test(s)) ints.push(13, 15, 18, 20);
  if (/add9|add2/.test(s)) ints.push(14);
  if (/add11|add4/.test(s)) ints.push(17);

  ints = [...new Set(ints)].sort((a, b) => a - b);

  const rootOctave = p.root === 'Cb' ? 3 : 4;
  const tones = ints.map((semi) => {
    const pc = (p.rootPc + semi) % 12;
    const spelled = CHROMATIC[pc];
    let note = keyStyle === 'flat' ? (SHARP_TO_FLAT[spelled] || spelled) : spelled;
    const oct = rootOctave + Math.floor((p.rootPc + semi) / 12) + (note === 'Cb' ? 1 : 0);
    return {
      degree: FORMULA_SEMITONE_DEGREE[semi] || String(semi),
      semitones: semi,
      pitchClass: pc,
      note,
      noteWithOctave: note + oct
    };
  });

  let bass = null;
  if (p.bass && p.bassPc !== null) {
    bass = {
      name: p.bass,
      pitchClass: p.bassPc,
      interval: (p.bassPc - p.rootPc + 12) % 12,
      // отдельная низкая нота — этап 4 опустит её на октаву ниже аккорда
      noteWithOctave: formulaNoteName(p.bassPc, keyStyle, 3)
    };
  }

  const quality = isPower ? 'power' : isHalfDim ? 'm7b5' : isDim ? 'dim'
    : isAug ? 'aug' : isSus ? (/sus2/.test(s) ? 'sus2' : 'sus4')
    : isMin ? 'min' : 'maj';

  return {
    name: p.raw,
    root: p.root,
    rootPc: p.rootPc,
    quality,
    intervals: ints.slice(),
    degrees: tones.map((t) => t.degree),
    pitchClasses: tones.map((t) => t.pitchClass),
    tones,
    bass,
    keyStyle
  };
}

/** Ноты канонической формулы в научной нотации (C4, Eb5, ...). */
function chordFormulaNotes(name, key) {
  const f = chordFormula(name, key);
  return f ? f.tones.map((t) => t.noteWithOctave) : [];
}

// Небольшой неймспейс для тестов и следующих этапов. Префикс StruChord —
// чтобы не пересечься с существующими глобалами.
if (typeof window !== 'undefined') {
  window.StruChordFormula = Object.freeze({
    chordFormula,
    chordFormulaNotes,
    parseChordFormula,
    FORMULA_SEMITONE_DEGREE
  });
}
// <<< B-39 STAGE0 END (B-102) <<<
