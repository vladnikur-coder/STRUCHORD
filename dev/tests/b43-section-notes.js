// B-43: заметки у названия секции + 0.260: inline-правка плашек.
// Модель (поле, трим, лимит 200, пусто → null), Store-сеттер (тихая
// команда → undo), рендер (плашка ПОСЛЕДНЯЯ в шапке, размер по тексту),
// inline-редактирование в самой плашке (Enter/blur — сохранить, Esc —
// отмена), пункт меню «Заметка», inline-правка BPM, плашки на ленте
// (timeline), XSS-безопасность текста, сериализация (roundtrip + старый
// формат без note), клон.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM(fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8'), {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/',
  beforeParse(w) {
    w.HTMLCanvasElement.prototype.getContext = () => ({ font: '', measureText: () => ({ width: 10 }),
      clearRect(){}, beginPath(){}, arc(){}, fill(){}, stroke(){}, moveTo(){},
      lineTo(){}, closePath(){}, save(){}, restore(){}, translate(){}, rotate(){},
      fillText(){}, strokeText(){}, setTransform(){}, scale(){}, setLineDash(){},
      createLinearGradient: () => ({ addColorStop(){} }) });
  },
});
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function () {
  return { currentTime: 0, state: 'running', resume() {} };
};
let bad = 0;
const ok = (n, c, x) => { console.log(`   ${c ? 'ok  ' : 'FAIL'} ${n}${!c && x ? ' — ' + x : ''}`); if (!c) bad++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

w.addEventListener('load', async () => {
  const d = w.document;
  const evalv = (code) => w.eval(code);
  const noteOf = (i) => evalv(`sections[${i}].note`);
  const noteBadge = () => d.querySelector('.section-card .section-mod-badges .section-badge--note');
  const badgesOf = () => d.querySelector('.section-card .section-mod-badges');
  const inlineInput = () => d.querySelector('.badge-inline-input');
  const press = (el, key) => el.dispatchEvent(new w.KeyboardEvent('keydown', { key, bubbles: true }));

  console.log('=== 1. Модель и сеттер ===');
  evalv("sections = []; globalTimeSig = '4/4'; addSection('Verse'); render();");
  const sid = evalv('sections[0].id');
  ok('новая секция без заметки', noteOf(0) === null);
  w.setSectionNote(sid, '  Тихо, только папками  ');
  ok('трим по краям', noteOf(0) === 'Тихо, только папками', JSON.stringify(noteOf(0)));
  w.setSectionNote(sid, 'x'.repeat(250));
  ok('лимит 200 символов', noteOf(0).length === 200, noteOf(0).length + '');
  w.setSectionNote(sid, '   ');
  ok('пробелы = удалить (null)', noteOf(0) === null);
  w.setSectionNote(sid, null); // null = явная очистка (отмену проверяет inline-тест)
  ok('null = явная очистка', noteOf(0) === null);
  w.setSectionNote(sid, 'Заметка A');
  const jl0 = evalv('songStore.log.length');
  w.setSectionNote(sid, 'Заметка A'); // без изменений
  ok('no-op не пишет в журнал', evalv('songStore.log.length') === jl0,
     evalv('songStore.log.length') + ' против ' + jl0);

  console.log('\n=== 2. Undo (снимки истории, дебаунс 400 мс) ===');
  await sleep(500); // правки секции 1 улеглись в стек отдельным снимком
  w.setSectionNote(sid, 'Заметка B');
  ok('записалось B', noteOf(0) === 'Заметка B');
  await sleep(500); // снимок «B» зафиксирован (как в audit-undo)
  w.undoEdit();
  await sleep(100); // applyHistoryState восстанавливает состояние синхронно,
                    // снимаем флаг historyRestoring через rAF
  ok('undo откатил к A', noteOf(0) === 'Заметка A', JSON.stringify(noteOf(0)));

  console.log('\n=== 3. Рендер: последняя плашка, размер по тексту ===');
  evalv(`sections[0].timeSig = '6/8'; render();`);
  w.setSectionNote(sid, 'Тут вступает соло');
  const b = noteBadge();
  ok('плашка появилась', !!b);
  ok('текст плашки = заметке', b && b.textContent === 'Тут вступает соло');
  const kids = badgesOf().children;
  ok('плашка ПОСЛЕДНЯЯ после остальных', kids[kids.length - 1] === b,
     'сосед: ' + (kids[kids.length - 2] && kids[kids.length - 2].textContent));
  ok('бейдж размера не форсирует', b && !b.style.width, b && b.style.width);

  console.log('\n=== 4. Клик по плашке = inline-редактирование (0.260) ===');
  b.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  let inp = inlineInput();
  ok('плашка стала инпутом', !!inp);
  ok('инпут несёт текущий текст', inp && inp.value === 'Тут вступает соло');
  ok('ширина инпута — по содержимому (ch)', inp && /ch$/.test(inp.style.width), inp && inp.style.width);
  inp.value = 'Соло на две доли позже';
  press(inp, 'Enter');
  ok('Enter сохранил текст', noteOf(0) === 'Соло на две доли позже', JSON.stringify(noteOf(0)));
  ok('плашка вернулась с новым текстом', noteBadge() && noteBadge().textContent === 'Соло на две доли позже');
  noteBadge().dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  inp = inlineInput();
  inp.value = 'Совсем другой текст';
  press(inp, 'Escape');
  ok('Esc отменил правку', noteOf(0) === 'Соло на две доли позже', JSON.stringify(noteOf(0)));
  ok('плашка вернулась после Esc', noteBadge() && noteBadge().textContent === 'Соло на две доли позже');

  console.log('\n=== 5. Меню «три точки»: пункт «Заметка» открывает inline ===');
  evalv(`showSectionSettingsMenu(new Event('click'), ${sid})`);
  const items = [...d.querySelectorAll('.section-settings-menu div')];
  ok('пункт «Заметка» в меню', items.some(it => it.textContent === 'Заметка'));
  ok('пункт последний (после Бой/перебор)', items.length && items[items.length - 1].textContent === 'Заметка');
  items.find(it => it.textContent === 'Заметка').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const minp = inlineInput();
  ok('пункт открыл inline-правку', !!minp);
  minp.value = 'Из меню';
  press(minp, 'Enter');
  ok('текст из меню сохранён', noteOf(0) === 'Из меню', JSON.stringify(noteOf(0)));

  console.log('\n=== 6. BPM: inline-правка плашки (0.260) ===');
  w.setSectionBpm(sid, 96);
  let bpmB = d.querySelector('.section-card .section-mod-badges .section-badge--bpm');
  ok('BPM-бейдж на месте', bpmB && bpmB.textContent === '96 BPM');
  bpmB.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  let binp = inlineInput();
  ok('клик по BPM → инпут', !!binp && binp.value === '96');
  binp.value = '132';
  press(binp, 'Enter');
  ok('Enter сохранил BPM', evalv('sections[0].bpm') === 132, evalv('sections[0].bpm') + '');
  bpmB = d.querySelector('.section-card .section-mod-badges .section-badge--bpm');
  ok('бейдж обновился', bpmB && bpmB.textContent === '132 BPM');
  bpmB.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  binp = inlineInput();
  binp.value = '80';
  press(binp, 'Escape');
  ok('Esc отменил BPM', evalv('sections[0].bpm') === 132, evalv('sections[0].bpm') + '');

  console.log('\n=== 7. Лента: плашки заметки и BPM видны и редактируются (0.260) ===');
  evalv('timelineMode = true; renderTimeline();');
  const tlNote = d.querySelector('.tl-section-head .tl-badge--note');
  const tlBpm = d.querySelector('.tl-section-head .tl-badge--bpm');
  ok('плашка заметки на ленте', !!tlNote && tlNote.textContent === 'Из меню');
  ok('плашка BPM на ленте', !!tlBpm && tlBpm.textContent === '132 BPM');
  tlNote.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const tinp = inlineInput();
  ok('клик на ленте → inline-правка', !!tinp);
  tinp.value = 'Тише к финалу';
  press(tinp, 'Enter');
  ok('правка с ленты сохранена', noteOf(0) === 'Тише к финалу', JSON.stringify(noteOf(0)));
  ok('лента перерисовалась', d.querySelector('.tl-section-head .tl-badge--note').textContent === 'Тише к финалу');
  evalv('timelineMode = false; render();');

  console.log('\n=== 8. XSS: заметка — только текст ===');
  w.setSectionNote(sid, '<img src=x onerror="window.__b43xss=1">');
  const bx = noteBadge();
  ok('в DOM — как текст', bx && bx.textContent === '<img src=x onerror="window.__b43xss=1">');
  ok('код не исполнился', w.__b43xss === undefined);

  console.log('\n=== 9. Сериализация: roundtrip и старый формат ===');
  w.confirm = () => true;
  w.saveCurrentSong();
  const stored = JSON.parse(w.localStorage.getItem('struchord_songs'));
  ok('заметка в сохранении', stored[stored.length - 1].sections[0].note === '<img src=x onerror="window.__b43xss=1">');
  // Старый формат: песня без поля note (все релизы до 0.259)
  const legacy = JSON.parse(JSON.stringify(stored[stored.length - 1]));
  delete legacy.sections[0].note;
  legacy.name = 'Старый формат';
  w.localStorage.setItem('struchord_songs', JSON.stringify([legacy]));
  w.loadSong(0);
  ok('старый формат: note === null', noteOf(0) === null, JSON.stringify(noteOf(0)));
  // Roundtrip: загрузили сохранение с заметкой — заметка на месте
  w.localStorage.setItem('struchord_songs', JSON.stringify(stored.slice(-1)));
  w.loadSong(0);
  ok('roundtrip сохранил заметку', noteOf(0) === '<img src=x onerror="window.__b43xss=1">', JSON.stringify(noteOf(0)));

  console.log('\n=== 10. Клонирование секции ===');
  const before = evalv('sections.length');
  w.cloneSection(evalv('sections[0].id'));
  ok('секций стало больше', evalv('sections.length') === before + 1);
  ok('клон несёт заметку', noteOf(evalv('sections.length') - 1) === '<img src=x onerror="window.__b43xss=1">');

  console.log(bad ? `\nПРОВАЛОВ: ${bad}` : '\nвсе проверки пройдены');
  if (bad) process.exitCode = 1;
});
