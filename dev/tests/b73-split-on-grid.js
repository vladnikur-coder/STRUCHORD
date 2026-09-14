// B-73: «+» делит ячейку по ближайшему к середине узлу абсолютной сетки
// текущего зума; узла внутри нет — пополам, как раньше.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8');
let bad = 0;
const ok = (n, c, x) => { console.log(`   ${c ? 'ok  ' : 'FAIL'} ${n}${!c && x ? ' — ' + x : ''}`); if (!c) bad++; };
function boot() {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/',
    beforeParse(w) { w.HTMLCanvasElement.prototype.getContext = () => ({ font: '', measureText: () => ({ width: 10 }),
      clearRect(){},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},closePath(){},save(){},restore(){},
      translate(){},rotate(){},fillText(){},strokeText(){},setTransform(){},scale(){},setLineDash(){},
      createLinearGradient:()=>({addColorStop(){}}) }); } });
  const w = dom.window;
  w.AudioContext = w.webkitAudioContext = function () { return { currentTime: 0, state: 'running', resume() {} }; };
  return w;
}
function split(spans, zoom, ei, pattern) {
  const w = boot();
  return w.eval(`(function(){
    sections = [{ id: 1, type: 'Verse', customName: null, key: 'C', timeSig: null, bpm: 0, repeat: 1,
      strumPattern: ${JSON.stringify(pattern || null)},
      squares: [{ id: 11, repeat: 1, customBeats: null, strumPattern: null,
        events: ${JSON.stringify(spans)}.map((sp, i) => ({ chord: 'C', span: sp, timeSig: null, strumPattern: null })) }] }];
    squareZoom = ${zoom}; render();
    addChordAfter(1, 11, ${ei});
    return JSON.stringify(sections[0].squares[0].events.map(e => e.span));
  })()`);
}
console.log('=== пример пользователя: 1.25 ===');
ok('100%: 1.25 → 1 + 0.25', split([1.25, 2.75, 4, 4, 4], 1, 0) === '[1,0.25,2.75,4,4,4]', split([1.25, 2.75, 4, 4, 4], 1, 0));
ok('150%: 1.25 → 0.5 + 0.75', split([1.25, 2.75, 4, 4, 4], 1.5, 0) === '[0.5,0.75,2.75,4,4,4]', split([1.25, 2.75, 4, 4, 4], 1.5, 0));
ok('250%: 1.25 → 0.5 + 0.75 (равноудалены — левый)', split([1.25, 2.75, 4, 4, 4], 2.5, 0) === '[0.5,0.75,2.75,4,4,4]', split([1.25, 2.75, 4, 4, 4], 2.5, 0));
console.log('=== абсолютная сетка: ячейка 0.5..2 (длина 1.5) ===');
ok('100%: узел 1 → 0.5 + 1', split([0.5, 1.5, 2, 4, 4, 4], 1, 1) === '[0.5,0.5,1,2,4,4,4]', split([0.5, 1.5, 2, 4, 4, 4], 1, 1));
console.log('=== узла внутри нет — пополам, как раньше ===');
ok('100%: 1 → 0.5 + 0.5', split([1, 3, 4, 4, 4], 1, 0) === '[0.5,0.5,3,4,4,4]', split([1, 3, 4, 4, 4], 1, 0));
ok('100%: 0.75 → 0.375 + 0.375', split([0.75, 3.25, 4, 4, 4], 1, 0) === '[0.375,0.375,3.25,4,4,4]', split([0.75, 3.25, 4, 4, 4], 1, 0));
console.log('=== целые как раньше ===');
ok('100%: 4 → 2 + 2', split([4, 4, 4, 4], 1, 0) === '[2,2,4,4,4]', split([4, 4, 4, 4], 1, 0));
ok('100%: 3 → 1 + 2 (ближайшие к 1.5 равноудалены — левый)', split([3, 1, 4, 4, 4], 1, 0) === '[1,2,1,4,4,4]', split([3, 1, 4, 4, 4], 1, 0));
console.log('=== сумма квадрата ===');
{
  const r = JSON.parse(split([1.25, 2.75, 4, 4, 4], 1, 0));
  ok('сумма 16', Math.abs(r.reduce((a, b) => a + b, 0) - 16) < 1e-9, r.join('+'));
}
console.log(bad ? `\nFAIL: ${bad}` : '\nALL OK');
process.exit(bad ? 1 : 0);
