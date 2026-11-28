#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""0.872 · B-39 Этап 3, волна 3: связка «таб-вставка ↔ партия».

Что добавляется:
  • «В партию» — ноты открытой вставки переносятся в рулон партии того же
    домена (укулельная вставка → укулельная партия со строем вставки;
    партии нет — создаётся), а сама вставка из песни убирается: квадрат
    удаляется, ячейка становится пустым слотом (длительности не едут).
  • «Из партии» — обратный перенос: в черновик вставки попадают ноты партии,
    которые стоят в её окне; дальше обычное «Применить».

Обе кнопки живут в панели действий редактора вставки, поэтому UI ровно один
и не зависит от экрана «Партии». Рулон и вставка используют одни и те же
единицы (доли родительского размера), поэтому перенос — копия полей.

Только точные замены с проверкой числа вхождений.
"""
import io
import sys

PATH = 'STRUCHORD.html'


def rep(text, old, new, count=1, label=''):
    n = text.count(old)
    if n != count:
        sys.exit('FAIL %s: expected %d, found %d for %r' % (label, count, n, old[:120]))
    return text.replace(old, new)


with io.open(PATH, encoding='utf-8') as f:
    html = f.read()
size0 = len(html.encode('utf-8'))

helpers = r'''// 0.872 (B-39 Этап 3, волна 3): связка «таб-вставка ↔ партия».
//
// Вставка и рулон партии живут в одних единицах — долях родительского размера,
// поэтому перенос нот — копия полей (start, dur, string, fret, точка, триоль).
// Домены совпадают: укулельная вставка переносится только в укулельную партию,
// гитарная — в гитарную или басовую.

function tabInsertPartMatches(part, domain) {
  if (!part || part.derivedAccomp === true) return false;
  const inst = partInstrumentId(part);
  if (domain && domain.instrument === 'ukulele') {
    // Строй — часть домена: High G и баритон звучат по-разному на одной
    // и той же струне, поэтому это разные партии, а не одна на всех.
    return inst === 'ukulele' && String(part.tuning || PART_UKULELE_DEFAULT_TUNING) === String(domain.tuning);
  }
  return inst === 'guitar' || inst === 'bass';
}

// Короткое имя строя для названия создаваемой партии: «High G (стандартный)».
function tabInsertUkuleleShort(tuning) {
  const list = typeof PART_UKULELE_TUNINGS !== 'undefined' && Array.isArray(PART_UKULELE_TUNINGS) ? PART_UKULELE_TUNINGS : [];
  const preset = list.find((t) => t.id === tuning) || list[0] || null;
  return preset ? String(preset.name || '').replace(/^Укулеле:\s*/, '').split(' (')[0] : '';
}

function tabInsertPartFor(domain) {
  const parts = Array.isArray(songParts) ? songParts : [];
  const active = typeof partActivePart === 'function' ? partActivePart() : null;
  if (tabInsertPartMatches(active, domain)) return active;
  return parts.filter((part) => tabInsertPartMatches(part, domain))[0] || null;
}

// Абсолютное начало вставки внутри секции (в долях родительского размера).
function tabInsertSectionOffset(sec, sq, ei) {
  if (!sec || !sq) return 0;
  const ts = sec.timeSig || globalTimeSig;
  let offset = 0;
  for (const item of sec.squares || []) {
    if (item === sq) {
      if (ei == null) return offset;
      let evOff = 0;
      const events = sq.events || [];
      for (let k = 0; k < events.length && k < ei; k += 1) evOff += getEventSpanInParentUnits(events[k], ts);
      return offset + evOff;
    }
    offset += getSquareBeats(item, ts);
  }
  return offset;
}

// Ноты вставки → рулон партии (окно вставки уже сдвинуто на offset).
function tabInsertRollFromNotes(notes, offset) {
  return (Array.isArray(notes) ? notes : [])
    .filter((n) => n && !n.pause && Number.isInteger(n.string) && Number.isInteger(n.fret))
    .map((n) => ({
      start: Math.round(((Number(offset) || 0) + (Number(n.start) || 0)) * 10000) / 10000,
      dur: Number(n.dur) || 1 / 4,
      string: n.string,
      fret: n.fret,
      ...(n.dots ? { dots: 1 } : {}),
      ...(n.triplet ? { triplet: true } : {}),
    }));
}

// Рулон партии → ноты вставки: берём только попадающее в окно [offset, offset+beats).
function tabInsertNotesFromRoll(roll, offset, beats) {
  const from = Number(offset) || 0, to = from + (Number(beats) || 0);
  return (Array.isArray(roll) ? roll : [])
    .filter((n) => n && !n.pause && Number(n.start) >= from - 1e-6 && Number(n.start) < to - 1e-6)
    .map((n) => ({
      start: Math.round((Number(n.start) - from) * 10000) / 10000,
      dur: Number(n.dur) || 1 / 4,
      string: n.string,
      fret: n.fret,
      ...(n.dots ? { dots: 1 } : {}),
      ...(n.triplet ? { triplet: true } : {}),
    }));
}

function tabInsertEnsurePart(domain) {
  let part = tabInsertPartFor(domain);
  if (part) return { part, created: false };
  const uke = domain && domain.instrument === 'ukulele';
  const short = uke ? tabInsertUkuleleShort(domain.tuning) : '';
  part = {
    id: nextPartId(),
    name: uke ? 'Укулеле' + (short ? ' (' + short + ')' : ' (табы)') : 'Гитара (табы)',
    instrument: uke ? 'ukulele' : 'guitar',
    // Строй берём у вставки, иначе партия зазвучала бы в High G по умолчанию.
    tuning: uke ? domain.tuning : null,
    viewMode: 'tab',
    visible: true,
    rolls: {},
    pitchRolls: {},
  };
  songParts.push(part);
  return { part, created: true };
}

// «В партию»: ноты вставки уходят в рулон, вставка из песни убирается.
function tabInsertMoveToPart(editor) {
  const target = editor && tabInsertTarget(editor.secId, editor.sqId);
  if (!target) return false;
  const { sec, sq } = target;
  const isCell = !!editor.isCell;
  const ei = isCell ? editor.cellIndex : null;
  const domain = tabInsertEditorDomain();
  const ts = sec.timeSig || globalTimeSig;
  const notes = tabInsertCleanNotes(editor.draft.notes, editor.draft.beats, tabGpMeter(editor), domain);
  if (!notes.some((n) => !n.pause)) {
    showToast('В этой вставке нет нот для переноса');
    return false;
  }
  const offset = tabInsertSectionOffset(sec, sq, ei);
  const rollNotes = tabInsertRollFromNotes(notes, offset);
  let part = null, created = false;
  songStore.dispatch('tab/to-part', () => {
    const ensured = tabInsertEnsurePart(domain);
    part = ensured.part;
    created = ensured.created;
    const roll = partEnsureRoll(part, sec.id);
    roll.push(...rollNotes.map((n) => ({ ...n })));
    roll.sort((a, b) => a.start - b.start || (a.string - b.string));
    if (isCell) {
      // Ячейка остаётся на месте — пустым слотом: длительности соседей не едут.
      const ev = target.ev;
      ev.chord = '';
      delete ev.isTab;
      delete ev.tabNotes;
      delete ev.tabInstrument;
      delete ev.tabTuning;
    } else {
      sec.squares = sec.squares.filter((item) => item.id !== sq.id);
    }
  }, { quiet: true, history: 'atomic' });
  if (part) partsActiveId = part.id;
  // Редактор закрывает обработчик кнопки: здесь только модель и экраны.
  if (!rerenderSectionSquaresDom(sec)) requestRender();
  if (partsMode) renderPartsScreen();
  showToast(created
    ? `Ноты перенесены в новую партию «${part.name}»`
    : `Ноты перенесены в партию «${part.name}»`);
  return true;
}

// «Из партии»: в черновик вставки попадают ноты партии из её окна.
function tabInsertFillFromPart(editor) {
  const target = editor && tabInsertTarget(editor.secId, editor.sqId);
  if (!target) return false;
  const { sec, sq } = target;
  const domain = tabInsertEditorDomain();
  const part = tabInsertPartFor(domain);
  if (!part) {
    showToast(domain.instrument === 'ukulele'
      ? 'В песне нет укулельной партии — переносить нечего'
      : 'В песне нет гитарной или басовой партии — переносить нечего');
    return false;
  }
  const offset = tabInsertSectionOffset(sec, sq, editor.isCell ? editor.cellIndex : null);
  const picked = tabInsertNotesFromRoll(partRollFor(part, sec.id) || [], offset, editor.draft.beats);
  if (!picked.length) {
    showToast(`В партии «${part.name}» нет нот в этом месте`);
    return false;
  }
  const ok = tabInsertEditNotes(editor.secId, editor.sqId, 'tab/from-part', (next) => {
    next.notes = picked;
  });
  if (ok) showToast(`Ноты взяты из партии «${part.name}»`);
  return ok;
}

'''

html = rep(
    html,
    'function tabInsertEditNotes(secId, sqId, label, mutate) {',
    helpers + 'function tabInsertEditNotes(secId, sqId, label, mutate) {',
    1,
    'helpers before tabInsertEditNotes',
)

# --- кнопки в панели действий редактора -----------------------------------
html = rep(
    html,
    """    <div class="tab-editor-actions"><button type="button" data-tab-cancel>Отмена</button><button type="button" data-tab-apply aria-describedby="tabGpError">Применить</button></div></div>""",
    """    <div class="tab-editor-actions"><button type="button" data-tab-cancel>Отмена</button><button type="button" data-tab-to-part title="Перенести ноты вставки в партию и убрать вставку из песни">В партию</button><button type="button" data-tab-from-part title="Взять ноты из партии в эту вставку">Из партии</button><button type="button" data-tab-apply aria-describedby="tabGpError">Применить</button></div></div>""",
    1,
    'editor actions markup',
)

html = rep(
    html,
    """    if (event.target.closest('[data-tab-apply]')) {""",
    """    if (event.target.closest('[data-tab-to-part]')) {
      if (tabInsertMoveToPart(editor)) close(true);
      return;
    }
    if (event.target.closest('[data-tab-from-part]')) {
      tabInsertFillFromPart(editor);
      tabAtHostEl?.focus({ preventScroll: true });
      return;
    }
    if (event.target.closest('[data-tab-apply]')) {""",
    1,
    'editor actions handler',
)

# --- санитайзер партий: таблица строёв по роли ------------------------------
html = rep(
    html,
    "        const tuningTable = inst === 'bass' ? PART_BASS_TUNINGS : TUNER_TUNINGS;",
    """        // 0.872: у баса и укулеле СВОИ таблицы строёв. До этого укулельная
        // партия проверялась по гитарным пресетам, не находила там свой строй
        // и молча открывалась в High G — Low G, баритон и Canadian терялись
        // при каждом сохранении и загрузке.
        const tuningTable = partTuningTable(inst);""",
    1,
    'sanitizer tuning table by role',
)

# --- версия приложения ------------------------------------------------------
html = rep(html, '· ver 0.871', '· ver 0.872', 1, 'app version')

with io.open(PATH, 'w', encoding='utf-8') as f:
    f.write(html)

size1 = len(html.encode('utf-8'))
print('OK %d -> %d (%+d)' % (size0, size1, size1 - size0))
