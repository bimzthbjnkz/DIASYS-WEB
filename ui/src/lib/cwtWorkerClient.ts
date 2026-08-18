/**
 * CWT Web Worker client — provides a Promise-based API for running
 * Morlet CWT in a background thread without blocking the UI.
 *
 * Falls back to main-thread async CWT if Workers are unavailable.
 */

import { cwtMorlAsync } from './cwtMorl'

const workers: Worker[] = []
let nextId = 1
let nextWorker = 0
const pending = new Map<number, { resolve: (v: Float32Array) => void; reject: (e: Error) => void; onProgress?: (done: number, total: number) => void }>()

function createWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null
  try {
    const current = new Worker(new URL('../workers/cwt.worker.ts', import.meta.url), { type: 'module' })
    current.onmessage = (e) => {
      const { id, result, error, progress } = e.data
      const p = pending.get(id)
      if (!p) return
      if (progress) {
        p.onProgress?.(progress.done, progress.total)
        return
      }
      pending.delete(id)
      if (error) {
        p.reject(new Error(error))
      } else {
        p.resolve(result)
      }
    }
    current.onerror = (e) => {
      // Reject all pending on worker crash
      for (const [id, p] of pending) {
        p.reject(new Error('CWT worker crashed: ' + e.message))
        pending.delete(id)
      }
      const index = workers.indexOf(current)
      if (index >= 0) workers.splice(index, 1)
    }
    workers.push(current)
    return current
  } catch {
    return null
  }
}

function getWorker(): Worker | null {
  // Three workers allow the three independent ECG leads to be transformed concurrently.
  return workers[nextWorker++ % 3] ?? createWorker()
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
    const timer = setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        reject(new Error('Batas waktu komputasi CWT terlampaui (timeout).'))
      }
    }, 45000)

    pending.set(id, {
      resolve: (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      reject: (e) => {
        clearTimeout(timer)
        reject(e)
      },
      onProgress,
    })
    w.postMessage({ id, signal, nScales }, [signal.buffer])
  })
}

/** Terminate the worker (call on app unmount or when no longer needed). */
export function terminateCwtWorker(): void {
  for (const current of workers) current.terminate()
  workers.length = 0
  for (const [, p] of pending) p.reject(new Error('CWT worker terminated'))
  pending.clear()
}
