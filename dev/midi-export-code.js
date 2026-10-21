// ---------- E4: Standard MIDI File format 1, локальный писатель ----------
// Один conductor track + один track на слышимый канал. PPQ 960 точно хранит
// 1/64 и триоли. Источник порядка — тот же чистый обход, что у транспорта.
  function midiExportBuild(songData, report) {
    const ppq = 960;
    const tracks = [];
    const conductor = [];
    const sourceParts = songData.parts || [];
    const solo = sourceParts.some(p => p.mix && p.mix.solo);
    const masterMute = songData.mix && songData.mix.master && songData.mix.master.mute;
    const audible = mix => !masterMute && !(mix && mix.mute);
    const makeTrack = (name, instrument, mix, program, tuning, capo, source) => {
      const track = { name, instrument, mix: mix || {}, program, tuning, capo: Number(capo) || 0, source, notes: [], programs: [] };
      tracks.push(track); return track;
    };
    const songTrack = !solo && audible(songData.mix)
      ? makeTrack('Песня', 'guitar', songData.mix, gpExportSongProgram(songData.sound), gpExportSongTuning(songData), songData.capo) : null;
    const partTracks = sourceParts.filter(p => audible(p.mix) && (!solo || p.mix && p.mix.solo)).map(p => {
      const inst = partInstrumentId(p);
      return makeTrack(p.name || 'Дорожка', inst, p.mix,
        Number.isInteger(p.gmProgram) ? p.gmProgram : inst === 'bass' ? 32 : inst === 'guitar' ? gpExportSongProgram(p.sound) : 0,
        partTuningNotes(p), p.capo, p);
    });
    if (tracks.filter(t => t.instrument !== 'drums').length > 15) {
      throw new Error('MIDI поддерживает 15 мелодических каналов и канал ударных. Уберите лишние дорожки из микса.');
    }
    let channel = 0;
    tracks.forEach(t => { if (channel === 9) channel++; t.channel = t.instrument === 'drums' ? 9 : channel++; });
    const add = (track, note, start, unit, localStart = 0, duration = Number(note.dur)) => {
      if (!track || note.pause) return;
      const open = tunerNoteToMidi(track.tuning[note.string]);
      const pitch = Number.isInteger(note.pitch) ? note.pitch
        : open === null ? null : open + Number(note.fret) + track.capo;
      if (!Number.isInteger(pitch) || pitch < 0 || pitch > 127) {
        gpExportLoss(report, `Дорожка «${track.name}»: нота вне диапазона MIDI пропущена`, 1); return;
      }
      const at = Math.round((start + localStart * unit) * ppq);
      const end = Math.round((start + (localStart + duration) * unit) * ppq);
      if (end <= at) return;
      track.notes.push({ at, end, pitch, velocity: Math.max(1, Math.min(127, Number(note.velocity) || 90)) });
      if (note.dead || note.bend || note.harm || note.slide || note.legato || note.trill || note.tremolo || note.grace) {
        gpExportLoss(report, 'MIDI: приёмы записаны основными нотами без гитарного звукоизвлечения', 1);
      }
    };
    let si = 0, sqi = 0, ei = 0, position = 0, walk = structureWalkState();
    const sr = {}, qr = {};
    let lastBpm = null, lastTs = null, lastSection = null, done = false;
    const rolls = new Map();
    for (let guard = 0; guard < 100000; guard++) {
      const next = findNextEvent(si, sqi, ei, sr, qr, walk, { noLoop: true });
      if (!next) { done = true; break; }
      const sec = next.section, sq = next.square, ev = next.event;
      const ts = sec.timeSig || songData.globalTimeSig || '4/4';
      const sig = parseTimeSig(ts), unit = 4 / sig.denominator;
      const bpm = Number(sec.bpm) || Number(songData.bpm) || 120;
      const at = Math.round(position * ppq);
      if (bpm !== lastBpm) { conductor.push({ at, type: 'tempo', bpm }); lastBpm = bpm; }
      if (ts !== lastTs) { conductor.push({ at, type: 'time', numerator: sig.numerator, denominator: sig.denominator }); lastTs = ts; }
      if (sec !== lastSection || (next.squareIndex === 0 && next.eventIndex === 0)) {
        conductor.push({ at, type: 'marker', text: sec.customName || sec.type || 'Секция' }); lastSection = sec;
      }
      const win = partEventWindowUnits(sec, sq, next.eventIndex);
      if (songTrack) {
        const program = gpExportSongProgram(songSoundAt(sec.id, win.start));
        if (!songTrack.programs.length || songTrack.programs[songTrack.programs.length - 1].program !== program) songTrack.programs.push({ at, program });
        if (sq.type === 'tab') {
          tabInsertCleanNotes(sq.notes, getSquareBeats(sq, ts), ts).forEach(n => add(songTrack, n, position, unit, n.start, tabInsertNoteDuration(n)));
        } else {
          const list = ev.notes && ev.notes.length
            ? accompCleanNotes(ev.notes, ev.span).map(n => ({ ...n, start: win.start + n.start }))
            : accompCellNotes(sec, sq, ev, next.eventIndex);
          list.forEach(n => add(songTrack, n, position, unit, n.start - win.start));
        }
      }
      for (const track of partTracks) {
        const p = track.source, key = `${p.id}:${sec.id}`;
        if (!rolls.has(key)) {
          const pitched = partUsesPitchNotes(p);
          rolls.set(key, pitched ? ((p.pitchRolls || {})[sec.id] || []) : ((p.rolls || {})[sec.id] || []));
        }
        for (const n of rolls.get(key)) {
          if (n.start >= win.start - 1e-9 && n.start < win.end - 1e-9) add(track, n, position, unit, n.start - win.start);
        }
      }
      position += getEventSpanInParentUnits(ev, ts) * unit;
      si = next.sectionIndex; sqi = next.squareIndex; ei = next.eventIndex + 1; walk = next.walk;
    }
    if (!done) throw new Error('Слишком длинный обход песни: MIDI не сохранён частично.');
    if (!(position > 0)) throw new Error('В песне нет времени — экспортировать нечего.');
    if ((songData.mix?.master?.volume ?? 100) !== 100 || (songData.mix?.master?.pan ?? 0) !== 0) gpExportLoss(report, 'MIDI: мастер-громкость и мастер-панорама не переносятся, настройте их в DAW');
    if (tracks.some(t => (t.mix.volume ?? 100) > 100)) gpExportLoss(report, 'MIDI: громкость выше 100 % записана как 100 %');
    gpExportLoss(report, 'MIDI не хранит аппликатуры, номера струн, звук синтеза, исполнительский свинг, EQ, реверберацию и оформление');
    if (songData.soundAuto && songData.soundAuto.length) gpExportGain(report, 'Смена гитарного тембра (приближение GM)', songTrack ? songTrack.programs.length : 0);
    if (sourceParts.some(p => p.soundAuto && p.soundAuto.length)) gpExportLoss(report, 'Автоматизация тембра партий в MIDI пока не переносится');
    return { ppq, tracks, conductor, end: Math.round(position * ppq) };
  }

  function midiExportWrite(model, report) {
    const u16 = n => [n >>> 8 & 255, n & 255];
    const u32 = n => [n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255];
    const text = s => Array.from(new TextEncoder().encode(String(s)));
    const vlq = n => {
      if (!Number.isSafeInteger(n) || n < 0 || n > 0x0fffffff) throw new Error('Время MIDI вне диапазона SMF.');
      const out = [n & 127]; while ((n = Math.floor(n / 128))) out.unshift((n & 127) | 128); return out;
    };
    const meta = (type, data) => [255, type, ...vlq(data.length), ...data];
    const chunk = events => {
      events.sort((a,b) => a.at - b.at || a.order - b.order);
      const bytes = []; let at = 0;
      for (const event of events) { bytes.push(...vlq(event.at - at), ...event.data); at = event.at; }
      bytes.push(...vlq(Math.max(0, model.end - at)), 255, 47, 0);
      return [...text('MTrk'), ...u32(bytes.length), ...bytes];
    };
    const conductor = model.conductor.map(e => {
      let data;
      if (e.type === 'tempo') { const micros = Math.round(60000000 / e.bpm); data = meta(81, u32(micros).slice(1)); }
      else if (e.type === 'time') data = meta(88, [e.numerator, Math.log2(e.denominator), e.denominator === 8 && e.numerator % 3 === 0 ? 36 : 24, 8]);
      else data = meta(6, text(e.text));
      return { at: e.at, order: 0, data };
    });
    conductor.unshift({ at: 0, order: -1, data: meta(3, text('Темп и размер')) });
    const chunks = [chunk(conductor)];
    let noteCount = 0;
    for (const track of model.tracks) {
      const ch = track.channel;
      const events = [{ at: 0, order: -3, data: meta(3, text(track.name)) },
        { at: 0, order: -2, data: [192 | ch, track.program] },
        { at: 0, order: -2, data: [176 | ch, 7, Math.round(Math.min(100, track.mix.volume ?? 100) * 1.27)] },
        { at: 0, order: -2, data: [176 | ch, 10, Math.round(((track.mix.pan ?? 0) + 100) * 127 / 200)] }];
      for (const p of track.programs) events.push({ at: p.at, order: -1, data: [192 | ch, p.program] });
      // Один MIDI-канал не различает унисон на двух струнах: одинаковое начало
      // объединяем, предыдущий хвост той же высоты обрываем новым ударом.
      const byPitch = new Map();
      for (const n of track.notes.sort((a,b) => a.at - b.at)) {
        const prev = byPitch.get(n.pitch);
        if (prev && prev.at === n.at) { prev.end = Math.max(prev.end, n.end); gpExportLoss(report, 'Унисон на одном MIDI-канале объединён', 1); continue; }
        if (prev && prev.end > n.at) { prev.end = n.at; gpExportLoss(report, 'Хвост той же MIDI-высоты укорочен перед новым ударом', 1); }
        byPitch.set(n.pitch, n);
      }
      // Ссылки на уже скорректированные интервалы, без повторов одного начала.
      const seen = new Set();
      for (const n of track.notes) {
        const key = `${n.at}:${n.pitch}`; if (seen.has(key)) continue; seen.add(key);
        events.push({ at: n.at, order: 1, data: [144 | ch, n.pitch, n.velocity] }, { at: n.end, order: 0, data: [128 | ch, n.pitch, 0] }); noteCount++;
      }
      chunks.push(chunk(events));
    }
    const header = [...text('MThd'), ...u32(6), ...u16(1), ...u16(chunks.length), ...u16(model.ppq)];
    const size = header.length + chunks.reduce((sum,c) => sum + c.length, 0);
    const bytes = new Uint8Array(size); bytes.set(header); let offset = header.length;
    for (const c of chunks) { bytes.set(c, offset); offset += c.length; }
    return { bytes, stats: { tracks: model.tracks.length, conductorTracks: 1, notes: noteCount, ticks: model.end, ppq: model.ppq } };
  }

  function midiExportRun() {
    const data = serializeCurrentSong({ includeGpAssetData: false });
    const report = { format: 'MIDI (.mid), SMF format 1', transferred: [], losses: [], fileName: gpExportFileBase(data) + '.mid' };
    const model = midiExportBuild(data, report), result = midiExportWrite(model, report);
    report.stats = result.stats; report.bytes = result.bytes.length;
    gpExportGain(report, 'Звучащие ноты', result.stats.notes);
    gpExportGain(report, 'Темп, размер и секции в conductor track', model.conductor.length);
    return { report, bytes: Array.from(result.bytes) };
  }
  window.midiExportBytes = midiExportRun;
  window.exportMidi = function () {
    try {
      const result = midiExportRun();
      gpExportDownload(Uint8Array.from(result.bytes), result.report.fileName);
      gpExportShowReport(result.report); return result.report;
    } catch (error) { showToast(`Экспорт MIDI не удался: ${error.message}`); return null; }
  };
