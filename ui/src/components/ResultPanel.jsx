import { useEffect, useRef, useState } from 'react'
import Card from './Card.jsx'
import { DownloadIcon, RefreshIcon } from './icons.jsx'
import { fmtPct, fmtTime } from '../lib/format.js'
import { downloadReport } from '../lib/report.js'

function useAnimatedNumber(target, duration = 1100) {
  const [val, setVal] = useState(0)
  const rafRef = useRef(null)

  useEffect(() => {
    const t0 = performance.now()
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / duration)
      const e = 1 - Math.pow(1 - p, 3)
      setVal(target * e)
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration])

  return val
}

function ConfidenceRing({ conf }) {
  const anim = useAnimatedNumber(conf)
  const offset = 283 * (1 - anim)
  return (
    <div className="relative ml-auto h-[94px] w-[94px] flex-shrink-0">
      <svg className="ring h-[94px] w-[94px]" viewBox="0 0 100 100">
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#4f46e5" />
            <stop offset="1" stopColor="#0d9488" />
          </linearGradient>
        </defs>
        <circle className="ring-bg" cx="50" cy="50" r="45" />
        <circle className="ring-val" style={{ strokeDashoffset: offset }} cx="50" cy="50" r="45" />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-[2px]">
        <div className="font-display text-[17px] font-bold leading-none">
          {(anim * 100).toFixed(1).replace('.', ',')}%
        </div>
        <div className="text-[8.5px] font-bold tracking-[.8px] text-dim uppercase">konfidensi</div>
      </div>
    </div>
  )
}

function ProbRow({ color, label, prob }) {
  return (
    <div className="mt-[11px]">
      <div className="mb-1.5 flex justify-between text-[12.5px] font-semibold">
        <span style={{ color }}>{label}</span>
        <b className="font-mono">{fmtPct(prob)}</b>
      </div>
      <div className="h-[9px] overflow-hidden rounded-[6px] bg-[#f0f3f9]">
        <div
          className="h-full rounded-[6px] transition-[width] duration-1000"
          style={{
            width: `${prob * 100}%`,
            background: `linear-gradient(90deg, ${color}, ${color === '#d97706' ? '#fbbf24' : '#fb7185'})`,
            transitionTimingFunction: 'cubic-bezier(.3,.8,.3,1)',
          }}
        />
      </div>
    </div>
  )
}

export default function ResultPanel({ a }) {
  const e = a.lastEntry
  const hasResult = !!e
  const findings = e ? buildFindings(e) : []

  if (!hasResult) {
    return (
      <Card title="Hasil Klasifikasi">
        <div className="px-[22px] py-[46px] text-center text-dim">
          <svg className="mx-auto mb-3 h-[46px] w-[46px] opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.8 8.6a5 5 0 0 0-8.8-3.1A5 5 0 0 0 3.2 8.6c0 5.2 8.8 10.4 8.8 10.4s8.8-5.2 8.8-10.4Z" />
            <path d="M3.5 12h3.2l1.6-3.4 2.6 6.2 1.9-4.2 1 1.4h3.7" />
          </svg>
          <p className="text-[13px] leading-[1.65]">
            Belum ada hasil.
            <br />
            Muat data lalu jalankan analisis untuk melihat prediksi HFpEF / HFrEF.
          </p>
        </div>
      </Card>
    )
  }

  return (
    <Card title="Hasil Klasifikasi" hint={<span className="mono">{e.id} · {fmtTime(e.ts)}</span>}>
      <div className="flex items-center gap-[18px]">
        <div>
          <div className="sec-title mb-2">Prediksi</div>
          <span
            className={`inline-block rounded-[13px] px-[18px] py-[9px] font-display text-2xl font-bold tracking-[-.4px] ${
              e.klas === 'HFrEF'
                ? 'border border-[#f6c6d1] bg-rose-soft text-rose'
                : 'border border-[#f3ddb2] bg-amber-soft text-amber'
            }`}
          >
            {e.klas}
          </span>
        </div>
        <ConfidenceRing conf={e.conf} />
      </div>
      <p className="mt-[13px] text-[12.5px] leading-[1.6] text-muted">
        {e.klas === 'HFrEF'
          ? 'Heart Failure with reduced Ejection Fraction — gagal jantung dengan fraksi ejeksi menurun (EF ≤ 40%).'
          : 'Heart Failure with preserved Ejection Fraction — gagal jantung dengan fraksi ejeksi terjaga (EF ≥ 50%).'}
      </p>

      <div className="divider" />
      <div className="sec-title">Probabilitas Kelas</div>
      <ProbRow color="#d97706" label="HFpEF · EF ≥ 50%" prob={e.probs[0]} />
      <ProbRow color="#e11d48" label="HFrEF · EF ≤ 40%" prob={e.probs[1]} />

      <div className="divider" />
      <div className="sec-title">Pengukuran Sinyal</div>
      <div className="grid grid-cols-2 gap-[10px]">
        {[
          ['Heart rate (bpm)', e.stats.hr || '—'],
          ['Durasi QRS (ms)', e.stats.qrsW ? Math.round(e.stats.qrsW) : '—'],
          ['Amplitudo QRS (mV)', e.stats.amp ? e.stats.amp.toFixed(2).replace('.', ',') : '—'],
          ['Variabilitas RR / SDNN (ms)', e.stats.sdnn ? Math.round(e.stats.sdnn) : '—'],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-line bg-[#f8f9fd] px-[13px] py-[11px]">
            <div className="font-display text-[17px] font-bold">{v}</div>
            <div className="mt-[2px] text-[10.5px] text-muted">{k}</div>
          </div>
        ))}
      </div>

      <div className="divider" />
      <div className="sec-title">Temuan Pendukung</div>
      <ul className="flex list-none flex-col gap-[9px]">
        {findings.map((f, i) => (
          <li key={i} className="flex gap-[9px] text-[12.5px] leading-[1.55] text-[#3f4c63]">
            <svg className="mt-[2px] h-[15px] w-[15px] flex-shrink-0 stroke-teal" viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 12.5 4.5 4.5L19 7" />
            </svg>
            {f}
          </li>
        ))}
      </ul>

      <div className="divider" />
      <div className="flex gap-[9px]">
        <button className="btn btn-primary btn-sm" onClick={() => downloadReport(e)}>
          <DownloadIcon className="h-4 w-4" />
          Unduh Laporan
        </button>
        <button className="btn btn-ghost btn-sm" onClick={a.runAnalysis} disabled={a.running}>
          <RefreshIcon className="h-4 w-4" />
          Ulangi
        </button>
      </div>
      <div className="mt-[14px] rounded-[10px] border-l-[3px] border-line2 bg-[#f8f9fd] px-3 py-[10px] text-[11px] leading-[1.6] text-dim">
        Hasil bersifat pendukung keputusan klinis dan harus dikonfirmasi oleh dokter spesialis jantung beserta ekokardiografi.
      </div>
    </Card>
  )
}

function buildFindings(e) {
  const F = []
  const m = e.stats
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
    m.hr > 95
      ? `Irama cenderung takikardia (HR ≈ ${m.hr} bpm).`
      : m.hr < 58
        ? `Irama cenderung bradikardia (HR ≈ ${m.hr} bpm).`
        : `Laju jantung normal (HR ≈ ${m.hr} bpm).`,
  )
  if (e.src.includes('HFpEF')) F.push('Morfologi gelombang P lebar/bifid (P mitrale) terdeteksi — khas pada HFpEF.')
  if (e.src.includes('HFrEF')) F.push('Segmen ST-T mendatar dengan kecenderungan QT memanjang — khas pada HFrEF.')
  F.push('Pola energi scalogram cocok dengan distribusi kelas pada data pelatihan CNN.')
  return F
}
