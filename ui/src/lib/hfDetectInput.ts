/**
 * HF Detection model input builder.
 *
 * Pipeline (replicating Revised_HF_Non_HF.ipynb):
 *  1. Resample to 100 Hz if needed
 *  2. Bandpass filter (0.5–40 Hz, 4th-order Butterworth, filtfilt)
 *  3. Z-score normalization (per-sample)
 *  4. CWT Morlet (cmor1.5-1.0, 32 scales) → magnitude (32, N)
 *  5. Min-max normalization to [0, 1]
 *  6. Reshape to (32, 1000, 1) → Float32Array
 */

import { filtfilt, zscore, minmax2d } from './bandpass.ts'
import { cwtCmor } from './cwtCmor.ts'
import type { Dataset } from './ecg.ts'

export const HF_DETECT_FS = 100
export const HF_DETECT_N = 1000
export const HF_DETECT_SCALES = 32

export interface HFDetectInput {
  /** (32, 1000, 1) row-major tensor ready for the HF Detect CNN. */
  tensor: Float32Array
  /** Filtered signal after bandpass (for visualization). */
  filteredSig: Float32Array
  /** (32, 1000) CWT magnitude scalogram (for display). */
  scalogram: Float32Array
  /** Index of the lead used (Lead II). */
  leadIdx: number
}

/**
 * Find the best Lead II column from the dataset.
 * Checks header names first; falls back to index 1.
 */
function findLeadII(ds: Dataset): number {
  for (let i = 0; i < ds.names.length; i++) {
    const n = ds.names[i].toLowerCase().replace(/[\s_-]/g, '')
    if (n === 'leadii') return i
  }
  // Also check common patterns
  for (let i = 0; i < ds.names.length; i++) {
    const n = ds.names[i].toLowerCase()
    if (n.includes('lead_ii') || n === 'ii') return i
  }
  return Math.min(1, ds.cols.length - 1) // default: second column
}

/**
 * Resample a signal to a target length using linear interpolation.
 */
function resample(sig: Float32Array, targetLen: number): Float32Array {
  if (sig.length === targetLen) return sig
  const out = new Float32Array(targetLen)
  const k = (sig.length - 1) / (targetLen - 1)
  for (let i = 0; i < targetLen; i++) {
    const pos = i * k
    const i0 = Math.floor(pos)
    const frac = pos - i0
    const i1 = Math.min(sig.length - 1, i0 + 1)
    out[i] = sig[i0] * (1 - frac) + sig[i1] * frac
  }
  return out
}

/**
 * Build the HF Detection model input from a dataset.
 * @param ds    The loaded dataset with columns and names
 * @param fs    Sampling rate of the dataset
 * @returns     HFDetectInput ready for model.predict()
 */
export function buildHFDetectInput(ds: Dataset, fs: number): HFDetectInput {
  const leadIdx = findLeadII(ds)
  const col = ds.cols[leadIdx]

  // Step 1: Window to 10 seconds and resample to 100 Hz
  const maxSamples = Math.min(col.length, Math.floor(12 * fs))
  const raw = new Float32Array(maxSamples)
  for (let i = 0; i < maxSamples; i++) raw[i] = col[i]

  // Resample to target fs × 10 seconds = 1000 samples
  const targetLen = HF_DETECT_FS * 10 // 1000
  const resampled = resample(raw, targetLen)

  // Step 2: Bandpass filter (0.5–40 Hz, 4th order)
  const filtered = filtfilt(resampled, HF_DETECT_FS, 0.5, 40, 4)

  // Step 3: Z-score normalization
  const normalized = zscore(filtered)

  // Step 4: CWT Morlet (32 scales, magnitude)
  const scalogram = cwtCmor(normalized)

  // Step 5: Min-max normalization to [0, 1]
  const scaled = minmax2d(scalogram)

  // Step 6: Reshape to (32, 1000, 1) — single channel
  const tensor = new Float32Array(HF_DETECT_SCALES * HF_DETECT_N * 1)
  for (let si = 0; si < HF_DETECT_SCALES; si++) {
    for (let t = 0; t < HF_DETECT_N; t++) {
      tensor[si * HF_DETECT_N + t] = scaled[si * HF_DETECT_N + t]
    }
  }

  return {
    tensor,
    filteredSig: filtered,
    scalogram: scaled,
    leadIdx,
  }
}
