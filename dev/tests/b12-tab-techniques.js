#!/usr/bin/env node
// Модель, реальный GP5/GPX и MIDI. Без снимков состояния в Git.
const fs = require('fs'),
  path = require('path'),
  assert = require('assert/strict');
const { JSDOM, VirtualConsole } = require('jsdom');
const { readScore, gpifZip } = require('./helpers/export-oracle');
const codec = require('../gpx-bcfz-runtime');
const dom = new JSDOM(fs.readFileSync(path.join(__dirname, '../../STRUCHORD.html'), 'utf8'), {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://localhost/',
  virtualConsole: new VirtualConsole(),
  beforeParse(w) {
    w.TextEncoder = TextEncoder;
    w.TextDecoder = TextDecoder;
    w.HTMLCanvasElement.prototype.getContext = () =>
      new Proxy({ measureText: () => ({ width: 10 }) }, { get: (o, k) => o[k] || (() => {}) });
    w.URL.createObjectURL = () => '';
    w.HTMLAnchorElement.prototype.click = () => {};
  },
});
const w = dom.window,
  plain = (v) => JSON.parse(JSON.stringify(v));
let checks = 0;
function check(label, actual, expected) {
  assert.deepEqual(plain(actual), expected, label);
  checks++;
}
function note(start, fret = 3, flags = {}) {
  return { start, dur: 1, string: 0, fret, ...flags };
}
function run(code, arg) {
  w.__tech = arg;
  return w.eval(code);
}
function fixture(notes, beats = 4) {
  run(
    `startNewSongFromHome();addSection('Verse');sections[0].squares=[];addTabInsert(sections[0].id);tabInsertEditorState.fresh=false;tabInsertEditorState.overlay.querySelector('[data-tab-cancel]').click();sections[0].squares[0].notes=__tech.notes;sections[0].squares[0].beats=__tech.beats;`,
    { notes, beats },
  );
}
function gpNotes(bytes, format) {
  let score;
  if (format === 'GPX') {
    const f = codec.readContainer(Uint8Array.from(bytes)).entries.find((f) => f.name === 'score.gpif');
    score = readScore(gpifZip(new TextDecoder().decode(f.data || f.bytes)));
  } else score = readScore(bytes);
  return score.tracks.flatMap((t) =>
    t.staves.flatMap((s) => s.bars.flatMap((b) => b.voices.flatMap((v) => v.beats.flatMap((b) => b.notes)))),
  );
}
(async () => {
  try {
    await new Promise((r) => setTimeout(r, 100));
    check(
      'strict fields',
      run(`tabTechClean(__tech)`, {
        pm: 'yes',
        ghost: 1,
        legato: [],
        accent: 7,
        slide: 'evil',
        vibrato: true,
        harm: { type: 'evil' },
        bend: {
          type: 'bend',
          points: [
            [0, NaN],
            [1, 2],
          ],
        },
      }),
      {},
    );
    check(
      'pause cannot carry effects',
      run('tabTechClean(__tech)', { pause: true, pm: true, legato: true }),
      {},
    );
    check(
      'bad shape bend',
      run('tabTechClean(__tech)', {
        bend: {
          type: 'bend',
          points: [
            [0, -1],
            [1, 2],
          ],
        },
      }),
      {},
    );
    check(
      'no links across pause',
      run(`tabInsertCleanNotes(__tech,4,'4/4')`, [
        note(0),
        { start: 1, pause: true, dur: 1 },
        note(2, 3, { tie: true }),
      ]),
      [note(0), { start: 1, pause: true, dur: 1 }, note(2)],
    );
    check(
      'no tie across rest gap',
      run(`tabInsertCleanNotes(__tech,4,'4/4')`, [note(0), note(2, 3, { tie: true })]),
      [note(0), note(2)],
    );
    check(
      'no H/P between same fret',
      run(`tabTechEdges(__tech).length`, [note(0, 3, { legato: true }), note(1)]),
      0,
    );
    check(
      'no tie between different harmonic pitches',
      run(`tabInsertCleanNotes(__tech,4,'4/4')`, [
        note(0, 12, { harm: { type: 'natural' } }),
        note(1, 12, { tie: true }),
      ]),
      [note(0, 12, { harm: { type: 'natural' } }), note(1, 12)],
    );
    check(
      'dead cannot carry pitched effects',
      run('tabTechClean(__tech)', {
        dead: true,
        tie: true,
        legato: true,
        slide: 'legato',
        harm: { type: 'natural' },
        bend: {
          type: 'bend',
          points: [
            [0, 0],
            [1, 2],
          ],
        },
      }),
      { dead: true },
    );
    check(
      'prebend-release retains initial bend',
      run('tabTechClean(__tech)', {
        bend: {
          type: 'prebend-release',
          points: [
            [0, 2],
            [1, 0],
          ],
        },
      }),
      {
        bend: {
          type: 'prebend-release',
          points: [
            [0, 2],
            [1, 0],
          ],
        },
      },
    );
    check(
      'bend-release shape retained',
      run('tabTechClean(__tech)', {
        bend: {
          type: 'bend-release',
          points: [
            [0, 0],
            [0.4, 2],
            [0.7, 2],
            [1, 0],
          ],
        },
      }),
      {
        bend: {
          type: 'bend-release',
          points: [
            [0, 0],
            [0.4, 2],
            [0.7, 2],
            [1, 0],
          ],
        },
      },
    );
    for (const [slide, inType, outType] of [
      ['legato', 0, 2],
      ['shift', 0, 1],
      ['in-below', 1, 0],
      ['in-above', 2, 0],
      ['out-down', 0, 4],
      ['out-up', 0, 3],
    ]) {
      fixture(
        ['legato', 'shift'].includes(slide)
          ? [note(0, 3, { slide }), note(1, 7)]
          : [note(0), note(1, 7, { slide })],
      );
      for (const format of ['GP5', 'GPX']) {
        const result = run(format === 'GP5' ? 'gpExportBytesGP5()' : 'gpExportBytes()');
        const ns = gpNotes(result.bytes, format),
          link = ['legato', 'shift'].includes(slide);
        check(format + ' ' + slide + ' input', ns[1].slideInType, inType);
        check(format + ' ' + slide + ' output', ns[link ? 0 : 1].slideOutType, outType);
        check(
          format + ' ' + slide + ' no unsupported slide loss',
          result.report.losses.some((l) => /slide.*не кодируется/.test(l.label)),
          false,
        );
      }
    }
    for (const [type, points] of [
      [
        'bend',
        [
          [0, 0],
          [1, 2],
        ],
      ],
      [
        'bend-release',
        [
          [0, 0],
          [0.4, 2],
          [0.7, 2],
          [1, 0],
        ],
      ],
      [
        'release',
        [
          [0, 2],
          [1, 0],
        ],
      ],
      [
        'prebend',
        [
          [0, 2],
          [1, 2],
        ],
      ],
      [
        'prebend-release',
        [
          [0, 2],
          [1, 0],
        ],
      ],
    ]) {
      fixture([note(0, 7, { bend: { type, points } })]);
      for (const format of ['GP5', 'GPX']) {
        const r = run(format === 'GP5' ? 'gpExportBytesGP5()' : 'gpExportBytes()'),
          ns = gpNotes(r.bytes, format);
        check(
          format + ' ' + type + ' endpoints',
          ns[0].bendPoints.map((p) => [p.offset, p.value]).filter((_, i, a) => i === 0 || i === a.length - 1),
          [
            [0, points[0][1] * 2],
            [60, points.at(-1)[1] * 2],
          ],
        );
      }
    }
    fixture([note(0, 3, { slur: true }), note(1, 7)]);
    for (const format of ['GP5', 'GPX']) {
      const r = run(format === 'GP5' ? 'gpExportBytesGP5()' : 'gpExportBytes()'),
        ns = gpNotes(r.bytes, format);
      if (format === 'GPX') check('GPX separate phrasing', ns[0].beat.isLegatoOrigin, true);
      else
        check(
          'GP5 honest separate phrasing limitation',
          r.report.losses.some((l) => /фразировочная/.test(l.label)),
          true,
        );
      check(format + ' phrase not hammer', ns[0].isHammerPullOrigin, false);
      check(format + ' phrase not tie', ns[1].isTieDestination, false);
    }
    fixture([note(0, 3, { legato: true })]);
    check(
      'unfinished source link export warning',
      run('gpExportBytes().report.losses.some(l=>/незавершённая связь/.test(l.label))'),
      true,
    );
    fixture([note(0, 12, { harm: { type: 'natural' } })]);
    for (const f of ['GP5', 'GPX']) {
      const r = run(f === 'GP5' ? 'gpExportBytesGP5()' : 'gpExportBytes()');
      check(f + ' NH', gpNotes(r.bytes, f)[0].harmonicType, 1);
    }
    // Все целочисленные узлы: настоящий звук и три независимых чтения файлов.
    for (const [fret, semitones] of [
      [2, 36],
      [3, 31],
      [4, 28],
      [5, 24],
      [7, 19],
      [8, 36],
      [9, 28],
      [10, 34],
      [12, 12],
      [14, 34],
      [15, 34],
      [16, 28],
      [17, 36],
      [19, 19],
      [21, 36],
      [22, 36],
      [24, 24],
    ]) {
      fixture([note(0, fret, { harm: { type: 'natural' } })]);
      for (const format of ['GP5', 'GPX']) {
        const result = run(format === 'GP5' ? 'gpExportBytesGP5()' : 'gpExportBytes()');
        check(
          format + ' NH pitch at fret ' + fret,
          gpNotes(result.bytes, format)[0].realValue,
          40 + semitones,
        );
      }
      const midi = require('midi-file').parseMidi(Uint8Array.from(run('midiExportBytes().bytes')));
      check(
        'MIDI NH pitch at fret ' + fret,
        midi.tracks.flat().find((e) => e.type === 'noteOn' && e.velocity > 0).noteNumber,
        40 + semitones,
      );
      check(
        'audio NH pitch at fret ' + fret,
        run(`(() => {
        const event = tabTechPerformance(sections[0].squares[0].notes, 4)[0];
        const options = tabTechSoundOptions(event, .5, [noteToFrequency('E2')], 0, 'guitar');
        return Math.round(69 + 12 * Math.log2(options.freq / 440));
      })()`),
        40 + semitones,
      );
    }
    fixture([note(0, 11)]);
    run(`(() => {
      openTabInsertEditor(sections[0].id, sections[0].squares[0].id);
      tabGpImport(tabInsertEditorState);
      renderTabInsertEditor(tabInsertEditorState);
    })()`);
    check(
      'unsupported NH node is rejected',
      run("tabTechApply(tabInsertEditorState, 'harm', {type:'natural'})"),
      false,
    );
    run(`(() => {
      const n = tabInsertEditorState.gpBars[0][0].notes[0];
      n.harm = {type:'natural'};
      tabGpSync(tabInsertEditorState);
    })()`);
    check(
      'invalid NH draft blocks Apply',
      run(`!tabGpValidate(tabInsertEditorState)
      && tabInsertEditorState.overlay.querySelector('[data-tab-apply]').disabled`),
      true,
    );
    check('invalid NH is preserved in draft', run('tabInsertEditorState.draft.notes[0].harm'), {
      type: 'natural',
    });
    check(
      'invalid NH reason is visible',
      run(`!tabInsertEditorState.overlay.querySelector('[data-tab-gp-error]').hidden
      && /флажолет/.test(tabInsertEditorState.overlay.querySelector('[data-tab-gp-error]').textContent)`),
      true,
    );
    check(
      'invalid NH is not falsely sounded',
      run(`tabTechSoundOptions(
      tabTechPerformance(tabInsertEditorState.draft.notes,4)[0], .5, [noteToFrequency('E2')], 0, 'guitar')`),
      null,
    );
    run("tabInsertEditorState.overlay.querySelector('[data-tab-cancel]').click()");
    fixture([note(0, 11, { harm: { type: 'natural' } })]);
    check(
      'invalid saved NH has an export warning',
      run('gpExportBytes().report.losses.some(l=>/флажолет.*не экспортирована/.test(l.label))'),
      true,
    );
    check(
      'AH physical validation follows capo and fret',
      run("!!tabTechIssue({string:0,fret:12,harm:{type:'artificial',note:'E4'}}, ['E2'], 12)"),
      true,
    );
    fixture([note(0, 12, { harm: { type: 'artificial', note: 'E4' } })]);
    for (const f of ['GP5', 'GPX']) {
      const r = run(f === 'GP5' ? 'gpExportBytesGP5()' : 'gpExportBytes()');
      check(f + ' artificial harmonic actual pitch', gpNotes(r.bytes, f)[0].realValue, 64);
    }
    for (const [target, pitch] of [
      ['E4', 64],
      ['B4', 71],
      ['E5', 76],
      ['G#5', 80],
      ['B5', 83],
      ['D6', 86],
      ['E6', 88],
    ]) {
      fixture([note(0, 12, { harm: { type: 'artificial', note: target } })]);
      for (const format of ['GP5', 'GPX']) {
        const result = run(format === 'GP5' ? 'gpExportBytesGP5()' : 'gpExportBytes()');
        check(format + ' AH actual pitch ' + target, gpNotes(result.bytes, format)[0].realValue, pitch);
      }
      const midi = require('midi-file').parseMidi(Uint8Array.from(run('midiExportBytes().bytes')));
      check(
        'MIDI AH actual pitch ' + target,
        midi.tracks.flat().find((e) => e.type === 'noteOn' && e.velocity > 0).noteNumber,
        pitch,
      );
      check(
        'audio AH actual pitch ' + target,
        run(`(() => {
        const event=tabTechPerformance(sections[0].squares[0].notes,4)[0];
        const options=tabTechSoundOptions(event,.5,[noteToFrequency('E2')],0,'guitar');
        return Math.round(69+12*Math.log2(options.freq/440));
      })()`),
        pitch,
      );
    }
    fixture([note(0, 12, { harm: { type: 'artificial', note: 'F4' } })]);
    check(
      'GP5 unsupported AH interval explicit',
      run('gpExportBytesGP5().report.losses.some(l=>/искусственный флажолет.*октавным/.test(l.label))'),
      true,
    );
    check(
      'unsupported AH display warning',
      run('tabTechLabel(sections[0].squares[0].notes[0]).includes("SVG / GP5 / GPIF")'),
      true,
    );
    check(
      'GPX unsupported AH interval explicit',
      run('gpExportBytes().report.losses.some(l=>/искусственный флажолет/.test(l.label))'),
      true,
    );
    fixture([
      note(0, 5, {
        bend: {
          type: 'bend',
          points: [
            [0, 0],
            [0.2, 1],
            [0.4, 2],
            [0.8, 1],
            [1, 0],
          ],
        },
      }),
    ]);
    check(
      'GPX complex curve approximation explicit',
      run('gpExportBytes().report.losses.some(l=>/сложная кривая/.test(l.label))'),
      true,
    );
    const flags = {
      pm: true,
      ghost: true,
      staccato: true,
      accent: 2,
      vibrato: 'wide',
      letRing: true,
    };
    fixture([note(0, 12, flags), note(1, 12, { tie: true, ...flags })]);
    for (const f of ['GP5', 'GPX']) {
      const r = run(f === 'GP5' ? 'gpExportBytesGP5()' : 'gpExportBytes()');
      check(f + ' explicit tie destination', gpNotes(r.bytes, f)[1].isTieDestination, true);
    }
    const song = await w.exportStruchordFile();
    check('file preserves fields', song.sections[0].squares[0].notes, [
      note(0, 12, flags),
      note(1, 12, { tie: true, ...flags }),
    ]);
    check('export did not mutate model', run('sections[0].squares[0].notes'), [
      note(0, 12, flags),
      note(1, 12, { tie: true, ...flags }),
    ]);
    // Действительно MIDI noteOn/off, а не JSON-представление.
    const midi = require('midi-file').parseMidi(Uint8Array.from(run('midiExportBytes().bytes')));
    const events = midi.tracks.flat().filter((e) => e.type === 'noteOn' && e.velocity > 0);
    check('MIDI one attack for tie', events.length, 1);
    check('MIDI ghost PM velocity', events[0].velocity, 40);
    // Резервный список старых нот: сетки нет, поздний renderFinished безопасен.
    run(`(() => {
      openTabInsertEditor(sections[0].id, sections[0].squares[0].id);
      const e = tabInsertEditorState;
      e.gpBars = null;
      e.overlay.insertAdjacentHTML('beforeend', tabTechPalette());
      window.__fallbackBefore = JSON.stringify(e.draft);
    })()`);
    check('fallback has no technique targets', run('tabTechTargets(tabInsertEditorState)'), []);
    check(
      'fallback hides a late technique palette',
      run(`(() => {
      tabTechRefresh(tabInsertEditorState);
      return tabInsertEditorState.overlay.querySelector('.tab-tech').hidden;
    })()`),
      true,
    );
    check('fallback rejects technique commands', run("tabTechApply(tabInsertEditorState, 'tie')"), false);
    check(
      'fallback keeps original draft',
      run('JSON.stringify(tabInsertEditorState.draft) === __fallbackBefore'),
      true,
    );
    console.log(`${checks} PASS / 0 FAIL`);
  } finally {
    dom.window.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
