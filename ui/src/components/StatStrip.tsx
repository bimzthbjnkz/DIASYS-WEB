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
      style: { background: 'var(--color-primary-soft)', color: 'var(--color-primary)' },
    },
    {
      label: 'HFpEF terdeteksi',
      val: String(stats.p),
      icon: <HeartIcon className="h-[19px] w-[19px]" />,
      style: { background: 'var(--color-amber-soft)', color: 'var(--color-amber)' },
    },
    {
      label: 'HFrEF terdeteksi',
      val: String(stats.f),
      icon: <HeartIcon path="M12 8v4m0 3.5h.01" className="h-[19px] w-[19px]" />,
      style: { background: 'var(--color-rose-soft)', color: 'var(--color-rose)' },
    },
    {
      label: 'Rerata konfidensi',
      val: stats.avg,
      icon: <InboxIcon className="h-[19px] w-[19px]" />,
      style: { background: 'var(--color-green-soft)', color: 'var(--color-green)' },
    },
  ]
  return (
    <div className="mb-6 grid grid-cols-4 gap-[14px] max-[980px]:grid-cols-2 max-[640px]:grid-cols-1">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-[13px] rounded-[14px] border border-line bg-card p-[15px_17px] shadow-soft">
          <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-[11px]" style={it.style}>
            {it.icon}
          </div>
          <div>
            <div className="font-display text-[21px] font-bold leading-[1.15] tracking-[-.4px]">{it.val}</div>
            <div className="mt-[1px] text-[11.5px] text-muted">{it.label}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
