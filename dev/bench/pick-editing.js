// Подсветка редактируемой доли в редакторе перебора.
//
// В переборе клик по доле открывает окно выбора струн, и это окно
// перекрывает сетку. Без метки не видно, в какую именно долю уйдут
// цифры и «Б» — ячейки одинаковые, а рисунок бывает длинным.
const puppeteer = require('/home/user/node_modules/puppeteer');
let bad = 0;
const t = (n, c, x = '') => { if (c) console.log('   ok  ', n, x); else { bad++; console.log('  FAIL ', n, x); } };
(async () => {
  const br = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const p = await br.newPage();
  await p.setViewport({ width: 1400, height: 950 });
  p.setDefaultTimeout(90000);
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).split('\n')[0]));
  await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await new Promise((r) => setTimeout(r, 1100));

  await p.evaluate(() => {
    sections = [{ id: 1, type: 'Verse', repeat: 1, squares: [{ id: 1, repeat: 1,
      events: [{ chord: 'Am', span: 4 }, { chord: 'C', span: 4 },
        { chord: 'F', span: 4 }, { chord: 'G', span: 4 }] }] }];
    nextId = 9; render();
    openStrumPatternEditor('section', 1);
  });
  await new Promise((r) => setTimeout(r, 700));
  // переключаемся на перебор
  await p.evaluate(() => {
    const tab = [...document.querySelectorAll('.pattern-mode-tab')].find((b) => b.dataset.mode === 'pick');
    if (tab) tab.click();
  });
  await new Promise((r) => setTimeout(r, 500));

  const cells = await p.evaluate(() => document.querySelectorAll('.pattern-step-btn').length);
  console.log(`=== сетка перебора: ${cells} ячеек ===`);
  t('редактор открыт в режиме перебора', cells > 0, `${cells}`);

  // Клик по третьей доле
  const st = await p.evaluate(() => {
    const btns = [...document.querySelectorAll('.pattern-step-btn')];
    btns[2].click();
    return {
      popover: !!document.querySelector('.pattern-pick-popover'),
      editing: [...document.querySelectorAll('.pattern-step-btn.is-editing')]
        .map((e) => +e.dataset.stepIndex),
      ring: getComputedStyle(btns[2]).boxShadow.slice(0, 46),
    };
  });
  console.log(`   окно ${st.popover}, подсвечено ${JSON.stringify(st.editing)}`);
  t('окно выбора струн открылось', st.popover);
  t('подсвечена ровно одна доля', st.editing.length === 1, `${st.editing.length}`);
  t('подсвечена именно та, по которой кликнули', st.editing[0] === 2, `индекс ${st.editing[0]}`);
  t('подсветка видима (есть кольцо)', /rgb/.test(st.ring), st.ring);

  // Клик по другой доле — метка переезжает, не размножается
  const st2 = await p.evaluate(() => {
    const btns = [...document.querySelectorAll('.pattern-step-btn')];
    btns[5].click();
    return [...document.querySelectorAll('.pattern-step-btn.is-editing')].map((e) => +e.dataset.stepIndex);
  });
  t('метка переехала на новую долю', st2.length === 1 && st2[0] === 5, JSON.stringify(st2));

  // Закрытие окна снимает метку
  const st3 = await p.evaluate(() => {
    document.body.click();
    return {
      popover: !!document.querySelector('.pattern-pick-popover'),
      editing: document.querySelectorAll('.pattern-step-btn.is-editing').length,
    };
  });
  t('после закрытия окна метки нет', st3.editing === 0, `${st3.editing}`);

  // Метка не мешает выбору струн
  const st4 = await p.evaluate(() => {
    const btns = [...document.querySelectorAll('.pattern-step-btn')];
    btns[0].click();
    const pop = document.querySelector('.pattern-pick-popover');
    const toggles = [...pop.querySelectorAll('.pattern-pick-toggle')];
    // «Б» — первая кнопка
    toggles[0].click();
    const cell = btns[0];
    return { text: (cell.textContent || '').trim(), editing: cell.classList.contains('is-editing') };
  });
  console.log(`   после выбора «Б»: в ячейке «${st4.text}»`);
  t('выбор струны работает при активной метке', /Б/.test(st4.text), st4.text);
  t('метка держится, пока окно открыто', st4.editing);

  // Перерисовка сетки не должна оставлять висячих меток: кнопки
  // пересоздаются, и метка на удалённом узле — утечка состояния.
  const st5 = await p.evaluate(() => {
    // renderGrid зовётся при любой смене параметров рисунка; дёргаем
    // тот же путь, что и смена дробности.
    const before = document.querySelectorAll('.pattern-step-btn.is-editing').length;
    const tab = [...document.querySelectorAll('.pattern-mode-tab')].find((b) => b.dataset.mode === 'strum');
    if (tab) tab.click();
    return { before, after: document.querySelectorAll('.pattern-step-btn.is-editing').length };
  });
  console.log(`   до перерисовки ${st5.before}, после ${st5.after}`);
  t('после перерисовки сетки меток не осталось', st5.after === 0, `${st5.after}`);

  t('ошибок страницы нет', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё зелено');
  await br.close();
  process.exit(bad ? 1 : 0);
})();
