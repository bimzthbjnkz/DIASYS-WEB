import { useEffect } from 'react'
import Card from './Card'
import { GridIcon, LayersIcon, WaveIcon } from './icons'

/* ─── Stage 1: HF Detection (EfficientNetV2B0) ─── */
const HF_ARCH: [string, string, string][] = [
  ['00', 'Input — scalogram CWT Morlet · 3 lead (II, V2, V5)', '224×224×3'],
  ['01', 'EfficientNetV2B0 (pretrained, backbone frozen)', '1280'],
  ['02', 'Dense 128 + ReLU', '128'],
  ['03', 'Dropout 0,4', '128'],
  ['04', 'Dense 1 + Sigmoid → P(HF)', '1'],
]

/* ─── Stage 2: EchoNext (EfficientNetV2B0) ─── */
const EN_ARCH: [string, string, string][] = [
  ['00', 'Input — scalogram CWT Morlet · 3 lead (I, II, V5)', '160×160×3'],
  ['01', 'EfficientNetV2B0 (pretrained, backbone frozen)', '1280'],
  ['02', 'Dense 128 + BatchNorm + ReLU', '128'],
  ['03', 'Dropout 0,3', '128'],
  ['04', 'Dense 64 + ReLU', '64'],
  ['05', 'Dropout 0,15', '64'],
  ['06', 'Dense 1 + Sigmoid → P(HFpEF)', '1'],
]

export default function ModelView() {
  useEffect(() => {
    const timer = setTimeout(() => {
      document.querySelectorAll<HTMLElement>('[data-fill]').forEach((f) => {
        f.style.width = f.dataset.fill + '%'
      })
    }, 100)
    return () => clearTimeout(timer)
  }, [])

  const cascadeCards = [
    {
      n: '① Stage 1 — HF Detection',
      p: 'Z-score → CWT Morlet (morl) 31 skala → min-max [0,1] → resize 224×224. Input: 3 lead (II, V2, V5), fs=100 Hz.',
      icon: <WaveIcon className="h-5 w-5" />,
      bg: 'rgba(124, 58, 237, 0.08)',
      color: '#7c3aed',
    },
    {
      n: '② Stage 2 — EchoNext',
      p: 'Resample 250 Hz → downsample ×2 → CWT Morlet 48 skala → min-max [0,1] → resize 160×160. Input: 3 lead (I, II, V5).',
      icon: <LayersIcon className="h-5 w-5" />,
      bg: 'rgba(11, 138, 99, 0.08)',
      color: '#0B8A63',
    },
    {
      n: '③ Keputusan Cascade',
      p: 'Jika Stage 1 = Non-HF → selesai. Jika HF → jalankan Stage 2 untuk klasifikasi HFpEF vs HFrEF.',
      icon: <GridIcon className="h-5 w-5" />,
      bg: 'rgba(231, 166, 58, 0.12)',
      color: '#E7A63A',
    },
  ]

  return (
    <>
      <div className="page-head mb-[22px]">
        <span className="kicker reveal in" style={{ '--d': '0s' } as React.CSSProperties}>06 · Model & Pipeline</span>
        <h1 className="mt-3 font-display text-[clamp(1.8rem,4vw,2.6rem)] tracking-[-.4px]">Model &amp; Pipeline</h1>
        <p className="mt-1.5 max-w-[720px] text-[13.5px] leading-[1.6] text-[#54655D]">
          Sistem cascaded 2-stage — <b className="font-semibold text-[#0E1F19]">HF Detection</b> mendeteksi keberadaan Heart Failure, lalu{' '}
          <b className="font-semibold text-[#0E1F19]">EchoNext EfficientNetV2B0</b> mengklasifikasikan HFpEF vs HFrEF. Keduanya dijalankan di browser via TensorFlow.js.
        </p>
      </div>

      {/* ─── Cascade Flow ─── */}
      <div className="mb-4 grid grid-cols-3 gap-[14px] max-[980px]:grid-cols-1">
        {cascadeCards.map((c, i) => (
          <div key={c.n} className="relative rounded-[10px] border border-[rgba(14,31,25,0.15)] bg-[#FFFDF7] p-5 shadow-[0_24px_50px_-28px_rgba(14,31,25,0.18)]">
            <div
              className="mb-[13px] grid h-[42px] w-[42px] place-items-center rounded-xl"
              style={{ background: c.bg, color: c.color }}
            >
              {c.icon}
            </div>
            <b className="font-display text-[14px]">{c.n}</b>
            <p className="mt-[7px] text-xs leading-[1.65] text-[#54655D]">{c.p}</p>
            {i < cascadeCards.length - 1 && (
              <span className="absolute top-1/2 right-[-15px] z-[2] hidden -translate-y-1/2 font-display text-lg font-bold text-[#0B8A63] max-[980px]:static max-[980px]:mb-[-10px] max-[980px]:ml-[-5px] max-[980px]:block max-[980px]:translate-x-0 max-[980px]:translate-y-0 max-[980px]:text-center">
                →
              </span>
            )}
          </div>
        ))}
      </div>

      {/* ─── Two Model Architectures ─── */}
      <div className="grid grid-cols-2 gap-4 max-[980px]:grid-cols-1">
        {/* Stage 1: HF Detection */}
        <Card title="Stage 1 — HF Detection CNN" hint="≈6 juta parameter">
          <div className="mb-[10px] rounded-[8px] border border-[rgba(124,58,237,0.25)] bg-[rgba(124,58,237,0.06)] px-3 py-2 text-[11px] leading-[1.6] text-[#7c3aed]">
            <b>Dataset:</b> PTB-XL · 2,500 sampel (1,250 HF + 1,250 Non-HF) · 12 lead ECG
            <br />
            <b>Tugas:</b> Deteksi Heart Failure (MI indicators) vs Non-HF
            <br />
            <b>Input:</b> CWT Morlet 3 lead (II, V2, V5) · (224, 224, 3) · fs=100 Hz
          </div>
          <ul className="list-none">
            {HF_ARCH.map(([idx, name, shape]) => (
              <li key={idx} className="flex items-center gap-3 border-b border-[rgba(14,31,25,0.06)] px-[2px] py-[10px] text-[12.5px] last:border-b-0">
                <span className="font-mono w-[22px] flex-shrink-0 text-[10.5px] font-bold text-[#7c3aed]">{idx}</span>
                <span className="min-w-0">{name}</span>
                <span className="font-mono ml-auto flex-shrink-0 rounded-[6px] bg-[rgba(14,31,25,0.04)] px-[9px] py-[3px] text-[10.5px] font-semibold text-[#54655D]">{shape}</span>
              </li>
            ))}
          </ul>
          <div className="mt-[14px] flex flex-wrap gap-[7px]">
            {['loss=binary crossentropy', 'optimizer=Adam', 'class weight balanced', 'lead: II, V2, V5', 'morl · 31 skala'].map((h) => (
              <span key={h} className="rounded-[8px] border border-[rgba(14,31,25,0.15)] bg-transparent px-[10px] py-1.5 font-mono text-[10.5px] font-semibold text-[#54655D]">
                {h}
              </span>
            ))}
          </div>
        </Card>

        {/* Stage 2: EchoNext */}
        <Card title="Stage 2 — EchoNext CNN" hint="≈6 juta parameter">
          <div className="mb-[10px] rounded-[8px] border border-[rgba(11,138,99,0.25)] bg-[rgba(11,138,99,0.06)] px-3 py-2 text-[11px] leading-[1.6] text-[#0B8A63]">
            <b>Dataset:</b> EchoNext · 2,400 ECG · 12 lead (500 Hz)
            <br />
            <b>Tugas:</b> HFpEF (EF≥50%) vs HFrEF (EF≤40%)
            <br />
            <b>Input:</b> CWT Morlet 3 lead (I, II, V5) · (160, 160, 3) · fs=250 Hz
          </div>
          <ul className="list-none">
            {EN_ARCH.map(([idx, name, shape]) => (
              <li key={idx} className="flex items-center gap-3 border-b border-[rgba(14,31,25,0.06)] px-[2px] py-[10px] text-[12.5px] last:border-b-0">
                <span className="font-mono w-[22px] flex-shrink-0 text-[10.5px] font-bold text-[#0B8A63]">{idx}</span>
                <span className="min-w-0">{name}</span>
                <span className="font-mono ml-auto flex-shrink-0 rounded-[6px] bg-[rgba(14,31,25,0.04)] px-[9px] py-[3px] text-[10.5px] font-semibold text-[#54655D]">{shape}</span>
              </li>
            ))}
          </ul>
          <div className="mt-[14px] flex flex-wrap gap-[7px]">
            {['loss=binary crossentropy', 'optimizer=Adam', 'class weight balanced', 'lead: I, II, V5', 'morl · 48 skala · downsample ×2'].map((h) => (
              <span key={h} className="rounded-[8px] border border-[rgba(14,31,25,0.15)] bg-transparent px-[10px] py-1.5 font-mono text-[10.5px] font-semibold text-[#54655D]">
                {h}
              </span>
            ))}
          </div>
        </Card>
      </div>
    </>
  )
}
