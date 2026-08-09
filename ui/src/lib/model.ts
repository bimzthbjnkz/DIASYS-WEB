import * as tf from '@tensorflow/tfjs'

const MODEL_URL = '/models/echonext/model.json'
const CAM_LAYER = 'conv2d_2'

let modelPromise: Promise<tf.LayersModel> | null = null
let camPromise: Promise<{ model: tf.LayersModel; cam: tf.LayersModel; w1: tf.Tensor; b1: tf.Tensor; w2: tf.Tensor; b2: tf.Tensor }> | null = null

type ModelLoader = () => Promise<tf.LayersModel>

async function ensureBackend(): Promise<void> {
  try {
    if (tf.getBackend() !== 'webgl') await tf.setBackend('webgl')
  } catch {
    // fall back to default (cpu / wasm)
  }
}

let loader: ModelLoader = async () => {
  await ensureBackend()
  return tf.loadLayersModel(MODEL_URL)
}

/** Test seam: replace the model loader (e.g. fromMemory in Node). */
export function _setModelLoaderForTest(fn: ModelLoader): void {
  modelPromise = null
  camPromise = null
  loader = fn
}

export function loadModel(): Promise<tf.LayersModel> {
  if (!modelPromise) modelPromise = loader()
  return modelPromise
}

export interface CamBundle {
  model: tf.LayersModel
  cam: tf.LayersModel
  w1: tf.Tensor
  b1: tf.Tensor
  w2: tf.Tensor
  b2: tf.Tensor
}

async function loadCam(): Promise<CamBundle> {
  if (!camPromise) {
    camPromise = (async () => {
      const model = await loadModel()
      const cam = tf.model({ inputs: model.inputs, outputs: model.getLayer(CAM_LAYER).output })
      const w1 = model.getLayer('dense').getWeights()[0]
      const b1 = model.getLayer('dense').getWeights()[1]
      const w2 = model.getLayer('dense_1').getWeights()[0]
      const b2 = model.getLayer('dense_1').getWeights()[1]
      return { model, cam, w1, b1, w2, b2 }
    })()
  }
  return camPromise
}

export interface PredictResult {
  pHFpEF: number
  pHFrEF: number
}

/**
 * Run the CNN on a model input tensor (32, 2500, 3).
 * Sigmoid output = P(HFpEF) (label 1 = HFpEF in the EchoNext training set).
 */
export async function predictModel(tensor: Float32Array): Promise<PredictResult> {
  const model = await loadModel()
  const t = tf.tensor4d(tensor, [1, 32, 2500, 3])
  try {
    const out = model.predict(t) as tf.Tensor
    const p = (await out.data())[0]
    out.dispose()
    return { pHFpEF: p, pHFrEF: 1 - p }
  } finally {
    t.dispose()
  }
}

/**
 * Grad-CAM over the last conv layer (conv2d_2), upscaled to (32, 2500)
 * and normalized to [0, 1]. Uses the manual tail (GAP -> Dense 64 -> Dense 1)
 * because tfjs cannot build a model from an intermediate tensor.
 */
export async function computeGradCam(tensor: Float32Array): Promise<Float32Array> {
  const { cam, w1, b1, w2, b2 } = await loadCam()
  const t = tf.tensor4d(tensor, [1, 32, 2500, 3])
  const gradFn = tf.grad((a: tf.Tensor) => {
    const pooled = a.mean([1, 2]) as tf.Tensor
    const h = pooled.matMul(w1).add(b1).relu() as tf.Tensor
    const logit = h.matMul(w2).add(b2) as tf.Tensor
    return logit.squeeze() as tf.Tensor
  })
  const A = cam.predict(t) as tf.Tensor
  const gA = gradFn(A)
  const wc = gA.mean([1, 2]) as tf.Tensor
  const heat = tf.relu(A.mul(wc).sum(3)) as tf.Tensor
  const up = tf.image.resizeBilinear(heat.squeeze().expandDims(-1), [32, 2500]) as tf.Tensor
  const data = await up.data()
  t.dispose(); A.dispose(); gA.dispose(); wc.dispose(); heat.dispose(); up.dispose()
  let mn = Infinity
  let mx = -Infinity
  for (let i = 0; i < data.length; i++) {
    const v = data[i]
    if (v < mn) mn = v
    if (v > mx) mx = v
  }
  const out = new Float32Array(data.length)
  const range = mx - mn || 1
  for (let i = 0; i < data.length; i++) out[i] = (data[i] - mn) / range
  return out
}

export function isModelAvailable(): boolean {
  return typeof tf !== 'undefined'
}
