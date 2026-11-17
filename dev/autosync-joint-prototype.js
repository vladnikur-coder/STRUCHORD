/*
 * Joint tempo/downbeat search for STRUCHORD Auto-Sync.
 *
 * This layer reuses the dependency-free DSP feature extractors, accepts an
 * already decoded AudioBuffer, and has no decoder or external libraries. It is
 * loaded after the DSP module and becomes the application's public analyzer.
 */
(function attachJointPrototype(root, factory) {
  const base = root && root.StruChordAutoSyncAnalyzer;
  const api = factory(base);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.StruChordJointAutoSyncPrototype = api;
    root.StruChordAutoSyncAnalyzer = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function jointPrototypeFactory(base) {
  'use strict';

  if (!base || !base._prototypeInternals) throw new Error('Load autosync-analyzer.js before the joint prototype.');
  const internals = base._prototypeInternals;
  const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const median = (values) => {
    if (!values.length) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length & 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };
  const percentile = (values, fraction) => {
    if (!values.length) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const at = clamp(fraction, 0, 1) * (sorted.length - 1);
    const lo = Math.floor(at), hi = Math.ceil(at);
    return lerp(sorted[lo], sorted[hi], at - lo);
  };

  function makeScheduler(options) {
    const budget = Math.max(4, Number(options && options.workBudgetMs) || 12);
    const progress = options && typeof options.onProgress === 'function' ? options.onProgress : null;
    let lastYield = performance.now();
    return async (stage, fraction) => {
      if (options && typeof options.isCancelled === 'function' && options.isCancelled()) {
        const error = new Error('Joint Auto-Sync cancelled'); error.name = 'AbortError'; throw error;
      }
      if (progress) progress({ stage, fraction: clamp(Number(fraction) || 0, 0, 1) });
      if (performance.now() - lastYield >= budget) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        lastYield = performance.now();
      }
    };
  }

  function buildChromaPrefix(chroma) {
    const prefix = new Float64Array((chroma.frameCount + 1) * 12);
    for (let frame = 0; frame < chroma.frameCount; frame++) {
      const before = frame * 12, after = (frame + 1) * 12;
      for (let pitch = 0; pitch < 12; pitch++) prefix[after + pitch] = prefix[before + pitch] + chroma.frames[before + pitch];
    }
    return prefix;
  }

  function normalizedChroma(prepared, fromTime, toTime) {
    const chroma = prepared.chroma;
    const first = Math.max(0, Math.ceil((fromTime - chroma.windowSeconds / 2) / chroma.hopSeconds));
    const after = Math.min(chroma.frameCount, Math.floor((toTime - chroma.windowSeconds / 2) / chroma.hopSeconds) + 1);
    const count = after - first;
    if (count <= 0) return null;
    const vector = new Float64Array(12);
    let floor = Infinity;
    for (let pitch = 0; pitch < 12; pitch++) {
      vector[pitch] = (prepared.chromaPrefix[after * 12 + pitch] - prepared.chromaPrefix[first * 12 + pitch]) / count;
      floor = Math.min(floor, vector[pitch]);
    }
    let norm = 0;
    for (let pitch = 0; pitch < 12; pitch++) { vector[pitch] = Math.max(0, vector[pitch] - floor); norm += vector[pitch] ** 2; }
    norm = Math.sqrt(norm) || 1;
    for (let pitch = 0; pitch < 12; pitch++) vector[pitch] /= norm;
    return vector;
  }

  function cosine(a, b) {
    if (!a || !b) return 0;
    let value = 0;
    for (let pitch = 0; pitch < 12; pitch++) value += a[pitch] * b[pitch];
    return value;
  }

  function sampleEvents(events, limit) {
    if (events.length <= limit) return events;
    const result = [], used = new Set();
    for (let index = 0; index < limit; index++) {
      const at = Math.round(index * (events.length - 1) / (limit - 1));
      if (!used.has(at)) { used.add(at); result.push(events[at]); }
    }
    return result;
  }

  function harmonyScore(prepared, bpm, startTime, subset) {
    const period = 60 / bpm;
    const events = subset || prepared.chordEvents;
    let weighted = 0, includedWeight = 0, possibleWeight = 0;
    for (const item of events) {
      const event = item.event;
      const baseWeight = Math.min(4, event.span);
      possibleWeight += baseWeight;
      const eventStart = startTime + event.q * period;
      const eventEnd = startTime + (event.q + event.span) * period;
      const analysisStart = eventStart + (eventEnd - eventStart) * 0.25;
      if (analysisStart < 0 || eventEnd > prepared.duration || eventEnd <= analysisStart) continue;
      const vector = normalizedChroma(prepared, analysisStart, eventEnd);
      if (!vector) continue;
      const durationWeight = Math.max(0.25, Math.min(1, (eventEnd - analysisStart) / 1.15));
      const weight = baseWeight * durationWeight;
      weighted += cosine(vector, item.template) * weight;
      includedWeight += weight;
    }
    const harmony = includedWeight ? weighted / includedWeight : 0;
    const coverage = possibleWeight ? Math.min(1, includedWeight / possibleWeight) : 0;
    const schemeEnd = startTime + prepared.score.totalQ * period;
    const durationRatio = schemeEnd / Math.max(0.1, prepared.duration);
    const durationPenalty = Math.abs(Math.log(Math.max(0.05, durationRatio)));
    return { harmony, coverage, durationRatio, rank: harmony * (0.72 + 0.28 * coverage) - 0.085 * durationPenalty };
  }

  function onsetStrength(prepared, time) {
    const curve = prepared.curve;
    const center = Math.round(time / curve.hopSeconds - 0.5);
    const radius = Math.max(1, Math.round(0.035 / curve.hopSeconds));
    let peak = 0;
    for (let index = Math.max(0, center - radius); index <= Math.min(curve.values.length - 1, center + radius); index++) peak = Math.max(peak, curve.values[index]);
    return clamp(Math.log1p(peak) / prepared.onsetLogScale, 0, 1.5) / 1.5;
  }

  function transitionStrength(prepared, time, beforeTemplate, afterTemplate, period) {
    const outer = clamp(period * 0.48, 0.20, 0.38);
    const gap = clamp(period * 0.09, 0.025, 0.055);
    const before = normalizedChroma(prepared, time - outer, time - gap);
    const after = normalizedChroma(prepared, time + gap, time + outer);
    if (!before || !after) return { change: 0, fit: 0 };
    const rawChange = clamp(1 - cosine(before, after), 0, 1);
    const change = clamp(rawChange / prepared.chromaChangeScale, 0, 1.5) / 1.5;
    const fit = beforeTemplate ? (cosine(before, beforeTemplate) + cosine(after, afterTemplate)) / 2 : cosine(after, afterTemplate);
    return { change, fit };
  }

  function boundaryScore(prepared, bpm, startTime) {
    const period = 60 / bpm;
    let weighted = 0, totalWeight = 0;
    for (const boundary of prepared.boundaries) {
      const time = startTime + boundary.q * period;
      if (time < 0.1 || time > prepared.duration - 0.4) continue;
      const onset = onsetStrength(prepared, time);
      const transition = transitionStrength(prepared, time, boundary.beforeTemplate, boundary.afterTemplate, period);
      const value = boundary.first
        ? 0.58 * onset + 0.42 * transition.fit
        : 0.30 * onset + 0.38 * transition.change + 0.32 * transition.fit;
      const weight = boundary.first ? 1.2 : 1;
      weighted += value * weight; totalWeight += weight;
    }
    return totalWeight ? weighted / totalWeight : 0;
  }

  function sectionOffsetReport(prepared, bpm, startTime) {
    const period = 60 / bpm;
    const observations = prepared.boundaries.filter((boundary) => !boundary.first).map((boundary) => {
      const predicted = startTime + boundary.q * period;
      const curve = prepared.curve;
      const from = Math.max(0, Math.floor((predicted - 0.12) / curve.hopSeconds));
      const to = Math.min(curve.values.length - 1, Math.ceil((predicted + 0.12) / curve.hopSeconds));
      let bestIndex = from, bestValue = -Infinity;
      for (let index = from; index <= to; index++) {
        const time = (index + 0.5) * curve.hopSeconds;
        const onset = clamp(Math.log1p(curve.values[index]) / prepared.onsetLogScale, 0, 1.5) / 1.5;
        // Chroma validates that this is a harmonic boundary; onset timing gives
        // the millisecond-scale offset that the coarse chroma hop cannot.
        const transition = transitionStrength(prepared, time, boundary.beforeTemplate, boundary.afterTemplate, period);
        const value = 0.64 * onset + 0.20 * transition.change + 0.16 * transition.fit;
        if (value > bestValue) { bestValue = value; bestIndex = index; }
      }
      const time = (bestIndex + 0.5) * curve.hopSeconds;
      return { ...boundary, predicted, time, offset: time - predicted, strength: bestValue };
    });

    const reports = prepared.sections.map((section, sectionIndex) => {
      const hits = observations.filter((item) => item.q >= section.startQ && item.q < section.endQ);
      const floor = percentile(hits.map((item) => item.strength), 0.30);
      const reliable = hits.filter((item) => item.strength >= floor);
      const offsets = reliable.map((item) => item.offset);
      const center = median(offsets);
      const deviations = offsets.map((value) => Math.abs(value - center));
      const mad = median(deviations);
      const support = offsets.length ? offsets.filter((value) => Math.abs(value - center) <= 0.050).length / offsets.length : 0;
      return {
        ...section, sectionIndex, observations: offsets.length, offset: center, mad,
        support, stable: offsets.length >= 3 && mad <= 0.040 && support >= 0.67,
      };
    });

    // A three-section weighted smoother rejects a fill or a single noisy
    // section. A tempo bend is considered confirmed only when an adjacent
    // section has a stable offset on the same side of the straight grid.
    for (let index = 0; index < reports.length; index++) {
      const nearby = reports.slice(Math.max(0, index - 1), Math.min(reports.length, index + 2)).filter((item) => item.stable);
      reports[index].smoothedOffset = nearby.length ? median(nearby.map((item) => item.offset)) : reports[index].offset;
      reports[index].confirmed = reports[index].stable && nearby.some((item) => item !== reports[index]
        && Math.sign(item.offset) === Math.sign(reports[index].offset)
        && Math.abs(item.offset) > 0.035);
    }
    return reports;
  }

  function proposeStablePoints(prepared, bpm, startTime) {
    const period = 60 / bpm;
    const sectionOffsets = sectionOffsetReport(prepared, bpm, startTime);
    const sustained = sectionOffsets
      .filter((item) => item.bar > 0 && item.bar < prepared.score.totalBars && item.confirmed && Math.abs(item.smoothedOffset) > 0.050)
      .sort((a, b) => a.bar - b.bar)
      // One point starts a sustained run; another point with essentially the
      // same correction would create a visually redundant BPM segment.
      .filter((item, index, rows) => !index || Math.abs(item.smoothedOffset - rows[index - 1].smoothedOffset) >= 0.030);
    const internal = sustained
      .sort((a, b) => Math.abs(b.smoothedOffset) - Math.abs(a.smoothedOffset))
      .slice(0, 2)
      .sort((a, b) => a.bar - b.bar)
      .map((item) => ({ bar: item.bar, q: item.startQ, time: startTime + item.startQ * period + item.smoothedOffset }));
    const lastStable = sectionOffsets.slice().reverse().find((item) => item.stable && item.confirmed);
    const endCorrection = lastStable && Math.abs(lastStable.smoothedOffset) > 0.050 ? lastStable.smoothedOffset : 0;
    const raw = [
      { bar: 0, q: 0, time: startTime },
      ...internal,
      { bar: prepared.score.totalBars, q: prepared.score.totalQ, time: startTime + prepared.score.totalQ * period + endCorrection },
    ];
    const points = raw.map((point, index) => {
      const next = raw[index + 1];
      return { bar: point.bar, q: point.q, time: point.time, bpmToNext: next ? 60 * (next.q - point.q) / (next.time - point.time) : null };
    });
    return { points, sections: sectionOffsets };
  }

  function restrictPointsToRange(score, points, fromBar, toBar) {
    const from = clamp(Math.floor(Number(fromBar) || 0), 0, score.totalBars);
    const to = clamp(Number.isFinite(Number(toBar)) ? Math.floor(Number(toBar)) : score.totalBars, from, score.totalBars);
    if (from === 0 && to === score.totalBars) return points;
    const qForBar = (bar) => {
      const exact = score.bars.find((item) => item.bar === bar);
      if (exact) return exact.q;
      return score.totalBars ? score.totalQ * bar / score.totalBars : 0;
    };
    const timeAtQ = (q) => {
      if (q <= points[0].q) return points[0].time;
      for (let index = 0; index + 1 < points.length; index++) {
        const a = points[index], b = points[index + 1];
        if (q <= b.q) return a.time + (q - a.q) * (b.time - a.time) / Math.max(1e-9, b.q - a.q);
      }
      return points[points.length - 1].time;
    };
    const fromQ = qForBar(from), toQ = qForBar(to);
    const selected = [
      { bar: from, q: fromQ, time: timeAtQ(fromQ) },
      ...points.filter((point) => point.bar > from && point.bar < to),
      { bar: to, q: toQ, time: timeAtQ(toQ) },
    ].filter((point, index, rows) => !index || point.bar !== rows[index - 1].bar);
    return selected.map((point, index) => {
      const next = selected[index + 1];
      return { ...point, bpmToNext: next ? 60 * (next.q - point.q) / (next.time - point.time) : null };
    });
  }

  function zeroMeanAutocorrelation(curve, minBpm, maxBpm) {
    const values = curve.values, hop = curve.hopSeconds;
    const center = mean(Array.from(values));
    const minLag = Math.max(2, Math.floor(60 / maxBpm / hop));
    const maxLag = Math.min(values.length - 2, Math.ceil(60 / minBpm / hop));
    let best = { bpm: 0, correlation: -Infinity, lag: 0 };
    const rows = [];
    for (let lag = minLag; lag <= maxLag; lag++) {
      let product = 0, left = 0, right = 0;
      for (let index = lag; index < values.length; index++) {
        const a = values[index] - center, b = values[index - lag] - center;
        product += a * b; left += a * a; right += b * b;
      }
      const correlation = product / Math.sqrt(Math.max(1e-12, left * right));
      const row = { bpm: 60 / (lag * hop), correlation, lag };
      rows.push(row);
      if (correlation > best.correlation) best = row;
    }
    rows.sort((a, b) => b.correlation - a.correlation);
    return { best, alternatives: rows.slice(0, 8) };
  }

  function distinctTempoSeeds(rows, count, separation) {
    const result = [];
    for (const row of rows.slice().sort((a, b) => b.rank - a.rank)) {
      if (result.every((item) => Math.abs(item.bpm - row.bpm) >= separation)) result.push(row);
      if (result.length >= count) break;
    }
    return result;
  }

  function pulseOnlyFallback(prepared, minBpm, maxBpm, options) {
    const choices = prepared.autocorrelation.alternatives.filter((item) => item.bpm >= minBpm && item.bpm <= maxBpm);
    const tempo = choices[0] || prepared.autocorrelation.best;
    const bpm = tempo.bpm, period = 60 / bpm, curve = prepared.curve;
    let phase = Number.isFinite(Number(options && options.fixedStart)) ? clamp(Number(options.fixedStart), 0, Math.min(15, prepared.duration)) : 0;
    let phaseScore = -Infinity;
    const phaseFrom = Number.isFinite(Number(options && options.fixedStart)) ? phase : 0;
    const phaseTo = Number.isFinite(Number(options && options.fixedStart)) ? phase + curve.hopSeconds / 2 : period;
    for (let candidate = phaseFrom; candidate < phaseTo; candidate += curve.hopSeconds) {
      let sum = 0, count = 0;
      for (let time = candidate; time < prepared.duration; time += period) { sum += onsetStrength(prepared, time); count++; }
      const value = count ? sum / count : 0;
      if (value > phaseScore) { phaseScore = value; phase = candidate; }
    }
    const fullPoints = [
      { bar: 0, q: 0, time: phase, bpmToNext: bpm },
      { bar: prepared.score.totalBars, q: prepared.score.totalQ, time: phase + prepared.score.totalQ * period, bpmToNext: null },
    ];
    const points = restrictPointsToRange(prepared.score, fullPoints, options && options.fromBar, options && options.toBar);
    return {
      mode: options && options.mode || 'steady', duration: prepared.duration,
      score: { bars: prepared.score.totalBars, quarters: prepared.score.totalQ, events: prepared.score.events.length },
      bpm, firstBar: phase, firstBeat: phase, points,
      tempo: { bpm, periodSeconds: period, local: [], localStdBpm: null },
      confidence: { overall: 0.28, harmony: 0, tempoMargin: 0, boundary: phaseScore, low: true, note: 'Проверьте на слух', reasons: ['Аккорды схемы не распознаны; темп оценён только по атакам. Проверьте на слух.'] },
      competitor: choices[1] ? { bpm: choices[1].bpm, firstBar: phase, score: choices[1].correlation, gap: tempo.correlation - choices[1].correlation } : null,
      alternatives: choices.slice(0, 5).map((item) => ({ bpm: item.bpm, startTime: phase, harmony: 0, boundary: phaseScore, score: item.correlation })),
      candidates: [{ startTime: phase, harmonyScore: 0, coverage: 0, points }],
      ambiguousStart: true, mismatches: { regions: [], beatResidualP90Ms: null },
      eventAttacks: { reliableChanges: 0, within30ms: 0, medianMs: null, p90Ms: null },
      shouldApply: true,
      diagnostics: {
        score: tempo.correlation, harmony: 0, coverage: 0, boundary: phaseScore,
        relativeTempoMargin: 0, autocorrelationHint: tempo, fallback: 'zero-mean-autocorrelation-no-recognized-chords',
        searched: { minBpm, maxBpm, startFrom: 0, startTo: Math.min(15, prepared.duration), projectBpmUsedAsPrior: false },
      },
    };
  }

  async function prepare(audioBuffer, song, inputOptions = {}) {
    if (!audioBuffer || typeof audioBuffer.getChannelData !== 'function') throw new TypeError('Auto-Sync expects an already decoded AudioBuffer.');
    const scheduler = makeScheduler(inputOptions);
    const score = base.flattenScore(song || {});
    if (!score.events.length || !(score.totalQ > 0)) throw new Error('В схеме нет событий для совместного поиска.');
    const curve = await internals.extractOnsetCurve(audioBuffer, scheduler);
    const chroma = await internals.extractChroma(audioBuffer, scheduler);
    const chordEvents = score.events.map((event) => ({ event, template: base.chordTemplate(event.chord) })).filter((item) => item.template);
    const boundaries = [];
    const sections = [];
    let previous = null, currentSection = null;
    for (const item of chordEvents) {
      if (!currentSection || item.event.section !== currentSection.name) {
        if (currentSection) currentSection.endQ = item.event.q;
        currentSection = { name: item.event.section, startQ: item.event.q, endQ: score.totalQ, bar: item.event.bar };
        sections.push(currentSection);
      }
      if (!previous) boundaries.push({ q: item.event.q, first: true, beforeTemplate: null, afterTemplate: item.template, section: item.event.section, bar: item.event.bar });
      else if (item.event.chord !== previous.event.chord) boundaries.push({ q: item.event.q, first: false, beforeTemplate: previous.template, afterTemplate: item.template, section: item.event.section, bar: item.event.bar });
      previous = item;
    }
    const onsetLogs = [];
    for (let index = 0; index < curve.values.length; index += 5) onsetLogs.push(Math.log1p(curve.values[index]));
    const changes = [];
    for (let frame = 1; frame < chroma.frameCount; frame++) {
      let dot = 0;
      for (let pitch = 0; pitch < 12; pitch++) dot += chroma.frames[(frame - 1) * 12 + pitch] * chroma.frames[frame * 12 + pitch];
      changes.push(clamp(1 - dot, 0, 1));
    }
    const prepared = {
      score, curve, chroma, duration: Number(audioBuffer.duration) || curve.duration,
      chromaPrefix: buildChromaPrefix(chroma), chordEvents, boundaries, sections,
      coarseEvents: sampleEvents(chordEvents, 48),
      onsetLogScale: Math.max(0.05, percentile(onsetLogs, 0.92)),
      chromaChangeScale: Math.max(0.04, percentile(changes, 0.85)),
    };
    prepared.autocorrelation = zeroMeanAutocorrelation(curve, 45, 220);
    return prepared;
  }

  async function search(prepared, inputOptions = {}) {
    const scheduler = makeScheduler(inputOptions);
    const minBpm = clamp(Number(inputOptions.minBpm) || 45, 35, 260);
    const maxBpm = clamp(Number(inputOptions.maxBpm) || 220, minBpm + 1, 280);
    const maxStart = Math.min(15, Math.max(0, prepared.duration - 1));
    const fixedStart = Number.isFinite(Number(inputOptions.fixedStart)) ? clamp(Number(inputOptions.fixedStart), 0, maxStart) : null;
    if (!prepared.chordEvents.length) return pulseOnlyFallback(prepared, minBpm, maxBpm, inputOptions);
    const coarseRows = [];
    const bpmStep = 0.5, startStep = fixedStart == null ? 0.20 : 1;
    const bpmCount = Math.floor((maxBpm - minBpm) / bpmStep) + 1;
    for (let bi = 0; bi < bpmCount; bi++) {
      const bpm = minBpm + bi * bpmStep;
      let best = null;
      const starts = fixedStart == null ? Math.floor(maxStart / startStep) + 1 : 1;
      for (let si = 0; si < starts; si++) {
        const startTime = fixedStart == null ? si * startStep : fixedStart;
        const scored = harmonyScore(prepared, bpm, startTime, prepared.coarseEvents);
        const row = { bpm, startTime, ...scored };
        if (!best || row.rank > best.rank) best = row;
      }
      coarseRows.push(best);
      if (!(bi % 8)) await scheduler('joint-coarse', bi / bpmCount);
    }

    const seeds = distinctTempoSeeds(coarseRows, 18, 1.0);
    const refined = [];
    const seen = new Set();
    for (let seedIndex = 0; seedIndex < seeds.length; seedIndex++) {
      const seed = seeds[seedIndex];
      for (let bpm = seed.bpm - 1; bpm <= seed.bpm + 1 + 1e-9; bpm += 0.05) {
        if (bpm < minBpm || bpm > maxBpm) continue;
        const fromStart = fixedStart == null ? Math.max(0, seed.startTime - 0.45) : fixedStart;
        const toStart = fixedStart == null ? Math.min(maxStart, seed.startTime + 0.45) : fixedStart;
        for (let startTime = fromStart; startTime <= toStart + 1e-9; startTime += fixedStart == null ? 0.025 : 1) {
          const key = `${bpm.toFixed(3)}:${startTime.toFixed(3)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const scored = harmonyScore(prepared, bpm, startTime);
          refined.push({ bpm, startTime, ...scored });
        }
      }
      await scheduler('joint-refine', (seedIndex + 1) / seeds.length);
    }

    const phaseSeeds = distinctTempoSeeds(refined, 10, 0.55);
    const finalRows = [];
    const finalSeen = new Set();
    for (let seedIndex = 0; seedIndex < phaseSeeds.length; seedIndex++) {
      const seed = phaseSeeds[seedIndex];
      for (let bpm = seed.bpm - 0.18; bpm <= seed.bpm + 0.18 + 1e-9; bpm += 0.01) {
        if (bpm < minBpm || bpm > maxBpm) continue;
        const radius = fixedStart == null ? Math.max(0.12, 60 / bpm * 1.1) : 0;
        const fromStart = fixedStart == null ? Math.max(0, seed.startTime - radius) : fixedStart;
        const toStart = fixedStart == null ? Math.min(maxStart, seed.startTime + radius) : fixedStart;
        for (let startTime = fromStart; startTime <= toStart + 1e-9; startTime += fixedStart == null ? 0.01 : 1) {
          const key = `${bpm.toFixed(3)}:${startTime.toFixed(3)}`;
          if (finalSeen.has(key)) continue;
          finalSeen.add(key);
          const harmonic = harmonyScore(prepared, bpm, startTime);
          const boundary = boundaryScore(prepared, bpm, startTime);
          finalRows.push({ bpm, startTime, ...harmonic, boundary, rank: harmonic.rank + 0.14 * boundary });
        }
      }
      await scheduler('joint-phase', (seedIndex + 1) / phaseSeeds.length);
    }
    finalRows.sort((a, b) => b.rank - a.rank);
    const best = finalRows[0] || refined.sort((a, b) => b.rank - a.rank)[0];
    if (!best) throw new Error('Совместный поиск не дал кандидатов.');

    // A competing tempo must be genuinely different, not an adjacent sample of
    // the same peak. Keep distant harmonic peaks in this comparison even when
    // they did not make the small final phase-refinement set.
    const distant = finalRows.filter((row) => Math.abs(row.bpm - best.bpm) / best.bpm > 0.03);
    const distantRefined = refined
      .filter((row) => Math.abs(row.bpm - best.bpm) / best.bpm > 0.03)
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 12)
      .map((row) => {
        const boundary = boundaryScore(prepared, row.bpm, row.startTime);
        return { ...row, boundary, rank: row.rank + 0.14 * boundary };
      });
    const competitor = distant.concat(distantRefined).sort((a, b) => b.rank - a.rank)[0] || null;
    const tempoMargin = competitor ? Math.max(0, best.rank - competitor.rank) : 0;
    const relativeMargin = tempoMargin / Math.max(0.05, Math.abs(best.rank));
    const harmonyConfidence = clamp((best.harmony - 0.42) / 0.30, 0, 1);
    const marginConfidence = clamp(relativeMargin / 0.08, 0, 1);
    const boundaryConfidence = clamp((best.boundary - 0.30) / 0.35, 0, 1);
    const confidence = clamp(0.58 * harmonyConfidence + 0.30 * marginConfidence + 0.12 * boundaryConfidence, 0, 1);

    const proposal = proposeStablePoints(prepared, best.bpm, best.startTime);
    const points = restrictPointsToRange(prepared.score, proposal.points, inputOptions.fromBar, inputOptions.toBar);
    const alternativeRows = distinctTempoSeeds(competitor ? finalRows.concat([competitor]) : finalRows, 5, Math.max(1.5, best.bpm * 0.031));
    const alternatives = alternativeRows.map((row) => ({
      bpm: row.bpm, startTime: row.startTime, harmony: row.harmony, boundary: row.boundary, score: row.rank,
    }));
    const candidates = alternativeRows.map((row, index) => {
      const candidateProposal = index === 0 ? proposal : proposeStablePoints(prepared, row.bpm, row.startTime);
      return {
        bpm: row.bpm, startTime: row.startTime, harmonyScore: row.harmony, coverage: row.coverage,
        points: restrictPointsToRange(prepared.score, candidateProposal.points, inputOptions.fromBar, inputOptions.toBar),
      };
    });
    const lowConfidence = confidence < 0.52;
    const reasons = [
      ...(harmonyConfidence < 0.35 ? ['Гармония записи слабо совпадает с аккордами схемы.'] : []),
      ...(marginConfidence < 0.35 ? ['У конкурирующего темпа близкая оценка.'] : []),
      ...(boundaryConfidence < 0.30 ? ['Атаки на сменах аккордов выражены слабо.'] : []),
      ...(lowConfidence ? ['Проверьте результат на слух.'] : []),
    ];
    const sectionErrors = proposal.sections.filter((item) => item.stable).map((item) => Math.abs(item.offset));
    return {
      mode: inputOptions.mode === 'follow' ? 'follow' : 'steady',
      duration: prepared.duration,
      score: { bars: prepared.score.totalBars, quarters: prepared.score.totalQ, events: prepared.score.events.length },
      bpm: best.bpm,
      firstBar: best.startTime,
      firstBeat: best.startTime,
      points,
      tempo: { bpm: best.bpm, periodSeconds: 60 / best.bpm, local: points.slice(0, -1).map((point) => ({ bar: point.bar, bpm: point.bpmToNext })), localStdBpm: 0 },
      confidence: {
        overall: confidence, harmony: harmonyConfidence, tempoMargin: marginConfidence,
        candidateMargin: marginConfidence, boundary: boundaryConfidence, attacks: boundaryConfidence,
        tempoStability: 1, low: lowConfidence, note: lowConfidence ? 'Проверьте на слух' : '', reasons,
      },
      competitor: competitor && { bpm: competitor.bpm, firstBar: competitor.startTime, score: competitor.rank, gap: tempoMargin },
      alternatives,
      candidates,
      ambiguousStart: marginConfidence < 0.35,
      mismatches: { regions: [], beatResidualP90Ms: percentile(sectionErrors, 0.90) * 1000 },
      eventAttacks: {
        reliableChanges: proposal.sections.reduce((sum, item) => sum + item.observations, 0),
        within30ms: sectionErrors.length ? sectionErrors.filter((value) => value <= 0.030).length / sectionErrors.length : 0,
        medianMs: percentile(sectionErrors, 0.50) * 1000, p90Ms: percentile(sectionErrors, 0.90) * 1000,
      },
      // Low confidence is a warning, not a refusal. The best candidate remains
      // applicable and the draggable first-bar handle is always available.
      shouldApply: true,
      diagnostics: {
        score: best.rank, harmony: best.harmony, coverage: best.coverage, durationRatio: best.durationRatio,
        boundary: best.boundary, relativeTempoMargin: relativeMargin,
        sectionOffsets: proposal.sections.map((item) => ({
          name: item.name, bar: item.bar, observations: item.observations,
          offsetMs: item.offset * 1000, smoothedOffsetMs: item.smoothedOffset * 1000,
          madMs: item.mad * 1000, support: item.support, stable: item.stable, confirmed: item.confirmed,
        })),
        autocorrelationHint: prepared.autocorrelation.best,
        searched: { minBpm, maxBpm, startFrom: fixedStart == null ? 0 : fixedStart, startTo: fixedStart == null ? maxStart : fixedStart, projectBpmUsedAsPrior: false },
      },
    };
  }

  async function analyze(audioBuffer, song, options = {}) {
    const prepared = await prepare(audioBuffer, song, options);
    if (typeof options.onPrepared === 'function') options.onPrepared(prepared);
    return search(prepared, options);
  }

  return { prepare, search, analyze };
});
