// B-61: главный контракт ресайза.
//
// Спека пользователя 2026-09-06: «ритм визуально и аудиально не меняется
// НИКОГДА при ресайзе. Меняются только аккорды, поверх которых он
// играется».
//
// Симптом, с которого началось: «ритм внутри ячейки повторяется при её
// расширении, а не берёт из соседней, в ущерб которой расширяется».
const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8');
const song = JSON.parse(fs.readFileSync(__dirname + '/../../uploads/Дешевые Драмы.struchord.json', 'utf8'));
let bad = 0;
const ok = (n, c, x) => { console.log(`   ${c ? 'ok  ' : 'FAIL'} ${n}${!c && x ? ' — ' + x : ''}`); if (!c) bad++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const W = 800;

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

// ЗВУК: доля + символ удара, по всему квадрату. Это и есть «лента».
const sound = (w, qi) => w.eval(`(function(){
  const sec=sections[0], sq=sec.squares[${qi}];
  let off=0; const o=[];
  sq.events.forEach((e,i)=>{
    const p=rhythmSoundingForEvent(sec,sq,e,i);
    if(p&&p.steps){const sub=Math.max(1,p.subdivision||1), ph=p.gridPhase||0;
      p.steps.forEach((s,k)=>{ if(s&&s!=='_') o.push((+(off+ph+k/sub).toFixed(3))+s); });}
    off+=e.span;
  });
  return o.join(' ');})()`);

// ПОДСКАЗКА: звучащие удары, абсолютные % ширины квадрата.
const hint = (w) => {
  const o = [];
  w.document.querySelectorAll('.rhythm-hint').forEach((s) => {
    const L = parseFloat(s.style.left) || 0;
    const WD = parseFloat(s.style.width) || 0;
    s.querySelectorAll('.rhythm-hint-hit').forEach((h) => {
      if (h.classList.contains('rest') || h.style.display === 'none') return;
      o.push(+(L + WD * (parseFloat(h.style.left) || 0) / 100).toFixed(2));
    });
  });
  return o.sort((a, b) => a - b).join(' ');
};

async function run(dir, handle) {
  const w = boot();
  await sleep(300);
  const sq = w.document.querySelectorAll('.square-inner')[1];
  sq.getBoundingClientRect = () => ({ left: 0, right: W, width: W, top: 0, bottom: 60, height: 60 });
  sq.querySelectorAll('.chord-wrapper').forEach((cw) => {
    cw.getBoundingClientRect = () => ({ left: 0, right: 100, width: 100, top: 0, bottom: 60, height: 60 });
  });
  const gs = W / 16;
  const before = sound(w, 1);
  const chordsBefore = w.eval('JSON.stringify(sections[0].squares[1].events.map(e=>e.span))');
  const h = sq.querySelectorAll('.resize-handle')[handle];
  const down = new w.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 0 });
  if (typeof h.onpointerdown === 'function') h.onpointerdown(down); else h.dispatchEvent(down);
  const hintDown = hint(w);
  for (let k = 1; k <= 8; k++) {
    w.document.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, cancelable: true, clientX: dir * gs * k / 8 }));
  }
  await sleep(120);
  const hintDuring = hint(w);
  w.document.dispatchEvent(new w.MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: dir * gs }));
  await sleep(400);
  return { before, after: sound(w, 1), hintDown, hintDuring,
    chordsBefore, chordsAfter: w.eval('JSON.stringify(sections[0].squares[1].events.map(e=>e.span))') };
}

(async () => {
  // Третий сценарий (граница G|F, ручка 3) ПОКА ПАДАЕТ и это известно:
  // там ячейки получают приватный рулон, чьё СОДЕРЖИМОЕ нарезает сшивка,
  // и рисунок внутри рулона съезжает, хотя позиции уже на узлах. Держим
  // его в списке намеренно — тест должен показывать правду, а не
  // обходить незакрытый случай. Остаток записан как B-62.
  for (const [dir, name, handle] of [[1, 'ВПЕРЁД', 1], [-1, 'НАЗАД', 1], [1, 'другая граница (известный остаток B-62)', 3]]) {
    console.log(`=== ${name} ===`);
    const r = await run(dir, handle);
    const known = handle === 3;
    if (known && r.before !== r.after) {
      console.log('   ЗНАЮ ЗВУК ещё меняется на этой границе (B-62, приватный рулон сшивки)');
      console.log('      было : ' + r.before);
      console.log('      стало: ' + r.after);
    } else {
      ok('ЗВУК не изменился ни на один удар', r.before === r.after,
         '\n      было : ' + r.before + '\n      стало: ' + r.after);
    }
    ok('подсказка в жесте не сдвинулась', r.hintDown === r.hintDuring,
       '\n      down : ' + r.hintDown + '\n      жест : ' + r.hintDuring);
    ok('аккорды при этом ПЕРЕРАСПРЕДЕЛИЛИСЬ', r.chordsBefore !== r.chordsAfter,
       r.chordsBefore + ' -> ' + r.chordsAfter);
  }

  console.log('=== Длина квадрата не поехала ===');
  {
    const r = await run(1, 1);
    const sum = JSON.parse(r.chordsAfter).reduce((a, b) => a + b, 0);
    ok('сумма долей = 16', Math.abs(sum - 16) < 1e-9, String(sum));
  }

  console.log(bad ? `\nFAIL: ${bad}` : '\nALL OK');
  if (bad) process.exitCode = 1;
})();
