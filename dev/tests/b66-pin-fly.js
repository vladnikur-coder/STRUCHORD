// B-66: тултип ПЕРЕЛЕТАЕТ в док, а не подменяется рывком.
//
// Жалоба пользователя (2026-09-06): «анимация при закреплении выглядит
// слишком резкой и дёрганой». Причина — два НЕСВЯЗАННЫХ движения:
// тултип исчезал мгновенно там, где его отпустили, а гриф отдельно
// падал в док сверху (translateY(-16px)). Глаз не связывал их в одно
// действие.
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

// Перетаскиваем тултип в док, перехватывая анимацию полёта.
async function dragToDock(w) {
  const tip = w.document.getElementById('fingering-tooltip');
  const bar = w.document.querySelector('.transport-bar');
  w.eval('lastTooltipWrapper = currentTooltipWrapper = document.querySelector(".chord-wrapper")');
  w.eval('const i=document.querySelector(".chord-wrapper .chord-input"); if(i && !i.value.trim()) i.value="Am";');
  tip.style.display = 'block';
  tip.dataset.currentShape = '0,2,2,1,0,0';
  tip.getBoundingClientRect = () => ({ left: 400, top: 300, width: 220, height: 170, right: 620, bottom: 470 });
  bar.getBoundingClientRect = () => ({ left: 40, top: 60, width: 180, height: 60, right: 220, bottom: 120 });

  const frames = [];
  tip.animate = (kf, opt) => {
    frames.push({ kf, opt });
    const h = { onfinish: null, cancel() {} };
    setTimeout(() => h.onfinish && h.onfinish(), opt.duration);
    return h;
  };
  tip.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, clientX: 500, clientY: 380, pointerId: 9 }));
  w.document.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, clientX: 120, clientY: 90, pointerId: 9 }));
  w.document.dispatchEvent(new w.MouseEvent('pointerup', { bubbles: true, clientX: 120, clientY: 90, pointerId: 9 }));
  await sleep(60);
  return { tip, frames };
}

(async () => {
  console.log('=== 1. Тултип летит к доку ===');
  {
    const w = boot();
    await sleep(300);
    const { frames } = await dragToDock(w);
    ok('анимация полёта запущена ровно один раз', frames.length === 1, String(frames.length));
    const to = frames[0] && frames[0].kf[1].transform;
    ok('движение направлено к доку (влево-вверх)',
       /translate\(-\d+(\.\d+)?px,\s*-\d+(\.\d+)?px\)/.test(to || ''), to);
    ok('по пути уменьшается', /scale\(0\.\d+\)/.test(to || ''), to);
    ok('длительность мягкая, не мгновенная',
       frames[0].opt.duration >= 300 && frames[0].opt.duration <= 500, String(frames[0].opt.duration));
    ok('кривая с торможением', /cubic-bezier/.test(frames[0].opt.easing || ''), frames[0].opt.easing);
  }

  console.log('=== 2. Гриф появляется СРАЗУ, полёт его перекрывает ===');
  {
    // Вторая половина дёрганости (жалоба «закрепление всё ещё
    // дёрганое»): док оставался пустым все 260мс полёта, а потом гриф
    // возникал скачком. Теперь он ставится сразу и проявляется на
    // месте, пока тултип долетает поверх.
    const w = boot();
    await sleep(300);
    await dragToDock(w);
    await sleep(40); // полёт ещё идёт
    ok('гриф в доке УЖЕ есть, не дожидаясь конца полёта',
       !!w.eval('pinnedFingering'));
    const row = w.document.getElementById('pinnedRow');
    ok('проявляется на месте (без сдвига)',
       row && row.classList.contains('is-fading-in'),
       'нет is-fading-in');
    ok('НЕ въезжает сверху',
       !row || !row.classList.contains('is-appearing'),
       'is-appearing остался — это и был рывок');
    await sleep(400);
    ok('после посадки гриф на месте', !!w.eval('pinnedFingering'));
  }

  console.log('=== 2b. Полёт не портит тултип на будущее ===');
  {
    // Баг после первой версии: fill:'forwards' держал конечное
    // состояние анимации СИЛЬНЕЕ инлайн-стиля, и тултип оставался
    // уехавшим и невидимым — «ломает появление аппликатуры».
    const w = boot();
    await sleep(300);
    const { tip } = await dragToDock(w);
    await sleep(400);
    ok('сдвиг от полёта снят', !tip.style.transform, tip.style.transform);
    w.eval('pinnedFingering = null');
    const wrap = w.document.querySelector('.chord-wrapper');
    let shown = true;
    try { w.showFingeringTooltip('Am', wrap); } catch (e) { shown = false; }
    await sleep(80);
    ok('аппликатура показывается снова', shown && tip.style.display !== 'none');
  }

  console.log('=== 3. Обычное закрепление (не перетаскиванием) анимацию сохраняет ===');
  {
    // skipAppear передаётся ТОЛЬКО из полёта: если закрепить иначе,
    // гриф по-прежнему должен красиво въезжать.
    const w = boot();
    await sleep(300);
    w.eval('lastTooltipWrapper = currentTooltipWrapper = document.querySelector(".chord-wrapper")');
    w.eval('const i=document.querySelector(".chord-wrapper .chord-input"); if(i && !i.value.trim()) i.value="Am";');
    const tip = w.document.getElementById('fingering-tooltip');
    tip.dataset.currentShape = '0,2,2,1,0,0';
    w.eval('pinFingeringFromTooltip()');
    await sleep(30);
    const row = w.document.getElementById('pinnedRow');
    ok('анимация въезда на месте', row && row.classList.contains('is-appearing'));
  }

  console.log('=== 4. Страховка от зависшего тултипа ===');
  {
    // Если Web Animations недоступен (reduced-motion, старый движок),
    // тултип не должен остаться висеть в воздухе.
    ok('есть запасной таймер посадки', /setTimeout\(land,/.test(html));
    ok('посадка защищена от двойного вызова', /if \(done\) return;/.test(html));
    // В jsdom нет настоящих Web Animations, поэтому поведенческая
    // проверка сюда не достаёт — сторожим сам код. Без cancel() анимация
    // с fill:'forwards' держит конечное состояние сильнее инлайна, и
    // тултип остаётся невидимым: это и был баг «ломает появление
    // аппликатуры».
    ok('анимация полёта отменяется на посадке',
       /anim && anim\.cancel\(\)/.test(html), 'нет anim.cancel() в land()');
    ok('inline-стили снимаются через removeProperty',
       /removeProperty\('opacity'\)/.test(html) && /removeProperty\('transform'\)/.test(html));
    ok('гриф ставится ДО полёта, а не после',
       /pinFingeringFromTooltip\(\{ skipAppear: false, fadeIn: true[^}]*\}\)[\s\S]{0,1600}el\.animate\(/.test(html),
       'порядок нарушен — док будет пустым во время полёта');
  }


  console.log('=== 5. Плавность: движения перетекают, а не совпадают ===');
  {
    // Просьба «сделай закрепление плавнее». Резкость давали три вещи:
    // полёт 260мс (глаз не успевает проследить путь), проявление грифа
    // РОВНО той же длительности (оба движения кончались в одну точку —
    // вспышка) и заметный скачок масштаба 0.96.
    const w = boot();
    await sleep(300);
    const { frames } = await dragToDock(w);
    const flyMs = frames[0].opt.duration;

    // Проявление грифа читаем из CSS: длительность и задержка.
    const m = html.match(/is-fading-in[\s\S]{0,400}?animation:\s*struchord-pin-fade-in\s+([\d.]+)s[^;]*?\s([\d]+)ms/);
    ok('проявление грифа описано в CSS', !!m, 'правило не найдено');
    if (m) {
      const fadeMs = parseFloat(m[1]) * 1000;
      const delayMs = parseInt(m[2], 10);
      console.log(`      полёт ${flyMs}мс | проявление ${fadeMs}мс с задержкой ${delayMs}мс`);
      ok('гриф проявляется ДОЛЬШЕ, чем длится полёт',
         fadeMs > flyMs, `${fadeMs} против ${flyMs}`);
      ok('проявление стартует с задержкой (не одновременно)',
         delayMs > 0 && delayMs < 150, String(delayMs));
      ok('проявление кончается ПОЗЖЕ посадки — перетекание',
         delayMs + fadeMs > flyMs, `${delayMs + fadeMs} против ${flyMs}`);
    }

    // Тултип должен гаснуть РАНЬШЕ, чем долетит: иначе подмена видна.
    const mid = frames[0].kf.find((k) => k.offset === 0.75);
    ok('к 75% пути тултип почти прозрачен',
       mid && mid.opacity <= 0.3, mid ? String(mid.opacity) : 'нет ключа 0.75');

    // Скачок масштаба у грифа не должен бросаться в глаза.
    const sc = html.match(/struchord-pin-fade-in\s*\{[\s\S]{0,200}?scale\(([\d.]+)\)/);
    ok('стартовый масштаб грифа близок к единице',
       sc && parseFloat(sc[1]) >= 0.97, sc ? sc[1] : 'не найден');

    // Класс не должен сниматься посреди анимации.
    const t = html.match(/__fadeTimer = setTimeout\([\s\S]{0,200}?\}, (\d+)\)/);
    ok('класс снимается ПОСЛЕ конца анимации',
       t && parseInt(t[1], 10) >= 480, t ? t[1] : 'таймер не найден');
  }


  console.log('=== 6. Анимация проявления реально СТАРТУЕТ (B-67, 0.196) ===');
  {
    // Запись экрана показала: закрепление мгновенное, анимации нет.
    // Причина — не тайминги (их я правил три версии подряд), а
    // отсутствие принудительного reflow: ряд только что переведён из
    // display:none в flex, браузер схлопывает показ и добавление класса
    // в один пересчёт стилей и НЕ ВИДИТ смены состояния.
    //
    // В jsdom анимаций нет, поэтому сторожим код: класс должен сниматься,
    // затем reflow, затем ставиться заново.
    const block = html.slice(html.indexOf('if (rowEl && opts.fadeIn)'), html.indexOf('} else if (rowEl && !opts.skipAppear)'));
    const iRemove = block.indexOf("classList.remove('is-fading-in')");
    const iReflow = block.indexOf('void rowEl.offsetWidth');
    const iAdd = block.indexOf("classList.add('is-fading-in')");
    ok('класс сначала снимается', iRemove >= 0, 'нет remove');
    ok('затем принудительный reflow', iReflow > iRemove, `remove=${iRemove} reflow=${iReflow}`);
    ok('и только потом ставится', iAdd > iReflow, `reflow=${iReflow} add=${iAdd}`);

    // Тултип не должен гаснуть, пока летит: иначе между его исчезновением
    // и появлением грифа зияет пустота (замер по видео: 2 кадра при 30к/с).
    ok('есть флаг полёта', /let tooltipFlyingToDock = false/.test(html));
    ok('автоскрыв молчит во время полёта',
       /if \(tooltipFlyingToDock && !isPreview\) return;/.test(html));
    // Ищем ВНУТРИ onUp: в файле есть другие вхождения обоих выражений,
    // и поиск по всему тексту сравнивал бы несвязанные места.
    const onUpAt = html.indexOf('const onUp = () => {');
    const onUpBlock = html.slice(onUpAt, onUpAt + 1400);
    const flagAt = onUpBlock.indexOf('tooltipFlyingToDock = true');
    const resetAt = onUpBlock.indexOf('pinDragState = null');
    ok('флаг поднимается до сброса состояния жеста',
       flagAt >= 0 && flagAt < resetAt,
       `флаг=${flagAt} сброс=${resetAt} — таймер автоскрытия успеет сработать`);
    ok('флаг снимается на посадке', /tooltipFlyingToDock = false;\n      el\.classList\.remove\('is-flying'\)/.test(html));
  }

  console.log(bad ? `\nFAIL: ${bad}` : '\nALL OK');
  if (bad) process.exitCode = 1;
})();
