import { useEffect, useRef } from 'react'
import { drawEmpty, renderScalogram } from '../lib/draw'
import type { ScalResult } from '../lib/ecg'

interface ScalogramCanvasProps {
  scal: ScalResult | null
  colormap: string
  gradcam: boolean
  peaksTime: number[]
  klas: string | null
  pre: Float32Array | null
  cam: Float32Array | null
  emptyMsg: string
  canvasRef?: React.RefObject<HTMLCanvasElement | null>
}

export default function ScalogramCanvas({ scal, colormap, gradcam, peaksTime, klas, pre, cam, emptyMsg, canvasRef }: ScalogramCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cnv = ref.current
    if (!cnv) return
    if (!scal) {
      drawEmpty(cnv, emptyMsg)
      return
    }
    const ctx = cnv.getContext('2d')!
    renderScalogram(ctx, cnv.width, cnv.height, {
      scal,
      colormap,
      gradcam,
      peaksTime,
      klas: klas || '',
      pre,
      cam,
    })
  }, [scal, colormap, gradcam, peaksTime, klas, pre, cam, emptyMsg])

  const setBoth = (el: HTMLCanvasElement | null) => {
    ref.current = el
    if (canvasRef) canvasRef.current = el
  }

  return <canvas ref={setBoth} width={1200} height={440} className="sig" />
}
