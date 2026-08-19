import * as tf from '@tensorflow/tfjs'

interface NormalizationConfig {
  mean?: number[] | number
  variance?: number[] | number
  epsilon?: number
}

class NormalizationLayer extends tf.layers.Layer {
  static className = 'Normalization'
  private readonly mean: number[]
  private readonly variance: number[]
  private readonly epsilon: number

  constructor(config: NormalizationConfig = {}) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    super(config as any)
    this.mean = Array.isArray(config.mean) ? config.mean : [config.mean ?? 0]
    this.variance = Array.isArray(config.variance) ? config.variance : [config.variance ?? 1]
    this.epsilon = config.epsilon ?? 1e-7
  }

  call(inputs: tf.Tensor | tf.Tensor[]): tf.Tensor {
    const input = (Array.isArray(inputs) ? inputs[0] : inputs) as tf.Tensor
    const shape = input.shape
    const channels = this.mean.length
    const broadcastShape = new Array(shape.length).fill(1)
    broadcastShape[shape.length - 1] = channels
    const mean = tf.tensor(this.mean, [channels]).reshape(broadcastShape)
    const variance = tf.tensor(this.variance, [channels]).reshape(broadcastShape)
    return tf.div(tf.sub(input, mean), tf.sqrt(tf.add(variance, this.epsilon)))
  }
}

class RescalingLayer extends tf.layers.Layer {
  static className = 'Rescaling'
  private readonly scale: number
  private readonly offset: number

  constructor(config: { scale?: number; offset?: number } = {}) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    super(config as any)
    this.scale = config.scale ?? 1
    this.offset = config.offset ?? 0
  }

  call(inputs: tf.Tensor | tf.Tensor[]): tf.Tensor {
    const input = (Array.isArray(inputs) ? inputs[0] : inputs) as tf.Tensor
    return tf.add(tf.mul(input, this.scale), this.offset)
  }
}

// Keras 3 can leave a Lambda node in the exported topology. The current model
// uses the documented affine transform, and the node is not on model2 output.
class LambdaLayer extends tf.layers.Layer {
  static className = 'Lambda'

  call(inputs: tf.Tensor | tf.Tensor[]): tf.Tensor {
    const input = Array.isArray(inputs) ? inputs[0] : inputs
    return tf.sub(tf.mul(input as tf.Tensor, 2), 1)
  }
}

tf.serialization.registerClass(NormalizationLayer)
tf.serialization.registerClass(RescalingLayer)
tf.serialization.registerClass(LambdaLayer)

type ModelName = 'model1' | 'model2'
const cache = new Map<ModelName, Promise<tf.LayersModel>>()

async function ensureBackend(): Promise<void> {
  if (tf.getBackend() === 'webgl' || tf.getBackend() === 'cpu') return
  try {
    await tf.setBackend('webgl')
    await tf.ready()
  } catch {
    await tf.setBackend('cpu')
    await tf.ready()
  }
}

function loadModel(name: ModelName): Promise<tf.LayersModel> {
  const existing = cache.get(name)
  if (existing) return existing
  const promise = (async () => {
    await ensureBackend()
    const baseUrl = `/models/${name}/`
    const response = await fetch(`${baseUrl}model.json`)
    if (!response.ok) throw new Error(`Model ${name} tidak dapat dimuat (${response.status}).`)
    const json = await response.json() as {
      modelTopology: unknown
      trainingConfig?: unknown
      weightsManifest: Array<{ paths: string[]; weights: Array<{ name: string; shape: number[]; dtype: string }> }>
    }

    // Keras 3 exports DepthwiseConv2D weights as `kernel`, while TF.js
    // creates the target variable as `depthwise_kernel`.
    const weightSpecs = json.weightsManifest.flatMap((group) => group.weights.map((weight) => ({
      ...weight,
      name: /(?:dwconv|depthwise)[^/]*\/kernel$/.test(weight.name)
        ? weight.name.replace(/\/kernel$/, '/depthwise_kernel')
        : weight.name,
    }))) as tf.io.WeightsManifestEntry[]
    const paths = json.weightsManifest.flatMap((group) => group.paths)
    const buffers = await Promise.all(paths.map(async (path) => {
      const shard = await fetch(baseUrl + path)
      if (!shard.ok) throw new Error(`Shard bobot ${path} tidak dapat dimuat (${shard.status}).`)
      return new Uint8Array(await shard.arrayBuffer())
    }))
    const totalBytes = buffers.reduce((total, buffer) => total + buffer.byteLength, 0)
    const weightData = new Uint8Array(totalBytes)
    let offset = 0
    for (const buffer of buffers) {
      weightData.set(buffer, offset)
      offset += buffer.byteLength
    }

    return tf.loadLayersModel({
      load: async () => ({
        modelTopology: json.modelTopology as ArrayBuffer | {},
        weightSpecs,
        weightData: weightData.buffer,
        trainingConfig: json.trainingConfig as tf.io.TrainingConfig,
      }),
    })
  })()
  cache.set(name, promise)
  return promise
}

export async function predict(name: ModelName, values: Float32Array, size: number): Promise<number> {
  const model = await loadModel(name)
  return tf.tidy(() => {
    const input = tf.tensor4d(values, [1, size, size, 3])
    const output = model.predict(input) as tf.Tensor
    return output.dataSync()[0] ?? 0
  })
}

export async function preloadModels(): Promise<void> {
  await Promise.all([loadModel('model1'), loadModel('model2')])
}
