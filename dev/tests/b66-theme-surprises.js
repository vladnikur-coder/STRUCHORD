#!/usr/bin/env node
/* B-66.1 — контракт микро-события схемы «Гроза». */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'STRUCHORD.html'), 'utf8');
let ok = 0;
function check(cond, msg) { if (!cond) throw new Error('ПРОВАЛ: ' + msg); console.log('OK:', msg); ok++; }
check(src.includes('id="schemeSurprises"'), 'общий выключатель неожиданностей есть в меню');
check(src.includes("SCHEME_SURPRISES_KEY = 'struchord-scheme-surprises'"), 'настройка имеет постоянный ключ');
check(/STORM_WAIT_MIN_MS\s*=\s*10000/.test(src) && /STORM_WAIT_MAX_MS\s*=\s*20000/.test(src), 'частый интервал приёмки 10–20 секунд');
check(src.includes("activeSchemeId() === 'storm'"), 'событие ограничено схемой «Гроза»');
check(src.includes("document.visibilityState === 'visible'"), 'скрытая вкладка исключена');
check(src.includes('!stormReducedMotion()'), 'prefers-reduced-motion учитывается в воротах');
check(src.includes('!(playbackState && playbackState.isPlaying)'), 'воспроизведение исключено из запуска');
check(src.includes('if (on) cancelStormSurprise()'), 'старт воспроизведения отменяет грозу');
check(/randomBetween\(3000, 5000\)/.test(src), 'заряд длится 3–5 секунд');
check(/randomBetween\(20000, 30000\)/.test(src), 'автоудар ждёт 20–30 секунд');
check(src.includes("document.addEventListener('click', interceptStormClick, true)"), 'клик перехватывается в capture-фазе');
check(src.includes("document.addEventListener('keydown', interceptStormKey, true)"), 'Enter/Space перехватываются');
check(src.includes('e.preventDefault(); e.stopImmediatePropagation();'), 'первое действие контрола отменяется');
check(src.includes("Math.hypot(ar.left + ar.width/2 - cx"), 'автоцель выбирается по близости к центру');
check(src.includes("stroke: #eef3ff"), 'видимая молния имеет отдельный SVG-слой');
check(src.includes('playStormCrackle()') && src.includes('playStormThunder()'), 'заряд и удар имеют разные звуки');
check(src.includes("pointer-events: none"), 'атмосферный слой не блокирует интерфейс');
check(src.includes('@media (prefers-reduced-motion: reduce)'), 'CSS также гасит эффект доступности');
check(src.includes("localStorage.setItem(SCHEME_SURPRISES_KEY"), 'выключатель сохраняется');
check(src.includes("resetSchemeSurpriseSchedule(); // B-66"), 'смена схемы пересобирает таймер');
check(src.includes('storm-charge-glint'), 'маленькие искры имеют отдельный SVG-путь');
check(/randomBetween\(60, 150\)/.test(src), 'искры и треск идут очень часто');
check(src.includes('filter(isStormTargetVisible)'), 'искры располагаются возле видимых контролов');
check(src.includes('storm-screen-shake'), 'удар встряхивает экран');
check(/const duration = 5\.2/.test(src), 'гром имеет длинный раскат 5,2 секунды');
check(src.includes('unlockStormAudio'), 'звук пробуждается пользовательским жестом');
check(src.includes("'.chord-wrapper'"), 'ячейки входят в цели молнии');
check(src.includes('linear-gradient(to bottom'), 'туча затемняет только верх экрана');
check(!src.includes('mix-blend-mode: multiply'), 'режим смешивания не прячет белую молнию');
check(src.includes("html[data-theme='dark'] .storm-charge-glint"), 'искры контрастны отдельно в светлой и тёмной теме');
check(src.includes('const rolls = ['), 'гром собран из нескольких самостоятельных раскатов');
console.log(`\nALL OK — ${ok} проверок B-66.1.`);
