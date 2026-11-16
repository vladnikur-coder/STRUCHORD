# Auto-Sync 0.829: design and Oasis acceptance report

Status: **integrated in STRUCHORD 0.829**. Playback timing is unchanged; Auto-Sync writes ordinary Sync Points only after explicit Apply.

## Architecture

1. **Input and lifetime**
   - Accept the `AudioBuffer` already produced by the existing backing-track decoder.
   - Never decode the file a second time.
   - Process in short cooperative slices (`setTimeout(0)` checkpoints) and report stage progress.

2. **Attack curve and tempo**
   - Downmix in memory and derive multiband energy with a seven-band one-pole filter bank.
   - Build an adaptively whitened attack curve at about 5 ms per frame.
   - Estimate the pulse by normalized autocorrelation, using the score BPM only as an octave/range prior.
   - Fit local tempo in overlapping windows of about 30 seconds.

3. **Beat grid**
   - Find pulse phase from the attack curve.
   - Snap expected beats to nearby attacks and fit a robust straight line for steady-tempo mode.
   - In follow mode, smooth local beat residuals and limit acceleration so fills cannot kink the map.

4. **First beat and score phase**
   - Flatten the actual repeated score into quarter-note/event positions.
   - Compute chroma from an in-module radix-2 FFT; no external DSP library.
   - Skip the first quarter of each event as a transition and compare the remaining chroma with major, minor, 7, and add9 templates.
   - Test possible beat/bar offsets and choose by full-song harmonic agreement, not kick/snare accent.
   - Snap the selected first beat to the strongest nearby transient and refine exact tempo against score-event attacks.
   - If the best-vs-second harmonic margin is below 0.035, return 2–3 candidates for audition instead of silently choosing.

5. **Points and safety**
   - Convert the map to ordinary `{bar, time}` Sync Points.
   - Use a 20 ms Ramer–Douglas–Peucker tolerance on bar-boundary times; a straight recording therefore needs only two points.
   - Accept an optional bar range. Integration will replace only points inside that range and retain manual points outside it.
   - Report weak harmonic windows as mismatch regions rather than stretching them silently.
   - Return `shouldApply: false` when attack, tempo, or harmony confidence is low.

## Real-song result

Input: embedded **Oasis — Don’t Look Back in Anger**, 44.1 kHz, 289.593469 s. Mode: **Steady tempo**.

| Measurement | Result |
|---|---:|
| Global tempo | **81.392371 BPM** |
| First score beat | **0.303186 s** |
| Local-tempo standard deviation | **0.057825 BPM** |
| Harmonic match | **0.651925** |
| Best-vs-second harmonic gap | **0.070521** |
| Overall confidence | **0.670193** (reliable, not low) |
| Reliable score changes checked | **110** |
| Changes within 30 ms | **90.91%** |
| Median change/attack error | **11.96 ms** |
| 90th-percentile error | **29.71 ms** |
| Structural mismatch regions | **0** |

### Proposed Sync Points

| Bar | Time | BPM to next point |
|---:|---:|---:|
| 0 | **0.303186 s** | **81.392371** |
| 96 | **283.376400 s** | — |

The single interval covers all 384 score quarters. Since the same fitted line controls the start and the end, there is no accumulated synth drift hidden by intermediate anchors.

### First-beat candidates

| Rank | Score start | Beat offset | Harmonic score |
|---:|---:|---:|---:|
| 1 | **0.303186 s** | 0 | **0.651925** |
| 2 | 12.109898 s | +16 | 0.581403 |
| 3 | 1.069921 s | +1 | 0.577198 |

The 0.0705 gap is above the ambiguity threshold, so this recording can be selected automatically. A repetitive/ambiguous recording would instead show these candidates with audition buttons.

### Follow-recording mode on the same song

The live-tempo path also simplifies to two points because the detected tempo is effectively straight:

| Bar | Time | BPM to next point |
|---:|---:|---:|
| 0 | **0.308551 s** | **81.394680** |
| 96 | **283.373734 s** | — |

## Implemented interface

- **“Авто-синхронизация”** is available beside the existing point controls.
- The preview panel provides:
  - segmented mode control: **“Ровный темп” / “Следовать за записью”**;
  - scope: **whole song / selected bar range**;
  - cancellable stage progress;
  - confidence, warnings, mismatch ranges, and a table of proposed points/BPM intervals;
  - candidate cards with **“Прослушать”** when phase is ambiguous;
  - manual first-beat nudge in milliseconds;
  - **“Применить”** and **“Отмена”**.
- Draw proposed points and mismatch ranges as a temporary overlay; do not mutate the song during analysis.
- Apply calls the existing edit capture once, stores ordinary Sync Points, and redraws. Existing Undo and manual point editing continue to work unchanged.

## Implementation and acceptance files

- `dev/autosync-analyzer.js` — dependency-free, cooperative analysis module.
- `dev/tools/autosync-oasis-report.js` — real-MP3 acceptance harness; Chromium is used only to supply the decoded `AudioBuffer`.
