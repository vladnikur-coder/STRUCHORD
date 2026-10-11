// B-13: стартовый экран, библиотека, настройки и защита от потери работы.
// Открывает настоящий HTML в headless Chromium; отдельный HTTP-сервер не нужен.
const path = require('path');
const { pathToFileURL } = require('url');
const chromium = require('@sparticuz/chromium').default;
const puppeteer = require('puppeteer-core');

let failed = 0;
let passed = 0;
const check = (label, condition, detail = '') => {
  if (condition) {
    passed++;
    console.log('   ok   ' + label);
  } else {
    failed++;
    console.error('   FAIL ' + label + (detail ? ' — ' + detail : ''));
  }
};

function makeSong(artist, title, date, key, sectionCount) {
  return {
    schemaVersion: 4,
    metadata: { artist, title },
    bpm: 96,
    globalKey: key,
    keyMode: 'manual',
    globalTimeSig: '4/4',
    tuning: 'e-std',
    tuningNotes: null,
    notes: '',
    sections: Array.from({ length: sectionCount }, (_, i) => ({
      id: i + 1,
      type: i === 0 ? 'Verse' : 'Chorus',
      customName: null,
      key: null,
      shift: null,
      timeSig: null,
      bpm: null,
      repeat: 1,
      strumPattern: null,
      squares: [{
        id: (i + 1) * 10,
        repeat: 1,
        customBeats: null,
        events: [{ chord: 'Am', span: 4, timeSig: null, strumPattern: null }],
      }],
    })),
    nextId: sectionCount * 10 + 1,
    rhythmPool: null,
    userFingerings: [],
    preferredFingerings: [],
    date,
  };
}

(async () => {
  process.env.AWS_EXECUTION_ENV ||= 'AWS_Lambda_nodejs22.x';
  const libraryPath = path.resolve(__dirname, '..', '..', 'STRUCHORD.html');
  const browser = await puppeteer.launch({
    args: [...chromium.args, '--no-sandbox'],
    executablePath: await chromium.executablePath(),
    headless: 'shell',
    defaultViewport: { width: 1440, height: 1000 },
    env: {
      ...process.env,
      LD_LIBRARY_PATH: ['/tmp/al2023/lib', '/tmp/libs/al2023/lib', '/tmp/dist/Release/lib', process.env.LD_LIBRARY_PATH]
        .filter(Boolean).join(':'),
    },
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  try {
    await page.goto(pathToFileURL(libraryPath).href + '?b13-test=' + Date.now(), { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => typeof window.refreshHomeLibrary === 'function', { timeout: 15000 });

    console.log('=== Стартовый экран, инструменты и библиотека ===');
    check('обычный запуск показывает приветственный экран и скрывает редактор', await page.evaluate(() =>
      document.documentElement.classList.contains('is-home-screen') &&
      getComputedStyle(document.getElementById('homeScreen')).display !== 'none' &&
      getComputedStyle(document.querySelector('.container')).display === 'none' &&
      !document.getElementById('homeHub').hidden && document.getElementById('homeLibraryView').hidden));
    check('заголовок, настройки и отдельный переключатель темы доступны сверху', await page.evaluate(() =>
      document.querySelector('.home-brand-name')?.textContent === 'STRUCHORD' &&
      document.getElementById('homeSettingsBtn') && document.getElementById('homeThemeBtn')));
    check('четыре главных действия всегда стоят вертикально на широком экране', await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('#homeHub .home-action-btn')];
      const rects = buttons.map((button) => button.getBoundingClientRect());
      return buttons.map((button) => button.textContent.trim().replace(/\s+/g, ' ')).join('|') ===
        'Новая песня|Загрузить песню|Библиотека|Инструменты' && rects.length === 4 &&
        rects.every((rect, index) => index === 0 || rect.top >= rects[index - 1].bottom);
    }));
    const initialTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme') || 'light');
    await page.click('#homeThemeBtn');
    check('быстрая кнопка темы переключает оформление и своё состояние', await page.evaluate((before) => {
      const theme = document.documentElement.getAttribute('data-theme') || 'light';
      return theme !== before && document.getElementById('homeThemeBtn').getAttribute('aria-pressed') === (theme === 'dark' ? 'true' : 'false') &&
        document.getElementById('homeThemeIcon').classList.contains(theme === 'dark' ? 'ti-sun' : 'ti-moon');
    }, initialTheme));

    await page.evaluate(() => {
      window.__tunerMicRequests = 0;
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: () => {
            window.__tunerMicRequests++;
            return Promise.reject(new DOMException('Blocked by B-13 test', 'NotAllowedError'));
          },
        },
      });
    });
    await page.click('#homeToolsBtn');
    await page.waitForSelector('.home-screen-modal');
    check('раздел «Инструменты» открывает список с пунктом «Тюнер»', await page.$eval('.home-tools-list', (el) =>
      el.querySelectorAll('[data-home-tool]').length === 1 && el.textContent.includes('Тюнер')));
    await page.click('[data-home-tool="tuner"]');
    await page.waitForSelector('.tuner-modal');
    await page.waitForFunction(() => window.__tunerMicRequests === 1);
    check('«Тюнер» открывает существующий экран и сразу запускает доступ к микрофону', await page.evaluate(() =>
      !!document.querySelector('.tuner-modal #tunerCloseBtn') && window.__tunerMicRequests === 1));
    await page.click('#tunerCloseBtn');
    await page.waitForFunction(() => !document.querySelector('.tuner-modal'));

    await page.click('#homeLibraryBtn');
    await page.waitForFunction(() => !document.getElementById('homeLibraryView').hidden);
    check('«Библиотека» открывает отдельный экран с кнопкой возврата', await page.evaluate(() =>
      document.getElementById('homeHub').hidden && !document.getElementById('homeLibraryView').hidden &&
      !!document.getElementById('homeLibraryBackBtn')));
    check('пустая библиотека объясняет создание и импорт', await page.$eval('#homeSongList', (el) =>
      /Здесь пока пусто/.test(el.textContent) && /импортируйте/.test(el.textContent)));
    check('пустой запуск не создаёт демо-песню', await page.$eval('#homeLibraryCount', (el) => el.textContent === '0 песен'));

    const seed = [
      makeSong('Кино', 'Группа крови', '2026-10-09T12:00:00.000Z', 'Am', 4),
      makeSong('Сплин', 'Выхода нет', '2026-10-08T12:00:00.000Z', 'C', 3),
    ];
    await page.evaluate((songs) => {
      localStorage.setItem('struchord_songs', JSON.stringify(songs));
      refreshHomeLibrary();
    }, seed);
    check('карточки отсортированы по дате сохранения (новые первыми)', await page.evaluate(() =>
      [...document.querySelectorAll('.home-song-name')].map((el) => el.textContent).join('|') ===
      'Кино - Группа крови|Сплин - Выхода нет'));
    check('карточка показывает тональность, секции и дату', await page.$eval('.home-song-meta', (el) =>
      /Am/.test(el.textContent) && /4 секц/.test(el.textContent) && /2026/.test(el.textContent)));

    await page.$eval('#homeSongSearch', (input) => {
      input.value = 'КИНО'; input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    check('поиск не зависит от регистра и находит исполнителя', await page.evaluate(() =>
      [...document.querySelectorAll('.home-song-name')].map((el) => el.textContent).join('|') === 'Кино - Группа крови'));
    await page.$eval('#homeSongSearch', (input) => {
      input.value = 'Выхода нет'; input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    check('поиск находит название песни', await page.evaluate(() =>
      [...document.querySelectorAll('.home-song-name')].map((el) => el.textContent).join('|') === 'Сплин - Выхода нет'));
    await page.$eval('#homeSongSearch', (input) => {
      input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    console.log('\n=== Настройки ===');
    await page.click('#homeSettingsBtn');
    await page.waitForSelector('.home-settings-modal');
    const schemeCount = await page.$$eval('.home-scheme-choice', (items) => items.length);
    check('панель настроек содержит выбор цветовой схемы', schemeCount >= 2, String(schemeCount));
    const beforeTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme') || 'light');
    await page.click('.home-theme-setting');
    const afterTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme') || 'light');
    check('переключение темы применяется сразу', beforeTheme !== afterTheme, beforeTheme + ' → ' + afterTheme);
    const beforeScheme = await page.evaluate(() => document.documentElement.getAttribute('data-scheme') || '');
    const nextScheme = await page.evaluate(() => {
      const current = document.documentElement.getAttribute('data-scheme') || '';
      const next = [...document.querySelectorAll('.home-scheme-choice')].find((button) => button.dataset.homeSchemeId !== current);
      return next && next.dataset.homeSchemeId;
    });
    if (nextScheme) await page.click(`.home-scheme-choice[data-home-scheme-id="${nextScheme}"]`);
    const afterScheme = await page.evaluate(() => document.documentElement.getAttribute('data-scheme'));
    check('цветовая схема применяется сразу', !!nextScheme && beforeScheme !== afterScheme, beforeScheme + ' → ' + afterScheme);
    const beforeScale = await page.evaluate(() => currentUiScale());
    await page.click('#homeScalePlus');
    const afterScale = await page.evaluate(() => currentUiScale());
    check('масштаб меняется шагом 5%', afterScale === Math.min(175, beforeScale + 5), beforeScale + '% → ' + afterScale + '%');
    check('изменённые параметры отражены в контролах', await page.evaluate(() =>
      document.getElementById('homeScaleValue').textContent === currentUiScale() + '%' &&
      document.querySelector('.home-scheme-choice[aria-pressed="true"]')?.dataset.homeSchemeId === (document.documentElement.getAttribute('data-scheme') || '')));
    check('тема, схема и масштаб сохраняются сразу', await page.evaluate(() =>
      localStorage.getItem('struchord-theme') === (document.documentElement.getAttribute('data-theme') || 'light') &&
      localStorage.getItem('struchord-scheme') === (document.documentElement.getAttribute('data-scheme') || '') &&
      Number(localStorage.getItem('struchord-ui-scale')) === currentUiScale()));
    await page.evaluate(() => [...document.querySelectorAll('.home-screen-modal button')]
      .find((button) => button.textContent.trim() === 'Готово').click());
    await page.waitForFunction(() => !document.querySelector('.home-screen-modal'));

    console.log('\n=== Несохранённые изменения ===');
    await page.click('#homeLibraryBackBtn');
    await page.click('#homeNewSongBtn');
    await page.waitForFunction(() => !document.documentElement.classList.contains('is-home-screen'));
    await page.evaluate(() => addSection('Verse'));
    check('пустой редактор после добавления секции считается изменённым', await page.evaluate(() => hasUnsavedChanges()));
    await page.click('#editorHomeBtn');
    await page.waitForSelector('.home-screen-modal');
    check('при выходе доступны «Сохранить / Не сохранять / Остаться»', await page.evaluate(() => {
      const labels = [...document.querySelectorAll('.home-screen-modal button')].map((button) => button.textContent.trim());
      return ['Сохранить', 'Не сохранять', 'Остаться'].every((label) => labels.includes(label));
    }));
    await page.evaluate(() => [...document.querySelectorAll('.home-screen-modal button')]
      .find((button) => button.textContent.trim() === 'Остаться').click());
    check('«Остаться» закрывает диалог и сохраняет редактор', await page.evaluate(() =>
      !document.querySelector('.home-screen-modal') && !document.documentElement.classList.contains('is-home-screen')));
    await page.click('#editorHomeBtn');
    await page.evaluate(() => [...document.querySelectorAll('.home-screen-modal button')]
      .find((button) => button.textContent.trim() === 'Не сохранять').click());
    await page.waitForFunction(() => document.documentElement.classList.contains('is-home-screen'));
    check('«Не сохранять» очищает несохранённую песню и возвращает в библиотеку', await page.evaluate(() =>
      document.documentElement.classList.contains('is-home-screen') && sections.length === 0 &&
      !document.querySelector('.home-screen-modal')));

    console.log('\n=== Создание и сохранение ===');
    await page.click('#homeLibraryBackBtn');
    await page.click('#homeNewSongBtn');
    await page.waitForFunction(() => !document.documentElement.classList.contains('is-home-screen'));
    await page.evaluate(() => addSection('Verse'));
    await page.click('#editorHomeBtn');
    await page.evaluate(() => [...document.querySelectorAll('.home-screen-modal button')]
      .find((button) => button.textContent.trim() === 'Сохранить').click());
    await page.waitForSelector('.home-screen-modal input');
    check('пустое название требует ввода перед сохранением', await page.$eval('.home-screen-modal input', (input) => input.required));
    await page.$eval('.home-screen-modal input', (input) => { input.value = 'Тестовая песня'; });
    await page.evaluate(() => [...document.querySelectorAll('.home-screen-modal button[type="submit"]')][0].click());
    await page.waitForFunction(() => document.documentElement.classList.contains('is-home-screen') && !document.querySelector('.home-screen-modal'));
    check('сохранённая новая песня появляется в библиотеке', await page.evaluate(() => {
      const songs = JSON.parse(localStorage.getItem('struchord_songs') || '[]');
      return songs.some((song) => song.metadata?.title === 'Тестовая песня') &&
        [...document.querySelectorAll('.home-song-name')].some((el) => el.textContent === 'Тестовая песня');
    }));
    check('после перехода уведомление видно на главном экране', await page.$eval('#homeToast', (el) =>
      el.classList.contains('show') && /сохранена/i.test(el.textContent)));

    console.log('\n=== Действия карточки ===');
    await page.evaluate(() => {
      window.__confirmResult = true;
      window.__confirmCalls = [];
      window.confirm = (message) => { window.__confirmCalls.push(message); return window.__confirmResult; };
    });
    const clickCardAction = (name, action) => page.evaluate(({ name, action }) => {
      const card = [...document.querySelectorAll('.home-song-card')]
        .find((candidate) => candidate.querySelector('.home-song-name')?.textContent === name);
      if (!card) throw new Error('Не найдена карточка: ' + name);
      card.querySelector('summary').click();
      const button = card.querySelector(`[data-home-action="${action}"]`);
      if (!button) throw new Error('Не найдено действие: ' + action);
      button.click();
    }, { name, action });

    await clickCardAction('Кино - Группа крови', 'open');
    await page.waitForFunction(() => !document.documentElement.classList.contains('is-home-screen'));
    check('действие «Открыть» загружает песню и её тональность', await page.evaluate(() =>
      document.getElementById('songTitle').value === 'Группа крови' && globalKey === 'Am' && sections.length === 4));
    await page.click('#editorHomeBtn');
    await page.waitForFunction(() => document.documentElement.classList.contains('is-home-screen'));
    check('выход без изменений не показывает лишний диалог', await page.evaluate(() => !document.querySelector('.home-screen-modal')));

    await clickCardAction('Тестовая песня', 'rename');
    await page.waitForSelector('#home-rename-form');
    await page.$$eval('#home-rename-form input', (inputs) => {
      inputs[0].value = 'Студия';
      inputs[1].value = 'Новый трек';
    });
    await page.evaluate(() => [...document.querySelectorAll('.home-screen-modal button')]
      .find((button) => button.textContent.trim() === 'Применить').click());
    check('переименование требует подтверждения и сохраняет исполнителя/название', await page.evaluate(() => {
      const songs = JSON.parse(localStorage.getItem('struchord_songs') || '[]');
      return songs.some((song) => song.metadata?.artist === 'Студия' && song.metadata?.title === 'Новый трек') &&
        window.__confirmCalls.some((message) => /Переименовать/.test(message));
    }));

    await page.evaluate(() => { window.__confirmResult = false; });
    await clickCardAction('Студия - Новый трек', 'duplicate');
    check('отмена подтверждения не создаёт копию', await page.evaluate(() =>
      !JSON.parse(localStorage.getItem('struchord_songs') || '[]').some((song) => song.metadata?.title === 'Новый трек (копия)')));
    await page.evaluate(() => { window.__confirmResult = true; });
    await clickCardAction('Студия - Новый трек', 'duplicate');
    check('дублирование добавляет песню с пометкой «(копия)»', await page.evaluate(() =>
      JSON.parse(localStorage.getItem('struchord_songs') || '[]').some((song) =>
        song.metadata?.artist === 'Студия' && song.metadata?.title === 'Новый трек (копия)')));

    await page.evaluate(() => {
      window.__lastExportBlob = null;
      window.__lastDownloadName = '';
      URL.createObjectURL = (blob) => { window.__lastExportBlob = blob; return 'blob:b13-export'; };
      URL.revokeObjectURL = () => {};
      HTMLAnchorElement.prototype.click = function () { window.__lastDownloadName = this.download; };
    });
    await clickCardAction('Студия - Новый трек (копия)', 'export');
    check('экспорт создаёт .struchord.json с содержимым песни', await page.evaluate(async () => {
      if (!window.__lastExportBlob || !window.__lastDownloadName.endsWith('.struchord.json')) return false;
      const exported = JSON.parse(await window.__lastExportBlob.text());
      return exported.metadata?.title === 'Новый трек (копия)';
    }));

    await page.evaluate(() => { window.__confirmResult = false; });
    await clickCardAction('Студия - Новый трек (копия)', 'delete');
    check('отмена удаления оставляет песню в библиотеке', await page.evaluate(() =>
      JSON.parse(localStorage.getItem('struchord_songs') || '[]').some((song) => song.metadata?.title === 'Новый трек (копия)')));
    await page.evaluate(() => { window.__confirmResult = true; });
    await clickCardAction('Студия - Новый трек (копия)', 'delete');
    check('подтверждённое удаление убирает песню', await page.evaluate(() =>
      !JSON.parse(localStorage.getItem('struchord_songs') || '[]').some((song) => song.metadata?.title === 'Новый трек (копия)')));

    console.log('\n=== Замена версии и импорт ===');
    const sourceCountBeforeSave = await page.evaluate(() => JSON.parse(localStorage.getItem('struchord_songs') || '[]').length);
    await clickCardAction('Кино - Группа крови', 'open');
    await page.waitForFunction(() => !document.documentElement.classList.contains('is-home-screen'));
    await page.$eval('#notesArea', (input) => { input.value = 'Изменённые заметки'; });
    await page.$eval('#songTitle', (input) => { input.value = 'Группа крови — новая версия'; });
    await page.click('#editorHomeBtn');
    await page.waitForSelector('.home-screen-modal');
    await page.evaluate(() => { window.__confirmResult = false; window.__confirmCalls = []; });
    await page.evaluate(() => [...document.querySelectorAll('.home-screen-modal button')]
      .find((button) => button.textContent.trim() === 'Сохранить').click());
    await page.waitForFunction(() => document.documentElement.classList.contains('is-home-screen') && !document.querySelector('.home-screen-modal'));
    check('сохранение переименованной песни заменяет исходную запись и удаляет старую версию', await page.evaluate((count) => {
      const songs = JSON.parse(localStorage.getItem('struchord_songs') || '[]');
      const updated = songs.filter((song) => song.metadata?.artist === 'Кино' && song.metadata?.title === 'Группа крови — новая версия');
      return songs.length === count && !songs.some((song) => song.metadata?.artist === 'Кино' && song.metadata?.title === 'Группа крови') &&
        updated.length === 1 && updated[0].notes === 'Изменённые заметки' &&
        !window.__confirmCalls.some((message) => /Перезаписать/.test(message));
    }, sourceCountBeforeSave));

    await clickCardAction('Кино - Группа крови — новая версия', 'open');
    await page.waitForFunction(() => !document.documentElement.classList.contains('is-home-screen'));
    await page.$eval('#notesArea', (input) => { input.value = 'Повторно изменённые заметки'; });
    const resavedSource = await page.evaluate(() => window.saveCurrentSong());
    check('повторное сохранение обновлённой записи не создаёт копию', resavedSource && await page.evaluate((count) => {
      const songs = JSON.parse(localStorage.getItem('struchord_songs') || '[]');
      const updated = songs.filter((song) => song.metadata?.artist === 'Кино' && song.metadata?.title === 'Группа крови — новая версия');
      return songs.length === count && updated.length === 1 && updated[0].notes === 'Повторно изменённые заметки' &&
        !window.__confirmCalls.some((message) => /Перезаписать/.test(message));
    }, sourceCountBeforeSave));
    await page.$eval('#songArtist', (input) => { input.value = 'Сплин'; });
    await page.$eval('#songTitle', (input) => { input.value = 'Выхода нет'; });
    await page.$eval('#notesArea', (input) => { input.value = 'Конфликт: обновлённая версия'; });
    await page.evaluate(() => { window.__confirmResult = false; window.__confirmCalls = []; });
    const refusedConflictSave = await page.evaluate(() => window.saveCurrentSong());
    check('переименование в имя другой записи сначала требует подтверждения и сохраняет обе песни при отказе', refusedConflictSave === false && await page.evaluate((count) => {
      const songs = JSON.parse(localStorage.getItem('struchord_songs') || '[]');
      return songs.length === count &&
        songs.some((song) => song.metadata?.artist === 'Кино' && song.metadata?.title === 'Группа крови — новая версия') &&
        songs.find((song) => song.metadata?.artist === 'Сплин' && song.metadata?.title === 'Выхода нет')?.notes !== 'Конфликт: обновлённая версия' &&
        window.__confirmCalls.some((message) => /Кино - Группа крови/.test(message) && /Сплин - Выхода нет/.test(message));
    }, sourceCountBeforeSave));
    await page.evaluate(() => { window.__confirmResult = true; window.__confirmCalls = []; });
    const confirmedConflictSave = await page.evaluate(() => window.saveCurrentSong());
    check('подтверждённый конфликт заменяет целевую песню и удаляет исходную без дубликатов', confirmedConflictSave && await page.evaluate((count) => {
      const songs = JSON.parse(localStorage.getItem('struchord_songs') || '[]');
      const target = songs.filter((song) => song.metadata?.artist === 'Сплин' && song.metadata?.title === 'Выхода нет');
      return songs.length === count - 1 &&
        !songs.some((song) => song.metadata?.artist === 'Кино' && song.metadata?.title === 'Группа крови — новая версия') &&
        target.length === 1 && target[0].notes === 'Конфликт: обновлённая версия' &&
        window.__confirmCalls.some((message) => /исходная запись/i.test(message));
    }, sourceCountBeforeSave));
    await page.click('#editorHomeBtn');
    await page.waitForFunction(() => document.documentElement.classList.contains('is-home-screen'));

    await page.click('#homeLibraryBackBtn');
    await page.click('#homeNewSongBtn');
    await page.waitForFunction(() => !document.documentElement.classList.contains('is-home-screen'));
    const duplicateSave = await page.evaluate(() => {
      document.getElementById('songArtist').value = 'Сплин';
      document.getElementById('songTitle').value = 'Выхода нет';
      addSection('Verse');
      window.__confirmResult = false;
      window.__confirmCalls = [];
      return window.saveCurrentSong();
    });
    check('новая песня с чужим совпадающим именем по-прежнему требует подтверждения', duplicateSave === false && await page.evaluate((count) => {
      const songs = JSON.parse(localStorage.getItem('struchord_songs') || '[]');
      return songs.length === count - 1 && window.__confirmCalls.some((message) => /Перезаписать/.test(message)) &&
        songs.find((song) => song.metadata?.artist === 'Сплин' && song.metadata?.title === 'Выхода нет')?.notes === 'Конфликт: обновлённая версия';
    }, sourceCountBeforeSave));
    await page.click('#editorHomeBtn');
    await page.waitForSelector('.home-screen-modal');
    await page.evaluate(() => [...document.querySelectorAll('.home-screen-modal button')]
      .find((button) => button.textContent.trim() === 'Не сохранять').click());
    await page.waitForFunction(() => document.documentElement.classList.contains('is-home-screen'));

    const beforeImportCount = await page.evaluate(() => JSON.parse(localStorage.getItem('struchord_songs') || '[]').length);
    const imported = makeSong('Импорт', 'Временная работа', '2026-10-10T13:00:00.000Z', 'Dm', 2);
    await page.evaluate((song) => {
      const file = new File([JSON.stringify(song)], 'temporary.struchord.json', { type: 'application/json' });
      importSong(file);
    }, imported);
    await page.waitForFunction(() => !document.documentElement.classList.contains('is-home-screen') &&
      document.getElementById('songTitle').value === 'Временная работа', { timeout: 10000 });
    check('импорт не добавляет файл в библиотеку автоматически', await page.evaluate((count) =>
      JSON.parse(localStorage.getItem('struchord_songs') || '[]').length === count && hasUnsavedChanges(), beforeImportCount));
    await page.click('#editorHomeBtn');
    await page.waitForSelector('.home-screen-modal');
    check('импортированная работа предлагает решить её судьбу', await page.evaluate(() =>
      ['Сохранить', 'Не сохранять', 'Остаться'].every((label) =>
        [...document.querySelectorAll('.home-screen-modal button')].some((button) => button.textContent.trim() === label))));
    await page.evaluate(() => [...document.querySelectorAll('.home-screen-modal button')]
      .find((button) => button.textContent.trim() === 'Остаться').click());
    await page.click('#editorHomeBtn');
    await page.evaluate(() => [...document.querySelectorAll('.home-screen-modal button')]
      .find((button) => button.textContent.trim() === 'Не сохранять').click());
    await page.waitForFunction(() => document.documentElement.classList.contains('is-home-screen'));
    check('отказ от импортированной работы не сохраняет её в библиотеку', await page.evaluate((count) =>
      JSON.parse(localStorage.getItem('struchord_songs') || '[]').length === count, beforeImportCount));

    await page.click('#homeLibraryBackBtn');
    await page.evaluate(() => {
      while (currentUiScale() < UI_SCALE_MAX) stepUiScale(1);
    });
    await page.setViewport({ width: 320, height: 812 });
    const mobileLayout = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('#homeHub .home-action-btn')];
      const rects = buttons.map((button) => button.getBoundingClientRect());
      return {
        ok: rects.length === 4 && rects.every((rect, index) => index === 0 || rect.top >= rects[index - 1].bottom) &&
          document.documentElement.scrollWidth <= document.documentElement.clientWidth &&
          document.getElementById('homeSettingsBtn').textContent.includes('Настройки') &&
          document.getElementById('homeSettingsBtn').getBoundingClientRect().right <= window.innerWidth,
        count: rects.length,
        tops: rects.map((rect) => Math.round(rect.top)),
        viewport: window.innerWidth,
        pageWidth: document.documentElement.scrollWidth,
        settingsRight: Math.round(document.getElementById('homeSettingsBtn').getBoundingClientRect().right),
        bodyWidth: document.body.getBoundingClientRect().width,
        bodyScroll: document.body.scrollWidth,
        header: document.querySelector('.home-header').getBoundingClientRect().toJSON(),
        headerChildren: [...document.querySelector('.home-header').children].map((el) => ({ name: el.className, rect: el.getBoundingClientRect().toJSON() })),
        overflow: [...document.querySelectorAll('body *')].map((el) => ({ id: el.id, cls: typeof el.className === 'string' ? el.className : '', rect: el.getBoundingClientRect().toJSON() })).filter((item) => item.rect.right > window.innerWidth + 1 && item.rect.width > 0).slice(0, 8),
      };
    });
    check('на узком мобильном экране все четыре действия остаются вертикальными и без горизонтального скролла', mobileLayout.ok, JSON.stringify(mobileLayout));
    await page.click('#homeSettingsBtn');
    await page.waitForSelector('.home-settings-modal');
    check('панель настроек остаётся доступной на мобильном при максимальном масштабе', await page.evaluate(() =>
      document.documentElement.scrollWidth <= document.documentElement.clientWidth &&
      document.querySelector('.home-settings-modal').getBoundingClientRect().right <= window.innerWidth));
    await page.evaluate(() => [...document.querySelectorAll('.home-screen-modal button')]
      .find((button) => button.textContent.trim() === 'Готово').click());
    await page.waitForFunction(() => !document.querySelector('.home-screen-modal'));
    await page.click('#homeLibraryBtn');
    await page.waitForFunction(() => !document.getElementById('homeLibraryView').hidden);
    check('отдельный экран библиотеки не переполняет мобильную ширину при максимальном масштабе', await page.evaluate(() =>
      document.documentElement.scrollWidth <= document.documentElement.clientWidth &&
      document.querySelector('.home-library-card').getBoundingClientRect().right <= window.innerWidth));

    check('в браузерной консоли нет ошибок приложения', pageErrors.length === 0, pageErrors.join(' | '));
  } finally {
    await browser.close();
  }
  console.log(`\n${failed ? `${failed} FAIL` : 'ALL OK'} — ${passed} проверок B-13.`);
  process.exitCode = failed ? 1 : 0;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
