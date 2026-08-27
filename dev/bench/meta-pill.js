// Форма .meta-row при переносе строк.
//
// border-radius: 60px + flex-wrap: wrap. Пока элементы в один ряд —
// капсула. Как только контент переносится на вторую строку, радиус
// 60px превышает половину высоты не для всех сторон, и блок выглядит
// не капсулой, а прямоугольником со странно скруглёнными углами.
const puppeteer = require('/home/user/node_modules/puppeteer');
let bad = 0;
const t = (n, c, x = '') => { if (c) console.log('   ok  ', n, x); else { bad++; console.log('  FAIL ', n, x); } };
(async () => {
  const br = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const p = await br.newPage();
  p.setDefaultTimeout(90000);
  await p.goto('file:///home/user/STRUCHORD.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await new Promise((r) => setTimeout(r, 1000));

  for (const w of [1200, 900, 760, 640, 560, 480, 390, 320]) {
    await p.setViewport({ width: w, height: 900 });
    await new Promise((r) => setTimeout(r, 350));
    const d = await p.evaluate(() => {
      const el = document.querySelector('.meta-row');
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      // Перенос определяем по ВЫСОТЕ, а не по top детей: элементы
      // центрированы по вертикали и имеют разную высоту, поэтому
      // уникальных top всегда несколько даже в одну строку.
      let maxKid = 0;
      [...el.children].forEach((c) => {
        const k = c.getBoundingClientRect();
        if (k.width > 0) maxKid = Math.max(maxKid, k.height);
      });
      const single = maxKid + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      return {
        h: Math.round(r.height),
        radius: parseFloat(cs.borderTopLeftRadius),
        single: Math.round(single),
        wrapped: r.height > single + 2,
      };
    });
    const half = d.h / 2;
    // Радиус больше половины высоты браузер ужимает — форма остаётся
    // капсулой. Плохо, когда блок ПЕРЕНЁССЯ, а радиус всё ещё
    // капсульный: получается панель с огромными круглыми боками.
    const looksPill = d.radius >= half - 0.5;
    const bad_case = d.wrapped && looksPill;
    const verdict = bad_case ? 'ПЛОХО: многострочная «капсула»'
      : d.wrapped ? 'ok: перенос -> прямоугольник'
      : looksPill ? 'ok: одна строка -> капсула'
      : 'ok: одна строка, скруглённый прямоугольник';
    console.log(`  ширина ${String(w).padStart(4)}: высота ${String(d.h).padStart(3)} (одна строка ${d.single}), радиус ${String(d.radius).padStart(3)} — ${verdict}`);
    t(`${w}px: капсульный радиус только без переноса`, !bad_case, verdict);
  }
  // Капсульные элементы задаются токеном, а не числом на глаз.
  // Меряем на ДЕСКТОПНОЙ ширине: на мобильном у транспорта своё
  // правило (28px) — это осознанное исключение, а не капсула.
  await p.setViewport({ width: 1200, height: 900 });
  await new Promise((r) => setTimeout(r, 350));
  const tok = await p.evaluate(() => {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--border-radius-pill').trim();
    const px = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { radius: parseFloat(getComputedStyle(el).borderTopLeftRadius), h: r.height };
    };
    return { v, bar: px('.transport-bar'), bpm: px('.bpm-input'), pos: px('.playback-position') };
  });
  t('токен --border-radius-pill объявлен', !!tok.v, tok.v);
  // Капсула = радиус не меньше половины высоты элемента.
  for (const [nm, d] of [['.transport-bar', tok.bar], ['.bpm-input', tok.bpm], ['.playback-position', tok.pos]]) {
    if (!d) continue;
    t(`${nm} — капсула`, d.radius >= d.h / 2 - 0.5,
      `радиус ${d.radius}, половина высоты ${(d.h / 2).toFixed(1)}`);
  }
  // В исходнике не должно остаться «магических» капсульных чисел.
  const fs = require('fs');
  const src = fs.readFileSync('/home/user/STRUCHORD.html', 'utf8');
  const magic = (src.match(/border-radius:\s*(999|60|48)px/g) || []).length;
  t('нет жёстко зашитых капсульных радиусов', magic === 0, `${magic} шт.`);
  console.log(bad ? `\nПРОВАЛЕНО: ${bad}` : '\nвсё зелено');
  await br.close();
  process.exit(bad ? 1 : 0);
})();
