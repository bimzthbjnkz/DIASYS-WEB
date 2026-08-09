import * as tf from '@tensorflow/tfjs'
import { readFileSync } from 'node:fs'
import { synthECG } from '../src/lib/ecg.ts'
import { buildModelInput } from '../src/lib/modelInput.ts'
import { computeGradCam, predictModel, _setModelLoaderForTest } from '../src/lib/model.ts'

const DIR = 'C:/Bims/DIASYS WEB/ui/public/models/echonext'

async function makeLoader() {
  const modelJson = JSON.parse(readFileSync(DIR + '/model.json', 'utf-8'))
  const shard = readFileSync(DIR + '/group1-shard1of1.bin')
  const buf = shard.buffer.slice(shard.byteOffset, shard.byteOffset + shard.byteLength)
  const weightSpecs = modelJson.weightsManifest.flatMap((g) => g.weights)
  const model = await tf.loadLayersModel(tf.io.fromMemory(modelJson.modelTopology, weightSpecs, [buf]))
  return model
}

async function run(kind) {
  const sig = synthECG(kind, 10, 250)
  const ds = {
    name: kind === 'hfref' ? 'Test HFrEF' : 'Test HFpEF',
    cols: [sig],
    names: ['Lead II'],
    kind,
    note: 'test',
  }
  const t0 = performance.now()
  const mi = buildModelInput(ds, 250, 0)
  const buildMs = performance.now() - t0
  const res = await predictModel(mi.tensor)
  const cam = await computeGradCam(mi.tensor)
  let mn = Infinity, mx = -Infinity
  for (let i = 0; i < cam.length; i++) { if (cam[i] < mn) mn = cam[i]; if (cam[i] > mx) mx = cam[i] }
  const klas = res.pHFpEF >= 0.5 ? 'HFpEF' : 'HFrEF'
  console.log(`${kind}: pHFpEF=${res.pHFpEF.toFixed(4)} pHFrEF=${res.pHFrEF.toFixed(4)} -> ${klas}  (build ${buildMs.toFixed(0)}ms, cam len ${cam.length}, cam range ${mn.toFixed(3)}..${mx.toFixed(3)})`)
}

async function main() {
  _setModelLoaderForTest(makeLoader)
  await run('hfref')
  await run('hfpEF')
  console.log('PIPELINE OK')
}

main().catch((e) => { console.error('FAIL', e); process.exit(1) })
