#!/usr/bin/env node
/*
 * b12-parts.js — B-12.1 «Партии», кирпич 1 «Каркас».
 *
 * Проверяем:
 *  1. Схему: старая песня проходит миграции до v7 и загружается без партий;
 *  2. Санитайзер партий: битые ноты отбрасываются, чужие ключи секций
 *     теряются, лимиты и allowlist работают;
 *  3. Сохранение: parts уезжают в файл, schemaVersion = 7;
 *  4. Окно «Партии»: станки по проходам секций, чипы нот, пустое состояние;
 *  5. Режимы: is-parts, Esc, взаимоисключение с лентой;
 *  6. Звук: окна событий и времена нот (заглушка pluckString);
 *  7. Демо-фикстуру dev/fixtures/b12-parts-demo.struchord;
 *  8. Независимость от гармонии: партии не влияют на тональность и сетку;
 *  9. Жизненный цикл секции: клон уносит рулон, удаление — чистит.
 * 10. Пустая песня: окно партий не встречает пустым экраном — предлагает
 *     добавить секцию (партия строится по секциям) и создать партию;
 *     панель «Секции:» доступна прямо из окна партий (итерация 0.622).
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'STRUCHORD.html'), 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://localhost/',
  beforeParse(win) {
    win.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    win.cancelAnimationFrame = (id) => clearTimeout(id);
    win.HTMLCanvasElement.prototype.getContext = () => ({
      font: '', measureText: () => ({ width: 10 }),
      clearRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {}, moveTo() {},
      lineTo() {}, closePath() {}, save() {}, restore() {}, translate() {}, rotate() {},
      fillText() {}, strokeText() {}, setTransform() {}, scale() {},
      createLinearGradient: () => ({ addColorStop() {} }),
    });
  },
});
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function () {
  return {
    currentTime: 0, state: 'running', resume() {}, sampleRate: 44100,
    createBuffer: (c, len) => ({ getChannelData: () => new Float32Array(len) }),
  };
};

let pass = 0;
let fail = 0;
function check(name, cond, details) {
  if (cond) {
    pass++;
    console.log('ok   ' + name);
  } else {
    fail++;
    console.error('FAIL ' + name + (details ? ' — ' + details : ''));
  }
}

const square = (id, chord) => ({
  id, repeat: 1, customBeats: 4,
  events: [{ chord, span: 4, timeSig: null, strumPattern: null }],
});
const section = (id, type, repeat, chords) => ({
  id, type, customName: null, key: null, shift: null, timeSig: null, bpm: null,
  repeat, strumPattern: null, squares: chords.map((c, i) => square(id * 10 + i, c)),
});

function baseSong(extra) {
  return Object.assign({
    schemaVersion: 4,
    metadata: { artist: 'Тест', title: 'Партии' },
    bpm: 100, globalKey: 'C', keyMode: 'manual', globalTimeSig: '4/4',
    tuning: 'e-std', tuningNotes: null, notes: '',
    sections: [section(1, 'Verse', 2, ['C', 'G']), section(2, 'Chorus', 1, ['F', 'C'])],
    nextId: 100, rhythmPool: null, userFingerings: [], preferredFingerings: [], date: '2026-10-12',
  }, extra || {});
}

function loadSong(song) {
  w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
  w.loadSong(0);
}

w.addEventListener('load', () => {
  try {
    // ---------- 1. Миграция старой схемы до v7 ----------
    loadSong(baseSong());
    check('старая песня (v4) загружается без партий', w.eval('JSON.stringify(songParts)') === '[]');
    check('схема поднята до 7 для lyrics и media manifests', w.eval('SONG_SCHEMA_VERSION') === 7);
    w.confirm = () => true;
    w.saveCurrentSong();
    const afterOld = JSON.parse(w.localStorage.getItem('struchord_songs'));
    const savedOld = afterOld[afterOld.length - 1];
    check('в сейве schemaVersion 7', savedOld.schemaVersion === 7, String(savedOld.schemaVersion));
    check('в сейве пустой список партий', Array.isArray(savedOld.parts) && savedOld.parts.length === 0);

    // ---------- 2. Санитайзер партий ----------
    loadSong(baseSong({
      parts: [{
        id: 7, name: '', instrument: 'theremin', tuning: 'нет-такого', visible: 'нет',
        rolls: {
          '1': [
            { start: 0, dur: 1, string: 5, fret: 8 },      // годная
            { start: 1, dur: 1, string: 9, fret: 40 },     // струна и лад вне диапазона
            { start: -1, dur: 1, string: 0, fret: 3 },     // отрицательный старт
            { start: 2, dur: 0, string: 0, fret: 3 },      // нулевая длительность
            { start: 999, dur: 1, string: 0, fret: 3 },    // за пределами секции
            { start: 3, dur: 1, string: 1.5, fret: 3 },    // нецелая струна
            'мусор', null,
          ],
          '2': [{ start: 0, dur: 1, string: 4, fret: 1 }],
          '999': [{ start: 0, dur: 1, string: 4, fret: 1 }], // секции 999 нет
        },
      }],
    }));
    let parts = JSON.parse(w.eval('JSON.stringify(songParts)'));
    check('партия одна', parts.length === 1, JSON.stringify(parts));
    check('имя по умолчанию вместо пустого', parts[0] && parts[0].name === 'Партия 1', JSON.stringify(parts[0] && parts[0].name));
    check('инструмент по allowlist', parts[0] && parts[0].instrument === 'guitar', JSON.stringify(parts[0] && parts[0].instrument));
    check('чужой строй сброшен в null', parts[0] && parts[0].tuning === null);
    check('visible по умолчанию true', parts[0] && parts[0].visible === true);
    check(
      'битые ноты отброшены, остались только годные',
      parts[0] && parts[0].rolls['1'] && parts[0].rolls['1'].length === 1 &&
        parts[0].rolls['1'][0].fret === 8,
      JSON.stringify(parts[0] && parts[0].rolls['1'])
    );
    check('чужая секция не оставила рулона', parts[0] && !parts[0].rolls['999'], JSON.stringify(parts[0].rolls));

    // Смена роли может сохранить более высокую старую tab-линию, но только
    // с валидным 1–12 маркером и только до объявленной границы.
    loadSong(baseSong({ parts: [
      { id: 8, name: 'Bass', instrument: 'bass', rollStringLimit: 6,
        rolls: { '1': [
          { start: 0, dur: 1, string: 5, fret: 3 },
          { start: 1, dur: 1, string: 6, fret: 3 },
        ] } },
      { id: 9, name: 'Bad limit', instrument: 'bass', rollStringLimit: 13,
        rolls: { '1': [{ start: 0, dur: 1, string: 5, fret: 3 }] } },
    ] }));
    const rangedParts = JSON.parse(w.eval('JSON.stringify(songParts)'));
    check('валидный rollStringLimit сохраняет линию вне короткого грифа, не расширяя дальше лимита',
      rangedParts[0].rolls['1'].length === 1 && rangedParts[0].rolls['1'][0].string === 5 &&
        (!rangedParts[1].rolls['1'] || rangedParts[1].rolls['1'].length === 0) && !Object.prototype.hasOwnProperty.call(rangedParts[0], 'rollStringLimit'));

    // Ремап ключей: дублирующиеся id секций в файле переназначаются, а
    // рулоны обязаны поехать за своими секциями.
    const dup = baseSong();
    dup.sections = [section(5, 'Verse', 1, ['C']), section(5, 'Chorus', 1, ['G'])];
    dup.parts = [{ id: 1, name: 'П', instrument: 'guitar', tuning: null, visible: true,
      rolls: { '5': [{ start: 0, dur: 1, string: 5, fret: 0 }] } }];
    loadSong(dup);
    const dupIds = JSON.parse(w.eval('JSON.stringify(sections.map(s => s.id))'));
    const dupRolls = JSON.parse(w.eval('JSON.stringify(songParts[0].rolls)'));
    check('дубли id секций разведены', dupIds.length === 2 && dupIds[0] !== dupIds[1], JSON.stringify(dupIds));
    check(
      'рулон приехал на новую id своей секции',
      Object.keys(dupRolls).length === 1 && dupRolls[String(dupIds[0])] && !dupRolls[String(dupIds[1])],
      JSON.stringify(dupRolls) + ' ids ' + JSON.stringify(dupIds)
    );

    // ---------- 3. Окно «Партии» ----------
    loadSong(baseSong({
      parts: [{
        id: 1, name: 'Соло', instrument: 'guitar', tuning: null, visible: true,
        rolls: {
          '1': [{ start: 0, dur: 1, string: 5, fret: 8 }, { start: 2, dur: 2, string: 4, fret: 10 }],
          '2': [{ start: 0, dur: 4, string: 5, fret: 3 }],
        },
      }],
    }));
    w.eval('togglePartsMode(true)');
    check('body.is-parts выставлен', w.document.body.classList.contains('is-parts'));
    const track = w.document.getElementById('partsTrack');
    check('станков = секции × повторы (2 + 1)', track.querySelectorAll('.pt-section').length === 3,
      String(track.querySelectorAll('.pt-section').length));
    // B-12.2: в табулатуре появился квадрат курсора — он тоже <rect>,
    // поэтому считаем только ноты.
    const chips = () => track.querySelectorAll('.pt-svg rect:not(.pt-cursor)').length;
    check('чипов нот = 2×2 прохода + 1', chips() === 5, String(chips()));
    const frets = Array.from(track.querySelectorAll('.pt-svg text')).map((t) => t.textContent).join('|');
    check('лады нарисованы по проходам', frets === '8|10|8|10|3', frets);
    check('тактовая сетка есть', track.querySelectorAll('.pt-svg line').length > 20,
      String(track.querySelectorAll('.pt-svg line').length));
    check('пустое состояние скрыто', w.document.getElementById('partsEmpty').hidden === true);
    const names = Array.from(track.querySelectorAll('.pt-score-marker')).map((t) => t.childNodes[0].textContent).join('|');
    check('подписи проходов секции на непрерывной ленте', names === 'Куплет 1/2|Куплет 2/2|Припев', names);
    // B-12.3: пилюля показывает и инструмент дорожки.
    const pillText = w.document.getElementById('partsActiveName').textContent;
    check('имя и инструмент партии в пилюле', pillText === 'Соло · Гитара', pillText);

    // ---------- 4. Режимы ----------
    w.eval('toggleTimelineMode(true)');
    check('лента выключает окно партий', !w.document.body.classList.contains('is-parts') && w.document.body.classList.contains('is-timeline'));
    w.eval('toggleTimelineMode(false)');
    w.eval('togglePartsMode(true)');
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    check('Esc возвращает в редактор', !w.document.body.classList.contains('is-parts'));
    w.eval('togglePartsMode(true)');
    check('кнопка подписана «Редактор»', w.document.getElementById('partsToggleLabel').textContent === 'Редактор');
    w.eval('togglePartsMode(false)');

    // ---------- 5. Звук партии ----------
    loadSong(baseSong({
      sections: [{ id: 1, type: 'Verse', customName: null, key: null, shift: null, timeSig: null, bpm: null, repeat: 1, strumPattern: null,
        squares: [{ id: 2, repeat: 1, customBeats: null, events: [
          { chord: 'C', span: 2, timeSig: null, strumPattern: null },
          { chord: 'G', span: 2, timeSig: null, strumPattern: null },
        ] }] }],
      parts: [{ id: 1, name: 'Соло', instrument: 'guitar', tuning: null, visible: true,
        rolls: { '1': [{ start: 0, dur: 1, string: 5, fret: 0 }, { start: 3, dur: 1, string: 0, fret: 3 }] } }],
    }));
    const win0 = JSON.parse(w.eval('JSON.stringify(partEventWindowUnits(sections[0], sections[0].squares[0], 0))'));
    const win1 = JSON.parse(w.eval('JSON.stringify(partEventWindowUnits(sections[0], sections[0].squares[0], 1))'));
    check('окно первого события 0..2', win0.start === 0 && win0.span === 2 && win0.end === 2, JSON.stringify(win0));
    check('окно второго события 2..4', win1.start === 2 && win1.span === 2 && win1.end === 4, JSON.stringify(win1));
    w.eval(`
      window.__plucks = [];
      pluckString = function(ctx, opts) {
        window.__plucks.push({ freq: opts.freq, at: opts.startTime, dur: opts.duration, gain: opts.gain });
      };
    `);
    w.eval('schedulePartsForEvent({}, sections[0], sections[0].squares[0], 0, 10, 1)');
    w.eval('schedulePartsForEvent({}, sections[0], sections[0].squares[0], 1, 11, 1)');
    const plucks = JSON.parse(w.eval('JSON.stringify(window.__plucks)'));
    check('каждое событие сыграло свою ноту', plucks.length === 2, JSON.stringify(plucks));
    check('нота первого события в начале окна', plucks[0] && Math.abs(plucks[0].at - 10) < 1e-9 && Math.abs(plucks[0].freq - 329.6276) < 0.01,
      JSON.stringify(plucks[0]));
    check('нота второго события внутри окна (11.5с)', plucks[1] && Math.abs(plucks[1].at - 11.5) < 1e-9 && Math.abs(plucks[1].freq - 97.9989) < 0.01,
      JSON.stringify(plucks[1]));
    check('длительность ноты взята из рулона', plucks[0] && Math.abs(plucks[0].dur - 0.5) < 1e-9, JSON.stringify(plucks[0]));

    // ---------- 6. Демо-фикстура ----------
    const demoRaw = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'b12-parts-demo.struchord'), 'utf8');
    const demo = JSON.parse(demoRaw);
    loadSong(demo);
    const demoParts = JSON.parse(w.eval('JSON.stringify(songParts)'));
    check('демо: партия загрузилась', demoParts.length === 1 && demoParts[0].name === 'Соло-гитара', JSON.stringify(demoParts[0] && demoParts[0].name));
    // Числа берём из самой фикстуры: состав демо-мелодии меняется
    // (B-12.2 добавил пунктир и триоль), а инвариант — «все ноты доехали».
    check('демо: все ноты куплета и припева сохранены',
      demoParts[0].rolls['1'].length === demo.parts[0].rolls['1'].length &&
      demoParts[0].rolls['2'].length === demo.parts[0].rolls['2'].length,
      JSON.stringify([demoParts[0].rolls['1'].length, demoParts[0].rolls['2'].length]));
    w.eval('togglePartsMode(true)');
    const demoChips = demo.parts[0].rolls['1'].length * 2 + demo.parts[0].rolls['2'].length;
    check(`демо: чипов = ${demoChips} (куплет ×2 повтора + припев)`,
      w.document.getElementById('partsTrack').querySelectorAll('.pt-svg rect:not(.pt-cursor)').length === demoChips,
      String(w.document.getElementById('partsTrack').querySelectorAll('.pt-svg rect:not(.pt-cursor)').length));
    w.eval('togglePartsMode(false)');

    // ---------- 7. Партии не влияют на гармонию ----------
    const songWithParts = baseSong({
      parts: [{ id: 1, name: 'Соло', instrument: 'guitar', tuning: null, visible: true,
        rolls: { '1': [{ start: 0, dur: 1, string: 5, fret: 8 }] } }],
    });
    const songNoParts = baseSong();
    loadSong(songWithParts);
    const keyWith = w.eval('detectKeyFromChords()');
    // Сетку редактора строит render(); без него контейнер пуст (экран
    // редактора ещё не разложен).
    w.eval('render()');
    const cellsWith = w.document.querySelectorAll('#sectionsContainer .chord-wrapper').length;
    loadSong(songNoParts);
    const keyWithout = w.eval('detectKeyFromChords()');
    w.eval('render()');
    const cellsWithout = w.document.querySelectorAll('#sectionsContainer .chord-wrapper').length;
    check('тональность от партий не меняется', keyWith === keyWithout, `${keyWith} vs ${keyWithout}`);
    check('сетка редактора от партий не меняется', cellsWith === cellsWithout && cellsWith > 0, `${cellsWith} vs ${cellsWithout}`);

    // ---------- 8. Жизненный цикл секции ----------
    loadSong(songWithParts);
    w.eval('cloneSection(1)');
    const afterClone = JSON.parse(w.eval('JSON.stringify({ ids: sections.map(s => s.id), rolls: songParts[0].rolls })'));
    const clonedId = afterClone.ids[1];
    check('клон секции унёс копию рулона', Array.isArray(afterClone.rolls[String(clonedId)]) && afterClone.rolls[String(clonedId)].length === 1,
      JSON.stringify(afterClone));
    check('рулоны клона и оригинала — разные массивы',
      w.eval(`songParts[0].rolls[${JSON.stringify(String(clonedId))}] !== songParts[0].rolls['1']`) === true);
    w.eval('removeSection(2)');
    const afterRemove = JSON.parse(w.eval('JSON.stringify(songParts[0].rolls)'));
    check('удаление секции чистит её рулон', !afterRemove['2'], JSON.stringify(afterRemove));

    // ---------- 10. Пустая песня: не белый экран, а выход ----------
    // Партия строится по секциям, поэтому «нет секций» и «нет партии» —
    // разные пустые состояния. До 0.622 пустая песня после создания
    // партии показывала пустой экран без единой подсказки.
    const emptySong = baseSong({ sections: [], parts: [] });
    loadSong(emptySong);
    w.eval('render(); togglePartsMode(true)');
    const emptyBox = w.document.getElementById('partsEmpty');
    check('пустая песня: пустое состояние вместо белого экрана', emptyBox.hidden === false);
    check('пустая песня: текст говорит про секции',
      w.document.getElementById('partsEmptyText').textContent.includes('нет секций'),
      w.document.getElementById('partsEmptyText').textContent);
    check('пустая песня: обе кнопки предложены',
      w.document.getElementById('ptAddSection').hidden === false &&
      w.document.getElementById('ptCreatePart').hidden === false);
    const addBar = w.document.querySelector('.add-section-bar');
    const addLabel = w.document.querySelector('.add-section-label');
    check('окно партий: панель «Секции:» доступна',
      w.getComputedStyle(addBar).display !== 'none' && w.getComputedStyle(addLabel).display !== 'none',
      `${w.getComputedStyle(addBar).display} / ${w.getComputedStyle(addLabel).display}`);
    w.eval('togglePartsMode(false)');
    check('редактор: метка «Секции:» скрыта (панель как была)',
      w.getComputedStyle(addLabel).display === 'none' && w.getComputedStyle(addBar).display !== 'none',
      `${w.getComputedStyle(addLabel).display} / ${w.getComputedStyle(addBar).display}`);
    w.eval('togglePartsMode(true)');

    w.document.getElementById('ptCreatePart').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    w.eval('render()');
    check('пустая песня: партия создана, пустой экран не вернулся',
      w.eval('songParts.length') === 1 && emptyBox.hidden === false &&
      w.document.getElementById('ptCreatePart').hidden === true,
      JSON.stringify({ parts: w.eval('songParts.length'), empty: emptyBox.hidden }));
    w.document.getElementById('ptAddSection').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    w.eval('render()');
    check('пустая песня: кнопка добавила секцию и станок',
      w.eval('sections.length') === 1 && w.document.querySelectorAll('#partsTrack .pt-section').length === 1 &&
      emptyBox.hidden === true,
      JSON.stringify({ sections: w.eval('sections.length'),
        systems: w.document.querySelectorAll('#partsTrack .pt-section').length }));
    check('пустая песня: курсор сразу в новой секции',
      w.eval('partsCursor && partsCursor.secId === sections[0].id') === true,
      JSON.stringify(w.eval('partsCursor')));
    // Ввод работает без визита в редактор: цифра набирает ноту.
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: '5', bubbles: true }));
    check('пустая песня: ввод цифрой работает сразу',
      w.eval('(songParts[0].rolls[String(sections[0].id)] || []).length') === 1,
      w.eval('JSON.stringify(songParts[0].rolls)'));

    // Панель «Секции:» из окна партий: клик по типу добавляет секцию,
    // а курсор уходит в неё — набирать можно без поиска системы.
    w.document.querySelector('.add-section-btn').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    w.eval('render()');
    check('панель «Секции:» работает из окна партий',
      w.eval('sections.length') === 2 && w.eval('partsCursor.secId === sections[1].id') === true,
      JSON.stringify({ sections: w.eval('sections.length'), cursor: w.eval('partsCursor') }));

    // Удаление всех секций возвращает пустое состояние, а не белый экран.
    w.eval('sections.slice().forEach((s) => removeSection(s.id)); render();');
    check('удаление всех секций: снова пустое состояние с выходом',
      emptyBox.hidden === false && w.eval('sections.length') === 0 &&
      w.document.getElementById('ptAddSection').hidden === false,
      JSON.stringify({ empty: emptyBox.hidden, sections: w.eval('sections.length') }));

    console.log(`\nитого: ${pass} ok, ${fail} FAIL`);
    if (fail) process.exitCode = 1;
  } catch (e) {
    console.error('ОШИБКА:', e && e.stack ? e.stack : e);
    process.exitCode = 1;
  }
});
