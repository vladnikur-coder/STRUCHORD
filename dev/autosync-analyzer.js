/*
 * STRUCHORD Auto-Sync DSP feature engine.
 *
 * Deliberately independent from STRUCHORD.html: this module accepts an already
 * This base module extracts onset/chroma features and flattens a score. The
 * joint tempo/downbeat layer loaded immediately after it performs all ranking.
 * There is no decoder or external dependency, and long loops yield to the UI.
 */
(function attachAutoSync(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StruChordAutoSyncAnalyzer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function autoSyncFactory() {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

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

  return {
    flattenScore, chordTemplate,
    _prototypeInternals: { extractOnsetCurve, extractChroma },
  };
});
