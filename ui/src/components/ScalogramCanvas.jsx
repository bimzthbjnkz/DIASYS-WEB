import { useEffect, useRef } from 'react'
import { drawEmpty, renderScalogram } from '../lib/draw.js'

export default function ScalogramCanvas({ scal, colormap, gradcam, peaksTime, klas, pre, emptyMsg, canvasRef }) {
  const ref = useRef(null)

  useEffect(() => {
    const cnv = ref.current
    if (!cnv) return
    if (!scal) {
      drawEmpty(cnv, emptyMsg)
      return
    }
    const ctx = cnv.getContext('2d')
    renderScalogram(ctx, cnv, cnv.width, cnv.height, {
      scal,
      colormap,
      gradcam,
      peaksTime,
      klas,
      pre,
    })
  }, [scal, colormap, gradcam, peaksTime, klas, pre, emptyMsg])

  const setBoth = (el) => {
    ref.current = el
    if (canvasRef) canvasRef.current = el
  }

  return <canvas ref={setBoth} width={1200} height={440} className="sig" />
}
