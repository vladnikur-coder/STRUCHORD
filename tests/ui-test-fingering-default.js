// Пробник новых правил аппликатур (2026-08-12):
//  1. Сохранённая своя форма — умолчание для ПОСЛЕДУЮЩИХ вхождений;
//     стоялые ячейки прибиты (pin) — не прыгают.
//  2. Перезапись своей формы тоже становится умолчанием (она «свежая»).
//  3. Семейный перенос: Aadd9 5,7,9,6,x,x -> Badd9 7,9,11,8,x,x.
//  4. Донор с открытыми струнами не переносится.
//  5. Голые трезвучия семьёй не считаются.
//  6. amadd9 — отдельная от add9 семья.
//  7. setEventChord учит кнопки колеса с любого пути.
const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('/home/user/STRUCHORD.html', 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://localhost/',
  beforeParse(win) {
    win.HTMLCanvasElement.prototype.getContext = () => ({
      font: '', measureText: () => ({ width: 10 }),
      clearRect(){}, beginPath(){}, arc(){}, fill(){}, stroke(){}, moveTo(){},
      lineTo(){}, closePath(){}, save(){}, restore(){}, translate(){}, rotate(){},
      fillText(){}, strokeText(){}, setTransform(){}, scale(){},
      createLinearGradient: () => ({ addColorStop(){} }),
    });
  },
});
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function () {
  return { currentTime: 0, state: 'running', resume() {} };
};

let failed = 0;
function check(name, cond, extra) {
  console.log((cond ? 'ok  ' : 'FAIL') + ' ' + name + (extra ? '  [' + extra + ']' : ''));
  if (!cond) failed++;
}

function run() {
  const song = {
    schemaVersion: 2, name: 'T', bpm: 100,
    globalKey: 'C', keyMode: 'manual', globalTimeSig: '4/4', notes: '',
    sections: [
      { id: 1, type: 'Verse', customName: null, key: null, shift: null, timeSig: null, bpm: null, repeat: 1, strumPattern: null,
        squares: [{ id: 2, repeat: 1, customBeats: null, strumPattern: null, events: [
          { chord: 'Am', span: 2, timeSig: null, strumPattern: null },
          { chord: 'F',  span: 2, timeSig: null, strumPattern: null },
          { chord: 'Am', span: 2, timeSig: null, strumPattern: null },
        ]}]},
    ],
    nextId: 10, userFingerings: [], preferredFingerings: [], date: '',
  };
  w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
  w.loadSong(0);

  const resolveAm = (ei) => w.eval(`resolveFingeringShape('Am','C', buildFingeringPositionKey('Am','C',1,2,${ei}), sections[0].squares[0].events[${ei}]).join(',')`);
  const amBefore = [resolveAm(0), resolveAm(2)];
  console.log('Am до правки:', amBefore.join(' | '));

  // --- Сценарий 1: сохраняем свою форму для Am[0] (эмуляция save-хэндлера: pin -> push -> clear -> setPreferred)
  // Формы берём из нот Am (A C E) — закреплённые выборы проходят
  // композиторскую валидацию, иначе тест измерял бы не то.
  w.eval(`(function(){
    const custom = [5,7,7,5,5,5];
    const posKey = buildFingeringPositionKey('Am','C',1,2,0);
    pinCurrentFingeringsForChord('Am','C',posKey);
    const list = userFingerings.get('Am|C') || [];
    list.push(custom);
    userFingerings.set('Am|C', list);
    fingeringCache.clear();
    setPreferredFingering(posKey, custom.join(','));
  })()`);
  check('1a. отредактированная ячейка показывает свою форму', resolveAm(0) === '5,7,7,5,5,5', resolveAm(0));
  check('1b. стоялая ячейка прибита к прежней форме', resolveAm(2) === amBefore[1], resolveAm(2));

  // --- Новая ячейка Am ПОСЛЕ сохранения — умолчание = своя форма
  w.eval(`(function(){
    sections[0].squares[0].events.push({ chord: 'Am', span: 2, timeSig: null, strumPattern: null });
  })()`);
  const amNew = resolveAm(3);
  check('1c. новое вхождение получает свою форму по умолчанию', amNew === '5,7,7,5,5,5', amNew);

  // --- Сценарий 2: перезапись своей формы -> она свежая -> новые ячейки берут её; прежние не прыгают
  w.eval(`(function(){
    const custom2 = ['x',12,14,14,13,12];
    const posKey = buildFingeringPositionKey('Am','C',1,2,0);
    pinCurrentFingeringsForChord('Am','C',posKey);
    const list = userFingerings.get('Am|C') || [];
    // перезапись единственной формы — по новой логике splice+push (в конец)
    list.splice(0, 1); list.push(custom2);
    userFingerings.set('Am|C', list);
    fingeringCache.clear();
    setPreferredFingering(posKey, custom2.join(','));
  })()`);
  check('2a. прибитая ранее свежая ячейка (ei=3) осталась на старой форме', resolveAm(3) === '5,7,7,5,5,5', resolveAm(3));
  w.eval(`sections[0].squares[0].events.push({ chord: 'Am', span: 2, timeSig: null, strumPattern: null })`);
  check('2b. вхождение после перезаписи берёт свежую форму', resolveAm(4) === 'x,12,14,14,13,12', resolveAm(4));

  // --- Сценарий 3: семейный перенос Aadd9 -> Badd9
  w.eval(`(function(){
    userFingerings.clear(); preferredFingeringByChord.clear(); fingeringCache.clear();
    sections.length = 0; sections.push({ id: 9, type: 'V', customName: null, key: null, shift: null, timeSig: null, bpm: null, repeat: 1, strumPattern: null,
      squares: [{ id: 10, repeat: 1, customBeats: null, strumPattern: null, events: [
        { chord: 'Aadd9', span: 2, timeSig: null, strumPattern: null },
        { chord: 'Badd9', span: 2, timeSig: null, strumPattern: null },
        { chord: 'Bmadd9', span: 2, timeSig: null, strumPattern: null },
      ]}]});
    userFingerings.set(buildFingeringChordKey('Aadd9','C'), [[5,7,9,6,'x','x']]);
    fingeringCache.clear();
    setPreferredFingering(buildFingeringPositionKey('Aadd9','C',9,10,0), '5,7,9,6,x,x');
  })()`);
  const bAdd9 = w.eval(`resolveFingeringShape('Badd9','C', buildFingeringPositionKey('Badd9','C',9,10,1), sections[0].squares[0].events[1]).join(',')`);
  check('3a. Badd9 умолчание = 7,9,11,8,x,x (перенос +2)', bAdd9 === '7,9,11,8,x,x', bAdd9);
  const inList = w.eval(`(function(){
    const r = window.getFingeringVariants('Badd9','C');
    const i = r.shapes.findIndex(v => v.join(',') === '7,9,11,8,x,x');
    return i >= 0 ? r.methods[i] : 'НЕТ В СПИСКЕ';
  })()`);
  check('3b. перенесённая форма есть в списке вариантов с методом derived', inList === 'derived', inList);

  const bmAdd9 = w.eval(`resolveFingeringShape('Bmadd9','C', buildFingeringPositionKey('Bmadd9','C',9,10,2), sections[0].squares[0].events[2]).join(',')`);
  check('3c. Bmadd9 — другая семья (madd9 != add9), переноса нет', bmAdd9 !== '7,9,11,8,x,x', bmAdd9);

  // --- Сценарий 4: донор с открытыми струнами не переносится
  w.eval(`(function(){
    userFingerings.clear(); fingeringCache.clear();
    userFingerings.set(buildFingeringChordKey('C7','C'), [['x',0,2,3,1,0]]); // открытые есть
    fingeringCache.clear();
  })()`);
  const beforeNo = w.eval(`(function(){ userFingerings.delete(buildFingeringChordKey('C7','C')); fingeringCache.clear(); return resolveFingeringShape('E7','C', null, null).join(','); })()`);
  w.eval(`(function(){ userFingerings.set(buildFingeringChordKey('C7','C'), [['x',0,2,3,1,0]]); fingeringCache.clear(); })()`);
  const afterWith = w.eval(`resolveFingeringShape('E7','C', null, null).join(',')`);
  check('4. донор с открытыми струнами НЕ меняет умолчание E7', beforeNo === afterWith, beforeNo + ' / ' + afterWith);

  // --- Сценарий 5: голое трезвучие — не семья
  w.eval(`(function(){
    userFingerings.clear(); fingeringCache.clear();
  })()`);
  const gBefore = w.eval(`resolveFingeringShape('G','C', null, null).join(',')`);
  w.eval(`(function(){ userFingerings.set(buildFingeringChordKey('D','C'), [[10,11,12,11,'x','x']]); fingeringCache.clear(); })()`);
  const gAfter = w.eval(`resolveFingeringShape('G','C', null, null).join(',')`);
  check('5. своя форма D не переносится на G (трезвучия вне семей)', gBefore === gAfter, gBefore + ' / ' + gAfter);

  // --- Сценарий 6: тот же аккорд под другой тональностью — перенос со сдвигом 0
  w.eval(`(function(){
    userFingerings.clear(); fingeringCache.clear();
    userFingerings.set(buildFingeringChordKey('Aadd9','C'), [[5,7,9,6,'x','x']]);
    fingeringCache.clear();
  })()`);
  const aAdd9G = w.eval(`resolveFingeringShape('Aadd9','G', null, null).join(',')`);
  check('6. своя форма Aadd9 из тональности C подтягивается в тональность G', aAdd9G === '5,7,9,6,x,x', aAdd9G);

  // --- Сценарий 7: setEventChord учит кнопки
  w.eval(`(function(){
    wheelExtModes.length = 0; wheelExtModes.push(...WHEEL_EXT_DEFAULTS); renderWheelModeTabs();
    sections.length = 0; sections.push({ id: 20, type: 'V', customName: null, key: null, shift: null, timeSig: null, bpm: null, repeat: 1, strumPattern: null,
      squares: [{ id: 21, repeat: 1, customBeats: null, strumPattern: null, events: [
        { chord: 'C', span: 2, timeSig: null, strumPattern: null },
      ]}]});
    setEventChord(sections[0].squares[0].events[0], 'F#m9', { secId: 20, sqId: 21, ei: 0 });
  })()`);
  const learned = w.eval(`wheelExtModes.slice()`);
  check('7. setEventChord -> кнопка «9» появилась (склейка m9 -> 9)', learned.includes('9'), JSON.stringify(learned));

  // --- Сценарий 8: подписи счётчика вариантов и порядок очереди ---
  w.eval(`(function(){
    userFingerings.clear(); preferredFingeringByChord.clear(); fingeringCache.clear();
    userFingerings.set(buildFingeringChordKey('C','C'), [[3,5,5,4,3,3]]);
    fingeringCache.clear();
  })()`);
  const ctr = w.eval(`(function(){
    const r = window.getFingeringVariants('C','C');
    const at = (m) => { const i = r.methods.indexOf(m); return i === -1 ? null : fingeringCounterText(r.shapes, r.methods, r.shapes[i]); };
    const firstAuto = r.methods.findIndex((m) => m === 'fallback' || m === 'modified');
    const autoTxt = fingeringCounterText(r.shapes, r.methods, r.shapes[firstAuto]);
    // С 2026-08-14 (волна-6) ступени проверяем по ключу просадки из
    // приложения. Модель: стандарт — «свои < якоря < open < CAGED <
    // всё остальное» (дословно: «Всё-таки нужен порядок OPEN - CAGED -
    // Всё остальное»; внутри блока — чистая оценка); в остальных
    // строях ярус заготовок open+caged вместе перед авто.
    // Неполные и неиграбельные живут на дне независимо от
    // происхождения (иначе счётчик «2/5» всплывал бы у формы-банки
    // на −9999).
    const notes = getChordNotes('C', getKeyStyle('C'));
    const siftKey = (i) => {
      const m = r.methods[i];
      if (m === 'user' || m === 'derived') return 0;
      const cls = analyzeShapeGrip(r.shapes[i]).ban ? 2
        : (shapeMissingDefiningTones(r.shapes[i], notes, 'C') ? 1 : 0);
      const tier = m === 'open' ? 1 : m === 'caged' ? 2 : 3;
      return cls === 0 ? tier : (cls === 1 ? tier + 3 : 7);
    };
    const seq = r.methods.map((_, i) => siftKey(i));
    const orderStd = seq.every((v, i) => i === 0 || seq[i-1] <= v);
    const kind = (m) => (m === 'user' || m === 'derived') ? 0 : (m === 'open' || m === 'caged') ? 1 : 2;
    const autoN = r.methods.filter((m) => kind(m) === 2).length;
    return { user: at('user'), open: at('open'), caged: at('caged'), autoTxt, orderStd, autoN };
  })()`);
  check('8a. своя форма — «1/1(польз.)»', ctr.user === '1/1(польз.)', ctr.user);
  check('8b. открытая — просто число, без подписи', /^\d+\/\d+$/.test(ctr.open || ''), ctr.open);
  check('8c. caged — просто число, без подписи', /^\d+\/\d+$/.test(ctr.caged || ''), ctr.caged);
  check('8d. первая авто — «1/N(авто)» с N = числу авто-подстановок',
    ctr.autoTxt === '1/' + ctr.autoN + '(авто)', ctr.autoTxt);
  check('8e. очередь ступенями: user/derived < open < CAGED < всё остальное (стандарт, волна-6)', ctr.orderStd);

  const drop = w.eval(`(function(){
    tunerTuningId = 'drop-d'; tunerCustomNotes = null; fingeringCache.clear();
    const r = window.getFingeringVariants('C','C');
    const notes = getChordNotes('C', getKeyStyle('C'));
    const siftKey = (i) => {
      const m = r.methods[i];
      if (m === 'user' || m === 'derived') return 0;
      const cls = analyzeShapeGrip(r.shapes[i]).ban ? 2
        : (shapeMissingDefiningTones(r.shapes[i], notes, 'C') ? 1 : 0);
      const tier = (m === 'open' || m === 'caged') ? 1 : 2;
      return cls === 0 ? tier : (cls === 1 ? tier + 3 : 7);
    };
    const seq = r.methods.map((_, i) => siftKey(i));
    const order = seq.every((v, i) => i === 0 || seq[i-1] <= v);
    tunerTuningId = 'e-std'; fingeringCache.clear();
    return order;
  })()`);
  check('8f. тот же порядок ступеней в Drop D', drop);

  const drv = w.eval(`(function(){
    userFingerings.clear(); preferredFingeringByChord.clear();
    userFingerings.set(buildFingeringChordKey('Aadd9','C'), [[5,7,9,6,'x','x']]);
    fingeringCache.clear();
    const r = window.getFingeringVariants('Badd9','C');
    const i = r.methods.indexOf('derived');
    const t = i === -1 ? null : fingeringCounterText(r.shapes, r.methods, r.shapes[i]);
    userFingerings.clear(); fingeringCache.clear();
    return t;
  })()`);
  check('8g. перенесённая форма подписана как пользовательская', drv === '1/1(польз.)', drv);

  console.log(failed ? `\nИТОГ: ${failed} FAIL` : '\nИТОГ: всё ок');
  if (failed) process.exitCode = 1;
}

w.addEventListener('load', () => {
  try { run(); } catch (e) { console.error('ОШИБКА:', e.message, e.stack); process.exitCode = 1; }
});
