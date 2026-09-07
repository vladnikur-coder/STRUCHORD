// B-52: лента ритма неподвижна при ресайзе.
//
// Спека пользователя 2026-09-06: «в режиме ленты ритм распределяется
// правильно, я хочу чтобы так же было при ресайзе в редакторе».
// Уточнено ask_user: якорь — КВАДРАТ (удары не двигаются никогда,
// граница аккорда скользит поверх), край — keep_all.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8');
const song = JSON.parse(fs.readFileSync(__dirname + '/../../uploads/Дешевые Драмы.struchord.json', 'utf8'));
let bad = 0;
const ok = (n, c, x) => { console.log(`   ${c ? 'ok  ' : 'FAIL'} ${n}${!c && x ? ' — ' + x : ''}`); if (!c) bad++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function boot() {
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/',
    beforeParse(w) { w.HTMLCanvasElement.prototype.getContext = () => ({ font: '', measureText: () => ({ width: 10 }),
      clearRect(){},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},closePath(){},save(){},restore(){},
      translate(){},rotate(){},fillText(){},strokeText(){},setTransform(){},scale(){},setLineDash(){},
      createLinearGradient:()=>({addColorStop(){}}) }); } });
  const w = dom.window;
  w.AudioContext = w.webkitAudioContext = function () { return { currentTime: 0, state: 'running', resume() {} }; };
  w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
  w.loadSong(0);
  try { w.render(); } catch (e) {}
  return w;
}

// Абсолютные моменты ударов по всему квадрату, в долях от его начала.
// gridPhase — сдвиг ячейки, начавшейся не на узле сетки.
const hits = (w, qi) => w.eval(`(function(){
  const sec=sections[0], sq=sec.squares[${qi}];
  let off=0; const out=[];
  sq.events.forEach((e,i)=>{
    const p=rhythmSoundingForEvent(sec,sq,e,i);
    if(p&&p.steps){const sub=Math.max(1,p.subdivision||1), ph=p.gridPhase||0;
      p.steps.forEach((s,k)=>{ if(s&&s!=='_') out.push(
        (+(off+ph+swingStepOffsetUnits(k,sub,patternHasSwing(p))).toFixed(3))+s);});}
    off+=e.span;
  });
  return out.join(' ');})()`);

(async () => {
  console.log('=== Лента неподвижна на ЛЮБОЙ границе (Дешевые Драмы) ===');
  const w0 = boot();
  const nq = JSON.parse(w0.eval('JSON.stringify(sections[0].squares.map(q=>q.events.length))'));
  let moved = 0, total = 0;
  const failures = [];

  for (let qi = 0; qi < nq.length; qi++) {
    for (let hi = 0; hi < nq[qi] - 1; hi++) {
      for (const dir of [1, -1]) {
        const w = boot();
        await sleep(250);
        const before = hits(w, qi);
        const sqEl = w.document.querySelectorAll('.square-inner')[qi];
        if (!sqEl) continue;
        const spans = JSON.parse(w.eval(`JSON.stringify(sections[0].squares[${qi}].events.map(e=>e.span))`));
        const cap = spans.reduce((a, b) => a + b, 0);
        const W = 800, gs = W / cap;
        sqEl.getBoundingClientRect = () => ({ left: 0, right: W, width: W, top: 0, bottom: 60, height: 60 });
        sqEl.querySelectorAll('.chord-wrapper').forEach((cw) => {
          cw.getBoundingClientRect = () => ({ left: 0, right: 100, width: 100, top: 0, bottom: 60, height: 60 });
        });
        const h = sqEl.querySelectorAll('.resize-handle')[hi];
        if (!h) continue;
        const down = new w.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 0 });
        if (typeof h.onpointerdown === 'function') h.onpointerdown(down); else h.dispatchEvent(down);
        for (let k = 1; k <= 8; k++) {
          w.document.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, cancelable: true, clientX: dir * gs * k / 8 }));
        }
        w.document.dispatchEvent(new w.MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: dir * gs }));
        await sleep(300);
        const after = hits(w, qi);
        total++;
        if (before !== after) {
          moved++;
          if (failures.length < 2) failures.push(`sq${qi} ручка${hi} ${dir > 0 ? 'вправо' : 'влево'}:\n        до   : ${before}\n        после: ${after}`);
        }
      }
    }
  }
  console.log(`      проверено жестов: ${total}`);
  ok('ни один жест не сдвинул ленту ритма', moved === 0,
     moved + ' из ' + total + '\n      ' + failures.join('\n      '));

  // Граница аккорда при этом ОБЯЗАНА двигаться — иначе ресайз не работает.
  {
    const w = boot();
    await sleep(250);
    const chords = () => JSON.parse(w.eval(`JSON.stringify(sections[0].squares[1].events.map(e=>e.span))`));
    const before = chords();
    const sqEl = w.document.querySelectorAll('.square-inner')[1];
    const W = 800, gs = W / 16;
    sqEl.getBoundingClientRect = () => ({ left: 0, right: W, width: W, top: 0, bottom: 60, height: 60 });
    sqEl.querySelectorAll('.chord-wrapper').forEach((cw) => {
      cw.getBoundingClientRect = () => ({ left: 0, right: 100, width: 100, top: 0, bottom: 60, height: 60 });
    });
    const h = sqEl.querySelectorAll('.resize-handle')[1];
    const down = new w.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 0 });
    if (typeof h.onpointerdown === 'function') h.onpointerdown(down); else h.dispatchEvent(down);
    for (let k = 1; k <= 8; k++) {
      w.document.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, cancelable: true, clientX: gs * k / 8 }));
    }
    w.document.dispatchEvent(new w.MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: gs }));
    await sleep(300);
    const after = chords();
    ok('граница аккорда при этом сдвинулась', JSON.stringify(before) !== JSON.stringify(after),
       JSON.stringify(after));
    ok('длина квадрата не изменилась',
       Math.abs(after.reduce((a, b) => a + b, 0) - 16) < 1e-9, String(after.reduce((a, b) => a + b, 0)));
  }

  console.log(bad ? `\nFAIL: ${bad}` : '\nALL OK');
  if (bad) process.exitCode = 1;
})();
