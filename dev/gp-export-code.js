// ---------- ЭКСПОРТ В GUITAR PRO 6 (.gpx) — B-12.9.8 ----------
  // Формат: BCFS/BCFZ-контейнер с score.gpif (см. dev/gpif-writer.js и
  // dev/gpx-bcfz-runtime.js). Гитары и бас уезжают таб-дорожками, остальные
  // партии — дорожками с абсолютной высотой нот, ударные — пер-дорожками.
  // Всё, чего GPIF/GP6 не умеет, честно попадает в отчёт о потерях.
  const GP_EXPORT_MAX_TRACKS = 32;
  const GP_EXPORT_MISC_XML = '<?xml version="1.0" encoding="UTF-8"?>\n<MISC>\n\t<TracksView>\n\t\t<PreferredTrackCount>%COUNT%</PreferredTrackCount>\n\t</TracksView>\n</MISC>\n';

  let gpExportLastBytes = null;
  let gpExportLastGp5Bytes = null;
  const GP5_MAX_TRACKS = 64;
  const GP5_MAX_STRINGS = 7;

  function gpExportEnsureWriter() {
    if (window.StruchordGpifWriter && typeof window.StruchordGpifWriter.writeGPIF === 'function') {
      return window.StruchordGpifWriter;
    }
    const source = document.getElementById('gpifWriterRuntime');
    if (!source) throw new Error('Встроенный писатель Guitar Pro не найден.');
    const script = document.createElement('script');
    script.textContent = source.textContent || source.text || '';
    document.head.appendChild(script);
    script.remove();
    if (!window.StruchordGpifWriter || typeof window.StruchordGpifWriter.writeGPIF !== 'function') {
      throw new Error('Не удалось запустить встроенный писатель Guitar Pro.');
    }
    return window.StruchordGpifWriter;
  }

  function gpExportLoss(report, label, count) {
    const key = String(label || 'Прочее');
    const amount = Number.isFinite(Number(count)) ? Math.max(1, Math.trunc(Number(count))) : 1;
    const found = report.losses.find((item) => item.label === key);
    if (found) found.count += amount;
    else report.losses.push({ label: key, count: amount });
  }

  function gpExportGain(report, label, count) {
    const amount = Number(count) || 0;
    if (amount <= 0) return;
    const found = report.transferred.find((item) => item.label === label);
    if (found) found.count += amount;
    else report.transferred.push({ label, count: amount });
  }

  // Секция приложения → такты Guitar Pro. Единица записи секции — доли её
  // СОБСТВЕННОГО размера (при 4/4 это четверти), так что ширина такта равна
  // числителю размера секции.
  function gpExportPlanSections(songData, report) {
    const globalTimeSig = songData.globalTimeSig || '4/4';
    const plans = [];
    const bars = [];
    let cursor = 0;
    (songData.sections || []).forEach((section, index) => {
      const parentTimeSig = section.timeSig || globalTimeSig;
      const parsed = parseTimeSig(parentTimeSig);
      let totalUnits = 0;
      for (const square of section.squares || []) {
        const beats = getSquareBeats(square, parentTimeSig);
        if (Number.isFinite(beats) && beats > 0) totalUnits += beats;
      }
      const unitsPerBar = parsed.numerator || 4;
      const baseBarCount = Math.max(1, Math.ceil(totalUnits / unitsPerBar - 1e-9));
      // В GPIF нет полей повторов: секция с повтором записывается копиями
      // тактов, а отчёт честно говорит, что повтор стал повторяющимися тактами.
      const repeatCount = Math.max(1, Math.round(Number(section.repeat) || 1));
      const barCount = baseBarCount * repeatCount;
      const plan = {
        section,
        index,
        parentTimeSig,
        unitsPerBar,
        unitsPerQuarter: (parsed.denominator || 4) / 4,
        totalUnits,
        baseBarCount,
        repeatCount,
        barCount,
        firstBar: cursor,
      };
      plans.push(plan);
      for (let bar = 0; bar < barCount; bar++) {
        bars.push({ timeSig: parentTimeSig, unitsPerBar, unitSpan: 1, sectionIndex: index });
      }
      cursor += barCount;
      if (!baseBarCount) gpExportLoss(report, 'Пустая секция пропущена', 1);
    });
    return { plans, bars, totalBars: cursor };
  }

  function gpExportPlace(plan, startUnits, durationUnits, report, label, repeatIndex) {
    const index = Math.max(0, Math.min((plan.repeatCount || 1) - 1, Number(repeatIndex) || 0));
    const barInSection = Math.floor((startUnits + 1e-9) / plan.unitsPerBar);
    if (barInSection < 0 || barInSection >= plan.baseBarCount) {
      // Повторяем отчёт один раз на позицию, а не на каждый повтор.
      if (!index) gpExportLoss(report, `${label}: позиция за пределами секции, нота осталась в приложении`, 1);
      return null;
    }
    const offsetUnits = startUnits - barInSection * plan.unitsPerBar;
    if (!(offsetUnits >= -1e-9) || offsetUnits >= plan.unitsPerBar + 1e-9) return null;
    const localDuration = Math.min(durationUnits, (plan.baseBarCount - barInSection) * plan.unitsPerBar - offsetUnits);
    if (!(localDuration > 1e-9)) {
      gpExportLoss(report, `${label}: нота без длительности в пределах такта пропущена`, 1);
      return null;
    }
    return { bar: plan.firstBar + index * plan.baseBarCount + barInSection, start: Math.max(0, offsetUnits), dur: localDuration };
  }


// E4: имена открытых струн берём из ПЕСНИ, с октавами, не из fallback тюнера.
  function gpExportSongTuning(songData) {
    if (Array.isArray(songData.tuningNotes) && songData.tuningNotes.length === 6) return songData.tuningNotes.slice();
    const preset = TUNER_TUNINGS.find(t => t.id === songData.tuning) || TUNER_TUNINGS[0];
    return preset.notes.slice();
  }

  function gpExportSongProgram(sound) {
    return ({ acoustic: 25, clean: 27, drive: 29, lead: 30, ambient: 27 })[sound] ?? 25;
  }

  // Производные ноты не попадают в songParts/сохранение. TAB здесь исключён:
  // он экспортируется ровно один раз своей дорожкой.
  function gpExportPrepareSong(songData, report) {
    gpExportLoss(report, 'Исполнительский свинг аккомпанемента не кодируется: записан письменный ритм');
    const rolls = {};
    for (const sec of sections) {
      const notes = accompSectionRoll(sec);
      if (notes.length) rolls[sec.id] = notes;
    }
    let parts = (songData.parts || []).slice();
    if (Object.keys(rolls).length) {
      parts.push({ name: 'Песня (аккорды)', instrument: 'guitar', viewMode: 'tab',
        strings: gpExportSongTuning(songData), capo: songData.capo || 0,
        gmProgram: gpExportSongProgram(songData.sound), mix: songData.mix || null, rolls });
      gpExportGain(report, 'Аккомпанемент из аккордов/записанных нот без дублирования TAB', Object.values(rolls).reduce((sum,n) => sum + n.length, 0));
    }
    // Бейдж ×N квадрата в GP разворачивается внутри секции. Абсолютные
    // рулоны партий следуют тем же окнам — повторяются и сдвигаются вместе.
    const windows = new Map();
    const exportSections = (songData.sections || []).map(sec => {
      const ts = sec.timeSig || songData.globalTimeSig;
      let sourceStart = 0, start = 0; const squares = [], list = [];
      for (const sq of sec.squares || []) {
        const length = getSquareBeats(sq, ts);
        for (let pass = 0; pass < Math.max(1, Number(sq.repeat) || 1); pass++) {
          list.push({ sourceStart, start, length });
          squares.push({ ...sq, repeat: 1 }); start += length;
        }
        sourceStart += length;
      }
      windows.set(String(sec.id), list);
      return { ...sec, squares };
    });
    parts = parts.map(part => {
      const remap = rolls => Object.fromEntries(Object.entries(rolls || {}).map(([id, notes]) => {
        const out = [];
        for (const win of windows.get(id) || []) for (const note of notes) {
          if (note.start >= win.sourceStart - 1e-9 && note.start < win.sourceStart + win.length - 1e-9)
            out.push({ ...note, start: win.start + note.start - win.sourceStart });
        }
        return [id, out];
      }));
      return { ...part, rolls: remap(part.rolls), pitchRolls: remap(part.pitchRolls) };
    });
    return { ...songData, sections: exportSections, parts };
  }

  // GP5 writer принимает четверти, GPIF — единицы знаменателя такта.
  // Разрез через тактовую черту связываем лигой, не новым ударом.
  function gpExportSplitModel(model, quarters = false) {
    const writer = quarters ? gpExportEnsureGp5Writer() : null;
    for (const part of model.parts) {
      const notes = [];
      for (const note of part.notes) {
        const unit = 4 / parseTimeSig(model.bars[note.bar].timeSig || model.timeSig).denominator;
        let start = note.start * unit, remaining = note.dur * unit, bar = note.bar, tail = false;
        while (remaining > 1e-7 && bar < model.bars.length) {
          const sig = parseTimeSig(model.bars[bar].timeSig || model.timeSig);
          const factor = quarters ? 1 : sig.denominator / 4;
          const length = sig.numerator * 4 / sig.denominator;
          let dur = Math.min(remaining, length - start);
          if (quarters && !writer.durationCode(dur / 4)) {
            dur = writer.durationParts(dur)[0].units * 4;
          }
          notes.push({ ...note, bar, start: start * factor, dur: dur * factor,
            tieDestination: tail, tieOrigin: remaining > dur + 1e-7 });
          remaining -= dur; start += dur; tail = true;
          if (start >= length - 1e-7) { bar++; start = 0; }
        }
      }
      part.notes = notes;
    }
    return model;
  }

  function gpExportBuildTabPart(songData, plans, report, nativeRepeats = false) {
    const part = {
      name: 'Табы', instrument: 'guitar', viewMode: 'tab',
      capo: Number(songData.capo) || 0, gmProgram: gpExportSongProgram(songData.sound),
      tuning: gpExportSongTuning(songData), mix: songData.mix || null, lyrics: [], notes: [],
    };
    for (const plan of plans) {
      let offset = 0;
      for (const sq of plan.section.squares || []) {
        const length = getSquareBeats(sq, plan.parentTimeSig);
        if (sq.type === 'tab') {
          const clean = tabInsertCleanNotes(sq.notes, length, plan.parentTimeSig);
          for (let pass = 0; pass < (nativeRepeats ? 1 : plan.repeatCount); pass++) {
            for (const note of clean) {
              if (note.pause) continue;
              const placed = gpExportPlace(plan, offset + note.start, tabInsertNoteDuration(note), report, 'Табулатура', pass);
              if (!placed) continue;
              part.notes.push({ ...placed, voice: 1, string: note.string, fret: note.fret });
            }
          }
        }
        offset += length;
      }
    }
    if (!part.notes.length) return null;
    gpExportGain(report, 'Ноты табулатуры (B-12.12)', part.notes.length);
    return part;
  }

  function gpExportBuildModel(songData, report) {
    const globalTimeSig = songData.globalTimeSig || '4/4';
    const globalKey = songData.globalKey || 'C';
    const { plans, bars } = gpExportPlanSections(songData, report);
    const metadata = songData.metadata || {};

    const model = {
      meta: {
        title: metadata.title || '',
        artist: metadata.artist || '',
        album: metadata.album || '',
        copyright: metadata.copyright || '',
        words: metadata.words || '',
      },
      bpm: Number(songData.bpm) || 120,
      key: globalKey,
      timeSig: globalTimeSig,
      sections: [],
      bars,
      parts: [],
    };

    for (const plan of plans) {
      const section = plan.section;
      const bpm = Number(section.bpm) || null;
      const key = section.key || globalKey;
      const name = section.type === 'Custom' ? (section.customName || 'Секция') : (section.type || '');
      model.sections.push({
        type: section.type === 'Custom' ? 'Custom' : (section.type || 'Verse'),
        name: name || (section.type || ''),
        // В модели секция хранит один экземпляр тактов и число повторов:
        // писатель GPIF разворачивает повтор копиями MasterBar.
        barCount: plan.baseBarCount,
        totalBars: plan.barCount,
        timeSig: plan.parentTimeSig,
        key,
        bpm: bpm && bpm !== model.bpm ? bpm : null,
        repeat: plan.repeatCount,
      });
      if (bpm && bpm !== model.bpm) gpExportGain(report, 'Смены темпа', 1);
    }
    gpExportGain(report, 'Секции', plans.length);
    gpExportGain(report, 'Такты', bars.length);
    const sizes = new Set(plans.map((plan) => plan.parentTimeSig));
    if (sizes.size > 1) gpExportGain(report, 'Разные размеры', sizes.size);
    if (new Set(plans.map((plan) => plan.section.key || globalKey)).size > 1) gpExportGain(report, 'Смены тональности', 1);

    const allParts = Array.isArray(songData.parts) ? songData.parts : [];
    if (allParts.length > GP_EXPORT_MAX_TRACKS) {
      gpExportLoss(report, `Дорожек больше ${GP_EXPORT_MAX_TRACKS}: лишние не записаны`, allParts.length - GP_EXPORT_MAX_TRACKS);
    }
    const parts = allParts.slice(0, GP_EXPORT_MAX_TRACKS);

    let tabNotes = 0;
    let pitchNotes = 0;
    parts.forEach((part, partIndex) => {
      const instrument = partInstrumentId(part);
      const isTab = instrument === 'guitar' || instrument === 'bass';
      const partName = String(part.name || `Дорожка ${partIndex + 1}`);
      const exportPart = {
        name: partName,
        instrument,
        viewMode: partNotationViewMode(part),
        capo: Number(part.capo) || 0,
        gmProgram: Number.isInteger(part.gmProgram) ? part.gmProgram : null,
        midiChannel: Number.isInteger(part.midiChannel) ? part.midiChannel : partIndex + 1,
        mix: null,
        lyrics: [],
        notes: [],
      };
      if (isTab) {
        const tuning = partCustomStrings(part) || partTuningNotes(part);
        if (tuning && tuning.length) exportPart.tuning = tuning.slice();
        else gpExportLoss(report, `Дорожка «${partName}»: строй неизвестен, записан пресет Guitar Pro`);
        if (exportPart.capo > 0) gpExportGain(report, 'Капо', 1);
      }
      if (part.mix && (Number(part.mix.volume) !== 100 || Number(part.mix.pan) !== 0)) {
        exportPart.mix = { volume: Number(part.mix.volume) || 100, pan: Number(part.mix.pan) || 0 };
        gpExportGain(report, 'Громкость и панорама дорожек', 1);
        // У Guitar Pro громкость дорожки живёт в диапазоне 0…100.
        if (exportPart.mix.volume > 100) {
          gpExportLoss(report, `Дорожка «${partName}»: громкость выше 100 записана как 100`, 1);
        }
      }

      const probe = { ...part, instrument, strings: exportPart.tuning || null };
      for (const plan of plans) {
        const sectionKey = String(plan.section.id);
        const rolls = (part.rolls && Array.isArray(part.rolls[sectionKey])) ? part.rolls[sectionKey] : [];
        const pitchRolls = (part.pitchRolls && Array.isArray(part.pitchRolls[sectionKey])) ? part.pitchRolls[sectionKey] : [];
        if (isTab && rolls.length) {
          for (const note of rolls) {
            for (let pass = 0; pass < (plan.repeatCount || 1); pass++) {
            const placed = gpExportPlace(plan, Number(note.start), Number(note.dur), report, `Дорожка «${partName}»`, pass);
            if (!placed) break;
            exportPart.notes.push({
              bar: placed.bar,
              voice: Math.max(1, Math.min(4, Number(note.voice) || 1)),
              start: placed.start,
              dur: placed.dur,
              string: Number(note.string),
              fret: Number(note.fret),
              letRing: note.letRing === true,
              pm: note.pm === true,
              staccato: note.staccato === true,
              accent: Number(note.accent) || 0,
              tenuto: note.tenuto === true,
              ghost: note.ghost === true,
              vibrato: note.vibrato || null,
              slide: note.slide || null,
              legato: note.legato === true,
              trill: note.trill === true,
              tremolo: note.tremolo === true,
              tremBar: note.tremBar === true,
              fade: note.fade || null,
              dead: note.dead === true,
              deadSlap: note.deadSlap === true,
              pickScrape: note.pickScrape === true,
              bend: note.bend || null,
              harm: note.harm || null,
              grace: note.grace || null,
              ornament: note.ornament || null,
            });
            tabNotes++;
            }
          }
        } else if (pitchRolls.length) {
          for (const note of pitchRolls) {
            for (let pass = 0; pass < (plan.repeatCount || 1); pass++) {
            const placed = gpExportPlace(plan, Number(note.start), Number(note.dur), report, `Дорожка «${partName}»`, pass);
            if (!placed) break;
            const pitch = Math.round(Number(note.pitch));
            if (!(pitch >= 0 && pitch <= 127)) {
              gpExportLoss(report, `Дорожка «${partName}»: высота ноты вне MIDI-диапазона`, 1);
              continue;
            }
            if (isTab) {
              // Таб-партия с абсолютной высотой (после MIDI-импорта): переносим
              // ноту на гриф, иначе Guitar Pro её не покажет.
              const positions = partPitchPositions(probe, pitch);
              if (!positions.length) {
                gpExportLoss(report, `Дорожка «${partName}»: нота вне грифа партии не показана табулатурой`, 1);
                continue;
              }
              positions.sort((a, b) => a.fret - b.fret || b.line - a.line);
              exportPart.notes.push({
                bar: placed.bar,
                voice: Math.max(1, Math.min(4, Number(note.voice) || 1)),
                start: placed.start,
                dur: placed.dur,
                string: positions[0].line,
                fret: positions[0].fret,
              });
              tabNotes++;
            } else {
              exportPart.notes.push({
                bar: placed.bar,
                voice: Math.max(1, Math.min(4, Number(note.voice) || 1)),
                start: placed.start,
                dur: placed.dur,
                pitch,
              });
              pitchNotes++;
            }
            }
          }
        }
        if (isTab && !rolls.length && !pitchRolls.length) continue;
      }
      for (const lyric of part.lyrics || []) {
        const plan = plans.find((item) => String(item.section.id) === String(lyric.secId));
        if (!plan) continue;
        for (let pass = 0; pass < (plan.repeatCount || 1); pass++) {
          const placed = gpExportPlace(plan, Number(lyric.start) || 0, 0.0001, report, `Дорожка «${partName}»: строка текста`, pass);
          if (!placed) break;
          exportPart.lyrics.push({
            bar: placed.bar,
            start: placed.start,
            text: String(lyric.text || ''),
            line: Math.max(1, Math.min(16, Math.trunc(Number(lyric.line) || 1))),
            voice: Math.max(1, Math.min(4, Math.trunc(Number(lyric.voice) || 1))),
            dur: Number(lyric.dur) || 0,
          });
        }
      }
      if (exportPart.lyrics.length) gpExportGain(report, 'Строки текста', exportPart.lyrics.length);
      model.parts.push(exportPart);
    });
    const repeatCopies = plans.reduce((sum, plan) => sum + (plan.repeatCount - 1) * plan.baseBarCount, 0);
    if (repeatCopies) gpExportGain(report, 'Повторы секций записаны повторяющимися тактами: GPIF не хранит повторы', repeatCopies);
    if (tabNotes) gpExportGain(report, 'Ноты табулатурой', tabNotes);
    if (pitchNotes) gpExportGain(report, 'Ноты с абсолютной высотой', pitchNotes);
    const effectNotes = model.parts.reduce((sum, part) => sum + part.notes.filter((note) =>
      note.letRing || note.staccato || Number(note.accent) === 1 || note.tenuto || note.ghost || note.vibrato || note.legato).length, 0);
    if (effectNotes) gpExportGain(report, 'Поддержанные пометки GPIF (let ring, ghost, staccato, обычный акцент, tenuto, vibrato, legato/tie)', effectNotes);

    if (songData.mix && songData.mix.master && (Number(songData.mix.master.volume) !== 100 || Number(songData.mix.master.pan) !== 0)) {
      model.masterMix = { volume: Number(songData.mix.master.volume) || 100, pan: Number(songData.mix.master.pan) || 0 };
      gpExportGain(report, 'Громкость и панорама мастера', 1);
    }
    if (songData.gpAssets && songData.gpAssets.length) {
      gpExportLoss(report, 'Вложения Guitar Pro (звук, картинки) в GPIF не переносятся', songData.gpAssets.length);
    }
    if (Array.isArray(songData.userFingerings) && songData.userFingerings.length) {
      gpExportLoss(report, 'Аппликатуры и раскладки пальцев в Guitar Pro не переносятся', songData.userFingerings.length);
    }
    if (songData.keyMode === 'manual') gpExportGain(report, 'Ручной ключ тональности', 1);
    gpExportLoss(report, 'BinaryStylesheet и конфигурации оформления Guitar Pro не переносятся — Guitar Pro соберёт их заново');

    // Таб-вставки B-12.12 — отдельная дорожка
    const tabPart = gpExportBuildTabPart(songData, plans, report);
    if (tabPart) model.parts.push(tabPart);
    return model;
  }

  // ---------- ЭКСПОРТ В GUITAR PRO 5 (.gp5) — B-12.9.9 ----------
  // Модель для бинарного GP5: повторы секций остаются нативными
  // (repeatOpen/repeatClose), а не разворачиваются копиями тактов.
  function gp5PlanSections(songData, report, model) {
    const globalTimeSig = songData.globalTimeSig || '4/4';
    const plans = [];
    let cursor = 0;
    let nativeRepeats = 0;
    (songData.sections || []).forEach((section, index) => {
      const parentTimeSig = section.timeSig || globalTimeSig;
      const parsed = parseTimeSig(parentTimeSig);
      let totalUnits = 0;
      for (const square of section.squares || []) {
        const beats = getSquareBeats(square, parentTimeSig);
        if (Number.isFinite(beats) && beats > 0) totalUnits += beats;
      }
      const unitsPerBar = parsed.numerator || 4;
      const baseBarCount = Math.max(1, Math.ceil(totalUnits / unitsPerBar - 1e-9));
      const repeatCount = Math.max(1, Math.round(Number(section.repeat) || 1));
      // Вольта в GP5 живёт на такте, а в модели — на квадрате, поэтому считаем,
      // с какого такта начинается каждый квадрат (по накопленным долям).
      const squareStarts = [];
      let unitsBefore = 0;
      for (const square of section.squares || []) {
        const beats = getSquareBeats(square, parentTimeSig);
        if (Number.isFinite(beats) && beats > 0) {
          squareStarts.push({ square, startBar: unitsBefore / unitsPerBar });
          unitsBefore += beats;
        }
      }
      const name = section.type === 'Custom' ? (section.customName || 'Секция') : (section.type || '');
      const plan = {
        section,
        index,
        parentTimeSig,
        unitsPerBar,
        totalUnits,
        baseBarCount,
        repeatCount,
        firstBar: cursor,
        sectionName: name,
      };
      plans.push(plan);
      for (let bar = 0; bar < baseBarCount; bar++) {
        const isFirst = bar === 0;
        const isLast = bar === baseBarCount - 1;
        // Вольта квадрата вешается на первый его такт.
        let volta = null;
        for (const entry of squareStarts) {
          if (Math.abs(entry.startBar - bar) < 1e-9) {
            const value = Math.round(Number(entry.square && entry.square.volta) || 0);
            if (value >= 1 && value <= 9) volta = value;
            break;
          }
        }
        model.bars.push({
          timeSig: parentTimeSig,
          unitsPerBar,
          repeatOpen: repeatCount > 1 && isFirst,
          repeatClose: repeatCount > 1 && isLast ? repeatCount : null,
          marker: isFirst ? (name || null) : null,
          volta,
          sectionIndex: index,
          bpm: Number(section.bpm) || model.bpm,
          key: section.key || globalKey,
        });
      }
      cursor += baseBarCount;
      if (repeatCount > 1) nativeRepeats++;
    });
    if (nativeRepeats) gpExportGain(report, 'Повторы секций записаны нативными повторами Guitar Pro', nativeRepeats);
    if (plans.length) gpExportGain(report, 'Секции', plans.length);
    gpExportGain(report, 'Такты', cursor);
    return plans;
  }

  function gpExportBuildModelGP5(songData, report) {
    const globalKey = songData.globalKey || 'C';
    const metadata = songData.metadata || {};
    const model = {
      meta: {
        title: metadata.title || '',
        artist: metadata.artist || '',
        album: metadata.album || '',
        copyright: metadata.copyright || '',
        words: metadata.words || '',
      },
      bpm: Number(songData.bpm) || 120,
      key: globalKey,
      timeSig: songData.globalTimeSig || '4/4',
      bars: [],
      parts: [],
    };
    const plans = gp5PlanSections(songData, report, model);
    const sizes = new Set(plans.map((plan) => plan.parentTimeSig));
    if (sizes.size > 1) gpExportGain(report, 'Разные размеры', sizes.size);
    if (new Set(plans.map((plan) => plan.section.key || globalKey)).size > 1) gpExportGain(report, 'Смены тональности', 1);

    const allParts = Array.isArray(songData.parts) ? songData.parts : [];
    const limit = Math.min(GP_EXPORT_MAX_TRACKS, GP5_MAX_TRACKS);
    if (allParts.length > limit) {
      gpExportLoss(report, `Дорожек больше ${limit}: лишние не записаны`, allParts.length - limit);
    }
    const parts = allParts.slice(0, limit);
    let tabNotes = 0;
    let pitchNotes = 0;
    let effectNotes = 0;
    let graceNotes = 0;
    const reportGp5NoteLosses = (note, partName) => {
      if (note.tenuto === true) gpExportLoss(report, `Дорожка «${partName}»: tenuto не имеет отдельного флага в текущем GP5-writer и не переносится`, 1);
      if (Number(note.accent) === 2) gpExportLoss(report, `Дорожка «${partName}»: сила акцента 2 в GP5 сведена к обычному акценту`, 1);
      if (note.fade === 'out') gpExportLoss(report, `Дорожка «${partName}»: fade-out не кодируется текущим GP5-writer`, 1);
      if (note.ornament) gpExportLoss(report, `Дорожка «${partName}»: ornament «${note.ornament}» не кодируется текущим GP5-writer`, 1);
      if (note.deadSlap === true) gpExportLoss(report, `Дорожка «${partName}»: знак dead slap не кодируется текущим GP5-writer`, 1);
      if (note.pickScrape === true) gpExportLoss(report, `Дорожка «${partName}»: знак pick scrape не кодируется текущим GP5-writer`, 1);
      if (note.harm && note.harm.type === 'feedback') gpExportLoss(report, `Дорожка «${partName}»: harmonic feedback не кодируется текущим GP5-writer`, 1);
      else if (note.harm && note.harm.type !== 'natural' && note.harm.note) {
        gpExportLoss(report, `Дорожка «${partName}»: целевая высота harmonic не записывается; сохраняется только тип флажолета`, 1);
      }
      if (note.bend && Array.isArray(note.bend.points)
        && note.bend.points.some((point) => Number(point && point[1]) < 0 || Number(point && point[1]) > 12)) {
        gpExportLoss(report, `Дорожка «${partName}»: GP5-writer ограничивает точки bend диапазоном 0–12 полутонов`, 1);
      }
    };

    parts.forEach((part, partIndex) => {
      const instrument = partInstrumentId(part);
      const isTab = instrument === 'guitar' || instrument === 'bass';
      const partName = String(part.name || `Дорожка ${partIndex + 1}`);
      const exportPart = {
        name: partName,
        instrument,
        viewMode: partNotationViewMode(part),
        capo: Number(part.capo) || 0,
        gmProgram: Number.isInteger(part.gmProgram) ? part.gmProgram : null,
        midiChannel: Number.isInteger(part.midiChannel) ? part.midiChannel : partIndex + 1,
        mix: null,
        lyrics: [],
        notes: [],
      };
      if (isTab) {
        const tuning = partCustomStrings(part) || partTuningNotes(part);
        if (tuning && tuning.length) exportPart.tuning = tuning.slice(0, GP5_MAX_STRINGS);
        else gpExportLoss(report, `Дорожка «${partName}»: строй неизвестен, записан пресет Guitar Pro`);
        if (exportPart.capo > 0) gpExportGain(report, 'Капо', 1);
      }
      if (part.mix && (Number(part.mix.volume) !== 100 || Number(part.mix.pan) !== 0)) {
        exportPart.mix = { volume: Number(part.mix.volume) || 100, pan: Number(part.mix.pan) || 0 };
        gpExportGain(report, 'Громкость и панорама дорожек', 1);
      }

      const probe = { ...part, instrument, strings: exportPart.tuning || null };
      for (const plan of plans) {
        const sectionKey = String(plan.section.id);
        const rolls = (part.rolls && Array.isArray(part.rolls[sectionKey])) ? part.rolls[sectionKey] : [];
        const pitchRolls = (part.pitchRolls && Array.isArray(part.pitchRolls[sectionKey])) ? part.pitchRolls[sectionKey] : [];
        const place = (note, label) => gpExportPlace(plan, Number(note.start), Number(note.dur), report, label, 0);
        if (isTab && rolls.length) {
          for (const note of rolls) {
            const placed = place(note, `Дорожка «${partName}»`);
            if (!placed) continue;
            exportPart.notes.push({
              bar: placed.bar,
              voice: Math.max(1, Math.min(4, Number(note.voice) || 1)),
              start: placed.start,
              dur: placed.dur,
              string: Number(note.string),
              fret: Number(note.fret),
              letRing: note.letRing === true,
              pm: note.pm === true,
              staccato: note.staccato === true,
              accent: Number(note.accent) || 0,
              // Текущий GP5 writer не различает tenuto и staccato; не выдаём
              // tenuto за стаккато и явно показываем потерю ниже.
              tenuto: false,
              ghost: note.ghost === true,
              vibrato: note.vibrato || null,
              slide: note.slide || null,
              legato: note.legato === true,
              trill: note.trill === true,
              tremolo: note.tremolo === true,
              fadeIn: note.fade === 'in',
              tremoloBar: note.tremBar === true ? true : null,
              // Приёмы, которые GP5 кодирует, а модель уже умеет хранить.
              bend: note.bend || null,
              harm: note.harm && note.harm.type !== 'feedback' ? note.harm : null,
              dead: note.dead === true,
            });
            reportGp5NoteLosses(note, partName);
            if (note.grace) graceNotes++;
            if (note.letRing || note.pm || note.staccato || Number(note.accent) === 1 || note.ghost
              || note.vibrato || note.slide || note.legato || note.trill || note.tremolo
              || note.bend || (note.harm && note.harm.type !== 'feedback') || note.dead
              || note.fade === 'in' || note.tremBar) effectNotes++;
            tabNotes++;
          }
        } else if (pitchRolls.length) {
          for (const note of pitchRolls) {
            const placed = place(note, `Дорожка «${partName}»`);
            if (!placed) continue;
            const pitch = Math.round(Number(note.pitch));
            if (!(pitch >= 0 && pitch <= 127)) {
              gpExportLoss(report, `Дорожка «${partName}»: высота ноты вне MIDI-диапазона`, 1);
              continue;
            }
            if (isTab) {
              const positions = partPitchPositions(probe, pitch);
              if (!positions.length) {
                gpExportLoss(report, `Дорожка «${partName}»: нота вне грифа партии не показана табулатурой`, 1);
                continue;
              }
              positions.sort((a, b) => a.fret - b.fret || b.line - a.line);
              exportPart.notes.push({
                bar: placed.bar,
                voice: Math.max(1, Math.min(4, Number(note.voice) || 1)),
                start: placed.start,
                dur: placed.dur,
                string: positions[0].line,
                fret: positions[0].fret,
              });
              tabNotes++;
            } else {
              exportPart.notes.push({
                bar: placed.bar,
                voice: Math.max(1, Math.min(4, Number(note.voice) || 1)),
                start: placed.start,
                dur: placed.dur,
                pitch,
              });
              pitchNotes++;
            }
          }
        }
      }
      for (const lyric of part.lyrics || []) {
        const plan = plans.find((item) => String(item.section.id) === String(lyric.secId));
        if (!plan) continue;
        const placed = gpExportPlace(plan, Number(lyric.start) || 0, 0.0001, report, `Дорожка «${partName}»: строка текста`, 0);
        if (!placed) continue;
        exportPart.lyrics.push({
          bar: placed.bar,
          start: placed.start,
          text: String(lyric.text || ''),
          line: Math.max(1, Math.min(16, Math.trunc(Number(lyric.line) || 1))),
          voice: Math.max(1, Math.min(4, Math.trunc(Number(lyric.voice) || 1))),
        });
      }
      if (exportPart.lyrics.length) gpExportGain(report, 'Строки текста', exportPart.lyrics.length);
      model.parts.push(exportPart);
    });

    if (tabNotes) gpExportGain(report, 'Ноты табулатурой', tabNotes);
    if (pitchNotes) gpExportGain(report, 'Ноты с абсолютной высотой', pitchNotes);
    if (effectNotes) gpExportGain(report, 'Поддержанные пометки GP5 (let ring, palm mute, staccato, обычный акцент, ghost, vibrato, slide, legato, trill, tremolo, bend, harmonic type, dead note, fade-in, tremolo bar)', effectNotes);
    if (graceNotes) gpExportLoss(report, 'Форшлаги не переносятся: наш импорт Guitar Pro 3–5 читает форшлаг вместо основной ноты, поэтому перенос испортил бы круг', graceNotes);
    if (songData.mix && songData.mix.master && (Number(songData.mix.master.volume) !== 100 || Number(songData.mix.master.pan) !== 0)) {
      model.masterMix = { volume: Number(songData.mix.master.volume) || 100, pan: Number(songData.mix.master.pan) || 0 };
      gpExportGain(report, 'Громкость и панорама мастера', 1);
    }
    gpExportLoss(report, 'Вложения Guitar Pro (звук, картинки) в бинарном GP5 не переносятся', (songData.gpAssets || []).length);
    gpExportLoss(report, 'Аппликатуры и раскладки пальцев в Guitar Pro не переносятся', (songData.userFingerings || []).length);
    gpExportLoss(report, 'Оформление, колонтитулы и конфигурации Guitar Pro 5 собираются приложением заново');
    // Таб-вставки B-12.12 — отдельная дорожка
    const tabPartGp5 = gpExportBuildTabPart(songData, plans, report, true);
    if (tabPartGp5) model.parts.push(tabPartGp5);
    return model;
  }

  function gpExportContainerFiles(model, writer, report) {
    const written = writer.writeGPIF(model, {});
    for (const loss of written.losses) gpExportLoss(report, loss.label, loss.count);
    const trackCount = Math.max(1, model.parts.length);
    const files = [
      { name: 'score.gpif', data: written.bytes },
      { name: 'misc.xml', data: new TextEncoder().encode(GP_EXPORT_MISC_XML.replace('%COUNT%', String(trackCount))) },
      { name: 'LayoutConfiguration', data: new Uint8Array([0, 0, 0, 1, 2, 0, 255, 255, 255, 255, 255, 255, 255, 255, 0, 2]) },
      {
        name: 'PartConfiguration',
        data: (() => {
          const head = [0, 0, 0, 4, 0, 0, 0, 0, 3, 2, 2, 2, 0, 0, 0, 0, 1, 2, 0, 0, 0, 0, 1, 2];
          const rows = [];
          for (let index = 0; index < trackCount; index++) rows.push(1, 1, 1);
          return new Uint8Array(head.concat(rows));
        })(),
      },
    ];
    const codec = gpxEnsureCodec();
    const bytes = codec.writeContainer(files, {});
    return { bytes, written };
  }

  function gpExportEnsureGp5Writer() {
    if (window.StruchordGp5Writer && typeof window.StruchordGp5Writer.writeGP5 === 'function') {
      return window.StruchordGp5Writer;
    }
    const source = document.getElementById('gp5WriterRuntime');
    if (!source) throw new Error('Встроенный писатель Guitar Pro 5 не найден.');
    const script = document.createElement('script');
    script.textContent = source.textContent || source.text || '';
    document.head.appendChild(script);
    script.remove();
    if (!window.StruchordGp5Writer || typeof window.StruchordGp5Writer.writeGP5 !== 'function') {
      throw new Error('Не удалось запустить встроенный писатель Guitar Pro 5.');
    }
    return window.StruchordGp5Writer;
  }

  function gpExportFileBase(songData) {
    const base = String(songDisplayName(songData.metadata) || 'STRUCHORD').replace(/[\/:*?"<>|]+/g, '_').trim();
    return base || 'STRUCHORD';
  }

  function gpExportDownload(bytes, fileName) {
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const blob = new Blob([view.buffer ? view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) : view], {
      type: 'application/octet-stream',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function gpExportRun(songData) {
    const report = {
      format: 'Guitar Pro 6 (.gpx)',
      transferred: [],
      losses: [],
      stats: null,
      fileName: '',
      bytes: 0,
      container: '',
    };
    const writer = gpExportEnsureWriter();
    const model = gpExportSplitModel(gpExportBuildModel(gpExportPrepareSong(songData, report), report));
    if (!model.bars.length) throw new Error('В песне нет тактов — экспортировать нечего.');
    if (!model.parts.length) gpExportLoss(report, 'В песне нет дорожек: файл откроется пустым');
    const result = gpExportContainerFiles(model, writer, report);
    report.stats = result.written.stats;
    report.fileName = gpExportFileBase(songData) + '.gpx';
    report.bytes = result.bytes.length;
    report.container = gpxEnsureCodec().sniff(result.bytes) ? 'BCFS/BCFZ' : '';
    gpExportLastBytes = result.bytes;
    gpExportDownload(result.bytes, report.fileName);
    return report;
  }

  function gpExportRunGP5(songData) {
    const report = {
      format: 'Guitar Pro 5 (.gp5)',
      transferred: [],
      losses: [],
      stats: null,
      fileName: '',
      bytes: 0,
      version: '5.10',
    };
    const writer = gpExportEnsureGp5Writer();
    const model = gpExportSplitModel(gpExportBuildModelGP5(gpExportPrepareSong(songData, report), report), true);
    if (!model.bars.length) throw new Error('В песне нет тактов — экспортировать нечего.');
    if (!model.parts.length) gpExportLoss(report, 'В песне нет дорожек: файл откроется пустым');
    const written = writer.writeGP5(model, {});
    for (const loss of written.losses) gpExportLoss(report, loss.label, loss.count);
    report.stats = written.stats;
    report.fileName = gpExportFileBase(songData) + '.gp5';
    report.bytes = written.bytes.length;
    gpExportLastGp5Bytes = written.bytes;
    gpExportDownload(written.bytes, report.fileName);
    return report;
  }

  window.gpExportBytesGP5 = function () {
    const report = gpExportRunGP5(serializeCurrentSong({ includeGpAssetData: false }));
    return { report, bytes: Array.from(gpExportLastGp5Bytes || []) };
  };

  window.exportGuitarPro5 = function () {
    let report = null;
    try {
      report = gpExportRunGP5(serializeCurrentSong({ includeGpAssetData: false }));
    } catch (error) {
      showToast(`Экспорт в Guitar Pro 5 не удался: ${error && error.message ? error.message : 'ошибка формата'}`);
      return null;
    }
    gpExportShowReport(report);
    return report;
  };

  // Публичная точка сборки файла: отчёт плюс сами байты контейнера.
  window.gpExportBytes = function () {
    const report = gpExportRun(serializeCurrentSong({ includeGpAssetData: false }));
    return { report, bytes: Array.from(gpExportLastBytes || []) };
  };

  window.exportGuitarPro = function () {
    let report = null;
    try {
      report = gpExportRun(serializeCurrentSong({ includeGpAssetData: false }));
    } catch (error) {
      showToast(`Экспорт в Guitar Pro не удался: ${error && error.message ? error.message : 'ошибка формата'}`);
      return null;
    }
    gpExportShowReport(report);
    return report;
  };
