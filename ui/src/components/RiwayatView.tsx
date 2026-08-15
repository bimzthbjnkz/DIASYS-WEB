import { SearchIcon, ClockIcon, EyeIcon, TrashIcon } from './icons'
import { fmtDate, fmtPct, fmtTime } from '../lib/format'
import type { ReportEntry } from '../lib/report'

const FILTERS = [
  { id: 'all', label: 'Semua' },
  { id: 'HFpEF', label: 'HFpEF' },
  { id: 'HFrEF', label: 'HFrEF' },
  { id: 'Non-HF', label: 'Non-HF' },
]

interface RiwayatViewProps {
  history: ReportEntry[]
  filter: string
  setFilter: (filter: string) => void
  q: string
  setQ: (q: string) => void
  onView: (entry: ReportEntry) => void
  onDelete: (entry: ReportEntry) => void
}

export default function RiwayatView({ history, filter, setFilter, q, setQ, onView, onDelete }: RiwayatViewProps) {
  const rows = history.filter(
    (e) =>
      (filter === 'all' || e.klas === filter) &&
      (e.src.toLowerCase().includes(q) || e.id.toLowerCase().includes(q)),
  )

  return (
    <>
      <div className="page-head mb-[22px]">
        <span className="kicker reveal in" style={{ '--d': '0s' } as React.CSSProperties}>05 · Riwayat Analisis</span>
        <h1 className="mt-3 font-display text-[clamp(1.8rem,4vw,2.6rem)] tracking-[-.4px]">Riwayat Analisis</h1>
        <p className="mt-1.5 max-w-[720px] text-[13.5px] leading-[1.6] text-[#54655D]">
          Seluruh hasil klasifikasi beserta konfidensi, pengukuran sinyal, dan scalogram tersimpan.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-[9px]">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-4 py-2 font-sans text-xs font-semibold transition-colors duration-150 border ${
              filter === f.id
                ? 'border-[#0B8A63] bg-[#0E1F19] text-white'
                : 'border-[rgba(14,31,25,0.15)] bg-transparent text-[#54655D] hover:text-[#0E1F19]'
            }`}
          >
            {f.label}
          </button>
        ))}
        <div className="ml-auto flex w-[270px] items-center gap-2 rounded-[8px] border border-[rgba(14,31,25,0.15)] bg-transparent px-[13px] py-[9px] max-[640px]:w-full max-[640px]:ml-0">
          <SearchIcon className="h-[15px] w-[15px] flex-shrink-0 stroke-[#7FA394]" />
          <input
            type="text"
            placeholder="Cari ID / sumber…"
            value={q}
            onChange={(e) => setQ(e.target.value.toLowerCase())}
            className="w-full border-none bg-none text-[12.5px] font-medium text-[#0E1F19] outline-none placeholder:text-[#7FA394]"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-[10px] border border-[rgba(14,31,25,0.15)] bg-[#FFFDF7] shadow-[0_24px_50px_-28px_rgba(14,31,25,0.18)]">
        <table className="w-full min-w-[780px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-[rgba(14,31,25,0.12)] bg-[#ECE8DD]">
              {['ID', 'Sumber Data', 'Waktu', 'Kelas', 'Konfidensi', '', 'Aksi'].map((h, i) => (
                <th key={i} className="px-4 py-[13px] text-left font-mono text-[10px] font-semibold tracking-[.14em] text-[#54655D] uppercase">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!rows.length && (
              <tr>
                <td colSpan={7}>
                  <div className="px-5 py-[54px] text-center text-[#7FA394]">
                    <ClockIcon className="mx-auto mb-[10px] h-10 w-10 opacity-40" />
                    <br />
                    Tidak ada entri yang cocok.
                  </div>
                </td>
              </tr>
            )}
            {rows.map((e) => (
              <tr key={e.id} className="transition-colors duration-150 hover:bg-[rgba(11,138,99,0.03)] border-b border-[rgba(14,31,25,0.06)]">
                <td className="font-mono px-4 py-[13px] text-[#0B8A63] font-semibold">{e.id}</td>
                <td className="max-w-[260px] overflow-hidden px-4 py-[13px] whitespace-nowrap text-ellipsis">{e.src}</td>
                <td className="px-4 py-[13px] whitespace-nowrap text-[#54655D]">
                  {fmtDate(e.ts)} · {fmtTime(e.ts)}
                </td>
                <td className="px-4 py-[13px]">
                  <span className={`inline-block rounded-[8px] px-[11px] py-[5px] font-mono text-[11.5px] font-bold ${e.klas === 'HFrEF' ? 'bg-[rgba(224,80,46,0.1)] text-[#E0502E]' : 'bg-[rgba(231,166,58,0.12)] text-[#E7A63A]'}`}>
                    {e.klas}
                  </span>
                </td>
                <td className="font-mono px-4 py-[13px]">{fmtPct(e.conf)}</td>
                <td className="px-4 py-[13px]">
                  <div className="mini-bar h-[6px] w-[86px] overflow-hidden rounded-[4px] bg-[rgba(14,31,25,0.06)]">
                    <i style={{ width: `${(e.conf * 100).toFixed(0)}%` }} />
                  </div>
                </td>
                <td className="px-4 py-[13px]">
                  <div className="flex gap-1.5">
                    <button className="btn-icon" title="Lihat detail" onClick={() => onView(e)}>
                      <EyeIcon className="h-[14px] w-[14px]" />
                    </button>
                    <button className="btn-icon danger" title="Hapus" onClick={() => onDelete(e)}>
                      <TrashIcon className="h-[14px] w-[14px]" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
