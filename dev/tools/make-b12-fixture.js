// Сборка демо-песни для B-12.1 (фикстура для приёмки и тестов).
// Мелодия — простая диатоническая линия в открытой позиции; единицы
// start/dur — доли размера секции (4/4: 1 = четверть). В куплете есть
// пунктирная четверть и триоль восьмых: знаки нот должны быть видны на
// табулатуре сразу после импорта файла (B-12.2).
const fs = require('fs');
const path = require('path');

const str = { E2: 0, A2: 1, D3: 2, G3: 3, B3: 4, E4: 5 };
const note = (s, fret) => ({ s, fret });

const T8 = 1 / 3; // триоль восьмых: три ноты на одну четверть
const verseMelody = [
  // такт 1 (C)
  [0, 1, 4, 1], [1, 1, 5, 0], [2, 2, 5, 3],
  // такт 2 (G)
  [4, 1, 4, 0], [5, 1, 4, 3], [6, 2, 5, 3],
  // такт 3 (Am): пунктирная четверть + восьмая
  [8, 1.5, 3, 2, { dots: 1 }], [9.5, 0.5, 4, 1],
  // такт 4 (F): триоль восьмых
  [12, T8, 5, 1, { triplet: true }],
  [12 + T8, T8, 5, 5, { triplet: true }],
  [12 + 2 * T8, T8, 5, 8, { triplet: true }],
];
const chorusMelody = [
  // такт 1 (F)
  [0, 2, 5, 5], [2, 2, 5, 8],
  // такт 2 (G)
  [4, 1, 5, 7], [5, 1, 5, 3], [6, 2, 4, 3],
  // такт 3 (C)
  [8, 1, 5, 8], [9, 1, 5, 3], [10, 1, 5, 0], [11, 1, 4, 1],
  // такт 4 (C)
  [12, 2, 5, 0], [14, 2, 4, 1],
];

const rollsFrom = (list) =>
  list.map(([start, dur, s, fret, marks]) => ({
    start: Math.round(start * 1e6) / 1e6,
    dur: Math.round(dur * 1e6) / 1e6,
    string: s,
    fret,
    ...(marks || {}),
  }));

const square = (id, chord) => ({
  id,
  repeat: 1,
  customBeats: 4,
  events: [{ chord, span: 4, timeSig: null, strumPattern: null }],
});

const song = {
  schemaVersion: 5,
  metadata: { artist: 'STRUCHORD', title: 'Демо партии (B-12.1)' },
  bpm: 96,
  globalKey: 'C',
  keyMode: 'manual',
  globalTimeSig: '4/4',
  tuning: 'e-std',
  tuningNotes: null,
  notes: 'Демо-файл кирпича B-12.1: показывает слой партий (табы) и его звук. Ввод нот появится в B-12.2.',
  sections: [
    {
      id: 1,
      type: 'Verse',
      customName: null,
      key: null,
      shift: null,
      timeSig: null,
      bpm: null,
      repeat: 2,
      strumPattern: null,
      squares: [square(11, 'C'), square(12, 'G'), square(13, 'Am'), square(14, 'F')],
    },
    {
      id: 2,
      type: 'Chorus',
      customName: null,
      key: null,
      shift: null,
      timeSig: null,
      bpm: null,
      repeat: 1,
      strumPattern: null,
      squares: [square(21, 'F'), square(22, 'G'), square(23, 'C'), square(24, 'C')],
    },
  ],
  parts: [
    {
      id: 101,
      name: 'Соло-гитара',
      instrument: 'guitar',
      tuning: null,
      visible: true,
      rolls: {
        '1': rollsFrom(verseMelody),
        '2': rollsFrom(chorusMelody),
      },
    },
  ],
  nextId: 200,
  rhythmPool: null,
  userFingerings: [],
  preferredFingerings: [],
  date: '2026-10-12',
};

const out = path.join(__dirname, '..', 'fixtures', 'b12-parts-demo.struchord');
fs.writeFileSync(out, JSON.stringify(song, null, 2) + '\n');
console.log('written', out, fs.statSync(out).size, 'bytes');
console.log('нот в куплете:', verseMelody.length, 'в припеве:', chorusMelody.length);
