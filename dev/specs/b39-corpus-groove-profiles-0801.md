# B-39 · MIDI-derived groove profiles 0.801

## R8 decisions (before implementation)

- Reference data: compact statistical descriptors only; do not embed original MIDI note events or sample phrases in the app.
- Role development: subtle, bounded changes while preserving a shared rhythmic family.
- Validation: automated coverage across all 109 source folders and the app's supported meters; no new UI/A/B preview in this prototype.

## What changed

New auto-plans carrying `phraseModel:1` and an integer song-level `phraseSeed` now use an embedded aggregate profile table. The table was built from **23,707 MIDI files** whose meters match the keyboard performance module's supported 4/4, 3/4, or 6/8 meters. It contains, per broad app genre, meter and filename-inferred role:

- a normalized eight-slot onset vector weighted by note-on velocity (six active slots for 3/4 and 6/8),
- a relative note-density multiplier in `[0.90, 1.10]`,
- a corpus velocity delta capped at `±4`,
- a role-relative mean-pitch/register proxy capped at `±12` semitones,
- the number of same-role source MIDI files.

At generation time the profile ranks the app's already-authored groove candidates by phase-distribution fit (weight 0.62), a modest density fit (0.23), and distance from the song-family preferred candidate (0.15). The source does not supply notes or a transcription. Density moves only 45% of the profile's bounded deviation from baseline; velocity likewise applies only 45% of the capped delta (maximum `±1.8` velocity). Register is used only to bias single-note selection by at most one existing right-hand chord tone; it does not transpose or invent notes. The common phrase seed remains the continuity anchor. Saturation, chord tones, hand range, manual overrides, and existing playback/export pathways are unchanged.

Only the new phrase-model path activates the profiles. Legacy requests without an integer `phraseSeed` continue through the former logic. Existing saved patterns are not rewritten on load; a user-initiated regeneration of a managed new-plan pattern uses the current generator.

## Source mapping and limitations

All **109** product/style folders are routed to one of the app's nine broad genre families by a documented name-based mapping in `dev/tools/build-b39-corpus-groove-profiles.py`; the runtime then matches actual measured rhythm-position, density and dynamics descriptors rather than choosing a pattern solely from the folder name. This mapping is an engineering prior, not a claim that the source products are identical to the app's genres. The corpus has no dedicated `punk` folder; punk's pool uses nearby high-energy rock/metal/industrial sources and should be considered especially provisional.

The archive has 24,285 real MIDI files. The 578 files in unsupported meters are not used by 0.801's runtime profiles; this prototype does not expand meter support. Role labels are inferred from filenames and low-count role buckets fall back to the genre+meter aggregate. Accent vectors count note-on events, not instrument-specific tracks; the source collection is not split into piano-only stems in a way that would identify performance intent. These are statistical aids, not an artistic judgment or a replacement for listening.

## Reproducibility

- `dev/audits/analyze_ezkeys_corpus.py`: parse a supplied ZIP to per-file JSON using Python + `mido`.
- `dev/tools/build-b39-corpus-groove-profiles.py`: map all 109 folder names and build `dev/audits/b39-corpus-groove-profiles.json` from that JSON. The generated file contains aggregate descriptors and folder routing only; no MIDI events.
- `dev/tools/patch-b39-corpus-groove-profiles-0801.py`: one-time HTML patcher. It embeds the compact profile table in `STRUCHORD.html` so the offline app has no runtime fetch or new dependency.
- `dev/tests/b39-corpus-groove-profiles-0801.js`: validates all 109 routed folders, all 9 × 3 × 8 genre/meter/role lookups, bounded profile values, groove-candidate selection, deterministic generation, event bounds, and the legacy no-profile path.

## Verification / acceptance limits

The new Node test, the 0.800 song-seed regression, the isolated performance prototype, and HTML syntax check pass. Browser-dependent B-39 regressions could not run because `puppeteer` is not installed in this workspace. This prototype has no A/B UI and has **not** been auditioned; owner listening remains the musical acceptance gate. Do not describe statistical alignment as proven musical quality.
