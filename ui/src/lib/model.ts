import * as tf from '@tensorflow/tfjs'

/* ------------------------------------------------------------------ */
/*  Model Registry — supports echonext and hfdetect models             */
/* ------------------------------------------------------------------ */

export type ModelName = 'echonext' | 'hfdetect'

/* ------------------------------------------------------------------ */
/*  Custom Normalization layer — Keras Normalization is not in tfjs     */
/* ------------------------------------------------------------------ */

class Normalization extends tf.layers.Layer {
  static readonly className = 'Normalization'
  private readonly meanData: number[]
  private readonly varianceData: number[]
  private readonly axis: number[]
  private readonly invert: boolean

  constructor(config: {
    mean?: number[]
    variance?: number[]
    axis?: number[]
    invert?: boolean
    name?: string
  }) {
    super({ name: config.name ?? 'normalization_1', trainable: false, ...config })
    this.meanData = config.mean ?? []
    this.varianceData = config.variance ?? []
    this.axis = config.axis ?? [3]
    this.invert = config.invert ?? false
  }

  override call(inputs: tf.Tensor[], kwargs: Record<string, unknown>): tf.Tensor | tf.Tensor[] {
    const input = Array.isArray(inputs) ? inputs[0] : inputs
    const inputShape = input.shape
    const rank = inputShape.length
    const axis = this.axis.map((a) => (a < 0 ? a + rank : a))

    let mean = tf.tensor1d(this.meanData)
    let variance = tf.tensor1d(this.varianceData)
    let std = tf.sqrt(variance)

    // Reshape mean and variance for broadcasting: [1, 1, 1, C] for 4D input
    if (rank === 4) {
      // For 4D tensor (batch, height, width, channels)
      // Reshape to [1, 1, 1, channels] for proper broadcasting
      const reshapeShape = [1, 1, 1, this.meanData.length]
      mean = mean.reshape(reshapeShape)
      variance = variance.reshape(reshapeShape)
      std = std.reshape(reshapeShape)
    } else if (rank === 3) {
      // For 3D tensor (height, width, channels)
      const reshapeShape = [1, 1, this.meanData.length]
      mean = mean.reshape(reshapeShape)
      variance = variance.reshape(reshapeShape)
      std = std.reshape(reshapeShape)
    }

    let result: tf.Tensor
    if (this.invert) {
      // Invert: output = input * std + mean
      result = input.mul(std).add(mean)
    } else {
      // Standard: output = (input - mean) / std
      result = input.sub(mean).div(std)
    }

    mean.dispose()
    variance.dispose()
    std.dispose()

    return result
  }

  override computeOutputShape(inputShape: tf.Shape): tf.Shape {
    return inputShape
  }

  override getConfig(): tf.serialization.ConfigDict {
    const config = super.getConfig()
    config.mean = this.meanData
    config.variance = this.varianceData
    config.axis = this.axis
    config.invert = this.invert
    return config
  }
}

tf.serialization.registerClass(Normalization)

/* ------------------------------------------------------------------ */
/*  Custom SiLU activation — identical to swish: x * sigmoid(x)        */
/*  Keras exports "silu" but TF.js only knows "swish"                  */
/* ------------------------------------------------------------------ */

class Silu extends tf.layers.Layer {
  static readonly className = 'silu'

  override call(inputs: tf.Tensor[]): tf.Tensor {
    const x = Array.isArray(inputs) ? inputs[0] : inputs
    return x.mul(tf.sigmoid(x))
  }

  override computeOutputShape(inputShape: tf.Shape): tf.Shape {
    return inputShape
  }
}

tf.serialization.registerClass(Silu)

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

      // Extract dense layer weights for the classifier head
      // EfficientNetV2B0 head: dense(N) → ... → dense(1)
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
  const t = tf.tensor4d(tensor, [1, 160, 160, 3])
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
 * Run the HF Detection EfficientNetV2B0 on a model input tensor (1, 224, 224, 3).
 * Sigmoid output = P(HF).
 */
export async function predictHFDetect(tensor: Float32Array): Promise<HFDetectResult> {
  const model = await loadModel('hfdetect')
  const t = tf.tensor4d(tensor, [1, 224, 224, 3])
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
/*  Grad-CAM for EchoNext (EfficientNetV2B0)                           */
/* ------------------------------------------------------------------ */

/**
 * Grad-CAM over the last conv layer (top_conv) of EfficientNetV2B0,
 * upscaled to (160, 160) and normalized to [0, 1].
 */
export async function computeGradCam(tensor: Float32Array): Promise<Float32Array> {
  const { cam, denseWeights } = await loadCam()
  const t = tf.tensor4d(tensor, [1, 160, 160, 3])

  // Get the last conv layer output
  const A = cam.predict(t) as tf.Tensor
  const aShape = A.shape
  const aH = aShape[1] ?? 1
  const aW = aShape[2] ?? 1

  // Global average pooling manually
  const pooled = A.mean([1, 2]) as tf.Tensor // (1, channels)

  // Compute gradient of the output w.r.t. pooled features
  const gradFn = tf.grad((x: tf.Tensor) => {
    const p = x.mean([1, 2]) as tf.Tensor
    let h = p
    // Apply dense layers sequentially
    for (let i = 0; i < denseWeights.length; i += 2) {
      const w = denseWeights[i]
      const b = denseWeights[i + 1]
      h = h.matMul(w).add(b) as tf.Tensor
      // Apply ReLU for all but last dense layer
      if (i + 2 < denseWeights.length) {
        h = h.relu() as tf.Tensor
      }
    }
    return h.squeeze() as tf.Tensor
  })

  const gA = gradFn(A)

  // Channel-wise weighted sum
  const wc = gA.mean([1, 2]) as tf.Tensor
  const heat = tf.relu(A.mul(wc).sum(3)) as tf.Tensor

  // Upscale to (160, 160)
  const up = tf.image
    .resizeBilinear(heat.squeeze().expandDims(-1), [aH, aW])
    .squeeze() as tf.Tensor

  // Resize to input resolution
  const final = tf.image.resizeBilinear(up.expandDims(-1), [160, 160]) as tf.Tensor
  const data = await final.data()

  t.dispose()
  A.dispose()
  pooled.dispose()
  gA.dispose()
  wc.dispose()
  heat.dispose()
  up.dispose()
  final.dispose()

  // Normalize to [0, 1]
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
