/*
 * STRUCHORD Auto-Sync analysis engine.
 *
 * Deliberately independent from STRUCHORD.html: this module accepts an already
 * decoded AudioBuffer plus a plain song object and returns proposed ordinary
 * Sync Points. It has no decoder and no external dependencies. Long loops yield
 * to the event loop so the same implementation can later run in the editor.
 */
(function attachAutoSync(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StruChordAutoSyncAnalyzer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function autoSyncFactory() {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
  const lerp = (a, b, t) => a + (b - a) * t;
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
  const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const stddev = (values, center = mean(values)) => values.length
    ? Math.sqrt(values.reduce((sum, value) => sum + (value - center) ** 2, 0) / values.length) : 0;

  function createWorkScheduler(options, progress) {
    const budgetMs = Math.max(4, Number(options.workBudgetMs) || 12);
    let lastYield = performance.now();
    return async function checkpoint(stage, fraction) {
      if (typeof options.isCancelled === 'function' && options.isCancelled()) {
        const error = new Error('Auto-Sync cancelled');
        error.name = 'AbortError';
        throw error;
      }
      if (progress) progress({ stage, fraction: clamp(Number(fraction) || 0, 0, 1) });
      const now = performance.now();
      if (now - lastYield >= budgetMs) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        lastYield = performance.now();
      }
    };
  }

  function parseTimeSignature(value) {
    const match = String(value || '4/4').match(/(\d+)\s*\/\s*(\d+)/);
    const numerator = match ? Math.max(1, Number(match[1])) : 4;
    const denominator = match ? Math.max(1, Number(match[2])) : 4;
    return { numerator, denominator };
  }

  function flattenScore(song) {
    const supplied = song && song.autoSyncGrid;
    if (supplied && Array.isArray(supplied.events) && Array.isArray(supplied.bars) && Number(supplied.totalQ) > 0) {
      return {
        events: supplied.events.map(event=>({q:Number(event.q)||0,span:Math.max(1/64,Number(event.span)||1),chord:String(event.chord||''),section:String(event.section||''),bar:Math.max(0,Math.floor(Number(event.bar)||0))})),
        bars: supplied.bars.map(point=>({bar:Math.max(0,Math.floor(Number(point.bar)||0)),q:Number(point.q)||0})),
        totalQ: Number(supplied.totalQ), totalBars: Math.max(0,Math.floor(Number(supplied.totalBars)||0))
      };
    }
    const events = [];
    const bars = [{ bar: 0, q: 0 }];
    let q = 0, bar = 0;
    for (const section of (song && song.sections) || []) {
      const signature = parseTimeSignature(section.timeSig || song.globalTimeSig || '4/4');
      const unit = 4 / signature.denominator;
      const barQuarters = signature.numerator * unit;
      const sectionRepeats = Math.max(1, Number(section.repeat) || 1);
      for (let sectionPass = 0; sectionPass < sectionRepeats; sectionPass++) {
        let nextBoundary = q + barQuarters;
        let lastBoundary = q;
        for (const square of section.squares || []) {
          const squareRepeats = Math.max(1, Number(square.repeat) || 1);
          for (let squarePass = 0; squarePass < squareRepeats; squarePass++) {
            let local = 0;
            for (const event of square.events || []) {
              const span = Math.max(1 / 64, Number(event && event.span) || 1) * unit;
              events.push({
                q: q + local,
                span,
                chord: String(event && event.chord || '').trim(),
                section: String(section.type || section.name || ''),
                bar: bar + Math.floor(local / barQuarters),
              });
              local += span;
            }
            if (!(local > 0)) local = barQuarters;
            const endQ = q + local;
            while (nextBoundary <= endQ + 1e-7) {
              bar++;
              bars.push({ bar, q: nextBoundary });
              lastBoundary = nextBoundary;
              nextBoundary += barQuarters;
            }
            q = endQ;
          }
        }
        if (q > lastBoundary + 1e-7) {
          bar++;
          bars.push({ bar, q });
        }
      }
    }
    return { events, bars, totalQ: q, totalBars: bar };
  }

  async function extractOnsetCurve(audioBuffer, scheduler) {
    const sampleRate = Number(audioBuffer.sampleRate);
    const length = Number(audioBuffer.length);
    const channels = Math.max(1, Number(audioBuffer.numberOfChannels) || 1);
    const channelData = [];
    for (let channel = 0; channel < channels; channel++) channelData.push(audioBuffer.getChannelData(channel));

    // Five milliseconds keeps phase resolution below the requested 10–20 ms.
    const hop = Math.max(64, Math.round(sampleRate * 0.005));
    const hopSeconds = hop / sampleRate;
    const frameCount = Math.ceil(length / hop);
    const cutoffs = [110, 240, 520, 1100, 2300, 4800, Math.min(9000, sampleRate * 0.42)]
      .filter((value, index, list) => value > 0 && value < sampleRate * 0.48 && (!index || value > list[index - 1]));
    const alpha = cutoffs.map((frequency) => 1 - Math.exp(-TAU * frequency / sampleRate));
    const states = new Float64Array(alpha.length);
    const energy = new Float64Array(alpha.length + 1);
    const previousLogEnergy = new Float64Array(energy.length);
    const rawFlux = new Float32Array(frameCount);
    const bandWeights = Array.from({ length: energy.length }, (_, index) => index === 0 ? 1.15 : 1 + index * 0.07);

    let frame = 0, samplesInFrame = 0;
    for (let index = 0; index < length; index++) {
      let sample = 0;
      for (let channel = 0; channel < channels; channel++) sample += channelData[channel][index] || 0;
      sample /= channels;
      let previousLow = 0;
      for (let band = 0; band < alpha.length; band++) {
        states[band] += alpha[band] * (sample - states[band]);
        const value = states[band] - previousLow;
        energy[band] += value * value;
        previousLow = states[band];
      }
      const high = sample - states[states.length - 1];
      energy[energy.length - 1] += high * high;
      samplesInFrame++;
      if (samplesInFrame >= hop || index === length - 1) {
        let flux = 0;
        for (let band = 0; band < energy.length; band++) {
          const logEnergy = Math.log(1e-10 + energy[band] / samplesInFrame);
          const delta = logEnergy - previousLogEnergy[band];
          if (frame && delta > 0) flux += bandWeights[band] * delta;
          previousLogEnergy[band] = logEnergy;
          energy[band] = 0;
        }
        rawFlux[frame++] = flux;
        samplesInFrame = 0;
      }
      if (!(index % 65536)) await scheduler('onsets', index / length);
    }

    // Adaptive whitening: subtract a centred 0.7 s baseline and divide by the
    // local spread. This retains drum/chord attacks while suppressing loudness.
    const radius = Math.max(2, Math.round(0.35 / hopSeconds));
    const prefix = new Float64Array(frameCount + 1);
    const prefixSq = new Float64Array(frameCount + 1);
    for (let i = 0; i < frameCount; i++) {
      prefix[i + 1] = prefix[i] + rawFlux[i];
      prefixSq[i + 1] = prefixSq[i] + rawFlux[i] * rawFlux[i];
    }
    const novelty = new Float32Array(frameCount);
    for (let i = 0; i < frameCount; i++) {
      const from = Math.max(0, i - radius), to = Math.min(frameCount, i + radius + 1);
      const count = to - from;
      const localMean = (prefix[to] - prefix[from]) / count;
      const variance = Math.max(1e-8, (prefixSq[to] - prefixSq[from]) / count - localMean * localMean);
      novelty[i] = Math.max(0, (rawFlux[i] - localMean * 1.08) / Math.sqrt(variance));
    }
    const smooth = new Float32Array(frameCount);
    for (let i = 0; i < frameCount; i++) {
      smooth[i] = (novelty[Math.max(0, i - 1)] + 2 * novelty[i] + novelty[Math.min(frameCount - 1, i + 1)]) / 4;
    }
    await scheduler('onsets', 1);
    return { values: smooth, hopSeconds, duration: length / sampleRate };
  }

  function sampleCurve(curve, time) {
    const at = time / curve.hopSeconds - 0.5;
    if (at < 0 || at >= curve.values.length - 1) return 0;
    const lo = Math.floor(at), fraction = at - lo;
    return lerp(curve.values[lo], curve.values[lo + 1], fraction);
  }

  function localPeak(curve, center, radiusSeconds) {
    const from = Math.max(0, Math.floor((center - radiusSeconds) / curve.hopSeconds));
    const to = Math.min(curve.values.length - 1, Math.ceil((center + radiusSeconds) / curve.hopSeconds));
    let bestIndex = from, bestValue = -Infinity;
    for (let i = from; i <= to; i++) {
      if (curve.values[i] > bestValue) { bestValue = curve.values[i]; bestIndex = i; }
    }
    return { time: (bestIndex + 0.5) * curve.hopSeconds, strength: Math.max(0, bestValue) };
  }

  async function estimatePulse(curve, referenceBpm, scheduler, options) {
    const hop = curve.hopSeconds;
    const reference = clamp(Number(referenceBpm) || 100, 35, 240);
    const minBpm = clamp(Number(options.minBpm) || reference * 0.70, 35, 220);
    const maxBpm = clamp(Number(options.maxBpm) || reference * 1.38, minBpm + 1, 260);
    const minLag = Math.max(2, Math.floor(60 / maxBpm / hop));
    const maxLag = Math.min(curve.values.length - 2, Math.ceil(60 / minBpm / hop));
    const correlations = new Float64Array(maxLag + 1);
    const energyPrefix = new Float64Array(curve.values.length + 1);
    for (let i = 0; i < curve.values.length; i++) energyPrefix[i + 1] = energyPrefix[i] + curve.values[i] ** 2;
    let bestLag = minLag, bestRank = -Infinity;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let product = 0;
      for (let i = lag; i < curve.values.length; i++) product += curve.values[i] * curve.values[i - lag];
      const leftEnergy = energyPrefix[curve.values.length - lag] - energyPrefix[0];
      const rightEnergy = energyPrefix[curve.values.length] - energyPrefix[lag];
      const correlation = product / Math.sqrt(Math.max(1e-12, leftEnergy * rightEnergy));
      correlations[lag] = correlation;
      const bpm = 60 / (lag * hop);
      // The score BPM is only an octave/range prior; audio determines the exact value.
      const prior = Math.exp(-Math.abs(Math.log(bpm / reference)) * 0.75);
      const rank = correlation * prior;
      if (rank > bestRank) { bestRank = rank; bestLag = lag; }
      if (!(lag % 12)) await scheduler('tempo', (lag - minLag) / Math.max(1, maxLag - minLag));
    }
    const y0 = correlations[Math.max(minLag, bestLag - 1)];
    const y1 = correlations[bestLag];
    const y2 = correlations[Math.min(maxLag, bestLag + 1)];
    const denominator = y0 - 2 * y1 + y2;
    const lagOffset = Math.abs(denominator) > 1e-12 ? clamp(0.5 * (y0 - y2) / denominator, -0.5, 0.5) : 0;
    let period = (bestLag + lagOffset) * hop;

    // Find the strongest phase for that pulse, then repeatedly snap expected
    // beats to nearby attacks and robustly fit one straight line.
    let phase = 0, phaseScore = -Infinity;
    const phaseStep = hop / 2;
    const phaseScores = [];
    for (let candidate = 0; candidate < period; candidate += phaseStep) {
      let sum = 0, count = 0;
      for (let time = candidate; time < curve.duration; time += period) {
        const hit = localPeak(curve, time, Math.min(0.028, period * 0.06));
        sum += Math.log1p(hit.strength);
        count++;
      }
      const score = count ? sum / count : 0;
      phaseScores.push(score);
      if (score > phaseScore) { phaseScore = score; phase = candidate; }
    }

    let observations = [];
    for (let iteration = 0; iteration < 4; iteration++) {
      observations = [];
      let beatIndex = 0;
      for (let predicted = phase; predicted < curve.duration; predicted += period, beatIndex++) {
        const hit = localPeak(curve, predicted, Math.min(0.075, period * 0.12));
        observations.push({ k: beatIndex, predicted, time: hit.time, strength: hit.strength, residual: hit.time - predicted });
      }
      const strengthFloor = percentile(observations.map((item) => item.strength), 0.42);
      const residualCenter = median(observations.filter((item) => item.strength >= strengthFloor).map((item) => item.residual));
      const usable = observations.filter((item) => item.strength >= strengthFloor && Math.abs(item.residual - residualCenter) <= 0.055);
      let sw = 0, sk = 0, st = 0, skk = 0, skt = 0;
      for (const item of usable) {
        const weight = Math.min(8, 0.25 + item.strength);
        sw += weight; sk += weight * item.k; st += weight * item.time;
        skk += weight * item.k * item.k; skt += weight * item.k * item.time;
      }
      const divisor = sw * skk - sk * sk;
      if (usable.length >= 12 && Math.abs(divisor) > 1e-9) {
        const nextPeriod = (sw * skt - sk * st) / divisor;
        const nextPhase = (st - nextPeriod * sk) / sw;
        if (nextPeriod > period * 0.985 && nextPeriod < period * 1.015) period = nextPeriod;
        phase = nextPhase;
      }
      while (phase < 0) phase += period;
      while (phase >= period) phase -= period;
      await scheduler('beat-grid', (iteration + 1) / 4);
    }

    // Re-sample observations against the final line.
    observations = [];
    for (let k = 0, predicted = phase; predicted < curve.duration; k++, predicted = phase + k * period) {
      const hit = localPeak(curve, predicted, Math.min(0.075, period * 0.12));
      observations.push({ k, predicted, time: hit.time, strength: hit.strength, residual: hit.time - predicted });
    }

    const localTempos = [];
    const halfWindow = Math.max(8, Number(options.tempoWindowSeconds) || 30) / 2;
    for (let center = halfWindow; center < curve.duration; center += halfWindow) {
      const subset = observations.filter((item) => item.predicted >= center - halfWindow && item.predicted <= center + halfWindow);
      if (subset.length < 8) continue;
      const residualMedian = median(subset.map((item) => item.residual));
      const filtered = subset.filter((item) => Math.abs(item.residual - residualMedian) <= 0.055);
      let sk = 0, st = 0, skk = 0, skt = 0, n = 0;
      for (const item of filtered) { n++; sk += item.k; st += item.time; skk += item.k ** 2; skt += item.k * item.time; }
      const divisor = n * skk - sk * sk;
      if (n >= 8 && Math.abs(divisor) > 1e-9) {
        const slope = (n * skt - sk * st) / divisor;
        localTempos.push({ center, bpm: 60 / slope, beats: n });
      }
    }

    const randomMean = mean(phaseScores), randomStd = stddev(phaseScores, randomMean) || 1;
    const phaseZ = (phaseScore - randomMean) / randomStd;
    const bpm = 60 / period;
    const localBpms = localTempos.map((item) => item.bpm).filter((value) => Math.abs(value - bpm) < bpm * 0.08);
    const localBpmStd = stddev(localBpms, mean(localBpms));
    await scheduler('beat-grid', 1);
    return {
      bpm, period, phase, observations, localTempos,
      phaseZ, autocorrelation: correlations[bestLag], localBpmStd,
    };
  }

  async function downsampleAudio(audioBuffer, targetRate, scheduler) {
    const sourceRate = audioBuffer.sampleRate;
    const channels = Math.max(1, audioBuffer.numberOfChannels || 1);
    const data = Array.from({ length: channels }, (_, channel) => audioBuffer.getChannelData(channel));
    const ratio = sourceRate / targetRate;
    const length = Math.floor(audioBuffer.length / ratio);
    const output = new Float32Array(length);
    for (let index = 0; index < length; index++) {
      const from = Math.floor(index * ratio), to = Math.max(from + 1, Math.min(audioBuffer.length, Math.floor((index + 1) * ratio)));
      let sum = 0, count = 0;
      for (let source = from; source < to; source++) {
        for (let channel = 0; channel < channels; channel++) sum += data[channel][source] || 0;
        count += channels;
      }
      output[index] = count ? sum / count : 0;
      if (!(index % 32768)) await scheduler('chroma-downsample', index / length);
    }
    return { data: output, sampleRate: sourceRate / ratio };
  }

  function fftInPlace(real, imag) {
    const n = real.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        [real[i], real[j]] = [real[j], real[i]];
        [imag[i], imag[j]] = [imag[j], imag[i]];
      }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const angle = -TAU / size;
      const stepReal = Math.cos(angle), stepImag = Math.sin(angle);
      for (let start = 0; start < n; start += size) {
        let wr = 1, wi = 0;
        for (let j = 0; j < size / 2; j++) {
          const even = start + j, odd = even + size / 2;
          const tr = wr * real[odd] - wi * imag[odd];
          const ti = wr * imag[odd] + wi * real[odd];
          real[odd] = real[even] - tr; imag[odd] = imag[even] - ti;
          real[even] += tr; imag[even] += ti;
          const nextWr = wr * stepReal - wi * stepImag;
          wi = wr * stepImag + wi * stepReal;
          wr = nextWr;
        }
      }
    }
  }

  async function extractChroma(audioBuffer, scheduler) {
    const target = await downsampleAudio(audioBuffer, Math.min(11025, audioBuffer.sampleRate), scheduler);
    const size = 4096, hop = 2048;
    const frameCount = Math.max(0, Math.floor((target.data.length - size) / hop) + 1);
    const window = new Float32Array(size);
    for (let i = 0; i < size; i++) window[i] = 0.5 - 0.5 * Math.cos(TAU * i / (size - 1));
    const real = new Float64Array(size), imag = new Float64Array(size);
    const frames = new Float32Array(frameCount * 12);
    const binFrequency = target.sampleRate / size;
    for (let frame = 0; frame < frameCount; frame++) {
      const offset = frame * hop;
      for (let i = 0; i < size; i++) { real[i] = target.data[offset + i] * window[i]; imag[i] = 0; }
      fftInPlace(real, imag);
      const chroma = new Float64Array(12);
      for (let bin = Math.max(2, Math.ceil(55 / binFrequency)); bin < size / 2; bin++) {
        const frequency = bin * binFrequency;
        if (frequency > 5000) break;
        const magnitude = Math.sqrt(real[bin] ** 2 + imag[bin] ** 2);
        if (magnitude <= 1e-8) continue;
        const midi = 69 + 12 * Math.log2(frequency / 440);
        const nearest = Math.round(midi);
        const distance = Math.abs(midi - nearest);
        const weight = Math.max(0, 1 - distance) * Math.log1p(magnitude * 8) / Math.sqrt(frequency / 110);
        chroma[((nearest % 12) + 12) % 12] += weight;
      }
      const norm = Math.sqrt(chroma.reduce((sum, value) => sum + value * value, 0)) || 1;
      for (let pitch = 0; pitch < 12; pitch++) frames[frame * 12 + pitch] = chroma[pitch] / norm;
      if (!(frame % 12)) await scheduler('chroma', frame / Math.max(1, frameCount));
    }
    await scheduler('chroma', 1);
    return { frames, frameCount, hopSeconds: hop / target.sampleRate, windowSeconds: size / target.sampleRate };
  }

  const PITCH_CLASS = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, Fb: 4, 'E#': 5, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11, 'B#': 0 };

  function chordTemplate(name) {
    const match = String(name || '').match(/^([A-G](?:#|b)?)(.*)$/);
    if (!match || PITCH_CLASS[match[1]] === undefined) return null;
    const root = PITCH_CLASS[match[1]], suffix = match[2].toLowerCase();
    const minor = /^m(?!aj)/.test(suffix);
    const intervals = [0, minor ? 3 : 4, 7];
    const weights = [1, 0.92, 0.84];
    if (/(^|[^a-z])7/.test(suffix) || suffix.includes('7')) { intervals.push(suffix.includes('maj7') ? 11 : 10); weights.push(0.72); }
    if (suffix.includes('add9') || suffix.includes('add2')) { intervals.push(2); weights.push(0.62); }
    const vector = new Float64Array(12);
    for (let i = 0; i < intervals.length; i++) vector[(root + intervals[i]) % 12] = weights[i];
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
    for (let i = 0; i < 12; i++) vector[i] /= norm;
    return vector;
  }

  function eventChroma(chroma, fromTime, toTime) {
    const vector = new Float64Array(12);
    let count = 0;
    const first = Math.max(0, Math.ceil((fromTime - chroma.windowSeconds / 2) / chroma.hopSeconds));
    const after = Math.min(chroma.frameCount, Math.floor((toTime - chroma.windowSeconds / 2) / chroma.hopSeconds) + 1);
    for (let frame = first; frame < after; frame++) {
      for (let pitch = 0; pitch < 12; pitch++) vector[pitch] += chroma.frames[frame * 12 + pitch];
      count++;
    }
    if (!count) return null;
    const floor = Math.min(...vector) / count;
    // Remove the broadband floor before cosine matching. Without this step a
    // dense mix looks almost uniform in chroma space and all chords score alike.
    for (let pitch = 0; pitch < 12; pitch++) vector[pitch] = Math.max(0, vector[pitch] / count - floor);
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
    for (let pitch = 0; pitch < 12; pitch++) vector[pitch] /= norm;
    return vector;
  }

  function scoreHarmonyCandidate(score, chroma, startTime, period, audioDuration, withWindows) {
    let weightedScore = 0, totalWeight = 0;
    const windowStats = new Map();
    for (const event of score.events) {
      const template = chordTemplate(event.chord);
      if (!template) continue;
      const eventStart = startTime + event.q * period;
      const eventEnd = startTime + (event.q + event.span) * period;
      // Ignore the first quarter of each event as a harmonic transition.
      const analysisStart = eventStart + (eventEnd - eventStart) * 0.25;
      if (analysisStart < 0 || eventEnd > audioDuration || eventEnd <= analysisStart) continue;
      const vector = eventChroma(chroma, analysisStart, eventEnd);
      if (!vector) continue;
      let similarity = 0;
      for (let pitch = 0; pitch < 12; pitch++) similarity += vector[pitch] * template[pitch];
      const weight = Math.min(4, event.span) * Math.max(0.2, Math.min(1, (eventEnd - analysisStart) / 1.2));
      weightedScore += similarity * weight;
      totalWeight += weight;
      if (withWindows) {
        const windowIndex = Math.floor(event.bar / 8);
        const stat = windowStats.get(windowIndex) || { fromBar: windowIndex * 8, toBar: windowIndex * 8 + 8, score: 0, weight: 0 };
        stat.score += similarity * weight; stat.weight += weight;
        windowStats.set(windowIndex, stat);
      }
    }
    return {
      score: totalWeight ? weightedScore / totalWeight : 0,
      coverage: score.events.length ? totalWeight / score.events.length : 0,
      windows: withWindows ? Array.from(windowStats.values()).map((item) => ({ ...item, score: item.weight ? item.score / item.weight : 0 })) : [],
    };
  }

  async function alignScoreByHarmony(score, chroma, pulse, audioDuration, scheduler, options) {
    const before = Math.max(2, Number(options.candidateBeatsBefore) || 6);
    const after = Math.max(8, Number(options.candidateBeatsAfter) || 20);
    const candidates = [];
    for (let beatOffset = -before; beatOffset <= after; beatOffset++) {
      const startTime = pulse.phase + beatOffset * pulse.period;
      // A negative candidate silently discards the beginning of the score and
      // can look harmonically plausible in a repeating progression. The first
      // score beat must be an audible beat in the recording; manual offset can
      // still move it before zero later if that is genuinely intended.
      if (startTime < -0.05 || startTime > Math.min(15, audioDuration / 4)) continue;
      const harmonic = scoreHarmonyCandidate(score, chroma, startTime, pulse.period, audioDuration, false);
      candidates.push({ beatOffset, startTime, harmonyScore: harmonic.score, coverage: harmonic.coverage });
      await scheduler('harmony-alignment', (beatOffset + before) / (before + after + 1));
    }
    candidates.sort((a, b) => b.harmonyScore - a.harmonyScore);
    const best = candidates[0] || { beatOffset: 0, startTime: pulse.phase, harmonyScore: 0, coverage: 0 };
    const detailed = scoreHarmonyCandidate(score, chroma, best.startTime, pulse.period, audioDuration, true);
    best.windows = detailed.windows;
    const alternatives = candidates.slice(0, 3);
    const margin = alternatives.length > 1 ? alternatives[0].harmonyScore - alternatives[1].harmonyScore : alternatives[0] ? alternatives[0].harmonyScore : 0;
    await scheduler('harmony-alignment', 1);
    return { best, alternatives, margin, ambiguous: margin < (Number(options.harmonyMargin) || 0.035) };
  }

  function scoreEventAttacks(curve, score, startTime, bpm) {
    const period = 60 / bpm;
    let sum = 0, weightSum = 0;
    for (const event of score.events) {
      const time = startTime + event.q * period;
      if (time < 0 || time >= curve.duration) continue;
      let strength = 0;
      const radius = 0.012;
      for (let offset = -radius; offset <= radius + 1e-9; offset += curve.hopSeconds / 2) {
        strength = Math.max(strength, sampleCurve(curve, time + offset));
      }
      const weight = Math.min(2, event.span);
      sum += Math.log1p(strength) * weight;
      weightSum += weight;
    }
    return weightSum ? sum / weightSum : 0;
  }

  async function refineScoreGrid(curve, score, pulse, alignment, chroma, scheduler) {
    // The global beat fit is deliberately phase-agnostic and may centre the
    // line tens of milliseconds away from the first transient. Snap the chosen
    // harmonic candidate to the strongest nearby attack, then estimate the
    // straight-line tempo from all score-event attacks while holding that first
    // beat fixed. On Oasis this distinguishes 81.4 from the old 82.85 mapping.
    const coarseStart = alignment.best.startTime;
    const firstAttack = localPeak(curve, coarseStart, Math.min(0.12, pulse.period * 0.20));
    const localBpms = pulse.localTempos.map((item) => item.bpm)
      .filter((value) => Number.isFinite(value) && Math.abs(value - pulse.bpm) < pulse.bpm * 0.08)
      .sort((a, b) => a - b);
    const trim = Math.floor(localBpms.length * 0.10);
    const centralBpms = localBpms.slice(trim, Math.max(trim + 1, localBpms.length - trim));
    const seedBpm = centralBpms.length ? mean(centralBpms) : pulse.bpm;
    let bestBpm = seedBpm, bestAttackScore = -Infinity;
    const fromBpm = Math.max(35, seedBpm - 0.8), toBpm = Math.min(260, seedBpm + 0.8);
    for (let bpm = fromBpm; bpm <= toBpm + 1e-9; bpm += 0.002) {
      const scoreValue = scoreEventAttacks(curve, score, firstAttack.time, bpm);
      if (scoreValue > bestAttackScore) { bestAttackScore = scoreValue; bestBpm = bpm; }
      if (!(Math.round((bpm - fromBpm) * 500) % 40)) await scheduler('grid-refinement', (bpm - fromBpm) / (toBpm - fromBpm));
    }
    pulse.bpm = bestBpm;
    pulse.period = 60 / bestBpm;
    pulse.phase = firstAttack.time;

    // Recompute the few preview candidates at the refined tempo. Each candidate
    // is independently snapped to a nearby attack so their audition starts are
    // useful if harmonic confidence is tied.
    const refinedCandidates = alignment.alternatives.map((candidate) => {
      const snapped = localPeak(curve, candidate.startTime, Math.min(0.12, pulse.period * 0.20));
      const harmonic = scoreHarmonyCandidate(score, chroma, snapped.time, pulse.period, curve.duration, false);
      return { ...candidate, startTime: snapped.time, harmonyScore: harmonic.score, coverage: harmonic.coverage };
    }).sort((a, b) => b.harmonyScore - a.harmonyScore);
    alignment.alternatives = refinedCandidates;
    alignment.best = refinedCandidates[0] || { ...alignment.best, startTime: firstAttack.time };
    const detailed = scoreHarmonyCandidate(score, chroma, alignment.best.startTime, pulse.period, curve.duration, true);
    alignment.best.harmonyScore = detailed.score;
    alignment.best.coverage = detailed.coverage;
    alignment.best.windows = detailed.windows;
    alignment.margin = refinedCandidates.length > 1 ? refinedCandidates[0].harmonyScore - refinedCandidates[1].harmonyScore : alignment.best.harmonyScore;
    alignment.ambiguous = alignment.margin < 0.035;

    pulse.observations = [];
    for (let k = 0, predicted = alignment.best.startTime; predicted < curve.duration; k++, predicted = alignment.best.startTime + k * pulse.period) {
      const hit = localPeak(curve, predicted, Math.min(0.075, pulse.period * 0.12));
      pulse.observations.push({ k, predicted, time: hit.time, strength: hit.strength, residual: hit.time - predicted });
    }
    await scheduler('grid-refinement', 1);
    return { coarseStart, snappedStart: alignment.best.startTime, attackScore: bestAttackScore, seedBpm };
  }

  function buildFollowBeatTimes(pulse) {
    const observed = pulse.observations;
    const corrections = observed.map((item, index) => {
      let sum = 0, weight = 0;
      const from = Math.max(0, index - 8), to = Math.min(observed.length - 1, index + 8);
      for (let j = from; j <= to; j++) {
        const distance = Math.abs(j - index);
        const w = (9 - distance) * Math.min(5, 0.2 + observed[j].strength);
        if (Math.abs(observed[j].residual) <= 0.09) { sum += observed[j].residual * w; weight += w; }
      }
      return weight ? clamp(sum / weight, -0.12, 0.12) : 0;
    });
    // Limit acceleration so a single fill cannot kink the tempo map.
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 1; i + 1 < corrections.length; i++) {
        const smooth = (corrections[i - 1] + 2 * corrections[i] + corrections[i + 1]) / 4;
        corrections[i] = lerp(corrections[i], smooth, 0.65);
      }
    }
    return corrections;
  }

  function rdpIndices(points, tolerance) {
    if (points.length <= 2) return points.map((_, index) => index);
    const keep = new Set([0, points.length - 1]);
    const stack = [[0, points.length - 1]];
    while (stack.length) {
      const [from, to] = stack.pop();
      const a = points[from], b = points[to];
      let bestIndex = -1, bestError = tolerance;
      for (let i = from + 1; i < to; i++) {
        const fraction = (points[i].q - a.q) / Math.max(1e-9, b.q - a.q);
        const predicted = lerp(a.time, b.time, fraction);
        const error = Math.abs(points[i].time - predicted);
        if (error > bestError) { bestError = error; bestIndex = i; }
      }
      if (bestIndex >= 0) { keep.add(bestIndex); stack.push([from, bestIndex], [bestIndex, to]); }
    }
    return Array.from(keep).sort((a, b) => a - b);
  }

  function proposeSyncPoints(score, pulse, alignment, options) {
    const mode = options.mode === 'follow' ? 'follow' : 'steady';
    const fromBar = clamp(Math.floor(Number(options.fromBar) || 0), 0, score.totalBars);
    const toBar = clamp(Number.isFinite(Number(options.toBar)) ? Math.floor(Number(options.toBar)) : score.totalBars, fromBar, score.totalBars);
    const barSlice = score.bars.filter((item) => item.bar >= fromBar && item.bar <= toBar);
    const corrections = mode === 'follow' ? buildFollowBeatTimes(pulse) : null;
    const mapQuarter = (q) => {
      const base = alignment.best.startTime + q * pulse.period;
      if (!corrections || !corrections.length) return base;
      const beat = Math.max(0, q + alignment.best.beatOffset);
      const lo = clamp(Math.floor(beat), 0, corrections.length - 1);
      const hi = clamp(lo + 1, 0, corrections.length - 1);
      return base + lerp(corrections[lo], corrections[hi], beat - Math.floor(beat));
    };
    const mapped = barSlice.map((item) => ({ bar: item.bar, q: item.q, time: mapQuarter(item.q) }));
    const selected = rdpIndices(mapped, Math.max(0.005, Number(options.pointToleranceSeconds) || 0.020)).map((index) => mapped[index]);
    const points = selected.map((point, index) => {
      const next = selected[index + 1];
      const bpmToNext = next ? 60 * (next.q - point.q) / (next.time - point.time) : null;
      return { bar: point.bar, time: point.time, bpmToNext };
    });
    return { points, mapQuarter, fromBar, toBar };
  }

  function confidenceReport(curve, pulse, alignment) {
    const phaseConfidence = clamp((pulse.phaseZ - 1) / 4, 0, 1);
    const tempoConfidence = clamp(Math.exp(-pulse.localBpmStd / 1.2), 0, 1);
    const harmonyConfidence = clamp((alignment.best.harmonyScore - 0.42) / 0.35, 0, 1);
    const marginConfidence = clamp(alignment.margin / 0.08, 0, 1);
    const overall = 0.31 * phaseConfidence + 0.25 * tempoConfidence + 0.31 * harmonyConfidence + 0.13 * marginConfidence;
    return {
      overall,
      attacks: phaseConfidence,
      tempoStability: tempoConfidence,
      harmony: harmonyConfidence,
      candidateMargin: marginConfidence,
      low: overall < 0.55 || phaseConfidence < 0.25 || harmonyConfidence < 0.25,
      reasons: [
        ...(phaseConfidence < 0.25 ? ['Атаки не образуют надёжную сетку четвертей.'] : []),
        ...(tempoConfidence < 0.35 ? ['Локальная оценка темпа нестабильна.'] : []),
        ...(harmonyConfidence < 0.25 ? ['Гармония записи слабо совпадает с аккордами схемы.'] : []),
        ...(alignment.ambiguous ? ['Несколько вариантов начала имеют близкую гармоническую оценку.'] : []),
      ],
    };
  }

  function eventAttackReport(curve, score, pulse, alignment) {
    const hits = [];
    for (const event of score.events) {
      const predicted = alignment.best.startTime + event.q * pulse.period;
      if (predicted < 0 || predicted >= curve.duration) continue;
      const hit = localPeak(curve, predicted, Math.min(0.075, pulse.period * 0.12));
      hits.push({ residual: hit.time - predicted, strength: hit.strength });
    }
    const strengthFloor = percentile(hits.map((item) => item.strength), 0.35);
    const reliable = hits.filter((item) => item.strength >= strengthFloor);
    const errors = reliable.map((item) => Math.abs(item.residual)).sort((a, b) => a - b);
    return {
      reliableChanges: reliable.length,
      within30ms: reliable.length ? reliable.filter((item) => Math.abs(item.residual) <= 0.030).length / reliable.length : 0,
      medianMs: percentile(errors, 0.50) * 1000,
      p90Ms: percentile(errors, 0.90) * 1000,
    };
  }

  function mismatchReport(score, pulse, alignment) {
    const mismatches = [];
    const scores = alignment.best.windows || [];
    const typical = median(scores.map((item) => item.score));
    for (const item of scores) {
      if (item.weight > 0 && item.score < Math.max(0.38, typical - 0.13)) {
        mismatches.push({ fromBar: item.fromBar, toBar: Math.min(score.totalBars, item.toBar), kind: 'harmony', score: item.score });
      }
    }
    const residuals = pulse.observations.filter((item) => item.strength > 0).map((item) => Math.abs(item.residual));
    const residualP90 = percentile(residuals, 0.90);
    return { regions: mismatches, beatResidualP90Ms: residualP90 * 1000 };
  }

  async function analyze(audioBuffer, song, inputOptions = {}) {
    if (!audioBuffer || typeof audioBuffer.getChannelData !== 'function') throw new TypeError('Auto-Sync expects an already decoded AudioBuffer.');
    const options = {
      mode: inputOptions.mode === 'follow' ? 'follow' : 'steady',
      tempoWindowSeconds: 30,
      pointToleranceSeconds: 0.020,
      workBudgetMs: 12,
      ...inputOptions,
    };
    const scheduler = createWorkScheduler(options, typeof options.onProgress === 'function' ? options.onProgress : null);
    const score = flattenScore(song || {});
    if (!score.events.length || !score.totalQ) throw new Error('В схеме нет событий для синхронизации.');
    const curve = await extractOnsetCurve(audioBuffer, scheduler);
    const pulse = await estimatePulse(curve, Number(song && song.bpm) || 100, scheduler, options);
    const chroma = await extractChroma(audioBuffer, scheduler);
    const alignment = await alignScoreByHarmony(score, chroma, pulse, curve.duration, scheduler, options);
    const refinement = await refineScoreGrid(curve, score, pulse, alignment, chroma, scheduler);
    const proposal = proposeSyncPoints(score, pulse, alignment, options);
    const candidatePreviews = alignment.alternatives.map((candidate) => ({
      ...candidate,
      points: proposeSyncPoints(score, pulse, { best: candidate }, options).points,
    }));
    const confidence = confidenceReport(curve, pulse, alignment);
    const mismatches = mismatchReport(score, pulse, alignment);
    const eventAttacks = eventAttackReport(curve, score, pulse, alignment);
    const shouldApply = !confidence.low;
    return {
      mode: options.mode,
      duration: curve.duration,
      score: { bars: score.totalBars, quarters: score.totalQ, events: score.events.length },
      tempo: {
        bpm: pulse.bpm,
        periodSeconds: pulse.period,
        local: pulse.localTempos,
        localStdBpm: pulse.localBpmStd,
      },
      firstBeat: alignment.best.startTime,
      points: proposal.points,
      candidates: candidatePreviews,
      ambiguousStart: alignment.ambiguous,
      confidence,
      mismatches,
      eventAttacks,
      shouldApply,
      diagnostics: {
        onsetHopMs: curve.hopSeconds * 1000,
        pulsePhase: pulse.phase,
        coarsePulsePhase: refinement.coarseStart,
        eventAttackScore: refinement.attackScore,
        tempoSeedBpm: refinement.seedBpm,
        phaseZ: pulse.phaseZ,
        autocorrelation: pulse.autocorrelation,
        harmonicScore: alignment.best.harmonyScore,
        harmonicMargin: alignment.margin,
      },
    };
  }

  return {
    analyze, flattenScore, chordTemplate,
    // Exposed only so the standalone acceptance harness can audit intermediate
    // DSP stages without coupling them to the application.
    _prototypeInternals: { extractOnsetCurve, estimatePulse, extractChroma, eventChroma, scoreHarmonyCandidate },
  };
});
