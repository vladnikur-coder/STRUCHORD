# ezkeys MIDI corpus — read-only musical audit

**Scope:** the linked ZIP is stored beside `mid/ezkeys-data` in Drive; the `mid` folder lists exactly that source folder and the ZIP. The archive contains the `ezkeys-data/` tree recursively, including the `ezkeys_midi` product folder and the style/genre folders. All valid MIDI files in that supplied tree were parsed. This is a structural/event-data audit, not a subjective listening review.

## Coverage and method

- Archive entries named `.mid`/`.midi` outside macOS `__MACOSX` metadata: **24,285**; all parsed successfully with Mido.
- The ZIP contains 52,122 entries: 24,285 playable MIDI files plus 24,285 AppleDouble `._*.mid` metadata sidecars; those sidecars were excluded. The remaining entries are folders/metadata/non-MIDI resources and were not treated as performances.
- **109** first-level product/style folders (including `ezkeys_midi` and `ezkeys_2`); each MIDI was retained as an individual row in the CSV. The Drive `mid/` root had two direct entries: `ezkeys-data` and this ZIP; there was no separate top-level `ezkeys_midi` sibling.
- Extracted tempo, meter, duration, note count, pitch/register, velocity, polyphony, attack-grid deviation, repeated bar-level onset signatures, filename-derived section label, and a chord-stack voice-leading proxy. MIDI tempo/meter events in these files are initial declarations (one each per file).
- “Section” labels are inferred from filenames only. Unrecognized or non-song-pattern labels remain `unclassified`; this is not a manually corrected arrangement map. For rhythm, `offgrid_ratio` is deviation from a straight sixteenth grid, **not** a swing score. Repeated-bar ratio compares onset-position signatures only, not exact pitch/velocity phrase identity. The voice-leading proxy compares successive simultaneous-onset pitch stacks with a minimum-semitone assignment; it is an approximate register-continuity measure, not a recovered human fingering or voice identity.

## Corpus-level findings

| Feature | Corpus result |
|---|---:|
| Tempo, BPM | median 104; mean 105.8; range 42–238 |
| Length, bars | median 7.87; 4–8 bars: 63.1%; <=2 bars: 310 |
| Notes per bar | median 12.67; p10–p90 5.1–24.8 |
| Distinct note attacks per beat | median 2.98 |
| Mean sounding polyphony | median 2.61 simultaneous notes; peak median 6 |
| Pitch span | median 34 semitones; p10–p90 20–53 |
| Velocity | median file-average 78.1/127; median within-file SD 10.5 |
| Straight-16th grid deviation | median 20.5% of note starts; the corpus includes non-straight-sixteenth placements; this statistic alone cannot distinguish swing, tuplets, or expressive timing |
| Repeated bar onset signatures | median 37.5% of bars; signatures ignore pitches and duration |
| Chord-stack voice-leading proxy | available for 14,456 files (59.5%); median matched movement 5.68 semitones between successive simultaneous-onset stacks |

### Meter distribution

| Meter | Files | Share |
|---|---:|---:|
| 4/4 | 20,983 | 86.4% |
| 6/8 | 1,746 | 7.2% |
| 3/4 | 978 | 4.0% |
| 7/8 | 151 | 0.6% |
| 12/8 | 108 | 0.4% |
| 5/4 | 76 | 0.3% |
| 7/4 | 68 | 0.3% |
| 6/4 | 44 | 0.2% |
| 2/4 | 44 | 0.2% |
| 5/8 | 39 | 0.2% |
| 9/8 | 24 | 0.1% |
| 11/8 | 24 | 0.1% |

### Filename-inferred section/phrase labels

| Label | Files | Share | Median notes/bar | Median velocity | Median pitch range | Median chord-stack movement | Median repeated-bar ratio |
|---|---:|---:|---:|---:|---|---:|---:|
| intro | 4,329 | 17.8% | 11.1 | 72.4 | 38–74 | 5.50 | 50.0% |
| bridge | 3,799 | 15.6% | 13.2 | 79.7 | 36–74 | 5.88 | 50.0% |
| unclassified | 3,500 | 14.4% | 12.2 | 75.5 | 41–76 | 5.75 | 50.0% |
| chorus | 3,271 | 13.5% | 14.9 | 84.1 | 36–72 | 5.75 | 25.0% |
| verse | 3,264 | 13.4% | 13.1 | 78.2 | 36–70 | 5.25 | 37.5% |
| pre-chorus | 3,009 | 12.4% | 13.1 | 82.5 | 36–72 | 5.50 | 0.0% |
| theme | 1,437 | 5.9% | 12.4 | 76.8 | 37–76 | 6.50 | 66.7% |
| outro | 559 | 2.3% | 9.7 | 59.2 | 31–81 | 7.18 | 57.1% |
| variation | 349 | 1.4% | 8.1 | 75.6 | 48–79 | 3.50 | 75.0% |
| ending | 344 | 1.4% | 12.2 | 66.3 | 39–84 | 6.25 | 0.0% |
| break | 146 | 0.6% | 12.1 | 93.6 | 53–72 | 6.83 | 50.0% |
| riff | 90 | 0.4% | 20.5 | 91.8 | 39–67 | 5.75 | 0.0% |
| main-patterns | 83 | 0.3% | 14.5 | 73.0 | 41–64 | 2.75 | 100.0% |
| additional-layers | 73 | 0.3% | 14.2 | 62.8 | 69–84 | 1.06 | 100.0% |
| bass | 18 | 0.1% | 5.5 | 100.0 | 46–54 | 3.17 | 87.5% |
| solo | 14 | 0.1% | 13.9 | 77.0 | 48–81 | 5.78 | 0.0% |

## Style/genre summary (all 109 folders)

Median values per style; dominant meter and most common filename label are descriptive, not musicological ground truth.

| Folder | Files | BPM median | Main meter | Main label | Notes/bar median | Pitch range median | Voice-step median | Velocity median | Polyphony median |
|---|---:|---:|---|---|---:|---|---:|---:|---:|
| acoustic_pop | 200 | 81 | 4/4 | chorus | 14.7 | 36–71 | 6.00 | 64.8 | 2.64 |
| acoustic_songwriter | 200 | 95 | 4/4 | verse | 14.4 | 31–72 | 6.25 | 81.4 | 2.79 |
| acoustic_songwriter_2 | 200 | 84 | 4/4 | chorus | 18.2 | 33–74 | 7.46 | 74.0 | 2.48 |
| ambient_pop | 200 | 94 | 4/4 | unclassified | 6.7 | 58–79 | 3.88 | 57.3 | 1.12 |
| americana | 200 | 118 | 4/4 | intro | 13.3 | 31–70 | 5.83 | 74.8 | 2.69 |
| aor | 208 | 126 | 4/4 | intro | 14.1 | 33–69 | 5.96 | 98.0 | 2.57 |
| aor_ballads | 200 | 131 | 4/4 | verse | 11.0 | 36–66 | 3.39 | 92.8 | 2.84 |
| atmospheric | 160 | 76 | 4/4 | intro | 6.3 | 40–81 | 8.89 | 39.5 | 1.36 |
| ballads | 200 | 75 | 4/4 | intro | 20.2 | 36–75 | 8.50 | 82.2 | 2.88 |
| ballads_2 | 200 | 70 | 4/4 | verse | 20.2 | 36–74 | 6.62 | 86.9 | 2.98 |
| basic_rock | 200 | 140 | 4/4 | verse | 10.2 | 36–79 | 7.68 | 68.6 | 1.81 |
| beat_ideas | 200 | 82 | 4/4 | unclassified | 14.0 | 37–76 | 6.69 | 61.1 | 3.00 |
| big_band | 231 | 125 | 4/4 | unclassified | 13.1 | 36–77 | 5.60 | 74.7 | 1.73 |
| blues | 160 | 120 | 4/4 | verse | 20.1 | 36–74 | 3.94 | 73.5 | 2.94 |
| boogie | 303 | 128 | 4/4 | unclassified | 14.2 | 36–81 | 6.29 | 90.4 | 1.48 |
| british_invasion | 200 | 120 | 4/4 | verse | 13.8 | 38–67 | 3.38 | 101.0 | 2.32 |
| cinematic_mallets | 240 | 92 | 4/4 | intro | 9.3 | 52–72 | 4.30 | 94.1 | 0.51 |
| classic_rock_organ | 200 | 122 | 4/4 | verse | 8.3 | 56–83 | 5.90 | 96.9 | 4.27 |
| classic_soul | 200 | 85 | 6/8 | verse | 17.0 | 31–73 | 7.90 | 76.3 | 2.83 |
| contemporary_r&b | 180 | 98 | 4/4 | unclassified | 12.2 | 36–74 | 6.67 | 69.6 | 3.21 |
| contemporary_soul_ballads | 200 | 82 | 4/4 | bridge | 14.6 | 31–72 | 6.83 | 68.3 | 2.71 |
| country | 184 | 94 | 4/4 | verse | 15.1 | 38–72 | 4.24 | 66.9 | 3.08 |
| country_pop | 200 | 112 | 4/4 | bridge | 14.2 | 32–69 | 5.05 | 78.0 | 2.99 |
| country_roots | 199 | 98 | 4/4 | verse | 10.1 | 36–71 | — | 53.6 | 3.11 |
| detroit_soul | 200 | 108 | 4/4 | verse | 13.5 | 36–81 | 9.33 | 72.6 | 1.85 |
| disco | 200 | 112 | 4/4 | verse | 16.0 | 31–67 | 5.75 | 104.2 | 2.41 |
| dream_pop | 240 | 74 | 4/4 | intro | 8.6 | 44–74 | 5.06 | 75.8 | 3.35 |
| edm | 200 | 125 | 4/4 | unclassified | 8.1 | 55–70 | 2.25 | 101.4 | 0.83 |
| eighties_ballads | 200 | 76 | 4/4 | chorus | 13.1 | 29–69 | 7.78 | 65.7 | 2.84 |
| eighties_pop | 200 | 103 | 4/4 | pre-chorus | 14.3 | 29–71 | 6.39 | 84.6 | 2.73 |
| ekx_dark_industrial | 56 | 110 | 4/4 | unclassified | 2.5 | 67–75 | 1.00 | 97.2 | 0.87 |
| ekx_felt_piano | 80 | 100 | 4/4 | intro | 9.8 | 40–72 | 4.98 | 65.2 | 2.58 |
| ekx_orchestral_grand | 68 | 107 | 4/4 | unclassified | 14.4 | 33–79 | 6.41 | 65.2 | 2.71 |
| ekx_session_organ | 597 | 105 | 4/4 | variation | 8.5 | 60–84 | 4.47 | 89.2 | 4.04 |
| ekx_singer-songwriter | 100 | 87 | 4/4 | bridge | 11.5 | 40–84 | 6.75 | 51.5 | 1.61 |
| ekx_soul_roads | 100 | 99 | 4/4 | bridge | 15.3 | 36–69 | 5.38 | 82.5 | 2.76 |
| emotional_ballads | 200 | 78 | 4/4 | verse | 13.8 | 32–65 | 4.88 | 85.6 | 2.70 |
| epic_metal | 200 | 126 | 4/4 | unclassified | 8.8 | 38–75 | 6.70 | 96.0 | 3.28 |
| epic_themes | 376 | 120 | 4/4 | theme | 7.9 | 33–81 | 7.08 | 66.3 | 2.19 |
| epic_themes_2 | 384 | 102 | 4/4 | theme | 8.9 | 28–80 | 7.06 | 79.7 | 2.26 |
| ezkeys_2 | 1,396 | 100 | 4/4 | intro | 14.2 | 36–72 | 6.65 | 73.7 | 2.60 |
| ezkeys_midi | 818 | 107 | 4/4 | verse | 17.7 | 36–70 | 5.83 | 67.2 | 3.30 |
| folk | 200 | 89 | 4/4 | bridge | 14.4 | 36–72 | 6.53 | 69.6 | 2.59 |
| folk_rock | 200 | 113 | 4/4 | bridge | 8.5 | 36–82 | 9.00 | 65.1 | 1.49 |
| funk | 318 | 105 | 4/4 | riff | 18.0 | 40–71 | 5.30 | 89.4 | 2.16 |
| fusion | 200 | 108 | 4/4 | verse | 15.8 | 33–67 | 3.37 | 103.2 | 2.29 |
| gospel | 211 | 110 | 4/4 | chorus | 20.8 | 36–72 | 5.58 | 85.8 | 2.64 |
| gospel_organ | 196 | 99 | 4/4 | verse | 10.9 | 38–88 | 6.99 | 89.1 | 5.22 |
| goth_rock | 200 | 131 | 4/4 | verse | 8.0 | 31–67 | 8.25 | 84.3 | 3.08 |
| hard_rock_organ | 202 | 124 | 4/4 | intro | 12.1 | 48–84 | 6.75 | 101.5 | 3.63 |
| hip-hop | 124 | 90 | 4/4 | unclassified | 11.6 | 45–76 | 4.82 | 49.9 | 2.33 |
| hip-hop#r&b | 192 | 80 | 4/4 | unclassified | 14.9 | 34–74 | 7.22 | 80.9 | 2.89 |
| hip-hop_hooks | 200 | 85 | 4/4 | unclassified | 18.5 | 29–72 | 7.75 | 82.1 | 2.97 |
| hooks#chords | 280 | 110 | 4/4 | pre-chorus | 8.0 | 46–76 | 5.00 | 77.3 | 2.69 |
| house | 200 | 120 | 4/4 | verse | 15.3 | 34–70 | 7.17 | 88.4 | 2.84 |
| indie_pop | 200 | 114 | 4/4 | intro | 13.3 | 38–72 | 6.50 | 84.9 | 2.92 |
| jazz | 270 | 120 | 4/4 | unclassified | 12.0 | 38–79 | 6.15 | 68.4 | 2.27 |
| jazz_ballads | 204 | 80 | 4/4 | unclassified | 14.0 | 41–91 | 8.20 | 39.5 | 1.79 |
| jazz_organ | 160 | 123 | 4/4 | unclassified | 11.3 | 47–82 | 5.83 | 94.8 | 4.10 |
| keys#strings | 320 | 108 | 4/4 | bridge | 8.4 | 53–79 | 4.58 | 86.5 | 3.22 |
| laid-back_pop | 199 | 90 | 4/4 | unclassified | 9.9 | 38–81 | 8.40 | 50.4 | 1.41 |
| latin | 230 | 120 | 4/4 | unclassified | 20.8 | 48–77 | 5.31 | 71.2 | 2.09 |
| latin_ballads | 200 | 88 | 4/4 | intro | 13.3 | 36–69 | 5.49 | 69.5 | 2.63 |
| latin_cuban | 228 | 108 | 4/4 | unclassified | 18.7 | 50–82 | 6.14 | 83.5 | 2.08 |
| latin_pop | 296 | 98 | 4/4 | theme | 17.5 | 40–77 | 6.09 | 72.8 | 2.86 |
| melancholic_pop | 200 | 86 | 4/4 | intro | 13.2 | 32–68 | 5.57 | 72.8 | 2.67 |
| melancholic_rock | 200 | 126 | 4/4 | verse | 11.2 | 29–69 | 10.50 | 90.2 | 2.58 |
| melodic_mallets | 354 | 118 | 4/4 | main-patterns | 10.6 | 50–77 | 3.04 | 62.5 | 0.69 |
| melodic_percussion_-_metal | 173 | 104 | 4/4 | unclassified | 6.5 | 60–79 | 1.54 | 68.0 | 0.39 |
| melodic_percussion_-_wood | 155 | 104 | 4/4 | unclassified | 9.6 | 44–66 | 5.03 | 73.5 | 0.61 |
| melodic_techno_textures | 204 | 136 | 4/4 | unclassified | 5.3 | 60–72 | 0.36 | 68.9 | 0.81 |
| modern_funk | 200 | 118 | 4/4 | chorus | 14.8 | 44–75 | 4.59 | 87.3 | 2.84 |
| modern_pop | 200 | 117 | 4/4 | intro | 10.3 | 35–72 | 7.54 | 66.0 | 1.50 |
| modern_soul | 201 | 85 | 4/4 | bridge | 15.0 | 36–66 | 6.31 | 74.6 | 2.82 |
| movie_scores | 160 | 122 | 4/4 | theme | 10.0 | 45–84 | 5.42 | 52.1 | 2.41 |
| movie_scores_-_action | 160 | 100 | 4/4 | bridge | 13.0 | 24–71 | 6.87 | 74.3 | 1.83 |
| movie_scores_-_adventure | 160 | 120 | 4/4 | theme | 10.1 | 31–79 | 7.88 | 63.7 | 2.91 |
| movie_scores_-_drama | 160 | 100 | 4/4 | theme | 9.6 | 38–74 | 5.79 | 49.6 | 1.94 |
| movie_scores_-_fantasy | 160 | 107 | 4/4 | outro | 11.3 | 29–82 | 8.78 | 52.4 | 2.60 |
| movie_scores_-_horror | 160 | 109 | 4/4 | outro | 12.2 | 29–76 | 5.76 | 68.0 | 1.84 |
| movie_scores_-_romance | 160 | 98 | 4/4 | bridge | 11.0 | 36–76 | 5.97 | 63.4 | 2.68 |
| movie_scores_-_sci-fi | 160 | 88 | 4/4 | theme | 9.5 | 28–80 | 10.75 | 56.0 | 2.77 |
| movie_scores_-_suspense | 200 | 117 | 4/4 | theme | 10.2 | 26–80 | 8.17 | 66.3 | 2.03 |
| music_theory_examples | 20 | 112 | 4/4 | unclassified | 7.8 | 36–67 | 4.60 | 85.3 | 2.84 |
| neo_soul | 200 | 78 | 4/4 | verse | 15.8 | 36–76 | 7.75 | 83.1 | 2.75 |
| new_wave | 200 | 110 | 4/4 | intro | 14.4 | 31–73 | 5.36 | 94.1 | 2.72 |
| piano_pop | 200 | 89 | 4/4 | intro | 14.9 | 36–69 | 7.00 | 76.8 | 2.44 |
| pop#rock | 226 | 125 | 4/4 | pre-chorus | 16.5 | 40–72 | 4.50 | 73.1 | 3.44 |
| power_ballads | 200 | 84 | 4/4 | intro | 14.5 | 29–70 | 8.00 | 89.1 | 2.82 |
| r&b_themes | 192 | 85 | 4/4 | verse | 12.5 | 37–72 | 5.88 | 68.9 | 2.81 |
| reggae | 200 | 136 | 4/4 | bridge | 10.9 | 45–73 | 5.24 | 76.8 | 1.41 |
| retro_soul | 200 | 104 | 4/4 | bridge | 13.4 | 38–67 | 4.83 | 87.5 | 2.80 |
| rnb | 200 | 94 | 4/4 | chorus | 19.6 | 39–75 | 5.89 | 87.2 | 2.66 |
| rock_ballads | 206 | 70 | 4/4 | intro | 12.2 | 36–71 | — | 48.0 | 3.60 |
| rock_opera | 200 | 127 | 4/4 | intro | 14.1 | 28–73 | 9.58 | 93.1 | 2.73 |
| seventies_pop | 200 | 121 | 4/4 | verse | 13.4 | 31–72 | 6.02 | 87.3 | 2.79 |
| seventies_prog | 206 | 114 | 4/4 | theme | 15.2 | 37–69 | 7.25 | 96.2 | 2.65 |
| shuffles | 200 | 122 | 4/4 | bridge | 13.1 | 33–67 | 3.04 | 98.3 | 2.47 |
| singer_songwriter | 200 | 81 | 4/4 | bridge | 14.4 | 39–70 | 3.98 | 70.6 | 2.42 |
| sixties_pop | 200 | 112 | 4/4 | pre-chorus | 15.4 | 36–67 | 3.40 | 96.5 | 2.59 |
| soul_organ | 200 | 88 | 4/4 | pre-chorus | 13.1 | 50–88 | 7.00 | 87.7 | 4.03 |
| synth_pop | 320 | 110 | 4/4 | bridge | 6.9 | 48–76 | 6.75 | 90.4 | 1.92 |
| synthwave | 450 | 119 | 4/4 | bridge | 7.2 | 45–68 | 5.50 | 90.4 | 2.48 |
| traditional_gospel | 188 | 120 | 4/4 | chorus | 13.5 | 50–74 | 4.15 | 73.9 | 2.26 |
| tropical_house | 200 | 118 | 4/4 | unclassified | 6.7 | 57–74 | 2.00 | 100.2 | 0.73 |
| uk_pop | 200 | 115 | 4/4 | verse | 12.0 | 37–75 | 7.44 | 71.6 | 1.96 |
| urban_jazz | 200 | 95 | 4/4 | pre-chorus | 13.0 | 38–67 | 2.92 | 98.8 | 2.32 |
| west_coast_rock | 200 | 104 | 4/4 | bridge | 15.6 | 38–67 | 3.73 | 89.9 | 2.88 |
| world_music | 200 | 95 | 4/4 | unclassified | 13.1 | 31–70 | 6.08 | 73.6 | 2.62 |
## Musical interpretation

1. **A strong common meter base with meaningful exceptions.** 4/4 is 86.4% of the files, but 6/8 and 3/4 together account for about 11.2%; rarer meters (including 5/4, 7/8, 12/8 and 11/8) are present. Any role-aware generator should derive pulse/subdivision from the actual meter rather than assume 4/4.
2. **Patterns are usually short, but not uniformly so.** The 4–8-bar span is the dominant region. Some files are tiny motifs or partial fills; some extend to 16+ bars. Normalize density/shape per bar or phrase, not by raw note count, and preserve the source phrase length.
3. **The section labels support a role curve, not a fixed ranking.** In pooled data (not paired by style/meter), chorus medians are denser and louder than verse/intro (14.9 vs 13.1/11.1 notes per bar; median file-mean velocity 84.1 vs 78.2/72.4). Pre-chorus is already comparatively dense (13.1) and energetic (82.5), so it should build toward chorus instead of being treated as a quiet verse. Bridges and outros vary substantially by style; do not hard-code “bridge = sparse”.
4. **Register and texture are part of the reference.** Typical pitch spans are broad enough for bass + chord/melody layers; the corpus median span is 34 semitones. Among files with at least two simultaneous attack stacks, the nearest matched pitch movement has a 5.68-semitone median; this is a structural proxy, not proof of semantic voice-leading. At the same time, source families differ sharply: keyboard-only organ/mallet parts can sit much higher than bass-oriented files. Use pitch-register and polyphony as matching features, not a single genre tag.
5. **Groove cannot be reduced to swing.** Median 20.5% of note starts depart from a straight sixteenth grid; this mixes intentional swing, triplets, tuplets, expressive placement, and quantization choices. Store rhythmic event positions at a fine normalized grid and separately estimate swing/long-short ratio where there is enough evidence.
6. **Motif repetition is common but exact phrase repetition is not universal.** The repeated onset-signature median is 37.5% of bars, but the metric intentionally ignores pitch and duration. Preserve a recognisable rhythmic family across a song while allowing role-specific transformations; do not blindly repeat exact notes.

## B-39 recommendations/specification

### Keep the existing scope and compatibility boundary

- Apply only to **newly generated** auto plans; do not rewrite existing songs/plans on load. Retain the shared `phraseSeed` family continuity already prototyped in 0.800. Manual per-cell patterns continue to override generation.
- Continue name-based role recognition for `Custom` sections, but broaden aliases and make the inferred role visible/testable. Suggested canonical roles: intro, verse, pre-chorus, chorus, bridge, solo, breakdown, outro/ending, fill/transition, neutral-custom. Unknown names must stay neutral rather than silently become verse/chorus.

### Use a compact reference descriptor rather than copying MIDI

For every available pattern/reference compute a normalized descriptor: meter and pulse family; length in bars; velocity-weighted onset vector at 16th/12th/triplet-capable resolution; beat/subdivision accent weights; gap and syncopation profile; optional swing ratio; notes per beat/bar; pitch-register bands and span; polyphony; note-duration/articulation distribution; velocity mean/range; and filename-derived role/style. The 0.801 prototype uses the compact attack-phase, relative-density, velocity and mean-pitch proxies; richer descriptors remain future work. Match by **meter first**, then tempo-neighborhood and rhythmic/textural distance; style name is a weak prior, not the only match criterion. Never copy the reference note sequence into generated output.

### Phrase progression and role envelope

- Keep a song-level rhythmic-family ID/seed; generate section variations from that family with bounded changes (density, register, articulation, accents, and occasional fill), rather than independent random patterns per section.
- Normalize each feature against genre/style + meter baseline before applying role offsets; use relative z-scores/percentiles so a “full” chorus in a sparse ambient style is not mistaken for a “full” chorus in funk.
- Suggested initial relative targets (calibrate from per-style paired data before final weights): intro lower density/velocity; verse near baseline; pre-chorus incremental rise in density/velocity and/or register; chorus strongest average accent/density with larger voicing span; bridge is **contrastive**, not automatically quieter; outro/ending reduces density or resolves. Keep all offsets bounded and expose saturation as the existing user control.
- Use phrase-length-aware development: preserve motifs over repeated bars, vary only selected onset/voicing accents on repeats, and add fills at section boundaries rather than uniformly across every bar. Use deterministic seeds so regenerate/save/undo remain stable.
- For every generated section preserve meter, chord compatibility, playable pitch span, and acoustic polyphony limits. Use smooth voice-leading between adjacent chords/sections; do not add notes beyond the actual chord tones/extensions available.

### Validation / acceptance criteria

- Unit tests: meter groups including 4/4, 3/4, 6/8, 12/8, 5/4 and odd meters; same seed preserves family across roles; role transitions change only the intended feature envelope; repeated section remains recognisable; style baselines do not collapse to one generic groove; custom-name aliases + unknown fallback; user saturation; manual override; seeded reproducibility; legacy song byte/data preservation.
- Offline corpus evaluation: report descriptor-distance and section-role feature deltas by style/meter; test every one of the 109 folders (not just a single demo genre); keep an independent held-out set of MIDI references.
- Human listening gate remains required for musical acceptance; this audit verifies MIDI structure/statistics, not whether the generated accompaniment sounds good.

## Full per-file data

`ezkeys-corpus-features.csv` has one row per parsed MIDI file (24,285 rows) with path, label, tempo, meter, length, note density, attacks, register, dynamics, polyphony, timing-grid deviation, and repetition features. `analyze_ezkeys_corpus.py` is the reproducible read-only parser (requires Python package `mido`; pass the ZIP path as its first argument). Raw event sequences are deliberately not copied into the app or prototype.
