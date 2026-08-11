import { fmtDate, fmtPct, fmtTime } from './format'
import { synthECG } from './ecg'

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
}

export function downloadReport(e: ReportEntry): void {
  if (!e) return
  const lines = [
    '════════════════════════════════════════════',
    '  LAPORAN ANALISIS EKG — DIASYS AI',
    '════════════════════════════════════════════',
    '',
    `ID Analisis   : ${e.id}`,
    `Waktu         : ${fmtDate(e.ts)} ${fmtTime(e.ts)}`,
    `Sumber Data   : ${e.src}`,
    '',
    'HASIL KLASIFIKASI',
    `  Kelas       : ${e.klas} (${e.klas === 'HFrEF' ? 'Heart Failure with reduced EF' : 'Heart Failure with preserved EF'})`,
    `  Konfidensi  : ${fmtPct(e.conf)}`,
    `  P(HFpEF)    : ${fmtPct(e.probs[0])}`,
    `  P(HFrEF)    : ${fmtPct(e.probs[1])}`,
    '',
    'PENGUKURAN SINYAL',
    `  Estimasi HR     : ${e.stats.hr} bpm`,
    `  Amplitudo QRS   : ${e.stats.amp.toFixed(2)} mV`,
    `  Durasi QRS      : ${Math.round(e.stats.qrsW)} ms`,
    `  SDNN            : ${Math.round(e.stats.sdnn)} ms`,
    '',
    'METODE',
    '  Preprocessing : resampling 250 Hz, jendela 10 s, unit µV',
    '  Ekstraksi     : CWT wavelet mexican-hat, 32 skala (1–32), 3 lead (I, II, V5)',
    '  Model         : EchoNext CNN — 3 blok Conv2D+BN+MaxPool, GAP, Dense 64, sigmoid',
    '',
    'CATATAN: Hasil bersifat pendukung keputusan dan harus',
    'dikonfirmasi oleh dokter spesialis jantung.',
  ].join('\n')
  const blob = new Blob([lines], { type: 'text/plain;charset=utf-8' })
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
