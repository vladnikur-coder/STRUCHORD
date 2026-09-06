// B-51: свинг — свойство ритма (pattern.swing). Главный контракт:
// «6-ка Шаффл», переведённая с триолей (sub3) на восьмые со свингом
// (sub2 + swing), должна звучать НЕОТЛИЧИМО — те же удары в те же
// моменты времени.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const dom = new JSDOM(fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8'), {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/',
  beforeParse(w) {
    w.HTMLCanvasElement.prototype.getContext = () => ({ font: '', measureText: () => ({ width: 10 }),
      clearRect(){},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},closePath(){},
      save(){},restore(){},translate(){},rotate(){},fillText(){},strokeText(){},setTransform(){},
      scale(){},setLineDash(){},createLinearGradient:()=>({addColorStop(){}}) });
  },
});
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function () { return { currentTime: 0, state: 'running', resume() {} }; };
let bad = 0;
const ok = (n, c, x) => { console.log(`   ${c ? 'ok  ' : 'FAIL'} ${n}${!c && x ? ' — ' + x : ''}`); if (!c) bad++; };

w.addEventListener('load', () => {
  // Моменты ударов (в долях) для паттерна: индексы непустых шагов,
  // разложенные по метрике с учётом свинга.
  const hitTimes = (pattern) => w.eval(`(function(){
    const p = ${JSON.stringify(pattern)};
    const sub = p.subdivision;
    const sw = patternHasSwing(p);
    const out = [];
    p.steps.forEach((s, i) => { if (s) out.push(+(swingStepOffsetUnits(i, sub, sw)).toFixed(4)); });
    return JSON.stringify(out);
  })()`);

  console.log('=== 1. Свинг воспроизводит триольный шаффл точка в точку ===');
  const shuffle3 = { mode: 'strum', subdivision: 3,
    steps: ['D', null, null, 'D', null, 'U', null, null, 'U', 'D', null, 'U'] };
  const swing2 = { mode: 'strum', subdivision: 2, swing: true,
    steps: ['D', null, 'D', 'U', null, 'U', 'D', 'U'] };
  const a = JSON.parse(hitTimes(shuffle3));
  const b = JSON.parse(hitTimes(swing2));
  console.log('      триоли:', a.join(' '));
  console.log('      свинг :', b.join(' '));
  ok('удары совпадают по времени', JSON.stringify(a) === JSON.stringify(b), a + ' != ' + b);
  ok('число ударов одинаково', a.length === b.length, a.length + ' vs ' + b.length);

  console.log('=== 2. Без свинга ничего не изменилось ===');
  const plain = { mode: 'strum', subdivision: 2, steps: ['D', null, 'D', 'U', null, 'U', 'D', 'U'] };
  const p = JSON.parse(hitTimes(plain));
  console.log('      ровные:', p.join(' '));
  ok('шаги равномерны', p.every((v, i, arr) => i === 0 || Math.abs((v - arr[i - 1]) % 0.5) < 1e-6), p.join(' '));
  ok('свинг НЕ включён без флага', JSON.stringify(p) !== JSON.stringify(b));

  console.log('=== 3. Флаг осмыслен только при двоичном делении ===');
  ok('sub2 + swing качает', w.eval(`patternHasSwing({subdivision:2,swing:true})`) === true);
  ok('sub4 + swing качает', w.eval(`patternHasSwing({subdivision:4,swing:true})`) === true);
  ok('sub3 + swing НЕ качает (кач уже в тройках)', w.eval(`patternHasSwing({subdivision:3,swing:true})`) === false);
  ok('sub1 + swing НЕ качает (нет второй ноты)', w.eval(`patternHasSwing({subdivision:1,swing:true})`) === false);
  ok('без флага не качает', w.eval(`patternHasSwing({subdivision:2})`) === false);

  console.log('=== 4. Санитайзер импорта (через реальную загрузку песни) ===');
  // cloneSafePattern — приватная функция модуля, снаружи не видна.
  // Проверяем её эффект честно: грузим песню целиком и смотрим, что
  // осело в модели.
  const loadWith = (pattern) => {
    const song = { name: 'swing-test', bpm: 100, globalKey: 'C',
      sections: [{ id: 's1', name: 'A', timeSig: '4/4', strumPattern: pattern,
        squares: [{ id: 'q1', events: [{ chord: 'Am', span: 4 }] }] }] };
    w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
    w.loadSong(0);
    return JSON.parse(w.eval('JSON.stringify(sections[0].strumPattern)'));
  };
  const c1 = loadWith({ mode: 'strum', subdivision: 2, swing: true, steps: ['D', 'U'] });
  ok('swing переживает импорт', c1 && c1.swing === true, JSON.stringify(c1));
  const c2 = loadWith({ mode: 'strum', subdivision: 3, swing: true, steps: ['D', null, 'U'] });
  ok('swing при sub3 отбрасывается', c2 && !c2.swing, JSON.stringify(c2));
  const c3 = loadWith({ mode: 'strum', subdivision: 2, swing: 'да', steps: ['D', 'U'] });
  ok('мусор вместо swing отбрасывается', c3 && !c3.swing, JSON.stringify(c3));
  const c4 = loadWith({ mode: 'strum', subdivision: 2, steps: ['D', 'U'] });
  ok('обычный паттерн без поля swing', c4 && !('swing' in c4), JSON.stringify(c4));

  console.log('=== 5. Свинг не теряется по дороге (модель -> пул -> файл) ===');
  // Свинг обязан пережить сохранение песни: он кладётся в пул ритмов и
  // сериализуется. Раньше serializeRhythmPoolForSave копировал только
  // mode/subdivision/steps — кач терялся при сохранении в файл.
  {
    const song = { name: 'swing-roundtrip', bpm: 100, globalKey: 'C',
      sections: [{ id: 's1', name: 'A', timeSig: '4/4',
        strumPattern: { mode: 'strum', subdivision: 2, swing: true,
          steps: ['D', null, 'D', 'U', null, 'U', 'D', 'U'] },
        squares: [{ id: 'q1', events: [{ chord: 'Am', span: 4 }] }] }] };
    w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
    w.loadSong(0);
    ok('свинг в модели после загрузки',
       w.eval('!!sections[0].strumPattern.swing') === true);
    const pool = JSON.parse(w.eval('JSON.stringify(serializeRhythmPoolForSave())'));
    const rolls = pool ? Object.values(pool.pool) : [];
    ok('свинг попал в сериализованный пул',
       rolls.length > 0 && rolls.some((r) => r.swing === true),
       JSON.stringify(rolls));
  }

  console.log('=== 6. Свинг различает ритмы (подпись и сравнение) ===');
  const A = { mode: 'strum', subdivision: 2, steps: ['D', 'U'] };
  const B = { mode: 'strum', subdivision: 2, swing: true, steps: ['D', 'U'] };
  ok('patternsEqual видит разницу', w.eval(`patternsEqual(${JSON.stringify(A)}, ${JSON.stringify(B)})`) === false);
  ok('rhythmPatternSig различает',
     w.eval(`rhythmPatternSig(${JSON.stringify(A)}) !== rhythmPatternSig(${JSON.stringify(B)})`) === true);
  ok('одинаковые со свингом равны',
     w.eval(`patternsEqual(${JSON.stringify(B)}, ${JSON.stringify(B)})`) === true);

  console.log('=== 7. Кнопка Swing в редакторе ритма ===');
  {
    const song = { name: 'swing-ui', bpm: 100, globalKey: 'C',
      sections: [{ id: 's1', name: 'A', timeSig: '4/4',
        strumPattern: { mode: 'strum', subdivision: 2,
          steps: ['D', null, 'D', 'U', null, 'U', 'D', 'U'] },
        squares: [{ id: 'q1', events: [{ chord: 'Am', span: 4 }] }] }] };
    w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
    w.loadSong(0);
    // ВАЖНО: loadSong переприсваивает секциям СВОИ id (1, 2, ...), а не
    // те, что были в файле. Берём реальный id из модели, иначе
    // openStrumPatternEditor молча выходит по find() === undefined.
    const secId = JSON.parse(w.eval('JSON.stringify(sections[0].id)'));
    w.openStrumPatternEditor('section', secId);
    const btn = w.document.querySelector('#patternSwingBtn');
    ok('кнопка существует', !!btn);
    ok('при sub2 кнопка видна', btn && !btn.hidden);
    ok('изначально выключена', btn && !btn.classList.contains('active'));

    btn.onclick();
    ok('клик включает свинг', btn.classList.contains('active'));

    // Прячется там, где свинг бессмыслен.
    const subBtn = (n) => Array.from(w.document.querySelectorAll('.pattern-sub-btn'))
      .find((b) => b.dataset.sub === String(n));
    subBtn(3).onclick();
    ok('при sub3 кнопка спрятана', w.document.querySelector('#patternSwingBtn').hidden);
    subBtn(1).onclick();
    ok('при sub1 кнопка спрятана', w.document.querySelector('#patternSwingBtn').hidden);
    subBtn(2).onclick();
    const back = w.document.querySelector('#patternSwingBtn');
    ok('при возврате на sub2 кнопка снова видна', !back.hidden);
    ok('свинг не потерялся при прогулке по дробностям', back.classList.contains('active'));

    // Сохранение доносит свинг до модели.
    w.document.querySelector('#save-pattern').onclick();
    ok('после сохранения свинг в модели',
       w.eval('!!sections[0].strumPattern.swing') === true,
       w.eval('JSON.stringify(sections[0].strumPattern)'));
  }

  console.log(bad ? `\nFAIL: ${bad}` : '\nALL OK');
  if (bad) process.exitCode = 1;
});
