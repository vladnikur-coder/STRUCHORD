#!/usr/bin/env node
'use strict';

// 0.804 · B-120 (бэклог №29):
// 1. Удаление ручных знаков структуры + автоматические репризы |: :|
//    (при sq.repeat > 1 и sec.repeat > 1) в Редакторе, Партиях, Ленте и GP-экспорте.
// 2. Лента (#tlSecNav): защита от сжатия пунктов при 10+ секциях/проходах,
//    сквозная нумерация одноимённых секций («Куплет 1», «Куплет 2») и
//    синхронизация с полосой ленты без отставания на 1 аккорд и отката после повтора.
// 3. Отсутствие блокирующего предпрогрева fingeringCache + пропуск фоновых перестроек Редактора в Ленте
//    + отсутствие принудительного getBoundingClientRect в vibrateFingeringStrings.
// 4. Рабочий карандаш ✎ / пин / стрелки в #fingering-tooltip при capture pointerdown
//    и мгновенное обновление аппликатуры в стоящей на паузе Ленте после сохранения.

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'STRUCHORD.html'), 'utf8');

let pass = 0;
let fail = 0;
function check(name, ok, detail) {
  if (ok) {
    pass++;
    console.log('ok   ' + name);
  } else {
    fail++;
    console.error('FAIL ' + name + (detail ? ' — ' + detail : ''));
  }
}

// --- Статические проверки CSS / кода ---
check('CSS .tl-secnav-item имеет flex: 0 0 auto и геометрию пилюли .songmap-item (align-items: center, padding: 0.375rem 0.625rem)',
  /\.tl-secnav-item\s*\{[^}]*flex:\s*0\s+0\s+auto/.test(HTML) &&
  /\.tl-secnav-item\s*\{[^}]*align-items:\s*center/.test(HTML) &&
  /\.tl-secnav-item\s*\{[^}]*padding:\s*0\.375rem\s+0\.625rem/.test(HTML) &&
  /\.tl-secnav\s*\{[^}]*max-width:\s*11rem/.test(HTML));
check('CSS .tl-secnav-item повторяет цветной ховер по типу секции и капсульный бейдж ×N из .songmap-item/.songmap-repeat',
  ['verse', 'chorus', 'bridge', 'intro', 'outro', 'solo', 'pre-chorus'].every((t) =>
    new RegExp(`\\.tl-secnav-item\\.${t}:hover\\s*\\{[^}]*color-mix\\(in srgb,\\s*var\\(--label-`).test(HTML)
  ) &&
  /\.tl-secnav-pass\s*\{[^}]*rgba\(var\(--color-accent-rgb\),\s*0\.12\)/.test(HTML) &&
  /\.tl-secnav-pass\s*\{[^}]*border-radius:\s*var\(--border-radius-pill\)/.test(HTML) &&
  /:root\s*\{[\s\S]*?--label-verse-bg:/.test(HTML));
check('CSS .square--repeat-open/.square--repeat-close поднимает псевдоэлементы над фоном ячеек (z-index: 3)',
  /\.square--repeat-open\s+\.square-inner::before,\s*\.square--repeat-close\s+\.square-inner::after\s*\{[^}]*z-index:\s*3/.test(HTML));
check('ручной контрол .struct-badge удалён из верстки и CSS',
  !HTML.includes('class="struct-badge') && !HTML.includes('#ptBarGroup [data-bar="volta"]'));

// --- JSDOM интеграция ---
const dom = new JSDOM(HTML, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://127.0.0.1:8080/STRUCHORD.html',
  beforeParse(win) {
    win.localStorage.setItem('struchord-default-instrument', 'guitar');
    win.matchMedia = () => ({
      matches: false,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
    });
    win.HTMLCanvasElement.prototype.getContext = () => ({
      font: '',
      measureText: (t) => ({ width: String(t || '').length * 8 }),
      clearRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
      moveTo() {}, lineTo() {}, closePath() {}, save() {}, restore() {},
      translate() {}, rotate() {}, fillText() {}, strokeText() {}, setTransform() {}, scale() {},
      createLinearGradient: () => ({ addColorStop() {} }),
    });
    const nodeStub = () => ({
      buffer: null,
      type: 'lowpass',
      gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} },
      pan: { value: 0, setValueAtTime() {} },
      playbackRate: { value: 1, setValueAtTime() {} },
      frequency: { value: 1000, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
      Q: { value: 1, setValueAtTime() {} },
      threshold: { value: -12 }, knee: { value: 10 }, ratio: { value: 4 }, attack: { value: 0.003 }, release: { value: 0.25 },
      connect() { return this; }, disconnect() {}, start() {}, stop() {},
    });
    win.AudioContext = win.webkitAudioContext = function () {
      this.currentTime = 10;
      this.state = 'running';
      this.sampleRate = 44100;
      this.destination = nodeStub();
      this.resume = () => Promise.resolve();
      this.createGain = nodeStub;
      this.createConvolver = nodeStub;
      this.createStereoPanner = nodeStub;
      this.createBiquadFilter = nodeStub;
      this.createOscillator = nodeStub;
      this.createDynamicsCompressor = nodeStub;
      this.createBufferSource = nodeStub;
      this.createBuffer = (_ch, len) => ({ getChannelData: () => new Float32Array(len) });
    };
  },
});

const w = dom.window;
for (const ext of ['keyboard-audio.js', 'keyboard-accompaniment.js']) {
  w.eval(fs.readFileSync(path.join(ROOT, ext), 'utf8'));
}

setTimeout(async () => {
  try {
    // 1. Автоматические репризы + очистка устаревших ручных знаков в sanitizeSongData
    const autoRes = w.eval(`(() => {
      startNewSongFromHome();
      const raw = {
        schemaVersion: 7,
        bpm: 96,
        globalKey: 'C',
        globalTimeSig: '4/4',
        sections: [
          {
            id: 1, type: 'Intro', repeat: 1, timeSig: '4/4',
            squares: [
              { id: 10, repeat: 2, volta: 1, mark: 'segno', jump: { type: 'dc', target: 'fine' }, events: [{ chord: 'C', span: 2 }, { chord: 'F', span: 2 }] },
              { id: 11, repeat: 1, repeatOpen: true, events: [{ chord: 'G', span: 4 }] },
            ],
          },
          {
            id: 2, type: 'Verse', repeat: 2, timeSig: '4/4',
            squares: [
              { id: 20, repeat: 1, events: [{ chord: 'C', span: 2 }, { chord: 'G', span: 2 }] },
              { id: 21, repeat: 1, events: [{ chord: 'Am', span: 2 }, { chord: 'E', span: 2 }] },
              { id: 22, repeat: 1, events: [{ chord: 'F', span: 4 }] },
            ],
          },
          {
            id: 3, type: 'Verse', repeat: 1, timeSig: '4/4',
            squares: [
              { id: 30, repeat: 1, events: [{ chord: 'Dm', span: 2 }, { chord: 'G7', span: 2 }] },
            ],
          },
        ],
      };
      localStorage.setItem('struchord_songs', JSON.stringify([raw]));
      loadSong(0);
      render();
      const qEl = (si, qi) => document.querySelector('.square[data-square="' + sections[si].squares[qi].id + '"]');
      const sq10 = qEl(0, 0);
      const sq11 = qEl(0, 1);
      const sq20 = qEl(1, 0);
      const sq21 = qEl(1, 1);
      const sq22 = qEl(1, 2);
      return {
        cleanSq10Keys: Object.keys(sections[0].squares[0]),
        sq10Open: sq10.classList.contains('square--repeat-open'),
        sq10Close: sq10.classList.contains('square--repeat-close'),
        sq11Open: sq11.classList.contains('square--repeat-open'),
        sq20Open: sq20.classList.contains('square--repeat-open'),
        sq20Close: sq20.classList.contains('square--repeat-close'),
        sq21Open: sq21.classList.contains('square--repeat-open'),
        sq21Close: sq21.classList.contains('square--repeat-close'),
        sq22Open: sq22.classList.contains('square--repeat-open'),
        sq22Close: sq22.classList.contains('square--repeat-close'),
        ptButtons: Array.from(document.querySelectorAll('#ptBarGroup [data-bar]')).map(b => b.dataset.bar),
      };
    })()`);

    check('sanitizeSongData очищает ручные volta/mark/jump/repeatOpen',
      !['volta', 'mark', 'jump', 'repeatOpen', 'repeatClose'].some((k) => autoRes.cleanSq10Keys.includes(k)),
      JSON.stringify(autoRes.cleanSq10Keys));
    check('квадрат с repeat=2 автоматически получает |: и :| в Редакторе',
      autoRes.sq10Open && autoRes.sq10Close && !autoRes.sq11Open,
      JSON.stringify(autoRes));
    check('секция с repeat=2 ставит |: на первый квадрат и :| на последний квадрат',
      autoRes.sq20Open && !autoRes.sq20Close && !autoRes.sq21Open && !autoRes.sq21Close && !autoRes.sq22Open && autoRes.sq22Close,
      JSON.stringify(autoRes));
    check('vibrateFingeringStrings не вызывает принудительный reflow getBoundingClientRect()',
      !/getBoundingClientRect\s*\(/.test(w.eval('String(vibrateFingeringStrings)').replace(/\/\/.*$/gm, '')));
    check('в палитре партий #ptBarGroup убраны ручные знаки структуры и оставлена реприза',
      JSON.stringify(autoRes.ptButtons) === JSON.stringify(['clef', 'key', 'timesig', 'repeat']),
      JSON.stringify(autoRes.ptButtons));

    // 2. Карандаш ✎ в #fingering-tooltip не съедается capture-обработчиком pointerdown
    const pencilRes = w.eval(`(() => {
      const wrapper = document.querySelector('.square[data-square="' + sections[0].squares[0].id + '"] .chord-wrapper');
      showFingeringTooltip('C', wrapper);
      const tip = document.getElementById('fingering-tooltip');
      const btn = tip && tip.querySelector('.tooltip-edit-btn');
      if (!btn) return { hasBtn: false };
      const pd = new window.Event('pointerdown', { bubbles: true, cancelable: true });
      btn.dispatchEvent(pd);
      const tipVisibleAfterPointerdown = tip.style.display === 'block';
      btn.click();
      const editorModal = document.querySelector('[aria-label="Редактор аппликатуры"]');
      const cancelBtn = document.getElementById('cancel-fingering');
      if (cancelBtn) cancelBtn.click();
      return { hasBtn: true, tipVisibleAfterPointerdown, openedEditor: !!editorModal };
    })()`);

    check('pointerdown по ✎ в тултипе не закрывает тултип до click и открывает редактор аппликатуры',
      pencilRes.hasBtn && pencilRes.tipVisibleAfterPointerdown && pencilRes.openedEditor,
      JSON.stringify(pencilRes));

    // 3. Лента: без блокирующего предпрогрева, нумерация секций, репризы и синхронизация
    const tlRes = w.eval(`(() => {
      fingeringCache.clear();
      toggleTimelineMode(true);
      const result = {
        warmedSize: fingeringCache.size,
        navLabels: Array.from(document.querySelectorAll('#tlSecNav .tl-secnav-item')).map((b) =>
          b.querySelector('.tl-secnav-name').textContent +
          (b.querySelector('.tl-secnav-pass') ? ' [' + b.querySelector('.tl-secnav-pass').textContent + ']' : '')
        ),
        headLabels: Array.from(document.querySelectorAll('.tl-section-head')).map((h) => h.textContent),
        tlOpenMarks: document.querySelectorAll('#timelineTrack .tl-repeat-mark--open').length,
        tlCloseMarks: document.querySelectorAll('#timelineTrack .tl-repeat-mark--close').length,
      };
      window.__b120AudioClock = getAudioContext();
      playAll();
      return result;
    })()`);
    const captureTimelineSync = () => w.eval(`(() => {
      const cur = document.querySelector('#tlSecNav .tl-secnav-item.is-current');
      return { secIdx: playbackState.soundingCell.sectionIndex, secPass: playbackState.soundingCell.secPass,
        navIdx: cur ? Number(cur.dataset.sectionIndex) : -1, navPass: cur ? Number(cur.dataset.secPass) : -1 };
    })()`);
    tlRes.trace = [];
    await new Promise(resolve => w.setTimeout(resolve, 20));
    tlRes.trace.push(captureTimelineSync());
    let playbackGuard = 0;
    while (w.eval('playbackState.isPlaying') && playbackGuard++ < 50) {
      w.eval('clearTimeout(playbackState.schedulerTimer); __b120AudioClock.currentTime = nextEventTime; scheduleNextEvent(__b120AudioClock);');
      await new Promise(resolve => w.setTimeout(resolve, 20));
      if (w.eval('playbackState.isPlaying')) tlRes.trace.push(captureTimelineSync());
    }

    check('включение Ленты и старт Play не запускают синхронный предпрогрев аппликатур',
      tlRes.warmedSize === 0, String(tlRes.warmedSize));
    check('одноимённые секции нумеруются в #tlSecNav (одной пилюлей ×N) и заголовках полосы (1/N, 2/N)',
      JSON.stringify(tlRes.navLabels) === JSON.stringify(['Интро', 'Куплет 1 [×2]', 'Куплет 2']) &&
      tlRes.headLabels[1] === 'Куплет 1 1/2' && tlRes.headLabels[2] === 'Куплет 1 2/2' && tlRes.headLabels[3] === 'Куплет 2',
      JSON.stringify({ nav: tlRes.navLabels, heads: tlRes.headLabels }));
    check('в режиме Ленты знаки репризы |: :| не рисуются (повторы уже развёрнуты в полосу)',
      tlRes.tlOpenMarks === 0 && tlRes.tlCloseMarks === 0,
      JSON.stringify({ open: tlRes.tlOpenMarks, close: tlRes.tlCloseMarks }));
    check('во время проигрывания #tlSecNav идёт шаг-в-шаг со звучащим аккордом на всех границах и повторах',
      tlRes.trace.length === 17 && tlRes.trace.every((t) => t.secIdx === t.navIdx),
      JSON.stringify(tlRes.trace));

    const navClickRes = w.eval(`(() => {
      if (playbackState.isPlaying) stopPlayback();
      const btns = Array.from(document.querySelectorAll('#tlSecNav .tl-secnav-item'));
      btns[1].click();
      const after1 = {
        secIdx: timelineStartPosition && timelineStartPosition.sectionIndex,
        secPass: timelineStartPosition ? ((timelineStartPosition.sectionRepeatCount || {})['sec_1'] || 0) : -1,
        curIdx: Number((document.querySelector('#tlSecNav .tl-secnav-item.is-current') || {}).dataset?.sectionIndex ?? -1),
        pastCount: document.querySelectorAll('#tlSecNav .tl-secnav-item.is-past').length,
      };
      btns[2].click();
      const after2 = {
        secIdx: timelineStartPosition && timelineStartPosition.sectionIndex,
        curIdx: Number((document.querySelector('#tlSecNav .tl-secnav-item.is-current') || {}).dataset?.sectionIndex ?? -1),
        pastCount: document.querySelectorAll('#tlSecNav .tl-secnav-item.is-past').length,
      };
      return { after1, after2 };
    })()`);
    check('клик по пилюле #tlSecNav переводит Ленту на начало выбранной секции и отмечает пройденные',
      navClickRes.after1.secIdx === 1 && navClickRes.after1.secPass === 0 &&
      navClickRes.after1.curIdx === 1 && navClickRes.after1.pastCount === 1 &&
      navClickRes.after2.secIdx === 2 && navClickRes.after2.curIdx === 2 && navClickRes.after2.pastCount === 2,
      JSON.stringify(navClickRes));

    // 4. Редактирование аппликатуры на паузе в Ленте сразу обновляет панель «Сейчас»
    const pauseEditRes = w.eval(`(() => {
      const firstTlCell = document.querySelector('#timelineTrack .tl-cell');
      timelineActiveCell = firstTlCell;
      showPausedFingering(firstTlCell);
      const beforeHtml = document.getElementById('tlNowFing').innerHTML;
      const editBtn = document.querySelector('#tlPanelNow .tooltip-edit-btn');
      if (editBtn) editBtn.click();
      const cancelFirst = document.getElementById('cancel-fingering');
      if (cancelFirst) cancelFirst.click();
      openFingeringEditor('C', 1, document.querySelector('.square[data-square="' + sections[0].squares[0].id + '"] .chord-wrapper'));
      const modal = document.querySelector('[aria-label="Редактор аппликатуры"]');
      const saveBtn = document.getElementById('save-fingering-all') || document.getElementById('save-fingering');
      if (saveBtn) saveBtn.click();
      const afterHtml = document.getElementById('tlNowFing').innerHTML;
      return { hadModal: !!modal, changed: beforeHtml !== afterHtml && afterHtml.includes('<svg') };
    })()`);

    check('сохранение аппликатуры в стоящей Ленте сразу перерисовывает панель «Сейчас»',
      pauseEditRes.hadModal && pauseEditRes.changed,
      JSON.stringify(pauseEditRes));

    console.log(`\nитого: ${pass} ok, ${fail} FAIL`);
    dom.window.close();
    process.exit(fail ? 1 : 0);
  } catch (err) {
    console.error(err);
    dom.window.close();
    process.exit(1);
  }
}, 250);
