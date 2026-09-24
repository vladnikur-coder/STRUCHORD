// B-92 (2026-09-22): пустая сетка = честная тишина + каскад «Сохранить
// для всех» в редакторе ритма.
//
// Постановка (ROADMAP): «Пустая сетка при сохранении считается „пустым“
// ритмом без значка кастома; каскадная hover-кнопка: „Сохранить“ →
// „Сохранить для всех“ → выбор области („для всех Куплетов“ / „для всех
// секций“), как в редакторе аппликатур».
//
// Согласованные решения (ask_user):
//   - пустую сетку СОХРАНЯЕМ, но с предупреждением (пустая сетка чаще
//     означает «случайно стёр», чем намерение);
//   - области: «для всех <Типов>» и «для всех секций»;
//   - каскад только в редакторе СЕКЦИИ (не ячейки);
//   - секции со своим ритмом перезаписываем молча (отмена — Ctrl+Z).
//
// Замером в Chrome по ходу волны пойман настоящий баг: бейдж тишины
// убирался в render() и restoreSectionStrumBadge, но НЕ на быстром пути
// B-25 (syncSectionHeaderDom) — плашка «_ _ _ _» оставалась висеть.
// Поэтому проверка «нет бейджа» ниже идёт именно через быстрый путь.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const file = process.argv[2] || __dirname + '/../../STRUCHORD.html';
const html = fs.readFileSync(file, 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://localhost/',
  beforeParse(w) {
    w.HTMLCanvasElement.prototype.getContext = () => ({
      font: '', measureText: () => ({ width: 10 }),
      clearRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
      moveTo() {}, lineTo() {}, closePath() {}, save() {}, restore() {},
      translate() {}, rotate() {}, fillText() {}, strokeText() {},
      setTransform() {}, scale() {},
      createLinearGradient: () => ({ addColorStop() {} }),
    });
  },
});
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function () {
  return { currentTime: 0, state: 'running', resume() {} };
};

let bad = 0;
const ok = (name, cond, extra) => {
  console.log(`   ${cond ? 'ok  ' : 'FAIL'} ${name}${!cond && extra !== undefined ? ' — ' + extra : ''}`);
  if (!cond) bad++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

w.addEventListener('load', async () => {
  const d = w.document;

  // Песня: Куплет, Припев, Куплет, Бридж — два однотипных и два одиночных.
  const build = () => {
    w.eval(`
      const mk = (id, type) => ({ id, type, customName: null, key: null, shift: null,
        timeSig: null, bpm: null, repeat: 1, strumPattern: null,
        squares: [{ id: id * 100, repeat: 1, customBeats: null, strumPattern: null,
          events: [{ chord: 'Am', span: 4, timeSig: null, strumPattern: null }] }] });
      sections = [mk(1,'Verse'), mk(2,'Chorus'), mk(3,'Verse'), mk(4,'Bridge')];
      nextId = 50;
      if (typeof resetRhythmStorage === 'function') resetRhythmStorage();
      render();
    `);
  };
  const steps = (id) => {
    const s = w.eval(`(sections.find(s=>s.id===${id}).strumPattern||{}).steps`);
    return s ? Array.from(s).map((x) => x || '_').join('') : null;
  };
  const badge = (id) => !!d.querySelector(`.section-card[data-id="${id}"] .strum-badge-wrap`);
  const hitFirstCell = (idx) => {
    const cell = d.querySelector(`.pattern-step-btn[data-step-index="${idx}"]`);
    if (cell) cell.click();
    return !!cell;
  };

  console.log('=== 1. Каскад есть только в редакторе СЕКЦИИ (B-93) ===');
  build();
  await sleep(150);
  w.openStrumPatternEditor('section', 1);
  await sleep(150);
  ok('в редакторе секции каскад показан',
    d.getElementById('save-pattern-all-wrap')?.style.display !== 'none');
  // B-93: триггер-пилюля с короткими кнопками области.
  ok('триггер «Сохранить для всех…» присутствует',
    d.getElementById('pattern-save-trigger')?.textContent === 'Сохранить для всех…',
    d.getElementById('pattern-save-trigger')?.textContent);
  ok('триггер некликабелен (это SPAN)',
    d.getElementById('pattern-save-trigger')?.tagName === 'SPAN');
  ok('кнопка области типа — короткая подпись «Куплетов (N)»',
    d.getElementById('save-pattern-type')?.textContent === 'Куплетов (2)',
    d.getElementById('save-pattern-type')?.textContent);
  ok('кнопка всех секций — короткая подпись «Секций (N)»',
    d.getElementById('save-pattern-all')?.textContent === 'Секций (4)',
    d.getElementById('save-pattern-all')?.textContent);
  d.getElementById('cancel-pattern').click();
  await sleep(100);
  w.openStrumPatternEditor('event', 1, 100, 0);
  await sleep(150);
  // Регресс: #save-pattern-all-wrap — обёртка НАД самой кнопкой «Сохранить»
  // тоже (каскад с триггером и действиями лежит внутри неё же), не только
  // над каскадом. Пряча весь wrap, гасили и «Сохранить» — единственную
  // кнопку сохранения, которая в редакторе ячейки вообще есть.
  ok('в редакторе ЯЧЕЙКИ каскада нет, но wrap не спрятан целиком',
    d.getElementById('save-pattern-all-wrap')?.style.display !== 'none');
  ok('в редакторе ЯЧЕЙКИ сам каскад (триггер + действия) скрыт',
    d.querySelector('.pattern-save-cascade')?.style.display === 'none');
  ok('в редакторе ЯЧЕЙКИ кнопка «Сохранить» видна',
    d.getElementById('save-pattern')?.style.display !== 'none');
  d.getElementById('cancel-pattern').click();
  await sleep(100);

  console.log('=== 2. «Для всех Куплетов» — только однотипные секции ===');
  build();
  await sleep(150);
  w.openStrumPatternEditor('section', 1);
  await sleep(150);
  ok('сетка редактора построена', hitFirstCell(0));
  d.getElementById('save-pattern-type').click();
  await sleep(200);
  ok('Куплет №1 получил ритм', steps(1) && steps(1)[0] === 'D', steps(1));
  ok('Куплет №3 получил тот же ритм', steps(3) === steps(1), steps(3));
  ok('Припев не тронут', steps(2) === null, steps(2));
  ok('Бридж не тронут', steps(4) === null, steps(4));
  ok('у каждой секции СВОЙ объект (правки не связаны)',
    w.eval('sections[0].strumPattern !== sections[2].strumPattern'));

  console.log('=== 3. «Для всех секций» — вся песня ===');
  build();
  await sleep(150);
  w.openStrumPatternEditor('section', 2);
  await sleep(150);
  hitFirstCell(2);
  d.getElementById('save-pattern-all').click();
  await sleep(200);
  ok('ритм разошёлся по всем четырём секциям',
    [1, 2, 3, 4].every((id) => steps(id) && steps(id)[2] === 'D'),
    [1, 2, 3, 4].map(steps).join(' | '));

  console.log('=== 4. Обычное «Сохранить» осталось точечным ===');
  build();
  await sleep(150);
  w.openStrumPatternEditor('section', 1);
  await sleep(150);
  hitFirstCell(0);
  d.getElementById('save-pattern').click();
  await sleep(200);
  ok('правка только у своей секции', steps(1) !== null && steps(3) === null,
    `${steps(1)} | ${steps(3)}`);

  console.log('=== 5. Пустая сетка: предупреждение перед сохранением ===');
  build();
  await sleep(150);
  let asked = null;
  w.confirm = (msg) => { asked = msg; return false; };
  w.openStrumPatternEditor('section', 1);
  await sleep(150);
  d.getElementById('save-pattern').click();
  await sleep(150);
  ok('пустая сетка спрашивает подтверждение', !!asked && /молчать/.test(asked), String(asked));
  ok('отказ ничего не сохранил', steps(1) === null, steps(1));
  ok('окно осталось открытым', !!d.getElementById('save-pattern'));

  console.log('=== 6. Согласие — тишина сохраняется и звучит тишиной ===');
  w.confirm = () => true;
  d.getElementById('save-pattern').click();
  await sleep(200);
  ok('тишина записана паттерном', /^_+$/.test(steps(1) || ''), steps(1));
  ok('секция считается объявившей ритм (бой по умолчанию НЕ подменяет тишину)',
    w.eval('sectionRhythmDeclared(sections[0])'));
  const eff = w.eval(`
    (() => { const s = sections[0];
      const p = getEffectiveStrumPattern(null, s.squares[0], s);
      return p ? p.steps.map(x => x || '_').join('') : 'нет';
    })()
  `);
  ok('в звуке секции действительно тишина', /^_+$/.test(eff), eff);

  console.log('=== 7. Значка кастома у тишины нет (в т.ч. на быстром пути B-25) ===');
  ok('бейджа ритма нет после сохранения тишины', !badge(1), 'бейдж остался');
  ok('isSilentPattern отличает тишину от рисунка',
    w.eval(`isSilentPattern({steps:[null,null,null,null]}) === true &&
            isSilentPattern({steps:['D',null,null,null]}) === false &&
            isSilentPattern(null) === false`));
  w.eval('syncSectionHeaderDom(sections[0])');
  await sleep(80);
  ok('быстрый путь B-25 тоже не рисует бейдж тишины', !badge(1), 'бейдж вернулся');
  w.eval('render()');
  await sleep(120);
  ok('полная перерисовка тоже не рисует бейдж тишины', !badge(1), 'бейдж вернулся');

  console.log('=== 8. Обычный ритм бейдж по-прежнему получает ===');
  build();
  await sleep(150);
  w.openStrumPatternEditor('section', 1);
  await sleep(150);
  hitFirstCell(0);
  d.getElementById('save-pattern').click();
  await sleep(200);
  ok('у секции с ударом бейдж есть', badge(1), 'бейджа нет');

  console.log('=== 9. Каскад прячется, когда раздавать некому ===');
  w.eval(`
    sections = sections.slice(0, 1);
    if (typeof resetRhythmStorage === 'function') resetRhythmStorage();
    sections[0].strumPattern = null;
    render();
  `);
  await sleep(150);
  w.openStrumPatternEditor('section', 1);
  await sleep(150);
  ok('единственная секция в песне — каскад скрыт',
    d.querySelector('.pattern-save-cascade')?.style.display === 'none');
  ok('единственная секция в песне — «Сохранить» всё равно видна',
    d.getElementById('save-pattern')?.style.display !== 'none');
  d.getElementById('cancel-pattern').click();

  console.log('=== 10. Предупреждение прикрывает и раздачу «для всех» ===');
  build();
  await sleep(150);
  asked = null;
  w.confirm = (msg) => { asked = msg; return false; };
  w.openStrumPatternEditor('section', 1);
  await sleep(150);
  d.getElementById('save-pattern-all').click();
  await sleep(150);
  ok('пустая раздача тоже спрашивает', !!asked, 'вопроса не было');
  ok('отказ не разослал тишину по песне',
    [1, 2, 3, 4].every((id) => steps(id) === null),
    [1, 2, 3, 4].map(steps).join(' | '));

  console.log(bad ? `FAIL: ${bad}` : 'ALL OK');
  process.exit(bad ? 1 : 0);
});
