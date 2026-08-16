/**
 * EchoNext model input builder — EfficientNetV2B0 version.
 *
 * Pipeline (replicating hfpef_hfref.ipynb):
 *  1. Select leads I, II, V5 (indices 0, 1, 4 in 12-lead; duplicate if missing)
 *  2. Resample to 250 Hz → 2500 samples
 *  3. Downsample by factor 2 → 1250 samples
 *  4. CWT Morlet (morl, scales 1-48) → magnitude (48, 1250)
 *  5. Min-max normalization to [0, 1]
 *  6. Bilinear resize to 160×160
 *  7. Stack 3 channels → (160, 160, 3) → Float32Array
 */

import { cwtMorl } from './cwtMorl.ts'
import { minmax2d } from './bandpass.ts'
import type { Dataset } from './ecg.ts'

export const MODEL_FS = 250
export const MODEL_N = 1250 // after downsample from 2500
export const MODEL_SCALES = 48
export const MODEL_OUTPUT_SIZE = 160
export const MODEL_DOWNSAMPLE = 2

export interface ModelChannel {
  label: string
  mag: Float32Array
}

export interface ModelInput {
  /** (160*160*3) row-major tensor ready for the EfficientNetV2B0 CNN. */
  tensor: Float32Array
  channels: ModelChannel[]
  /** Index into `channels` that should be shown in the UI for the selected lead. */
  displayIdx: number
  usedLeads: number[]
}

/**
 * Find leads I, II, V5 from the dataset.
 * Tries name-based matching first, then falls back to index-based matching
 * for standard 12-lead layout: I=0, II=1, III=2, aVR=3, aVL=4, aVF=5,
 * V1=6, V2=7, V3=8, V4=9, V5=10, V6=11
 *
 * Supports both 12-lead (I, II, III, aVR, aVL, aVF, V1-V6)
 * and 8-lead (aVL, aVF, V1-V6) formats.
 */
function findLeads(ds: Dataset): number[] {
  const result: number[] = []
  // Patterns for each target lead: I, II, V5
  const targets = [
    ['i', 'leadi', 'lead_i', 'lead i', 'lead1'],
    ['ii', 'leadii', 'lead_ii', 'lead ii', 'lead2'],
    ['v5', 'leadv5', 'lead_v5', 'lead v5', 'lead11'],
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
    // e.g., "Lead_V5" contains "v5"
    if (found < 0) {
      const searchKey = pats[0] // primary pattern, e.g., "i", "ii", "v5"
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
  const fallbackIndices = [0, 1, 10] // I, II, V5 in standard 12-lead
  for (let i = 0; i < 3; i++) {
    if (result[i] < 0 && fallbackIndices[i] < ds.cols.length) {
      result[i] = fallbackIndices[i]
    }
  }

  // Final fallback for small datasets
  const nCols = ds.cols.length
  if (result[0] < 0 && nCols >= 1) result[0] = 0
  if (result[1] < 0 && nCols >= 2) result[1] = 1
  if (result[2] < 0 && nCols >= 3) result[2] = Math.min(2, nCols - 1)

  return result
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
 * Downsample by averaging adjacent samples.
 */
function downsample(sig: Float32Array, factor: number): Float32Array {
  const outLen = Math.floor(sig.length / factor)
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    let sum = 0
    for (let j = 0; j < factor; j++) {
      sum += sig[i * factor + j]
    }
    out[i] = sum / factor
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

export function buildEchoNextInput(
  ds: Dataset,
  fs: number,
  _leadIdx: number,
): ModelInput {
  const used = findLeads(ds)
  const channels: ModelChannel[] = used.map((ci) => {
    let col = ds.cols[ci]
    const label = ds.names[ci] || `Lead ${ci + 1}`

    // Step 1: Resample to 250 Hz → 2500 samples
    let sig = resample(col, MODEL_FS * 10)

    // Step 2: Downsample by factor 2 → 1250 samples
    sig = downsample(sig, MODEL_DOWNSAMPLE)

    // Step 3: CWT Morlet (48 scales, magnitude) → (48, 1250)
    const scal = cwtMorl(sig, MODEL_SCALES)

    // Step 4: Min-max normalization to [0, 1]
    const scaled = minmax2d(scal)

    // Step 5: Resize to 160×160
    const resized = resizeBilinear2D(
      scaled,
      MODEL_SCALES,
      MODEL_N,
      MODEL_OUTPUT_SIZE,
      MODEL_OUTPUT_SIZE,
    )

    return { label, mag: resized }
  })

  const disp = used.indexOf(_leadIdx)
  const tensor = new Float32Array(MODEL_OUTPUT_SIZE * MODEL_OUTPUT_SIZE * 3)
  for (let ch = 0; ch < 3; ch++) {
    const offset = ch * MODEL_OUTPUT_SIZE * MODEL_OUTPUT_SIZE
    for (let i = 0; i < channels[ch].mag.length; i++) {
      tensor[offset + i] = channels[ch].mag[i]
    }
  }

  return { tensor, channels, displayIdx: disp >= 0 ? disp : 1, usedLeads: used }
}

/** @deprecated Use buildEchoNextInput instead. */
export const buildModelInput = buildEchoNextInput
