import { useEffect, useRef } from 'react'
import { drawECG, drawEmpty } from '../lib/draw.js'

export default function SignalCanvas({ data, fs, color, peaks = [], emptyMsg, className = 'sig' }) {
  const ref = useRef(null)

  useEffect(() => {
    const cnv = ref.current
    if (!cnv) return
    if (!data) {
      drawEmpty(cnv, emptyMsg)
      return
    }
    drawECG(cnv, data, fs, color, peaks)
  }, [data, fs, color, peaks, emptyMsg])

  return <canvas ref={ref} width={1200} height={210} className={className} />
}
