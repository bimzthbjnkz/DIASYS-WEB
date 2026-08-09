import { MEXH_INT_PSI_B64, MEXH_STEP, MEXH_SPAN } from './mexh_kernel.ts'

const N_SCALES = 32
const SCALES: number[] = Array.from({ length: N_SCALES }, (_, i) => i + 1)

let INT_PSI: Float64Array | null = null
let FILTERS: Float64Array[] | null = null

function decodeIntPsi(): Float64Array {
  const bin = atob(MEXH_INT_PSI_B64)
  const buf = new ArrayBuffer(bin.length)
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Float64Array(buf)
}

/**
 * Build the per-scale filter exactly as pywt.cwt does:
 *   j = floor(arange(s*span + 1) / (s*step))
 *   filter = int_psi[j][::-1]
 * Filters are independent of the signal, so they are cached.
 */
function buildFilters(): Float64Array[] {
  if (FILTERS) return FILTERS
  if (!INT_PSI) INT_PSI = decodeIntPsi()
  const step = MEXH_STEP
  const span = MEXH_SPAN
  const out: Float64Array[] = new Array(N_SCALES)
  for (let si = 0; si < N_SCALES; si++) {
    const s = SCALES[si]
    const m = Math.floor(s * span) + 1
    const f = new Float64Array(m)
    const denom = s * step
    for (let n = 0; n < m; n++) {
      const idx = Math.floor(n / denom)
      f[n] = INT_PSI[idx]
    }
    // Reverse in place to match int_psi[j][::-1].
    for (let i = 0, j = m - 1; i < j; i++, j--) {
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
 * Replicates pywt.cwt(signal, np.arange(1, 33), 'mexh') magnitude output,
 * shape (32, 2500). Input signal length must be 2500.
 */
export function cwtMexh(sig: Float32Array): Float32Array {
  const n = sig.length
  const filters = buildFilters()
  const out = new Float32Array(N_SCALES * n)
  for (let si = 0; si < N_SCALES; si++) {
    const s = SCALES[si]
    const f = filters[si]
    const m = f.length
    const scaleFactor = -Math.sqrt(s)
    // Full convolution conv = convolve(sig, f), then coef = scaleFactor * diff(conv).
    // coef length = n + m - 2. Then trim to n: keep [floor((m-2)/2), n+m-2 - ceil((m-2)/2)).
    const coefLen = n + m - 2
    const d = (m - 2) / 2
    const lo = Math.floor(d)
    const hi = coefLen - Math.ceil(d)
    // coef[k] = scaleFactor * (conv[k+1] - conv[k]); we only need indices k in [lo, hi).
    let oi = 0
    for (let k = lo; k < hi; k++) {
      // conv[k+1] - conv[k] = sum_i sig[i]*(f[(k+1)-i] - f[k-i])
      let acc = 0
      const j0 = Math.max(0, k + 1 - (m - 1))
      const j1 = Math.min(n - 1, k)
      for (let i = j0; i <= j1; i++) {
        acc += sig[i] * (f[k + 1 - i] - f[k - i])
      }
      out[si * n + oi++] = Math.abs(scaleFactor * acc)
    }
  }
  return out
}

/** Returns the 32 scales used by the model input CWT. */
export function cwtScales(): number[] {
  return SCALES.slice()
}
