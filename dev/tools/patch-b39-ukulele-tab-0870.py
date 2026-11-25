#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""0.870 · B-39 Укулеле, Этап 3, волна 1: домен таб-вставки.

Вставка теперь знает, чьи она струны:
  • гитара (по умолчанию, поле не пишется вовсе) — 6 струн, лады 0..30,
    строй песни;
  • укулеле — 4 струны, лады 0..15, строй дорожки (`uke-high-g` и т.д.).

Данные: необязательные `tabInstrument` / `tabTuning` на квадрате и на ячейке.
Старые песни читаются и сохраняются бит-в-бит — отсутствие полей = гитара.

Редактор, картинка (alphaTab) и звук берут число струн и строй из домена;
чужая вставка на активной дорожке видна, но не редактируется (серая).

Только точные замены с проверкой числа вхождений.
"""
import io
import sys

PATH = 'STRUCHORD.html'


def rep(text, old, new, count=1, label=''):
    n = text.count(old)
    if n != count:
        sys.exit('FAIL %s: expected %d, found %d for %r' % (label, count, n, old[:110]))
    return text.replace(old, new)


with io.open(PATH, encoding='utf-8') as f:
    html = f.read()
size0 = len(html.encode('utf-8'))

# --------------------------------------------------------------------------
# 1. Домен вставки: разрешение, струны, строй, патч данных.
# --------------------------------------------------------------------------
html = rep(
    html,
    """const TAB_INSERT_MAX_SAVE_FRET = 30;""",
    """const TAB_INSERT_MAX_SAVE_FRET = 30;

// 0.870 (B-39 Этап 3, волна 1): домен таб-вставки.
//
// Вставка принадлежит инструменту: у гитары шесть струн и строй песни, у
// укулеле — четыре струны, лады 0..15 и строй дорожки. Поля `tabInstrument`
// и `tabTuning` необязательные: если их нет, вставка читается и звучит ровно
// как до 0.870 (гитара, строй песни), поэтому старые песни не меняются.
function tabInsertDomainFrom(obj) {
  const uke = !!(obj && obj.tabInstrument === 'ukulele');
  if (!uke) return { instrument: 'guitar', tuning: null, strings: 6, maxFret: TAB_INSERT_MAX_SAVE_FRET };
  const list = typeof PART_UKULELE_TUNINGS !== 'undefined' && Array.isArray(PART_UKULELE_TUNINGS) ? PART_UKULELE_TUNINGS : [];
  const fallback = typeof PART_UKULELE_DEFAULT_TUNING === 'string' ? PART_UKULELE_DEFAULT_TUNING : 'uke-high-g';
  const tuning = list.some((t) => t.id === obj.tabTuning) ? obj.tabTuning : fallback;
  const maxFret = typeof PART_UKULELE_MAX_FRET === 'number' ? PART_UKULELE_MAX_FRET : 15;
  return { instrument: 'ukulele', tuning, strings: 4, maxFret };
}

// Поля, которые надо записать во вставку. Гитара ничего не пишет: файлы
// старых песен и обычных вставок остаются теми же.
function tabInsertDomainPatch(domain) {
  return domain && domain.instrument === 'ukulele'
    ? { tabInstrument: 'ukulele', tabTuning: domain.tuning }
    : {};
}

function tabInsertActiveTrackState() {
  try {
    const T = window.StruChordTracks;
    const st = T && typeof T.state === 'function' ? T.state() : null;
    if (!st || !Array.isArray(st.tracks)) return null;
    return st.tracks.find((t) => t.id === st.activeTrackId) || null;
  } catch (_) {
    return null;
  }
}

function tabInsertActiveInstrument() {
  const trk = tabInsertActiveTrackState();
  return trk && trk.instrument ? String(trk.instrument) : 'guitar';
}

function tabInsertDomainForActiveTrack() {
  if (tabInsertActiveInstrument() !== 'ukulele') return tabInsertDomainFrom(null);
  const trk = tabInsertActiveTrackState();
  return tabInsertDomainFrom({ tabInstrument: 'ukulele', tabTuning: trk && trk.tuning });
}

// Домен открытого редактора: в нём хранится домен цели, поэтому ввод не
// зависит от того, какая дорожка активна сейчас.
function tabInsertEditorDomain() {
  const ed = tabInsertEditorState;
  if (ed && ed.domain) return ed.domain;
  return tabInsertDomainFrom(ed && ed.draft);
}

function tabAtStringsCount() {
  return tabInsertEditorDomain().strings;
}

// Строй в порядке модели: индекс 0 — нижняя строка стана (4-я струна
// укулеле, 6-я у гитары).
function tabAtTuningNotesFor(domain) {
  if (domain && domain.instrument === 'ukulele') {
    const list = typeof PART_UKULELE_TUNINGS !== 'undefined' && Array.isArray(PART_UKULELE_TUNINGS) ? PART_UKULELE_TUNINGS : [];
    const preset = list.find((t) => t.id === domain.tuning) || list[0];
    if (preset && Array.isArray(preset.notes) && preset.notes.length) return preset.notes.slice(0, domain.strings);
  }
  return tabAtTuningNotes();
}

// Частоты открытых струн для звука вставки.
function tabInsertStringFreqs(domain) {
  if (!domain || domain.instrument !== 'ukulele') return songLegacyStringFreqs();
  return tabAtTuningNotesFor(domain).map((n) => noteToFrequency(n));
}""",
    1,
    'domain helpers',
)

# --------------------------------------------------------------------------
# 2. Санитайзер: границы домена (без домена — прежние гитарные).
# --------------------------------------------------------------------------
html = rep(
    html,
    """function tabInsertCleanNotes(rawNotes, beats, parentTs) {""",
    """function tabInsertCleanNotes(rawNotes, beats, parentTs, domain) {
  // 0.870: домен сужает допустимое. Без домена — прежние гитарные границы,
  // поэтому все исторические вызовы и старые файлы работают как раньше.
  const maxString = domain && domain.strings ? domain.strings - 1 : 5;
  const maxFret = domain && Number.isFinite(domain.maxFret) ? domain.maxFret : TAB_INSERT_MAX_SAVE_FRET;""",
    1,
    'sanitizer signature',
)

html = rep(
    html,
    """      if (!Number.isInteger(raw.string) || raw.string < 0 || raw.string > 5) return;
      if (!Number.isInteger(raw.fret) || raw.fret < 0 || raw.fret > TAB_INSERT_MAX_SAVE_FRET) return;""",
    """      if (!Number.isInteger(raw.string) || raw.string < 0 || raw.string > maxString) return;
      if (!Number.isInteger(raw.fret) || raw.fret < 0 || raw.fret > maxFret) return;""",
    1,
    'sanitizer bounds',
)

# --------------------------------------------------------------------------
# 3. Правка нот: домен цели.
# --------------------------------------------------------------------------
html = rep(
    html,
    """  const source = editor ? editor.draft : (isCell ? { beats: Math.max(1 / 16, Number(ev.span) || 1), notes: ev.tabNotes || [] } : sq);
  const next = { ...source, notes: tabInsertCleanNotes(source.notes, source.beats, ts) };""",
    """  const source = editor ? editor.draft : (isCell ? { beats: Math.max(1 / 16, Number(ev.span) || 1), notes: ev.tabNotes || [] } : sq);
  // 0.870: струны и лады проверяются по домену самой вставки.
  const domain = editor ? tabInsertEditorDomain() : tabInsertDomainFrom(isCell ? ev : sq);
  const next = { ...source, notes: tabInsertCleanNotes(source.notes, source.beats, ts, domain) };""",
    1,
    'editNotes domain',
)

html = rep(
    html,
    """  const clean = tabInsertCleanNotes(next.notes, next.beats, ts);""",
    """  const clean = tabInsertCleanNotes(next.notes, next.beats, ts, domain);""",
    1,
    'editNotes clean',
)

html = rep(
    html,
    """function tabInsertSetString(secId, sqId, idx, val) {
  const string = Number(val);
  if (!Number.isInteger(string) || string < 0 || string > 5) return false;""",
    """function tabInsertSetString(secId, sqId, idx, val) {
  const string = Number(val);
  const target = tabInsertTarget(secId, sqId);
  const domain = target ? (target.editor ? tabInsertEditorDomain() : tabInsertDomainFrom(target.ev || target.sq)) : tabInsertDomainFrom(null);
  if (!Number.isInteger(string) || string < 0 || string >= domain.strings) return false;""",
    1,
    'setString bounds',
)

# --------------------------------------------------------------------------
# 4. Стан редактора и картинка: строй и число струн из домена.
# --------------------------------------------------------------------------
html = rep(
    html,
    """  staff.capo = songCapo;
  const tuning = tabAtTuningNotes();
  try {
    staff.stringTuning = new M.Tuning('Строй песни', tuning.map(partsAtNoteMidi).reverse(), false);
  } catch (_) {}""",
    """  staff.capo = songCapo;
  // 0.870: у укулельной вставки свой строй (4 струны), у гитарной — строй песни.
  const domain = (opts && opts.domain) ||
    (tabInsertEditorState && draft === tabInsertEditorState.draft ? tabInsertEditorDomain() : tabInsertDomainFrom(draft));
  const tuning = tabAtTuningNotesFor(domain);
  try {
    staff.stringTuning = new M.Tuning('Строй вставки', tuning.map(partsAtNoteMidi).reverse(), false);
  } catch (_) {}""",
    1,
    'buildScore tuning',
)

html = rep(
    html,
    """          note.string = Math.max(1, Math.min(6, spec.string));""",
    """          note.string = Math.max(1, Math.min(domain.strings, spec.string));""",
    1,
    'buildScore string clamp',
)

html = rep(
    html,
    """      if (bounds) return { yAt: string => bounds.y + bounds.h * (6 - string) / 5, gap: bounds.h / 5 };""",
    """      if (bounds) {
        const strings = Math.max(1, tabAtStringsCount());
        const step = strings > 1 ? bounds.h / (strings - 1) : bounds.h;
        return { yAt: string => bounds.y + (strings - string) * step, gap: step };
      }""",
    1,
    'geometry fallback',
)

html = rep(
    html,
    """  const text = `такт ${barNo}, доля ${beatLabel} · струна ${6 - tabAtCursor.string} · 1/${tabAtInput.dValue}${sign}`;
  const headerText = `Такт ${barNo} · Доля ${beatLabel} · ${6 - tabAtCursor.string}-я струна · 1/${tabAtInput.dValue}${sign}`;""",
    """  const stringsCount = Math.max(1, tabAtStringsCount());
  const text = `такт ${barNo}, доля ${beatLabel} · струна ${stringsCount - tabAtCursor.string} · 1/${tabAtInput.dValue}${sign}`;
  const headerText = `Такт ${barNo} · Доля ${beatLabel} · ${stringsCount - tabAtCursor.string}-я струна · 1/${tabAtInput.dValue}${sign}`;""",
    1,
    'readout text',
)

html = rep(
    html,
    """  const sNo = 6 - tabAtCursor.string;""",
    """  const sNo = Math.max(1, tabAtStringsCount()) - tabAtCursor.string;""",
    1,
    'readout string number',
)

html = rep(
    html,
    """  const nextCursorStr = Math.max(0, Math.min(5, tabAtCursor.string + delta));""",
    """  const nextCursorStr = Math.max(0, Math.min(Math.max(1, tabAtStringsCount()) - 1, tabAtCursor.string + delta));""",
    1,
    'cursor clamp',
)

html = rep(
    html,
    """  const string = geom ? Math.max(0, Math.min(5, Math.round((y - geom.yAt(1)) / (geom.yAt(2) - geom.yAt(1))))) : tabAtCursor.string;""",
    """  const string = geom
    ? Math.max(0, Math.min(Math.max(1, tabAtStringsCount()) - 1, Math.round((y - geom.yAt(1)) / (geom.yAt(2) - geom.yAt(1)))))
    : tabAtCursor.string;""",
    1,
    'click string',
)

# --------------------------------------------------------------------------
# 5. Редактор вставки: домен цели и 4-струнный список.
# --------------------------------------------------------------------------
html = rep(
    html,
    """  const editor = {
    secId,
    sqId,
    isCell,
    cellIndex,""",
    """  const editor = {
    secId,
    sqId,
    isCell,
    cellIndex,
    // 0.870: домен фиксируется на входе — ввод не зависит от переключения дорожки.
    domain: tabInsertDomainFrom(isCell ? target.ev : target.sq),""",
    1,
    'editor domain',
)

html = rep(
    html,
    """  editor.draft.notes = tabInsertCleanNotes(editor.draft.notes, editor.draft.beats, tabGpMeter(editor));""",
    """  editor.draft.notes = tabInsertCleanNotes(editor.draft.notes, editor.draft.beats, tabGpMeter(editor), editor.domain);""",
    1,
    'editor draft sanitize',
)

html = rep(
    html,
    """function renderTabInsertEditor(editor) {
  const target = tabInsertTarget(editor.secId, editor.sqId);
  if (!target) return;
  const { sec } = target, ts = sec.timeSig || globalTimeSig, denominator = parseTimeSig(ts).denominator;""",
    """function renderTabInsertEditor(editor) {
  const target = tabInsertTarget(editor.secId, editor.sqId);
  if (!target) return;
  const { sec } = target, ts = sec.timeSig || globalTimeSig, denominator = parseTimeSig(ts).denominator;
  // 0.870: у укулеле четыре струны и лады 0..15 — резервный список и поле лада
  // обязаны это знать, иначе ввод предложит пятую струну и лад 30.
  const domain = tabInsertEditorDomain();""",
    1,
    'renderEditor domain',
)

html = rep(
    html,
    """${options([0,1,2,3,4,5].map(s => [s, 6-s]), n.string)}""",
    """${options(Array.from({ length: domain.strings }, (_, s) => [s, domain.strings - s]), n.string)}""",
    1,
    'editor string list',
)

html = rep(
    html,
    """<input data-tab-field="fret" type="number" min="0" max="30" step="1" aria-label="Лад\"""",
    """<input data-tab-field="fret" type="number" min="0" max="${domain.maxFret}" step="1" aria-label="Лад\"""",
    1,
    'editor fret max',
)

# --------------------------------------------------------------------------
# 6. Создание и клонирование: домен пишется вместе с нотами.
# --------------------------------------------------------------------------
html = rep(
    html,
    """    notes: [],                 // [{ start, string, fret, dur, dots?, triplet?, pause? }]
    events: [],                // таб-вставка не использует события аккордов
    customBeats: null,
  };""",
    """    notes: [],                 // [{ start, string, fret, dur, dots?, triplet?, pause? }]
    events: [],                // таб-вставка не использует события аккордов
    customBeats: null,
    // 0.870: домен берётся у активной дорожки. Гитара полей не пишет.
    ...tabInsertDomainPatch(tabInsertDomainForActiveTrack()),
  };""",
    1,
    'addTabInsert domain',
)

html = rep(
    html,
    """    notes: JSON.parse(JSON.stringify(src.notes || [])),
    events: [],
    customBeats: null,
  };""",
    """    notes: JSON.parse(JSON.stringify(src.notes || [])),
    events: [],
    customBeats: null,
    // 0.870: копия остаётся вставкой того же инструмента.
    ...(src.tabInstrument === 'ukulele' ? { tabInstrument: 'ukulele', tabTuning: src.tabTuning } : {}),
  };""",
    1,
    'cloneTabSquare domain',
)

html = rep(
    html,
    """function tabCommitInlineInsertion(destSq, mode, idx, tabSpan, cleanNotes, parentTs) {
  if (!destSq || !Array.isArray(destSq.events)) return;
  const tabEv = { chord: '', span: tabSpan, timeSig: null, isTab: true, tabNotes: cleanNotes };""",
    """function tabCommitInlineInsertion(destSq, mode, idx, tabSpan, cleanNotes, parentTs, domain) {
  if (!destSq || !Array.isArray(destSq.events)) return;
  // 0.870: ячейка получает домен своей вставки (гитара полей не пишет).
  const tabEv = { chord: '', span: tabSpan, timeSig: null, isTab: true, tabNotes: cleanNotes,
    ...tabInsertDomainPatch(domain || tabInsertEditorDomain()) };""",
    1,
    'inline insertion domain',
)

# --------------------------------------------------------------------------
# 7. Карточка: домен, чужая вставка (серая и без клика).
# --------------------------------------------------------------------------
html = rep(
    html,
    """  const notes = tabInsertCleanNotes(isCell ? ev.tabNotes : sq.notes, beats, effTs);""",
    """  // 0.870: домен вставки решает, сколько струн и какие лады допустимы, и
  // показывать ли карточку как чужую (её инструмент не активная дорожка).
  const domain = tabInsertDomainFrom(isCell ? ev : sq);
  const foreignInsert = domain.instrument !== tabInsertActiveInstrument();
  const canEdit = interactive && !foreignInsert;
  const notes = tabInsertCleanNotes(isCell ? ev.tabNotes : sq.notes, beats, effTs, domain);""",
    1,
    'card domain',
)

html = rep(
    html,
    """  const thumbSpec = notes.length ? encodeURIComponent(JSON.stringify(tabThumbSpecFrom(notes, beats, effTs))) : '';""",
    """  const thumbSpec = notes.length ? encodeURIComponent(JSON.stringify(tabThumbSpecFrom(notes, beats, effTs, domain))) : '';""",
    1,
    'card spec domain',
)

html = rep(
    html,
    """  const resizeHandle = (!isCell && interactive && !cellOpts?.inTimeline)
    ? `<div class="square-resize-handle" data-sec="${sec.id}" data-square="${sq.id}"></div>`
    : '';""",
    """  const resizeHandle = (!isCell && canEdit && !cellOpts?.inTimeline)
    ? `<div class="square-resize-handle" data-sec="${sec.id}" data-square="${sq.id}"></div>`
    : '';""",
    1,
    'card resize handle',
)

html = rep(
    html,
    """  return `<div class="tab-insert${isCell ? ' tab-insert--cell' : ''}" data-sec="${sec.id}" data-square="${sq.id}" data-ei="${ei}" ` +
    (interactive ? `onclick="if(typeof isResizing==='undefined'||!isResizing){event.stopPropagation();${openCall}}" ` : '') + `title="${durationText}">` +""",
    """  return `<div class="tab-insert${isCell ? ' tab-insert--cell' : ''}${domain.instrument === 'ukulele' ? ' tab-insert--uke' : ''}${foreignInsert ? ' is-foreign' : ''}" data-sec="${sec.id}" data-square="${sq.id}" data-ei="${ei}" ` +
    (canEdit ? `onclick="if(typeof isResizing==='undefined'||!isResizing){event.stopPropagation();${openCall}}" ` : '') + `title="${durationText}${foreignInsert ? ' · ' + (domain.instrument === 'ukulele' ? 'укулеле' : 'гитара') + ': другая дорожка' : ''}">` +""",
    1,
    'card markup',
)

# --------------------------------------------------------------------------
# 8. Спека миниатюры: домен в ключе и в сборке стана.
# --------------------------------------------------------------------------
html = rep(
    html,
    """function tabThumbSpecFrom(notes, beats, ts) {""",
    """function tabThumbSpecFrom(notes, beats, ts, domain) {""",
    1,
    'spec signature',
)

html = rep(
    html,
    """  return {
    n: notes,
    b: beats,
    u: used,
    t: tabThumbTimeSig(beats, ts),
    th: document.documentElement.dataset.theme || 'light',
  };""",
    """  const spec = {
    n: notes,
    b: beats,
    u: used,
    t: tabThumbTimeSig(beats, ts),
    th: document.documentElement.dataset.theme || 'light',
  };
  // 0.870: у укулельной вставки свой строй и четыре струны. Гитара полей не
  // пишет — её спека и ключ кэша остаются прежними.
  if (domain && domain.instrument === 'ukulele') {
    spec.i = 'ukulele';
    spec.g = domain.tuning;
  }
  return spec;""",
    1,
    'spec fields',
)

html = rep(
    html,
    """    const key = [spec.th, spec.b, spec.t, width, JSON.stringify(spec.n)].join('|');""",
    """    const key = [spec.th, spec.b, spec.t, spec.i || '', spec.g || '', width, JSON.stringify(spec.n)].join('|');""",
    1,
    'cache key',
)

html = rep(
    html,
    """  const built = tabAtBuildScore(alphaTab, { notes: spec.n, beats: spec.b }, { timeSig: spec.t }, { tailPlaceholder: true });""",
    """  const built = tabAtBuildScore(alphaTab, { notes: spec.n, beats: spec.b }, { timeSig: spec.t },
    { tailPlaceholder: true, domain: tabInsertDomainFrom({ tabInstrument: spec.i, tabTuning: spec.g }) });""",
    1,
    'thumb build domain',
)

# --------------------------------------------------------------------------
# 9. Звук: частоты и тембр домена.
# --------------------------------------------------------------------------
html = rep(
    html,
    """function tabTechSoundOptions(event, unit, freqs, start, sound) {""",
    """function tabTechSoundOptions(event, unit, freqs, start, sound, domain) {""",
    1,
    'sound options signature',
)

html = rep(
    html,
    """  // Используем тот же движок приёмов, что у скрытых партий, но тембр песни.
  const v = partNoteSound(n, { gain: 0.5, bright: 0.5 }, written, written, event.room * unit);""",
    """  // Используем тот же движок приёмов, что у скрытых партий, но тембр песни.
  // 0.870: у укулельной вставки тембр нейлона — тот же, что у 4-струнных «Партий».
  const timbre = domain && domain.instrument === 'ukulele'
    ? { gain: PART_TIMBRE.ukulele.gain, bright: PART_TIMBRE.ukulele.bright }
    : { gain: 0.5, bright: 0.5 };
  const v = partNoteSound(n, timbre, written, written, event.room * unit);""",
    1,
    'sound timbre',
)

html = rep(
    html,
    """  const freqs = songLegacyStringFreqs();
  const sound = songSoundAtEvent(section, sq, Number.isInteger(eventIdx) ? eventIdx : 0);""",
    """  // 0.870: струны и тембр — по домену вставки (4 струны укулеле / 6 гитары).
  const domain = tabInsertDomainFrom(isInline ? inlineEv : sq);
  const freqs = tabInsertStringFreqs(domain);
  const sound = songSoundAtEvent(section, sq, Number.isInteger(eventIdx) ? eventIdx : 0);""",
    1,
    'play freqs',
)

html = rep(
    html,
    """    const options=tabTechSoundOptions(event,secondsPerUnit,freqs,evStart,sound);""",
    """    const options=tabTechSoundOptions(event,secondsPerUnit,freqs,evStart,sound,domain);""",
    1,
    'play sound call',
)

html = rep(
    html,
    """  const notes = tabInsertCleanNotes(rawNotes, totalBeats, parentTs);
  for (const event of tabTechPerformance(notes, totalBeats)) {""",
    """  const notes = tabInsertCleanNotes(rawNotes, totalBeats, parentTs, domain);
  for (const event of tabTechPerformance(notes, totalBeats)) {""",
    1,
    'play clean domain',
)

# --------------------------------------------------------------------------
# 10. CSS: гитарные вставки больше не скрываются целиком — они серые.
# --------------------------------------------------------------------------
html = rep(
    html,
    """/* 0.866 (B-39 Укулеле, Этап 1): 6-струнный TAB-редактор скрыт на укулеле до Этапа 2 */
html.b39-ukulele-mode .tab-btn,
html.b39-ukulele-mode .add-tab-btn,
html.b39-ukulele-mode .chord-wrapper--tab { display:none !important; }""",
    """/* 0.870 (B-39 Этап 3, волна 1): вставка принадлежит инструменту.
   Раньше на укулеле скрывался весь таб-инструментарий; теперь «Таб» работает
   и там (создаёт 4-струнную вставку), а вставка чужого инструмента остаётся
   видимой, но серой и без клика — видно, что она есть в песне. */
.tab-insert.is-foreign { opacity: 0.55; cursor: default; pointer-events: none; }
.tab-insert.is-foreign:hover { border-color: var(--color-border-medium); }
html.b39-ukulele-mode .tab-insert--uke,
html:not(.b39-ukulele-mode) .tab-insert--uke { pointer-events: auto; }
.tab-insert--uke .tab-insert-label { letter-spacing: 0.06em; }""",
    1,
    'css foreign cards',
)

with io.open(PATH, 'w', encoding='utf-8') as f:
    f.write(html)

size1 = len(html.encode('utf-8'))
print('OK %d -> %d (%+d)' % (size0, size1, size1 - size0))
