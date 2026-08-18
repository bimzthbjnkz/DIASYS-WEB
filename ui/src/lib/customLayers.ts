/**
 * Custom TF.js layer registrations for Keras 3 layers not built into
 * @tensorflow/tfjs-layers v4.x.
 *
 * Import this module BEFORE calling tf.loadLayersModel() so the
 * deserializer can resolve the class names.
 */

import * as tf from '@tensorflow/tfjs'

class Normalization extends tf.layers.Layer {
  static override className = 'Normalization'

  private meanData: number[]
  private varianceData: number[]
  private axis_: number[]
  private invert_: boolean
  private epsilon = 1e-5

  constructor(config: {
    mean?: number[]
    variance?: number[]
    axis?: number[]
    invert?: boolean
    name?: string
    trainable?: boolean
    dtype?: string
  }) {
    super(config)
    this.meanData = config.mean ?? []
    this.varianceData = config.variance ?? []
    this.axis_ = config.axis ?? [-1]
    this.invert_ = config.invert ?? false
  }

  override computeOutputShape(inputShape: tf.Shape | tf.Shape[]): tf.Shape | tf.Shape[] {
    return inputShape
  }

  override call(
    inputs: tf.Tensor | tf.Tensor[],
    _kwargs: Record<string, unknown>,
  ): tf.Tensor | tf.Tensor[] {
    const x = Array.isArray(inputs) ? inputs[0] : inputs
    const mean = tf.tensor1d(this.meanData, 'float32')
    const variance = tf.tensor1d(this.varianceData, 'float32')
    const stddev = tf.sqrt(tf.add(variance, this.epsilon))

    let out = tf.div(tf.sub(x, mean), stddev)

    if (this.invert_) {
      out = tf.neg(out) as tf.Tensor
    }

    mean.dispose()
    variance.dispose()
    stddev.dispose()

    return out
  }

  override getConfig(): tf.serialization.ConfigDict {
    const cfg = super.getConfig()
    cfg['mean'] = this.meanData
    cfg['variance'] = this.varianceData
    cfg['axis'] = this.axis_
    cfg['invert'] = this.invert_
    return cfg
  }
}

tf.serialization.registerClass(Normalization)
