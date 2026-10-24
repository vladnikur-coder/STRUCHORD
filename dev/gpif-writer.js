/*
 * STRUCHORD Guitar Pro GPIF writer.
 *
 * Builds a `score.gpif` (Guitar Pro 6.0 file format, XML) from a plain song
 * model: bars, sections, tracks, notes, mixer and metadata. The result is meant
 * to be packed into a BCFS/BCFZ container by gpx-bcfz-runtime.js, which the
 * application already uses to read `.gpx` files — so the exported file is
 * readable by the application's own importer and by Guitar Pro 6/7.
 *
 * Structure (verified against a real Guitar Pro 6 file):
 *   GPIF > Score | MasterTrack (Tracks + Tempo automations)
 *        | Tracks (Track > Name/Staves/GeneralMidi/RSE/Properties)
 *        | MasterBars (Key/Time/Bars/Section)
 *        | Bars (Bar > Voices/Clef) | Voices | Beats | Notes | Rhythms
 *
 * Written for this project; no runtime dependency, network access or platform
 * API is used. The browser build is embedded in STRUCHORD.html as an inert
 * script and is activated only when a song is exported to Guitar Pro.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StruchordGpifWriter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const GP_VERSION = '6';
  const GP_REVISION_REQUIRED = '12024';
  const GP_REVISION_RECOMMENDED = '13000';
  const GP_REVISION = '13007';

  // Note lengths of Guitar Pro: whole notes down to 256th notes, in quarter
  // notes ("доли"). Dots multiply by 1.5 / 1.75, triplets by 2/3.
  // Длительность в долях такта и имя NoteValue в GPIF: Quarter — это одна
  // доля, Half — две, Whole — четыре (сверено круговой приёмкой).
  const NOTE_VALUES = [
    [16, 'Long'], [8, 'DoubleWhole'], [4, 'Whole'], [2, 'Half'], [1, 'Quarter'],
    [0.5, 'Eighth'], [0.25, '16th'], [0.125, '32nd'], [0.0625, '64th'],
    [0.03125, '128th'], [0.015625, '256th'],
  ];
  const DOT_FACTORS = [1, 1.5, 1.75];

  const SHARPS_BY_KEY = {
    Cb: -7, Gb: -6, Db: -5, Ab: -4, Eb: -3, Bb: -2, F: -1, C: 0, G: 1, D: 2, A: 3,
    E: 4, B: 5, Fs: 6, Cb2: -7, 'F#': 6, 'C#': 7, 'G#': 8,
  };
  const MINOR_KEYS = new Set(['Am', 'Em', 'Bm', 'F#m', 'C#m', 'D#m', 'Gm', 'Cm', 'Dm', 'Gmaj', 'Emaj', 'Cmin', 'Fmin', 'Bmin']);

  const FINGER_NAMES = {
    thumb: 'Thumb', index: 'Index', middle: 'Middle', ring: 'Ring', pinky: 'Pinky', unknown: null,
  };

  const EPS = 1e-6;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function round(value, digits) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  function cdata(text) {
    const value = String(text === null || text === undefined ? '' : text);
    // "]]>" cannot live inside CDATA, so the run is split.
    return `<![CDATA[${value.split(']]>').join(']]]]><![CDATA[>')}]]>`;
  }

  function accCount(key) {
    const value = String(key || 'C').trim();
    if (Object.prototype.hasOwnProperty.call(SHARPS_BY_KEY, value)) return SHARPS_BY_KEY[value];
    if (Object.prototype.hasOwnProperty.call(SHARPS_BY_KEY, value.replace('b', 'b'))) {
      return SHARPS_BY_KEY[value.replace('b', 'b')];
    }
    const alt = value.replace('#', 's');
    if (Object.prototype.hasOwnProperty.call(SHARPS_BY_KEY, alt)) return SHARPS_BY_KEY[alt];
    return 0;
  }

  function isMinorKey(key) {
    const value = String(key || '').trim();
    if (MINOR_KEYS.has(value)) return true;
    return /^(.*)(m|M|min|maj|Мажор|минор)$/.test(value) ? /m(in|aj)?$/.test(value) : false;
  }

  function parseTimeSig(text) {
    const match = /^(\d+)\s*\/\s*(\d+)$/.exec(String(text || '4/4'));
    if (!match) return { numerator: 4, denominator: 4, text: '4/4' };
    const numerator = clamp(parseInt(match[1], 10) || 4, 1, 32);
    const denominator = [1, 2, 4, 8, 16, 32].includes(parseInt(match[2], 10)) ? parseInt(match[2], 10) : 4;
    return { numerator, denominator, text: `${numerator}/${denominator}` };
  }

  // Song pitch of a tuning string like "E2" — the same mapping the application
  // uses for its own tuning tables.
  function tuningPitch(note) {
    const match = /^([A-G][#b]?)(-?\d)$/.exec(String(note || '').trim());
    if (!match) return null;
    const steps = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
    const value = steps[match[1]];
    if (value === undefined) return null;
    return (parseInt(match[2], 10) + 1) * 12 + value;
  }

  function defaultTuning(instrument) {
    return instrument === 'bass'
      ? ['E1', 'A1', 'D2', 'G2']
      : ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'];
  }

  // Длительность в долях такта → NoteValue, точки и, если нужно, триоль.
  // Guitar Pro хранит триоль как PrimaryTuplet num="3" den="2": длительность
  // берётся от NoteValue и умножается на 2/3.
  function encodeLength(length) {
    for (const [value, name] of NOTE_VALUES) {
      for (let dots = DOT_FACTORS.length - 1; dots >= 0; dots--) {
        const plain = value * DOT_FACTORS[dots];
        if (Math.abs(plain - length) < EPS) return { name, dots, triplet: false };
      }
    }
    for (const [value, name] of NOTE_VALUES) {
      for (let dots = DOT_FACTORS.length - 1; dots >= 0; dots--) {
        const triplet = value * DOT_FACTORS[dots] * 2 / 3;
        if (Math.abs(triplet - length) < EPS) return { name, dots, triplet: true };
      }
    }
    return null;
  }

  function buildTrackLayout() {
    let noteId = 0;
    let beatId = 0;
    let voiceId = 0;
    let rhythmId = 0;
    const rhythms = [];
    const rhythmIndex = new Map();

    function rhythmKey(encoded) {
      return `${encoded.name}|${encoded.dots}|${encoded.triplet ? 1 : 0}`;
    }

    function rhythmRef(encoded) {
      const key = rhythmKey(encoded);
      if (rhythmIndex.has(key)) return rhythmIndex.get(key);
      const id = rhythmId++;
      rhythmIndex.set(key, id);
      rhythms.push({ id, encoded });
      return id;
    }

    return {
      notes: [],
      beats: [],
      voices: [],
      nextNoteId: () => noteId++,
      nextBeatId: () => beatId++,
      nextVoiceId: () => voiceId++,
      rhythmRef,
      rhythms,
    };
  }

  function xmlEscape(text) {
    return String(text === null || text === undefined ? '' : text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Every note length of the application is a multiple of a 1/48 quarter note:
  // 1/16 = 3/48, a triplet quarter = 32/48, a double dotted eighth = 21/48.
  const GRID_UNITS = 48;

  function greatestCommonDivisor(a, b) {
    let left = Math.abs(Math.trunc(a));
    let right = Math.abs(Math.trunc(b));
    while (right) {
      const rest = left % right;
      left = right;
      right = rest;
    }
    return left;
  }

  /**
   * Build the beat grid of one bar for one voice.
   *
   * Guitar Pro needs a continuous sequence of beats covering the bar, and each
   * note must start on a beat boundary and last exactly as long as that beat, so
   * the step is the greatest common divisor of all starts and lengths measured
   * in 1/48 quarter notes. Such a step is always expressible as a Guitar Pro
   * rhythm (a power of two, optionally dotted, optionally a 2:3 triplet).
   */
  function gridStep(barQuarters, entries) {
    let step = 0;
    for (const entry of entries) {
      const values = [
        Math.round(entry.start * GRID_UNITS),
        Math.round(entry.duration * GRID_UNITS),
      ];
      for (const value of values) if (value > 0) step = step ? greatestCommonDivisor(step, value) : value;
    }
    const barUnits = Math.round(barQuarters * GRID_UNITS);
    if (!step) step = barUnits;
    // Round off the noise of floating point arithmetic (0.6666666… → 32).
    while (step > 1 && !Number.isInteger(barUnits / step)) step = greatestCommonDivisor(step, barUnits);
    return Math.max(1, step);
  }

  function writeGPIF(model, options) {
    const settings = options || {};
    const losses = [];
    const loss = (label, count) => {
      const key = String(label || 'Другие данные').trim();
      const amount = Number.isFinite(count) ? Math.max(1, Math.trunc(count)) : 1;
      losses.push({ label: key, count: (losses.find((item) => item.label === key) || { count: 0 }).count + amount });
    };
    const reportUnsupportedNoteEffects = (part, partIndex, note) => {
      const name = part.name || partIndex + 1;
      const unsupported = [];
      if (note.tabEffects) {
        if (note.harm?.type === 'artificial' && note.harmonicFret == null) loss(`Дорожка «${name}»: GPIF — искусственный флажолет вне поддержанных узлов записан октавным`,1);
        if (note.bend?.points?.length > 4 || (note.bend?.points?.length === 4 && note.bend.points[1][1] !== note.bend.points[2][1])) loss(`Дорожка «${name}»: GPIF — сложная кривая бенда приближена четырьмя опорными точками`,1);
        return;
      }
      if (note.pm === true) unsupported.push('palm mute');
      if (note.dead === true) unsupported.push('dead note');
      if (note.deadSlap === true) unsupported.push('dead slap');
      if (note.pickScrape === true) unsupported.push('pick scrape');
      if (note.bend) unsupported.push('bend curve');
      if (note.harm) unsupported.push('harmonic');
      if (note.grace) unsupported.push('grace note');
      if (note.slide) unsupported.push('slide');
      if (note.trill === true) unsupported.push('trill');
      if (note.tremolo === true) unsupported.push('tremolo picking');
      if (note.tremBar === true) unsupported.push('tremolo-bar mark');
      if (note.fade === 'in' || note.fade === 'out') unsupported.push('fade mark');
      if (note.ornament) unsupported.push('ornament');
      if (Number(note.accent) === 2) unsupported.push('strong accent strength');
      const articulationCount = [note.staccato === true, Number(note.accent) > 0, note.tenuto === true].filter(Boolean).length;
      if (articulationCount > 1) unsupported.push('combined staccato/accent/tenuto (writer keeps one articulation)');
      unsupported.forEach((effect) => loss(`Дорожка «${name}»: ${effect} не кодируется текущим GPIF-писателем`, 1));
    };

    const song = model || {};
    const meta = song.meta || {};
    const bars = Array.isArray(song.bars) ? song.bars : [];
    const parts = Array.isArray(song.parts) ? song.parts : [];
    const layout = buildTrackLayout();
    const trackRows = [];
    const masterBars = [];
    const barNodes = [];
    const notesByBar = new Map();

    // --- bars, sections and tempo ------------------------------------------
    let globalBpm = Number(song.bpm) || 120;
    let barIndex = 0;
    for (const bar of bars) {
      const signature = parseTimeSig(bar.timeSig || song.timeSig);
      const unitsPerQuarter = signature.denominator / 4;
      const unitsPerBar = bar.unitsPerBar || signature.numerator * (bar.unitSpan || 1);
      const barQuarters = unitsPerBar / unitsPerQuarter;
      notesByBar.set(barIndex, {
        bar, signature, unitsPerQuarter, unitsPerBar, barQuarters, index: barIndex,
      });
      barIndex += 1;
    }
    const totalBars = barIndex;

    // Один MasterBar — один такт; Bars содержит по одному Bar на дорожку.
    const sections = Array.isArray(song.sections) ? song.sections : [];
    let cursor = 0;
    for (const section of sections) {
      const count = Math.max(0, Number(section.barCount) || 0);
      const repeat = Math.max(1, Number(section.repeat) || 1);
      const info = notesByBar.get(cursor);
      const signature = parseTimeSig((info && info.bar.timeSig) || section.timeSig || song.timeSig);
      const key = String(section.key || song.key || 'C');
      const trackTotal = Math.max(1, (Array.isArray(song.parts) ? song.parts.length : 0));
      const newMasterBar = (withSection) => {
        masterBars.push({
          text: signature.text,
          accidentalCount: accCount(key),
          mode: isMinorKey(key) ? 'Minor' : 'Major',
          sharps: accCount(key) < 0 ? 'Flats' : 'Sharps',
          section: withSection && section.type && section.type !== 'Custom' ? section.type : (withSection ? (section.name || '') : ''),
          sectionText: withSection ? (section.name || '') : '',
          bars: [],
          bpm: Number(section.bpm) || globalBpm,
        });
        return masterBars[masterBars.length - 1];
      };
      // Повтор секции в GPIF записывается копиями тактов: отдельные MasterBar
      // на каждый повтор с собственными копиями нот.
      for (let pass = 0; pass < repeat; pass++) {
        for (let index = 0; index < count && cursor < totalBars; index++) {
          const master = newMasterBar(pass === 0 && index === 0);
          for (let track = 0; track < trackTotal; track++) {
            master.bars.push(cursor * trackTotal + track);
          }
          cursor += 1;
        }
      }
    }
    while (masterBars.length && masterBars[masterBars.length - 1].bars.length === 0) masterBars.pop();
    for (; cursor < totalBars; cursor++) {
      const info = notesByBar.get(cursor);
      const key = String(song.key || 'C');
      const signature = parseTimeSig((info && info.bar.timeSig) || song.timeSig);
      const tailTracks = Math.max(1, (Array.isArray(song.parts) ? song.parts.length : 0));
      masterBars.push({
        text: signature.text,
        accidentalCount: accCount(key),
        mode: isMinorKey(key) ? 'Minor' : 'Major',
        sharps: accCount(key) < 0 ? 'Flats' : 'Sharps',
        section: '',
        sectionText: '',
        bars: Array.from({ length: tailTracks }, (unused, track) => cursor * tailTracks + track),
        repeat: 1,
        bpm: null,
      });
    }

    // --- tracks -------------------------------------------------------------
    const tempoChanges = [];
    parts.forEach((part, partIndex) => {
      const instrument = part.instrument || 'guitar';
      const isTab = instrument === 'guitar' || instrument === 'bass';
      const defaultView = isTab ? 'tab' : 'staff';
      if ((part.viewMode === 'staff' || part.viewMode === 'tab') && part.viewMode !== defaultView) {
        loss(`Дорожка «${part.name || partIndex + 1}»: выбранный вид ${part.viewMode} не кодируется текущим GPIF-писателем`, 1);
      }
      const tuning = Array.isArray(part.tuning) && part.tuning.length ? part.tuning.slice() : defaultTuning(instrument);
      const tuningPitches = tuning.map(tuningPitch);
      if (tuningPitches.some((pitch) => pitch === null)) {
        loss(`Дорожка «${part.name || partIndex + 1}»: строй не распознан, записан пресет GP`);
      }
      const gmProgram = Number.isInteger(part.gmProgram) && part.gmProgram >= 0 && part.gmProgram <= 127
        ? part.gmProgram : null;
      const primaryChannel = Number.isInteger(part.midiChannel) && part.midiChannel >= 1 && part.midiChannel <= 16
        ? part.midiChannel : partIndex + 1;
      const secondaryChannel = primaryChannel === 16 ? 1 : primaryChannel + 1;
      const volume = part.mix && Number.isFinite(Number(part.mix.volume)) ? clamp(Number(part.mix.volume), 0, 150) : 100;
      const pan = part.mix && Number.isFinite(Number(part.mix.pan)) ? clamp(Number(part.mix.pan), -100, 100) : 0;
      const isPercussion = instrument === 'drums';

      trackRows.push({ part, partIndex, isTab, tuning, gmProgram, primaryChannel, secondaryChannel, volume, pan, isPercussion });

      for (const note of part.notes || []) {
        const info = notesByBar.get(note.bar);
        if (!info) { loss(`Дорожка «${part.name}»: нота вне песни пропущена`, 1); continue; }
        if (!notesByBar.get(note.bar).list) notesByBar.get(note.bar).list = [];
        const quarters = note.start / info.unitsPerQuarter;
        const duration = note.dur / info.unitsPerQuarter;
        if (!(duration > EPS)) { loss(`Дорожка «${part.name}»: нота нулевой длительности пропущена`, 1); continue; }
        let string = null;
        let fret = null;
        if (isTab) {
          string = Number(note.string);
          fret = Number(note.fret);
          if (!Number.isInteger(string) || string < 0 || string >= tuning.length || !Number.isFinite(fret) || fret < 0) {
            loss(`Дорожка «${part.name}»: нота вне грифа партии не показана табулатурой`, 1);
            continue;
          }
          // В GPIF строка дорожки нумеруется 0 снизу вверх — ровно как line
          // приложения; при чтении GP добавляет единицу сам.
          string = string;
        } else {
          string = 1;
          fret = Number(note.pitch);
          if (!Number.isFinite(fret) || fret < 0 || fret > 127) {
            loss(`Дорожка «${part.name}»: высота ноты вне MIDI-диапазона`, 1);
            continue;
          }
        }
        if (!info.list) info.list = [];
        reportUnsupportedNoteEffects(part, partIndex, note);
        info.list.push({
          partIndex, voice: clamp(Number(note.voice) || 1, 1, 4), start: quarters,
          duration, string, fret, note, noteKey: `p${partIndex}b${info.index}n${info.list.length}`,
        });
      }
    });

    // --- beats, voices, notes ----------------------------------------------
    const barRows = [];
    for (let index = 0; index < totalBars; index++) {
      const info = notesByBar.get(index);
      const perTrack = new Map();
      for (const track of trackRows) perTrack.set(track.partIndex, []);
      for (const entry of info.list || []) {
        if (!perTrack.has(entry.partIndex)) perTrack.set(entry.partIndex, []);
        perTrack.get(entry.partIndex).push(entry);
      }
      barRows.push({ info, perTrack });
    }

    // Порядок id баров в Guitar Pro: сначала все дорожки одного такта, затем
    // следующий такт (так же в настоящем файле: MasterBar перечисляет 0 1 2).
    for (const track of trackRows) {
      for (let index = 0; index < totalBars; index++) {
        const { info, perTrack } = barRows[index];
        const entries = perTrack.get(track.partIndex) || [];
        const barId = index * trackRows.length + track.partIndex;
        const voices = [];
        const grouped = new Map();
        for (const entry of entries) {
          if (!grouped.has(entry.voice)) grouped.set(entry.voice, []);
          grouped.get(entry.voice).push(entry);
        }
        const voiceCount = Math.max(1, ...(track.part.notes || []).map(n => clamp(Number(n.voice) || 1, 1, 4)));
        for (let voice = 1; voice <= voiceCount; voice++) if (!grouped.has(voice)) grouped.set(voice, []);
        const voiceIds = [];
        for (const [voice, list] of Array.from(grouped.entries()).sort((a, b) => a[0] - b[0])) {
          const beats = [];
          const units = gridStep(info.barQuarters, list);
          const barUnits = Math.round(info.barQuarters * GRID_UNITS);
          const steps = Math.max(1, Math.round(barUnits / units));
          // Нота не может перекрывать другую ноту внутри одной доли GP, а
          // позиции должны сохраниться, поэтому такт режется границами
          // событий (начала и концы нот). Соседние куски одной и той же ноты
          // объединяем обратно, паузы записываем пустыми долями, а ноту,
          // которую нельзя записать одним ритмом, — связкой <Tie>.
          const boundaries = new Set([0]);
          for (const entry of list) {
            boundaries.add(round(entry.start, 9));
            const end = round(entry.start + entry.duration, 9);
            if (end > EPS && end < info.barQuarters - EPS) boundaries.add(end);
          }
          const points = Array.from(boundaries).sort((a, b) => a - b);
          const segments = [];
          for (let pointIndex = 0; pointIndex < points.length; pointIndex++) {
            const segmentStart = points[pointIndex];
            const segmentEnd = pointIndex + 1 < points.length ? points[pointIndex + 1] : info.barQuarters;
            if (!(segmentEnd - segmentStart > EPS)) continue;
            const active = list.filter((entry) =>
              entry.start < segmentEnd - EPS && entry.start + entry.duration > segmentStart + EPS);
            segments.push({ start: segmentStart, end: segmentEnd, active });
          }
          // Связка нужна только когда нота звучит одновременно с другой: без
          // перекрытий Guitar Pro записывает такую ноту одним ритмом целиком.
          const overlapped = new Set();
          for (const segment of segments) {
            if (segment.active.length < 2) continue;
            for (const entry of segment.active) overlapped.add(entry.noteKey);
          }
          const groups = [];
          for (const segment of segments) {
            const key = segment.active.map((entry) => entry.noteKey).sort().join(',');
            const previous = groups[groups.length - 1];
            if (previous && previous.key === key) {
              previous.end = segment.end;
              continue;
            }
            groups.push({ start: segment.start, end: segment.end, key, active: segment.active });
          }
          // Остаток после триоли/точки может требовать нескольких пауз/лиг.
          const values = NOTE_VALUES.flatMap(([v]) => DOT_FACTORS.flatMap(f => [v*f, v*f*2/3])).sort((a,b) => b-a);
          const expanded = [];
          for (const group of groups) {
            let start = group.start;
            while (group.end - start > EPS) {
              const left = group.end - start;
              const size = encodeLength(left) ? left : values.find(v => v <= left + EPS);
              if (!size) { loss(`Дорожка «${track.part.name}»: невыразимый остаток ритма`, 1); break; }
              expanded.push({ ...group, start, end: start + size }); start += size;
            }
          }
          const partCounter = new Map();
          for (const group of expanded) {
            const length = round(group.end - group.start, 9);
            if (!(length > EPS)) continue;
            const encoded = encodeLength(length);
            if (!encoded) {
              loss(`Дорожка «${track.part.name}»: длительность ${length} доли не выражается в ритмах Guitar Pro`);
              continue;
            }
            const noteIds = [];
            for (const entry of group.active.sort((a, b) => String(a.string) - String(b.string))) {
              const id = layout.nextNoteId();
              const record = { id, ...entry };
              if (!track.isTab) record.pitchNote = true;
              if (track.isPercussion) record.percussion = true;
              const seen = partCounter.get(entry.noteKey) || 0;
              partCounter.set(entry.noteKey, seen + 1);
              const more = expanded.slice(expanded.indexOf(group) + 1).some(next => next.active.includes(entry));
              if (seen > 0 || entry.note.tieDestination) record.tieDestination = true;
              if (more || entry.note.tieOrigin) record.tieOrigin = true;
              layout.notes.push(record);
              noteIds.push(id);
            }
            const beat = { id: layout.nextBeatId(), rhythmRef: layout.rhythmRef(encoded), noteIds };
            layout.beats.push(beat);
            beats.push(beat.id);
          }
          const id = layout.nextVoiceId();
          layout.voices.push({ id, beats });
          voiceIds.push(id);
        }
        const clef = track.isPercussion ? 'Neutral' : (track.part.instrument === 'keys' ? 'C4' : 'G2');
        barNodes.push({ id: barId, voices: voiceIds, clef });
      }
    }

    // Tempo automation: one entry per bar whose tempo differs from the song.
    let previousBpm = null;
    masterBars.forEach((master, bar) => {
      const bpm = master.bpm || globalBpm;
      if (bpm !== previousBpm) tempoChanges.push({ bar, bpm });
      previousBpm = bpm;
    });

    // --- XML ----------------------------------------------------------------
    const out = [];
    out.push('<?xml version="1.0" encoding="UTF-8"?>');
    out.push('<GPIF>');
    out.push(`<GPVersion>${GP_VERSION}</GPVersion>`);
    out.push(`<GPRevision required="${GP_REVISION_REQUIRED}" recommended="${GP_REVISION_RECOMMENDED}">${GP_REVISION}</GPRevision>`);
    out.push('<Encoding>');
    out.push('<EncodingDescription>UTF-8</EncodingDescription>');
    out.push(`<Author>${xmlEscape('STRUCHORD')}</Author>`);
    out.push(`<Date>${cdata(new Date().toISOString())}</Date>`);
    out.push('</Encoding>');
    out.push('<Score>');
    out.push(`<Title>${cdata(meta.title || '')}</Title>`);
    out.push(`<SubTitle>${cdata(meta.subTitle || '')}</SubTitle>`);
    out.push(`<Artist>${cdata(meta.artist || '')}</Artist>`);
    out.push(`<Album>${cdata(meta.album || '')}</Album>`);
    out.push(`<Words>${cdata(meta.words || '')}</Words>`);
    out.push(`<Music>${cdata(meta.music || '')}</Music>`);
    out.push(`<WordsAndMusic>${cdata('')}</WordsAndMusic>`);
    out.push(`<Copyright>${cdata(meta.copyright || '')}</Copyright>`);
    out.push(`<Tabber>${cdata('')}</Tabber>`);
    out.push(`<Instructions>${cdata(settings.instructions || '')}</Instructions>`);
    out.push(`<Notices>${cdata(settings.notices || '')}</Notices>`);
    out.push(`<FirstPageHeader>${cdata('')}</FirstPageHeader>`);
    out.push(`<FirstPageFooter>${cdata('')}</FirstPageFooter>`);
    out.push(`<PageHeader>${cdata('')}</PageHeader>`);
    out.push(`<PageFooter>${cdata('')}</PageFooter>`);
    out.push('<ScoreSystemsDefaultLayout>3</ScoreSystemsDefaultLayout>');
    out.push('<ScoreSystemsLayout></ScoreSystemsLayout>');
    out.push('<ScoreZoomPolicy>Value</ScoreZoomPolicy>');
    out.push('<ScoreZoom>1</ScoreZoom>');
    out.push('<MultiVoice>1</MultiVoice>');
    out.push('</Score>');
    out.push('<PageSetup>');
    out.push('<PageWidth>22142</PageWidth>');
    out.push('<PageHeight>147510</PageHeight>');
    out.push('<PageOrientation>0</PageOrientation>');
    out.push('<PageMarginTop>1247</PageMarginTop>');
    out.push('<PageMarginLeft>1644</PageMarginLeft>');
    out.push('<PageMarginRight>1644</PageMarginRight>');
    out.push('<PageMarginBottom>1247</PageMarginBottom>');
    out.push('<PageScale>100</PageScale>');
    out.push('</PageSetup>');
    out.push('<MasterTrack>');
    out.push(`<Tracks>${trackRows.map((track) => track.partIndex).join(' ')}</Tracks>`);
    out.push('<Automations>');
    for (const change of tempoChanges) {
      out.push('<Automation>');
      out.push('<Type>Tempo</Type>');
      out.push('<Linear>false</Linear>');
      out.push(`<Bar>${change.bar}</Bar>`);
      out.push('<Position>0</Position>');
      out.push('<Visible>true</Visible>');
      // Второе число обязательно: при одном значении парсер берёт множитель 0.5
      // и темп получается вдвое тише (проверено круговой приёмкой).
      out.push(`<Value>${change.bpm} 2</Value>`);
      out.push('</Automation>');
    }
    out.push('</Automations>');
    out.push('<RSE>');
    out.push('<Master>');
    out.push('<Effect id="I01_VolumeAndPan">');
    out.push('<ByPass />');
    out.push('<Parameters>0.9 0.5</Parameters>');
    out.push('</Effect>');
    out.push('</Master>');
    out.push('</RSE>');
    out.push('</MasterTrack>');

    // Дорожки лежат в собственном узле <Tracks>: список id из MasterTrack
    // ссылается именно на них, без обёртки парсер не увидит ни одной.
    out.push('<Tracks>');
    for (const track of trackRows) {
      const { part } = track;
      out.push(`<Track id="${track.partIndex}">`);
      out.push(`<Name>${cdata(part.name || `Дорожка ${track.partIndex + 1}`)}</Name>`);
      out.push(`<ShortName>${cdata('')}</ShortName>`);
      out.push(`<Color>${track.partIndex % 3 === 0 ? '235 152 125' : track.partIndex % 3 === 1 ? '150 200 120' : '170 170 220'}</Color>`);
      out.push('<SystemsDefautLayout>3</SystemsDefautLayout>');
      out.push('<SystemsLayout></SystemsLayout>');
      out.push('<PlayingStyle>StringedPick</PlayingStyle>');
      out.push('<UseOneChannelPerString />');
      out.push(`<Instrument ref="${track.isPercussion ? 'd-drums' : track.isTab ? 'e-gtr6' : 'p-no-voc'}" />`);
      out.push('<InstrumentSet>');
      out.push(`<Name>${cdata(track.part.name || 'Track')}</Name>`);
      out.push(`<Type>${track.isPercussion ? 'drumKit' : 'pitched'}</Type>`);
      out.push('<LineCount>5</LineCount>');
      out.push('</InstrumentSet>');
      out.push('<PartSounding>');
      out.push(`<NominalKey>${xmlEscape(String(part.key || song.key || 'C'))}</NominalKey>`);
      out.push('<TranspositionPitch>0</TranspositionPitch>');
      out.push('</PartSounding>');
      // Микшер: Guitar Pro хранит панораму в параметре 12 и громкость в 13
      // канальной полосы, оба в нормированном виде 0…1. Настоящий GP читает их
      // как floor(16 * значение), поэтому пишем с тем же квантом 1/16: у нас
      // громкость 100 % → 1.0, панорама 0 → 0.5, края ±100 → 0 и 1.
      // Guitar Pro хранит громкость и панораму 17-ступенчатой шкалой (шаг 1/16),
      // поэтому округляем к ближайшей ступени, а не вниз: так круг точнее.
      const volumeNorm = round(Math.round(clamp(track.volume / 100, 0, 1) * 16) / 16, 6);
      const balanceNorm = round(Math.round(clamp(0.5 + track.pan / 200, 0, 1) * 16) / 16, 6);
      const parameters = [];
      for (let index = 0; index < 16; index++) parameters.push('0.5');
      parameters[9] = '0';
      parameters[11] = String(balanceNorm);
      parameters[12] = String(volumeNorm);
      out.push('<RSE>');
      out.push(`<ChannelStrip version="E56"><Parameters>${parameters.join(' ')}</Parameters></ChannelStrip>`);
      out.push('</RSE>');
      out.push(`<GeneralMidi table="${track.isPercussion ? 'Percussion' : 'Instrument'}">`);
      out.push(`<Program>${track.gmProgram === null ? 0 : track.gmProgram}</Program>`);
      out.push('<Port>0</Port>');
      out.push(`<PrimaryChannel>${track.primaryChannel}</PrimaryChannel>`);
      out.push(`<SecondaryChannel>${track.secondaryChannel}</SecondaryChannel>`);
      out.push('<ForeOneChannelPerString>false</ForeOneChannelPerString>');
      out.push('</GeneralMidi>');
      out.push('<PlaybackState>Default</PlaybackState>');
      out.push('<Lyrics dispatched="true">');
      const lyricsByLine = new Map();
      for (const lyric of part.lyrics || []) {
        const line = Math.max(1, Math.min(16, Math.trunc(Number(lyric.line) || 1)));
        if (!lyricsByLine.has(line)) lyricsByLine.set(line, []);
        lyricsByLine.get(line).push(lyric);
        if (Number(lyric.voice) > 1) {
          loss(`Дорожка «${part.name || partIndex + 1}»: GPIF-lyrics не сохраняют привязку к голосу`, 1);
        }
        if (Math.abs(Number(lyric.start) || 0) > EPS) {
          loss(`Дорожка «${part.name || partIndex + 1}»: GPIF-lyrics сохраняют начало по такту, но не внутритактовую позицию слога`, 1);
        }
      }
      const highestLyricLine = lyricsByLine.size ? Math.max(...lyricsByLine.keys()) : 0;
      for (let line = 1; line <= highestLyricLine; line++) {
        const entries = (lyricsByLine.get(line) || []).slice().sort((a, b) =>
          Number(a.bar) - Number(b.bar) || Number(a.start || 0) - Number(b.start || 0));
        const text = entries.map((lyric) => String(lyric.text || '').trim()).filter(Boolean).join(' ');
        if (!text && !lyricsByLine.has(line)) {
          out.push('<Line><Text><![CDATA[]]></Text><Offset>0</Offset></Line>');
          continue;
        }
        out.push('<Line>');
        out.push(`<Text>${cdata(text)}</Text>`);
        out.push(`<Offset>${Math.max(0, Math.trunc(Number(entries[0] && entries[0].bar) || 0))}</Offset>`);
        out.push('</Line>');
      }
      out.push('</Lyrics>');
      out.push('<Properties>');
      if (track.isTab) {
        const pitches = track.tuning.map(tuningPitch).filter((pitch) => pitch !== null);
        if (pitches.length === track.tuning.length) {
          out.push('<Property name="Tuning">');
          out.push(`<Pitches>${pitches.join(' ')}</Pitches>`);
          out.push('</Property>');
        }
      }
      const capo = Number(part.capo) || 0;
      if (capo > 0 && capo <= 24) {
        out.push('<Property name="CapoFret">');
        out.push(`<Fret>${Math.trunc(capo)}</Fret>`);
        out.push('</Property>');
      }
      out.push('</Properties>');
      out.push('</Track>');
    }
    out.push('</Tracks>');

    out.push('<MasterBars>');
    for (const master of masterBars) {
      out.push('<MasterBar>');
      out.push('<Key>');
      out.push(`<AccidentalCount>${master.accidentalCount}</AccidentalCount>`);
      out.push(`<Mode>${master.mode}</Mode>`);
      out.push(`<Sharps>${master.sharps}</Sharps>`);
      out.push('</Key>');
      out.push(`<Time>${master.text}</Time>`);
      out.push(`<Bars>${master.bars.join(' ')}</Bars>`);
      if (master.section || master.sectionText) {
        out.push('<Section>');
        out.push(`<Letter>${cdata(master.section || '')}</Letter>`);
        out.push(`<Text>${cdata(master.sectionText || master.section || '')}</Text>`);
        out.push('</Section>');
      }
      // Повторы уже развёрнуты копиями тактов, поэтому флаг повтора не
      // ставим: иначе настоящий Guitar Pro проиграет эти такты ещё раз.
      out.push('<Repeat start="false" end="false" />');
      out.push('</MasterBar>');
    }
    out.push('</MasterBars>');

    out.push('<Bars>');
    for (const bar of barNodes) {
      out.push(`<Bar id="${bar.id}">`);
      out.push(`<Voices>${bar.voices.join(' ')}</Voices>`);
      out.push(`<Clef>${bar.clef}</Clef>`);
      out.push('</Bar>');
    }
    out.push('</Bars>');

    out.push('<Voices>');
    for (const voice of layout.voices) {
      out.push(`<Voice id="${voice.id}">`);
      out.push(`<Beats>${voice.beats.join(' ')}</Beats>`);
      out.push('</Voice>');
    }
    out.push('</Voices>');

    const notesById = new Map(layout.notes.map(note => [note.id, note]));
    out.push('<Beats>');
    for (const beat of layout.beats) {
      out.push(`<Beat id="${beat.id}">`);
      if (beat.noteIds.length) out.push(`<Notes>${beat.noteIds.join(' ')}</Notes>`);
      if (beat.noteIds.some(id=>notesById.get(id)?.note?.phraseOrigin)) out.push('<Legato origin="true" destination="false" />');
      out.push(`<Rhythm ref="${beat.rhythmRef}" />`);
      out.push('</Beat>');
    }
    out.push('</Beats>');

    out.push('<Rhythms>');
    for (const rhythm of layout.rhythms) {
      const { encoded } = rhythm;
      out.push(`<Rhythm id="${rhythm.id}">`);
      out.push(`<NoteValue>${encoded.name}</NoteValue>`);
      if (encoded.dots) out.push(`<AugmentationDot count="${encoded.dots}" />`);
      if (encoded.triplet) out.push('<PrimaryTuplet num="3" den="2" />');
      out.push('</Rhythm>');
    }
    out.push('</Rhythms>');

    out.push('<Notes>');
    for (const note of layout.notes) {
      out.push(`<Note id="${note.id}">`);
      out.push('<Properties>');
      if (note.pitchNote) {
        // Дорожка с абсолютной высотой: октава и тон внутри тона 0…11.
        out.push(`<Property name="Octave"><Number>${Math.floor(note.fret / 12)}</Number></Property>`);
        out.push(`<Property name="Tone"><Step>${Math.round(note.fret % 12)}</Step></Property>`);
      } else {
        // Таб-партия: номер строки 0-based (в приёмке GP прибавляет единицу).
        out.push(`<Property name="String"><String>${note.string}</String></Property>`);
        out.push(`<Property name="Fret"><Fret>${note.fret}</Fret></Property>`);
      }
      const tech = note.note || {};
      if (tech.tabEffects) {
        const property=(name,type,value)=>out.push(`<Property name="${name}"><${type}>${value == null ? '' : value}</${type}></Property>`);
        if (tech.pm) property('PalmMuted','Enable',null);
        if (tech.dead) property('Muted','Enable',null);
        if (tech.hammer) property('HopoOrigin','Enable',null);
        const slideFlags={shift:1,legato:2,'out-down':4,'out-up':8,'in-below':16,'in-above':32};
        if (tech.slide) property('Slide','Flags',slideFlags[tech.slide]||0);
        if (tech.harm) {
          property('HarmonicType','HType',tech.harm.type==='natural'?'Natural':'Artificial');
          property('HarmonicFret','HFret',tech.harmonicFret ?? (tech.harm.type==='natural'?note.fret:12));
        }
        if (tech.bend) {
          const ps=tech.bend.points, a=ps[0],z=ps[ps.length-1],m=ps.length>2?ps[1]:[(a[0]+z[0])/2,(a[1]+z[1])/2],m2=ps.length>3?ps[ps.length-2]:m;
          property('Bended','Enable',null);
          for (const [name,value] of [['OriginOffset',a[0]*100],['OriginValue',a[1]*50],['MiddleOffset1',m[0]*100],['MiddleOffset2',m2[0]*100],['MiddleValue',m[1]*50],['DestinationOffset',z[0]*100],['DestinationValue',z[1]*50]]) property('Bend'+name,'Float',value);
        }
      }
      out.push('</Properties>');
      // Связка читается парсером Guitar Pro как прямой узел Note, не Property.
      if (note.tieOrigin || note.tieDestination) {
        out.push(`<Tie origin="${note.tieOrigin ? 'true' : 'false'}" destination="${note.tieDestination ? 'true' : 'false'}" />`);
      }
      if (note.percussion) out.push(`<InstrumentArticulation>${note.fret}</InstrumentArticulation>`);
      const flags = note.note || {};
      if (flags.letRing) out.push('<LetRing />');
      if (flags.ghost) out.push('<AntiAccent>Normal</AntiAccent>');
      if (flags.tabEffects) {
        const accent=(flags.staccato?1:0)|(flags.accent===2?4:flags.accent===1?8:0);
        if(accent)out.push(`<Accent>${accent}</Accent>`);
      }
      else if (flags.staccato) out.push('<Accent>1</Accent>');
      else if (!flags.tabEffects && flags.accent) out.push('<Accent>8</Accent>');
      else if (flags.tenuto) out.push('<Accent>16</Accent>');
      if (flags.vibrato === 'wide') out.push('<Vibrato>Wide</Vibrato>');
      else if (flags.vibrato === 'slight') out.push('<Vibrato>Slight</Vibrato>');
      if (flags.legato) out.push('<Tie origin="true" destination="false" />');
      if (flags.leftFinger) out.push(`<LeftFingering>${fingerName(flags.leftFinger)}</LeftFingering>`);
      if (flags.rightFinger) out.push(`<RightFingering>${fingerName(flags.rightFinger)}</RightFingering>`);
      out.push('</Note>');
    }
    out.push('</Notes>');
    out.push('</GPIF>');

    const text = out.join('\n') + '\n';
    const bytes = typeof TextEncoder !== 'undefined'
      ? new TextEncoder().encode(text)
      : Uint8Array.from(Buffer.from(text, 'utf8'));

    return {
      bytes,
      text,
      losses,
      stats: {
        bars: totalBars,
        sections: sections.length,
        tracks: trackRows.length,
        notes: new Set(layout.notes.filter(n => !n.tieDestination).map(n => n.noteKey)).size,
        noteheads: layout.notes.length,
        beats: layout.beats.length,
        rhythms: layout.rhythms.length,
      },
    };
  }

  function fingerName(value) {
    const name = FINGER_NAMES[String(value || '').toLowerCase()];
    if (name) return name;
    switch (Number(value)) {
      case 1: return 'Index';
      case 2: return 'Middle';
      case 3: return 'Ring';
      case 4: return 'Pinky';
      default: return 'Thumb';
    }
  }

  return Object.freeze({
    GP_VERSION,
    GP_REVISION,
    NOTE_VALUES,
    writeGPIF,
    encodeLength,
    parseTimeSig,
    tuningPitch,
  });
});