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

    console.log('=== Главный экран и библиотека ===');
    check('обычный запуск показывает главный экран', await page.evaluate(() =>
      document.documentElement.classList.contains('is-home-screen') &&
      getComputedStyle(document.getElementById('homeScreen')).display !== 'none' &&
      getComputedStyle(document.querySelector('.container')).display === 'none'));
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

    console.log('\n=== Перезапись и импорт ===');
    await clickCardAction('Кино - Группа крови', 'open');
    await page.waitForFunction(() => !document.documentElement.classList.contains('is-home-screen'));
    await page.$eval('#notesArea', (input) => { input.value = 'Изменённые заметки'; });
    await page.click('#editorHomeBtn');
    await page.waitForSelector('.home-screen-modal');
    await page.evaluate(() => { window.__confirmResult = false; });
    await page.evaluate(() => [...document.querySelectorAll('.home-screen-modal button')]
      .find((button) => button.textContent.trim() === 'Сохранить').click());
    check('совпадающее имя просит подтверждение перезаписи', await page.evaluate(() =>
      !!document.querySelector('.home-screen-modal') && /Перезаписать/.test(window.__confirmCalls.at(-1) || '')));
    await page.evaluate(() => { window.__confirmResult = true; });
    await page.evaluate(() => [...document.querySelectorAll('.home-screen-modal button')]
      .find((button) => button.textContent.trim() === 'Сохранить').click());
    await page.waitForFunction(() => document.documentElement.classList.contains('is-home-screen') && !document.querySelector('.home-screen-modal'));
    check('подтверждённая перезапись обновляет существующую запись', await page.evaluate(() => {
      const songs = JSON.parse(localStorage.getItem('struchord_songs') || '[]');
      return songs.filter((song) => song.metadata?.artist === 'Кино' && song.metadata?.title === 'Группа крови').length === 1 &&
        songs.find((song) => song.metadata?.artist === 'Кино')?.notes === 'Изменённые заметки';
    }));

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
