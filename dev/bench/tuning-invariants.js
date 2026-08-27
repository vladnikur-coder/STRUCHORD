// Инварианты системы строёв — сквозная проверка по ВСЕМ строям.
//
// Профильные стенды (tuning-song, tuning-forms, user-fingering-scope)
// проверяют механику на отдельных строях. Здесь другой вопрос: НИГДЕ в
// таблице строёв не ломается ли связка «строй ↔ подбор ↔ звук»:
//
//   1. у каждого строя частоты открытых струн согласованы с midi-
//      разбором (noteToFrequency против tunerNoteToMidi);
//   2. у любого проверяемого аккорда в любом строе есть хотя бы одна
//      форма (универсальный генератор не молчит);
//   3. каждая выданная форма содержит ТОЛЬКО ноты аккорда — независимо
//      пересчитанными нотами струн (не через код генератора);
//   4. каждая выданная форма проходит shapeMatchesChord — те же ворота,
//      что resolve ставит на форму с ячейки (иначе pin и resolve
//      разъехались бы);
//   5. у слэш-аккорда басовая струна каждой формы даёт ноту слэша;
//   6. shapeToPluckNotes для каждой формы даёт ровно те частоты, что
//      «открытая частота строя × 2^(лад/12)» — звук не прибит к
//      стандартному строю;
//   7. кэш генератора сквозь строи не протекает: повторный прогон
//      стандартного строя после круга по всем даёт те же списки.
const puppeteer = require('/home/user/node_modules/puppeteer');

let bad = 0;
const ok = (n, c, x) => {
  console.log(`   ${c ? 'ok  ' : 'FAIL'} ${n}${!c && x !== undefined ? ' — ' + x : ''}`);
  if (!c) bad++;
};

(async () => {
  const b = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--allow-file-access-from-files'],
    protocolTimeout: 120000,
  });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto('file:///home/user/STRUCHORD.html', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await new Promise((r) => setTimeout(r, 1000));

  const rep = await p.evaluate(() => {
    const R = {
      freqMidi: [], cover: [], foreign: [], gate: [], bass: [], sound: [],
      dimLinear: [], dimOpenColor: [],
      totalShapes: 0, totalChords: 0, stdBefore: null, stdAfter: null,
      dimColor: 0,
    };
    const roots = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
    const chords = [];
    for (const r of roots) for (const t of ['', 'm', '7']) chords.push(r + t);
    chords.push('Cmaj7', 'Dm7', 'Em7', 'Am7', 'Bm7', 'Cadd9', 'F#dim', 'Bdim',
      'Asus4', 'Dsus2', 'C5', 'G5', 'C6', 'G/B', 'D/F#', 'A/C#', 'E/G#');
    const snap = () => {
      // Снимок выдачи стандартного строя для проверки изоляции кэша.
      tunerTuningId = 'e-std'; tunerCustomNotes = null; fingeringCache.clear();
      return chords.map((c) =>
        window.getFingeringVariants(c, 'C').shapes.map((s) => s.join(',')).join(';')
      ).join('|');
    };
    R.stdBefore = snap();

    for (const t of TUNER_TUNINGS) {
      tunerTuningId = t.id;
      tunerCustomNotes = null;
      fingeringCache.clear();
      userFingerings.clear(); // стенд работает на чистой библиотеке

      // 1. ноты строя: частота согласована с midi-разбором
      t.notes.forEach((n, i) => {
        const f = noteToFrequency(n);
        const m = tunerNoteToMidi(n);
        const want = m === null ? null : 440 * Math.pow(2, (m - 69) / 12);
        if (f === null || want === null || Math.abs(f - want) > 1e-9)
          R.freqMidi.push(`${t.id}:${n} f=${f} want=${want}`);
        // и открытая частота строя песни — она же
        if (Math.abs(songStringFreqs()[i] - f) > 1e-9)
          R.freqMidi.push(`${t.id}:${n} songFreq=${songStringFreqs()[i]}`);
      });

      const sn = songStringNotes();
      const snIdx = sn.map((n) => CHROMATIC.indexOf(n));
      const openFreq = songStringFreqs();

      // ♭♭7-гриф — канон для dim. Обязан доезжать во все строи с
      // «линейной» геометрией (стандартные и дропы — там сдвиг ладов
      // сохраняет форму); в Open/DADGAD табличный гриф физически не
      // переживает перестройку, поэтому там dim остаётся чистым
      // трезвучием — это норма, а не потеря.
      for (const dc of ['Cdim', 'F#dim']) {
        const r0 = window.getFingeringVariants(dc, 'C');
        const want = dimColorPc(dc);
        const has = (r0 ? r0.shapes : []).some((sh) =>
          sh.some((f, s) => {
            if (f === 'x' || f === undefined || f === null) return false;
            const fr = typeof f === 'number' ? f : parseInt(f, 10);
            return Number.isFinite(fr) && CHROMATIC[(snIdx[s] + fr) % 12] === CHROMATIC[want];
          })
        );
        const linear = ['Частые', 'Standard', 'Drop'].includes(t.group);
        if (linear && !has) R.dimLinear.push(`${t.id}:${dc}`);
        if (!linear && has) R.dimOpenColor.push(`${t.id}:${dc}`);
      }

      for (const c of chords) {
        R.totalChords++;
        const main = c.split('/')[0].trim();
        const bassNote = c.includes('/') ? c.split('/')[1].trim() : null;
        const chordNotes = getChordNotes(main, getKeyStyle('C')) || [];
        const target = new Set(
          chordNotes.map((n) => toSharpNote(String(n).replace(/-?\d+$/, '')))
        );
        const wantBass = bassNote
          ? toSharpNote(String(bassNote).replace(/-?\d+$/, '')) : null;
        const r = window.getFingeringVariants(c, 'C');
        const shapes = r ? r.shapes : [];

        // 2. хотя бы одна форма
        if (!shapes.length) { R.cover.push(`${t.id}:${c}`); continue; }
        R.totalShapes += shapes.length;

        // dim-грифы несут канонический ♭♭7 — разрешён штатно (dimColorPc
        // в приложении). Здесь тот же допуск + отдельный счётчик, чтобы
        // видеть, что окраска не расползается дальше dim.
        const dimAllowPc = dimColorPc(main);

        for (let shapeI = 0; shapeI < shapes.length; shapeI++) {
          const shape = shapes[shapeI];
          const label = `${t.id}:${c}:${shape.join(',')}`;
          if (!shape || shape.length !== 6) { R.foreign.push(label + ' ДЛИНА'); continue; }
          let lowest = -1;
          let seenDimColor = false;
          for (let s = 0; s < 6; s++) {
            const f = shape[s];
            if (f === 'x' || f === undefined || f === null) continue;
            const fret = typeof f === 'number' ? f : parseInt(f, 10);
            if (!Number.isFinite(fret) || fret < 0 || fret > 24) {
              R.foreign.push(label + ` ЛАД=${f}`); continue;
            }
            if (lowest === -1) lowest = s;
            // 3. независимый пересчёт ноты: строй + лад
            const note = CHROMATIC[(snIdx[s] + fret) % 12];
            if (!target.has(note)) {
              const isDimColor = dimAllowPc !== null &&
                CHROMATIC.indexOf(note) === dimAllowPc;
              if (isDimColor) seenDimColor = true;
              else R.foreign.push(`${label} нота ${note} (струна ${s + 1})`);
            }
          }
          if (seenDimColor) R.dimColor++;
          // 4. нотная часть ворот resolve ставится на форму ячейки — с
          // тем же штатным допуском ♭♭7 для dim. Бас здесь НЕ требуем:
          // списочные альтернативы слэша свободны (бас слэша гарантирует
          // дефолт — проверка 5).
          if (!shapeMatchesChord(shape, chordNotes, null, dimAllowPc)) {
            R.gate.push(label);
          }
          // 5. слэш-бас обязателен только у формы ПО УМОЛЧАНИЮ: дальше по
          // списку генератор намеренно показывает все легальные формы
          // (бас-корректные впереди), и pin такой альтернативы — выбор
          // пользователя.
          if (wantBass && lowest !== -1 && shapeI === 0) {
            const lf = typeof shape[lowest] === 'number'
              ? shape[lowest] : parseInt(shape[lowest], 10);
            if (CHROMATIC[(snIdx[lowest] + lf) % 12] !== wantBass)
              R.bass.push(`${label} бас != ${wantBass}`);
          }
          // 6. звук: частоты открытых струн — из строя песни
          const pl = shapeToPluckNotes(shape);
          const sounding = shape.filter(
            (f) => f !== 'x' && f !== undefined && f !== null
          ).length;
          if (pl.length !== sounding) { R.sound.push(`${label} голосов ${pl.length}/${sounding}`); continue; }
          for (const v of pl) {
            const f = shape[v.stringIndex];
            const fret = typeof f === 'number' ? f : parseInt(f, 10);
            const want = openFreq[v.stringIndex] * Math.pow(2, fret / 12);
            if (Math.abs(v.freq - want) > 1e-6)
              R.sound.push(`${label} стр.${v.stringIndex} ${v.freq} != ${want}`);
          }
        }
      }
    }
    R.stdAfter = snap();
    tunerTuningId = 'e-std'; tunerCustomNotes = null; fingeringCache.clear();
    return R;
  });

  const tunings = await p.evaluate(() => TUNER_TUNINGS.length);
  console.log(`строёв: ${tunings}, аккордов на строй: 53, форм проверено: ${rep.totalShapes}`);

  console.log('\n=== 1. Ноты строёв: частота ↔ midi ===');
  ok('все 24×6 нот согласованы', rep.freqMidi.length === 0, rep.freqMidi.slice(0, 3).join(' | '));

  console.log('\n=== 2. Покрытие генератора ===');
  ok('у каждого аккорда в каждом строе есть форма', rep.cover.length === 0, rep.cover.slice(0, 5).join(' | '));

  console.log('\n=== 3. Чужие ноты (независимый пересчёт) ===');
  console.log(`      (справочно: dim-грифов с каноническим ♭♭7 — штатно: ${rep.dimColor})`);
  ok('чужих нет — ♭♭7-окраска только у dim', rep.foreign.length === 0, rep.foreign.slice(0, 5).join(' | '));

  console.log('\n=== 4. Согласованность с воротами resolve ===');
  ok('все формы проходят shapeMatchesChord (с учётом dim-допуска)', rep.gate.length === 0, rep.gate.slice(0, 5).join(' | '));

  console.log('\n=== 4б. Канонический ♭♭7-гриф доезжает до всех «линейных» строёв ===');
  console.log(`      (в Open/DADGAD гриф не переживает перестройку — физика, не потеря; цвет там: ${rep.dimOpenColor.length ? rep.dimOpenColor.join(', ') : 'нет, как ожидается'})`);
  ok('Standard/Drop-строи имеют dim-цвет у Cdim и F#dim', rep.dimLinear.length === 0, rep.dimLinear.join(' | '));

  console.log('\n=== 5. Слэш-аккорды держат бас ===');
  ok('дефолтная форма каждого слэша в каждом строе имеет бас слэша', rep.bass.length === 0, rep.bass.slice(0, 5).join(' | '));

  console.log('\n=== 6. Звук считается от строя песни ===');
  ok('все частоты = строй × 2^(лад/12)', rep.sound.length === 0, rep.sound.slice(0, 5).join(' | '));

  console.log('\n=== 7. Изоляция кэша между строями ===');
  ok('стандартный строй до и после круга — побайтово тот же',
    rep.stdBefore === rep.stdAfter, 'снимки разошлись');

  ok('страница без JS-ошибок', errs.length === 0, errs.slice(0, 3).join(' | '));
  await b.close();
  console.log(bad ? `\nПРОВАЛОВ: ${bad}` : '\nвсе проверки пройдены');
  process.exitCode = bad ? 1 : 0;
})();
