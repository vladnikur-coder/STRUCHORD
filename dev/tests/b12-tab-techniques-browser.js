#!/usr/bin/env node
// GP8 uploads: Symbols / shortcuts; реальный TAB, оба вида лиг и 6 слайдов.
// Без повторных JSON-дампов; opt-in только шесть кадров.
const fs = require('fs'),
  path = require('path'),
  assert = require('assert/strict');
const chromium = require('@sparticuz/chromium').default,
  puppeteer = require('puppeteer-core');
const { readScore, gpifZip } = require('./helpers/export-oracle');
const codec = require('../gpx-bcfz-runtime');
const { parseMidi } = require('midi-file');
const out = process.env.B12_TECH_RESULTS;
let checks = 0;
const errors = [];
const check = (name, a, ...expected) => {
  assert.deepEqual(a, expected.length ? expected[0] : true, name);
  checks++;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const n = (start, fret = 3, string = 0, flags = {}) => ({
  start,
  dur: 1,
  string,
  fret,
  ...flags,
});
const flatten = (score) =>
  score.tracks.flatMap((t) =>
    t.staves.flatMap((s) => s.bars.flatMap((b) => b.voices.flatMap((v) => v.beats.flatMap((b) => b.notes)))),
  );
(async () => {
  if (out) fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    args: chromium.args,
    env: { ...process.env, LD_LIBRARY_PATH: '/tmp/al2023/lib' },
  });
  try {
    for (const [width, height, touch] of [
      [1280, 900, false],
      [390, 844, true],
      [1024, 768, true],
    ]) {
      const page = await browser.newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('dialog', (d) => d.accept());
      await page.setViewport({
        width,
        height,
        isMobile: touch,
        hasTouch: touch,
      });
      await page.goto(process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html', {
        waitUntil: 'load',
      });
      await page.evaluate(() => {
        startNewSongFromHome();
        addSection('Verse');
        sections[0].squares = [];
        addTabInsert(sections[0].id);
      });
      await page.waitForSelector('.tab-at-host svg');
      const state = () =>
        page.evaluate(() => ({
          notes: structuredClone(tabInsertEditorState.draft.notes),
          history: tabInsertEditorState.history?.length || 0,
          error: tabInsertEditorState.gpError,
          disabled: tabInsertEditorState.overlay.querySelector('[data-tab-apply]').disabled,
        }));
      async function fixture(notes = [n(0), n(1, 5), n(2, 7), n(3, 9)], start = 1, beats = 4, string = 0) {
        await page.evaluate(
          ({ notes, start, beats, string }) => {
            const e = tabInsertEditorState;
            e.draft.notes = notes;
            e.draft.beats = beats;
            e.history = [];
            e.forward = [];
            e.gpSelecting = false;
            tabAtLastDigit = null;
            tabGpImport(e);
            tabGpSync(e);
            tabGpSetTime(e, start, string);
          },
          { notes, start, beats, string },
        );
        await wait(25);
      }
      async function key(k, mod, shift = false) {
        await page.$eval('.tab-at-host', (el) => el.focus());
        if (mod) await page.keyboard.down(mod);
        if (shift) await page.keyboard.down('Shift');
        await page.keyboard.press(k);
        if (shift) await page.keyboard.up('Shift');
        if (mod) await page.keyboard.up(mod);
        await wait(20);
      }
      async function click(sel) {
        const neededTab = await page.$eval(sel, (e) => {
          const pane = e.closest('[data-mobile-pane]');
          if (!pane || getComputedStyle(pane).display !== 'none') return null;
          return pane.getAttribute('data-mobile-pane');
        });
        if (neededTab) {
          const tabSel = `[data-tab-mobile-tab="${neededTab}"]`;
          if (touch) await page.tap(tabSel);
          else await page.click(tabSel);
          await wait(20);
        }
        await page.$eval(sel, (e) => e.scrollIntoView({ block: 'center' }));
        if (touch) await page.tap(sel);
        else await page.click(sel);
        await wait(20);
      }
      const native = () =>
        page.evaluate(() =>
          [...tabAtState.startInfo.values()].flatMap((r) =>
            r.beat.notes.map((n) => ({
              fret: n.fret,
              string: n.string,
              tie: n.isTieDestination,
              hammer: n.isHammerPullOrigin,
              slur: r.beat.isLegatoOrigin,
              pm: n.isPalmMute,
              slideIn: n.slideInType,
              slideOut: n.slideOutType,
              harm: n.harmonicType,
              value: n.realValue,
              bend: n.bendPoints?.map((p) => p.value) || [],
              vibrato: n.vibrato,
              ghost: n.isGhost,
              dead: n.isDead,
              accent: n.accentuated,
            })),
          ),
        );
      for (const theme of ['light', 'dark']) {
        await page.evaluate((t) => setTheme(t), theme);
        await fixture([n(0, 9, 0, { harm: { type: 'natural' } })], 0);
        check('NH9 native pitch, not octave fallback', (await native())[0].value, 68);
        await fixture([n(0, 2, 0, { harm: { type: 'natural' } })], 0);
        check('NH2 native canonical fractional node', (await native())[0].value, 76);
        await fixture([n(0, 11, 0, { harm: { type: 'natural' } })], 0);
        check('unsupported NH blocks Apply', await page.$eval('[data-tab-apply]', (e) => e.disabled));
        check('unsupported NH has no false native sign', (await native())[0].harm, 0);
        await key('7');
        check(
          'correcting fret preserves NH and unblocks Apply',
          await page.evaluate(() => ({
            disabled: document.querySelector('[data-tab-apply]').disabled,
            harmonic: tabInsertEditorState.draft.notes[0].harm,
          })),
          { disabled: false, harmonic: { type: 'natural' } },
        );
        for (const [target, pitch] of [
          ['E4', 64],
          ['B4', 71],
          ['E5', 76],
          ['G#5', 80],
          ['B5', 83],
          ['D6', 86],
          ['E6', 88],
        ]) {
          await fixture([n(0, 12, 0, { harm: { type: 'artificial', note: target } })], 0);
          check('AH native actual pitch ' + target, (await native())[0].value, pitch);
        }
        await fixture([n(0, 12, 0, { harm: { type: 'artificial', note: 'F4' } })], 0);
        check(
          'unsupported AH has visible SVG/export warning',
          await page.$eval('[data-tab-tech-status]', (e) => e.textContent.includes('SVG / GP5 / GPIF')),
        );
        await fixture(undefined, 0);
        await key('h');
        check('H data', (await state()).notes[0].legato);
        check('H native origin', (await native())[0].hammer);
        check('native H destination', (await native())[1].value - (await native())[0].value, 2);
        await key('z', 'Meta');
        check('Undo H', (await state()).notes[0].legato, undefined);
        await key('z', 'Meta', true);
        check('Redo H', (await state()).notes[0].legato);
        await fixture([n(0, 7), n(1, 3), n(2), n(3)], 0);
        await key('h');
        check('P native origin', (await native())[0].hammer);
        await fixture([n(0)], 0);
        await key('h');
        await key('ArrowRight');
        await key('5');
        check('first note then H then next note', (await native())[0].hammer);
        await fixture([n(0), n(1)], 0);
        const before = (await state()).history;
        await key('h');
        check('same fret: no H/P', (await state()).history, before);
        await fixture([n(0), n(2, 5)], 2);
        await key('h');
        check(
          'gap: no H/P connection',
          await page.evaluate(() => tabTechEdges(tabInsertEditorState.draft.notes).length),
          0,
        );
        await fixture([n(0), n(1)]);
        await key('l');
        check('tie stored without merging', (await state()).notes.filter((x) => !x.pause).length, 2);
        check('tie native', (await native())[1].tie);
        check(
          'tie audio one attack',
          await page.evaluate(() =>
            tabTechPerformance(tabInsertEditorState.draft.notes, 4).map((e) => [e.start, e.duration]),
          ),
          [[0, 2]],
        );
        await key('z', 'Meta');
        check('tie Undo', (await state()).notes[1].tie, undefined);
        await key('z', 'Meta', true);
        check('tie Redo', (await state()).notes[1].tie);
        await fixture([n(0)], 1);
        await key('l');
        check('L creates continuation on rest', (await state()).notes[1].tie);
        check('empty L one Undo', (await state()).history, 1);
        await key('z', 'Meta');
        check('empty L Undo removes continuation', (await state()).notes.length, 1);
        await fixture([n(0), n(0, 7, 1)], 1);
        await key('l', null, true);
        check('Shift L copies prior chord onto rest', (await state()).notes.filter((n) => n.tie).length, 2);
        await fixture([n(3), n(4)], 4, 8);
        await key('l');
        check('cross-bar tie', (await native())[1].tie);
        check(
          'cross-bar no time shift',
          (await state()).notes.filter((x) => !x.pause).map((n) => n.start),
          [3, 4],
        );
        await fixture([n(0), n(0, 7, 1), n(1), n(1, 7, 1)]);
        await key('l', null, true);
        check('Shift L ties chord', (await state()).notes.filter((n) => n.tie).length, 2);
        await fixture([n(0), n(1, 8, 1)], 0);
        await key('h', null, true);
        check('phrasing separate from H/P', (await state()).notes[0].slur);
        check('phrasing native', (await native())[0].slur);
        check('phrasing not HO', (await native())[0].hammer, false);
        await fixture([n(0), n(1, 5), n(1, 8, 1)]);
        await key('p');
        check(
          'P only cursor note',
          (await state()).notes.filter((n) => n.pm).map((n) => n.string),
          [0],
        );
        await key('p', null, true);
        check('Shift P chord', (await state()).notes.filter((n) => n.pm).length, 2);
        await fixture();
        await key('Home');
        await key('ArrowRight', null, true);
        await key('p');
        check(
          'selection PM',
          (await state()).notes.filter((n) => n.pm).map((n) => n.start),
          [0, 1],
        );
        for (const [slide, si, so] of [
          ['legato', 0, 2],
          ['shift', 0, 1],
          ['in-below', 1, 0],
          ['in-above', 2, 0],
          ['out-down', 0, 4],
          ['out-up', 0, 3],
        ]) {
          await fixture();
          await page.select('[data-tab-tech-slide]', slide);
          const ns = await native();
          check(slide + ' model', (await state()).notes[1].slide, slide);
          check(slide + ' native in', ns[1].slideIn, si);
          check(slide + ' native out', ns[1].slideOut, so);
        }
        await fixture();
        await key('s', 'Alt');
        check('Alt S shift', (await state()).notes[1].slide, 'shift');
        await key('v', 'Alt');
        check('Alt V wide', (await native())[1].vibrato, 2);
        await key('v');
        check('V slight', (await native())[1].vibrato, 1);
        await fixture([n(0, 12), n(1, 12)]);
        await key('y');
        check('natural harmonic', (await native())[1].harm, 1);
        await key('y', 'Alt');
        await page.$eval('[data-tab-tech-harm]', (e) => (e.value = 'E4'));
        await click('[data-tab-tech="harm-apply"]');
        check('artificial harmonic', (await native())[1].harm, 2);
        check('AH written pitch', (await native())[1].value, 64);
        await fixture();
        await key('b');
        await click('[data-tab-bend="2"]');
        check('bend stored', (await state()).notes[1].bend.points, [
          [0, 0],
          [1, 2],
        ]);
        check('native bend', (await native())[1].bend.at(-1), 4);
        await page.select('[data-tab-bend-point]', '1');
        await page.$eval('[data-tab-bend-value]', (el) => {
          el.value = '3';
          el.dispatchEvent(new Event('change', { bubbles: true }));
        });
        check('bend keyboard edit', (await state()).notes[1].bend.points.at(-1)[1], 3);
        await page.$eval('[data-tab-bend-grid]', (e) => e.scrollIntoView({ block: 'center' }));
        const grid = await page.$('[data-tab-bend-grid]'),
          rect = await grid.boundingBox(),
          h = (await state()).history;
        if (touch) await page.touchscreen.tap(rect.x + rect.width * 0.5, rect.y + (rect.height * 2) / 3);
        else {
          await page.mouse.move(rect.x + rect.width - 3, rect.y + rect.height * 0.5);
          await page.mouse.down();
          await page.mouse.move(rect.x + rect.width - 3, rect.y + (rect.height * 2) / 3, { steps: 5 });
          await page.mouse.up();
        }
        check('bend gesture one Undo', (await state()).history, h + 1);
        await key('z', 'Meta');
        check('bend gesture undo', (await state()).notes[1].bend.points.at(-1)[1], 3);
        await page.select('[data-tab-tech-bend-type]', 'prebend-release');
        check('prebend-release starts high', (await state()).notes[1].bend.points[0][1], 2);
        await page.select('[data-tab-tech-bend-type]', 'bend-release');
        check('bend-release starts low', (await state()).notes[1].bend.points[0][1], 0);
        await fixture();
        await key('o');
        check('ghost native', (await native())[1].ghost);
        await key('x');
        check('dead native', (await native())[1].dead);
        await key('i');
        check('let ring stored', (await state()).notes[1].letRing);
        await key(';');
        check('accent native', (await native())[1].accent, 1);
        await key('1', null, true);
        check('staccato stored', (await state()).notes[1].staccato);
        // Deleting a beat must not reconnect an incoming edge to a new neighbour.
        await fixture([n(0), n(1), n(2, 3, 0, { tie: true }), n(3)]);
        await page.evaluate(() => tabGpDelete(tabInsertEditorState, true));
        check(
          'delete beat clears orphan',
          (await state()).notes.some((n) => n.tie),
          false,
        );
        await fixture([n(0, 3, 0, { legato: true }), n(1, 5), n(2, 7), n(3, 9)]);
        await key('c', 'Meta');
        check(
          'single copied destination strips incoming',
          await page.evaluate(() => !!tabGpClipboard.segments[0][0].notes[0].legato),
          false,
        );
        await key('Home');
        await key('c', 'Meta');
        check(
          'single source copy strips outgoing',
          await page.evaluate(() => !!tabGpClipboard.segments[0][0].notes[0].legato),
          false,
        );
        await key('ArrowRight', null, true);
        await key('c', 'Meta');
        check(
          'copy pair retains H/P',
          await page.evaluate(() => tabGpClipboard.segments[0][0].notes[0].legato),
        );
        await page.evaluate(() => {
          const e = tabInsertEditorState;
          tabGpSetTime(e, 2, 0);
          tabGpPaste(e);
        });
        check('paste pair retains H/P', (await state()).notes.filter((n) => n.legato).length, 2);
        const performance = await page.evaluate(() => {
          const note = (start, fret, flags = {}) => ({
              start,
              dur: 1,
              string: 0,
              fret,
              ...flags,
            }),
            notes = [
              note(0, 3),
              note(1, 3, { tie: true, slide: 'legato' }),
              note(2, 7),
              note(3, 8, { pm: true, ghost: true, accent: 1, vibrato: 'wide' }),
            ];
          const opts = tabTechPerformance(notes, 4).map((e) =>
            tabTechSoundOptions(e, 0.5, songStringFreqs(), 10, 'clean'),
          );
          const old = pluckString,
            calls = [];
          pluckString = (ctx, options) => calls.push(options);
          try {
            playTabNotesAt({ type: 'tab', notes, beats: 4, events: [] }, 10, 120, '4/4', sections[0]);
          } finally {
            pluckString = old;
          }
          return {
            attacks: calls.length,
            durations: calls.map((c) => c.duration),
            soft: opts[1].skipAttack,
            bend: opts[0].bendPoints?.at(-1),
            gain: opts[2].gain,
            vib: opts[2].vibratoDepth,
          };
        });
        check('actual scheduler tied attacks', performance.attacks, 3);
        check('actual scheduler tied duration', performance.durations[0], 1);
        check('legato slide soft attack', performance.soft, 0.025);
        check('slide pitch path', performance.bend?.[1], 4);
        check('PM ghost accent gain', Math.abs(performance.gain - 0.5 * 0.7 * 0.45 * 1.35) < 1e-9);
        check('wide vibrato depth', performance.vib, 0.6);
        const scoreNotes = [
          n(0, 3, 0, { legato: true }),
          n(1, 5),
          n(2, 5, 0, { tie: true, slide: 'legato' }),
          n(3, 7),
          n(4, 12, 0, { harm: { type: 'natural' } }),
          n(4, 12, 1, { harm: { type: 'artificial', note: 'A4' } }),
          n(5, 12, 0, { vibrato: 'wide', letRing: true }),
          n(6, 12, 0, {
            bend: {
              type: 'bend',
              points: [
                [0, 0],
                [1, 2],
              ],
            },
          }),
          n(7, 0, 0, { pm: true, ghost: true, staccato: true, accent: 2 }),
        ];
        await fixture(scoreNotes, 2, 8);
        await wait(180);
        check('valid effect score Apply enabled', (await state()).disabled, false);
        check('SVG no engine error', (await state()).error, null);
        check(
          'mixed harmonic labels do not overlap',
          await page.evaluate(() =>
            [...document.querySelectorAll('.tab-at-host svg text')].some((t) =>
              ['N.H./A.H.', 'A.H./N.H.'].includes(t.textContent.trim()),
            ),
          ),
        );
        if (out) {
          await page.$eval('.tab-at-host', (e) => e.scrollIntoView({ block: 'start' }));
          await page.screenshot({
            path: path.join(out, `${width}-${theme}.png`),
          });
        }
        await click('[data-tab-apply]');
        // 0.692: мини-таб рисует alphaTab и делает это не мгновенно — ждём готовый
        // кадр по метке [data-thumb-done], иначе проверка ловит пустой контейнер.
        await page
          .waitForFunction(() => !!document.querySelector('[data-tab-thumb][data-thumb-done] svg'), { timeout: 15000 })
          .catch(() => {});
        const exported = await page.evaluate(async () => {
          const song = await exportStruchordFile(),
            a = gpExportBytesGP5(),
            b = gpExportBytes(),
            m = midiExportBytes();
          return {
            song,
            gp5: Array.from(a.bytes),
            gpx: Array.from(b.bytes),
            midi: Array.from(m.bytes),
            reports: [a.report, b.report, m.report],
            // 0.692: мини-таб в клетке рисует alphaTab (свой слой значков убран),
            // поэтому проверяем саму картинку движка, а не прежний атрибут.
            mini: (() => { const svg = document.querySelector('.tab-thumb svg'); return !!svg && svg.querySelectorAll('*').length > 20; })(),
          };
        });
        check('saved effects count', exported.song.sections[0].squares[0].notes.length, scoreNotes.length);
        check('miniature is drawn by alphaTab (0.692)', exported.mini);
        for (const [format, bytes] of [
          ['GP5', exported.gp5],
          ['GPX', exported.gpx],
        ]) {
          let score;
          if (format === 'GPX') {
            const file = codec
              .readContainer(Uint8Array.from(bytes))
              .entries.find((f) => f.name === 'score.gpif');
            score = readScore(gpifZip(new TextDecoder().decode(file.data || file.bytes)));
          } else score = readScore(bytes);
          const ns = flatten(score);
          check(format + ' note count', ns.length, 9);
          check(format + ' HO origin', ns[0].isHammerPullOrigin);
          check(format + ' tie dest', ns[2].isTieDestination);
          check(format + ' legato slide', ns[2].slideOutType, 2);
          check(format + ' PM', ns.at(-1).isPalmMute);
          check(format + ' ghost', ns.at(-1).isGhost);
          check(format + ' staccato', ns.at(-1).isStaccato);
          check(format + ' strong accent', ns.at(-1).accentuated, 2);
          check(format + ' vibrato', ns[6].vibrato, format === 'GP5' ? 1 : 2);
          check(format + ' bend', ns[7].bendPoints.at(-1).value, 4);
          check(
            format + ' NH',
            ns.find(
              (n) => n.string === 1 && n.fret === 12 && n.beat.voice.bar.index === 1 && n.beat.index === 0,
            ).harmonicType,
            1,
          );
          check(format + ' AH pitch', ns.find((n) => n.string === 2).realValue, 69);
        }
        const mid = parseMidi(Uint8Array.from(exported.midi)),
          attacks = mid.tracks.flat().filter((e) => e.type === 'noteOn' && e.velocity > 0);
        check('MIDI tie removes attack', attacks.length, 8);
        check(
          'MIDI harmonic sounding pitches',
          attacks.some((e) => e.noteNumber === 69),
        );
        check(
          'MIDI reports expression limit',
          exported.reports[2].losses.some((x) => /приёмы/.test(x.label)),
        );
        const file = path.join(require('os').tmpdir(), `struchord-tech-${process.pid}.struchord`);
        fs.writeFileSync(file, JSON.stringify(exported.song));
        await page.reload({ waitUntil: 'load' });
        await page.evaluate(() => {
          window.alert = () => {};
        });
        const chooserPromise = page.waitForFileChooser();
        await click('#homeImportSongBtn');
        const chooser = await chooserPromise;
        await chooser.accept([file]);
        await page.waitForFunction(() => sections[0]?.squares[0]?.notes?.length === 9);
        check(
          'file schema roundtrip',
          await page.evaluate(() => sections[0].squares[0].notes),
          exported.song.sections[0].squares[0].notes,
        );
        fs.unlinkSync(file);
        await page.evaluate(() => openTabInsertEditor(sections[0].id, sections[0].squares[0].id));
        await page.waitForSelector('.tab-at-host svg');
        console.log(`PASS ${width} ${theme}`);
      }
      await page.close();
    }
    check('no page exceptions', errors, []);
    console.log(`${checks} PASS / 0 FAIL`);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
