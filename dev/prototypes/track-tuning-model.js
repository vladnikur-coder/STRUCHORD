/* Pure helpers for the in-progress per-track tuning migration.
 * Not connected to the application; caller supplies the validated preset table.
 */
'use strict';
function createTuningModel(presets, standardId = 'e-std') {
  const byId = new Map();
  const isNote = n => typeof n === 'string' && /^[A-G][#b]?-?\d$/.test(n);
  const isNotes = n => Array.isArray(n) && n.length === 6 && n.every(isNote);
  for (const p of presets || []) {
    if (p && typeof p.id === 'string' && p.id && isNotes(p.notes)) {
      byId.set(p.id, p.notes.slice());
    }
  }
  if (!byId.has(standardId)) throw new Error('Missing standard guitar tuning');
  function clean(raw, fallback) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !byId.has(raw.id)) return fallback();
    if (raw.notes !== null && raw.notes !== undefined && !isNotes(raw.notes)) return fallback();
    return {id: raw.id, notes: raw.notes == null ? null : raw.notes.slice()};
  }
  function standard() { return {id: standardId, notes: null}; }
  function legacy(song) {
    const id = byId.has(song && song.tuning) ? song.tuning : standardId;
    const notes = song && isNotes(song.tuningNotes) ? song.tuningNotes.slice() : null;
    return {id, notes};
  }
  function migrate(track, song) {
    if (!track || track.instrument !== 'guitar') return null;
    // An explicit but invalid track value must not inherit another track's tuning.
    return Object.prototype.hasOwnProperty.call(track, 'trackTuning')
      ? clean(track.trackTuning, standard) : legacy(song);
  }
  function notes(value) {
    const t = clean(value, standard);
    return t.notes ? t.notes.slice() : byId.get(t.id).slice();
  }
  return Object.freeze({standard, legacy, migrate, clean: value => clean(value, standard), notes});
}
module.exports = {createTuningModel};
