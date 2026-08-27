// Сколько виджетов ритма анимируется ОДНОВРЕМЕННО в редакторе при
// включённых аппликатурах. Считаем через MutationObserver: каждое
// появление strum-step-active / is-vibrating относим к его контейнеру.
const puppeteer = require('/home/user/node_modules/puppeteer');
(async () => {
  const br = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'] });
  const p = await br.newPage();
  await p.setViewport({ width: 1500, height: 1000 });
  p.setDefaultTimeout(90000);
  await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await new Promise((r) => setTimeout(r, 1200));
  const fx = require('fs').readFileSync('/home/user/dev/fixtures/wind-of-change.json', 'utf8');
  await p.evaluate((j) => { loadSongFromJSON(JSON.parse(j)); }, fx).catch(async () => {
    await p.evaluate((j) => {
      const d = JSON.parse(j);
      sections = d.sections; globalTimeSig = d.timeSig || globalTimeSig;
      if (d.bpm) bpm = d.bpm;
      nextId = 9999; render();
    }, fx);
  });
  await new Promise((r) => setTimeout(r, 800));
  // Играем с секции, у которой ЕСТЬ свой бой — иначе подсвечивать нечего.
  console.log('секции с боем:', JSON.stringify(await p.evaluate(() =>
    sections.map((s, i) => ({ i, t: s.type, pat: !!s.strumPattern })))));
  await p.evaluate(() => {
    const keep = sections.find((s) => s.strumPattern);
    sections = [keep];
    render();
  });
  await new Promise((r) => setTimeout(r, 700));
  // включаем аппликатуры
  // Аппликатура показывается тултипом при наведении на ячейку.
  const cellPt = await p.evaluate(() => {
    const cw = document.querySelector('.chord-wrapper');
    const r = cw.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });
  await p.mouse.move(cellPt.x, cellPt.y);
  await new Promise((r) => setTimeout(r, 900));
  const tt = await p.evaluate(() => {
    const t = document.getElementById('fingering-tooltip');
    return t ? { disp: t.style.display, vis: t.classList.contains('visible') } : null;
  });
  console.log('тултип аппликатуры:', JSON.stringify(tt));

  await p.evaluate(() => {
    window.__hits = {};
    const label = (el) => {
      if (el.closest('#tooltipLiveStrum') || el.closest('.chord-tooltip')) return 'тултип аппликатуры';
      if (el.closest('.event-strum-preview')) return 'мини-превью в ячейке';
      if (el.closest('#nowPlayingChord')) return 'бейдж «сейчас играет»';
      if (el.closest('.section-header') || el.closest('.section-badges')) return 'бейдж секции';
      if (el.closest('#timelineRhythm')) return 'дорожка ленты';
      if (el.classList.contains('fing-string')) return 'струны на грифе';
      if (el.closest('.pattern-step-btn')) return 'редактор ритма';
      return 'прочее: ' + (el.parentElement && el.parentElement.className || '?');
    };
    new MutationObserver((ms) => {
      ms.forEach((m) => {
        const el = m.target;
        if (!(el instanceof Element)) return;
        const on = el.classList.contains('strum-step-active') ||
          el.classList.contains('is-vibrating') || el.classList.contains('tl-hit-on') ||
          el.classList.contains('is-playing');
        if (!on) return;
        const k = label(el);
        window.__hits[k] = (window.__hits[k] || 0) + 1;
      });
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });

  // Жест мышью, а не вызов из кода: AudioContext иначе не стартует.
  const pb = await p.evaluate(() => {
    const b = document.getElementById('btnPlay');
    const r = b.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });
  await p.mouse.click(pb.x, pb.y);
  await new Promise((r) => setTimeout(r, 400));
  if (!(await p.evaluate(() => playbackState.isPlaying))) {
    // Клик по кнопке уже «разбудил» AudioContext — дальше можно из кода.
    await p.evaluate(() => playAll());
    await new Promise((r) => setTimeout(r, 400));
  }
  console.log('играет:', await p.evaluate(() => playbackState.isPlaying),
    ' ctx:', await p.evaluate(() => { const c = getAudioContext(); return c && c.state; }));
  // Курсор возвращаем на ячейку — тултип должен остаться.
  await p.mouse.move(cellPt.x, cellPt.y);
  for (let k = 0; k < 12; k++) {
    await new Promise((r) => setTimeout(r, 500));
    const d = await p.evaluate(() => ({
      t: +playbackState.isPlaying,
      act: document.querySelectorAll('.strum-step-active').length,
      vib: document.querySelectorAll('.fing-string.is-vibrating').length,
      tim: (playbackState.strumHighlightTimers || []).length,
      tip: !!document.querySelector('#tooltipLiveStrum'),
      tipVis: (() => { const t = document.getElementById('fingering-tooltip'); return t ? t.classList.contains('visible') : false; })(),
      ctxT: +getAudioContext().currentTime.toFixed(2),
      pos: (document.getElementById('playbackPos') || {}).textContent,
      npc: (document.getElementById('nowPlayingChord') || {}).textContent,
    }));
    console.log('  t+' + ((k + 1) * 0.5).toFixed(1), JSON.stringify(d));
  }
  const hits = await p.evaluate(() => window.__hits);
  console.log('диагностика:', JSON.stringify(await p.evaluate(() => ({
    secs: sections.length,
    withPattern: sections.filter((s) => s.strumPattern).length,
    cells: sections.reduce((n, s) => n + s.squares.reduce((m, q) => m + q.events.length, 0), 0),
    activeNow: document.querySelectorAll('.strum-step-active').length,
    allSteps: document.querySelectorAll('.strum-step').length,
    fingTooltip: !!document.querySelector('#tooltipLiveStrum'),
    nowBadge: !!document.querySelector('#nowPlayingChord.visible'),
    timers: (playbackState.strumHighlightTimers || []).length,
  }))));
  await p.evaluate(() => { try { stopAll(); } catch (e) {} });
  console.log('\n=== Сколько раз мигало за 6 с ===');
  Object.entries(hits).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${String(v).padStart(5)}  ${k}`));
  console.log('\n=== Где они на экране ===');
  console.log(JSON.stringify(await p.evaluate(() => {
    const q = (sel, name) => {
      const e = document.querySelector(sel);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { name, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
    };
    return [
      q('#nowPlayingChord', 'бейдж «сейчас играет»'),
      q('.section-card .strum-preview, .section-card .strum-badge-wrap', 'бейдж секции'),
      q('#tooltipLiveStrum', 'тултип аппликатуры'),
      q('#fingering-tooltip', 'сам тултип'),
    ].filter(Boolean);
  }), null, 1));
  await p.screenshot({ path: '/home/user/dev/bench/anim-count.png' });
  await br.close();
})();
