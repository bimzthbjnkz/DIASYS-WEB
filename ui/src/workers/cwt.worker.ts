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

self.onmessage = (e: MessageEvent<CWTRequest>) => {
  const { id, signal, nScales } = e.data
  try {
    // This worker is already off the UI thread; yielding with setTimeout only
    // adds latency to every few scales without improving responsiveness.
    const result = cwtMorl(signal, nScales)
    self.postMessage({ id, progress: { done: nScales, total: nScales } })
    self.postMessage({ id, result }, { transfer: [result.buffer as ArrayBuffer] })
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) })
  }
}
