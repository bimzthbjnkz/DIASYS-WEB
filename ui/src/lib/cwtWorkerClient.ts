/**
 * CWT Web Worker client — provides a Promise-based API for running
 * Morlet CWT in a background thread without blocking the UI.
 *
 * Falls back to main-thread async CWT if Workers are unavailable.
 */

import { cwtMorlAsync } from './cwtMorl'

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (v: Float32Array) => void; reject: (e: Error) => void }>()

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null
  if (worker) return worker
  try {
    worker = new Worker(new URL('../workers/cwt.worker.ts', import.meta.url), { type: 'module' })
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
      // Reject all pending on worker crash
      for (const [id, p] of pending) {
        p.reject(new Error('CWT worker crashed: ' + e.message))
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
 * Run CWT in a Web Worker. Falls back to main-thread async CWT.
 *
 * @param signal    Input signal (Float32Array)
 * @param nScales   Number of Morlet scales
 * @param onProgress  Optional progress callback
 */
export async function cwtMorlWorker(
  signal: Float32Array,
  nScales: number,
  onProgress?: (done: number, total: number) => void,
): Promise<Float32Array> {
  const w = getWorker()
  if (!w) {
    // Fallback: run async on main thread (still yields to browser)
    return cwtMorlAsync(signal, nScales, 4, onProgress)
  }

  return new Promise<Float32Array>((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    w.postMessage({ id, signal, nScales })
  })
}

/** Terminate the worker (call on app unmount or when no longer needed). */
export function terminateCwtWorker(): void {
  if (worker) {
    worker.terminate()
    worker = null
    for (const [, p] of pending) {
      p.reject(new Error('CWT worker terminated'))
    }
    pending.clear()
  }
}
