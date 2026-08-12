import { fmtDate, fmtPct, fmtTime } from './format'
import { synthECG } from './ecg'
import type { HFDetectResult } from './model'

export interface InferResult {
  klas: string
  conf: number
  probs: number[]
}

export interface ReportEntry {
  id: string
  ts: number
  src: string
  klas: string
  conf: number
  probs: number[]
  stats: {
    hr: number
    amp: number
    qrsW: number
    sdnn: number
  }
  thumb: string | null
  /** Stage 1 — HF Detection result. */
  hfDetectResult: HFDetectResult
  /** Stage 2 — EchoNext classification (null if Non-HF). */
  stage2Klas: string | null
  stage2Conf: number | null
}

export function downloadReport(e: ReportEntry): void {
  if (!e) return
  const hf = e.hfDetectResult
  const isHF = hf.isHF
  const lines = [
    '════════════════════════════════════════════',
    '  LAPORAN ANALISIS EKG — DIASYS AI',
    '════════════════════════════════════════════',
    '',
    `ID Analisis   : ${e.id}`,
    `Waktu         : ${fmtDate(e.ts)} ${fmtTime(e.ts)}`,
    `Sumber Data   : ${e.src}`,
    '',
    '════════════════════════════════════════════',
    '  STAGE 1 — HF DETECTION',
    '════════════════════════════════════════════',
    '',
    `  Hasil       : ${isHF ? 'Heart Failure' : 'Non-Heart Failure'}`,
    `  P(HF)       : ${fmtPct(hf.pHF)}`,
    `  P(Non-HF)   : ${fmtPct(hf.pNonHF)}`,
    `  Model       : HF Detection CNN — 3 blok Conv2D+BN+MaxPool, GAP, sigmoid`,
  ]

  if (isHF && e.stage2Klas) {
    lines.push(
      '',
      '════════════════════════════════════════════',
      '  STAGE 2 — KLASIFIKASI TIPE HF',
      '════════════════════════════════════════════',
      '',
      `  Kelas       : ${e.stage2Klas} (${e.stage2Klas === 'HFrEF' ? 'Heart Failure with reduced EF' : 'Heart Failure with preserved EF'})`,
      `  Konfidensi  : ${fmtPct(e.stage2Conf ?? 0)}`,
      `  P(HFpEF)    : ${fmtPct(e.probs[0])}`,
      `  P(HFrEF)    : ${fmtPct(e.probs[1])}`,
      `  Model       : EchoNext CNN — 3 blok Conv2D+BN+MaxPool, GAP, sigmoid`,
    )
  }

  lines.push(
    '',
    '════════════════════════════════════════════',
    '  PENGUKURAN SINYAL',
    '════════════════════════════════════════════',
    '',
    `  Estimasi HR     : ${e.stats.hr} bpm`,
    `  Amplitudo QRS   : ${e.stats.amp.toFixed(2)} mV`,
    `  Durasi QRS      : ${Math.round(e.stats.qrsW)} ms`,
    `  SDNN            : ${Math.round(e.stats.sdnn)} ms`,
    '',
    '════════════════════════════════════════════',
    '  PIPELINE',
    '════════════════════════════════════════════',
    '',
    '  Stage 1 : bandpass 0.5-40 Hz, z-score, CWT Morlet (cmor1.5-1.0), min-max',
    '  Stage 2 : median filter, clip, z-score, CWT mexh, 3 lead (I, II, V5)',
    '',
    'CATATAN: Hasil bersifat pendukung keputusan klinis dan harus',
    'dikonfirmasi oleh dokter spesialis jantung beserta ekokardiografi.',
  )

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `laporan_EKG_${e.id}.txt`
  a.click()
  URL.revokeObjectURL(a.href)
}

export async function downloadSampleCsv(kind: string, toastFn: (msg: string, type: string) => void): Promise<void> {
  const x = synthECG(kind)
  let csv = 'time_s,voltage_mV\n'
  for (let i = 0; i < x.length; i++) csv += (i / 250).toFixed(4) + ',' + x[i].toFixed(4) + '\n'
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'contoh_ekg_' + kind + '.csv'
  a.click()
  URL.revokeObjectURL(a.href)
  toastFn('Contoh CSV diunduh — unggah kembali untuk mencoba.', 'success')
}
