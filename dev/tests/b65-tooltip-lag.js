// B-65: тултип аппликатуры ДОГОНЯЕТ курсор при перетаскивании.
//
// Просьба пользователя (2026-09-06): понравилось, как ведёт себя
// нативный снимок браузера при перетаскивании секций в панели структуры
// — на резком движении он отстаёт и мягко подтягивается. Тултип же
// таскается вручную и раньше прилипал к курсору намертво.
//
// Уточнено: только запаздывание, без наклона; эффект заметный; только
// тултип аппликатуры (закреплённый гриф остаётся жёстким).
const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8');
const song = JSON.parse(fs.readFileSync(__dirname + '/../../uploads/Дешевые Драмы.struchord-3.json', 'utf8'));
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

// Захватываем тултип и резко уводим курсор далеко.
async function dragFar(w) {
  const tip = w.document.getElementById('fingering-tooltip');
  tip.style.display = 'block';
  tip.style.left = '100px';
  tip.style.top = '100px';
  tip.getBoundingClientRect = () => ({ left: 100, top: 100, width: 200, height: 150, right: 300, bottom: 250 });
  tip.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, clientX: 150, clientY: 150, pointerId: 1 }));
  for (let i = 0; i < 4; i++) {
    w.document.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, clientX: 600, clientY: 400, pointerId: 1 }));
  }
  const track = [];
  for (let i = 0; i < 60; i++) {
    track.push(Math.round(parseFloat(tip.style.left) || 0));
    await sleep(16);
  }
  track.push(Math.round(parseFloat(tip.style.left) || 0));
  return { tip, track };
}

(async () => {
  console.log('=== 1. Тултип не прилипает к курсору ===');
  {
    const w = boot();
    await sleep(300);
    const { track } = await dragFar(w);
    // Цель по X: курсор 600 минус захват 50 = 550.
    console.log('      первые кадры:', track.slice(0, 8).join(' -> '));
    ok('в первом кадре ещё далеко от цели', track[0] < 500, String(track[0]));
    ok('движется постепенно, а не прыжком',
       track[1] > track[0] && track[1] < 550, `${track[0]} -> ${track[1]}`);
    ok('каждый кадр приближает к цели',
       track[3] > track[1] && track[5] > track[3], track.slice(0, 6).join(','));
  }

  console.log('=== 2. Замедляется у цели (экспоненциальное сглаживание) ===');
  {
    const w = boot();
    await sleep(300);
    const { track } = await dragFar(w);
    const step1 = track[1] - track[0];
    const step5 = track[5] - track[4];
    ok('первый шаг крупнее позднего', step1 > step5, `${step1} против ${step5}`);
    ok('в итоге доходит РОВНО до цели',
       track[track.length - 1] === 550, String(track[track.length - 1]));
  }

  console.log('=== 3. Отпускание не оставляет тултип в пути ===');
  {
    const w = boot();
    await sleep(300);
    const { tip } = await dragFar(w);
    // Отпускаем на полпути: позиция обязана догнаться до цели сразу,
    // иначе решение «попал в док или нет» разойдётся с картинкой.
    tip.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, clientX: 150, clientY: 150, pointerId: 2 }));
    w.document.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, clientX: 900, clientY: 700, pointerId: 2 }));
    await sleep(20);
    w.document.dispatchEvent(new w.MouseEvent('pointerup', { bubbles: true, clientX: 900, clientY: 700, pointerId: 2 }));
    await sleep(60);
    ok('жест завершён', w.eval('pinDragState') === null);
    ok('петля кадров остановлена', w.eval('pinFollowRaf') === null);
  }

  console.log('=== 4. Наклона нет (решение пользователя) ===');
  {
    ok('в петле нет rotate', !/follow[\s\S]{0,900}rotate\(/.test(html));
    // B-67 (0.199): решение «гриф жёсткий» отменено пользователем —
    // закреплённый гриф догоняет так же, как тултип.
    ok('закреплённый гриф догоняет вместе с тултипом (0.199)',
       !/source === 'tooltip'[\s\S]{0,200}requestAnimationFrame\(follow\)/.test(html) &&
       /if \(!pinFollowRaf\) pinFollowRaf = requestAnimationFrame\(follow\);/.test(html));
  }

  console.log(bad ? `\nFAIL: ${bad}` : '\nALL OK');
  if (bad) process.exitCode = 1;
})();
