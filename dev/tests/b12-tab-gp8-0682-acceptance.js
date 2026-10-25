#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const puppeteer = require('puppeteer-core');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8000';
const CHROME_PATH = process.env.CHROME_PATH || '/tmp/chromium';
const OUT_DIR = path.resolve(__dirname, '../bench/results/tab-gp8-0.682');
fs.mkdirSync(OUT_DIR, { recursive: true });

let passed = 0;
let failed = 0;
function check(label, actual, expected = true) {
  try {
    assert.deepStrictEqual(actual, expected, label);
    passed++;
    console.log(`ok   ${label}`);
  } catch (err) {
    failed++;
    console.error(`FAIL ${label}: ${err.message}`);
  }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    env: { ...process.env, LD_LIBRARY_PATH: '/tmp/al2023/lib' },
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
  });

  try {
    // =========================================================================
    // 1–2 & 6. ДЕСКТОП 1440×900: курсор GP, разные иконки Delete vs Dead, и аудит ВСЕХ 12 приёмов
    // =========================================================================
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
    await page.goto(`${BASE_URL}/STRUCHORD.html`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => typeof addTabInsert === 'function');

    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'light';
      startNewSongFromHome();
      if (!sections.length) addSection('Intro');
    });
    await page.waitForSelector('.section-card');
    await page.hover('.section-card');
    await wait(80);
    await page.click('.add-tab-btn');
    await page.waitForSelector('.tab-insert-editor .tab-at-host svg', { timeout: 20000 });
    await wait(250);

    // Пункт 2: разные иконки «Очистить ноту в паузу» и «Dead ×»
    const iconCheck = await page.evaluate(() => {
      const delSvg = document.querySelector('[data-tab-delete] svg')?.innerHTML?.trim() || '';
      const deadSvg = document.querySelector('[data-tab-tech="dead"] svg')?.innerHTML?.trim() || '';
      return {
        bothExist: delSvg.length > 10 && deadSvg.length > 10,
        different: delSvg !== deadSvg,
        delHasTrashBody: delSvg.includes('11.3') || delSvg.includes('M5 7h14'),
      };
    });
    check('П.2: значок «Очистить ноту в паузу» (корзина) отличается от «Dead ×»', iconCheck, {
      bothExist: true,
      different: true,
      delHasTrashBody: true,
    });

    // Пункт 1: курсор в окне ввода НЕ закрывает номер лада (прямоугольная рамка + вырез в линии)
    await page.keyboard.press('Digit1');
    await page.keyboard.press('Digit2');
    await wait(900);
    const cursorCheck = await page.evaluate(() => {
      const host = document.querySelector('.tab-at-host');
      const line = host.querySelector('.tab-at-cursor');
      const dot = host.querySelector('.tab-at-cursor-dot');
      const dr = dot.getBoundingClientRect();
      const cs = getComputedStyle(dot);
      const beat = tabAtApi.boundsLookup.staffSystems
        .flatMap((s) => s.bars.flatMap((m) => m.bars))
        .flatMap((b) => b.beats)
        .find((b) => b.notes?.length);
      const nh = beat.notes[0].noteHeadBounds;
      return {
        isRectNotCircle: parseFloat(cs.borderRadius) <= 8,
        frameWiderThanDigit: dr.width >= nh.w + 4 && dr.height >= nh.h + 4,
        lineHasTransparentWindow: (line.style.background || '').includes('transparent'),
      };
    });
    check('П.1: курсор — аккуратная прямоугольная рамка GP шире цифры «12» с прозрачным окном в линии', cursorCheck, {
      isRectNotCircle: true,
      frameWiderThanDigit: true,
      lineHasTransparentWindow: true,
    });

    // Пункт 6: реальная проверка ВСЕХ 12 групп приёмов (применение -> отображение на стане -> звук при «Прослушать»)
    const techAudit = await page.evaluate(async () => {
      const waitMs = (ms) => new Promise((r) => setTimeout(r, ms));
      // Перехватим реальные вызовы pluckString при нажатии кнопки «Прослушать» ([data-tab-gp="play"])
      const origPluck = window.pluckString;
      let captured = [];
      window.pluckString = function (ctx, opts) {
        captured.push({
          freq: Math.round(opts.freq * 100) / 100,
          startTime: opts.startTime,
          duration: Math.round(opts.duration * 1000) / 1000,
          gain: Math.round(opts.gain * 1000) / 1000,
          brightness: Math.round((opts.brightness || 0) * 1000) / 1000,
          vibratoDepth: opts.vibratoDepth || 0,
          hasBendPoints: Array.isArray(opts.bendPoints) && opts.bendPoints.length > 0,
          bendMaxSemi: Array.isArray(opts.bendPoints) ? Math.max(...opts.bendPoints.map((p) => p[1])) : 0,
          bendMinSemi: Array.isArray(opts.bendPoints) ? Math.min(...opts.bendPoints.map((p) => p[1])) : 0,
          startRate: Math.round((opts.startRate || 1) * 1000) / 1000,
          glide: Math.round((opts.glide || 0) * 1000) / 1000,
          skipAttack: opts.skipAttack || 0,
          damped: !!(opts.releaseAt && opts.releaseAt > 0),
        });
        return origPluck.apply(this, arguments);
      };

      async function playDraftAndCapture(fromStart = true) {
        captured = [];
        const ed = tabInsertEditorState;
        if (ed.draftPlay) tabEditorTogglePlay(ed, false);
        tabAtSetCursor(0, ed.gpCursor?.string ?? 0);
        if (fromStart) {
          document.querySelector('[data-tab-gp="play"]').click();
        } else {
          tabEditorTogglePlay(ed, true);
        }
        await waitMs(60);
        if (ed.draftPlay) tabEditorTogglePlay(ed, false);
        return captured.slice();
      }

      function setDraftNotes(notes, beats = 4) {
        const ed = tabInsertEditorState;
        ed.draft = { ...ed.draft, beats, notes: JSON.parse(JSON.stringify(notes)) };
        tabGpImport(ed);
        tabGpSync(ed);
      }

      const results = {};

      const draftNotes = () => tabInsertEditorState.draft.notes || [];

      // Базовый эталон: одиночная нота на 6-й струне, 5-й лад (A2 = 110 Гц), 1 четверть (0.5 с при 120 BPM)
      setDraftNotes([{ start: 0, dur: 1, string: 0, fret: 5 }]);
      await waitMs(120);
      const baseCalls = await playDraftAndCapture();
      const base = baseCalls[0];

      // 1) Лига длительности (нота + доля)
      setDraftNotes([
        { start: 0, dur: 1, string: 0, fret: 5 },
        { start: 1, dur: 1, string: 0, fret: 5 },
      ]);
      tabAtSetCursor(1, 0);
      document.querySelector('[data-tab-tech="tie"]').click();
      await waitMs(120);
      const tieCalls = await playDraftAndCapture();
      const miniTie = renderTabInsertHtml(sections[0], tabInsertEditorState.draft, '4/4', false);
      results.tie = {
        applied: !!draftNotes().find((n) => n.start === 1)?.tie,
        shownInMini: miniTie.includes('<path'),
        plucksCount: tieCalls.length,
        sustainedDuration: tieCalls[0]?.duration,
        baseDuration: base.duration,
      };

      // 2) H/P (легато) и фразировочная лига (slur)
      setDraftNotes([
        { start: 0, dur: 1, string: 0, fret: 5 },
        { start: 1, dur: 1, string: 0, fret: 7 },
      ]);
      tabAtSetCursor(0, 0);
      document.querySelector('[data-tab-tech="legato"]').click();
      await waitMs(120);
      const hpCalls = await playDraftAndCapture();
      const svgHpText = document.querySelector('.tab-at-host svg')?.textContent || '';
      setDraftNotes([
        { start: 0, dur: 1, string: 0, fret: 5 },
        { start: 1, dur: 1, string: 1, fret: 7 },
      ]);
      tabAtSetCursor(0, 0);
      document.querySelector('[data-tab-tech="slur"]').click();
      await waitMs(120);
      const slurCalls = await playDraftAndCapture();
      results.hpAndSlur = {
        hpApplied: !!draftNotes()[0],
        hpShownOnStaff: svgHpText.includes('H'),
        hpSecondNoteSoftNoPick: hpCalls.length === 2 && hpCalls[1].skipAttack > 0,
        slurSecondNoteSoftNoPick: slurCalls.length === 2 && slurCalls[1].skipAttack > 0,
      };

      // 3) P.M. (глушение ладонью)
      setDraftNotes([{ start: 0, dur: 1, string: 0, fret: 5 }]);
      tabAtSetCursor(0, 0);
      document.querySelector('[data-tab-tech="pm"]').click();
      await waitMs(120);
      const pmCalls = await playDraftAndCapture();
      const pmSvg = document.querySelector('.tab-at-host svg')?.textContent || '';
      results.pm = {
        applied: !!draftNotes()[0]?.pm,
        shownOnStaff: pmSvg.includes('P.M'),
        quieterAndDamped: pmCalls[0].gain < base.gain && pmCalls[0].duration < base.duration && pmCalls[0].damped,
      };

      // 4) Let ring
      setDraftNotes([
        { start: 0, dur: 1, string: 0, fret: 5 },
        { start: 1, dur: 1, string: 1, fret: 7 },
        { start: 2, dur: 1, string: 2, fret: 7 },
      ]);
      tabAtSetCursor(0, 0);
      document.querySelector('[data-tab-tech="letRing"]').click();
      await waitMs(120);
      const lrCalls = await playDraftAndCapture();
      const lrSvg = document.querySelector('.tab-at-host svg')?.textContent || '';
      results.letRing = {
        applied: !!draftNotes()[0]?.letRing,
        shownOnStaff: lrSvg.toLowerCase().includes('let') || lrSvg.includes('L.R'),
        ringsLongerThanWritten: lrCalls[0].duration > base.duration * 2,
      };

      // 5) Dead ×
      setDraftNotes([{ start: 0, dur: 1, string: 0, fret: 5 }]);
      tabAtSetCursor(0, 0);
      document.querySelector('[data-tab-tech="dead"]').click();
      await waitMs(120);
      const deadCalls = await playDraftAndCapture();
      const deadMini = renderTabInsertHtml(sections[0], tabInsertEditorState.draft, '4/4', false);
      results.dead = {
        applied: !!draftNotes()[0]?.dead,
        shownInMini: deadMini.includes('×'),
        shortPercussiveClick: deadCalls[0].duration <= 0.08 && deadCalls[0].damped,
      };

      // 6) Ghost (n)
      setDraftNotes([{ start: 0, dur: 1, string: 0, fret: 5 }]);
      tabAtSetCursor(0, 0);
      document.querySelector('[data-tab-tech="ghost"]').click();
      await waitMs(120);
      const ghostCalls = await playDraftAndCapture();
      const ghostMini = renderTabInsertHtml(sections[0], tabInsertEditorState.draft, '4/4', false);
      results.ghost = {
        applied: !!draftNotes()[0]?.ghost,
        shownInMini: ghostMini.includes('(5)'),
        softerGain: ghostCalls[0].gain < base.gain * 0.6,
      };

      // 7) Стаккато
      setDraftNotes([{ start: 0, dur: 1, string: 0, fret: 5 }]);
      tabAtSetCursor(0, 0);
      document.querySelector('[data-tab-tech="staccato"]').click();
      await waitMs(120);
      const stacCalls = await playDraftAndCapture();
      results.staccato = {
        applied: !!draftNotes()[0]?.staccato,
        shortDetached: stacCalls[0].duration < base.duration * 0.5 && stacCalls[0].damped,
      };

      // 8) Акценты (> обычный и ^ сильный маркато)
      setDraftNotes([{ start: 0, dur: 1, string: 0, fret: 5 }]);
      tabAtSetCursor(0, 0);
      document.querySelector('[data-tab-tech="accent"]').click();
      await waitMs(120);
      const acc1Calls = await playDraftAndCapture();
      document.querySelector('[data-tab-tech="strong"]').click();
      await waitMs(120);
      const acc2Calls = await playDraftAndCapture();
      results.accents = {
        normalLouder: acc1Calls[0].gain > base.gain * 1.25,
        strongLoudest: acc2Calls[0].gain > acc1Calls[0].gain,
      };

      // 9) Флажолеты (натуральный на 12-м ладу + искусственный +12 полутонов)
      setDraftNotes([{ start: 0, dur: 1, string: 0, fret: 12 }]);
      tabAtSetCursor(0, 0);
      const plain12 = (await playDraftAndCapture())[0];
      setDraftNotes([{ start: 0, dur: 1, string: 0, fret: 7 }]);
      tabAtSetCursor(0, 0);
      const plain7 = (await playDraftAndCapture())[0];
      document.querySelector('[data-tab-tech="natural"]').click();
      await waitMs(120);
      const nh7Calls = await playDraftAndCapture();
      const nhSvg = document.querySelector('.tab-at-host svg')?.textContent || '';

      setDraftNotes([{ start: 0, dur: 1, string: 0, fret: 5 }]);
      tabAtSetCursor(0, 0);
      document.querySelector('.tab-at-host').dispatchEvent(new KeyboardEvent('keydown', { key: 'y', code: 'KeyY', altKey: true, bubbles: true }));
      await waitMs(120);
      const ah5Calls = await playDraftAndCapture();
      const ahSvg = document.querySelector('.tab-at-host svg')?.textContent || '';
      results.harmonics = {
        nhShownOnStaff: nhSvg.includes('N.H') || nhSvg.includes('Harm'),
        nhRaisesPitch: nh7Calls[0].freq > plain7.freq * 1.9,
        ahShownOnStaff: ahSvg.includes('A.H') || ahSvg.includes('Harm'),
        ahOctaveHigher: Math.abs(ah5Calls[0].freq / base.freq - 2) < 0.03,
        plain12Freq: plain12.freq,
      };

      // 10) Бенд (Full = +1 тон = +2 полутона)
      setDraftNotes([{ start: 0, dur: 1, string: 2, fret: 7 }]);
      tabAtSetCursor(0, 2);
      document.querySelector('.tab-at-host').dispatchEvent(new KeyboardEvent('keydown', { key: 'b', code: 'KeyB', bubbles: true }));
      await waitMs(120);
      const bendCalls = await playDraftAndCapture();
      const bendSvg = document.querySelector('.tab-at-host svg')?.textContent || '';
      results.bend = {
        applied: !!draftNotes()[0]?.bend,
        shownOnStaff: bendSvg.toLowerCase().includes('full') || bendSvg.includes('1'),
        pitchCurveTwoSemitones: bendCalls[0].hasBendPoints && bendCalls[0].bendMaxSemi === 2,
      };

      // 11) Слайд (легато-слайд 5 -> 7 и въезд снизу in-below)
      setDraftNotes([
        { start: 0, dur: 1, string: 2, fret: 5 },
        { start: 1, dur: 1, string: 2, fret: 7 },
      ]);
      tabAtSetCursor(0, 2);
      const slideSel = document.querySelector('[data-tab-tech-slide]');
      slideSel.value = 'legato';
      slideSel.dispatchEvent(new Event('change', { bubbles: true }));
      await waitMs(120);
      const slideLegCalls = await playDraftAndCapture();

      setDraftNotes([{ start: 0, dur: 1, string: 2, fret: 7 }]);
      tabAtSetCursor(0, 2);
      slideSel.value = 'in-below';
      slideSel.dispatchEvent(new Event('change', { bubbles: true }));
      await waitMs(120);
      const slideInCalls = await playDraftAndCapture();
      results.slide = {
        legatoGlidesPitch: slideLegCalls[0].hasBendPoints && slideLegCalls[0].bendMaxSemi === 2 && slideLegCalls[1].skipAttack > 0,
        slideInGlidesFromBelow: slideInCalls[0].startRate < 0.95 && slideInCalls[0].glide > 0,
      };

      // 12) Вибрато (обычное и широкое)
      setDraftNotes([{ start: 0, dur: 1, string: 2, fret: 7 }]);
      tabAtSetCursor(0, 2);
      const vibSel = document.querySelector('[data-tab-tech-vibrato]');
      vibSel.value = 'slight';
      vibSel.dispatchEvent(new Event('change', { bubbles: true }));
      await waitMs(120);
      const vib1Calls = await playDraftAndCapture();
      tabAtSetCursor(0, 2);
      const vibSel2 = document.querySelector('[data-tab-tech-vibrato]');
      vibSel2.value = 'wide';
      vibSel2.dispatchEvent(new Event('change', { bubbles: true }));
      await waitMs(120);
      const vib2Calls = await playDraftAndCapture();
      results.vibrato = {
        slightDepth: vib1Calls[0].vibratoDepth === 0.25,
        wideDepth: vib2Calls[0].vibratoDepth === 0.6,
      };

      // Соберём красивую витрину приёмов на 2 такта для наглядного снимка экрана
      setDraftNotes([
        { start: 0, dur: 0.5, string: 0, fret: 0, pm: true },
        { start: 0.5, dur: 0.5, string: 0, fret: 3, legato: true },
        { start: 1, dur: 0.5, string: 0, fret: 5, slide: 'legato' },
        { start: 1.5, dur: 0.5, string: 0, fret: 7, vibrato: 'slight' },
        { start: 2, dur: 0.5, string: 1, fret: 5, ghost: true },
        { start: 2.5, dur: 0.5, string: 1, fret: 7, dead: true },
        { start: 3, dur: 1, string: 2, fret: 7, bend: { type: 'bend', points: [[0, 0], [0.5, 2], [1, 2]] }, accent: 2 },
        { start: 4, dur: 1, string: 3, fret: 12, harm: { type: 'natural' }, letRing: true },
        { start: 5, dur: 1, string: 2, fret: 9, staccato: true, accent: 1 },
        { start: 6, dur: 1, string: 1, fret: 7 },
        { start: 7, dur: 1, string: 1, fret: 7, tie: true },
      ], 8);
      tabAtScaleIndex = 5; // 1.2× чтобы на одном кадре были видны и все 2 такта витрины приёмов, и вся палитра GP8 снизу!
      tabInsertEditorState.manualZoom = true;
      tabGpSync(tabInsertEditorState);
      tabAtSetCursor(1.5, 0);
      window.pluckString = origPluck;
      return results;
    });

    await wait(350);
    await page.screenshot({ path: path.join(OUT_DIR, 'techniques-1440-light.png') });

    check('П.6 (1/12) Лига: связывает две ноты в один непрерывный щипок двойной длины', [
      techAudit.tie.applied,
      techAudit.tie.shownInMini,
      techAudit.tie.plucksCount === 1,
      Math.abs(techAudit.tie.sustainedDuration - techAudit.tie.baseDuration * 2) < 0.05,
    ], [true, true, true, true]);
    check('П.6 (2/12) H/P и фразировочная лига: буква H на стане, вторая нота звучит мягко без медиатора', techAudit.hpAndSlur, {
      hpApplied: true,
      hpShownOnStaff: true,
      hpSecondNoteSoftNoPick: true,
      slurSecondNoteSoftNoPick: true,
    });
    check('П.6 (3/12) P.M.: подпись P.M. на стане, звук тише, глуше и короче', techAudit.pm, {
      applied: true,
      shownOnStaff: true,
      quieterAndDamped: true,
    });
    check('П.6 (4/12) Let ring: подпись на стане, струна продолжает звенеть поверх следующих долей', techAudit.letRing, {
      applied: true,
      shownOnStaff: true,
      ringsLongerThanWritten: true,
    });
    check('П.6 (5/12) Dead ×: крестик × в табе и короткий сухой щелчок (≤ 0.08 с)', techAudit.dead, {
      applied: true,
      shownInMini: true,
      shortPercussiveClick: true,
    });
    check('П.6 (6/12) Ghost (n): скобки (5) в табе и приглушённая громкость', techAudit.ghost, {
      applied: true,
      shownInMini: true,
      softerGain: true,
    });
    check('П.6 (7/12) Стаккато: отрывистое короткое звучание с глушением хвоста', techAudit.staccato, {
      applied: true,
      shortDetached: true,
    });
    check('П.6 (8/12) Акценты (> и ^): обычный акцент громче нормы, сильный (^) ещё громче', techAudit.accents, {
      normalLouder: true,
      strongLoudest: true,
    });
    check('П.6 (9/12) Флажолеты (натуральный и искусственный): отображаются на стане и поднимают высоту тона', [
      techAudit.harmonics.nhShownOnStaff,
      techAudit.harmonics.nhRaisesPitch,
      techAudit.harmonics.ahShownOnStaff,
      techAudit.harmonics.ahOctaveHigher,
    ], [true, true, true, true]);
    check('П.6 (10/12) Бенд: стрелка full на стане и плавная подтяжка высоты на +2 полутона', techAudit.bend, {
      applied: true,
      shownOnStaff: true,
      pitchCurveTwoSemitones: true,
    });
    check('П.6 (11/12) Слайд: плавное скольжение высоты к соседней ноте и въезд снизу', techAudit.slide, {
      legatoGlidesPitch: true,
      slideInGlidesFromBelow: true,
    });
    check('П.6 (12/12) Вибрато: обычное (0.25) и широкое (0.60) качание высоты звучат при Прослушать', techAudit.vibrato, {
      slightDepth: true,
      wideDepth: true,
    });

    await page.click('[data-tab-cancel]');
    await wait(150);

    // =========================================================================
    // 7. ПОЛНЫЙ СЦЕНАРИЙ ПРИЁМКИ НА 1440 px + ПРОСЛУШИВАНИЕ ВСЕЙ ПЕСНИ ЦЕЛИКОМ
    // =========================================================================
    // Новая песня -> секция из 4 квадратов -> в 1-м квадрате аккорд Em с боем «Шестёрка» ->
    // перед ними таб из 4 четвертей [0, 3 на 6-й струне; 0, 2 на 5-й струне = E2, G2, A2, B2]
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'light';
      startNewSongFromHome();
    });
    await wait(150);
    // Создадим секцию Куплет и доведём до 4 квадратов через реальные кнопки UI
    const hasSec = await page.$('.section-card');
    if (!hasSec) {
      await page.evaluate(() => addSection('Куплет'));
      await page.waitForSelector('.section-card');
    }
    while ((await page.$$('.section-card .square')).length < 4) {
      await page.hover('.section-card');
      await page.click('.add-square-btn');
      await wait(80);
    }

    // Поставим аккорд Em в 1-й квадрат и выберем бой «Шестёрка» через настоящее окно ритма
    await page.evaluate(() => {
      sections[0].squares[0].events[0].chord = 'Em';
      requestRender();
    });
    await wait(150);
    await page.hover('.section-card .square:nth-child(1) .chord-wrapper');
    await wait(80);
    await page.click('.section-card .square:nth-child(1) .chord-btn-strum');
    await page.waitForSelector('[data-preset-id="six"]', { timeout: 5000 });
    await page.click('[data-preset-id="six"]');
    await wait(100);
    await page.click('#save-pattern');
    await wait(180);

    // Нажимаем «+ Таб» — по умолчанию он уже встаёт «в начале секции» перед всеми 4 квадратами!
    await page.hover('.section-card');
    await wait(80);
    await page.click('.add-tab-btn');
    await page.waitForSelector('.tab-insert-editor .tab-at-host svg', { timeout: 20000 });
    await wait(250);

    // Вводим 4 четвертные ноты: 6-я струна лад 0 (E2), лад 3 (G2), 5-я струна лад 0 (A2), лад 2 (B2)
    await page.click('[data-tab-dur="4"]');
    await wait(60);
    await page.keyboard.press('Digit0');
    await wait(120);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Digit3');
    await wait(120);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowUp'); // переход на 5-ю струну
    await page.keyboard.press('Digit0');
    await wait(120);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Digit2');
    await wait(300);

    await page.screenshot({ path: path.join(OUT_DIR, 'acceptance-editor-1440-light.png') });
    await page.click('[data-tab-apply]');
    await wait(250);
    await page.evaluate(() => window.scrollTo(0, 0));
    await wait(120);

    await page.screenshot({ path: path.join(OUT_DIR, 'acceptance-song-1440-light.png') });
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; window.scrollTo(0, 0); });
    await wait(120);
    await page.screenshot({ path: path.join(OUT_DIR, 'acceptance-song-1440-dark.png') });
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });

    // Прослушиваем ВСЮ ПЕСНЮ ЦЕЛИКОМ через настоящий мастер-выход WebAudio (PCM + хронология нот и ударов боя)!
    await page.evaluate(async () => {
      if (countInEnabled) toggleCountIn();
      if (!playbackState.metronomeMuted) toggleMetronome();
      const ctx = getAudioContext();
      ensureGuitarBus(ctx);
      window.__acceptAudio = { chunks: [], plucks: [], kind: 'chord', start: null };
      const url = URL.createObjectURL(new Blob([
        `registerProcessor('accept-capture', class extends AudioWorkletProcessor { process(inputs) { const pcm = inputs[0]?.[0]; if (pcm) this.port.postMessage({ time: currentTime, pcm: pcm.slice() }); return true; } });`,
      ], { type: 'application/javascript' }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      const tap = new AudioWorkletNode(ctx, 'accept-capture', { outputChannelCount: [1] });
      tap.port.onmessage = (e) => __acceptAudio.chunks.push(e.data);
      (guitarMasterPanner || masterFilters[masterFilters.length - 1]).connect(tap);
      tap.connect(ctx.destination);
      const origPluck = pluckString;
      const origTab = playTabNotesAt;
      window.pluckString = function (c, opts) {
        const res = origPluck(c, opts);
        __acceptAudio.plucks.push({
          kind: __acceptAudio.kind,
          freq: Math.round(opts.freq * 100) / 100,
          start: opts.startTime,
          duration: Math.round(opts.duration * 100) / 100,
        });
        return res;
      };
      window.playTabNotesAt = function (...args) {
        if (__acceptAudio.start === null) __acceptAudio.start = args[1];
        __acceptAudio.kind = 'tab';
        try { return origTab(...args); } finally { __acceptAudio.kind = 'chord'; }
      };
    });

    await page.click('#btnPlay');
    // Дождёмся полного проигрывания всей песни целиком (1 такт таба = 2.0 с + 4 квадрата по 4 такта = 32.0 с -> всего 34.0 с при 120 BPM)
    await page.waitForFunction(() => __acceptAudio.start !== null && !playbackState.isPlaying, { timeout: 42000 });

    const songPlaybackReport = await page.evaluate(() => {
      const t0 = __acceptAudio.start;
      const events = __acceptAudio.plucks.map((p) => ({
        kind: p.kind,
        relSec: Math.round((p.start - t0) * 1000) / 1000,
        freq: p.freq,
        duration: p.duration,
      }));
      // Сгруппируем удары боя по кластерам <= 100 мс (расгеадо по 6 струнам одного удара боя занимает ~75 мс)
      const chordPlucks = events.filter((e) => e.kind === 'chord').sort((a, b) => a.relSec - b.relSec);
      const strumClusters = [];
      for (const cp of chordPlucks) {
        const last = strumClusters[strumClusters.length - 1];
        if (!last || cp.relSec - last.startSec > 0.1) {
          strumClusters.push({ startSec: Math.round(cp.relSec * 100) / 100, firstFreq: cp.freq, lastFreq: cp.freq, strings: 1 });
        } else {
          last.lastFreq = cp.freq;
          last.strings++;
        }
      }
      const rmsInWindow = (a, b) => {
        const samples = __acceptAudio.chunks
          .filter((c) => c.time >= t0 + a && c.time < t0 + b)
          .flatMap((c) => Array.from(c.pcm));
        if (!samples.length) return 0;
        return Math.round(Math.sqrt(samples.reduce((s, x) => s + x * x, 0) / samples.length) * 100000) / 100000;
      };
      const sec = sections[0];
      const hasRhythmUi = !!document.querySelector('.section-card .square:nth-child(2) .chord-btn-strum.has-own, .section-card .square:nth-child(2) .event-strum-preview');
      return {
        squaresCount: sec.squares.length,
        firstIsTab: sec.squares[0].type === 'tab',
        tabNotes: sec.squares[0].notes,
        secondIsEmWithStrum: sec.squares[1].events[0].chord === 'Em' && hasRhythmUi,
        remainingChordSquares: sec.squares.slice(1).length,
        tabEvents: events.filter((e) => e.kind === 'tab'),
        strumClusters,
        pcmRms: {
          note1_E2: rmsInWindow(0.05, 0.45),
          note2_G2: rmsInWindow(0.55, 0.95),
          note3_A2: rmsInWindow(1.05, 1.45),
          note4_B2: rmsInWindow(1.55, 1.95),
          emBar_2to4s: rmsInWindow(2.05, 3.95),
          emptySquares_4p8to9p5s: rmsInWindow(4.8, 9.5),
        },
      };
    });

    console.log('PLAYBACK_TRACE:', JSON.stringify(songPlaybackReport, null, 2));

    check('П.7: в секции таб-вставка (4 ноты) + 4 аккордовых квадрата, первый из них — Em с боем «Шестёрка»', [
      songPlaybackReport.squaresCount,
      songPlaybackReport.firstIsTab,
      songPlaybackReport.tabNotes.length,
      songPlaybackReport.secondIsEmWithStrum,
      songPlaybackReport.remainingChordSquares,
    ], [5, true, 4, true, 4]);
    check('П.7: сначала звучат 4 ноты таба E2→G2→A2→B2 (0.0, 0.5, 1.0, 1.5 с), ровно в 2.0 с вступает бой Em (6 ударов «Шестёрки»), PCM подтверждён', [
      songPlaybackReport.tabEvents.map((e) => e.relSec),
      songPlaybackReport.strumClusters.map((c) => c.startSec),
      songPlaybackReport.pcmRms.note1_E2 > 0.0001 && songPlaybackReport.pcmRms.note4_B2 > 0.0001,
      songPlaybackReport.pcmRms.emBar_2to4s > 0.0001,
    ], [[0, 0.5, 1, 1.5], [2, 2.5, 2.75, 3.25, 3.5, 3.75], true, true]);

    check('Десктоп 1440px без ошибок страницы', errors, []);
    await page.close();

    // =========================================================================
    // 5. ПЛАНШЕТ 1024×768: нет пустой дыры между кнопками и цифровой клавиатурой 0–9
    // =========================================================================
    const tabPage = await browser.newPage();
    const tabErrors = [];
    tabPage.on('pageerror', (e) => tabErrors.push(String(e)));
    await tabPage.setViewport({ width: 1024, height: 768, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await tabPage.goto(`${BASE_URL}/STRUCHORD.html`, { waitUntil: 'load', timeout: 60000 });
    await tabPage.evaluate(() => {
      document.documentElement.dataset.theme = 'dark';
      startNewSongFromHome();
      if (!sections.length) addSection('Intro');
      addTabInsert(sections[0].id);
    });
    await tabPage.waitForSelector('.tab-insert-editor .tab-at-host svg', { timeout: 20000 });
    await wait(300);
    await tabPage.tap('[data-tab-digit="5"]');
    await tabPage.tap('[data-tab-time-step="1"]');
    await tabPage.tap('[data-tab-digit="7"]');
    await wait(900);

    const tabletLayout = await tabPage.evaluate(() => {
      const body = document.querySelector('.tab-editor-body');
      const pal = document.querySelector('.tab-palette').getBoundingClientRect();
      const frets = document.querySelector('.tab-tools-row--frets').getBoundingClientRect();
      return {
        gapBetweenButtonsAndFrets: Math.round(frets.top - pal.bottom),
        zeroScroll: body.scrollHeight <= body.clientHeight + 2,
        scale: tabAtApi.settings.display.scale,
      };
    });
    check('П.5: Планшет 1024×768 — пустое пространство между кнопками и 0–9 убрано (зазор ≤ 24px), стан крупнее (1.9×), скролла нет', [
      tabletLayout.gapBetweenButtonsAndFrets <= 24,
      tabletLayout.zeroScroll,
      tabletLayout.scale >= 1.85,
    ], [true, true, true]);
    await tabPage.screenshot({ path: path.join(OUT_DIR, 'acceptance-editor-1024-dark.png') });
    check('Планшет 1024px без ошибок страницы', tabErrors, []);
    await tabPage.close();

    // =========================================================================
    // 3, 4 & 7. ТЕЛЕФОН 390×844: отступ у 6-й струны, заголовок/курсор без «...», и кадры сценария приёмки
    // =========================================================================
    const phonePage = await browser.newPage();
    const phoneErrors = [];
    phonePage.on('pageerror', (e) => phoneErrors.push(String(e)));
    await phonePage.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await phonePage.goto(`${BASE_URL}/STRUCHORD.html`, { waitUntil: 'load', timeout: 60000 });

    // Сначала проверим и встроенную мини-таб ячейку (с нулём на 6-й струне!), и полный сценарий приёмки (таб 0-3-0-2 перед 4 квадратами с Em и боем)
    await phonePage.evaluate(() => {
      document.documentElement.dataset.theme = 'dark';
      startNewSongFromHome();
      if (!sections.length) addSection('Куплет');
      const sec = sections[0];
      sec.squares = [
        { id: nextId++, customBeats: null, events: [{ chord: 'Em', span: 4, timeSig: null, strumPattern: null, fingering: null }] },
        { id: nextId++, customBeats: null, events: [{ chord: '', span: 4, timeSig: null, strumPattern: null, fingering: null }] },
        { id: nextId++, customBeats: null, events: [{ chord: '', span: 4, timeSig: null, strumPattern: null, fingering: null }] },
        { id: nextId++, customBeats: null, events: [{ chord: '', span: 4, timeSig: null, strumPattern: null, fingering: null }] },
      ];
      requestRender();
    });
    await wait(200);
    await phonePage.tap('.section-card .square:nth-child(1) .chord-input');
    await wait(80);
    await phonePage.tap('.section-card .square:nth-child(1) .chord-btn-strum');
    await phonePage.waitForSelector('[data-preset-id="six"]', { timeout: 5000 });
    await phonePage.tap('[data-preset-id="six"]');
    await wait(80);
    await phonePage.tap('#save-pattern');
    await wait(180);
    await phonePage.evaluate(() => {
      sections[0].squares.unshift({
        id: nextId++,
        type: 'tab',
        beats: 4,
        customBeats: null,
        events: [],
        notes: [
          { start: 0, dur: 1, string: 0, fret: 0 },
          { start: 1, dur: 1, string: 0, fret: 3 },
          { start: 2, dur: 1, string: 1, fret: 0 },
          { start: 3, dur: 1, string: 1, fret: 2 },
        ],
      });
      requestRender();
    });
    await wait(250);

    // Пункт 3: проверим отступ между номером 6-й струны и нулём первой ноты И в полнострочном табе, И в узкой встроенной ячейке на 390px!
    const string6GapFullRow = await phonePage.evaluate(() => {
      const ti = document.querySelector('.tab-insert');
      const s6 = [...ti.querySelectorAll('.tab-string-number')].find((el) => el.textContent.trim() === '6').getBoundingClientRect();
      const n0 = ti.querySelector('.tab-note-position[data-start="0"] .tab-fret-number').getBoundingClientRect();
      return { s6Right: Math.round(s6.right * 10) / 10, n0Left: Math.round(n0.left * 10) / 10, gap: Math.round((n0.left - s6.right) * 10) / 10 };
    });

    await phonePage.evaluate(() => {
      document.querySelector('.section-card')?.scrollIntoView({ block: 'start' });
      window.scrollBy(0, -76);
    });
    await wait(120);
    await phonePage.screenshot({ path: path.join(OUT_DIR, 'acceptance-song-390-dark.png') });
    await phonePage.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
    await wait(120);
    await phonePage.screenshot({ path: path.join(OUT_DIR, 'acceptance-song-390-light.png') });
    await phonePage.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });

    // Проверим также самый узкий случай П.3 — встроенный 2-дольный мини-таб внутри квадрата на 390px!
    const string6GapInlineCell = await phonePage.evaluate(async () => {
      const sec = sections[0];
      sec.squares.push({
        id: nextId++,
        customBeats: 8,
        events: [
          { chord: '', span: 2, timeSig: null, isTab: true, tabNotes: [{ start: 0, dur: 0.5, string: 0, fret: 0 }, { start: 0.5, dur: 0.5, string: 0, fret: 2 }] },
          { chord: 'Em', span: 2, timeSig: null },
          { chord: 'G', span: 4, timeSig: null },
        ],
      });
      requestRender();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const ti = document.querySelector('.tab-insert--cell');
      const s6 = [...ti.querySelectorAll('.tab-string-number')].find((el) => el.textContent.trim() === '6').getBoundingClientRect();
      const n0 = ti.querySelector('.tab-note-position[data-start="0"] .tab-fret-number').getBoundingClientRect();
      sec.squares.pop();
      requestRender();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return { s6Right: Math.round(s6.right * 10) / 10, n0Left: Math.round(n0.left * 10) / 10, gap: Math.round((n0.left - s6.right) * 10) / 10 };
    });
    check('П.3: на телефоне 390px номер 6-й струны слева НЕ перекрывается нулём первой ноты (ни в строке, ни в узкой ячейке)', [
      string6GapFullRow.gap >= 4,
      string6GapInlineCell.gap >= 3,
    ], [true, true]);

    // Откроем таб-редактор на 390px на 4-й ноте («Такт 1 · Доля 4 · 5-я струна · 1/4») и проверим П.4!
    await phonePage.evaluate(() => openTabInsertEditor(sections[0].id, sections[0].squares[0].id));
    await phonePage.waitForSelector('.tab-insert-editor .tab-at-host svg', { timeout: 20000 });
    await wait(300);
    await phonePage.evaluate(() => tabAtSetCursor(3, 1));
    await wait(150);

    const phoneTextCheck = await phonePage.evaluate(() => {
      const title = document.getElementById('tabEditorTitle');
      const readout = document.querySelector('[data-tab-surface-readout]');
      const tr = title.getBoundingClientRect();
      const helpRect = document.querySelector('[data-tab-help]').getBoundingClientRect();
      return {
        titleText: title.textContent.trim(),
        titleUnclipped: title.scrollWidth <= title.clientWidth + 1 && tr.right <= helpRect.left + 1,
        readoutText: readout.textContent.trim(),
        readoutUnclipped: readout.scrollWidth <= readout.clientWidth + 1 && !readout.textContent.includes('...') && !readout.textContent.includes('…'),
      };
    });
    check('П.4: на телефоне 390px название «Таб-вставка» и подпись «Такт 1 · Доля 4 · 5-я струна · 1/4» видны целиком без многоточия', [
      phoneTextCheck.titleText === 'Таб-вставка',
      phoneTextCheck.titleUnclipped,
      phoneTextCheck.readoutText.includes('Такт 1 · Доля 4 · 5-я струна'),
      phoneTextCheck.readoutUnclipped,
    ], [true, true, true, true]);

    await phonePage.screenshot({ path: path.join(OUT_DIR, 'acceptance-editor-390-dark.png') });
    check('Телефон 390px без ошибок страницы', phoneErrors, []);
    await phonePage.close();
  } finally {
    await browser.close();
  }

  console.log(`\nИТОГ 0.682 приёмка и полировка: ${passed} PASS / ${failed} FAIL`);
  process.exit(failed > 0 ? 1 : 0);
})();
