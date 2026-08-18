import { MORL_INT_PSI_B64, MORL_STEP, MORL_SPAN } from './morl_kernel.ts'

let INT_PSI: Float64Array | null = null
let FILTERS: Float32Array[] | null = null

function decodeIntPsi(): Float64Array {
  const bin = atob(MORL_INT_PSI_B64)
  const buf = new ArrayBuffer(bin.length)
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Float64Array(buf)
}

/**
 * Build per-scale filters from the pre-computed Morlet integral wavelet.
 * Filters are cached since they depend only on the wavelet, not the signal.
 */
function buildFilters(nScales: number): Float32Array[] {
  if (FILTERS && FILTERS.length >= nScales) return FILTERS
  if (!INT_PSI) INT_PSI = decodeIntPsi()
  const step = MORL_STEP
  const span = MORL_SPAN
  const out: Float32Array[] = new Array(nScales)
  for (let si = 0; si < nScales; si++) {
    const s = si + 1 // scales are 1-based
    const m = Math.floor(s * span) + 1
    const f = new Float32Array(m - 1)
    const denom = s * step
    for (let n = 0; n < m - 1; n++) {
      const idx0 = Math.floor(n / denom)
      const idx1 = Math.floor((n + 1) / denom)
      f[n] = INT_PSI[idx1] - INT_PSI[idx0]
    }
    // Reverse in place to match the original integral-wavelet difference.
    for (let i = 0, j = f.length - 1; i < j; i++, j--) {
      const t = f[i]
      f[i] = f[j]
      f[j] = t
    }
    out[si] = f
  }
  FILTERS = out
  return out
}

/**
 * CWT using Morlet wavelet ('morl'), replicates pywt.cwt(sig, scales, 'morl').
 *
 * @param sig       Input signal (Float32Array)
 * @param nScales   Number of scales (default 31 for Stage 1, 48 for Stage 2)
 * @returns         Magnitude scalogram as Float32Array of shape (nScales, n)
 */
export function cwtMorl(sig: Float32Array, nScales = 31): Float32Array {
  const n = sig.length
  const filters = buildFilters(nScales)
  const out = new Float32Array(nScales * n)
  for (let si = 0; si < nScales; si++) {
    const f = filters[si]
    const m = f.length + 1
    const scaleFactor = -Math.sqrt(si + 1)
    const coefLen = n + m - 2
    const d = (m - 2) / 2
    const lo = Math.floor(d)
    const hi = coefLen - Math.ceil(d)
    let oi = 0
    for (let k = lo; k < hi; k++) {
      let re = 0
      const j0 = Math.max(0, k + 1 - (m - 1))
      const j1 = Math.min(n - 1, k)
      for (let i = j0; i <= j1; i++) {
        re += sig[i] * f[k - i]
      }
      out[si * n + oi++] = Math.abs(scaleFactor * re)
    }
  }
  return out
}

/**
 * Async CWT — yields to the browser every `yieldEvery` scales to prevent UI freeze.
 * Returns the same magnitude scalogram as the sync version.
 */
export async function cwtMorlAsync(
  sig: Float32Array,
  nScales = 31,
  yieldEvery = 4,
  onProgress?: (done: number, total: number) => void,
): Promise<Float32Array> {
  const n = sig.length
  const filters = buildFilters(nScales)
  const out = new Float32Array(nScales * n)
  for (let si = 0; si < nScales; si++) {
    const f = filters[si]
    const m = f.length + 1
    const scaleFactor = -Math.sqrt(si + 1)
    const coefLen = n + m - 2
    const d = (m - 2) / 2
    const lo = Math.floor(d)
    const hi = coefLen - Math.ceil(d)
    let oi = 0
    for (let k = lo; k < hi; k++) {
      let re = 0
      const j0 = Math.max(0, k + 1 - (m - 1))
      const j1 = Math.min(n - 1, k)
      for (let i = j0; i <= j1; i++) {
        re += sig[i] * f[k - i]
      }
      out[si * n + oi++] = Math.abs(scaleFactor * re)
    }
    // Yield to browser periodically so UI stays responsive
    if (si % yieldEvery === yieldEvery - 1) {
      onProgress?.(si + 1, nScales)
      await new Promise<void>((r) => setTimeout(r, 0))
    }
  }
  onProgress?.(nScales, nScales)
  return out
}

/** Returns scales array [1, 2, ..., nScales] used by the Morlet CWT. */
export function morlScales(nScales = 31): number[] {
  return Array.from({ length: nScales }, (_, i) => i + 1)
}
