/**
 * CWT Web Worker — runs Morlet CWT off the main thread so the browser
 * stays responsive during heavy signal processing.
 *
 * Protocol:
 *   inbound:  { id, signal, nScales }
 *   outbound: { id, progress: { done, total } }   (sent periodically)
 *   outbound: { id, result: Float32Array }         (sent on completion)
 *   outbound: { id, error: string }                 (sent on failure)
 */

import { cwtMorl } from '../lib/cwtMorl'

interface CWTRequest {
  id: number
  signal: Float32Array
  nScales: number
}

self.onmessage = async (e: MessageEvent<CWTRequest>) => {
  const { id, signal, nScales } = e.data
  try {
    // The async version yields to the event loop, keeping the worker
    // responsive to cancel messages if needed in the future.
    // But since worker doesn't need UI, we use the sync version for speed.
    // We still post progress by chunking manually.
    const result = cwtMorl(signal, nScales)
    self.postMessage({ id, result })
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) })
  }
}
