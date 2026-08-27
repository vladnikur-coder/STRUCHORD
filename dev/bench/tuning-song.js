// Строй как ПАРАМЕТР ПЕСНИ: влияет на подбор аппликатур, их оценку,
// разбор формы и синтез звука; сохраняется в файл.
//
// До этой работы строй жил только в тюнере и задавал шесть эталонных
// нот. Всё остальное было прибито к EADGBE пятью копиями массива
// ['E','A','D','G','B','E'] и таблицей STRING_OPEN_FREQ: в Drop D
// приложение показывало и играло аккорды для стандартного строя.
const puppeteer = require('puppeteer');

let bad = 0;
const ok = (n, c, x) => { console.log(`   ${c ? 'ok  ' : 'FAIL'} ${n}${!c && x !== undefined ? ' — ' + x : ''}`); if (!c) bad++; };

(async () => {
  const b = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--allow-file-access-from-files'],
    protocolTimeout: 60000,
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  // saveCurrentSong при повторном сохранении песни с тем же именем
  // спрашивает подтверждение через window.confirm — в puppeteer диалог
  // никто не закрывает, и evaluate висит до таймаута. Соглашаемся.
  p.on('dialog', (d) => d.accept());
  await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1000));

  console.log('=== 1. Единый источник нот струн ===');
  const src = await p.evaluate(() => {
    const out = {};
    tunerTuningId = 'e-std'; fingeringCache.clear();
    out.std = { notes: songStringNotes().join(' '), freq: songStringFreqs().map((f) => +f.toFixed(1)) };
    tunerTuningId = 'drop-d'; fingeringCache.clear();
    out.drop = { notes: songStringNotes().join(' '), freq: songStringFreqs().map((f) => +f.toFixed(1)) };
    tunerTuningId = 'e-std'; fingeringCache.clear();
    return out;
  });
  console.log('      станд:', src.std.notes, '|', src.std.freq.join(' '));
  console.log('      DropD:', src.drop.notes, '|', src.drop.freq.join(' '));
  ok('стандартный строй EADGBE', src.std.notes === 'E A D G B E', src.std.notes);
  ok('Drop D меняет шестую ноту', src.drop.notes === 'D A D G B E', src.drop.notes);
  // Звук: 82.41 -> 73.42 Гц. Без этого на грифе нарисовано D, а слышно E.
  ok('и её частоту', Math.abs(src.drop.freq[0] - 73.4) < 0.2, String(src.drop.freq[0]));
  ok('остальные струны не тронуты',
    src.std.freq.slice(1).join() === src.drop.freq.slice(1).join());

  console.log('\n=== 2. Аппликатуры считаются от строя ===');
  // В Drop D шестая струна даёт D, и открытый D может звучать на шести
  // струнах вместо четырёх.
  const shapes = await p.evaluate(() => {
    const at = (t, ch) => {
      tunerTuningId = t; fingeringCache.clear();
      return window.getFingeringVariants(ch, 'C').shapes[0].join(',');
    };
    const res = { stdD: at('e-std', 'D'), dropD: at('drop-d', 'D') };
    tunerTuningId = 'e-std'; fingeringCache.clear();
    return res;
  });
  console.log('      D: станд', shapes.stdD, '| Drop D', shapes.dropD);
  ok('форма меняется вместе со строем', shapes.stdD !== shapes.dropD,
    `${shapes.stdD} = ${shapes.dropD}`);

  console.log('\n=== 3. Ни один строй не даёт ЧУЖИХ нот ===');
  // Главная проверка. Таблицы OPEN_CHORDS и CAGED_SHAPES записаны
  // ЛАДАМИ для стандартного строя: в Open G те же лады давали C как
  // x,3,2,0,1,0 — со звучащими A# и D, то есть другой аккорд.
  const purity = await p.evaluate(() => {
    const check = (t) => {
      tunerTuningId = t; fingeringCache.clear();
      const sn = songStringNotes();
      const bad = [];
      for (const rt of ['C', 'D', 'E', 'F', 'G', 'A', 'B'])
        for (const ty of ['', 'm', '7', 'm7', 'sus4', 'maj7']) {
          const ch = rt + ty;
          const notes = (getChordNotes(ch, getKeyStyle('C')) || [])
            .map((n) => toSharpNote(n.replace(/\d+$/, '')));
          if (!notes.length) continue;
          const f = window.getFingeringVariants(ch, 'C').shapes[0];
          if (!f) continue;
          const have = new Set();
          f.forEach((x, i) => { if (x === 'x') return;
            have.add(CHROMATIC[(CHROMATIC.indexOf(sn[i]) + x) % 12]); });
          const alien = [...have].filter((n) => !notes.includes(n));
          if (alien.length) bad.push(`${ch} ${f.join(',')} лишнее ${alien.join(',')}`);
        }
      return bad;
    };
    const out = {};
    for (const t of ['e-std', 'eb-std', 'd-std', 'drop-d', 'drop-c', 'drop-g',
                     'open-g', 'open-d', 'open-e', 'dadgad', 'b-std']) out[t] = check(t);
    tunerTuningId = 'e-std'; fingeringCache.clear();
    return out;
  });
  Object.entries(purity).forEach(([t, list]) => {
    ok(`${t}: чужих нот нет`, list.length === 0, list.slice(0, 2).join(' | '));
  });

  console.log('\n=== 4. Строй сохраняется в песне ===');
  const save = await p.evaluate(async () => {
    sections = [{ id: 1, type: 'Verse', repeat: 1, squares: [{ id: 1, repeat: 1,
      events: [{ chord: 'D', span: 4 }] }] }];
    nextId = 9;
    document.getElementById('songTitle').value = 'ТестСтрой';
    tunerTuningId = 'drop-c'; tunerCustomNotes = null;
    fingeringCache.clear(); renderTuningPill(); render();
    await new Promise((x) => setTimeout(x, 300));
    saveCurrentSong();
    await new Promise((x) => setTimeout(x, 300));
    const stored = JSON.parse(localStorage.getItem('struchord_songs'))[0];
    // Сбрасываем на стандартный и грузим обратно.
    tunerTuningId = 'e-std'; fingeringCache.clear(); render();
    await new Promise((x) => setTimeout(x, 200));
    loadSong(0);
    await new Promise((x) => setTimeout(x, 500));
    return { inFile: stored.tuning, afterLoad: tunerTuningId,
      pill: document.getElementById('tuningPill').textContent.trim().replace(/\s+/g, ' ') };
  });
  console.log('   ', JSON.stringify(save));
  ok('строй записан в файл', save.inFile === 'drop-c', String(save.inFile));
  ok('и восстановлен при загрузке', save.afterLoad === 'drop-c', String(save.afterLoad));
  ok('плашка показывает загруженный строй', /Drop C/.test(save.pill), save.pill);

  console.log('\n=== 5. Ручной строй тоже переживает сохранение ===');
  // У собранного стрелками строя нет id — сохраняются сами ноты.
  const custom = await p.evaluate(async () => {
    // Своё имя: иначе saveCurrentSong увидит песню из раздела 4 и
    // спросит подтверждение перезаписи.
    document.getElementById('songTitle').value = 'ТестРучной';
    tunerTuningId = 'e-std';
    tunerCustomNotes = ['D2', 'A2', 'D3', 'G3', 'A3', 'D4']; // DADGAD вручную
    fingeringCache.clear(); renderTuningPill();
    saveCurrentSong();
    await new Promise((x) => setTimeout(x, 300));
    const all = JSON.parse(localStorage.getItem('struchord_songs'));
    const idx = all.findIndex((x) => x.name === 'ТестРучной');
    const stored = all[idx];
    tunerCustomNotes = null; fingeringCache.clear();
    loadSong(idx);
    await new Promise((x) => setTimeout(x, 500));
    return { inFile: stored.tuningNotes, afterLoad: tunerCustomNotes,
      notes: songStringNotes().join(' '), idx };
  });
  console.log('   ', JSON.stringify(custom));
  ok('свои ноты записаны', Array.isArray(custom.inFile) && custom.inFile.length === 6,
    JSON.stringify(custom.inFile));
  ok('и восстановлены', custom.notes === 'D A D G A D', custom.notes);

  console.log('\n=== 6. Битый строй из файла не ломает подбор ===');
  // Файл — недоверенный ввод: подсунутый мусор должен откатываться на
  // стандартный строй, а не сыпать ошибками в подборе форм.
  const dirty = await p.evaluate(async () => {
    const songs = JSON.parse(localStorage.getItem('struchord_songs'));
    const idx = songs.findIndex((x) => x.name === 'ТестРучной');
    songs[idx].tuning = 'нет-такого';
    songs[idx].tuningNotes = ['ЫЫ', 42, null, 'D3', 'B3', 'E4'];
    localStorage.setItem('struchord_songs', JSON.stringify(songs));
    loadSong(idx);
    await new Promise((x) => setTimeout(x, 500));
    return { tuning: tunerTuningId, custom: tunerCustomNotes,
      notes: songStringNotes().join(' '),
      shape: window.getFingeringVariants('Am', 'C').shapes[0].join(',') };
  });
  console.log('   ', JSON.stringify(dirty));
  ok('битый id откатился на стандарт', dirty.tuning === 'e-std', dirty.tuning);
  ok('битые ноты отброшены', dirty.custom === null, JSON.stringify(dirty.custom));
  ok('подбор работает', dirty.shape === 'x,0,2,2,1,0', dirty.shape);

  ok('ошибок страницы нет', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё зелено');
  await b.close();
})();
