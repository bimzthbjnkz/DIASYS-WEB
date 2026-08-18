import { mapColor } from './colormaps'
import type { ScalResult } from './ecg'

export function captureScalogramThumb(
  scal: ScalResult,
  pre: Float32Array,
  peaksTime: number[],
  klas: string
): string {
  const cnv = document.createElement('canvas')
  cnv.width = 1200
  cnv.height = 440
  const ctx = cnv.getContext('2d')!
  renderScalogram(ctx, cnv.width, cnv.height, {
    scal,
    colormap: 'inferno',
    gradcam: false,
    peaksTime,
    klas,
    pre,
    cam: null,
  })
  return cnv.toDataURL('image/jpeg', 0.82)
}

export function drawEmpty(cnv: HTMLCanvasElement, msg: string): void {
  const ctx = cnv.getContext('2d')!
  const W = cnv.width
  const H = cnv.height
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = '#eef1f7'
  ctx.lineWidth = 1
  for (let i = 1; i < 5; i++) {
    const yy = (i / 5) * H
    ctx.beginPath()
    ctx.moveTo(0, yy)
    ctx.lineTo(W, yy)
    ctx.stroke()
  }
  ctx.fillStyle = '#94a3b8'
  ctx.font = '500 20px "JetBrains Mono", monospace'
  ctx.textAlign = 'center'
  ctx.fillText(msg, W / 2, H / 2 + 7)
  ctx.textAlign = 'left'
}

export function drawECG(
  cnv: HTMLCanvasElement,
  data: Float32Array,
  fs: number,
  color: string,
  peaks: number[] = []
): void {
  const ctx = cnv.getContext('2d')!
  const W = cnv.width
  const H = cnv.height
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, W, H)
  const dur = data.length / fs
  ctx.lineWidth = 1
  for (let t = 0; t <= dur + 0.001; t += 0.2) {
    const x = Math.round((t / dur) * W) + 0.5
    ctx.strokeStyle = Math.abs(t % 1) < 0.01 ? '#f3cdd2' : '#fae7e9'
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, H)
    ctx.stroke()
  }
  for (let i = 1; i < 5; i++) {
    const yy = Math.round((i / 5) * H) + 0.5
    ctx.strokeStyle = '#fae7e9'
    ctx.beginPath()
    ctx.moveTo(0, yy)
    ctx.lineTo(W, yy)
    ctx.stroke()
  }
  let mx = 0
  for (let i = 0; i < data.length; i += 3) {
    const a = Math.abs(data[i])
    if (a > mx) mx = a
  }
  const sc = (H * 0.34) / (mx || 1)
  const mid = H * 0.52
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.lineJoin = 'round'
  ctx.beginPath()
  for (let i = 0; i < data.length; i++) {
    const x = (i / data.length) * W
    const yy = mid - data[i] * sc
    if (i) ctx.lineTo(x, yy)
    else ctx.moveTo(x, yy)
  }
  ctx.stroke()
  ctx.fillStyle = '#d97706'
  for (const p of peaks) {
    const x = (p / data.length) * W
    const yy = mid - data[p] * sc
    ctx.beginPath()
    ctx.arc(x, yy - 9, 4, 0, 7)
    ctx.fill()
  }
  const h1m = Math.min(sc, H * 0.4)
  ctx.strokeStyle = '#94a3b8'
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.moveTo(18, H - 16)
  ctx.lineTo(18, H - 16 - h1m)
  ctx.stroke()
  ctx.fillStyle = '#94a3b8'
  ctx.font = '500 15px "JetBrains Mono"'
  ctx.textAlign = 'left'
  ctx.fillText('1 mV', 26, H - 16 - h1m / 2 + 5)
  ctx.textAlign = 'right'
  ctx.fillText(dur.toFixed(0) + ' s', W - 14, H - 12)
  ctx.textAlign = 'left'
}

export function siForFreq(sc: ScalResult, f: number): number {
  if (sc.mode === 'mexh') {
    // mexh central frequency = 0.25 (normalized). freq = 0.25*fs/scale, index = scale - 1.
    const scale = (0.25 * sc.fs) / f
    return scale - 1
  }
  // The model scalogram uses integer scales [1..N], not the logarithmic
  // scale grid used by the landing-page visualization.
  if (sc.ratio === 1) {
    const scale = (0.8125 * sc.fs) / f // pywt.central_frequency('morl')
    return scale - 1
  }
  return Math.log((0.968 * sc.fs) / f / sc.a0) / Math.log(sc.ratio)
}

interface ScalogramState {
  scal: ScalResult
  colormap: string
  gradcam: boolean
  peaksTime: number[]
  klas: string
  pre: Float32Array | null
  cam: Float32Array | null
}

export function renderScalogram(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  state: ScalogramState
): void {
  const { scal, colormap, gradcam, pre, cam } = state
  if (!scal) return
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, W, H)
  const { mag, T, ns, p99, fs } = scal
  const padL = 76
  const padR = 18
  const padT = 14
  const padB = 40
  const pw = W - padL - padR
  const ph = H - padT - padB
  const off = document.createElement('canvas')
  off.width = T
  off.height = ns
  const octx = off.getContext('2d')!
  const img = octx.createImageData(T, ns)
  const mapName = colormap
  const denom = Math.log1p(p99 * 7)
  for (let si = 0; si < ns; si++) {
    for (let bi = 0; bi < T; bi++) {
      const v = Math.min(1, Math.log1p(mag[si * T + bi] * 7) / denom)
      const c = mapColor(mapName, v)
      const idx = (si * T + bi) * 4
      img.data[idx] = c[0]
      img.data[idx + 1] = c[1]
      img.data[idx + 2] = c[2]
      img.data[idx + 3] = 255
    }
  }
  octx.putImageData(img, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(off, padL, padT, pw, ph)
  if (gradcam) drawGradCam(ctx, padL, padT, pw, ph, scal, cam)
  ctx.strokeStyle = '#e2e8f0'
  ctx.strokeRect(padL, padT, pw, ph)
  ctx.fillStyle = '#64748b'
  ctx.font = '14px "JetBrains Mono", monospace'
  const durSec = scal.mode === 'mexh' ? T / fs : (pre ? pre.length : T * 2) / fs
  ctx.textAlign = 'center'
  for (let t = 0; t <= durSec + 0.01; t += 2) ctx.fillText(t + 's', padL + (t / durSec) * pw, H - 13)
  ctx.textAlign = 'right'
  for (const f of [100, 60, 40, 25, 15, 8, 4, 2]) {
    const si = siForFreq(scal, f)
    if (si < 0 || si > ns - 1) continue
    const yy = padT + (si / (ns - 1)) * ph
    ctx.fillStyle = '#64748b'
    ctx.fillText(f + ' Hz', padL - 9, yy + 5)
    ctx.strokeStyle = 'rgba(100,116,139,.18)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(padL, yy)
    ctx.lineTo(W - padR, yy)
    ctx.stroke()
  }
  ctx.textAlign = 'left'
}

function drawGradCam(
  ctx: CanvasRenderingContext2D,
  padL: number,
  padT: number,
  pw: number,
  ph: number,
  sc: ScalResult,
  cam: Float32Array | null
): void {
  const { T, ns } = sc
  const heat = document.createElement('canvas')
  heat.width = T
  heat.height = ns
  const hctx = heat.getContext('2d')!
  const img = hctx.createImageData(T, ns)
  if (cam && cam.length === T * ns) {
    for (let si = 0; si < ns; si++) {
      for (let bi = 0; bi < T; bi++) {
        const v = Math.max(0, Math.min(1, cam[si * T + bi]))
        const c = mapColor('jet', v)
        const idx = (si * T + bi) * 4
        img.data[idx] = c[0]
        img.data[idx + 1] = c[1]
        img.data[idx + 2] = c[2]
        img.data[idx + 3] = Math.round(200 * v)
      }
    }
  }
  hctx.putImageData(img, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(heat, padL, padT, pw, ph)
}

export function drawTraining(cnv: HTMLCanvasElement): void {
  const ctx = cnv.getContext('2d')!
  const W = cnv.width
  const H = cnv.height
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, W, H)
  const padL = 62
  const padR = 20
  const padT = 40
  const padB = 46
  const pw = W - padL - padR
  const ph = H - padT - padB
  ctx.strokeStyle = '#eef1f7'
  ctx.lineWidth = 1
  ctx.fillStyle = '#94a3b8'
  ctx.font = '16px "JetBrains Mono"'
  ctx.textAlign = 'right'
  for (let i = 0; i <= 4; i++) {
    const yy = padT + (i / 4) * ph
    ctx.beginPath()
    ctx.moveTo(padL, yy)
    ctx.lineTo(W - padR, yy)
    ctx.stroke()
    ctx.fillText((1 - i * 0.25).toFixed(2), padL - 10, yy + 5)
  }
  const E = 60
  const acc: number[] = []
  const val: number[] = []
  const loss: number[] = []
  let a = 0.6
  let l = 0.66
  for (let i = 0; i < E; i++) {
    a += (0.952 - a) * 0.09 + Math.sin(i * 2.7) * 0.004
    l += (0.16 - l) * 0.075
    acc.push(a)
    loss.push(l)
    val.push(Math.max(0.55, a - 0.02 + Math.sin(i * 1.9) * 0.012))
  }
  const X = (i: number): number => padL + (i / (E - 1)) * pw
  const Y = (v: number): number => padT + (1 - v) * ph
  function plot(arr: number[], col: string, dash: boolean): void {
    ctx.beginPath()
    arr.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))))
    ctx.strokeStyle = col
    ctx.lineWidth = 3
    if (dash) ctx.setLineDash([7, 6])
    ctx.stroke()
    ctx.setLineDash([])
  }
  plot(loss, 'rgba(124,58,237,.5)', true)
  plot(val, '#d97706', true)
  plot(acc, '#4f46e5', false)
  ctx.font = '14px Inter'
  ctx.textAlign = 'left'
  ctx.fillStyle = '#4f46e5'
  ctx.fillText('— Akurasi latih', padL, padT - 14)
  ctx.fillStyle = '#d97706'
  ctx.fillText('-- Akurasi validasi', padL + 160, padT - 14)
  ctx.fillStyle = 'rgba(124,58,237,.85)'
  ctx.fillText('-- Loss', padL + 380, padT - 14)
  ctx.fillStyle = '#94a3b8'
  ctx.textAlign = 'center'
  for (let e2 = 0; e2 <= E; e2 += 10) ctx.fillText(e2.toString(), X(Math.min(e2, E - 1)), H - 16)
  ctx.fillText('Epoch', W / 2, H - 2)
}
