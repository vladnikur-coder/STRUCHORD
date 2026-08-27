// Счёт в редакторе ритма: под каждой ячейкой своя подпись
// («1 та и та 2 та и та»), а не одна цифра на всю долю.
//
// Слова берутся из той же countLabelFor, что и дорожка ритма в ленте —
// счёт обязан читаться одинаково в обоих местах.
const puppeteer = require('/home/user/node_modules/puppeteer');
let bad = 0;
const t = (n, c, x = '') => { if (c) console.log('   ok  ', n, x); else { bad++; console.log('  FAIL ', n, x); } };
(async () => {
  const br = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const p = await br.newPage();
  await p.setViewport({ width: 1500, height: 950 });
  p.setDefaultTimeout(90000);
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).split('\n')[0]));
  await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await new Promise((r) => setTimeout(r, 1100));

  const open = async (ts, sub) => {
    // Закрываем прошлый редактор: иначе модалки копятся и querySelector
    // берёт ячейки из самой первой.
    await p.evaluate(() => {
      document.querySelectorAll('.strum-modal-overlay').forEach((e) => e.remove());
    });
    await p.evaluate((sig) => {
      globalTimeSig = sig;
      sections = [{ id: 1, type: 'Verse', repeat: 1, squares: [{ id: 1, repeat: 1,
        events: [{ chord: 'Am', span: 4 }] }] }];
      nextId = 9; render();
      openStrumPatternEditor('section', 1);
    }, ts);
    await new Promise((r) => setTimeout(r, 600));
    if (sub) {
      // Дробление переключают кнопки .pattern-sub-btn (1 / 2 / 3 / 4),
      // а не выпадающий список.
      await p.evaluate((v) => {
        const btn = document.querySelector(`.pattern-sub-btn[data-sub="${v}"]`);
        if (btn) btn.click();
      }, sub);
      await new Promise((r) => setTimeout(r, 400));
    }
    return p.evaluate(() => {
      const groups = [...document.querySelectorAll('.pattern-beat-group')];
      return {
        cells: document.querySelectorAll('.pattern-step-btn').length,
        labels: groups.map((g) => [...g.querySelectorAll('.pattern-beat-number')].map((e) => e.textContent)),
        perGroupCells: groups.map((g) => g.querySelectorAll('.pattern-step-btn').length),
        sub: (typeof patternDraft !== 'undefined' && patternDraft && patternDraft.subdivision) || null,
      };
    });
  };

  console.log('=== 1. Дробление на восьмые: «1 и 2 и» ===');
  let r = await open('4/4', 2);
  const flat = r.labels.map((g) => g.join(' ')).join(' | ');
  console.log(`      ячеек ${r.cells}, подписи: ${flat}`);
  t('под каждой ячейкой своя подпись',
    r.labels.every((g, i) => g.length === r.perGroupCells[i]),
    `${JSON.stringify(r.labels.map((g) => g.length))} против ${JSON.stringify(r.perGroupCells)}`);
  const hasI = r.labels.some((g) => g.includes('и'));
  t('появилось «и» между долями', hasI, flat);
  t('номера долей на месте', r.labels.every((g) => /^\d+$/.test(g[0])), flat);

  console.log('\n=== 2. Дробление на шестнадцатые: «1 та и та» ===');
  r = await open('4/4', 4);
  const flat4 = r.labels.map((g) => g.join(' ')).join(' | ');
  console.log(`      ячеек ${r.cells}, подписи: ${flat4}`);
  const first = r.labels[0];
  t('в доле четыре подписи', first.length === 4, JSON.stringify(first));
  t('счёт читается «1 та и та»',
    first[0] === '1' && first[1] === 'та' && first[2] === 'и' && first[3] === 'та',
    JSON.stringify(first));
  t('вторая доля начинается с «2»', r.labels[1] && r.labels[1][0] === '2', JSON.stringify(r.labels[1]));

  console.log('\n=== 3. Совпадает с лентой ===');
  const same = await p.evaluate(() => {
    // Та же функция, что подписывает дорожку ритма.
    const out = [];
    for (let s = 1; s < 4; s++) out.push(countLabelFor(0, s, 4, 4));
    return out;
  });
  console.log(`      countLabelFor даёт: ${JSON.stringify(same)}`);
  t('редактор берёт слова из countLabelFor',
    same.join(',') === 'та,и,та', JSON.stringify(same));

  console.log('\n=== 4. Без дробления — только цифры ===');
  r = await open('4/4', 1);
  const flat1 = r.labels.map((g) => g.join('')).join(' ');
  console.log(`      подписи: ${flat1}`);
  t('одна подпись на долю', r.labels.every((g) => g.length === 1), flat1);
  t('это номера долей', /^1 2 3 4/.test(flat1), flat1);

  console.log('\n=== 5. Подписи выровнены под ячейками ===');
  const align = await p.evaluate(() => {
    const g = document.querySelector('.pattern-beat-group');
    const cells = [...g.querySelectorAll('.pattern-step-btn')];
    const nums = [...g.querySelectorAll('.pattern-beat-number')];
    return cells.map((c, i) => {
      const cr = c.getBoundingClientRect();
      const nr = nums[i] ? nums[i].getBoundingClientRect() : null;
      return nr ? +Math.abs((cr.left + cr.width / 2) - (nr.left + nr.width / 2)).toFixed(1) : null;
    });
  });
  console.log(`      расхождение центров: ${JSON.stringify(align)} px`);
  t('подпись стоит по центру своей ячейки',
    align.every((d) => d !== null && d < 1.5), JSON.stringify(align));

  console.log('\n=== 6. Составной размер 6/8 ===');
  r = await open('6/8', 2);
  const flat68 = r.labels.map((g) => g.join(' ')).join(' | ');
  console.log(`      подписи: ${flat68}`);
  t('группы отмечены номером, остальное точкой',
    r.labels.some((g) => g[0] === '1') && r.labels.some((g) => g[0] === '·'), flat68);

  t('ошибок страницы нет', errs.length === 0, errs.slice(0, 2).join(' | '));
  console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё зелено');
  await br.close();
  process.exit(bad ? 1 : 0);
})();
