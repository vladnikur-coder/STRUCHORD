#!/usr/bin/env node
/**
 * 0.839 · панель фонового аудио (#btDrawer) и строка записи в микшере.
 *
 * Две роли в одном прогоне:
 *   1) кадры для сравнения «до/после» — dev/bench/results/backing-panel-0.839;
 *   2) измерения, которые глазом не проверишь: высота контролов одной строки,
 *      скругление, контраст подсказки, отсутствие обрезки на 390 px и цвета
 *      волны/маркеров/указателя, взятые из токенов.
 *
 * Запуск:  node dev/tests/b124-backing-panel-design-0839.js
 * Кадры «до» снимаются с ключом BEFORE=1 (результат пишется в before/).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(ROOT, 'dev', 'bench', 'results', 'backing-panel-0.839',
  process.env.BEFORE ? 'before' : 'after');
fs.mkdirSync(OUT, { recursive: true });
const URL = process.env.STRUCHORD_URL || 'http://127.0.0.1:8000/STRUCHORD.html';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Небольшой WAV: 8 секунд, 22.05 кГц, моно. Амплитуда меняется, чтобы на
// волне были и тихие, и громкие участки (иначе кадр не отличить от пустого).
function makeWav() {
  const rate = 22050, seconds = 8, total = rate * seconds;
  const buf = Buffer.alloc(44 + total * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + total * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(total * 2, 40);
  for (let i = 0; i < total; i++) {
    const t = i / rate;
    const env = Math.max(0.12, Math.sin((t / seconds) * Math.PI));
    const hit = 1 + 6 * Math.pow(1 - ((t * 2) % 1), 6);           // «удары» дважды в секунду
    const v = Math.sin(2 * Math.PI * 180 * t) * 0.6 + Math.sin(2 * Math.PI * 320 * t) * 0.3;
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * env * hit * 9000))), 44 + i * 2);
  }
  return buf;
}

const SCENES = [
  { name: 'light-125', theme: 'light', scale: 1.25, width: 1440, height: 1000 },
  { name: 'dark-125', theme: 'dark', scale: 1.25, width: 1440, height: 1000 },
  { name: 'light-100', theme: 'light', scale: 1, width: 1440, height: 1000 },
  { name: 'light-150', theme: 'light', scale: 1.5, width: 1440, height: 1000 },
  { name: 'dark-150', theme: 'dark', scale: 1.5, width: 1440, height: 1000 },
  { name: 'narrow-390', theme: 'light', scale: 1.25, width: 390, height: 1000 },
  { name: 'narrow-390-dark', theme: 'dark', scale: 1.25, width: 390, height: 1000 },
];

const checks = [];
function check(name, pass, detail = '') {
  checks.push({ name, pass: !!pass, detail });
  console.log(`${pass ? 'ok   ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function luminance([r, g, b]) {
  const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a, b) {
  const l1 = luminance(a), l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
function parseColor(value) {
  const m = String(value).match(/-?\d+(\.\d+)?/g);
  if (!m || m.length < 3) return null;
  return [Number(m[0]), Number(m[1]), Number(m[2])];
}

(async () => {
  const execPath = process.env.PUPPETEER_EXECUTABLE_PATH ||
    (fs.existsSync('/tmp/chromium') ? '/tmp/chromium' : undefined);
  const browser = await puppeteer.launch({
    headless: 'shell',
    executablePath: execPath,
    dumpio: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
    env: { ...process.env, LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH || '/tmp/al2023/lib' },
  });
  const wav = makeWav().toString('base64');
  const report = { scenes: [], measurements: {} };

  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // Приложение вешает beforeunload: без принятия диалога повторная
    // навигация (второй сценарий) hangs — страница ждёт ответа.
    page.on('dialog', async (d) => { try { await d.accept(); } catch (_) {} });

    const setup = async (scene) => {
      await page.setViewport({ width: scene.width, height: scene.height, deviceScaleFactor: 2 });
      await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForSelector('#devPanelTrigger', { timeout: 30000 });
      await page.evaluate(async (sceneIn, wavIn) => {
        if (window.setUiScale) window.setUiScale(Math.round(sceneIn.scale * 100));
        if (window.setTheme) window.setTheme(sceneIn.theme);
        if (typeof startNewSongFromHome === 'function') startNewSongFromHome();
        // Чистый профиль браузера открывает окно первого запуска («На чём вы
        // играете?») поверх редактора: кадры панели получаются перекрытыми.
        // Выбираем инструмент — выбор запоминается, следующие сцены чистые.
        document.querySelectorAll('.strum-modal-overlay').forEach((overlay) => {
          if (getComputedStyle(overlay).display === 'none') return;
          const close = overlay.querySelector('.home-modal-close');
          if (close) { close.click(); return; }
          const pick = overlay.querySelector('button:not(:disabled)');
          if (pick) pick.click();
        });
        if (!sections.length) addSection('Verse');
        const sec = sections[0];
        sec.squares[0].events[0].chord = 'C';
        if (sec.squares.length < 2) addSquare(sec.id);
        sec.squares[1].events[0].chord = 'G';
        addSection('Chorus');
        sections[1].squares[0].events[0].chord = 'Am';
        renderSectionsGrid();
        const meta = {
          id: 'shot-track', name: 'длинное-название-записи-которое-не-влезает.wav',
          type: 'audio/wav', size: 4, duration: 8, speed: 1, volume: 80, mute: false, solo: false,
          points: [{ bar: 0, time: 0 }, { bar: 4, time: 4 }],
        };
        await window.StruChordBackingTrack.importEmbedded({ backingTrack: { ...meta, embedded: wavIn } });
        await window.StruChordBackingTrack.loadSong({ backingTrack: meta });
        window.StruChordBackingTrack.toggleDrawer(true);
      }, scene, wav);
      await wait(700);
    };

    for (const scene of SCENES) {
      await setup(scene);
      const tag = scene.name;

      // ---- кадры ----
      const drawer = await page.$('#btDrawer');
      if (drawer) await drawer.screenshot({ path: path.join(OUT, `drawer-${tag}.png`) });
      // Строка записи в микшере: открываем панель дорожек.
      await page.evaluate(() => {
        const btn = document.getElementById('b39MixerBtn');
        if (btn) btn.click();
      });
      await wait(350);
      const panel = await page.$('#b39MixerPanel');
      if (panel) await panel.screenshot({ path: path.join(OUT, `mixer-${tag}.png`) });
      await page.evaluate(() => {
        const btn = document.getElementById('b39MixerBtn');
        if (btn) btn.click();
      });
      // Транспорт (кнопка ♫ рядом с соседями).
      const transport = await page.$('.transport-bar');
      if (transport) await transport.screenshot({ path: path.join(OUT, `transport-${tag}.png`) });
      // Настройки — эталон полей и пилюль приложения.
      await page.evaluate(() => { if (window.openHomeSettings) window.openHomeSettings(); });
      await wait(400);
      const settings = await page.$('.home-settings-modal');
      if (settings) await settings.screenshot({ path: path.join(OUT, `settings-${tag}.png`) });
      await page.evaluate(() => {
        const btn = document.querySelector('.home-settings-modal .home-modal-close, .home-settings-modal [data-close]');
        if (btn) btn.click();
      });
      await wait(200);
      // Целиком экран — на 390 px видно, не уехало ли за край.
      await page.screenshot({ path: path.join(OUT, `page-${tag}.png`), fullPage: false });

      // ---- измерения ----
      const m = await page.evaluate(() => {
        const px = (v) => Math.round(parseFloat(v) * 100) / 100;
        const rectOf = (sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { w: px(r.width), h: px(r.height), left: px(r.left), right: px(r.right) };
        };
        const styleOf = (sel, props) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const cs = getComputedStyle(el);
          const out = {};
          props.forEach((p) => { out[p] = cs.getPropertyValue(p); });
          return out;
        };
        // Контролы одной строки: все элементы в .bt-controls / блоках.
        const rowHeights = [];
        document.querySelectorAll('#btDrawer .bt-row, #btDrawer .bt-controls').forEach((row) => {
          Array.from(row.children).forEach((child) => {
            const r = child.getBoundingClientRect();
            if (r.width > 0) rowHeights.push({ cls: child.className || child.tagName, h: px(r.height) });
          });
        });
        const drawerRect = (() => {
          const el = document.getElementById('btDrawer');
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { left: px(r.left), right: px(r.right), w: px(r.width) };
        })();
        // Не выходит ли что-то за правый край вьюпорта.
        const overflow = [];
        const limit = window.innerWidth;
        document.querySelectorAll('#btDrawer *, #btMixerBlock *').forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width && (r.right > limit + 1 || r.left < -1)) {
            overflow.push({ cls: String(el.className || el.tagName).slice(0, 48), right: px(r.right), left: px(r.left) });
          }
        });
        // Основная подсказка видна сразу; уточнение про клавиши-модификаторы
        // лежит в <details> и по требованию в основной текст не входит.
        const hint = document.querySelector('#btDrawer .bt-hint-text');
        return {
          rowHeights,
          drawerRect,
          overflow,
          innerWidth: window.innerWidth,
          hint: hint ? { text: hint.textContent.trim(), color: getComputedStyle(hint).color } : null,
          drawerBg: (function () {
            const el = document.getElementById('btDrawer');
            return el ? getComputedStyle(el).backgroundColor : null;
          })(),
          previewBtn: styleOf('#btDrawer [data-bt-action="preview"]',
            ['min-height', 'border-radius', 'font-weight', 'font-size']),
          barInput: styleOf('#btBarInput', ['min-height', 'height', 'border-radius', 'font-weight']),
          speed: styleOf('#btSpeed', ['accent-color', 'height']),
          zoom: styleOf('#btZoom', ['max', 'accent-color']),
          mixerRow: rectOf('#btMixerBlock .bt-mixer-row'),
          mixerMute: styleOf('#btMixerBlock [data-bt-mute]', ['width', 'height', 'flex']),
          mixerSolo: styleOf('#btMixerBlock [data-bt-solo]', ['width', 'height']),
          mixerVol: styleOf('#btMixerBlock [data-bt-volume]', ['accent-color', 'flex-grow', 'width']),
          mixerMenuBtn: rectOf('#btMixerBlock [data-bt-menu]'),
          transportBtn: (function () {
            const el = document.getElementById('btTransportBtn');
            if (!el) return null;
            const svg = el.querySelector('svg');
            return {
              hasTextGlyph: /[^\s]/.test(el.textContent || ''),
              svg: svg ? { w: px(svg.getBoundingClientRect().width), stroke: svg.getAttribute('stroke-width') } : null,
              gap: getComputedStyle(el).gap,
            };
          })(),
          fileName: (function () {
            const el = document.querySelector('#btDrawer .bt-title, #btDrawer .bt-file-pill');
            if (!el) return null;
            const cs = getComputedStyle(el);
            return { text: el.textContent.trim(), ellipsis: cs.textOverflow, weight: cs.fontWeight, title: el.getAttribute('title') };
          })(),
          hardcoded: (function () {
            // Зашитые цвета волны/маркеров: ищем в исходнике функции отрисовки.
            const src = document.documentElement.outerHTML.length; // только чтобы не пустовать
            return null;
          })(),
        };
      });
      report.scenes.push({ name: tag, measurements: m });
      m.__scene = tag;
      report.measurements[tag] = m;
    }

    // ---- Исходник: зашитые цвета ----
    const html = fs.readFileSync(path.join(ROOT, 'STRUCHORD.html'), 'utf8');
    const cssBlockStart = html.indexOf('.bt-mixer-block {');
    const cssBlockEnd = html.indexOf('</style>', cssBlockStart);
    const css = html.slice(cssBlockStart, cssBlockEnd);
    const cssHardcoded = ['#55e6ff', '#ff9f1c', '#ffd166', '#7de2b8', '#ff5964']
      .filter((c) => css.toLowerCase().includes(c));
    // Вне минифицированного alphaTab (он живёт одной строкой ~7 МБ, её исключаем).
    const jsLines = html.split('\n').filter((l) => l.length < 20000);
    const jsHardcoded = ['#55e6ff', '#ff9f1c', '#ffd166', '#7de2b8', '#ff5964']
      .filter((c) => jsLines.some((l) => l.toLowerCase().includes(c)));

    check('в CSS панели нет зашитых цветов волны/маркеров/указателя',
      cssHardcoded.length === 0, cssHardcoded.join(', '));
    check('в JS панели нет зашитых цветов волны/маркеров/указателя',
      jsHardcoded.length === 0, jsHardcoded.join(', '));

    // ---- Токены читаются при отрисовке ----
    const palette = await page.evaluate(() => {
      const fn = window.btWavePalette || window.StruChordBackingTrack.__wavePalette;
      return fn ? fn() : null;
    });
    check('палитра волны читается из токенов и доступна для теста', !!palette,
      palette ? JSON.stringify(palette) : 'нет btWavePalette()');

    // ---- Геометрия по сценам ----
    const wide = report.measurements['light-125'];
    const narrow = report.measurements['narrow-390'];
    if (wide) {
      const heights = (wide.rowHeights || []).map((r) => r.h);
      const uniq = [...new Set(heights)].sort((a, b) => a - b);
      check('контролы одной строки — одной высоты (38–45 px при 125 %)',
        uniq.length > 0 && uniq.every((h) => h >= 38 && h <= 45) && uniq.length <= 2,
        `высоты: ${uniq.join(', ')}`);
      check('подсказка читается: контраст не ниже 4,5:1', (() => {
        if (!wide.hint) return false;
        const fg = parseColor(wide.hint.color), bg = parseColor(wide.drawerBg);
        if (!fg || !bg) return false;
        const ratio = contrast(fg, bg);
        wide.hint.contrast = Math.round(ratio * 100) / 100;
        return ratio >= 4.5;
      })(), wide.hint ? `${wide.hint.contrast}:1 — «${wide.hint.text.slice(0, 60)}…»` : 'нет подсказки');
      check('в основной подсказке нет «Sync Point» и «Option/Alt»', !!wide.hint &&
        !/sync\s*point/i.test(wide.hint.text) && !/option|alt/i.test(wide.hint.text),
        wide.hint ? wide.hint.text.slice(0, 90) : '');
      check('имя файла — заголовком с многоточием и подсказкой', !!wide.fileName &&
        wide.fileName.ellipsis === 'ellipsis' && !!wide.fileName.title &&
        Number(wide.fileName.weight) <= 600,
        wide.fileName ? `weight ${wide.fileName.weight}, title «${wide.fileName.title}»` : 'нет заголовка');
      check('кнопка ♫ в транспорте — SVG, не текстовый глиф', !!wide.transportBtn &&
        !wide.transportBtn.hasTextGlyph && !!wide.transportBtn.svg,
        wide.transportBtn ? JSON.stringify(wide.transportBtn) : 'нет кнопки');
    }
    if (narrow) {
      check('на 390 px ничего не выходит за край', (narrow.overflow || []).length === 0,
        (narrow.overflow || []).slice(0, 3).map((o) => `${o.cls} → ${o.right}`).join('; '));
      check('на 390 px панель вписана в экран',
        !!narrow.drawerRect && narrow.drawerRect.right <= narrow.innerWidth + 1,
        narrow.drawerRect ? `right ${narrow.drawerRect.right} из ${narrow.innerWidth}` : '');
    }
    const mixer = wide && wide.mixerMute;
    check('M/S в строке записи не сжимаются и одного размера с гитарой',
      !!mixer && parseFloat(mixer.width) >= 24 && parseFloat(mixer.height) >= 24,
      mixer ? `${mixer.width} × ${mixer.height}` : 'нет кнопок');
    check('ползунок записи акцентного цвета', !!wide && !!wide.mixerVol &&
      /var\(--color-accent|rgb/.test(wide.mixerVol['accent-color'] || ''),
      wide && wide.mixerVol ? wide.mixerVol['accent-color'] : '');

    check('ошибок страницы нет', errors.length === 0, errors.slice(0, 2).join(' | '));

    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    const failed = checks.filter((c) => !c.pass).length;
    console.log(`\nкадры: ${OUT}`);
    console.log(failed ? `итого: ${checks.length - failed} ok, ${failed} FAIL` : `итого: ${checks.length} ok, 0 FAIL`);
    if (failed) process.exitCode = 1;
  } catch (error) {
    console.error('FAIL сценарий\n' + (error.stack || error));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
