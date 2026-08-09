export default function Card({ title, hint, children, bodyClass = '' }) {
  return (
    <section className="rounded-2xl border border-line bg-card shadow-soft">
      <div className="flex items-baseline justify-between gap-3 px-5 pt-[17px]">
        <h2 className="font-display text-[15px] font-bold">{title}</h2>
        {hint && <span className="text-[11.5px] font-medium text-dim">{hint}</span>}
      </div>
      <div className={`px-5 pt-4 pb-5 ${bodyClass}`}>{children}</div>
    </section>
  )
}
