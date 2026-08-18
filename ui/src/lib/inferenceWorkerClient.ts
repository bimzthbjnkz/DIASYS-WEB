/**
 * Inference Web Worker client — provides a Promise-based API for running
 * TF.js model prediction in a background thread without blocking the UI.
 *
 * Falls back to main-thread inference if Workers are unavailable.
 */

import { predictEchoNext, predictHFDetect } from './model'
import type { EchoNextResult, HFDetectResult } from './model'

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (v: Float32Array) => void; reject: (e: Error) => void }>()

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null
  if (worker) return worker
  try {
    worker = new Worker(new URL('../workers/inference.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e) => {
      const { id, result, error } = e.data
      const p = pending.get(id)
      if (!p) return
      pending.delete(id)
      if (error) {
        p.reject(new Error(error))
      } else {
        p.resolve(result)
      }
    }
    worker.onerror = (e) => {
      for (const [id, p] of pending) {
        p.reject(new Error('Inference worker crashed: ' + e.message))
        pending.delete(id)
      }
      worker = null
    }
    return worker
  } catch {
    return null
  }
}

/**
 * Run a single inference in a Web Worker.
 * Falls back to main-thread inference if Workers are unavailable.
 */
async function runInWorker(
  modelName: string,
  tensor: Float32Array,
  shape: [number, number, number, number],
): Promise<Float32Array> {
  const w = getWorker()
  if (!w) {
    // Fallback: run on main thread
    if (modelName === 'echonext') {
      const r = await predictEchoNext(tensor)
      return new Float32Array([r.pHFpEF, r.pHFrEF])
    }
    const r = await predictHFDetect(tensor)
    return new Float32Array([r.pHF ? 1 : 0, r.pHF, r.pNonHF])
  }

  return new Promise<Float32Array>((resolve, reject) => {
    const id = nextId++
    const timer = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        reject(new Error(`Batas waktu inferensi (${modelName}) terlampaui (timeout).`))
      }
    }, 120000)

    pending.set(id, {
      resolve: (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      reject: (e) => {
        clearTimeout(timer)
        reject(e)
      },
    })
    // Keep the caller's tensor intact. EchoNext may reuse it for Grad-CAM after
    // inference; transferring the original buffer would detach it.
    const tensorData = tensor.slice()
    w.postMessage({ id, modelName, tensorData, shape }, [tensorData.buffer])
  })
}

/** Predict HF Detection using Web Worker. */
export async function predictHFDetectWorker(
  tensor: Float32Array,
): Promise<HFDetectResult> {
  const result = await runInWorker('hfdetect', tensor, [1, 224, 224, 3])
  const pHF = result[0]
  return { isHF: pHF >= 0.5, pHF, pNonHF: 1 - pHF }
}

/** Predict EchoNext (HFpEF vs HFrEF) using Web Worker. */
export async function predictEchoNextWorker(
  tensor: Float32Array,
): Promise<EchoNextResult> {
  const result = await runInWorker('echonext', tensor, [1, 160, 160, 3])
  const pHFpEF = result[0]
  return { pHFpEF, pHFrEF: 1 - pHFpEF }
}

/** Warm both models in the background so the first analysis avoids model download and compilation. */
export function preloadInferenceModels(): void {
  void Promise.all([
    runInWorker('hfdetect', new Float32Array(224 * 224 * 3), [1, 224, 224, 3]),
    runInWorker('echonext', new Float32Array(160 * 160 * 3), [1, 160, 160, 3]),
  ]).catch(() => {
    // Preloading is an optimization; the actual analysis reports inference errors.
  })
}

/** Terminate the worker (call on app unmount or when no longer needed). */
export function terminateInferenceWorker(): void {
  if (worker) {
    worker.terminate()
    worker = null
    for (const [, p] of pending) {
      p.reject(new Error('Inference worker terminated'))
    }
    pending.clear()
  }
}
