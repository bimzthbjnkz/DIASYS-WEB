import { fmtFullDate } from '../lib/format'

const TABS = [
  { id: 'beranda', label: 'Beranda' },
  { id: 'analisis', label: 'Analisis' },
  { id: 'riwayat', label: 'Riwayat', badge: true },
  { id: 'model', label: 'Model' },
]

interface TopNavProps {
  view: string
  setView: (view: string) => void
  histCount: number
}

export default function TopNav({ view, setView, histCount }: TopNavProps) {
  const handleTabClick = (id: string) => {
    if (id === 'beranda') {
      setView('landing')
    } else {
      setView(id)
    }
  }

  return (
    <nav className="top-nav sticky top-0 z-50">
      <div className="top-nav-in mx-auto flex max-w-[1240px] flex-wrap items-center gap-[22px] px-6 py-[13px] max-[640px]:gap-[10px]">
        <div className="flex items-center gap-[11px]">
          <div className="flex h-[38px] w-[38px] items-center justify-center rounded-[8px] bg-[#0E1F19]">
            <svg width="22" height="14" viewBox="0 0 26 16" fill="none" aria-hidden="true">
              <path d="M0 9h5l2-5 3 10 3-13 3 11 2-3h8" stroke="#2EE6A8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <b className="block font-display text-[16.5px] tracking-[-.2px]">DIASYS <span className="text-[11px] font-mono font-normal tracking-[.2em] text-[#54655D]">PROJECT</span></b>
          </div>
        </div>

        <div className="ml-3 flex gap-[4px] max-[980px]:ml-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => handleTabClick(t.id)}
              className={`nav-tab-btn relative rounded-none border-b-2 px-[17px] py-2 font-mono text-[12.5px] font-medium tracking-[.04em] transition-colors duration-200 ${
                (t.id === 'beranda' && view === 'landing') || (t.id !== 'beranda' && view === t.id)
                  ? 'border-[#0B8A63] text-[#0E1F19]'
                  : 'border-transparent text-[#54655D] hover:text-[#0E1F19]'
              }`}
            >
              {t.label}
              {t.badge && (
                <span className="ml-[6px] rounded-full bg-[rgba(11,138,99,0.1)] px-[7px] py-[2px] font-mono text-[10.5px] font-bold text-[#0B8A63]">
                  {histCount}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-[11px]">
          <div className="flex items-center gap-[7px] rounded-full border border-[rgba(46,230,168,0.35)] bg-[rgba(46,230,168,0.06)] px-[13px] py-[7px] font-mono text-[11px] font-medium text-[#2EE6A8]">
            <span className="h-[7px] w-[7px] animate-pulse-dot rounded-full bg-[#2EE6A8]" />
            SIAGA
          </div>
          <div className="text-[11px] font-medium text-[#7FA394] max-[980px]:hidden font-mono tracking-[.1em]">{fmtFullDate(Date.now())}</div>
        </div>
      </div>
    </nav>
  )
}
