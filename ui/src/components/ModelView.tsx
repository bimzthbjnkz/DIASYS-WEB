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
  ['00', 'Input — scalogram CWT mexican-hat · 3 lead (I, II, V5)', '32×2500×3'],
  ['01', 'Conv2D 32@(3×7) + BN + ReLU + MaxPool (2×4)', '15×623×32'],
  ['02', 'Conv2D 64@(3×5) + BN + ReLU + MaxPool (2×4)', '6×154×64'],
  ['03', 'Conv2D 128@(3×3) + BN + ReLU + MaxPool (2×4)', '2×38×128'],
  ['04', 'GlobalAveragePooling2D', '128'],
  ['05', 'Dense 64 + ReLU + Dropout 0,5', '64'],
  ['06', 'Dense 1 + Sigmoid → P(HFpEF)', '1'],
]

const METRICS: [string, string, number][] = [
  ['Akurasi', '94,6%', 94.6],
  ['Sensitivitas', '93,7%', 93.7],
  ['Spesifisitas', '95,6%', 95.6],
  ['AUC-ROC', '0,983', 98.3],
]

const METRIC_NOTE =
  'Metrik dan kurva pada panel ini bersifat ilustratif dari pelatihan EchoNext (kondisi tanpa normalisasi sinyal); nilai aktual ditentukan saat evaluasi set validasi penuh.'

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
      p: 'Resampling ke 250 Hz, jendela 10 detik (2500 sampel), kalibrasi unit otomatis ke mikrovotl (µV) sesuai format EchoNext.',
      icon: <WaveIcon className="h-5 w-5" />,
      style: { background: 'var(--color-primary-soft)', color: 'var(--color-primary)' },
    },
    {
      n: '② Continuous Wavelet Transform',
      p: 'Wavelet mexican-hat (pywt.cwt, scales 1–32) pada lead I, II, dan V5 → |koefisien| ditumpuk sebagai 3 kanal: tensor 32×2500×3.',
      icon: <LayersIcon className="h-5 w-5" />,
      style: { background: '#f1ecfe', color: '#7c3aed' },
    },
    {
      n: '③ Inferensi CNN',
      p: 'Tiga blok Conv2D + batch normalization + max pooling, dilanjutkan global average pooling, dense 64, dan sigmoid 1 neuron (P HFpEF). Grad-CAM dihitung dari lapisan konvolusi terakhir.',
      icon: <GridIcon className="h-5 w-5" />,
      style: { background: 'var(--color-amber-soft)', color: 'var(--color-amber)' },
    },
  ]

  return (
    <>
      <div className="page-head mb-[22px]">
        <h1 className="font-display text-[25px] tracking-[-.4px]">Model &amp; Pipeline</h1>
        <p className="mt-1.5 max-w-[720px] text-[13.5px] leading-[1.6] text-muted">
          EchoNext CNN — klasifikasi biner HFpEF vs HFrEF dari scalogram CWT mexican-hat 3 lead (I, II, V5), dijalankan di
          browser via TensorFlow.js.
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
        <Card title="Arsitektur Jaringan" hint="≈347 ribu parameter">
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
            {['loss=binary crossentropy', 'optimizer=Adam', 'class weight balanced', 'lead: I, II, V5', 'skala 1–32 · mexh'].map((h) => (
              <span key={h} className="rounded-[8px] border border-line bg-[#f4f6fa] px-[10px] py-1.5 font-mono text-[10.5px] font-semibold text-muted">
                {h}
              </span>
            ))}
          </div>
        </Card>

        <Card title="Kurva Pelatihan &amp; Evaluasi" hint="ilustratif">
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
          <div className="mt-3 rounded-[10px] border-l-[3px] border-line2 bg-[#f8f9fd] px-3 py-[10px] text-[11px] leading-[1.6] text-dim">
            {METRIC_NOTE}
          </div>
        </Card>
      </div>
    </>
  )
}
