import { toNum } from './format.ts'

/* ---------------- Sintesis sinyal EKG ---------------- */
export function gauss(t: number, mu: number, s: number): number {
  return Math.exp(-((t - mu) * (t - mu)) / (2 * s * s))
}

export function synthECG(kind: string, seconds = 10, fs = 250): Float32Array {
  const n = Math.floor(seconds * fs)
  const x = new Float32Array(n)
  const bpm = kind === 'hfref' ? 84 : 72
  const beats: number[] = []
  let t = 0.45
  while (t < seconds - 0.5) {
    beats.push(t)
    t += 60 / (bpm + (Math.random() - 0.5) * 6)
  }
  for (let i = 0; i < n; i++) {
    const tt = i / fs
    let v = 0
    for (const b of beats) {
      const dt = tt - b
      if (dt < -0.45 || dt > 0.65) continue
      if (kind === 'hfpEF') v += gauss(dt, -0.22, 0.03) * 0.17 + gauss(dt, -0.155, 0.024) * 0.13
      else v += gauss(dt, -0.2, 0.026) * 0.13
      const w = kind === 'hfref' ? 1.9 : 1.0
      const R = kind === 'hfref' ? 0.72 : 1.32
      v += gauss(dt, -0.035, 0.009 * w) * (-0.11 * w)
      v += gauss(dt, 0, 0.0105 * w) * R
      v += gauss(dt, 0.037, 0.0095 * w) * (-0.24 * w)
      if (kind === 'hfref') v += gauss(dt, 0.1, 0.045) * 0.06
      const tA = kind === 'hfref' ? 0.15 : 0.27
      const tMu = kind === 'hfref' ? 0.37 : 0.27
      const tS = kind === 'hfref' ? 0.078 : 0.055
      v += gauss(dt, tMu, tS) * tA
    }
    x[i] = v
  }
  for (let i = 0; i < n; i++) {
    const tt = i / fs
    x[i] += 0.26 * Math.sin(2 * Math.PI * 0.28 * tt + 1.2) + 0.11 * Math.sin(2 * Math.PI * 0.12 * tt + 0.4)
    x[i] += 0.03 * Math.sin(2 * Math.PI * 50 * tt) * (0.7 + Math.random() * 0.6)
    x[i] += (Math.random() - 0.5) * 0.05
  }
  return x
}

/* ---------------- Parser file ---------------- */
export interface ParseResult {
  cols: Float32Array[]
  names: string[]
}

export function parseDelimited(text: string): ParseResult | null {
  const lines = text.split(/\r?\n/)
  const probe = lines.filter((l) => l.trim()).slice(0, 12)
  let delim = ' '
  let best = 0
  for (const d of [',', ';', '\t']) {
    const c = probe.reduce((s, l) => s + (l.split(d).length - 1), 0)
    if (c > best) {
      best = c
      delim = d
    }
  }
  const splitLine = (l: string): string[] =>
    delim === ' ' ? l.trim().split(/\s+/) : l.split(delim).map((s) => s.trim())
  let header: string[] | null = null
  const grid: number[][] = []
  for (const line of lines) {
    if (!line.trim()) continue
    const cells = splitLine(line)
    if (header === null && grid.length === 0) {
      if (cells.some((c) => c !== '' && Number.isNaN(toNum(c)))) {
        header = cells
        continue
      }
    }
    grid.push(cells.map(toNum))
    if (grid.length >= 50000) break
  }
  if (!grid.length) return null
  const ncols = Math.max(...grid.slice(0, 100).map((r) => r.length))
  const cols: Float32Array[] = []
  const names: string[] = []
  for (let c = 0; c < ncols; c++) {
    const arr: number[] = []
    let bad = 0
    for (const r of grid) {
      const v = r[c]
      if (Number.isFinite(v)) arr.push(v)
      else bad++
    }
    if (arr.length >= 200 && bad <= grid.length * 0.25) {
      cols.push(Float32Array.from(arr.slice(0, 40000)))
      names.push(header && header[c] ? header[c] : 'Kolom ' + (cols.length + 1))
    }
  }
  return cols.length ? { cols, names } : null
}

export function decode212(buf: ArrayBuffer): [Float32Array, Float32Array] {
  const bytes = new Uint8Array(buf)
  const frames = Math.floor(bytes.length / 3)
  const ch0 = new Float32Array(frames)
  const ch1 = new Float32Array(frames)
  for (let i = 0; i < frames; i++) {
    const b0 = bytes[i * 3]
    const b1 = bytes[i * 3 + 1]
    const b2 = bytes[i * 3 + 2]
    let v0 = b0 | ((b1 & 0x0f) << 8)
    if (v0 >= 2048) v0 -= 4096
    let v1 = b2 | ((b1 & 0xf0) << 4)
    if (v1 >= 2048) v1 -= 4096
    ch0[i] = v0
    ch1[i] = v1
  }
  return [ch0, ch1]
}

export function bestLead(cols: Float32Array[]): number {
  let bi = 0
  let bv = -1
  cols.forEach((c, i) => {
    const step = Math.max(1, Math.floor(c.length / 500))
    const s: number[] = []
    for (let j = 0; j < c.length; j += step) s.push(c[j])
    s.sort((a, b) => a - b)
    const rng = s[Math.floor(s.length * 0.95)] - s[Math.floor(s.length * 0.05)]
    if (rng > bv) {
      bv = rng
      bi = i
    }
  })
  return bi
}

export function absPercentile(x: Float32Array, p: number): number {
  const step = Math.max(1, Math.floor(x.length / 400))
  const s: number[] = []
  for (let i = 0; i < x.length; i += step) s.push(Math.abs(x[i]))
  s.sort((a, b) => a - b)
  return s[Math.floor(s.length * p)] || 1
}

export function pickScale(col: Float32Array): number {
  const ap = absPercentile(col, 0.98)
  if (ap > 1000) return 0.001
  if (ap > 60) return 1 / 200
  return 1
}

export interface Dataset {
  name: string
  cols: Float32Array[]
  names: string[]
  kind: string
  note: string
}

export function getSignal(dataset: Dataset, fs: number, leadIdx: number): { raw: Float32Array; fs: number } {
  const col = dataset.cols[leadIdx]
  const scale = pickScale(col)
  const cap = Math.min(col.length, Math.floor(12 * fs))
  const raw = new Float32Array(cap)
  for (let i = 0; i < cap; i++) raw[i] = col[i] * scale
  return { raw, fs }
}

/* ---------------- Preprocessing ---------------- */
export function preprocess(sig: Float32Array, fs: number): Float32Array {
  const n = sig.length
  const w = Math.max(Math.floor(fs * 0.6), 25)
  const pref = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) pref[i + 1] = pref[i] + sig[i]
  const y = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - w)
    const b = Math.min(n, i + w + 1)
    y[i] = sig[i] - (pref[b] - pref[a]) / (b - a)
  }
  const d = fs / 100
  const i0 = Math.floor(d)
  const frac = d - i0
  if (i0 >= 1) {
    const z = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      if (i > i0) {
        const delayed = (1 - frac) * y[i - i0] + frac * y[i - i0 - 1]
        z[i] = y[i] - 0.92 * delayed
      } else z[i] = y[i]
    }
    y.set(z)
  }
  const s = new Float32Array(n)
  for (let i = 1; i < n - 1; i++) s[i] = (y[i - 1] + 2 * y[i] + y[i + 1]) / 4
  s[0] = s[1]
  s[n - 1] = s[n - 2]
  return s
}

export interface PeakResult {
  idx: number[]
  flip: boolean
  yy: Float32Array
}

export function detectPeaks(y: Float32Array, fs: number): PeakResult {
  let mx = 0
  let mn = 0
  for (let i = 0; i < y.length; i++) {
    if (y[i] > mx) mx = y[i]
    if (y[i] < mn) mn = y[i]
  }
  const flip = -mn > mx
  const yy = flip ? y.map((v) => -v) : y
  let pm = 0
  for (let i = 0; i < yy.length; i++) if (yy[i] > pm) pm = yy[i]
  const thr = pm * 0.35
  const minD = Math.floor(fs * 0.4)
  const idx: number[] = []
  let last = -1e9
  for (let i = 2; i < yy.length - 2; i++) {
    if (yy[i] > thr && yy[i] >= yy[i - 1] && yy[i] > yy[i + 1] && i - last >= minD) {
      idx.push(i)
      last = i
    }
  }
  return { idx, flip, yy }
}

export interface MeasureResult {
  amp: number
  qrsW: number
  sdnn: number
}

export function measure(yy: Float32Array, fs: number, peaks: number[]): MeasureResult {
  let amp = 0
  let wSum = 0
  let cnt = 0
  for (const p of peaks) {
    amp += yy[p]
    const th = 0.12 * Math.abs(yy[p])
    let l = p
    let r = p
    while (l > 0 && Math.abs(yy[l]) > th) l--
    while (r < yy.length - 1 && Math.abs(yy[r]) > th) r++
    wSum += ((r - l) / fs) * 1000
    cnt++
  }
  const rr: number[] = []
  for (let i = 1; i < peaks.length; i++) rr.push(((peaks[i] - peaks[i - 1]) / fs) * 1000)
  let sdnn = 0
  if (rr.length > 1) {
    const mean = rr.reduce((a, b) => a + b, 0) / rr.length
    sdnn = Math.sqrt(rr.reduce((a, b) => a + (b - mean) * (b - mean), 0) / rr.length)
  }
  return { amp: amp / Math.max(cnt, 1), qrsW: wSum / Math.max(cnt, 1), sdnn }
}

/* ---------------- CWT (Morlet) ---------------- */
export interface ScalResult {
  mag: Float32Array
  scales: number[]
  T: number
  ns: number
  fs: number
  p99: number
  a0: number
  ratio: number
  /** 'mexh' = model input scalogram (pywt mexican-hat, scales 1..32). */
  mode?: 'morlet' | 'mexh'
}

export async function cwtScalogram(
  y: Float32Array,
  fs: number,
  onProg: (p: number) => void
): Promise<ScalResult> {
  const n = y.length
  const step = Math.max(2, Math.round(fs / 125))
  const T = Math.floor(n / step)
  const ns = 56
  const a0 = Math.max(1.5, (0.968 * fs) / 121)
  const ratio = Math.pow(121 / 1.2, 1 / 55)
  const scales: number[] = []
  for (let i = 0; i < ns; i++) scales.push(a0 * Math.pow(ratio, i))
  const mag = new Float32Array(ns * T)
  const w0 = 6
  const cnorm = Math.pow(Math.PI, -0.25)
  const Lmax = Math.round(fs * 0.9)
  for (let si = 0; si < ns; si++) {
    const a = scales[si]
    const L = Math.min(Math.ceil(4 * a), Lmax)
    const wn = 2 * L + 1
    const wr = new Float32Array(wn)
    const wi = new Float32Array(wn)
    for (let k = -L; k <= L; k++) {
      const t = k / a
      const env = (cnorm * Math.exp((-t * t) / 2)) / Math.sqrt(a)
      wr[k + L] = env * Math.cos(w0 * t)
      wi[k + L] = env * Math.sin(w0 * t)
    }
    for (let bi = 0; bi < T; bi++) {
      const b = bi * step
      let re = 0
      let im = 0
      const lo = b - L < 0 ? -b : -L
      const hi = b + L > n - 1 ? n - 1 - b : L
      for (let k = lo; k <= hi; k++) {
        const sv = y[b + k]
        re += sv * wr[k + L]
        im += sv * wi[k + L]
      }
      mag[si * T + bi] = Math.sqrt(re * re + im * im)
    }
    if (si % 4 === 0) {
      onProg(si / ns)
      await sleep(0)
    }
  }
  onProg(1)
  const smp = Float32Array.from(mag)
  smp.sort()
  const p99 = smp[Math.floor(smp.length * 0.99)] || 1
  return { mag, scales, T, ns, fs, p99, a0, ratio }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
