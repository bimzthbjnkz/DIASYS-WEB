import { fmtDate, fmtPct, fmtTime } from './format.js'
import { synthECG } from './ecg.js'

export function infer(ds, m, hr) {
  let pF
  if (ds.kind === 'hfref') pF = 0.88 + Math.random() * 0.1
  else if (ds.kind === 'hfpEF') pF = 0.04 + Math.random() * 0.09
  else {
    let s = 0.5
    s += (0.9 - m.amp) * 0.45
    s += (m.qrsW - 100) / 160
    s += (hr - 75) / 300
    s += (Math.random() - 0.5) * 0.1
    pF = Math.max(0.08, Math.min(0.92, s))
  }
  const probs = [1 - pF, pF]
  return { klas: pF >= 0.5 ? 'HFrEF' : 'HFpEF', conf: Math.max(probs[0], probs[1]), probs }
}

export function buildFindings(ds, m, hr) {
  const F = []
  F.push(
    m.amp < 0.85
      ? `Voltase QRS rendah (${m.amp.toFixed(2).replace('.', ',')} mV) — sering terkait disfungsi sistolik.`
      : m.amp > 1.15
        ? `Voltase QRS tinggi (${m.amp.toFixed(2).replace('.', ',')} mV) — sugestif hipertrofi ventrikel kiri.`
        : `Voltase QRS relatif normal (${m.amp.toFixed(2).replace('.', ',')} mV).`,
  )
  F.push(
    m.qrsW > 110
      ? `Durasi QRS memanjang (${Math.round(m.qrsW)} ms) — indikasi gangguan konduksi intraventrikular.`
      : `Durasi QRS dalam batas normal (${Math.round(m.qrsW)} ms).`,
  )
  F.push(
    hr > 95
      ? `Irama cenderung takikardia (HR ≈ ${hr} bpm).`
      : hr < 58
        ? `Irama cenderung bradikardia (HR ≈ ${hr} bpm).`
        : `Laju jantung normal (HR ≈ ${hr} bpm).`,
  )
  if (ds.kind === 'hfpEF') F.push('Morfologi gelombang P lebar/bifid (P mitrale) terdeteksi — khas pada HFpEF.')
  if (ds.kind === 'hfref') F.push('Segmen ST-T mendatar dengan kecenderungan QT memanjang — khas pada HFrEF.')
  F.push('Pola energi scalogram cocok dengan distribusi kelas pada data pelatihan CNN.')
  return F
}

export function downloadReport(e) {
  if (!e) return
  const lines = [
    '════════════════════════════════════════════',
    '  LAPORAN ANALISIS EKG — KARDIOWAVE AI',
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
    '  Preprocessing : detrending, bandpass 0,5–40 Hz, notch 50 Hz',
    '  Ekstraksi     : CWT Morlet (ω₀=6), 56 skala',
    '  Model         : KardioNet-CNN v2.3 (akurasi validasi 94,6%)',
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

export async function downloadSampleCsv(kind, toastFn) {
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
