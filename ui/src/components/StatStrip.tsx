import { ChartIcon, HeartIcon, InboxIcon } from './icons'

interface StatStripProps {
  stats: {
    total: number
    p: number
    f: number
    avg: string
  }
}

export default function StatStrip({ stats }: StatStripProps) {
  const items = [
    {
      label: 'Total Analisis',
      val: String(stats.total),
      icon: <ChartIcon className="h-[19px] w-[19px]" />,
      bg: '#0F1E19',
      accent: '#2EE6A8',
    },
    {
      label: 'HFpEF terdeteksi',
      val: String(stats.p),
      icon: <HeartIcon className="h-[19px] w-[19px]" />,
      bg: '#0F1E19',
      accent: '#E7A63A',
    },
    {
      label: 'HFrEF terdeteksi',
      val: String(stats.f),
      icon: <HeartIcon path="M12 8v4m0 3.5h.01" className="h-[19px] w-[19px]" />,
      bg: '#0F1E19',
      accent: '#E0502E',
    },
    {
      label: 'Rerata konfidensi',
      val: stats.avg,
      icon: <InboxIcon className="h-[19px] w-[19px]" />,
      bg: '#0F1E19',
      accent: '#2EE6A8',
    },
  ]
  return (
    <div className="lp-stats mb-6 grid grid-cols-4 gap-[1px] rounded-[10px] border border-[rgba(220,240,232,0.11)] bg-[rgba(220,240,232,0.11)] overflow-hidden max-[980px]:grid-cols-2 max-[640px]:grid-cols-1">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-[13px] p-[1.4rem_1.3rem] transition-colors duration-300" style={{ background: it.bg }}>
          <div
            className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-[11px]"
            style={{ background: `${it.accent}18`, color: it.accent }}
          >
            {it.icon}
          </div>
          <div>
            <div className="font-display text-[21px] font-bold leading-[1.15] tracking-[-.4px]" style={{ color: it.accent }}>{it.val}</div>
            <div className="mt-[2px] text-[11.5px] text-[#9DB4A9]">{it.label}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
