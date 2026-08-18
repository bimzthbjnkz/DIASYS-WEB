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

async function ensureBackend(): Promise<void> {
  try {
    if (tf.getBackend() !== 'webgl') await tf.setBackend('webgl')
  } catch {
    // fall back to default (cpu / wasm)
  }
}

async function getModel(name: string): Promise<tf.LayersModel> {
  if (modelCache[name]) return modelCache[name]
  const url = MODEL_URLS[name]
  if (!url) throw new Error(`Unknown model: ${name}`)
  await ensureBackend()
  const model = await tf.loadLayersModel(url)
  modelCache[name] = model
  return model
}

interface InferenceRequest {
  id: number
  modelName: string
  tensorData: Float32Array
  shape: number[]
}

self.onmessage = async (e: MessageEvent<InferenceRequest>) => {
  const { id, modelName, tensorData, shape } = e.data
  try {
    const model = await getModel(modelName)
    const tensor = tf.tensor4d(tensorData, shape)
    const out = model.predict(tensor) as tf.Tensor
    const result = out.dataSync() as Float32Array
    tensor.dispose()
    out.dispose()
    self.postMessage({ id, result })
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) })
  }
}
