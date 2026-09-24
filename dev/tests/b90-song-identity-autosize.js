// B-90 (2026-09-22): поля «Исполнитель — Название» подстраиваются под
// фактическую длину текста.
//
// Постановка (ROADMAP): «вид по умолчанию прежний, но при вводе текста
// поля подстраиваются под фактическую длину текста». Польза: длинные
// имена песен не обрезаются и не ломают шапку.
//
// НАЙДЕННАЯ ПРИЧИНА. Подгонка `fitSongArtistField` в коде была с 0.289,
// но ВСЕ её вызовы-слушатели жили в `attachTimelineSongBar`, а тот
// зовётся только из ветки `if (timelineMode)`. В обычном режиме
// редактора слушателей не появлялось вовсе: замер в Chrome показал, что
// после ввода 14 символов ширина поля оставалась стартовыми 276px, а
// свойство --identity-field-width не выставлялось ни разу. Текст
// «Дурак и молния» на экране обрезался до «ак и молния».
//
// Исправление: `attachEditorSongIdentityAutosize()` вешает подгонку на
// поля редактора при старте приложения.
//
// Рамки: программные присваивания (loadSong/clearAll) события `input` не
// шлют — там подгонка вызывается явно, и эти вызовы в коде уже стояли;
// сьют сторожит, что они на месте.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const file = process.argv[2] || __dirname + '/../../STRUCHORD.html';
const html = fs.readFileSync(file, 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://localhost/',
  beforeParse(w) {
    w.HTMLCanvasElement.prototype.getContext = () => ({
      font: '',
      // Ширина пропорциональна длине строки: jsdom не умеет измерять
      // текст, а нам важно ОТНОШЕНИЕ «длиннее текст — шире поле».
      measureText: (t) => ({ width: String(t || '').length * 10 }),
      clearRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
      moveTo() {}, lineTo() {}, closePath() {}, save() {}, restore() {},
      translate() {}, rotate() {}, fillText() {}, strokeText() {},
      setTransform() {}, scale() {},
      createLinearGradient: () => ({ addColorStop() {} }),
    });
  },
});
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function () {
  return { currentTime: 0, state: 'running', resume() {} };
};
w.confirm = () => true;

let bad = 0;
const ok = (name, cond, extra) => {
  console.log(`   ${cond ? 'ok  ' : 'FAIL'} ${name}${!cond && extra !== undefined ? ' — ' + extra : ''}`);
  if (!cond) bad++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const px = (el) => parseFloat(el.style.getPropertyValue('--identity-field-width')) || 0;

w.addEventListener('load', async () => {
  const d = w.document;
  const artist = d.getElementById('songArtist');
  const title = d.getElementById('songTitle');
  const type = (el, text) => {
    el.value = text;
    el.dispatchEvent(new w.Event('input', { bubbles: true }));
  };

  console.log('=== 1. Репро: подгонка работает БЕЗ входа в режим ленты ===');
  ok('режим ленты выключен (обычный редактор)', w.eval('!!timelineMode') === false);
  ok('стартовая ширина исполнителя выставлена', px(artist) > 0, String(px(artist)));
  ok('стартовая ширина названия выставлена', px(title) > 0, String(px(title)));

  console.log('=== 2. Поле растёт вместе с текстом ===');
  const empty = px(title);
  type(title, 'Лесник');
  await sleep(20);
  const short = px(title);
  type(title, 'Дурак и молния');
  await sleep(20);
  const long = px(title);
  ok('«Дурак и молния» шире, чем «Лесник»', long > short, `${long} vs ${short}`);
  ok('текст длиннее плейсхолдера — поле шире исходного', long > empty, `${long} vs ${empty}`);

  console.log('=== 3. Поле сжимается обратно ===');
  type(title, 'Ой');
  await sleep(20);
  ok('короткий текст — поле уже длинного', px(title) < long, `${px(title)} vs ${long}`);
  type(title, '');
  await sleep(20);
  ok('пустое поле вернулось к ширине плейсхолдера', Math.abs(px(title) - empty) < 1,
    `${px(title)} vs ${empty}`);

  console.log('=== 4. Оба поля независимы ===');
  const titleBefore = px(title);
  type(artist, 'Король и Шут');
  await sleep(20);
  ok('исполнитель подстроился', px(artist) > 0);
  ok('название чужим вводом не задето', px(title) === titleBefore, `${px(title)} vs ${titleBefore}`);

  console.log('=== 5. Ширина честно следует за длиной строки ===');
  type(title, 'АБВ');
  await sleep(20);
  const w3 = px(title);
  type(title, 'АБВАБВ');
  await sleep(20);
  const w6 = px(title);
  // Ровно вдвое длиннее строка → примерно вдвое шире поле (замер идёт
  // по canvas, у которого в стенде 10px на символ + 2px запаса).
  ok('удвоение длины примерно удваивает ширину', Math.abs((w6 - 2) - (w3 - 2) * 2) < 2,
    `${w3} → ${w6}`);

  console.log('=== 6. Программная загрузка песни тоже подгоняет ===');
  const song = {
    name: 'Дурак и молния', artist: 'Король и Шут',
    metadata: { artist: 'Король и Шут', title: 'Дурак и молния' },
    globalKey: 'C', keyMode: 'manual', globalTimeSig: '4/4', bpm: 120,
    sections: [
      { id: 1, type: 'Verse', customName: null, key: null, shift: null, timeSig: null, bpm: null, repeat: 1,
        strumPattern: null,
        squares: [{ id: 2, repeat: 1, customBeats: null, strumPattern: null,
          events: [{ chord: 'Am', span: 4, timeSig: null, strumPattern: null }] }] },
    ],
    nextId: 10, userFingerings: [], preferredFingerings: [], date: '',
  };
  w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
  w.loadSong(0);
  await sleep(250);
  ok('после загрузки название подставилось', title.value === 'Дурак и молния', title.value);
  ok('ширина названия пересчитана под загруженный текст',
    Math.abs(px(title) - (title.value.length * 10 + 2)) < 2, String(px(title)));
  if (artist.value) {
    ok('ширина исполнителя пересчитана под загруженный текст',
      Math.abs(px(artist) - (artist.value.length * 10 + 2)) < 2, String(px(artist)));
  }

  console.log('=== 7. Шапку не разорвёт: верхний предел остался в CSS ===');
  const rule = html.match(/\.song-identity-field,\s*\n\s*\.song-identity-field:focus\s*\{[^}]*\}/);
  ok('у поля есть max-width (длинный текст не выносит шапку)',
    !!rule && /max-width:\s*min\(/.test(rule[0]));
  ok('у поля есть min-width (пустое поле не схлопывается в точку)',
    !!rule && /min-width:\s*2ch/.test(rule[0]));

  console.log('=== 8. Привязка ставится один раз ===');
  const before = px(title);
  w.eval('attachEditorSongIdentityAutosize(); attachEditorSongIdentityAutosize();');
  type(title, 'Проверка');
  await sleep(20);
  ok('повторная привязка не удваивает подгонку',
    Math.abs(px(title) - ('Проверка'.length * 10 + 2)) < 2, String(px(title)));
  ok('значение поля не испорчено', title.value === 'Проверка', title.value);
  void before;

  console.log(bad ? `FAIL: ${bad}` : 'ALL OK');
  process.exit(bad ? 1 : 0);
});
