export type AccentPoint = {
  timeSeconds: number;
  strength: number;
};

const HOP_SIZE = 512;
const FRAME_SIZE = 2048;
const MIN_ACCENT_GAP_SECONDS = 0.13;

const median = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const frameToSeconds = (frame: number, sampleRate: number) =>
  (frame * HOP_SIZE) / sampleRate;

const rmsAt = (
  samples: Float32Array,
  sampleRate: number,
  timeSeconds: number,
  windowSeconds: number,
) => {
  const center = Math.round(timeSeconds * sampleRate);
  const half = Math.round((windowSeconds * sampleRate) / 2);
  const start = Math.max(0, center - half);
  const end = Math.min(samples.length, center + half);
  if (end <= start) return 0;

  let sum = 0;
  for (let i = start; i < end; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / (end - start));
};

const normalizeCurve = (values: Float32Array): Float32Array => {
  if (values.length === 0) return values;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1e-6);
  return Float32Array.from(values, (value) => (value - min) / span);
};

/** Energia + pochodna — bazowy onset. */
const computeEnergyOnsetStrength = (samples: Float32Array): Float32Array => {
  const frameCount = Math.floor((samples.length - FRAME_SIZE) / HOP_SIZE);
  const energy = new Float32Array(frameCount);
  const strength = new Float32Array(frameCount);

  for (let i = 0; i < frameCount; i++) {
    const start = i * HOP_SIZE;
    let sum = 0;
    for (let j = 0; j < FRAME_SIZE; j++) {
      const sample = samples[start + j];
      sum += sample * sample;
    }
    energy[i] = Math.sqrt(sum / FRAME_SIZE);
  }

  for (let i = 1; i < frameCount; i++) {
    const diff = energy[i] - energy[i - 1];
    strength[i] = diff > 0 ? diff : 0;
  }

  return strength;
};

/** Transjenty wysokiej częstotliwości — „bum”, „dam”, uderzenia. */
const computeTransientStrength = (samples: Float32Array): Float32Array => {
  const frameCount = Math.floor((samples.length - FRAME_SIZE) / HOP_SIZE);
  const strength = new Float32Array(frameCount);

  for (let i = 0; i < frameCount; i++) {
    const start = i * HOP_SIZE;
    let shortSum = 0;
    let derivSum = 0;
    const shortWindow = Math.min(128, FRAME_SIZE - 1);

    for (let j = 0; j < shortWindow; j++) {
      const sample = samples[start + j];
      shortSum += sample * sample;
      const delta = sample - samples[start + j + 1];
      derivSum += delta * delta;
    }

    const shortRms = Math.sqrt(shortSum / Math.max(shortWindow, 1));
    const derivRms = Math.sqrt(derivSum / Math.max(shortWindow, 1));
    strength[i] = shortRms * 0.45 + derivRms * 0.55;
  }

  return strength;
};

const combineStrengthCurves = (
  energy: Float32Array,
  transient: Float32Array,
): Float32Array => {
  const length = Math.min(energy.length, transient.length);
  const combined = new Float32Array(length);
  const energyNorm = normalizeCurve(energy);
  const transientNorm = normalizeCurve(transient);

  for (let i = 0; i < length; i++) {
    combined[i] = energyNorm[i] * 0.35 + transientNorm[i] * 0.65;
  }

  return combined;
};

const pickProminentPeaks = (
  strength: Float32Array,
  sampleRate: number,
): number[] => {
  const minDistance = Math.max(1, Math.round(MIN_ACCENT_GAP_SECONDS / (HOP_SIZE / sampleRate)));
  const rollingWindow = Math.max(
    8,
    Math.round(2.8 / (HOP_SIZE / sampleRate)),
  );
  const peaks: number[] = [];

  for (let i = 2; i < strength.length - 2; i++) {
    const value = strength[i];
    const window = strength.slice(
      Math.max(0, i - rollingWindow),
      Math.min(strength.length, i + rollingWindow + 1),
    );
    const localMedian = median([...window]);
    const localMax = Math.max(...window);
    const threshold = localMedian * 1.62 + localMax * 0.24;
    if (value < threshold) continue;
    const prominence = value - localMedian;
    if (prominence < localMax * 0.16) continue;

    if (
      value >= strength[i - 1] &&
      value >= strength[i - 2] &&
      value >= strength[i + 1] &&
      value >= strength[i + 2]
    ) {
      if (peaks.length === 0 || i - peaks[peaks.length - 1] >= minDistance) {
        peaks.push(i);
      } else if (value > strength[peaks[peaks.length - 1]]) {
        peaks[peaks.length - 1] = i;
      }
    }
  }

  return peaks;
};

const scoreAccentAt = (
  samples: Float32Array,
  sampleRate: number,
  timeSeconds: number,
  curveStrength: number,
) => {
  const localRms = rmsAt(samples, sampleRate, timeSeconds, 0.05);
  const contextRms = rmsAt(
    samples,
    sampleRate,
    Math.max(0.04, timeSeconds - 0.35),
    0.28,
  );
  const loudnessRatio =
    contextRms > 1e-5 ? Math.min(3.5, localRms / contextRms) / 3.5 : 0.4;
  const attackRms = rmsAt(samples, sampleRate, timeSeconds, 0.018);
  const attackBoost = contextRms > 1e-5 ? Math.min(1, attackRms / contextRms) : 0.3;

  return Math.min(
    1,
    Math.max(0.05, curveStrength * 0.5 + loudnessRatio * 0.3 + attackBoost * 0.2),
  );
};

const mergeAccentPoints = (points: AccentPoint[]): AccentPoint[] => {
  const sorted = [...points].sort((a, b) => a.timeSeconds - b.timeSeconds);
  const merged: AccentPoint[] = [];

  for (const point of sorted) {
    const last = merged[merged.length - 1];
    if (!last || point.timeSeconds - last.timeSeconds > MIN_ACCENT_GAP_SECONDS) {
      merged.push(point);
      continue;
    }
    if (point.strength > last.strength) {
      merged[merged.length - 1] = point;
    }
  }

  return merged;
};

const normalizeAccentStrengths = (points: AccentPoint[]): AccentPoint[] => {
  if (points.length === 0) return points;
  const values = points.map((point) => point.strength);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1e-6);
  return points.map((point) => ({
    ...point,
    strength: Math.min(1, Math.max(0, (point.strength - min) / span)),
  }));
};

const thinAccentPoints = (
  points: AccentPoint[],
  windowSeconds = 1.15,
): AccentPoint[] => {
  if (points.length <= 1) return points;

  const sorted = [...points].sort((a, b) => a.timeSeconds - b.timeSeconds);
  const kept: AccentPoint[] = [];
  let windowStart = sorted[0].timeSeconds;
  let bucket: AccentPoint[] = [];

  const flush = () => {
    if (!bucket.length) return;
    bucket.sort((a, b) => b.strength - a.strength);
    kept.push(bucket[0]);
    if (
      bucket[1] &&
      bucket[1].strength >= 0.62 &&
      bucket[0].strength - bucket[1].strength < 0.14
    ) {
      kept.push(bucket[1]);
    }
    bucket = [];
  };

  for (const point of sorted) {
    if (point.timeSeconds - windowStart > windowSeconds) {
      flush();
      windowStart = point.timeSeconds;
    }
    bucket.push(point);
  }
  flush();

  return kept.sort((a, b) => a.timeSeconds - b.timeSeconds);
};

export const detectAccentsFromSamples = (
  samples: Float32Array,
  sampleRate: number,
  durationSeconds: number,
  extraOnsets: number[] = [],
  strongOnsets: number[] = [],
): {
  accentPoints: AccentPoint[];
  onsetTimesSeconds: number[];
} => {
  const energy = computeEnergyOnsetStrength(samples);
  const transient = computeTransientStrength(samples);
  const combined = combineStrengthCurves(energy, transient);
  const peaks = pickProminentPeaks(combined, sampleRate);

  const accentCandidates: AccentPoint[] = peaks.map((frame) => {
    const timeSeconds = frameToSeconds(frame, sampleRate);
    return {
      timeSeconds,
      strength: scoreAccentAt(samples, sampleRate, timeSeconds, combined[frame]),
    };
  });

  for (const timeSeconds of extraOnsets) {
    if (timeSeconds < 0 || timeSeconds > durationSeconds + 0.05) continue;
    const frame = Math.round((timeSeconds * sampleRate) / HOP_SIZE);
    const curveStrength = combined[Math.min(Math.max(frame, 0), combined.length - 1)] ?? 0.4;
    accentCandidates.push({
      timeSeconds,
      strength: scoreAccentAt(samples, sampleRate, timeSeconds, curveStrength * 0.85),
    });
  }

  for (const timeSeconds of strongOnsets) {
    if (timeSeconds < 0 || timeSeconds > durationSeconds + 0.05) continue;
    accentCandidates.push({
      timeSeconds,
      strength: 0.88,
    });
  }

  const merged = mergeAccentPoints(accentCandidates);
  const normalized = normalizeAccentStrengths(merged);
  const accentPoints = thinAccentPoints(
    normalized.filter((point) => point.strength >= 0.34),
    1.15,
  );
  const onsetTimesSeconds = accentPoints.map((point) =>
    Number(point.timeSeconds.toFixed(4)),
  );

  return { accentPoints, onsetTimesSeconds };
};

export const accentStrengthNear = (
  accentPoints: AccentPoint[],
  timeSeconds: number,
  windowSeconds = 0.12,
): number => {
  let best = 0;
  for (const point of accentPoints) {
    const distance = Math.abs(point.timeSeconds - timeSeconds);
    if (distance > windowSeconds) continue;
    const weight = 1 - distance / windowSeconds;
    best = Math.max(best, point.strength * weight);
  }
  return best;
};

export const buildBeatStrengthsFromAccents = (
  beats: number[],
  accentPoints: AccentPoint[],
  samples: Float32Array,
  sampleRate: number,
): number[] => {
  const rmsValues = beats.map((time) => rmsAt(samples, sampleRate, time, 0.08));
  const rmsNorm = normalizeCurve(Float32Array.from(rmsValues));

  return beats.map((time, index) => {
    const accentHit = accentStrengthNear(accentPoints, time, 0.14);
    const downbeat = index % 4 === 0 ? 0.08 : 0;
    const raw = accentHit * 0.72 + rmsNorm[index] * 0.2 + downbeat;
    return Math.min(1, Math.max(0.06, raw));
  });
};

export const countStrongAccents = (
  accentPoints: AccentPoint[],
  threshold = 0.55,
): number => accentPoints.filter((point) => point.strength >= threshold).length;
