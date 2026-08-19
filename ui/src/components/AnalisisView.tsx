import { useRef } from 'react'
import Card from './Card'
import Steps from './Steps'
import StatStrip from './StatStrip'
import SignalCanvas from './SignalCanvas'
import ScalogramCanvas from './ScalogramCanvas'
import ResultPanel from './ResultPanel'
import {
  DownloadIcon,
  FileIcon,
  PlayIcon,
  UploadIcon,
} from './icons'
import { toLocaleId } from '../lib/format'
import { downloadSampleCsv } from '../lib/report'
import type { UseAnalysisReturn } from '../hooks/useAnalysis'
import type { ReportEntry } from '../lib/report'

interface UploadCardProps {
  a: UseAnalysisReturn
}

function UploadCard({ a }: UploadCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragging = useRef(false)

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dragging.current = false
    const f = e.dataTransfer.files[0]
    if (f && !a.running) a.loadFile(f)
  }

  const dataMeta = (() => {
    if (!a.dataset) return null
    const col = a.dataset.cols[a.lead]
    const used = Math.min(col.length, Math.floor(10 * a.fs))
    const extra = col.length > used ? ' · diproses 10 s pertama' : ''
    return `${a.dataset.cols.length} kanal · ${toLocaleId(col.length)} sampel · ±${(col.length / a.fs).toFixed(1)} s${extra} · ${a.dataset.note}`
  })()

  return (
    <Card title="1 · Sumber Data EKG" hint="standar 10 detik">
      <div
        className={`rounded-[8px] border-[1.5px] border-dashed p-[30px_18px] text-center transition-colors duration-200 ${
          dragging.current
            ? 'border-[#0B8A63] bg-[rgba(11,138,99,0.05)]'
            : 'border-[rgba(14,31,25,0.18)] bg-transparent hover:border-[#0B8A63] hover:bg-[rgba(11,138,99,0.04)]'
        }`}
        onClick={() => !a.running && fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          dragging.current = true
        }}
        onDragEnter={(e) => {
          e.preventDefault()
          dragging.current = true
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          dragging.current = false
        }}
        onDrop={onDrop}
        style={{ cursor: 'pointer' }}
      >
        <div className="mx-auto mb-[11px] grid h-[46px] w-[46px] place-items-center rounded-[13px] bg-[rgba(11,138,99,0.08)]">
          <UploadIcon className="h-[22px] w-[22px] stroke-[#0B8A63]" />
        </div>
        <b className="block text-[14px]">Seret &amp; letakkan file EKG, atau klik untuk memilih</b>
        <span className="mt-1.5 block text-xs leading-[1.55] text-[#54655D]">
          Kolom numerik dideteksi otomatis · multi-lead didukung · skala unit (mV / µV / ADC) dikalibrasi otomatis
        </span>
        <div className="mt-3 flex flex-wrap justify-center gap-[7px]">
          {['.csv', '.txt', '.dat (MIT-BIH 212)', 'delimiter auto'].map((f) => (
            <span key={f} className="rounded-[7px] border border-[rgba(14,31,25,0.15)] bg-transparent px-[9px] py-1 font-mono text-[10.5px] font-semibold text-[#54655D]">
              {f}
            </span>
          ))}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.txt,.dat,.hea"
          hidden
          onChange={(e) => {
            if (e.target.files?.[0]) a.loadFile(e.target.files[0])
            e.target.value = ''
          }}
        />
      </div>

      <div className="mt-[14px] flex flex-wrap gap-[9px]">
        <button className="alt-btn" onClick={() => a.loadSample('hfpEF')} disabled={a.running}>
          <span className="h-[9px] w-[9px] rounded-[3px] bg-[#E7A63A]" />
          Data contoh · HFpEF
        </button>
        <button className="alt-btn" onClick={() => a.loadSample('hfref')} disabled={a.running}>
          <span className="h-[9px] w-[9px] rounded-[3px] bg-[#E0502E]" />
          Data contoh · HFrEF
        </button>
        <button
          className="alt-btn"
          onClick={() => {
            const kind = Math.random() < 0.5 ? 'hfpEF' : 'hfref'
            void downloadSampleCsv(kind, a.toast)
          }}
          disabled={a.running}
        >
          <DownloadIcon className="h-[15px] w-[15px]" />
          Unduh contoh .csv
        </button>
      </div>

      {a.dataset && (
        <div className="mt-[18px]">
          <div className="mb-[14px] flex items-center gap-3 rounded-xl border border-[rgba(14,31,25,0.12)] bg-[rgba(14,31,25,0.03)] p-3">
            <div className="grid h-[38px] w-[38px] flex-shrink-0 place-items-center rounded-[10px] bg-[rgba(11,138,99,0.08)]">
              <FileIcon className="h-[18px] w-[18px] stroke-[#0B8A63]" />
            </div>
            <div className="min-w-0">
              <b className="block max-w-[340px] truncate text-[13px]">{a.dataset.name}</b>
              <span className="text-[11.5px] text-[#54655D]">{dataMeta}</span>
            </div>
            <button className="btn btn-ghost btn-sm ml-auto" onClick={a.clearData}>
              Ganti
            </button>
          </div>

          {/* Spesifikasi Pra-pemrosesan Otomatis */}
          <div className="mb-4 rounded-xl border border-[rgba(11,138,99,0.2)] bg-[rgba(11,138,99,0.04)] p-3.5 text-[12px]">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold text-[#0B8A63] flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#0B8A63]" />
                Pra-pemrosesan AI Terkonfigurasi Otomatis
              </span>
              <span className="rounded-md bg-[rgba(11,138,99,0.12)] px-2 py-0.5 text-[10.5px] font-semibold text-[#0B8A63]">
                {a.fs} Hz · {a.unitNote}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 pt-2 border-t border-[rgba(11,138,99,0.12)] text-[#3E5047]">
              <div>
                <b className="text-[#0E1F19] text-[11.5px] block">Tahap 1: HF Detection</b>
                <p className="text-[11px] text-[#54655D] mt-0.5 leading-relaxed">
                  Lead II, V2, V5 · 100 Hz (10s) · Z-score + CWT Morlet (31 skala) → 224×224
                </p>
              </div>
              <div>
                <b className="text-[#0E1F19] text-[11.5px] block">Tahap 2: EchoNext (HFpEF vs HFrEF)</b>
                <p className="text-[11px] text-[#54655D] mt-0.5 leading-relaxed">
                  Lead I, II, aVL · 125 Hz (10s) · CWT Morlet (48 skala) → 160×160
                </p>
              </div>
            </div>
          </div>

           <button className="btn btn-primary w-full" onClick={a.runAnalysis} disabled={a.running}>
             <PlayIcon className="h-4 w-4" />
             {a.running ? 'Memproses Inferensi...' : a.lastEntry ? 'Jalankan Ulang Analisis' : 'Jalankan Analisis AI'}
           </button>
        </div>
      )}
    </Card>
  )
}

interface SignalSectionProps {
  a: UseAnalysisReturn
}

function SignalSection({ a }: SignalSectionProps) {
  const rawTag = a.raw ? `${toLocaleId(a.raw.length)} sampel · ${a.fsUsed} Hz` : 'menunggu data'
  const preTag = a.pre ? `${a.peaksIdx.length} kompleks · HR≈${a.hr} bpm` : 'menunggu tahap 2'
  return (
    <Card title="2 · Sinyal EKG" hint="kertas 25 mm/s · 1 mV">
      <div className="chart-label">
        <span className="h-2 w-2 rounded-full bg-[#0B8A63]" /> Sinyal mentah
        <span className="tag">{rawTag}</span>
      </div>
      <SignalCanvas data={a.raw} fs={a.fsUsed} color="#0B8A63" emptyMsg="menunggu data EKG…" />
      <div className="chart-label mt-[15px]">
        <span className="h-2 w-2 rounded-full bg-[#2EE6A8]" /> Hasil preprocessing
        <span className="tag">{preTag}</span>
      </div>
      <SignalCanvas data={a.pre} fs={a.fsUsed} color="#2EE6A8" peaks={a.peaksIdx} emptyMsg="menunggu tahap preprocessing…" />
    </Card>
  )
}

interface ScalogramSectionProps {
  a: UseAnalysisReturn
}

function ScalogramSection({ a }: ScalogramSectionProps) {
  return (
    <Card title="3 · Scalogram CWT" hint="input jaringan CNN">
      <ScalogramCanvas
        scal={a.scal}
        colormap={a.colormap}
        gradcam={a.gradcam}
        peaksTime={a.peaksTime}
        klas={a.klas}
        pre={a.pre}
        cam={a.cam}
        emptyMsg="menunggu transformasi CWT…"
        canvasRef={a.scalCanvasRef}
      />
      <div className="mt-[14px] flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-[12.5px] font-semibold text-[#54655D]">
          Peta warna
          <select value={a.colormap} onChange={(e) => a.setColormap(e.target.value)} className="min-w-[110px]">
            <option value="inferno">Inferno</option>
            <option value="plasma">Plasma</option>
            <option value="viridis">Viridis</option>
            <option value="jet">Jet</option>
          </select>
        </label>
        <label className="switch">
           <input type="checkbox" checked={a.gradcam} disabled />
          <span className="tr" />
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-semibold text-[#54655D]">
           Overlay Grad-CAM (segera hadir)
        </label>
      </div>
      {a.scal && (
        <div className="mt-3 font-mono text-[11px] font-medium text-[#7FA394]">
          Wavelet Morlet · {a.scal.ns} skala · {a.scal.T} sampel · sampling CWT {a.scal.fs} Hz
        </div>
      )}
    </Card>
  )
}

function PipelineCard() {
  const rows = [
    {
      n: '1',
      bg: 'rgba(11, 138, 99, 0.08)',
      color: '#0B8A63',
      b: 'Upload Data',
      p: 'File CSV 12 lead · deteksi delimiter & header otomatis.',
    },
    {
      n: '2',
      bg: 'rgba(124, 58, 237, 0.08)',
      color: '#7c3aed',
      b: 'Preprocessing (HF Detection)',
      p: 'Resampling 100 Hz, z-score, CWT Morlet, min-max. Lead: prioritas klinis (II/V2/V5 → I/II/III → V1/V2/V3 → V4/V5/V6).',
    },
    {
      n: '3',
      bg: 'rgba(224, 80, 46, 0.1)',
      color: '#E0502E',
      b: 'Inferensi HF Detection',
      p: 'HF Detection CNN — deteksi apakah pasien memiliki Heart Failure.',
    },
    {
      n: '4',
      bg: 'rgba(231, 166, 58, 0.12)',
      color: '#E7A63A',
      b: 'Preprocessing (EchoNext)',
      p: 'Resampling 250 Hz, median filter, clip, z-score, CWT mexh, 3 lead.',
    },
    {
      n: '5',
      bg: 'rgba(46, 230, 168, 0.1)',
      color: '#2EE6A8',
      b: 'Inferensi EchoNext',
      p: 'EchoNext CNN — klasifikasi HFpEF vs HFrEF (jika HF terdeteksi).',
    },
  ]
  return (
    <Card title="Tahapan Pipeline" hint="cascaded 2-stage">
      <div className="flex flex-col">
        {rows.map((r, i) => (
          <div key={r.n} className="relative flex gap-[11px] py-[11px]">
            {i < rows.length - 1 && <span className="absolute top-10 bottom-[-3px] left-[13px] w-[2px] bg-[rgba(14,31,25,0.12)]" />}
            <div
              className="z-10 grid h-[28px] w-[28px] flex-shrink-0 place-items-center rounded-[9px] font-display text-xs font-bold"
              style={{ background: r.bg, color: r.color }}
            >
              {r.n}
            </div>
            <div>
              <b className="block text-[12.5px]">{r.b}</b>
              <p className="mt-[2px] text-[11.5px] leading-[1.5] text-[#54655D]">{r.p}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

interface AnalisisViewProps {
  a: UseAnalysisReturn
  stats: {
    p: number
    f: number
    total: number
    avg: string
  }
  onOpenModal: (entry: ReportEntry | null) => void
}

export default function AnalisisView({ a, stats }: AnalisisViewProps) {
  return (
    <>
      <div className="page-head mb-[22px]">
        <span className="kicker reveal in" style={{ '--d': '0s' } as React.CSSProperties}>04 · Analisis EKG</span>
        <h1 className="mt-3 font-display text-[clamp(1.8rem,4vw,2.6rem)] tracking-[-.4px]">Analisis EKG</h1>
        <p className="mt-1.5 max-w-[720px] text-[13.5px] leading-[1.6] text-[#54655D]">
           Unggah rekaman EKG 12 lead untuk menampilkan sinyal dan pengukuran dasar. Fitur inferensi{' '}
           <b className="font-semibold text-[#0E1F19]">HF Detection</b> dan{' '}
           <b className="font-semibold text-[#0E1F19]">EchoNext CNN</b> hanya ditampilkan sebagai rancangan UI dan tidak dijalankan.
        </p>
      </div>

      <StatStrip stats={stats} />

      <Steps steps={a.steps} progress={a.progress} stage={a.stage} />

      <div className="grid grid-cols-[1.55fr_1fr] items-start gap-4 max-[980px]:grid-cols-1">
        <div className="flex min-w-0 flex-col gap-4">
          <UploadCard a={a} />
          <SignalSection a={{ ...a, hr: a.hr }} />
          <ScalogramSection a={a} />
        </div>
        <div className="sticky top-[86px] flex flex-col gap-4 max-[980px]:static">
          <ResultPanel a={a} />
          <PipelineCard />
        </div>
      </div>
    </>
  )
}
