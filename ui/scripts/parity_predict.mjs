import * as tf from '@tensorflow/tfjs'
import { readFileSync } from 'node:fs'

const DIR = 'C:/Bims/DIASYS WEB/ui/public/models/echonext'
const BIN = 'C:/Users/HP DRAGONFLY/AppData/Local/Temp/opencode/parity_x.bin'

async function main() {
  const modelJson = JSON.parse(readFileSync(DIR + '/model.json', 'utf-8'))
  const shard = readFileSync(DIR + '/group1-shard1of1.bin')
  const buf = shard.buffer.slice(shard.byteOffset, shard.byteOffset + shard.byteLength)
  const weightSpecs = modelJson.weightsManifest.flatMap((g) => g.weights)
  const model = await tf.loadLayersModel(tf.io.fromMemory(modelJson.modelTopology, weightSpecs, [buf]))
  const data = readFileSync(BIN)
  const f32 = new Float32Array(data.byteLength / 4)
  f32.set(new Float32Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)))
  const t = tf.tensor4d(f32, [1, 32, 2500, 3])
  const y = model.predict(t)
  const val = (await y.data())[0]
  console.log('tfjs converted:', val, ' (keras original: 0.99394834)')
  t.dispose(); y.dispose(); model.dispose()
}

main().catch((e) => { console.error('FAIL', e); process.exit(1) })
