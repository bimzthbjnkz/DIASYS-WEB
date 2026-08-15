import type { ReactNode } from 'react'

interface CardProps {
  title: string
  hint?: string
  children: ReactNode
  bodyClass?: string
}

export default function Card({ title, hint, children, bodyClass = '' }: CardProps) {
  return (
    <section className="lp-card overflow-hidden rounded-[10px] border border-[rgba(14,31,25,0.15)] bg-[#FFFDF7] shadow-[0_24px_50px_-28px_rgba(14,31,25,0.18)]">
      <div className="flex items-baseline justify-between gap-3 border-b border-[rgba(14,31,25,0.08)] bg-[#ECE8DD] px-5 pt-[14px] pb-[13px]">
        <h2 className="font-mono text-[10.5px] font-semibold uppercase tracking-[.18em] text-[#54655D]">{title}</h2>
        {hint && <span className="font-mono text-[10px] font-medium tracking-[.14em] text-[#7FA394] uppercase">{hint}</span>}
      </div>
      <div className={`px-5 pt-4 pb-5 ${bodyClass}`}>{children}</div>
    </section>
  )
}
