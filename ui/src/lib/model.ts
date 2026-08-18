import * as tf from '@tensorflow/tfjs'
import './customLayers.ts'

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
/*  EchoNext — Grad-CAM bundle (EfficientNetV2B0)                      */
/* ------------------------------------------------------------------ */

/** Last convolutional layer in EfficientNetV2B0 for Grad-CAM. */
const CAM_LAYER = 'top_conv'

export interface CamBundle {
  model: tf.LayersModel
  cam: tf.LayersModel
  denseWeights: tf.Tensor[]
}

let camPromise: Promise<CamBundle> | null = null

async function loadCam(): Promise<CamBundle> {
  if (!camPromise) {
    camPromise = (async () => {
      const model = await loadModel('echonext')
      const cam = tf.model({
        inputs: model.inputs,
        outputs: model.getLayer(CAM_LAYER).output,
      })

      const denseLayers: tf.Tensor[] = []
      for (const layer of model.layers) {
        if (layer.getClassName() === 'Dense') {
          denseLayers.push(...layer.getWeights())
        }
      }

      return { model, cam, denseWeights: denseLayers }
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
 * Run the EchoNext EfficientNetV2B0 on a model input tensor (1, 160, 160, 3).
 * Sigmoid output = P(HFpEF).
 */
export async function predictEchoNext(tensor: Float32Array): Promise<EchoNextResult> {
  const model = await loadModel('echonext')
  let p: number
  tf.tidy(() => {
    const t = tf.tensor4d(tensor, [1, 160, 160, 3])
    const out = model.predict(t) as tf.Tensor
    const data = out.dataSync()
    p = data[0] as number
  })
  return { pHFpEF: p!, pHFrEF: 1 - p! }
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
 * Run the HF Detection EfficientNetV2B0 on a model input tensor (1, 224, 224, 3).
 * Sigmoid output = P(HF).
 */
export async function predictHFDetect(tensor: Float32Array): Promise<HFDetectResult> {
  const model = await loadModel('hfdetect')
  let pHF: number
  tf.tidy(() => {
    const t = tf.tensor4d(tensor, [1, 224, 224, 3])
    const out = model.predict(t) as tf.Tensor
    const data = out.dataSync()
    pHF = data[0] as number
  })
  return { isHF: pHF! >= 0.5, pHF: pHF!, pNonHF: 1 - pHF! }
}

/* ------------------------------------------------------------------ */
/*  Grad-CAM for EchoNext (EfficientNetV2B0)                           */
/* ------------------------------------------------------------------ */

/**
 * Grad-CAM over the last conv layer (top_conv) of EfficientNetV2B0,
 * upscaled to (160, 160) and normalized to [0, 1].
 */
export async function computeGradCam(tensor: Float32Array): Promise<Float32Array> {
  const { cam, denseWeights } = await loadCam()

  let data: Float32Array
  tf.tidy(() => {
    const t = tf.tensor4d(tensor, [1, 160, 160, 3])

    const A = cam.predict(t) as tf.Tensor
    const aShape = A.shape
    const aH = aShape[1] ?? 1
    const aW = aShape[2] ?? 1

    const gradFn = tf.grad((x: tf.Tensor) => {
      const p = x.mean([1, 2]) as tf.Tensor
      let h = p
      for (let i = 0; i < denseWeights.length; i += 2) {
        const w = denseWeights[i]
        const b = denseWeights[i + 1]
        h = h.matMul(w).add(b) as tf.Tensor
        if (i + 2 < denseWeights.length) {
          h = h.relu() as tf.Tensor
        }
      }
      return h.squeeze() as tf.Tensor
    })

    const gA = gradFn(A)
    const wc = gA.mean([1, 2]) as tf.Tensor
    const heat = tf.relu(A.mul(wc).sum(3)) as tf.Tensor

    const up = tf.image
      .resizeBilinear(heat.squeeze().expandDims(-1), [aH, aW])
      .squeeze() as tf.Tensor

    const final = tf.image.resizeBilinear(up.expandDims(-1), [160, 160]) as tf.Tensor
    data = final.dataSync() as Float32Array
  })

  let mn = Infinity
  let mx = -Infinity
  for (let i = 0; i < data!.length; i++) {
    const v = data![i]
    if (v < mn) mn = v
    if (v > mx) mx = v
  }
  const out = new Float32Array(data!.length)
  const range = mx - mn || 1
  for (let i = 0; i < data!.length; i++) out[i] = (data![i] - mn) / range
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
