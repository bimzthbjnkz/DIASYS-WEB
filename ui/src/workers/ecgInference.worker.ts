import { predict, preloadModels } from '../lib/model'

type Stage = 'stage1' | 'stage2'
interface RunRequest {
  type: 'PARSE_AND_INFER'
  id: number
  columns: number[][]
  names: string[]
  sampleRate: number
}

interface ProgressMessage { type: 'PROGRESS'; id: number; progress: number; stage: string }
interface ResultMessage {
  type: 'SUCCESS'
  id: number
  result: {
    hfProbability: number
    scalogram: { mag: Float32Array; scales: number[]; T: number; ns: number; fs: number; p99: number; a0: number; ratio: number; mode: 'morlet' }
    stage2Probability: number | null
  }
}

function progress(id: number, value: number, stage: string): void {
  self.postMessage({ type: 'PROGRESS', id, progress: value, stage } satisfies ProgressMessage)
}

function findLead(names: string[], preferred: string[], fallback: number): number {
  const normalized = names.map((name) => name.toLowerCase().replace(/[^a-z0-9]/g, ''))
  for (const wanted of preferred) {
    const index = normalized.findIndex((name) => name === wanted || name.includes(wanted))
    if (index >= 0) return index
  }
  return Math.min(fallback, Math.max(names.length - 1, 0))
}

function resample(source: number[], target: number): Float32Array {
  const out = new Float32Array(target)
  if (!source.length) return out
  for (let i = 0; i < target; i++) {
    const pos = (i * (source.length - 1)) / Math.max(target - 1, 1)
    const lo = Math.floor(pos)
    const hi = Math.min(lo + 1, source.length - 1)
    const fraction = pos - lo
    out[i] = source[lo] * (1 - fraction) + source[hi] * fraction
  }
  return out
}

function normalize(signal: Float32Array): Float32Array {
  let mean = 0
  for (const value of signal) mean += value
  mean /= Math.max(signal.length, 1)
  let variance = 0
  for (const value of signal) variance += (value - mean) ** 2
  const sd = Math.sqrt(variance / Math.max(signal.length, 1)) || 1
  return Float32Array.from(signal, (value) => (value - mean) / sd)
}

function cwt(signal: Float32Array, scales: number[]): { values: Float32Array; p99: number } {
  const values = new Float32Array(scales.length * signal.length)
  let min = Infinity
  let max = -Infinity
  for (let si = 0; si < scales.length; si++) {
    const scale = scales[si]
    const radius = Math.min(Math.ceil(4 * scale), Math.floor(signal.length / 2))
    for (let i = 0; i < signal.length; i++) {
      let value = 0
      for (let k = -radius; k <= radius; k++) {
        const index = i + k
        if (index < 0 || index >= signal.length) continue
        const t = k / scale
        value += signal[index] * Math.exp(-(t * t) / 2) * Math.cos(5 * t) / Math.sqrt(scale)
      }
      const magnitude = Math.abs(value)
      values[si * signal.length + i] = magnitude
      if (magnitude < min) min = magnitude
      if (magnitude > max) max = magnitude
    }
  }
  const range = max - min || 1
  for (let i = 0; i < values.length; i++) values[i] = (values[i] - min) / range
  const sorted = Float32Array.from(values).sort()
  return { values, p99: sorted[Math.floor(sorted.length * 0.99)] || 1 }
}

function resizeChannel(source: Float32Array, sourceHeight: number, sourceWidth: number, size: number): Float32Array {
  const result = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    const sy = (y * (sourceHeight - 1)) / Math.max(size - 1, 1)
    const y0 = Math.floor(sy)
    const y1 = Math.min(y0 + 1, sourceHeight - 1)
    const fy = sy - y0
    for (let x = 0; x < size; x++) {
      const sx = (x * (sourceWidth - 1)) / Math.max(size - 1, 1)
      const x0 = Math.floor(sx)
      const x1 = Math.min(x0 + 1, sourceWidth - 1)
      const fx = sx - x0
      const a = source[y0 * sourceWidth + x0] * (1 - fx) + source[y0 * sourceWidth + x1] * fx
      const b = source[y1 * sourceWidth + x0] * (1 - fx) + source[y1 * sourceWidth + x1] * fx
      result[y * size + x] = a * (1 - fy) + b * fy
    }
  }
  return result
}

function buildImage(channels: Float32Array[], scales: number[], size: number, model: Stage): { tensor: Float32Array; scalogram: ResultMessage['result']['scalogram'] } {
  const normalized = channels.map(normalize)
  const cwtResults = normalized.map((signal) => cwt(signal, scales))
  const width = channels[0].length
  const image = new Float32Array(size * size * 3)
  const display = cwtResults[0]
  for (let channel = 0; channel < 3; channel++) {
    const resized = resizeChannel(cwtResults[channel].values, scales.length, width, size)
    for (let i = 0; i < resized.length; i++) image[i * 3 + channel] = model === 'stage1' ? resized[i] * 255 : resized[i]
  }
  const mag = display.values
  return {
    tensor: image,
    scalogram: { mag, scales, T: width, ns: scales.length, fs: model === 'stage1' ? 100 : 125, p99: display.p99, a0: 1, ratio: 1, mode: 'morlet' },
  }
}

self.onmessage = async (event: MessageEvent<RunRequest | { type: 'LOAD_MODELS'; id: number }>) => {
  const request = event.data
  if (request.type === 'LOAD_MODELS') {
    try { await preloadModels(); self.postMessage({ type: 'READY', id: request.id }) } catch (error) { self.postMessage({ type: 'ERROR', id: request.id, error: String(error) }) }
    return
  }
  const { id, columns, names } = request
  try {
    progress(id, 5, 'membaca data')
    const stage1Indexes = [findLead(names, ['ii'], 1), findLead(names, ['v2'], 2), findLead(names, ['v5'], 4)]
    const stage1 = stage1Indexes.map((index) => Array.from(resample(columns[index] ?? [], 1000), Number))
    progress(id, 18, 'preprocessing stage 1 · CWT Morlet')
    const stage1Input = buildImage(stage1.map((signal) => Float32Array.from(signal)), Array.from({ length: 31 }, (_, i) => i + 1), 224, 'stage1')
    progress(id, 52, 'inferensi stage 1 · HF Detection')
    const hfProbability = await predict('model1', stage1Input.tensor, 224)
    if (hfProbability < 0.5) {
      progress(id, 100, 'selesai · Non-HF')
      self.postMessage({ type: 'SUCCESS', id, result: { hfProbability, scalogram: stage1Input.scalogram, stage2Probability: null } } satisfies ResultMessage, { transfer: [stage1Input.tensor.buffer, stage1Input.scalogram.mag.buffer] })
      return
    }
    progress(id, 62, 'preprocessing stage 2 · CWT Morlet')
    const stage2Indexes = [findLead(names, ['i'], 0), findLead(names, ['ii'], 1), findLead(names, ['avl'], 4)]
    const stage2 = stage2Indexes.map((index) => resample(columns[index] ?? [], 1250))
    const stage2Input = buildImage(stage2, Array.from({ length: 48 }, (_, i) => i + 1), 160, 'stage2')
    progress(id, 82, 'inferensi stage 2 · HFpEF vs HFrEF')
    const stage2Probability = await predict('model2', stage2Input.tensor, 160)
    progress(id, 100, 'selesai · hasil cascade tersedia')
    self.postMessage({ type: 'SUCCESS', id, result: { hfProbability, scalogram: stage2Input.scalogram, stage2Probability } } satisfies ResultMessage, { transfer: [stage2Input.tensor.buffer, stage2Input.scalogram.mag.buffer] })
  } catch (error) {
    self.postMessage({ type: 'ERROR', id, error: error instanceof Error ? error.message : String(error) })
  }
}
