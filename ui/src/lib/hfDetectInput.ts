/**
 * HF Detection model input builder — EfficientNetV2B0 version.
 *
 * Pipeline (replicating hf_non-hf.ipynb):
 *  1. Find leads II, V2, V5 (or duplicate available)
 *  2. Window to 12 seconds, resample to 100 Hz → 1200 samples → trim to 1000
 *  3. Z-score standardization (per-lead, BEFORE CWT)
 *  4. CWT Morlet (morl, scales 1-31) → magnitude (31, 1000)
 *  5. Min-max normalization to [0, 1]
 *  6. Bilinear resize to 224×224
 *  7. Stack 3 channels → (224, 224, 3) → Float32Array
 */

import { zscore, minmax2d } from './bandpass.ts'
import { cwtMorl } from './cwtMorl.ts'
import type { Dataset } from './ecg.ts'

export const HF_DETECT_FS = 100
export const HF_DETECT_N = 1000
export const HF_DETECT_SCALES = 31
export const HF_DETECT_OUTPUT_SIZE = 224

export interface HFDetectInput {
  /** (224*224*3) row-major tensor ready for the EfficientNetV2B0 CNN. */
  tensor: Float32Array
  /** Per-lead scalograms for display. */
  scalograms: Float32Array[]
  /** Names of leads used. */
  leadNames: string[]
}

/**
 * Find leads II, V2, V5 from the dataset.
 * Falls back to duplicating available leads if not all are found.
 *
 * Supports both 12-lead (I, II, III, aVR, aVL, aVF, V1-V6)
 * and 8-lead (aVL, aVF, V1-V6) formats.
 */
function findLeads(ds: Dataset): number[] {
  const result: number[] = []
  // Patterns for each target lead: II, V2, V5
  // Each sub-array has patterns to match (case-insensitive, after removing separators)
  const targets = [
    ['ii', 'leadii', 'lead_ii', 'lead ii', 'ii_'],
    ['v2', 'leadv2', 'lead_v2', 'lead v2', 'v2_'],
    ['v5', 'leadv5', 'lead_v5', 'lead v5', 'v5_'],
  ]

  for (const pats of targets) {
    let found = -1
    // Try name-based matching first (exact match)
    for (let i = 0; i < ds.names.length; i++) {
      const n = ds.names[i].toLowerCase().replace(/[\s_\-]/g, '')
      for (const pat of pats) {
        if (n === pat.replace(/[\s_\-]/g, '')) {
          found = i
          break
        }
      }
      if (found >= 0) break
    }

    // If not found, try substring matching for 8-lead formats
    // e.g., "Lead_V2" contains "v2", "Lead_aVL" contains "avl"
    if (found < 0) {
      const searchKey = pats[0] // primary pattern, e.g., "ii", "v2", "v5"
      for (let i = 0; i < ds.names.length; i++) {
        const n = ds.names[i].toLowerCase().replace(/[\s_\-]/g, '')
        if (n.includes(searchKey)) {
          found = i
          break
        }
      }
    }

    result.push(found)
  }

  // Fallback: try index-based matching for standard 12-lead layout
  // Standard order: I=0, II=1, III=2, aVR=3, aVL=4, aVF=5, V1=6, V2=7, V3=8, V4=9, V5=10, V6=11
  const fallbackIndices = [1, 7, 10] // II, V2, V5 in standard 12-lead
  for (let i = 0; i < 3; i++) {
    if (result[i] < 0 && fallbackIndices[i] < ds.cols.length) {
      result[i] = fallbackIndices[i]
    }
  }

  // If still not all leads found, duplicate the first available lead
  const firstAvailable = result.find((r) => r >= 0) ?? 0
  return result.map((r) => (r >= 0 && r < ds.cols.length ? r : firstAvailable))
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
 * Bilinear resize a 2D array (height × width) to (toH × toW).
 */
function resizeBilinear2D(
  arr: Float32Array,
  fromH: number,
  fromW: number,
  toH: number,
  toW: number,
): Float32Array {
  const out = new Float32Array(toH * toW)
  const xRatio = (fromW - 1) / (toW - 1)
  const yRatio = (fromH - 1) / (toH - 1)
  for (let y = 0; y < toH; y++) {
    const fy = y * yRatio
    const y0 = Math.floor(fy)
    const y1 = Math.min(fromH - 1, y0 + 1)
    const dy = fy - y0
    for (let x = 0; x < toW; x++) {
      const fx = x * xRatio
      const x0 = Math.floor(fx)
      const x1 = Math.min(fromW - 1, x0 + 1)
      const dx = fx - x0
      const v00 = arr[y0 * fromW + x0]
      const v01 = arr[y0 * fromW + x1]
      const v10 = arr[y1 * fromW + x0]
      const v11 = arr[y1 * fromW + x1]
      out[y * toW + x] =
        v00 * (1 - dx) * (1 - dy) +
        v01 * dx * (1 - dy) +
        v10 * (1 - dx) * dy +
        v11 * dx * dy
    }
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
  const leadIndices = findLeads(ds)
  const leadNames = leadIndices.map((i) => ds.names[i] || `Lead ${i + 1}`)

  const scalograms: Float32Array[] = []
  const tensor = new Float32Array(
    HF_DETECT_OUTPUT_SIZE * HF_DETECT_OUTPUT_SIZE * 3,
  )

  for (let ch = 0; ch < 3; ch++) {
    const col = ds.cols[leadIndices[ch]]

    // Step 1: Window to 12 seconds and resample to 100 Hz
    const maxSamples = Math.min(col.length, Math.floor(12 * fs))
    const raw = new Float32Array(maxSamples)
    for (let i = 0; i < maxSamples; i++) raw[i] = col[i]

    // Resample to target fs × 10 seconds = 1000 samples
    const resampled = resample(raw, HF_DETECT_FS * 10)

    // Step 2: Z-score standardization (per-lead, BEFORE CWT)
    const normalized = zscore(resampled)

    // Step 3: CWT Morlet (31 scales, magnitude) → (31, 1000)
    const scal = cwtMorl(normalized, HF_DETECT_SCALES)

    // Step 4: Min-max normalization to [0, 1]
    const scaled = minmax2d(scal)

    // Step 5: Resize to 224×224
    const resized = resizeBilinear2D(
      scaled,
      HF_DETECT_SCALES,
      HF_DETECT_N,
      HF_DETECT_OUTPUT_SIZE,
      HF_DETECT_OUTPUT_SIZE,
    )

    scalograms.push(resized)

    // Step 6: Copy into tensor (HWC layout: H×W for this channel)
    const offset = ch * HF_DETECT_OUTPUT_SIZE * HF_DETECT_OUTPUT_SIZE
    for (let i = 0; i < resized.length; i++) {
      tensor[offset + i] = resized[i]
    }
  }

  return { tensor, scalograms, leadNames }
}
