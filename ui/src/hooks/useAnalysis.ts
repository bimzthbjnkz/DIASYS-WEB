import { useCallback, useMemo, useRef, useState } from 'react'
import { sleep } from '../lib/format'
import {
  absPercentile,
  bestLead,
  decode212,
  detectPeaks,
  getSignal,
  measure,
  parseDelimited,
  preprocess,
  synthECG,
} from '../lib/ecg'
import type { Dataset, MeasureResult, PeakResult, ScalResult } from '../lib/ecg'
import type { ReportEntry } from '../lib/report'
import { captureScalogramThumb } from '../lib/draw'
import { cwtScales } from '../lib/cwtMexh'
import { buildModelInput, MODEL_FS, MODEL_N, MODEL_SCALES } from '../lib/modelInput'
import type { ModelInput } from '../lib/modelInput'
import { computeGradCam, predictModel } from '../lib/model'

interface UseAnalysisParams {
  toast: (msg: string, type?: string) => void
  onNewEntry?: (entry: ReportEntry) => void
}

interface LeadOption {
  i: number
  label: string
}

export interface UseAnalysisReturn {
  toast: (msg: string, type?: string) => void
  dataset: Dataset | null
  fs: number
  setFs: (fs: number) => void
  lead: number
  setLead: (lead: number) => void
  running: boolean
  raw: Float32Array | null
  pre: Float32Array | null
  fsUsed: number
  hr: number
  peaksIdx: number[]
  peaksTime: number[]
  scal: ScalResult | null
  cam: Float32Array | null
  klas: string | null
  lastEntry: ReportEntry | null
  colormap: string
  setColormap: (c: string) => void
  gradcam: boolean
  setGradcam: (g: boolean) => void
  steps: string[]
  progress: number
  stage: string
  unitNote: string
  leadOptions: LeadOption[]
  scalCanvasRef: React.RefObject<HTMLCanvasElement | null>
  finishDataset: (
    name: string,
    cols: Float32Array[],
    names: string[],
    defaultFs: number,
    note: string,
    kind?: string
  ) => void
  loadFile: (file: File) => Promise<void>
  loadSample: (kind: string) => void
  clearData: () => void
  runAnalysis: () => Promise<void>
  markStep: (i: number, st: string) => void
}

function scalFromMexh(mag: Float32Array, fs: number): ScalResult {
  const smp = Float32Array.from(mag)
  smp.sort()
  const p99 = smp[Math.floor(smp.length * 0.99)] || 1
  return {
    mag,
    scales: cwtScales(),
    T: MODEL_N,
    ns: MODEL_SCALES,
    fs,
    p99,
    a0: 1,
    ratio: 1,
    mode: 'mexh',
  }
}

export function useAnalysis({ toast, onNewEntry }: UseAnalysisParams): UseAnalysisReturn {
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [fs, setFs] = useState(250)
  const [lead, setLead] = useState(0)
  const [running, setRunning] = useState(false)

  const [raw, setRaw] = useState<Float32Array | null>(null)
  const [pre, setPre] = useState<Float32Array | null>(null)
  const [fsUsed, setFsUsed] = useState(250)
  const [hr, setHr] = useState(0)
  const [peaksIdx, setPeaksIdx] = useState<number[]>([])
  const [peaksTime, setPeaksTime] = useState<number[]>([])
  const [scal, setScal] = useState<ScalResult | null>(null)
  const [cam, setCam] = useState<Float32Array | null>(null)
  const [klas, setKlas] = useState<string | null>(null)
  const [lastEntry, setLastEntry] = useState<ReportEntry | null>(null)
  const [colormap, setColormap] = useState('inferno')
  const [gradcam, setGradcam] = useState(false)

  const [steps, setSteps] = useState<string[]>(['', '', '', ''])
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState('siap · menunggu data')

  const scalCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const runRef = useRef(false)
  const seqRef = useRef(5013)
  const modelTensorRef = useRef<Float32Array | null>(null)
  const runningRef = useRef(false)

  const markStep = useCallback((i: number, st: string) => {
    setSteps((prev) => {
      const next = [...prev]
      next[i] = st
      return next
    })
  }, [])

  const resetRunUI = useCallback(
    (keepDone: boolean, hasData = !!dataset) => {
      setSteps((prev) => {
        const next = [...prev]
        for (let i = 1; i < 4; i++) next[i] = ''
        if (!keepDone) next[0] = hasData ? 'done' : ''
        return next
      })
      setProgress(hasData ? 8 : 0)
      setScal(null)
      setCam(null)
      modelTensorRef.current = null
      setKlas(null)
      setPeaksIdx([])
      setPeaksTime([])
      setStage(hasData ? 'data siap · klik Jalankan Analisis' : 'siap · menunggu data')
    },
    [dataset],
  )

  const unitNote = useMemo(() => {
    if (!dataset) return 'mV'
    const col = dataset.cols[lead]
    const ap = absPercentile(col, 0.98)
    if (ap > 1000) return 'µV → mV (×0,001)'
    if (ap > 60) return 'ADC gain 200 → mV'
    return 'mV (langsung)'
  }, [dataset, lead])

  const leadOptions = useMemo(() => {
    if (!dataset) return []
    return dataset.cols.map((c, i) => ({
      i,
      label: `${dataset.names[i]} · ${(c.length / 1000).toFixed(1)}k sampel`,
    }))
  }, [dataset])

  const finishDataset = useCallback(
    (
      name: string,
      cols: Float32Array[],
      names: string[],
      defaultFs: number,
      note: string,
      kind = 'upload'
    ) => {
      setDataset({ name, cols, names, kind, note })
      setFs(defaultFs)
      const ls = cols.length > 1 ? bestLead(cols) : 0
      setLead(ls)
      markStep(0, 'done')
      setProgress(8)
      setStage('data siap · tahap 1 selesai')
      setRunning(false)
      resetRunUI(false, true)
      toast('File berhasil dimuat. Atur parameter lalu jalankan analisis.', 'success')
    },
    [markStep, resetRunUI, toast],
  )

  const loadFile = useCallback(
    async (file: File) => {
      const name = file.name
      const lower = name.toLowerCase()
      toast(`Membaca file "${name}"…`, 'info')
      try {
        if (lower.endsWith('.dat')) {
          const buf = await file.arrayBuffer()
          const head = new TextDecoder('utf-8').decode(buf.slice(0, 600))
          let printable = 0
          for (const ch of head) {
            const c = ch.charCodeAt(0)
            if (c === 9 || c === 10 || c === 13 || (c >= 32 && c < 127)) printable++
          }
          if (printable / Math.max(head.length, 1) > 0.9) {
            const p = parseDelimited(new TextDecoder('utf-8').decode(buf))
            if (p) return finishDataset(name, p.cols, p.names, 250, 'data teks')
          }
          if (buf.byteLength % 3 === 0 && buf.byteLength >= 300) {
            const [ch0, ch1] = decode212(buf)
            return finishDataset(name, [ch0, ch1], ['Lead I', 'Lead II'], 360, 'MIT-BIH format 212 · gain≈200 ADC/mV')
          }
          toast('Format .dat tidak dikenali (bukan 212 / teks).', 'warn')
          return
        }
        const text = await file.text()
        const p = parseDelimited(text)
        if (!p) {
          toast('Tidak ditemukan data numerik pada file.', 'warn')
          return
        }
        finishDataset(name, p.cols, p.names, 250, 'delimiter & header otomatis')
      } catch (err) {
        toast('Gagal membaca file: ' + (err instanceof Error ? err.message : String(err)), 'warn')
      }
    },
    [finishDataset, toast],
  )

  const loadSample = useCallback(
    (kind: string) => {
      if (runningRef.current) return toast('Tunggu analisis selesai.', 'warn')
      const sig = synthECG(kind)
      setDataset({
        name: kind === 'hfpEF' ? 'Contoh — Simulasi HFpEF' : 'Contoh — Simulasi HFrEF',
        cols: [sig],
        names: ['Lead II'],
        kind,
        note: 'data contoh tersintesis',
      })
      setFs(250)
      setLead(0)
      markStep(0, 'done')
      setProgress(8)
      setStage('data siap · tahap 1 selesai')
      setRunning(false)
      resetRunUI(false, true)
      toast('Data contoh dimuat. Klik "Jalankan Analisis".', 'success')
    },
    [markStep, resetRunUI, runningRef, toast],
  )

  const clearData = useCallback(() => {
    setDataset(null)
    setRaw(null)
    setPre(null)
    setScal(null)
    setCam(null)
    modelTensorRef.current = null
    setKlas(null)
    setPeaksIdx([])
    setPeaksTime([])
    setSteps(['', '', '', ''])
    setProgress(0)
    setStage('siap · menunggu data')
    setRunning(false)
  }, [])

  /* Hapus hasil lama jika lead / sampling rate berubah. */
  const staleResults = useCallback(() => {
    setScal(null)
    setCam(null)
    modelTensorRef.current = null
    setKlas(null)
  }, [])

  const setLeadSafe = useCallback(
    (l: number) => {
      setLead(l)
      staleResults()
    },
    [staleResults],
  )

  const setFsSafe = useCallback(
    (f: number) => {
      setFs(f)
      staleResults()
    },
    [staleResults],
  )

  const setGradcamSafe = useCallback(
    (g: boolean) => {
      setGradcam(g)
      if (g && modelTensorRef.current) {
        computeGradCam(modelTensorRef.current)
          .then(setCam)
          .catch(() => setCam(null))
      } else if (!g) {
        setCam(null)
      }
    },
    [],
  )

  const runAnalysis = useCallback(async () => {
    if (runningRef.current) return
    if (!dataset) {
      toast('Unggah atau muat data EKG terlebih dahulu.', 'warn')
      return
    }
    runRef.current = true
    runningRef.current = true
    setRunning(true)
    resetRunUI(false)

    const ds = dataset
    const { raw: rawSig, fs: rfs } = getSignal(dataset, fs, lead)
    setRaw(rawSig)
    setFsUsed(rfs)

    /* Tahap 2 — Preprocessing */
    markStep(1, 'active')
    setProgress(12)
    setStage('tahap 2/4 · preprocessing sinyal')
    await sleep(260)
    setProgress(16)
    await sleep(240)
    const y = preprocess(rawSig, rfs)
    const det: PeakResult = detectPeaks(y, rfs)
    const peaks = det.idx
    setPeaksIdx(peaks)
    setPeaksTime(peaks.map((i) => i / rfs))
    setPre(y)
    const m: MeasureResult = measure(det.yy, rfs, peaks)
    const hr =
      peaks.length > 1
        ? Math.round((60 * (peaks.length - 1)) / ((peaks[peaks.length - 1] - peaks[0]) / rfs))
        : 0
    setHr(hr)
    await sleep(200)
    setProgress(22)
    markStep(1, 'done')

    /* Tahap 3 — CWT mexh (input model, 3 lead) */
    markStep(2, 'active')
    setStage('tahap 3/4 · transformasi CWT mexh')
    setProgress(26)
    await sleep(120)
    const mi: ModelInput = buildModelInput(ds, fs, lead)
    modelTensorRef.current = mi.tensor
    setScal(scalFromMexh(mi.channels[mi.displayIdx].mag, MODEL_FS))
    setProgress(46)
    await sleep(120)
    markStep(2, 'done')

    /* Tahap 4 — CNN */
    markStep(3, 'active')
    setProgress(52)
    setStage('tahap 4/4 · memuat model CNN…')
    await sleep(100)
    try {
      setProgress(64)
      setStage('tahap 4/4 · inferensi CNN…')
      const res = await predictModel(mi.tensor)
      const probs: number[] = [res.pHFpEF, res.pHFrEF]
      const klas2 = res.pHFpEF >= 0.5 ? 'HFpEF' : 'HFrEF'
      setKlas(klas2)

      if (gradcam) {
        setStage('tahap 4/4 · menghitung Grad-CAM…')
        computeGradCam(mi.tensor)
          .then(setCam)
          .catch(() => setCam(null))
      }

      const thumb = captureScalogramThumb(
        scalFromMexh(mi.channels[mi.displayIdx].mag, MODEL_FS),
        y,
        peaks.map((i) => i / rfs),
        klas2,
      )

      const entry: ReportEntry = {
        id: 'CW-' + seqRef.current++,
        ts: Date.now(),
        src: ds.name,
        klas: klas2,
        conf: Math.max(probs[0], probs[1]),
        probs,
        stats: { hr, amp: m.amp, qrsW: m.qrsW, sdnn: m.sdnn },
        thumb,
      }
      setLastEntry(entry)
      onNewEntry?.(entry)
      setProgress(100)
      setStage('selesai · ' + klas2 + ' (' + (Math.max(probs[0], probs[1]) * 100).toFixed(1).replace('.', ',') + '%)')
      markStep(3, 'done')
      toast(`Analisis selesai — ${klas2} (${(Math.max(probs[0], probs[1]) * 100).toFixed(1).replace('.', ',')}%)`, 'success')
    } catch (err) {
      setKlas(null)
      markStep(3, '')
      setProgress(46)
      setStage('gagal · model tidak dapat dipanggil')
      toast('Gagal menjalankan model CNN: ' + (err instanceof Error ? err.message : String(err)), 'warn')
    } finally {
      runRef.current = false
      runningRef.current = false
      setRunning(false)
    }
  }, [dataset, fs, lead, gradcam, markStep, onNewEntry, resetRunUI, runningRef, toast])

  return {
    toast,
    dataset,
    fs,
    setFs: setFsSafe,
    lead,
    setLead: setLeadSafe,
    running,
    raw,
    pre,
    fsUsed,
    hr,
    peaksIdx,
    peaksTime,
    scal,
    cam,
    klas,
    lastEntry,
    colormap,
    setColormap,
    gradcam,
    setGradcam: setGradcamSafe,
    steps,
    progress,
    stage,
    unitNote,
    leadOptions,
    scalCanvasRef,
    finishDataset,
    loadFile,
    loadSample,
    clearData,
    runAnalysis,
    markStep,
  }
}
