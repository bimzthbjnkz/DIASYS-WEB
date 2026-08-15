import { CheckIcon } from './icons'

const LABELS = ['Unggah Data', 'Prep HF', 'Inferensi HF', 'Prep Echo', 'Inferensi CNN']

interface StepsProps {
  steps: string[]
  progress?: number
  stage?: string
}

export default function Steps({ steps, progress = 0, stage = 'siap · menunggu data' }: StepsProps) {
  return (
    <>
      <ol className="mb-3 mt-1 flex list-none flex-wrap items-center gap-3">
        {steps.map((st, i) => (
          <li key={i} className="flex items-center gap-3">
            <div className="flex items-center gap-[9px]">
              <span
                className={`grid h-[30px] w-[30px] flex-shrink-0 place-items-center rounded-full font-display text-[13px] font-bold transition-all duration-200 ${
                  st === 'done'
                    ? 'bg-[#0B8A63] text-white border-[#0B8A63]'
                    : st === 'active'
                      ? 'border-[1.5px] border-[#0B8A63] text-[#0B8A63] animate-dotpulse'
                      : 'border-[1.5px] border-[rgba(14,31,25,0.22)] text-[#7FA394] bg-[#FFFDF7]'
                }`}
              >
                {st === 'done' ? <CheckIcon /> : i + 1}
              </span>
              <span
                className={`text-[12.5px] font-semibold whitespace-nowrap ${
                  st === 'active' ? 'text-[#0B8A63]' : st === 'done' ? 'text-[#0E1F19]' : 'text-[#54655D]'
                }`}
              >
                {LABELS[i]}
              </span>
            </div>
            {i < steps.length - 1 && (
              <span className={`h-[2px] min-w-[18px] flex-1 rounded-[2px] transition-colors duration-300 ${steps[i + 1] === 'done' ? 'bg-[#0B8A63]' : 'bg-[rgba(14,31,25,0.12)]'}`} />
            )}
          </li>
        ))}
      </ol>
      <div className="mb-5 flex items-center gap-3">
        <div className="h-[5px] flex-1 overflow-hidden rounded-[4px] bg-[rgba(14,31,25,0.06)]">
          <div
            className="h-full rounded-[4px] bg-gradient-to-r from-[#0B8A63] to-[#2EE6A8] transition-[width] duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="font-mono text-[11px] font-semibold text-[#7FA394] min-w-[190px] whitespace-nowrap text-right max-[640px]:hidden">
          {stage}
        </span>
      </div>
    </>
  )
}
