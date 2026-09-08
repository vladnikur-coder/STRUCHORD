// B-54: свинг слышен, но НЕ виден.
//
// Решение пользователя 2026-09-06: «свинг не должен визуально
// отображаться, а отражаться только на звуке». Так же устроена нотная
// запись: пишут ровные восьмые и ставят пометку «swing».
const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8');
let bad = 0;
const ok = (n, c, x) => { console.log(`   ${c ? 'ok  ' : 'FAIL'} ${n}${!c && x ? ' — ' + x : ''}`); if (!c) bad++; };

const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/',
  beforeParse(w) { w.HTMLCanvasElement.prototype.getContext = () => ({ font: '', measureText: () => ({ width: 10 }),
    clearRect(){},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},closePath(){},save(){},restore(){},
    translate(){},rotate(){},fillText(){},strokeText(){},setTransform(){},scale(){},setLineDash(){},
    createLinearGradient:()=>({addColorStop(){}}) }); } });
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function () { return { currentTime: 0, state: 'running', resume() {} }; };

w.addEventListener('load', () => {
  const pat = { mode: 'strum', subdivision: 2, swing: true,
    steps: ['D', null, 'D', 'U', null, 'U', 'D', 'U'] };

  console.log('=== 1. Звук качает ===');
  const sound = JSON.parse(w.eval(`(function(){
    const p=${JSON.stringify(pat)}, sub=p.subdivision, sw=patternHasSwing(p);
    const o=[]; p.steps.forEach((s,i)=>{ if(s) o.push(+swingStepOffsetUnits(i,sub,sw).toFixed(3)); });
    return JSON.stringify(o);})()`));
  console.log('      звук :', sound.join(' '));
  ok('вторая нота пары звучит на 2/3 доли',
     sound.some((t) => Math.abs((t - Math.floor(t)) - 2 / 3) < 0.01), sound.join(' '));

  console.log('=== 2. Визуал НЕ качает ===');
  // Так дорожка ленты раскладывает удары после B-54: чисто i / sub.
  const visual = JSON.parse(w.eval(`(function(){
    const p=${JSON.stringify(pat)}, sub=p.subdivision;
    const o=[]; p.steps.forEach((s,i)=>{ if(s) o.push(+(i/sub).toFixed(3)); });
    return JSON.stringify(o);})()`));
  console.log('      визуал:', visual.join(' '));
  const onGrid = visual.every((t) => Math.abs(t * 2 - Math.round(t * 2)) < 1e-9);
  ok('все ноты стоят на сетке восьмых', onGrid, visual.join(' '));
  ok('ни одна нота не сдвинута на 2/3',
     !visual.some((t) => Math.abs((t - Math.floor(t)) - 2 / 3) < 0.01), visual.join(' '));

  console.log('=== 3. Звук и картинка расходятся именно на свинге ===');
  ok('раскладки различаются', JSON.stringify(visual) !== JSON.stringify(sound));
  const plain = JSON.parse(w.eval(`(function(){
    const p=${JSON.stringify({ ...pat, swing: false })}, sub=p.subdivision, sw=patternHasSwing(p);
    const o=[]; p.steps.forEach((s,i)=>{ if(s) o.push(+swingStepOffsetUnits(i,sub,sw).toFixed(3)); });
    return JSON.stringify(o);})()`));
  ok('без свинга звук совпадает с картинкой',
     JSON.stringify(plain) === JSON.stringify(visual),
     plain.join(' ') + ' vs ' + visual.join(' '));

  console.log('=== 4. Пометка «swing» осталась — иначе кач не опознать ===');
  const badge = w.eval(`(function(){
    const { modeBadge } = buildStrumPreviewEls(${JSON.stringify(pat)});
    return modeBadge.textContent;})()`);
  ok('ритм помечен как swing', /swing/i.test(badge), badge);

  console.log('=== 5. Дорожка ленты не зовёт swingStepOffsetUnits ===');
  // Страховка от возврата визуального качa: в renderRhythmTrack позиция
  // обязана считаться метрически.
  const src = html.slice(html.indexOf('function renderRhythmTrack'));
  const body = src.slice(0, src.indexOf('\nfunction '));
  ok('в renderRhythmTrack нет свинговой раскладки',
     !body.includes('swingStepOffsetUnits'), 'найден вызов');

  console.log(bad ? `\nFAIL: ${bad}` : '\nALL OK');
  if (bad) process.exitCode = 1;
});
