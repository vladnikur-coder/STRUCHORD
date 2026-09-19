// B-43: заметки у названия секции.
// Модель (поле, трим, лимит 200, пусто → null), Store-сеттер (тихая
// команда → undo), рендер (плашка ПОСЛЕДНЯЯ в шапке, размер по тексту),
// клик по плашке, пункт меню «Заметка», XSS-безопасность текста,
// сериализация/загрузка (roundtrip + старый формат без note), клон.
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
  w.setSectionNote(sid, null); // null = явная очистка (отмену проверяет клик-тест)
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

  console.log('\n=== 4. Клик по плашке = редактирование ===');
  w.prompt = () => 'Соло на две доли позже';
  b.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  ok('клик сохранил новый текст', noteOf(0) === 'Соло на две доли позже', JSON.stringify(noteOf(0)));
  w.prompt = () => null; // отмена
  b.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  ok('отмена в prompt не меняет', noteOf(0) === 'Соло на две доли позже');

  console.log('\n=== 5. Меню «три точки»: пункт «Заметка» ===');
  evalv(`showSectionSettingsMenu(new Event('click'), ${sid})`);
  const items = [...d.querySelectorAll('.section-settings-menu div')];
  ok('пункт «Заметка» в меню', items.some(it => it.textContent === 'Заметка'));
  ok('пункт последний (после Бой/перебор)', items.length && items[items.length - 1].textContent === 'Заметка');
  evalv("document.querySelector('.section-settings-menu').remove()");

  console.log('\n=== 6. XSS: заметка — только текст ===');
  w.setSectionNote(sid, '<img src=x onerror="window.__b43xss=1">');
  const bx = noteBadge();
  ok('в DOM — как текст', bx && bx.textContent === '<img src=x onerror="window.__b43xss=1">');
  ok('код не исполнился', w.__b43xss === undefined);

  console.log('\n=== 7. Сериализация: roundtrip и старый формат ===');
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

  console.log('\n=== 8. Клонирование секции ===');
  const before = evalv('sections.length');
  w.cloneSection(evalv('sections[0].id'));
  ok('секций стало больше', evalv('sections.length') === before + 1);
  ok('клон несёт заметку', noteOf(evalv('sections.length') - 1) === '<img src=x onerror="window.__b43xss=1">');

  console.log(bad ? `\nПРОВАЛОВ: ${bad}` : '\nвсе проверки пройдены');
  if (bad) process.exitCode = 1;
});
