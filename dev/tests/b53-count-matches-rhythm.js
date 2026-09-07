// B-53: счёт в редакторе дробится по ИГРАЮЩЕМУ ритму — как в ленте.
//
// Спека пользователя 2026-09-06: «при ресайзе ритм не всегда честно
// располагается над та-и-та, не как в таймлайне».
//
// Дорожка ленты берёт дробление из звучащего паттерна, а редактор брал
// его из ЗУМА: на зуме 1 счёт был «1 2 3 4», и удары на «и» висели над
// пустым местом.
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

// Удары, под которыми НЕТ слога счёта. Узлы счёта считаем ровно так же,
// как buildInnerCounts. Свинговый удар на 2/3 доли принадлежит слогу «и»
// (он и есть качнувшаяся восьмая) — это не сирота.
const orphans = (w, qi) => JSON.parse(w.eval(`(function(){
  const sec=sections[0], sq=sec.squares[${qi}];
  const div=getEditorCountSubdivision(sec,sq);
  const bpb=getGridUnitsPerBar(sec.timeSig||globalTimeSig);
  const cnt=[]; let off=0;
  sq.events.forEach((e)=>{
    const span=e.span, step=1/div;
    const first=Math.ceil((off-1e-6)/step)*step;
    for(let node=first; node<off+span-1e-6; node+=step){
      const sub=Math.round((node-Math.floor(node+1e-6))*div)%div;
      if(countLabelFor(node,sub,div,bpb)) cnt.push(+node.toFixed(3));
    }
    off+=span;
  });
  const hit=[]; off=0;
  sq.events.forEach((e,i)=>{
    const p=rhythmSoundingForEvent(sec,sq,e,i);
    if(p&&p.steps){const sub=Math.max(1,p.subdivision||1), ph=p.gridPhase||0;
      p.steps.forEach((s,k)=>{ if(s&&s!=='_') hit.push(+(off+ph+swingStepOffsetUnits(k,sub,patternHasSwing(p))).toFixed(3));});}
    off+=e.span;
  });
  const bad=hit.filter(t=>{
    if(cnt.some(c=>Math.abs(c-t)<1e-6)) return false;
    const frac=t-Math.floor(t);
    if(Math.abs(frac-2/3)<0.01 && cnt.some(c=>Math.abs(c-(Math.floor(t)+0.5))<1e-6)) return false;
    return true;
  });
  return JSON.stringify({div, cntLen:cnt.length, hitLen:hit.length, bad});
})()`));

(async () => {
  console.log('=== 1. Дробление счёта следует за ритмом, а не за зумом ===');
  {
    const w = boot();
    await sleep(250);
    const div = w.eval('getEditorCountSubdivision(sections[0], sections[0].squares[1])');
    const zoom = w.eval('Math.round(1 / getResizeStep())');
    ok('зум даёт грубую сетку (1)', zoom === 1, String(zoom));
    ok('счёт берёт дробность ритма (2)', div === 2, String(div));
    const txt = JSON.parse(w.eval(`JSON.stringify(Array.from(
      document.querySelectorAll('.square-inner')[1].querySelectorAll('.chord-count')).map(c=>c.textContent.trim()))`));
    ok('в квадрате появились «и»', txt.includes('и'), txt.slice(0, 8).join(' '));
    ok('счёт читается как «1 и 2 и»',
       txt.slice(0, 4).join(' ') === '1 и 2 и', txt.slice(0, 4).join(' '));
  }

  console.log('=== 2. Под каждым ударом есть слог — во всех квадратах ===');
  {
    const w = boot();
    await sleep(250);
    const nq = JSON.parse(w.eval('JSON.stringify(sections[0].squares.map(q=>q.events.length))'));
    let total = 0;
    for (let qi = 0; qi < nq.length; qi++) {
      const r = orphans(w, qi);
      total += r.bad.length;
      if (r.bad.length) console.log(`      sq${qi}: ${r.bad.join(' ')}`);
    }
    ok('ударов без слога нет', total === 0, String(total));
  }

  console.log('=== 3. То же ПОСЛЕ ресайза (дробная граница) ===');
  {
    const w = boot();
    await sleep(300);
    const W = 800, gs = W / 16;
    const sqEl = w.document.querySelectorAll('.square-inner')[1];
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
    await sleep(350);
    const r = orphans(w, 1);
    ok('после жеста ударов без слога нет', r.bad.length === 0, r.bad.join(' '));
    ok('дробность счёта сохранилась', r.div === 2, String(r.div));
  }

  console.log(bad ? `\nFAIL: ${bad}` : '\nALL OK');
  if (bad) process.exitCode = 1;
})();
