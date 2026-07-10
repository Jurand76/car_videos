// @ts-ignore - essentia.js nie ma typów
import { EssentiaWASM, Essentia } from "essentia.js";
import { decodeAudioToMono } from "./beatDetect";

const SAMPLE_RATE = 44100;
const FRAME_SIZE = 2048;
const HOP_SIZE = 512;

export type DynamicFeatures = {
  /** Głośność perceptualna per segment (0-1) */
  loudness: number[];
  /** Energia sygnału per segment (0-1) */
  energy: number[];
  /** Krzywa nowości - wykrywa "ciekawe" momenty (0-1) */
  noveltyCurve: number[];
  /** Centroid spektralny - jasność dźwięku (Hz) */
  spectralCentroid: number[];
  /** Flux spektralny - zmiany barwy (0-1) */
  spectralFlux: number[];
  /** Dynamic complexity - złożoność dynamiki (0-1) */
  dynamicComplexity: number;
  /** Danceability - czy utwór nadaje się do tańca (0-1) */
  danceability: number;
  /** Segmenty utworu z etykietami */
  segments: AudioSegment[];
  /** Punkty zmiany nastroju */
  changePoints: ChangePoint[];
};

export type AudioSegment = {
  start: number;
  end: number;
  label: "intro" | "buildup" | "drop" | "verse" | "chorus" | "breakdown" | "outro" | "ambient";
  energy: number;
  intensity: number;
};

export type ChangePoint = {
  time: number;
  type: "drop" | "buildup" | "breakdown" | "climax" | "transition";
  strength: number;
};

let essentiaInstance: Essentia | null = null;

const getEssentia = () => {
  if (!essentiaInstance) {
    essentiaInstance = new Essentia(EssentiaWASM);
  }
  return essentiaInstance;
};

const frameAudio = (
  samples: Float32Array,
  frameSize: number,
  hopSize: number,
): Float32Array[] => {
  const frames: Float32Array[] = [];
  for (let i = 0; i + frameSize <= samples.length; i += hopSize) {
    frames.push(samples.slice(i, i + frameSize));
  }
  return frames;
};

const computeRms = (frame: Float32Array): number => {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) {
    sum += frame[i] * frame[i];
  }
  return Math.sqrt(sum / frame.length);
};

const computeSpectralCentroid = (
  frame: Float32Array,
  sampleRate: number,
): number => {
  const fftSize = frame.length;
  const magnitudes: number[] = [];
  const frequencies: number[] = [];
  
  // Prosta FFT (dla małych ram - wystarczająca dla centroidu)
  for (let k = 0; k < fftSize / 2; k++) {
    let real = 0;
    let imag = 0;
    for (let n = 0; n < fftSize; n++) {
      const angle = (2 * Math.PI * k * n) / fftSize;
      real += frame[n] * Math.cos(angle);
      imag -= frame[n] * Math.sin(angle);
    }
    const magnitude = Math.sqrt(real * real + imag * imag);
    magnitudes.push(magnitude);
    frequencies.push((k * sampleRate) / fftSize);
  }

  let weightedSum = 0;
  let totalMagnitude = 0;
  for (let i = 0; i < magnitudes.length; i++) {
    weightedSum += frequencies[i] * magnitudes[i];
    totalMagnitude += magnitudes[i];
  }

  return totalMagnitude > 0 ? weightedSum / totalMagnitude : 0;
};

const computeSpectralFlux = (
  frames: Float32Array[],
  sampleRate: number,
): number[] => {
  const flux: number[] = [0];
  
  for (let i = 1; i < frames.length; i++) {
    const prevFrame = frames[i - 1];
    const currFrame = frames[i];
    
    let diff = 0;
    const fftSize = Math.min(256, prevFrame.length); // Mniejsza FFT dla szybkości
    
    for (let k = 0; k < fftSize / 2; k++) {
      let prevMag = 0;
      let currMag = 0;
      
      for (let n = 0; n < fftSize; n++) {
        const anglePrev = (2 * Math.PI * k * n) / fftSize;
        const angleCurr = anglePrev;
        prevMag += prevFrame[n] * Math.cos(anglePrev);
        currMag += currFrame[n] * Math.cos(angleCurr);
      }
      
      const delta = Math.abs(currMag) - Math.abs(prevMag);
      diff += delta > 0 ? delta * delta : 0;
    }
    
    flux.push(Math.sqrt(diff));
  }
  
  return flux;
};

const computeNoveltyCurve = (
  samples: Float32Array,
  sampleRate: number,
): number[] => {
  const frames = frameAudio(samples, FRAME_SIZE, HOP_SIZE);
  const novelty: number[] = [];
  
  let prevEnergy = 0;
  let prevSpectralSum = 0;
  
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const energy = computeRms(frame);
    const spectralSum = computeSpectralCentroid(frame, sampleRate) * energy;
    
    // Energy difference + spectral difference
    const energyDiff = Math.max(0, energy - prevEnergy);
    const spectralDiff = Math.max(0, spectralSum - prevSpectralSum);
    
    novelty.push(energyDiff * 0.6 + spectralDiff * 0.4);
    
    prevEnergy = energy;
    prevSpectralSum = spectralSum;
  }
  
  // Normalize
  const max = Math.max(...novelty, 1e-6);
  return novelty.map((v) => v / max);
};

const computeLoudnessCurve = (samples: Float32Array): number[] => {
  const frames = frameAudio(samples, FRAME_SIZE, HOP_SIZE);
  const loudness = frames.map((f) => computeRms(f));
  
  // Normalize to 0-1
  const max = Math.max(...loudness, 1e-6);
  const min = Math.min(...loudness);
  const range = max - min;
  
  return loudness.map((l) => (l - min) / (range || 1));
};

const computeEnergyCurve = (samples: Float32Array): number[] => {
  const frames = frameAudio(samples, FRAME_SIZE, HOP_SIZE);
  
  // Energy = suma kwadratów próbek
  const energies = frames.map((frame) => {
    let sum = 0;
    for (let i = 0; i < frame.length; i++) {
      sum += frame[i] * frame[i];
    }
    return sum / frame.length;
  });
  
  // Normalize
  const max = Math.max(...energies, 1e-6);
  return energies.map((e) => e / max);
};

const extractDanceability = (
  essentia: Essentia,
  vector: ReturnType<Essentia["arrayToVector"]>,
): number => {
  try {
    const result = essentia.Danceability(vector, SAMPLE_RATE);
    return Math.min(1, Math.max(0, result.danceability));
  } catch {
    return 0.5;
  }
};

const extractDynamicComplexity = (
  essentia: Essentia,
  vector: ReturnType<Essentia["arrayToVector"]>,
): number => {
  try {
    const result = essentia.DynamicComplexity(vector, SAMPLE_RATE);
    return Math.min(1, Math.max(0, result.dynamicComplexity / 10));
  } catch {
    return 0.5;
  }
};

const detectSegments = (
  novelty: number[],
  energy: number[],
  loudness: number[],
  spectralFlux: number[],
  sampleRate: number,
  durationSeconds: number,
): AudioSegment[] => {
  const segments: AudioSegment[] = [];
  const framesPerSecond = sampleRate / HOP_SIZE;
  const framesTotal = novelty.length;
  
  // Dzielimy na okna 2-sekundowe
  const windowSize = Math.round(framesPerSecond * 2);
  const numWindows = Math.ceil(framesTotal / windowSize);
  
  for (let w = 0; w < numWindows; w++) {
    const startFrame = w * windowSize;
    const endFrame = Math.min((w + 1) * windowSize, framesTotal);
    
    const windowNovelty = novelty.slice(startFrame, endFrame);
    const windowEnergy = energy.slice(startFrame, endFrame);
    const windowLoudness = loudness.slice(startFrame, endFrame);
    const windowFlux = spectralFlux.slice(startFrame, endFrame);
    
    const avgNovelty = windowNovelty.reduce((a, b) => a + b, 0) / windowNovelty.length;
    const avgEnergy = windowEnergy.reduce((a, b) => a + b, 0) / windowEnergy.length;
    const avgLoudness = windowLoudness.reduce((a, b) => a + b, 0) / windowLoudness.length;
    const avgFlux = windowFlux.reduce((a, b) => a + b, 0) / windowFlux.length;
    
    const startTime = (startFrame / framesTotal) * durationSeconds;
    const endTime = (endFrame / framesTotal) * durationSeconds;
    
    // Klasyfikacja segmentu
    let label: AudioSegment["label"];
    const intensity = (avgEnergy + avgLoudness + avgFlux / (Math.max(...spectralFlux) || 1)) / 3;
    
    if (w === 0) {
      label = "intro";
    } else if (w === numWindows - 1) {
      label = "outro";
    } else if (avgNovelty > 0.6 && avgEnergy > 0.7) {
      label = "drop";
    } else if (avgNovelty > 0.4 && avgEnergy < avgLoudness) {
      label = "buildup";
    } else if (avgEnergy < 0.3 && avgLoudness < 0.4) {
      label = "breakdown";
    } else if (avgEnergy > 0.6 && avgNovelty > 0.3) {
      label = "chorus";
    } else if (avgEnergy > 0.4 && avgNovelty < 0.4) {
      label = "verse";
    } else {
      label = "ambient";
    }
    
    segments.push({
      start: startTime,
      end: endTime,
      label,
      energy: avgEnergy,
      intensity,
    });
  }
  
  return mergeSimilarSegments(segments);
};

const mergeSimilarSegments = (segments: AudioSegment[]): AudioSegment[] => {
  if (segments.length <= 1) return segments;
  
  const merged: AudioSegment[] = [segments[0]];
  
  for (let i = 1; i < segments.length; i++) {
    const last = merged[merged.length - 1];
    const curr = segments[i];
    
    if (last.label === curr.label && Math.abs(last.energy - curr.energy) < 0.2) {
      // Merge
      last.end = curr.end;
      last.energy = (last.energy + curr.energy) / 2;
      last.intensity = (last.intensity + curr.intensity) / 2;
    } else {
      merged.push(curr);
    }
  }
  
  return merged;
};

const detectChangePoints = (
  novelty: number[],
  energy: number[],
  loudness: number[],
  segments: AudioSegment[],
): ChangePoint[] => {
  const changePoints: ChangePoint[] = [];
  
  // Wykryj punkty zmian na podstawie nagłych zmian w novelty i energy
  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1];
    const curr = segments[i];
    
    const energyChange = Math.abs(curr.energy - prev.energy);
    const intensityChange = Math.abs(curr.intensity - prev.intensity);
    
    if (energyChange > 0.3 || intensityChange > 0.3) {
      let type: ChangePoint["type"];
      
      if (curr.label === "drop" || (curr.energy > prev.energy + 0.3)) {
        type = "drop";
      } else if (curr.label === "buildup" || curr.intensity > prev.intensity + 0.2) {
        type = "buildup";
      } else if (curr.label === "breakdown" || curr.energy < prev.energy - 0.3) {
        type = "breakdown";
      } else if (curr.energy > 0.7 && curr.intensity > 0.6) {
        type = "climax";
      } else {
        type = "transition";
      }
      
      changePoints.push({
        time: curr.start,
        type,
        strength: Math.min(1, energyChange + intensityChange),
      });
    }
  }
  
  return changePoints;
};

const downsample = (values: number[], targetLength: number): number[] => {
  if (values.length <= targetLength) return values;
  
  const result: number[] = [];
  const step = values.length / targetLength;
  
  for (let i = 0; i < targetLength; i++) {
    const start = Math.floor(i * step);
    const end = Math.min(Math.floor((i + 1) * step), values.length);
    
    let sum = 0;
    for (let j = start; j < end; j++) {
      sum += values[j];
    }
    result.push(sum / (end - start));
  }
  
  return result;
};

export const analyzeDynamics = async (
  filePath: string,
  durationSeconds: number,
): Promise<DynamicFeatures> => {
  const samples = await decodeAudioToMono(filePath, SAMPLE_RATE);
  const essentia = getEssentia();
  const vector = essentia.arrayToVector(samples);
  
  // Oblicz krzywe cech dynamicznych
  const loudnessCurve = computeLoudnessCurve(samples);
  const energyCurve = computeEnergyCurve(samples);
  const noveltyCurve = computeNoveltyCurve(samples, SAMPLE_RATE);
  
  const frames = frameAudio(samples, FRAME_SIZE, HOP_SIZE);
  const spectralFlux = computeSpectralFlux(frames, SAMPLE_RATE);
  const spectralCentroid = frames.map((f) => computeSpectralCentroid(f, SAMPLE_RATE));
  
  // Cechy globalne
  const danceability = extractDanceability(essentia, vector);
  const dynamicComplexity = extractDynamicComplexity(essentia, vector);
  
  // Segmentacja
  const segments = detectSegments(
    noveltyCurve,
    energyCurve,
    loudnessCurve,
    spectralFlux,
    SAMPLE_RATE,
    durationSeconds,
  );
  
  // Punkty zmian
  const changePoints = detectChangePoints(
    noveltyCurve,
    energyCurve,
    loudnessCurve,
    segments,
  );
  
  // Downsample do rozsądnego rozmiaru (max 200 punktów)
  const maxPoints = 200;
  
  return {
    loudness: downsample(loudnessCurve, maxPoints),
    energy: downsample(energyCurve, maxPoints),
    noveltyCurve: downsample(noveltyCurve, maxPoints),
    spectralCentroid: downsample(spectralCentroid, maxPoints),
    spectralFlux: downsample(spectralFlux, maxPoints),
    dynamicComplexity,
    danceability,
    segments,
    changePoints,
  };
};

/** Pobiera cechy dynamiczne dla konkretnego czasu w utworze */
export const getDynamicFeaturesAtTime = (
  dynamics: DynamicFeatures,
  timeSeconds: number,
): {
  loudness: number;
  energy: number;
  novelty: number;
  segment: AudioSegment | null;
  isNearChangePoint: boolean;
  changePointType: ChangePoint["type"] | null;
} => {
  const duration = dynamics.segments[dynamics.segments.length - 1]?.end || 0;
  if (duration <= 0) {
    return {
      loudness: 0.5,
      energy: 0.5,
      novelty: 0.5,
      segment: null,
      isNearChangePoint: false,
      changePointType: null,
    };
  }
  
  const position = timeSeconds / duration;
  const index = Math.min(
    Math.floor(position * dynamics.loudness.length),
    dynamics.loudness.length - 1,
  );
  
  const segment = dynamics.segments.find(
    (s) => timeSeconds >= s.start && timeSeconds < s.end,
  ) || null;
  
  const nearbyChange = dynamics.changePoints.find(
    (cp) => Math.abs(cp.time - timeSeconds) < 0.5,
  );
  
  return {
    loudness: dynamics.loudness[index] || 0.5,
    energy: dynamics.energy[index] || 0.5,
    novelty: dynamics.noveltyCurve[index] || 0.5,
    segment,
    isNearChangePoint: !!nearbyChange,
    changePointType: nearbyChange?.type || null,
  };
};

/** Sugeruje intensywność przejścia na podstawie dynamiki */
export const suggestTransitionIntensity = (
  dynamics: DynamicFeatures,
  timeSeconds: number,
): {
  strength: number;
  duration: number;
  transitionType: "strong" | "medium" | "soft";
  reason: string;
} => {
  const features = getDynamicFeaturesAtTime(dynamics, timeSeconds);
  
  // Bazowa intensywność z głośności i energii
  let strength = (features.loudness + features.energy) / 2;
  let transitionType: "strong" | "medium" | "soft" = "medium";
  let reason = "standard transition";
  
  // Modyfikacje na podstawie segmentu
  if (features.segment) {
    switch (features.segment.label) {
      case "drop":
        strength = Math.max(strength, 0.85);
        transitionType = "strong";
        reason = "drop section - high energy";
        break;
      case "buildup":
        strength = Math.min(strength + 0.15, 1);
        transitionType = "medium";
        reason = "buildup section - increasing tension";
        break;
      case "breakdown":
        strength = Math.max(strength - 0.2, 0.3);
        transitionType = "soft";
        reason = "breakdown section - low energy";
        break;
      case "chorus":
        strength = Math.max(strength, 0.7);
        transitionType = "strong";
        reason = "chorus - main theme";
        break;
      case "intro":
      case "outro":
        strength = Math.max(strength - 0.1, 0.35);
        transitionType = "soft";
        reason = `${features.segment.label} section`;
        break;
    }
  }
  
  // Modyfikacje na podstawie punktu zmiany
  if (features.isNearChangePoint && features.changePointType) {
    switch (features.changePointType) {
      case "drop":
        strength = Math.min(strength + 0.25, 1);
        transitionType = "strong";
        reason = "drop moment - maximum impact";
        break;
      case "climax":
        strength = Math.min(strength + 0.2, 1);
        transitionType = "strong";
        reason = "climax moment";
        break;
      case "buildup":
        strength = Math.min(strength + 0.1, 0.85);
        transitionType = "medium";
        reason = "building tension";
        break;
      case "breakdown":
        strength = Math.max(strength - 0.15, 0.3);
        transitionType = "soft";
        reason = "breakdown - calm moment";
        break;
    }
  }
  
  // Modyfikacja na podstawie novelty
  if (features.novelty > 0.7) {
    strength = Math.min(strength + 0.1, 1);
    reason += " + high novelty";
  }
  
  // Oblicz czas trwania przejścia (krótsze przy większej intensywności)
  const baseDuration = 16;
  const duration = Math.round(
    transitionType === "strong"
      ? baseDuration * 0.7
      : transitionType === "soft"
        ? baseDuration * 1.3
        : baseDuration,
  );
  
  return {
    strength: Math.min(1, Math.max(0.1, strength)),
    duration: Math.max(6, Math.min(28, duration)),
    transitionType,
    reason,
  };
};
