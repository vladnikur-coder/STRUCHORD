#!/usr/bin/env node
'use strict';
// 0.884 · край песни, занятый таб-вставкой: скругление начинается чуть раньше.
//
// Что было (скриншот владельца, Лента): цифра стоит ЦЕНТРОМ на своём моменте
// (0.883), поэтому у первой ноты её левая половина лежит ЗА краем клетки —
// ровно на скруглении начала песни. Акцентная дуга угла проходила прямо
// сквозь цифру «3» на нижней струне, и угол читался «перечёркнутым».
//
// Что делает 0.884: у начала песни форма угла (заливка + акцентная дуга)
// сдвигается НАРУЖУ на --tl-edge-tab-pull; у конца — так же наружу вправо.
// Сама клетка, стан и ось времени НЕ двигаются: центры цифр и подписи счёта
// остаются там же (0.883), едет только форма угла. Радиус у такого угла
// чуть туже (--tl-edge-tab-radius): при полном 1.125rem дуга доставала бы
// до цифры, потому что чернила нижней цифры кончаются в 1 px от низа клетки.
//
// Признаки ставит renderTimeline на #timelineTrack: is-song-start-tab /
// is-song-end-tab — только оформление, модель и звук не трогаются.
//
// Запуск: node dev/tests/b12-timeline-tab-edges-0884.js

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'STRUCHORD.html'), 'utf8');
const SW = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const README = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const ROADMAP = fs.readFileSync(path.join(ROOT, 'ROADMAP.md'), 'utf8');
const CHANGELOG = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');

let passed = 0;
function ok(msg) {
  passed++;
  console.log('  ok  ' + msg);
}

function cssRules(selector) {
  const out = [];
  let from = 0;
  for (;;) {
    const i = HTML.indexOf('\n' + selector + ' {', from);
    if (i < 0) break;
    const j = HTML.indexOf('}', i);
    out.push({ text: HTML.slice(i, j + 1), at: i });
    from = j + 1;
  }
  return out;
}
// Правило по началу селектора: у составных селекторов (перечисление через
// запятую) после имени идёт запятая, а не « {», поэтому ищем начало и читаем
// тело до закрывающей скобки.
function ruleFrom(selectorStart, mustMatch) {
  const found = [];
  let from = 0;
  for (;;) {
    const i = HTML.indexOf(selectorStart, from);
    if (i < 0) break;
    const open = HTML.indexOf('{', i);
    const close = HTML.indexOf('}', open);
    const body = HTML.slice(open, close + 1);
    // Селектор может стоять в перечислении через запятую: тогда имя идёт
    // до запятой, а «{» — у следующего селектора. Проверяем, что между ними
    // только перечисление.
    const head = HTML.slice(i, open);
    if (/^[\s,.#:\w\-\[\]="'*()>+~]*$/.test(head)) found.push({ head, text: body, at: i });
    from = i + selectorStart.length;
  }
  assert(found.length, `CSS-правило не найдено: ${selectorStart}`);
  if (!mustMatch) return found[0];
  const hit = found.find((r) => mustMatch.test(r.text));
  assert(hit, `у правила нет нужных свойств: ${selectorStart}`);
  return hit;
}

// =====================================================================
// 1. Статика: переменные, правила угла, признаки дорожки
// =====================================================================
{
  assert(HTML.includes('ver 0.884'), 'STRUCHORD.html header is ver 0.884');
  assert(SW.includes("const CACHE_NAME = 'struchord-v884';"), 'sw.js CACHE_NAME is struchord-v884');
  assert(README.includes('`0.884`'), 'README header is 0.884');
  assert(ROADMAP.includes('**0.884**'), 'ROADMAP header is 0.884');
  assert(CHANGELOG.includes('## 0.884'), 'CHANGELOG has 0.884 entry');

  // А. Переменные отступа и радиуса — в одном месте.
  const stage = cssRules('.timeline-stage').find((r) => /--tl-edge-tab-pull/.test(r.text));
  assert(stage, 'переменная отступа объявлена на .timeline-stage');
  assert(/--tl-edge-tab-pull:\s*0\.75rem/.test(stage.text), 'отступ угла — 0.75rem (15 px при root 20 px)');
  assert(/--tl-edge-tab-radius:\s*0\.625rem/.test(stage.text), 'радиус угла у таба — 0.625rem');

  // Б. Угол рисует отдельный слой .tl-edge-cap: у клетки и ::before, и ::after
  //    уже заняты (выделение диапазона и полоса гармонии).
  const capBase = ruleFrom('.tl-edge-cap');
  assert(/position:\s*absolute/.test(capBase.text), 'угол — абсолютный слой');
  assert(/z-index:\s*-1/.test(capBase.text), 'слой лежит под содержимым клетки');
  assert(/pointer-events:\s*none/.test(capBase.text), 'угол не перехватывает нажатия — редактор открывается как раньше');
  assert(/background:\s*var\(--tl-cell-bg\)/.test(capBase.text), 'заливка угла — фон клетки');
  const capStart = ruleFrom('.tl-edge-cap.is-start');
  assert(/left:\s*calc\(-1 \* var\(--tl-edge-tab-pull\)\)/.test(capStart.text),
    'у начала песни угол сдвинут наружу на --tl-edge-tab-pull');
  assert(/right:\s*0/.test(capStart.text), 'и доходит до правого края клетки — без щели в угле');
  assert(/border-radius:\s*var\(--tl-edge-tab-radius\) 0 0 var\(--tl-edge-tab-radius\)/.test(capStart.text),
    'радиус угла — из переменной');
  assert(/box-shadow:\s*inset 0\.125rem 0 0 var\(--color-accent\)/.test(capStart.text),
    'акцентная дуга начала песни сохранена');
  const capEnd = ruleFrom('.tl-edge-cap.is-end');
  assert(/right:\s*calc\(-1 \* var\(--tl-edge-tab-pull\)\)/.test(capEnd.text),
    'у конца песни угол сдвинут наружу вправо');
  assert(!/inset 0\.125rem 0 0 var\(--color-accent\)/.test(capEnd.text),
    'акцентной черты в конце песни нет — как и было');
  const capBoth = ruleFrom('.tl-edge-cap.is-start.is-end');
  assert(/left:\s*calc\(-1 \* var\(--tl-edge-tab-pull\)\)/.test(capBoth.text) &&
    /right:\s*calc\(-1 \* var\(--tl-edge-tab-pull\)\)/.test(capBoth.text),
    'песня из одной таб-клетки тянется в обе стороны');

  // В. Подсветка текущего аккорда живёт на клетке, но угол её закрывает —
  //    значит те же два слоя обязаны быть и на угле.
  assert(ruleFrom('.tl-cell.tl-active .tl-edge-cap', /background-image/), 'фоновая подсветка повторена на угле');
  const activeStart = ruleFrom('.tl-cell.tl-active .tl-edge-cap.is-start');
  assert(/inset 0 -0\.1875rem 0 var\(--color-accent-warm\)/.test(activeStart.text),
    'нижняя полоса подсветки повторена на угле начала');
  const activeEnd = ruleFrom('.tl-cell.tl-active .tl-edge-cap.is-end');
  assert(/inset 0 -0\.1875rem 0 var\(--color-accent-warm\)/.test(activeEnd.text),
    'и на угле конца');

  // Г. Скобка заголовка секции идёт по той же вертикали — её тоже сдвигаем.
  const head = ruleFrom('#timelineTrack.is-song-start-tab .tl-section:first-child .tl-section-head');
  assert(/margin-left:\s*calc\(-1 \* var\(--tl-edge-tab-pull\)\)/.test(head.text),
    'скобка заголовка секции сдвигается вместе с углом на тот же отступ');
  assert(/border-top-left-radius:\s*var\(--tl-edge-tab-radius\)/.test(head.text), 'и с тем же радиусом');

  // Д. Признаки ставит рендер Ленты, а не что-то ещё.
  assert(HTML.includes("track.classList.toggle('is-song-start-tab'"),
    'признак «песня начинается табом» ставится в renderTimeline');
  assert(/const addEdgeCap = \(cell, isStart, isEnd\) =>/.test(HTML),
    'там же ставится слой угла .tl-edge-cap');
  assert(HTML.includes("addEdgeCap(tlFirst, true, true)"), 'для песни из одной таб-клетки — сразу в две стороны');
  assert(HTML.includes("track.classList.toggle('is-song-end-tab'"),
    'признак «песня кончается табом» ставится там же');
  assert(/const tlFirst = tlCells\[0\];/.test(HTML) && /const tlLast = tlCells\[tlCells\.length - 1\];/.test(HTML),
    'крайние клетки берутся в порядке ленты');

  // Е. 0.883 не откатили: цифра по-прежнему центром, обрезки нет.
  assert(HTML.includes("    anchor: 'middle',"), 'цифра Ленты стоит центром на своём моменте');
  assert(!/let dx = 0;/.test(HTML), 'сдвига цифры у правого края нет');
  assert(HTML.includes('overflow: visible;'), 'выступание за клетку разрешено');
  ok('Статика 0.884: угол песни с табом отступает наружу, дуга и скобка едут вместе');
}

// =====================================================================
// 2. Живая Лента: признаки на краях песни
// =====================================================================
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function boot() {
  let raw = HTML;
  for (const f of ['keyboard-audio.js', 'keyboard-accompaniment.js']) {
    const tag = `<script src="./${f}"></script>`;
    if (raw.includes(tag)) {
      raw = raw.replace(tag, () => `<script>${fs.readFileSync(path.join(ROOT, f), 'utf8')}</script>`);
    }
  }
  const vc = new VirtualConsole();
  const errors = [];
  vc.on('jsdomError', (e) => {
    if (!/Could not parse CSS|Not implemented/.test(e.message)) errors.push(e.message);
  });
  const dom = new JSDOM(raw, {
    url: 'http://127.0.0.1:8080/STRUCHORD.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(win) {
      win.matchMedia = () => ({
        matches: false, addListener() {}, removeListener() {},
        addEventListener() {}, removeEventListener() {},
      });
      win.HTMLCanvasElement.prototype.getContext = () => ({
        font: '', measureText: () => ({ width: 8 }),
        clearRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
        moveTo() {}, lineTo() {}, closePath() {}, save() {}, restore() {},
        translate() {}, rotate() {}, fillText() {}, strokeText() {},
        setTransform() {}, scale() {},
        createLinearGradient: () => ({ addColorStop() {} }),
      });
      Object.defineProperty(win.HTMLElement.prototype, 'offsetWidth', {
        get() { return parseFloat(this.style && this.style.width) || 100; },
      });
      win.Element.prototype.getBoundingClientRect = function () {
        const w0 = parseFloat(this.style && this.style.width) || 0;
        const isCell = this.classList && this.classList.contains('tl-cell');
        let left = 0;
        if (isCell && this.parentElement) {
          for (const sib of [...this.parentElement.children]) {
            if (sib === this) break;
            if (sib.classList && sib.classList.contains('tl-cell')) left += parseFloat(sib.style && sib.style.width) || 0;
          }
        }
        const width = isCell ? w0 : 0;
        const height = isCell ? 98 : 0;
        return { x: left, y: 0, left, top: 0, right: left + width, bottom: height, width, height };
      };
    },
  });
  return { w: dom.window, doc: dom.window.document, errors };
}

const EDGE = {
  start: '#timelineTrack.is-song-start-tab .tl-section:first-child .tl-square:first-child .tl-cell--tab:first-child',
  end: '#timelineTrack.is-song-end-tab .tl-section:last-child .tl-square:last-child .tl-cell--tab:last-child',
};

const TAB = [
  { start: 0, dur: 0.25, string: 0, fret: 3 },
  { start: 0.25, dur: 0.25, string: 1, fret: 5 },
];

async function runLive() {
  const { w, doc, errors } = boot();
  await sleep(1200);
  assert(!errors.length, 'стенд поднялся без ошибок: ' + errors.join(' | '));

  const build = (squares) => w.eval(`
    startNewSongFromHome();
    addSection('Verse');
    sections[0].squares = ${JSON.stringify(squares)};
    if (!timelineMode) toggleTimelineMode();
    renderTimeline();
  `);
  const classes = () => {
    const track = doc.getElementById('timelineTrack');
    return {
      start: track.classList.contains('is-song-start-tab'),
      end: track.classList.contains('is-song-end-tab'),
    };
  };
  const cells = () => [...doc.querySelectorAll('#timelineTrack .tl-cell')];

  // 1. Песня НАЧИНАЕТСЯ табом и КОНЧАЕТСЯ аккордом.
  build([
    { id: 1, type: 'chords', repeat: 1, customBeats: null, events: [
      { chord: '', span: 1, timeSig: null, isTab: true, tabNotes: TAB },
      { chord: 'C', span: 1 },
    ] },
  ]);
  let cls = classes();
  assert(cls.start === true, 'песня начинается табом — признак начала стоит');
  assert(cls.end === false, 'песня кончается аккордом — признака конца нет');
  const firstTabCell = cells()[0];
  assert(firstTabCell.classList.contains('tl-cell--tab'), 'первая клетка — таб-клетка');
  // Проверяем СЕЛЕКТОРЫ, а не computed style: jsdom не ранжирует `#id` в
  // каскаде (в 0.883 это уже выяснили на overflow) — в браузере решает
  // специфичность, здесь важно, что правило адресует именно эту клетку.
  assert(firstTabCell.matches(EDGE.start), 'правило угла адресует первую таб-клетку песни');
  assert(!cells().some((c, i) => i > 0 && c.matches(EDGE.start)),
    'и только её одну — середина песни не затронута');
  assert(!firstTabCell.matches(EDGE.end), 'угол конца к ней не применяется');
  const head = doc.querySelector('#timelineTrack .tl-section-head');
  assert(head.matches('#timelineTrack.is-song-start-tab .tl-section:first-child .tl-section-head'),
    'правило сдвига адресует скобку заголовка первой секции');
  // Слой угла: ровно один, у первой клетки, только с левой стороной.
  let caps = doc.querySelectorAll('#timelineTrack .tl-edge-cap');
  assert.strictEqual(caps.length, 1, 'слой угла ровно один — у начала песни');
  assert.strictEqual(caps[0].parentElement, firstTabCell, 'и лежит в первой таб-клетке');
  assert(caps[0].classList.contains('is-start') && !caps[0].classList.contains('is-end'),
    'тянется только влево');
  assert.strictEqual(firstTabCell.firstElementChild, caps[0], 'слой вставлен до содержимого клетки');
  assert.strictEqual(caps[0].getAttribute('aria-hidden'), 'true', 'для скринридера слой не существует');

  // 2. Песня НАЧИНАЕТСЯ аккордом и КОНЧАЕТСЯ табом — всё наоборот.
  build([
    { id: 1, type: 'chords', repeat: 1, customBeats: null, events: [
      { chord: 'Am', span: 1 },
      { chord: '', span: 1, timeSig: null, isTab: true, tabNotes: TAB },
    ] },
  ]);
  cls = classes();
  assert(cls.start === false, 'первая клетка — аккорд: признака начала нет');
  assert(cls.end === true, 'песня кончается табом — признак конца стоит');
  const lastCell = cells()[cells().length - 1];
  assert(lastCell.classList.contains('tl-cell--tab'), 'последняя клетка — таб-клетка');
  assert(lastCell.matches(EDGE.end), 'правило угла адресует последнюю таб-клетку песни');
  const chordFirstCell = cells()[0];
  assert(!chordFirstCell.matches(EDGE.start), 'у обычной первой клетки правила нет — скругление прежнее');
  caps = doc.querySelectorAll('#timelineTrack .tl-edge-cap');
  assert.strictEqual(caps.length, 1, 'слой угла один — теперь у конца песни');
  assert.strictEqual(caps[0].parentElement, lastCell, 'и лежит в последней таб-клетке');
  assert(caps[0].classList.contains('is-end') && !caps[0].classList.contains('is-start'),
    'тянется только вправо');

  // 3. Песня без табов — ни одного признака.
  build([
    { id: 1, type: 'chords', repeat: 1, customBeats: null, events: [
      { chord: 'Am', span: 2 }, { chord: 'Dm', span: 2 },
    ] },
  ]);
  cls = classes();
  assert(cls.start === false && cls.end === false, 'в песне без табов признаков нет');
  assert.strictEqual(doc.querySelectorAll('#timelineTrack .tl-edge-cap').length, 0,
    'и слоя угла нет — обычные клетки не тронуты');

  // 4. Песня из ОДНОЙ таб-клетки — тянуть надо в обе стороны.
  build([
    { id: 1, type: 'chords', repeat: 1, customBeats: null, events: [
      { chord: '', span: 2, timeSig: null, isTab: true, tabNotes: TAB },
    ] },
  ]);
  cls = classes();
  assert(cls.start === true && cls.end === true, 'одна таб-клетка — оба признака сразу');
  const only = cells()[0];
  assert(only.matches(EDGE.start) && only.matches(EDGE.end), 'и она попадает под оба правила — угол тянется в обе стороны');
  caps = doc.querySelectorAll('#timelineTrack .tl-edge-cap');
  assert.strictEqual(caps.length, 1, 'слой угла один на обе стороны');
  assert(caps[0].classList.contains('is-start') && caps[0].classList.contains('is-end'),
    'он тянется и влево, и вправо');

  // 5. Оформление не задело содержимое: стан по-прежнему свой, цифры на месте.
  const card = doc.querySelector('#timelineTrack .tl-cell--tab .tab-insert');
  assert(card && card.classList.contains('tab-insert--lenta'), 'карточка Ленты осталась прежней');
  const spec = JSON.parse(decodeURIComponent(card.querySelector('[data-tab-thumb]').getAttribute('data-tab-thumb')));
  assert.strictEqual(spec.n.length, 2, 'ноты вставки на месте — формат данных не тронут');
  ok('Живая Лента: признаки краёв и слой угла ставятся по фактическим крайним клеткам; середина и обычные края не тронуты');
  w.close();
}

(async () => {
  await runLive();
  console.log(`\nитого: ${passed} групп OK`);
})().catch((err) => {
  console.error('\nПРОВАЛ: ' + (err && err.message ? err.message : err));
  console.error(err && err.stack ? err.stack.split('\n').slice(0, 4).join('\n') : '');
  process.exit(1);
});
