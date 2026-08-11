import { CMOR_INT_PSI_IM_B64, CMOR_INT_PSI_RE_B64, CMOR_SCALES, CMOR_SPAN, CMOR_STEP } from './cmor_kernel.ts'

const N_SCALES = CMOR_SCALES.length

let INT_PSI_RE: Float64Array | null = null
let INT_PSI_IM: Float64Array | null = null
let FILTERS_RE: Float64Array[] | null = null
let FILTERS_IM: Float64Array[] | null = null

function decodeFloat64B64(b64: string): Float64Array {
  const bin = atob(b64)
  const buf = new ArrayBuffer(bin.length)
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Float64Array(buf)
}

function buildFilters(): void {
  if (FILTERS_RE) return
  if (!INT_PSI_RE) INT_PSI_RE = decodeFloat64B64(CMOR_INT_PSI_RE_B64)
  if (!INT_PSI_IM) INT_PSI_IM = decodeFloat64B64(CMOR_INT_PSI_IM_B64)
  const step = CMOR_STEP
  const span = CMOR_SPAN
  const re: Float64Array[] = new Array(N_SCALES)
  const im: Float64Array[] = new Array(N_SCALES)
  for (let si = 0; si < N_SCALES; si++) {
    const s = CMOR_SCALES[si]
    // pywt: j = np.arange(scale * span + 1) — arange yields ceil() elements
    // for non-integer stops, so the filter length is ceil(scale*span+1).
    const m = Math.ceil(s * span + 1)
    const denom = s * step
    // pywt truncates j to indices < int_psi.size when j[-1] exceeds it.
    let mm = m
    for (let k = 0; k < m; k++) {
      if (Math.floor(k / denom) >= INT_PSI_RE.length) {
        mm = k
        break
      }
    }
    const fr = new Float64Array(mm)
    const fi = new Float64Array(mm)
    for (let n = 0; n < mm; n++) {
      const idx = Math.floor(n / denom)
      fr[n] = INT_PSI_RE[idx]
      fi[n] = INT_PSI_IM[idx]
    }
    for (let i = 0, j = mm - 1; i < j; i++, j--) {
      const tr = fr[i]
      const ti = fi[i]
      fr[i] = fr[j]
      fi[i] = fi[j]
      fr[j] = tr
      fi[j] = ti
    }
    re[si] = fr
    im[si] = fi
  }
  FILTERS_RE = re
  FILTERS_IM = im
}

/**
 * Replicates pywt.cwt(sig, cmor_scales, 'cmor1.5-1.0', sampling_period=1/100)
 * magnitude output for an fs=100 signal of length n, shape (32, n).
 * Mirrors the exact pywt algorithm: complex convolution of the (conjugated)
 * integral wavelet filter, -sqrt(scale) * diff, then centered trimming.
 */
export function cwtCmor(sig: Float32Array): Float32Array {
  const n = sig.length
  buildFilters()
  const out = new Float32Array(N_SCALES * n)
  for (let si = 0; si < N_SCALES; si++) {
    const s = CMOR_SCALES[si]
    const fr = FILTERS_RE![si]
    const fi = FILTERS_IM![si]
    const m = fr.length
    const scaleFactor = -Math.sqrt(s)
    const coefLen = n + m - 2
    const d = (m - 2) / 2
    const lo = Math.floor(d)
    const hi = coefLen - Math.ceil(d)
    let oi = 0
    for (let k = lo; k < hi; k++) {
      let re = 0
      let im = 0
      const j0 = Math.max(0, k + 1 - (m - 1))
      const j1 = Math.min(n - 1, k)
      for (let i = j0; i <= j1; i++) {
        const dr = fr[k + 1 - i] - fr[k - i]
        const di = fi[k + 1 - i] - fi[k - i]
        const x = sig[i]
        re += x * dr
        im += x * di
      }
      out[si * n + oi++] = Math.abs(scaleFactor * Math.hypot(re, im))
    }
  }
  return out
}

/** Returns the 32 cmor scales used by the HF model input CWT. */
export function cmorScales(): number[] {
  return CMOR_SCALES.slice()
}
