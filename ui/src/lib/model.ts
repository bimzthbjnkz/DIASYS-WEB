import * as tf from '@tensorflow/tfjs'

/* ------------------------------------------------------------------ */
/*  Model Registry — supports echonext and hfdetect models             */
/* ------------------------------------------------------------------ */

export type ModelName = 'echonext' | 'hfdetect'

interface ModelEntry {
  url: string
  instance: tf.LayersModel | null
  promise: Promise<tf.LayersModel> | null
}

const MODELS: Record<ModelName, ModelEntry> = {
  echonext: { url: '/models/echonext/model.json', instance: null, promise: null },
  hfdetect: { url: '/models/hfdetect/model.json', instance: null, promise: null },
}

async function ensureBackend(): Promise<void> {
  try {
    if (tf.getBackend() !== 'webgl') await tf.setBackend('webgl')
  } catch {
    // fall back to default (cpu / wasm)
  }
}

type ModelLoader = (name: ModelName) => Promise<tf.LayersModel>

let loader: ModelLoader = async (name) => {
  await ensureBackend()
  return tf.loadLayersModel(MODELS[name].url)
}

/** Test seam: replace the model loader (e.g. fromMemory in Node). */
export function _setModelLoaderForTest(fn: ModelLoader): void {
  for (const key of Object.keys(MODELS) as ModelName[]) {
    MODELS[key].instance = null
    MODELS[key].promise = null
  }
  loader = fn
}

/** Load a model by name with lazy loading and caching. */
export function loadModel(name: ModelName): Promise<tf.LayersModel> {
  const entry = MODELS[name]
  if (entry.instance) return Promise.resolve(entry.instance)
  if (!entry.promise) {
    entry.promise = loader(name).then((m) => {
      entry.instance = m
      return m
    })
  }
  return entry.promise
}

/* ------------------------------------------------------------------ */
/*  EchoNext — Grad-CAM bundle                                         */
/* ------------------------------------------------------------------ */

const CAM_LAYER = 'conv2d_2'

export interface CamBundle {
  model: tf.LayersModel
  cam: tf.LayersModel
  w1: tf.Tensor
  b1: tf.Tensor
  w2: tf.Tensor
  b2: tf.Tensor
}

let camPromise: Promise<CamBundle> | null = null

async function loadCam(): Promise<CamBundle> {
  if (!camPromise) {
    camPromise = (async () => {
      const model = await loadModel('echonext')
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

/* ------------------------------------------------------------------ */
/*  Predict — EchoNext (HFpEF vs HFrEF)                               */
/* ------------------------------------------------------------------ */

export interface EchoNextResult {
  pHFpEF: number
  pHFrEF: number
}

/**
 * Run the EchoNext CNN on a model input tensor (1, 32, 2500, 3).
 * Sigmoid output = P(HFpEF).
 */
export async function predictEchoNext(tensor: Float32Array): Promise<EchoNextResult> {
  const model = await loadModel('echonext')
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

/* ------------------------------------------------------------------ */
/*  Predict — HF Detection (HF vs Non-HF)                             */
/* ------------------------------------------------------------------ */

export interface HFDetectResult {
  /** True if Heart Failure is detected. */
  isHF: boolean
  /** P(HF) — probability of Heart Failure. */
  pHF: number
  /** P(Non-HF) — probability of Non-Heart Failure. */
  pNonHF: number
}

/**
 * Run the HF Detection CNN on a model input tensor (1, 32, 1000, 1).
 * Sigmoid output = P(HF).
 */
export async function predictHFDetect(tensor: Float32Array): Promise<HFDetectResult> {
  const model = await loadModel('hfdetect')
  const t = tf.tensor4d(tensor, [1, 32, 1000, 1])
  try {
    const out = model.predict(t) as tf.Tensor
    const pHF = (await out.data())[0]
    out.dispose()
    return { isHF: pHF >= 0.5, pHF, pNonHF: 1 - pHF }
  } finally {
    t.dispose()
  }
}

/* ------------------------------------------------------------------ */
/*  Grad-CAM for EchoNext                                              */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Generic predict helper (dispatches by model name)                  */
/* ------------------------------------------------------------------ */

export async function predictModel(
  name: 'echonext',
  tensor: Float32Array,
): Promise<EchoNextResult>
export async function predictModel(
  name: 'hfdetect',
  tensor: Float32Array,
): Promise<HFDetectResult>
export async function predictModel(
  name: ModelName,
  tensor: Float32Array,
): Promise<EchoNextResult | HFDetectResult> {
  if (name === 'echonext') return predictEchoNext(tensor)
  return predictHFDetect(tensor)
}

export function isModelAvailable(): boolean {
  return typeof tf !== 'undefined'
}
