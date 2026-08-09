import { useEffect } from 'react'
import { CloseIcon, DownloadIcon } from './icons'
import { fmtDate, fmtPct, fmtTime } from '../lib/format'
import type { ReportEntry } from '../lib/report'

interface ModalProps {
  entry: ReportEntry | null
  onClose: () => void
  onDownload: (entry: ReportEntry) => void
}

export default function Modal({ entry, onClose, onDownload }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!entry) return null

  const p1 = entry.probs[0] * 100
  const p2 = entry.probs[1] * 100

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[rgba(15,23,42,.45)] p-5 backdrop-blur-[5px]" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="animate-pop max-h-[90vh] w-[min(660px,100%)] overflow-y-auto rounded-[20px] bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-line px-6 py-[19px]">
          <h3 className="font-display text-base">
            Detail Analisis <span className="font-mono text-primary">{entry.id}</span>
          </h3>
          <button className="btn-icon" onClick={onClose} aria-label="Tutup">
            <CloseIcon className="h-[14px] w-[14px]" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-[22px] p-6 max-[640px]:grid-cols-1">
          <div>
            {entry.thumb ? (
              <img className="m-thumb w-full rounded-xl border border-line" src={entry.thumb} alt="Scalogram" />
            ) : (
              <div className="grid aspect-video place-items-center rounded-xl border-[1.5px] border-dashed border-line2 p-3 text-center text-xs text-dim">
                Scalogram tidak tersimpan untuk entri ini
              </div>
            )}
          </div>
          <div>
            <div className="sec-title mb-[6px]">Prediksi</div>
            <div className={`m-klas font-display text-[32px] font-bold tracking-[-.5px] ${entry.klas === 'HFrEF' ? 'text-rose' : 'text-amber'}`}>
              {entry.klas}
            </div>
            <div className="mt-[3px] text-[12.5px] text-muted">
              Konfidensi {fmtPct(entry.conf)} · {fmtDate(entry.ts)} {fmtTime(entry.ts)}
            </div>
            <div className="divider my-4" />
            <div className="sec-title">Probabilitas Kelas</div>
            <div className="prob-row mt-[11px]">
              <div className="flex justify-between text-[12.5px] font-semibold">
                <span className="text-amber">HFpEF</span>
                <b className="font-mono">{fmtPct(entry.probs[0])}</b>
              </div>
              <div className="mt-1.5 h-[9px] overflow-hidden rounded-[6px] bg-[#f0f3f9]">
                <div className="h-full rounded-[6px] bg-gradient-to-r from-[#f59e0b] to-[#fbbf24]" style={{ width: `${p1}%` }} />
              </div>
            </div>
            <div className="prob-row mt-[11px]">
              <div className="flex justify-between text-[12.5px] font-semibold">
                <span className="text-rose">HFrEF</span>
                <b className="font-mono">{fmtPct(entry.probs[1])}</b>
              </div>
              <div className="mt-1.5 h-[9px] overflow-hidden rounded-[6px] bg-[#f0f3f9]">
                <div className="h-full rounded-[6px] bg-gradient-to-r from-[#e11d48] to-[#fb7185]" style={{ width: `${p2}%` }} />
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2 text-[12.5px]">
              {[
                ['Sumber data', entry.src],
                ['Estimasi HR', `${entry.stats.hr} bpm`],
                ['Amplitudo QRS', `${entry.stats.amp.toFixed(2).replace('.', ',')} mV`],
                ['Durasi QRS', `${Math.round(entry.stats.qrsW)} ms`],
                ['SDNN', `${Math.round(entry.stats.sdnn)} ms`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-dashed border-line pb-[7px]">
                  <span className="text-muted">{k}</span>
                  <b className="text-right font-semibold">{v}</b>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-[9px] border-t border-line px-6 py-[17px]">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            Tutup
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => onDownload(entry)}>
            <DownloadIcon className="h-4 w-4" />
            Unduh Laporan
          </button>
        </div>
      </div>
    </div>
  )
}
