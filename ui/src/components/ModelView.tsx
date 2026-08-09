import { useEffect, useRef } from 'react'
import Card from './Card'
import { GridIcon, LayersIcon, WaveIcon } from './icons'
import { drawTraining } from '../lib/draw'

function TrainCanvas() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (ref.current) drawTraining(ref.current)
  }, [])
  return <canvas ref={ref} width={1100} height={480} className="block h-auto w-full" />
}

const ARCH: [string, string, string][] = [
  ['00', 'Input — scalogram CWT', '224×224×3'],
  ['01', 'Conv2D 32@3×3 + BN + ReLU + MaxPool', '112×112×32'],
  ['02', 'Conv2D 64@3×3 + BN + ReLU + MaxPool', '56×56×64'],
  ['03', 'Conv2D 128@3×3 + BN + ReLU + MaxPool', '28×28×128'],
  ['04', 'Conv2D 256@3×3 + BN + ReLU + MaxPool', '14×14×256'],
  ['05', 'GlobalAveragePooling + Dropout 0,4', '256'],
  ['06', 'Dense 128 + ReLU + Dropout 0,3', '128'],
  ['07', 'Dense 2 + Softmax → HFpEF / HFrEF', '2'],
]

const METRICS: [string, string, number][] = [
  ['Akurasi', '94,6%', 94.6],
  ['Sensitivitas', '93,7%', 93.7],
  ['Spesifisitas', '95,6%', 95.6],
  ['AUC-ROC', '0,983', 98.3],
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

  const pipeCards = [
    {
      n: '① Preprocessing',
      p: 'Detrending baseline wander, filter lolos-pita 0,5–40 Hz, notch 50 Hz, kalibrasi unit otomatis, dan pemotongan jendela 10–12 detik.',
      icon: <WaveIcon className="h-5 w-5" />,
      style: { background: 'var(--color-primary-soft)', color: 'var(--color-primary)' },
    },
    {
      n: '② Continuous Wavelet Transform',
      p: 'Sinyal 1-D dikonversi menjadi scalogram waktu–frekuensi 2-D memakai wavelet Morlet (ω₀ = 6) pada 56 skala geometris ≈ 1–121 Hz.',
      icon: <LayersIcon className="h-5 w-5" />,
      style: { background: '#f1ecfe', color: '#7c3aed' },
    },
    {
      n: '③ Inferensi CNN',
      p: 'Empat blok konvolusional + batch normalization + dropout, diakhiri softmax 2 neuron. Grad-CAM menampilkan peta atensi model.',
      icon: <GridIcon className="h-5 w-5" />,
      style: { background: 'var(--color-amber-soft)', color: 'var(--color-amber)' },
    },
  ]

  return (
    <>
      <div className="page-head mb-[22px]">
        <h1 className="font-display text-[25px] tracking-[-.4px]">Model &amp; Pipeline</h1>
        <p className="mt-1.5 max-w-[720px] text-[13.5px] leading-[1.6] text-muted">
          KardioNet-CNN v2.3 — klasifikasi biner HFpEF vs HFrEF berbasis scalogram CWT dengan interpretabilitas Grad-CAM.
        </p>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-[14px] max-[980px]:grid-cols-1">
        {pipeCards.map((c, i) => (
          <div key={c.n} className="relative rounded-2xl border border-line bg-card p-5 shadow-soft">
            <div className="mb-[13px] grid h-[42px] w-[42px] place-items-center rounded-xl" style={c.style}>
              {c.icon}
            </div>
            <b className="font-display text-[14px]">{c.n}</b>
            <p className="mt-[7px] text-xs leading-[1.65] text-muted">{c.p}</p>
            {i < pipeCards.length - 1 && (
              <span className="absolute top-1/2 right-[-15px] z-[2] hidden -translate-y-1/2 font-display text-lg font-bold text-primary max-[980px]:static max-[980px]:mb-[-10px] max-[980px]:ml-[-5px] max-[980px]:block max-[980px]:translate-x-0 max-[980px]:translate-y-0 max-[980px]:text-center">
                →
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 max-[980px]:grid-cols-1">
        <Card title="Arsitektur Jaringan" hint="≈1,2 juta parameter">
          <ul className="list-none">
            {ARCH.map(([idx, name, shape]) => (
              <li key={idx} className="flex items-center gap-3 border-b border-[#f0f3f9] px-[2px] py-[10px] text-[12.5px] last:border-b-0">
                <span className="font-mono w-[22px] flex-shrink-0 text-[10.5px] font-bold text-primary">{idx}</span>
                <span className="min-w-0">{name}</span>
                <span className="font-mono ml-auto flex-shrink-0 rounded-[6px] bg-[#f4f6fa] px-[9px] py-[3px] text-[10.5px] font-semibold text-muted">{shape}</span>
              </li>
            ))}
          </ul>
          <div className="mt-[14px] flex flex-wrap gap-[7px]">
            {['Adam lr=3e-4', 'batch=32', '60 epoch', 'early stopping', '5-fold CV', 'augmentasi noise + shift'].map((h) => (
              <span key={h} className="rounded-[8px] border border-line bg-[#f4f6fa] px-[10px] py-1.5 font-mono text-[10.5px] font-semibold text-muted">
                {h}
              </span>
            ))}
          </div>
        </Card>

        <Card title="Kurva Pelatihan &amp; Evaluasi" hint="validasi silang 5-fold">
          <TrainCanvas />
          <div className="divider" />
          <div>
            {METRICS.map(([name, val, pct]) => (
              <div key={name} className="flex items-center gap-3 py-[9px]">
                <span className="w-[118px] flex-shrink-0 text-[12.5px] font-medium text-muted">{name}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-[5px] bg-[#eef1f7]">
                  <div
                    data-fill={pct}
                    className="h-full rounded-[5px] bg-gradient-to-r from-primary to-[#818cf8]"
                    style={{ width: 0, transition: 'width 1.1s cubic-bezier(.3,.8,.3,1)' }}
                  />
                </div>
                <span className="font-mono w-[60px] text-right text-[12.5px] font-bold">{val}</span>
              </div>
            ))}
          </div>
          <div className="divider" />
          <div className="sec-title">Confusion Matrix (n=1.240)</div>
          <div className="grid grid-cols-[auto_1fr_1fr] items-center gap-1.5 text-xs">
            <div />
            <div className="cm-h">Pred: HFpEF</div>
            <div className="cm-h">Pred: HFrEF</div>
            <div className="cm-lbl">Aktual: HFpEF</div>
            <div className="cm-cell cm-tp">583</div>
            <div className="cm-cell cm-fp">27</div>
            <div className="cm-lbl">Aktual: HFrEF</div>
            <div className="cm-cell cm-fp">40</div>
            <div className="cm-cell cm-tp">590</div>
          </div>
        </Card>
      </div>
    </>
  )
}
