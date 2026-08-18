/**
 * Inference Web Worker — runs TF.js model prediction off the main thread
 * so the browser stays responsive during heavy neural network computation.
 *
 * Protocol:
 *   inbound:  { id, modelName, tensorData, shape }
 *   outbound: { id, result: Float32Array }  (sent on completion)
 *   outbound: { id, error: string }         (sent on failure)
 */

import * as tf from '@tensorflow/tfjs'
import '../lib/customLayers.ts'

const MODEL_URLS: Record<string, string> = {
  echonext: '/models/echonext/model.json',
  hfdetect: '/models/hfdetect/model.json',
}

const modelCache: Record<string, tf.LayersModel> = {}
const modelPromises: Partial<Record<string, Promise<tf.LayersModel>>> = {}
let backendPromise: Promise<void> | null = null

async function ensureBackend(): Promise<void> {
  if (!backendPromise) {
    backendPromise = (async () => {
      try {
        if (tf.getBackend() !== 'webgl') await tf.setBackend('webgl')
      } catch {
        // fall back to default (cpu / wasm)
      }
    })()
  }
  return backendPromise
}

async function getModel(name: string): Promise<tf.LayersModel> {
  if (modelCache[name]) return modelCache[name]
  if (modelPromises[name]) return modelPromises[name]
  const url = MODEL_URLS[name]
  if (!url) throw new Error(`Unknown model: ${name}`)
  modelPromises[name] = (async () => {
    await ensureBackend()
    const model = await tf.loadLayersModel(url)
    modelCache[name] = model

    // Compile WebGL kernels before the first real request.
    try {
      const dummyShape: [number, number, number, number] = name === 'echonext'
        ? [1, 160, 160, 3]
        : [1, 224, 224, 3]
      const dummy = tf.zeros(dummyShape)
      const out = model.predict(dummy) as tf.Tensor
      out.dispose()
      dummy.dispose()
    } catch {
      // warm-up failure is non-fatal
    }
    return model
  })()
  return modelPromises[name]
}

interface InferenceRequest {
  id: number
  modelName: string
  tensorData: Float32Array
  shape: [number, number, number, number]
}

self.onmessage = async (e: MessageEvent<InferenceRequest>) => {
  const { id, modelName, tensorData, shape } = e.data
  try {
    const model = await getModel(modelName)
    const tensor = tf.tensor4d(tensorData, shape)
    const out = model.predict(tensor) as tf.Tensor
    const result = await out.data()
    tensor.dispose()
    out.dispose()
    self.postMessage({ id, result })
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) })
  }
}
