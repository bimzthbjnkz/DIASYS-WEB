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
    const used = Math.min(col.length, Math.floor(12 * a.fs))
    const extra = col.length > used ? ' · diambil 12 s pertama' : ''
    return `${a.dataset.cols.length} kanal · ${toLocaleId(col.length)} sampel · ±${(col.length / a.fs).toFixed(1)} s${extra} · ${a.dataset.note}`
  })()

  return (
    <Card title="1 · Sumber Data EKG" hint="maks. 12 detik diproses">
      <div
        className={`rounded-[14px] border-[1.5px] border-dashed p-[30px_18px] text-center transition-colors duration-200 ${
          dragging.current
            ? 'border-primary bg-primary-soft'
            : 'border-line2 bg-[#fafbfe] hover:border-primary hover:bg-primary-soft'
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
        <div className="mx-auto mb-[11px] grid h-[46px] w-[46px] place-items-center rounded-[13px] bg-primary-soft">
          <UploadIcon className="h-[22px] w-[22px] stroke-primary" />
        </div>
        <b className="block text-[14px]">Seret &amp; letakkan file EKG, atau klik untuk memilih</b>
        <span className="mt-1.5 block text-xs leading-[1.55] text-muted">
          Kolom numerik dideteksi otomatis · multi-lead didukung · skala unit (mV / µV / ADC) dikalibrasi otomatis
        </span>
        <div className="mt-3 flex flex-wrap justify-center gap-[7px]">
          {['.csv', '.txt', '.dat (MIT-BIH 212)', 'delimiter auto'].map((f) => (
            <span key={f} className="rounded-[7px] border border-line bg-white px-[9px] py-1 font-mono text-[10.5px] font-semibold text-muted">
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
          <span className="h-[9px] w-[9px] rounded-[3px] bg-amber" />
          Data contoh · HFpEF
        </button>
        <button className="alt-btn" onClick={() => a.loadSample('hfref')} disabled={a.running}>
          <span className="h-[9px] w-[9px] rounded-[3px] bg-rose" />
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
        </button>      </div>

      {a.dataset && (
        <div className="mt-[18px]">
          <div className="mb-[14px] flex items-center gap-3 rounded-xl border border-line bg-[#fafbfe] p-3">
            <div className="grid h-[38px] w-[38px] flex-shrink-0 place-items-center rounded-[10px] bg-primary-soft">
              <FileIcon className="h-[18px] w-[18px] stroke-primary" />
            </div>
            <div className="min-w-0">
              <b className="block max-w-[340px] truncate text-[13px]">{a.dataset.name}</b>
              <span className="text-[11.5px] text-muted">{dataMeta}</span>
            </div>
            <button className="btn btn-ghost btn-sm ml-auto" onClick={a.clearData}>
              Ganti
            </button>
          </div>

          <div className="mb-4 flex flex-wrap items-end gap-[14px]">
            <label className="field">
              <span>Sampling rate</span>
              <select
                value={a.fs}
                onChange={(e) => a.setFs(Number(e.target.value))}
                disabled={a.running || (a.dataset && a.dataset.kind !== 'upload')}
              >
                {FSS_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            {a.leadOptions.length > 1 && (
              <label className="field">
                <span>Lead / kanal</span>
                <select value={a.lead} onChange={(e) => a.setLead(Number(e.target.value))} disabled={a.running}>
                  {a.leadOptions.map((o) => (
                    <option key={o.i} value={o.i}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field">
              <span>Kalibrasi unit</span>
              <span className="unit-pill">{a.unitNote}</span>
            </label>
          </div>

          <button className="btn btn-primary w-full" onClick={a.runAnalysis} disabled={a.running}>
            <PlayIcon className="h-4 w-4" />
            {a.running ? 'Memproses…' : a.lastEntry ? 'Jalankan Ulang' : 'Jalankan Analisis'}
          </button>
        </div>
      )}
    </Card>
  )
}

const FSS_OPTIONS = [128, 200, 250, 256, 360, 500]

interface SignalSectionProps {
  a: UseAnalysisReturn
}

function SignalSection({ a }: SignalSectionProps) {
  const rawTag = a.raw ? `${toLocaleId(a.raw.length)} sampel · ${a.fsUsed} Hz` : 'menunggu data'
  const preTag = a.pre ? `${a.peaksIdx.length} kompleks · HR≈${a.hr} bpm` : 'menunggu tahap 2'
  return (
    <Card title="2 · Sinyal EKG" hint="kertas 25 mm/s · 1 mV">
      <div className="chart-label">
        <span className="h-2 w-2 rounded-full bg-primary" /> Sinyal mentah
        <span className="tag">{rawTag}</span>
      </div>
      <SignalCanvas data={a.raw} fs={a.fsUsed} color="#4f46e5" emptyMsg="menunggu data EKG…" />
      <div className="chart-label mt-[15px]">
        <span className="h-2 w-2 rounded-full bg-teal" /> Hasil preprocessing
        <span className="tag">{preTag}</span>
      </div>
      <SignalCanvas data={a.pre} fs={a.fsUsed} color="#0d9488" peaks={a.peaksIdx} emptyMsg="menunggu tahap preprocessing…" />
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
        emptyMsg="menunggu transformasi CWT…"
        canvasRef={a.scalCanvasRef}
      />
      <div className="mt-[14px] flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-[12.5px] font-semibold text-muted">
          Peta warna
          <select value={a.colormap} onChange={(e) => a.setColormap(e.target.value)} className="min-w-[110px]">
            <option value="inferno">Inferno</option>
            <option value="plasma">Plasma</option>
            <option value="viridis">Viridis</option>
            <option value="jet">Jet</option>
          </select>
        </label>
        <label className="switch">
          <input type="checkbox" checked={a.gradcam} onChange={(e) => a.setGradcam(e.target.checked)} />
          <span className="tr" />
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-semibold text-muted">
          Overlay Grad-CAM
        </label>
      </div>
      <div className="mt-3 font-mono text-[11px] font-medium text-dim">
        Wavelet Morlet ω₀=6 · 56 skala · pita ≈1–121 Hz
      </div>
    </Card>
  )
}

function PipelineCard() {
  const rows = [
    {
      n: '1',
      cls: 'bg-primary-soft text-primary',
      b: 'Preprocessing',
      p: 'Detrending baseline, bandpass 0,5–40 Hz, notch 50 Hz, kalibrasi unit otomatis.',
    },
    {
      n: '2',
      cls: 'bg-[#f1ecfe] text-[#7c3aed]',
      b: 'Transformasi CWT',
      p: 'Wavelet Morlet ω₀=6 · 56 skala → scalogram waktu–frekuensi.',
    },
    {
      n: '3',
      cls: 'bg-amber-soft text-amber',
      b: 'Inferensi CNN',
      p: 'KardioNet v2.3 — 4 blok konvolusional, softmax 2 kelas + Grad-CAM.',
    },
    {
      n: '4',
      cls: 'bg-green-soft text-green',
      b: 'Hasil & Laporan',
      p: 'Kelas, konfidensi, pengukuran sinyal, dan laporan siap unduh.',
    },
  ]
  return (
    <Card title="Tahapan Pipeline" hint="urutan proses">
      <div className="flex flex-col">
        {rows.map((r, i) => (
          <div key={r.n} className="relative flex gap-[11px] py-[11px]">
            {i < rows.length - 1 && <span className="absolute top-10 bottom-[-3px] left-[13px] w-[2px] bg-line" />}
            <div className={`z-10 grid h-[28px] w-[28px] flex-shrink-0 place-items-center rounded-[9px] font-display text-xs font-bold ${r.cls}`}>
              {r.n}
            </div>
            <div>
              <b className="block text-[12.5px]">{r.b}</b>
              <p className="mt-[2px] text-[11.5px] leading-[1.5] text-muted">{r.p}</p>
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
        <h1 className="font-display text-[25px] tracking-[-.4px]">Analisis EKG</h1>
        <p className="mt-1.5 max-w-[720px] text-[13.5px] leading-[1.6] text-muted">
          Unggah rekaman EKG pasien — sistem melakukan <b className="font-semibold text-ink">preprocessing</b>, transformasi{' '}
          <b className="font-semibold text-ink">Continuous Wavelet Transform</b> menjadi scalogram, lalu inferensi{' '}
          <b className="font-semibold text-ink">CNN</b> untuk membedakan HFpEF dan HFrEF.
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
