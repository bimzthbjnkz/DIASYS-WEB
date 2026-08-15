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
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[rgba(10,21,18,.6)] p-5 backdrop-blur-[5px]" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="animate-pop max-h-[90vh] w-[min(660px,100%)] overflow-y-auto rounded-[14px] bg-[#FFFDF7] border border-[rgba(14,31,25,0.15)] shadow-[0_34px_70px_-38px_rgba(10,21,18,.7)]">
        <div className="flex items-center justify-between border-b border-[rgba(14,31,25,0.15)] bg-[#ECE8DD] px-6 py-[19px]">
          <h3 className="font-display text-base">
            Detail Analisis <span className="font-mono text-[#0B8A63]">{entry.id}</span>
          </h3>
          <button className="btn-icon" onClick={onClose} aria-label="Tutup">
            <CloseIcon className="h-[14px] w-[14px]" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-[22px] p-6 max-[640px]:grid-cols-1">
          <div>
            {entry.thumb ? (
              <img className="m-thumb w-full rounded-[8px] border border-[rgba(14,31,25,0.15)]" src={entry.thumb} alt="Scalogram" />
            ) : (
              <div className="grid aspect-video place-items-center rounded-[8px] border-[1.5px] border-dashed border-[rgba(14,31,25,0.18)] p-3 text-center text-xs text-[#7FA394]">
                Scalogram tidak tersimpan untuk entri ini
              </div>
            )}
          </div>
          <div>
            <div className="sec-title mb-[6px]">Prediksi</div>
            <div className={`m-klas font-display text-[32px] font-bold tracking-[-.5px] ${entry.klas === 'HFrEF' ? 'text-[#E0502E]' : 'text-[#E7A63A]'}`}>
              {entry.klas}
            </div>
            <div className="mt-[3px] text-[12.5px] text-[#54655D]">
              Konfidensi {fmtPct(entry.conf)} · {fmtDate(entry.ts)} {fmtTime(entry.ts)}
            </div>
            <div className="divider my-4" />
            <div className="sec-title">Probabilitas Kelas</div>
            <div className="prob-row mt-[11px]">
              <div className="flex justify-between text-[12.5px] font-semibold">
                <span className="text-[#E7A63A]">HFpEF</span>
                <b className="font-mono">{fmtPct(entry.probs[0])}</b>
              </div>
              <div className="mt-1.5 h-[9px] overflow-hidden rounded-[6px] bg-[rgba(14,31,25,0.06)]">
                <div className="h-full rounded-[6px] bg-gradient-to-r from-[#E7A63A] to-[#F5C542]" style={{ width: `${p1}%` }} />
              </div>
            </div>
            <div className="prob-row mt-[11px]">
              <div className="flex justify-between text-[12.5px] font-semibold">
                <span className="text-[#E0502E]">HFrEF</span>
                <b className="font-mono">{fmtPct(entry.probs[1])}</b>
              </div>
              <div className="mt-1.5 h-[9px] overflow-hidden rounded-[6px] bg-[rgba(14,31,25,0.06)]">
                <div className="h-full rounded-[6px] bg-gradient-to-r from-[#E0502E] to-[#FF7A56]" style={{ width: `${p2}%` }} />
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
                <div key={k} className="flex justify-between gap-3 border-b border-dashed border-[rgba(14,31,25,0.12)] pb-[7px]">
                  <span className="text-[#54655D]">{k}</span>
                  <b className="text-right font-semibold">{v}</b>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-[9px] border-t border-[rgba(14,31,25,0.15)] px-6 py-[17px]">
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
