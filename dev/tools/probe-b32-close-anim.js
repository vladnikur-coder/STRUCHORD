// Живой проб 0.141: закрытие пилюли BPM должно АНИМИРОВАТЬСЯ.
// До фикса visibility снималась мгновенно (не входила в transition) —
// элемент исчезал в один кадр, хотя height/opacity продолжали ехать.
// Сэмплуем computed style каждый кадр после idle-закрытия.
const path = require('path');
const puppeteer = require(path.join(__dirname, '../../node_modules/puppeteer'));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/tmp/chrome/chrome',
    env: { ...process.env, LD_LIBRARY_PATH: '/tmp/chromelibs/lib' },
    args: ['--no-sandbox', '--disable-gpu', '--force-color-profile=srgb', '--window-size=1280,900']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('file://' + path.join(__dirname, '../../STRUCHORD.html'), { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 800));

  const ver = await page.$eval('.app-title span', (s) => s.textContent.trim());
  console.log('версия в шапке:', ver);

  // Открытие: сэмплаим сразу после колеса — пилюля должна РАСТИ
  // (height 34→118, opacity 0→1), visibility — сразу visible.
  const openFrames = await page.evaluate(async () => {
    const input = document.getElementById('bpmInput');
    input.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }));
    const el = document.querySelector('.bpm-inline-drum') || { getBoundingClientRect: () => ({ height: 0 }) };
    const out = [];
    const t0 = performance.now();
    await new Promise((resolve) => {
      const tick = () => {
        const cs = getComputedStyle(el);
        out.push({
          t: Math.round(performance.now() - t0),
          vis: cs.visibility,
          op: +(+cs.opacity).toFixed(2),
          h: Math.round(el.getBoundingClientRect().height)
        });
        if (performance.now() - t0 < 600) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    return out;
  });
  const openGrew = openFrames.filter((f) => f.h > 40 && f.h < 116 && f.vis === 'visible' && f.op > 0.05);
  const openStart = openFrames[0], openEnd = openFrames[openFrames.length - 1];
  console.log('открытие: старт', `${openStart.h}px/op${openStart.op}/${openStart.vis}`,
    '→ финал', `${openEnd.h}px/op${openEnd.op}/${openEnd.vis}`,
    `; кадров роста: ${openGrew.length}`);
  const openOk = openStart.h <= 40 && openEnd.h === 118 && openEnd.op === 1 && openStart.vis === 'visible';
  console.log(openOk ? 'ОТКРЫТИЕ OK' : 'ОТКРЫТИЕ FAIL');
  if (!openOk) { await browser.close(); process.exit(1); }
  // прибираем: закрываем текущий барабан и ждём
  await page.evaluate(() => { document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); });
  await new Promise((r) => setTimeout(r, 500));

  // Колесо над полем BPM открывает барабан; idle-закрытие тикает через
  // 1.2с. Сэмплаим одним evaluate с 850мс после колеса — чтобы поймать
  // начало сворачивания (предыдущая версия начинала на ~200мс позже).
  const frames = await page.evaluate(async () => {
    const input = document.getElementById('bpmInput');
    input.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 850)); // до idle-тика
    const el = document.querySelector('.bpm-inline-drum');
    const out = [];
    const t0 = performance.now();
    await new Promise((resolve) => {
      const tick = () => {
        const cs = getComputedStyle(el);
        out.push({
          t: Math.round(performance.now() - t0 - 350), // 0 = момент колеса
          vis: cs.visibility,
          op: +(+cs.opacity).toFixed(2),
          h: Math.round(el.getBoundingClientRect().height)
        });
        if (performance.now() - t0 < 900) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    return out;
  });

  console.log('t(ms)  visibility  opacity  height');
  for (const f of frames) console.log(String(f.t).padEnd(7), f.vis.padEnd(11), String(f.op).padEnd(9), f.h);

  const closed = frames[frames.length - 1];
  const visibleFrames = frames.filter((f) => f.vis === 'visible' && f.op > 0.05 && f.h > 40);
  const verdict1 = visibleFrames.length >= 8; // сворачивание ВИДИМО много кадров
  const visHoldMs = (frames.filter((f) => f.vis === 'visible').length / frames.length) * 700;
  const verdict2 = closed.vis === 'hidden' && closed.op === 0;
  console.log('\nвидимых кадров закрытия:', visibleFrames.length, '(>=8 → анимация играется)');
  console.log('visibility держалась ~', Math.round(visHoldMs), 'мс из 700');
  console.log('финал: hidden/opacity 0:', verdict2);
  const okAll = verdict1 && verdict2;
  console.log(okAll ? 'PROBE OK' : 'PROBE FAIL');
  await browser.close();
  process.exit(okAll ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
