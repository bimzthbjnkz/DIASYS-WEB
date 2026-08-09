import { CheckIcon } from './icons.jsx'

const LABELS = ['Unggah Data', 'Preprocessing', 'CWT', 'Inferensi CNN']

export default function Steps({ steps, progress = 0, stage = 'siap · menunggu data' }) {
  return (
    <>
      <ol className="mb-3 mt-1 flex list-none flex-wrap items-center gap-3">
        {steps.map((st, i) => (
          <li key={i} className="flex items-center gap-3">
            <div className="flex items-center gap-[9px]">
              <span
                className={`grid h-[30px] w-[30px] flex-shrink-0 place-items-center rounded-full font-display text-[13px] font-bold transition-all duration-200 ${
                  st === 'done'
                    ? 'border-green bg-green'
                    : st === 'active'
                      ? 'border-primary text-primary animate-dotpulse border-[1.5px]'
                      : 'border-line2 text-dim border-[1.5px] bg-white'
                }`}
              >
                {st === 'done' ? <CheckIcon /> : i + 1}
              </span>
              <span
                className={`text-[12.5px] font-semibold whitespace-nowrap ${
                  st === 'active' ? 'text-primary' : st === 'done' ? 'text-ink' : 'text-muted'
                }`}
              >
                {LABELS[i]}
              </span>
            </div>
            {i < steps.length - 1 && (
              <span className={`h-[2px] min-w-[18px] flex-1 rounded-[2px] transition-colors duration-300 ${steps[i + 1] === 'done' ? 'bg-green' : 'bg-line2'}`} />
            )}
          </li>
        ))}
      </ol>
      <div className="mb-5 flex items-center gap-3">
        <div className="h-[5px] flex-1 overflow-hidden rounded-[4px] bg-[#e9edf5]">
          <div
            className="h-full rounded-[4px] bg-gradient-to-r from-primary to-[#818cf8] transition-[width] duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="font-mono text-[11px] font-semibold text-dim min-w-[190px] whitespace-nowrap text-right max-[640px]:hidden">
          {stage}
        </span>
      </div>
    </>
  )
}
