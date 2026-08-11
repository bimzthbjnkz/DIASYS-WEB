import { readFileSync } from 'node:fs'
import { cwtCmor } from '../src/lib/cwtCmor.ts'

const ref = JSON.parse(readFileSync(new URL('./cwt_cmor_reference.json', import.meta.url), 'utf-8'))
const sig = new Float32Array(ref.sig)
const mag = ref.mag

const t0 = performance.now()
const out = cwtCmor(sig)
const dt = performance.now() - t0

let worst = 0
let worstPos = ''
for (let si = 0; si < 32; si++) {
  for (let k = 0; k < 1000; k++) {
    const diff = Math.abs(out[si * 1000 + k] - mag[si][k])
    if (diff > worst) {
      worst = diff
      worstPos = `scale=${si + 1} t=${k}`
    }
  }
}
console.log('computed in', dt.toFixed(1), 'ms')
console.log('worst abs diff vs pywt:', worst.toExponential(3), 'at', worstPos)
if (worst > 1e-4) process.exit(1)
console.log('CWT CMOR PARITY OK')
