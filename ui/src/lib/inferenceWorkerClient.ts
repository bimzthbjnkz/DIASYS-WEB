import type { ScalResult } from './ecg'

interface InferenceResult {
  hfProbability: number
  stage2Probability: number | null
  scalogram: ScalResult
}

interface Pending {
  resolve: (value: InferenceResult) => void
  reject: (error: Error) => void
  progress?: (value: number, stage: string) => void
}

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, Pending>()

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('../workers/ecgInference.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event) => {
    const message = event.data
    const current = pending.get(message.id)
    if (!current) return
    if (message.type === 'READY') {
      pending.delete(message.id)
      return
    }
    if (message.type === 'PROGRESS') return current.progress?.(message.progress, message.stage)
    pending.delete(message.id)
    if (message.type === 'ERROR') current.reject(new Error(message.error))
    else if (message.type === 'SUCCESS') current.resolve(message.result)
  }
  worker.onerror = (event) => {
    for (const current of pending.values()) current.reject(new Error(event.message || 'Worker inferensi gagal.'))
    pending.clear()
    worker = null
  }
  return worker
}

export function preloadInferenceModels(): void {
  const id = nextId++
  pending.set(id, { resolve: () => undefined, reject: () => undefined })
  getWorker().postMessage({ type: 'LOAD_MODELS', id })
}

export function inferECG(columns: Float32Array[], names: string[], sampleRate: number, onProgress: (value: number, stage: string) => void): Promise<InferenceResult> {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, progress: onProgress })
    getWorker().postMessage({ type: 'PARSE_AND_INFER', id, columns: columns.map((column) => Array.from(column)), names, sampleRate })
  })
}
