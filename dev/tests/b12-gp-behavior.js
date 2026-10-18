#!/usr/bin/env node
/*
 * b12-gp-behavior.js — B-12.11, план владельца этап 3 «Поведение как в GP».
 *
 * Проверяем: режима «Выбор» нет (ввод всегда жив); Ctrl+1..4 — голос курсора,
 * Alt+1..4 — ноту в голос, Ctrl+M — мультиголос; L — лига (слияние нот);
 * Tab — фокус стана, цифра на стане — струна; Ctrl+G — переход по номеру
 * такта; F2 прячет палитру; Ctrl+Shift+C — буфер по всем дорожкам,
 * Ctrl+Shift+V — спец-вставка по дорожкам; горячие клавиши молчат в
 * текстовом поле.
 */
const fs = require('fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(__dirname + '/../../STRUCHORD.html', 'utf8');
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://localhost/',
  beforeParse(win) {
    win.HTMLCanvasElement.prototype.getContext = () => ({ font: '', measureText: () => ({ width: 10 }),
      clearRect(){}, beginPath(){}, arc(){}, fill(){}, stroke(){}, moveTo(){}, lineTo(){}, closePath(){},
      save(){}, restore(){}, translate(){}, rotate(){}, fillText(){}, strokeText(){}, setTransform(){}, scale(){},
      createLinearGradient: () => ({ addColorStop(){} }) });
  },
});
const w = dom.window;
w.AudioContext = w.webkitAudioContext = function () {
  return { currentTime: 0, state: 'running', resume() {}, sampleRate: 44100,
    createBuffer: (c, len) => ({ getChannelData: () => new Float32Array(len) }) };
};

const song = {
  schemaVersion: 5, metadata: { artist: 'A', title: 'GP-behavior' }, bpm: 96, globalKey: 'C', keyMode: 'manual',
  globalTimeSig: '4/4', tuning: 'e-std', tuningNotes: null, notes: '',
  sections: [
    { id: 1, type: 'Verse', customName: null, key: null, shift: null, timeSig: null, bpm: null, repeat: 1, strumPattern: null,
      squares: [{ id: 11, repeat: 1, customBeats: 4, events: [{ chord: 'C', span: 4, timeSig: null, strumPattern: null }] }] },
    { id: 2, type: 'Chorus', customName: null, key: null, shift: null, timeSig: null, bpm: null, repeat: 1, strumPattern: null,
      squares: [{ id: 12, repeat: 1, customBeats: 4, events: [{ chord: 'G', span: 4, timeSig: null, strumPattern: null }] }] },
  ],
  parts: [
    { id: 7, name: 'Гитара', instrument: 'guitar', tuning: null, visible: true,
      rolls: { '1': [
        { start: 0, dur: 1, string: 5, fret: 3 },
        { start: 1, dur: 1, string: 5, fret: 3 },
        { start: 2, dur: 1, string: 4, fret: 0 },
      ], '2': [] } },
    { id: 8, name: 'Бас', instrument: 'bass', tuning: null, visible: true,
      rolls: { '1': [{ start: 0, dur: 2, string: 3, fret: 1 }], '2': [] } },
  ],
  nextId: 50, rhythmPool: null, userFingerings: [], preferredFingerings: [], date: '',
};

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('ok   ' + name); }
  else { fail++; console.error('FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
function key(keyName, opts = {}) {
  const ev = new w.KeyboardEvent('keydown', { key: keyName, bubbles: true, cancelable: true, ...opts });
  w.document.dispatchEvent(ev);
  return ev;
}

w.addEventListener('load', () => {
  try {
    w.localStorage.setItem('struchord_songs', JSON.stringify([song]));
    w.loadSong(0);
    w.eval('render()');
    w.confirm = () => true;
    w.prompt = () => '2';
    w.eval('togglePartsMode(true)');
    w.eval("setPartsScoreEngine('native')");
    w.eval('selectPartTrack(7)');
    w.eval('setPartsCursorString(1, 0, 5, 0)');
    const roll1 = () => w.eval("songParts[0].rolls[String(sections[0].id)]");
    const roll2 = () => w.eval("songParts[0].rolls[String(sections[1].id)] || []");

    // П.1: режима «Выбор» нет — ввод жив без включения чего-либо.
    check('ввод жив сразу (partsInputEnabled)', w.eval('partsInputEnabled()') === true);
    check('setPartsEditMode — пустой алиас совместимости', w.eval('setPartsEditMode("select")') === true && w.eval('partsInputEnabled()') === true);

    // П.6: голоса.
    key('2', { code: 'Digit2', ctrlKey: true });
    check('Ctrl+2 — голос курсора 2', w.eval('partsVoice') === 2);
    key('1', { code: 'Digit1', ctrlKey: true });
    check('Ctrl+1 — голос курсора 1', w.eval('partsVoice') === 1);
    key('3', { code: 'Digit3', altKey: true });
    check('Alt+3 — нота под курсором ушла в голос 3', roll1()[0].voice === 3, JSON.stringify(roll1()[0]));
    key('1', { code: 'Digit1', altKey: true });
    check('Alt+1 — нота вернулась в голос 1', (roll1()[0].voice || 1) === 1);
    key('m', { code: 'KeyM', ctrlKey: true });
    check('Ctrl+M — мультиголос включён', w.eval('partsMultivoice') === true);
    key('m', { code: 'KeyM', ctrlKey: true });
    check('Ctrl+M — мультиголос выключен', w.eval('partsMultivoice') === false);

    // П.4: L — лига: две одинаковые ноты подряд сливаются в одну длинную.
    key('l', { code: 'KeyL' });
    check('L — лига слила две ноты в одну (2 вместо 3)', roll1().length === 2 && roll1()[0].dur === 2, JSON.stringify(roll1()));

    // П.2: Tab — фокус стана; цифра на стане выбирает струну.
    key('Tab', { code: 'Tab' });
    check('Tab — курсор на нотном стане', w.eval('partsStaffFocus') === true);
    w.eval('partsCursor.staffPitch = 71'); // высота, достижимая на 2-й струне (открытая)
    key('2', { code: 'Digit2' });
    check('цифра на стане — струна 2 (нота записана)', roll1().some((n) => n.start === 0 && n.string === 4), JSON.stringify(roll1()));
    key('Tab', { code: 'Tab' });
    check('Tab обратно — курсор на табе', w.eval('partsStaffFocus') === false);

    // П.2: Ctrl+G — переход к такту 2 (вторая секция).
    key('g', { code: 'KeyG', ctrlKey: true });
    check('Ctrl+G — курсор во второй секции', w.eval('partsCursor.secId') === 2, JSON.stringify(w.eval('partsCursor')));
    w.eval('setPartsCursorString(1, 0, 5, 0)');

    // П.5: F2 прячет/показывает палитру.
    const pal = w.document.getElementById('partsPalette');
    const wasHidden = pal.hidden;
    key('F2', { code: 'F2' });
    check('F2 переключила палитру', pal.hidden === !wasHidden);
    key('F2', { code: 'F2' });
    check('F2 вернула палитру', pal.hidden === wasHidden);

    // П.3: Ctrl+Shift+C — буфер по всем дорожкам; вырезать у гитары ноту,
    // Ctrl+Shift+V — спец-вставка возвращает её и басу не вредит.
    key('c', { code: 'KeyC', ctrlKey: true, shiftKey: true });
    check('Ctrl+Shift+C — мультибуфер по 2 дорожкам',
      w.eval('partsClipboard && partsClipboard.kind') === 'multi' && w.eval('partsClipboard.perPart.length') === 2,
      JSON.stringify(w.eval('partsClipboard && partsClipboard.kind')));
    w.eval("const r = songParts[0].rolls[String(sections[0].id)]; r.splice(0, r.length)");
    check('ноты гитары убраны вручную', roll1().length === 0 && roll2().length === 0);
    key('v', { code: 'KeyV', ctrlKey: true, shiftKey: true });
    check('Ctrl+Shift+V — спец-вставка вернула гитару', roll1().length === 3, JSON.stringify(roll1()));
    check('бас на месте после спец-вставки', w.eval("songParts[1].rolls[String(sections[0].id)].length") === 1);

    // Критерий этапа: рифф на 4 такта только с клавиатуры, без палитры.
    // Вторая секция пуста: 3 → 5 → 0 → 2 с шагами стрелкой и сменой струны.
    w.eval('setPartsCursorString(sections[1].id, 0, 5, 0)');
    key('3', { code: 'Digit3' });
    key('ArrowRight', { code: 'ArrowRight' });
    key('5', { code: 'Digit5' });
    key('ArrowRight', { code: 'ArrowRight' });
    key('0', { code: 'Digit0' });
    key('ArrowDown', { code: 'ArrowDown' });
    key('ArrowRight', { code: 'ArrowRight' });
    key('2', { code: 'Digit2' });
    check('рифф с клавиатуры: 4 ноты во второй секции', roll2().length === 4, JSON.stringify(roll2()));
    check('последняя нота — струна ниже (ArrowDown)', roll2()[3].string === 4, JSON.stringify(roll2()[3]));

    // П.8: горячие клавиши молчат в текстовом поле.
    const before = roll1().length;
    const input = w.document.getElementById('ptTrackName');
    input.focus();
    const ev = new w.KeyboardEvent('keydown', { key: '7', code: 'Digit7', bubbles: true, cancelable: true });
    input.dispatchEvent(ev);
    check('цифра в текстовом поле не пишет ноту', roll1().length === before);

    console.log(`\nитого: ${pass} ok, ${fail} FAIL`);
    process.exit(fail ? 1 : 0);
  } catch (error) {
    console.error('ОШИБКА:', error && error.stack ? error.stack : error);
    process.exit(1);
  }
});
