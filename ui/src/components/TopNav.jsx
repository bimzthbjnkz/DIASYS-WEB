import { HeartIcon } from './icons.jsx'
import { fmtFullDate } from '../lib/format.js'

const TABS = [
  { id: 'analisis', label: 'Analisis' },
  { id: 'riwayat', label: 'Riwayat', badge: true },
  { id: 'model', label: 'Model' },
]

export default function TopNav({ view, setView, histCount }) {
  return (
    <nav className="sticky top-0 z-50 border-b border-line bg-white/88 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-[22px] px-6 py-[13px] max-[640px]:gap-[10px]">
        <div className="flex items-center gap-[11px]">
          <div className="grid h-[38px] w-[38px] place-items-center rounded-[11px] bg-gradient-to-br from-primary to-[#7c6cf0] shadow-[0_5px_14px_rgba(79,70,229,.3)]">
            <HeartIcon path="M3.5 12h3.2l1.6-3.4 2.6 6.2 1.9-4.2 1 1.4h3.7" className="h-5 w-5 stroke-white stroke-[2.3]" />
          </div>
          <div>
            <b className="font-display block text-[16.5px] tracking-[-.2px]">KardioWave AI</b>
            <span className="text-[11px] text-muted">Klasifikasi EKG · HFpEF / HFrEF</span>
          </div>
        </div>

        <div className="ml-3 flex gap-[5px] rounded-xl bg-[#eef1f7] p-1 max-[980px]:ml-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setView(t.id)}
              className={`flex items-center gap-[7px] rounded-[9px] px-[17px] py-2 font-sans text-[13px] font-semibold transition-colors duration-150 ${
                view === t.id
                  ? 'bg-white text-primary shadow-[0_1px_3px_rgba(15,23,42,.12)]'
                  : 'text-muted hover:text-ink'
              }`}
            >
              {t.label}
              {t.badge && (
                <span className="rounded-full bg-primary-soft px-[7px] py-[2px] font-mono text-[10.5px] font-bold text-primary">
                  {histCount}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-[11px]">
          <div className="flex items-center gap-[7px] rounded-full border border-[#c5e8d8] bg-green-soft px-[13px] py-[7px] font-sans text-xs font-semibold text-green">
            <span className="h-[7px] w-[7px] animate-pulse-dot rounded-full bg-green" />
            KardioNet v2.3 · Online
          </div>
          <div className="text-xs font-medium text-muted max-[980px]:hidden">{fmtFullDate(Date.now())}</div>
        </div>
      </div>
    </nav>
  )
}
