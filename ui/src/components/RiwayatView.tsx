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
        <h1 className="font-display text-[25px] tracking-[-.4px]">Riwayat Analisis</h1>
        <p className="mt-1.5 max-w-[720px] text-[13.5px] leading-[1.6] text-muted">
          Seluruh hasil klasifikasi beserta konfidensi, pengukuran sinyal, dan scalogram tersimpan.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-[9px]">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-4 py-2 font-sans text-xs font-semibold transition-colors duration-150 ${
              filter === f.id
                ? 'border-primary bg-primary text-white'
                : 'border-line2 bg-white text-muted hover:text-ink'
            }`}
          >
            {f.label}
          </button>
        ))}
        <div className="ml-auto flex w-[270px] items-center gap-2 rounded-[10px] border border-line2 bg-white px-[13px] py-[9px] max-[640px]:w-full max-[640px]:ml-0">
          <SearchIcon className="h-[15px] w-[15px] flex-shrink-0 stroke-dim" />
          <input
            type="text"
            placeholder="Cari ID / sumber…"
            value={q}
            onChange={(e) => setQ(e.target.value.toLowerCase())}
            className="w-full border-none bg-none text-[12.5px] font-medium text-ink outline-none"
          />
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[780px] border-collapse text-[13px]">
          <thead>
            <tr>
              {['ID', 'Sumber Data', 'Waktu', 'Kelas', 'Konfidensi', '', 'Aksi'].map((h, i) => (
                <th key={i} className="border-b border-line px-4 py-[13px] text-left text-[10px] font-semibold tracking-[.9px] text-dim uppercase">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!rows.length && (
              <tr>
                <td colSpan={7}>
                  <div className="px-5 py-[54px] text-center text-dim">
                    <ClockIcon className="mx-auto mb-[10px] h-10 w-10 opacity-40" />
                    <br />
                    Tidak ada entri yang cocok.
                  </div>
                </td>
              </tr>
            )}
            {rows.map((e) => (
              <tr key={e.id} className="transition-colors duration-150 hover:bg-[#f8f9fe]">
                <td className="font-mono border-b border-[#f0f3f9] px-4 py-[13px] text-primary">{e.id}</td>
                <td className="max-w-[260px] overflow-hidden border-b border-[#f0f3f9] px-4 py-[13px] whitespace-nowrap text-ellipsis">{e.src}</td>
                <td className="border-b border-[#f0f3f9] px-4 py-[13px] whitespace-nowrap text-muted">
                  {fmtDate(e.ts)} · {fmtTime(e.ts)}
                </td>
                <td className="border-b border-[#f0f3f9] px-4 py-[13px]">
                  <span className={`inline-block rounded-[8px] px-[11px] py-[5px] font-mono text-[11.5px] font-bold ${e.klas === 'HFrEF' ? 'bg-rose-soft text-rose' : 'bg-amber-soft text-amber'}`}>
                    {e.klas}
                  </span>
                </td>
                <td className="font-mono border-b border-[#f0f3f9] px-4 py-[13px]">{fmtPct(e.conf)}</td>
                <td className="border-b border-[#f0f3f9] px-4 py-[13px]">
                  <div className="mini-bar h-[6px] w-[86px] overflow-hidden rounded-[4px] bg-[#eef1f7]">
                    <i style={{ width: `${(e.conf * 100).toFixed(0)}%` }} />
                  </div>
                </td>
                <td className="border-b border-[#f0f3f9] px-4 py-[13px]">
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
