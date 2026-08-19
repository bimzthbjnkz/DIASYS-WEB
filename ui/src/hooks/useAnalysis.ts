import { useCallback, useMemo, useRef, useState } from 'react'
import {
  absPercentile,
  bestLead,
  decode212,
  detectPeaks,
  getSignal,
  measure,
  parseDelimited,
  preprocess,
} from '../lib/ecg'
import type { Dataset, ScalResult } from '../lib/ecg'
import { synthECG } from '../lib/ecg'
import type { ReportEntry } from '../lib/report'
import { captureScalogramThumb } from '../lib/draw'
import { inferECG } from '../lib/inferenceWorkerClient'

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
  finishDataset: (name: string, cols: Float32Array[], names: string[], defaultFs: number, note: string, kind?: string) => void
  loadFile: (file: File) => Promise<void>
  loadSample: (kind: string) => void
  clearData: () => void
  runAnalysis: () => Promise<void>
  markStep: (i: number, st: string) => void
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
  const [steps, setSteps] = useState<string[]>(['', '', '', '', ''])
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState('siap · menunggu data')
  const scalCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const runningRef = useRef(false)

  const markStep = useCallback((i: number, st: string) => {
    setSteps((prev) => {
      const next = [...prev]
      next[i] = st
      return next
    })
  }, [])

  const unitNote = useMemo(() => {
    if (!dataset) return 'mV'
    const ap = absPercentile(dataset.cols[lead], 0.98)
    if (ap > 1000) return 'µV → mV (×0,001)'
    if (ap > 60) return 'ADC gain 200 → mV'
    return 'mV (langsung)'
  }, [dataset, lead])

  const leadOptions = useMemo(() => dataset
    ? dataset.cols.map((c, i) => ({ i, label: `${dataset.names[i]} · ${(c.length / 1000).toFixed(1)}k sampel` }))
    : [], [dataset])

  const finishDataset = useCallback((name: string, cols: Float32Array[], names: string[], defaultFs: number, note: string, kind = 'upload') => {
    setDataset({ name, cols, names, kind, note })
    setFs(defaultFs)
    setLead(cols.length > 1 ? bestLead(cols) : 0)
    setSteps(['done', '', '', '', ''])
    setProgress(8)
    setStage('data siap · halaman UI aktif')
    setRunning(false)
    toast('File berhasil dimuat. Sistem ML telah dinonaktifkan; data hanya ditampilkan sebagai UI.', 'info')
  }, [toast])

  const loadFile = useCallback(async (file: File) => {
    toast(`Membaca file "${file.name}"…`, 'info')
    try {
      const lower = file.name.toLowerCase()
      if (lower.endsWith('.dat')) {
        const buf = await file.arrayBuffer()
        const head = new TextDecoder().decode(buf.slice(0, 600))
        const printable = [...head].filter((ch) => {
          const c = ch.charCodeAt(0)
          return c === 9 || c === 10 || c === 13 || (c >= 32 && c < 127)
        }).length
        if (printable / Math.max(head.length, 1) > 0.9) {
          const p = parseDelimited(new TextDecoder().decode(buf))
          if (p) return finishDataset(file.name, p.cols, p.names, 250, 'data teks')
        }
        if (buf.byteLength % 3 === 0 && buf.byteLength >= 300) {
          const [ch0, ch1] = decode212(buf)
          return finishDataset(file.name, [ch0, ch1], ['Lead I', 'Lead II'], 360, 'MIT-BIH format 212')
        }
        toast('Format .dat tidak dikenali.', 'warn')
        return
      }
      const p = parseDelimited(await file.text())
      if (!p) return toast('Tidak ditemukan data numerik pada file.', 'warn')
      finishDataset(file.name, p.cols, p.names, 250, 'delimiter & header otomatis')
    } catch (err) {
      toast('Gagal membaca file: ' + (err instanceof Error ? err.message : String(err)), 'warn')
    }
  }, [finishDataset, toast])

  const loadSample = useCallback((kind: string) => {
    if (runningRef.current) return
    finishDataset(
      kind === 'hfpEF' ? 'Contoh — Simulasi HFpEF' : 'Contoh — Simulasi HFrEF',
      [synthECG(kind)], ['Lead II'], 250, 'data contoh tersintesis', kind,
    )
  }, [finishDataset])

  const clearData = useCallback(() => {
    setDataset(null)
    setRaw(null)
    setPre(null)
    setScal(null)
    setCam(null)
    setKlas(null)
    setLastEntry(null)
    setPeaksIdx([])
    setPeaksTime([])
    setHr(0)
    setSteps(['', '', '', '', ''])
    setProgress(0)
    setStage('siap · menunggu data')
  }, [])

  const setLeadSafe = useCallback((value: number) => {
    setLead(value)
    setRaw(null)
    setPre(null)
    setScal(null)
    setCam(null)
    setKlas(null)
  }, [])

  const runAnalysis = useCallback(async () => {
    if (runningRef.current) return
    if (!dataset) return toast('Unggah atau muat data EKG terlebih dahulu.', 'warn')
    runningRef.current = true
    setRunning(true)
    try {
      const { raw: signal, fs: signalFs } = getSignal(dataset, fs, lead)
      const filtered = preprocess(signal, signalFs)
      const peaks = detectPeaks(filtered, signalFs)
      const stats = measure(peaks.yy, signalFs, peaks.idx)
      const heartRate = peaks.idx.length > 1
        ? Math.round((60 * (peaks.idx.length - 1)) / ((peaks.idx[peaks.idx.length - 1] - peaks.idx[0]) / signalFs))
        : 0
      setRaw(signal)
      setFsUsed(signalFs)
      setPre(filtered)
      setPeaksIdx(peaks.idx)
      setPeaksTime(peaks.idx.map((i) => i / signalFs))
      setHr(heartRate)
      setCam(null)
      setSteps(['done', 'active', '', '', ''])
      setStage('tahap 2/5 · preprocessing & inferensi HF Detection')
      const result = await inferECG(dataset.cols, dataset.names, fs, (value, nextStage) => {
        setProgress(value)
        setStage(nextStage)
        if (value >= 60) setSteps(['done', 'done', 'active', '', ''])
        if (value >= 82) setSteps(['done', 'done', 'done', 'done', 'active'])
      })
      setScal(result.scalogram)
      const hf = { isHF: result.hfProbability >= 0.5, pHF: result.hfProbability, pNonHF: 1 - result.hfProbability }
      const isHF = hf.isHF
      const stage2Klas = isHF ? (result.stage2Probability! >= 0.5 ? 'HFpEF' : 'HFrEF') : null
      const stage2Conf = isHF ? Math.max(result.stage2Probability!, 1 - result.stage2Probability!) : null
      const klas = stage2Klas ?? (isHF ? 'Heart Failure' : 'Non-HF')
      setKlas(klas)
      const probabilities = isHF
        ? [result.stage2Probability!, 1 - result.stage2Probability!]
        : [hf.pNonHF, hf.pHF]
      const entry: ReportEntry = {
        id: 'CW-' + Date.now().toString(36).toUpperCase(),
        ts: Date.now(),
        src: dataset.name,
        klas,
        conf: isHF ? stage2Conf! : Math.max(hf.pHF, hf.pNonHF),
        probs: probabilities,
        stats: { hr: heartRate, amp: stats.amp, qrsW: stats.qrsW, sdnn: stats.sdnn },
        thumb: captureScalogramThumb(result.scalogram, filtered, peaks.idx.map((i) => i / signalFs), klas),
        hfDetectResult: hf,
        stage2Klas,
        stage2Conf,
      }
      setLastEntry(entry)
      onNewEntry?.(entry)
      setProgress(100)
      setSteps(isHF ? ['done', 'done', 'done', 'done', 'done'] : ['done', 'done', 'done', 'skip', 'skip'])
      setStage(isHF ? `selesai · HF → ${stage2Klas}` : `selesai · Non-HF (${(hf.pNonHF * 100).toFixed(1)}%)`)
      toast(`Analisis selesai — ${klas}.`, 'success')
    } catch (error) {
      setStage('gagal · inferensi tidak dapat diselesaikan')
      toast('Gagal menjalankan analisis: ' + (error instanceof Error ? error.message : String(error)), 'warn')
    } finally {
      setRunning(false)
      runningRef.current = false
    }
  }, [dataset, fs, lead, onNewEntry, toast])

  return {
    toast, dataset, fs, setFs, lead, setLead: setLeadSafe, running, raw, pre, fsUsed, hr,
    peaksIdx, peaksTime, scal, cam, klas, lastEntry, colormap, setColormap,
    gradcam, setGradcam: () => setGradcam(false), steps, progress, stage, unitNote, leadOptions,
    scalCanvasRef, finishDataset, loadFile, loadSample, clearData, runAnalysis, markStep,
  }
}
