import * as tf from '@tensorflow/tfjs'
import { readFileSync } from 'node:fs'

const DIR = 'C:/Bims/DIASYS WEB/ui/public/models/echonext'

async function main() {
  const modelJson = JSON.parse(readFileSync(DIR + '/model.json', 'utf-8'))
  const shard = readFileSync(DIR + '/group1-shard1of1.bin')
  const buf = shard.buffer.slice(shard.byteOffset, shard.byteOffset + shard.byteLength)
  const weightSpecs = modelJson.weightsManifest.flatMap((g) => g.weights)
  const model = await tf.loadLayersModel(tf.io.fromMemory(modelJson.modelTopology, weightSpecs, [buf]))
  console.log('model loaded')

  const inp = tf.randomNormal([1, 32, 2500, 3])
  const y = model.predict(inp)
  console.log('predict shape', y.shape, 'value', Array.from(await y.data()))
  y.dispose()

  const camModel = tf.model({ inputs: model.inputs, outputs: model.getLayer('conv2d_2').output })
  console.log('camModel built, out', camModel.outputs[0].shape)

  const w1 = model.getLayer('dense').getWeights()[0]
  const b1 = model.getLayer('dense').getWeights()[1]
  const w2 = model.getLayer('dense_1').getWeights()[0]
  const b2 = model.getLayer('dense_1').getWeights()[1]

  const gradFn = tf.grad((A) => {
    const pooled = A.mean([1, 2])
    const h = pooled.matMul(w1).add(b1).relu()
    const logit = h.matMul(w2).add(b2)
    return logit.squeeze()
  })

  const A = camModel.predict(inp)
  console.log('A shape', A.shape)
  const gA = gradFn(A)
  console.log('gA shape', gA.shape, 'max', (await gA.max().data())[0])
  const wc = gA.mean([1, 2])
  const cam = tf.relu(A.mul(wc).sum(3)).squeeze()
  console.log('CAM pre-resize shape', cam.shape)
  const camUp = tf.image.resizeBilinear(cam.expandDims(-1), [32, 2500]).squeeze()
  const camMin = (await camUp.min().data())[0]
  const camMax = (await camUp.max().data())[0]
  console.log('CAM upscaled 32x2500 min/max', camMin, camMax)

  cam.dispose(); camUp.dispose(); gA.dispose(); wc.dispose(); A.dispose(); inp.dispose()
  model.dispose(); camModel.dispose()
  console.log('GRADCAM OK')
}

main().catch((e) => { console.error('FAIL', e); process.exit(1) })
