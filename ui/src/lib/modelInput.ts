import { cwtMexh } from './cwtMexh.ts'
import type { Dataset } from './ecg.ts'

export const MODEL_FS = 250
export const MODEL_N = 2500
export const MODEL_SCALES = 32

export interface ModelChannel {
  label: string
  mag: Float32Array
}

export interface ModelInput {
  /** (32, 2500, 3) row-major tensor ready for the CNN. */
  tensor: Float32Array
  channels: ModelChannel[]
  /** Index into `channels` that should be shown in the UI for the selected lead. */
  displayIdx: number
  usedLeads: number[]
}

function mapLeads(nCols: number): number[] {
  if (nCols >= 3) return [0, 1, Math.min(10, nCols - 1)]
  if (nCols === 2) return [0, 1, 1]
  return [0, 0, 0]
}

/** Median filter (mirror edges) to match EchoNext waveform preprocessing. */
function medianFilter(sig: Float32Array, k = 11): Float32Array {
  const n = sig.length
  const out = new Float32Array(n)
  const half = Math.floor(k / 2)
  const win = new Float32Array(k)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < k; j++) {
      let idx = i - half + j
      if (idx < 0) idx = -idx
      else if (idx >= n) idx = 2 * (n - 1) - idx
      win[j] = sig[idx]
    }
    const sorted = Array.from(win).sort((a, b) => a - b)
    out[i] = sorted[half]
  }
  return out
}

function windowed(sig: Float32Array, fs: number): Float32Array {
  if (fs === MODEL_FS) {
    if (sig.length >= MODEL_N) return sig.slice(0, MODEL_N)
    const out = new Float32Array(MODEL_N)
    out.set(sig)
    return out
  }
  const dur = Math.min(sig.length / fs, 10)
  const m = Math.max(1, Math.round(dur * fs))
  const N = Math.max(1, Math.round(dur * MODEL_FS))
  const out = new Float32Array(MODEL_N)
  if (m === 1) {
    for (let j = 0; j < N && j < MODEL_N; j++) out[j] = sig[0]
  } else {
    const k = (m - 1) / (N - 1)
    for (let j = 0; j < N && j < MODEL_N; j++) {
      const pos = j * k
      const i0 = Math.floor(pos)
      const frac = pos - i0
      const i1 = Math.min(m - 1, i0 + 1)
      out[j] = sig[i0] * (1 - frac) + sig[i1] * frac
    }
  }
  return out
}

/** Percentile of |values| used for clipping (0.1/99.9 percentiles like EchoNext). */
function percentile(vals: number[], p: number): number {
  const s = vals.slice().sort((a, b) => a - b)
  const idx = Math.min(s.length - 1, Math.floor(s.length * p))
  return s[idx]
}

/**
 * Replicate EchoNext waveform preprocessing for a single recording:
 * median filter -> clip 0.1/99.9 percentiles -> z-score (approx. dataset-wide norm).
 */
function preprocessLead(sig: Float32Array, fs: number): Float32Array {
  const w = medianFilter(windowed(sig, fs))
  const lo = percentile(Array.from(w), 0.001)
  const hi = percentile(Array.from(w), 0.999)
  const clipped = new Float32Array(w.length)
  for (let i = 0; i < w.length; i++) clipped[i] = Math.min(hi, Math.max(lo, w[i]))
  let sum = 0
  for (let i = 0; i < clipped.length; i++) sum += clipped[i]
  const mean = sum / clipped.length
  let sq = 0
  for (let i = 0; i < clipped.length; i++) sq += (clipped[i] - mean) * (clipped[i] - mean)
  const std = Math.sqrt(sq / clipped.length) || 1
  const z = new Float32Array(clipped.length)
  for (let i = 0; i < clipped.length; i++) z[i] = (clipped[i] - mean) / std
  return z
}

export function buildEchoNextInput(ds: Dataset, fs: number, leadIdx: number): ModelInput {
  const used = mapLeads(ds.cols.length)
  const channels: ModelChannel[] = used.map((ci) => {
    const col = ds.cols[ci]
    const lead = preprocessLead(col, fs)
    return { label: ds.names[ci] || `Lead ${ci + 1}`, mag: cwtMexh(lead) }
  })
  const disp = used.indexOf(leadIdx)
  const tensor = new Float32Array(MODEL_SCALES * MODEL_N * 3)
  for (let si = 0; si < MODEL_SCALES; si++) {
    for (let t = 0; t < MODEL_N; t++) {
      for (let ch = 0; ch < 3; ch++) {
        tensor[si * (MODEL_N * 3) + t * 3 + ch] = channels[ch].mag[si * MODEL_N + t]
      }
    }
  }
  return { tensor, channels, displayIdx: disp >= 0 ? disp : 1, usedLeads: used }
}

/** @deprecated Use buildEchoNextInput instead. */
export const buildModelInput = buildEchoNextInput

