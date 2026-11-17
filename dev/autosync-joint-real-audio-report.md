# Joint Auto-Sync real-audio report

Date: 2026-11-12

The BPM-invariance matrix below was produced by the standalone development
analyzer before integration. Chromium was used only to decode each project's
embedded MP3 to an `AudioBuffer`. The same engine is now inlined in
`STRUCHORD.html`; its integrated preview/Apply/Undo path was then run separately
on both recordings with the same numerical results.

Command:

```sh
node dev/tools/autosync-joint-report.js --matrix
```

The search range was 45–220 BPM and 0–15 seconds. Project BPM was not used as a
prior or ranking term.

## Results

| Recording | Project BPM input | Detected BPM | First bar | Sync Points `(bar, time)` | Confidence |
|---|---:|---:|---:|---|---:|
| Король и Шут — Прыгну со скалы | 100 | 151.98 | 0.550 s | `(0, 0.550)`, `(54, 85.892)`, `(119, 188.537)` | 0.931 |
| Король и Шут — Прыгну со скалы | 120 | 151.98 | 0.550 s | `(0, 0.550)`, `(54, 85.892)`, `(119, 188.537)` | 0.931 |
| Король и Шут — Прыгну со скалы | 180 | 151.98 | 0.550 s | `(0, 0.550)`, `(54, 85.892)`, `(119, 188.537)` | 0.931 |
| Oasis — Don't Look Back in Anger | 100 | 81.40 | 0.310 s | `(0, 0.310)`, `(96, 283.357)` | 0.869 |
| Oasis — Don't Look Back in Anger | 120 | 81.40 | 0.310 s | `(0, 0.310)`, `(96, 283.357)` | 0.869 |
| Oasis — Don't Look Back in Anger | 180 | 81.40 | 0.310 s | `(0, 0.310)`, `(96, 283.357)` | 0.869 |

For «Прыгну со скалы», the stable section correction at bar 54 is about 67 ms;
the resulting smoothed segment tempos are 151.8604 and 151.9800 BPM. Oasis has
no sustained section deviation above 50 ms, so only the start and end points are
proposed.

The best competing tempo farther than 3% was 158.40 BPM for «Прыгну со скалы»
and 84.63 BPM for Oasis. The centered onset autocorrelation is diagnostic only;
with recognized chords, it does not participate in candidate ranking.

## Integrated UI verification

`dev/tools/autosync-oasis-ui-check.js` was run against each real project after
inlining the engine. It verified preview-without-mutation, the expected BPM,
first bar and point count, Apply, one-step Undo, the 390 px layout, low-confidence
best-result Apply, and joint tempo/grid recalculation after dragging bar 1.

- «Прыгну со скалы»: 151.98 BPM, 0.550 s, 3 applied points, confidence 93%.
- Oasis: 81.40 BPM, 0.310 s, 2 applied points, confidence 87%.

A real-audio fixed-start rerun for «Прыгну со скалы» at 0.600 s returned
152.00 BPM and rebuilt the endpoint at 188.495 s. This verifies that a manual
bar-1 move re-estimates tempo/grid rather than translating the previous points.
