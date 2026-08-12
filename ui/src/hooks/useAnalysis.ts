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
import { buildEchoNextInput, MODEL_FS, MODEL_N, MODEL_SCALES } from '../lib/modelInput'
import type { ModelInput } from '../lib/modelInput'
import { buildHFDetectInput } from '../lib/hfDetectInput'
import { computeGradCam, predictEchoNext, predictHFDetect } from '../lib/model'
import type { HFDetectResult, EchoNextResult } from '../lib/model'

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

  const [steps, setSteps] = useState<string[]>(['', '', '', '', ''])
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
        for (let i = 1; i < 5; i++) next[i] = ''
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
    setSteps(['', '', '', '', ''])
    setProgress(0)
    setStage('siap · menunggu data')
    setRunning(false)
  }, [])

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

  /* ================================================================= */
  /*  Cascaded 2-stage analysis pipeline                                 */
  /* ================================================================= */

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

    /* ─── Tahap 1: Upload/Data ─── */
    markStep(0, 'done')
    setProgress(8)

    /* ─── Tahap 2: Preprocessing (HF Detection) ─── */
    markStep(1, 'active')
    setStage('tahap 2/5 · preprocessing (HF Detection)')
    setProgress(14)
    await sleep(200)

    let hfInput: ReturnType<typeof buildHFDetectInput>
    try {
      hfInput = buildHFDetectInput(ds, fs)
      setProgress(22)
      await sleep(150)
      markStep(1, 'done')
    } catch (err) {
      markStep(1, '')
      setProgress(8)
      setStage('gagal · preprocessing HF Detection')
      toast('Gagal preprocessing HF Detection: ' + (err instanceof Error ? err.message : String(err)), 'warn')
      return
    }

    /* ─── Tahap 3: Inferensi HF Detection ─── */
    markStep(2, 'active')
    setStage('tahap 3/5 · inferensi HF Detection')
    setProgress(28)
    await sleep(100)

    let hfResult: HFDetectResult
    try {
      setProgress(35)
      hfResult = await predictHFDetect(hfInput.tensor)
      markStep(2, 'done')
    } catch (err) {
      markStep(2, '')
      setProgress(22)
      setStage('gagal · model HF Detection tidak dapat dipanggil')
      toast('Gagal menjalankan model HF Detection: ' + (err instanceof Error ? err.message : String(err)), 'warn')
      return
    }

    /* ─── Cek hasil Stage 1 ─── */
    if (!hfResult.isHF) {
      // Non-HF → selesai, tidak perlu Stage 2
      const entry: ReportEntry = {
        id: 'CW-' + seqRef.current++,
        ts: Date.now(),
        src: ds.name,
        klas: 'Non-HF',
        conf: hfResult.pNonHF,
        probs: [hfResult.pNonHF, hfResult.pHF],
        stats: { hr: 0, amp: 0, qrsW: 0, sdnn: 0 },
        thumb: null,
        hfDetectResult: hfResult,
        stage2Klas: null,
        stage2Conf: null,
      }
      setLastEntry(entry)
      onNewEntry?.(entry)
      setKlas('Non-HF')
      setProgress(100)
      setStage('selesai · Non-HF (' + (hfResult.pNonHF * 100).toFixed(1).replace('.', ',') + '%)')
      markStep(3, 'done')
      markStep(4, 'skip')
      toast('Analisis selesai — Non-HF terdeteksi.', 'success')

      // Still compute some basic stats from raw signal for display
      const { raw: rawSig, fs: rfs } = getSignal(ds, fs, 0)
      setRaw(rawSig)
      setFsUsed(rfs)
      const y = preprocess(rawSig, rfs)
      setPre(y)
      const det: PeakResult = detectPeaks(y, rfs)
      setPeaksIdx(det.idx)
      setPeaksTime(det.idx.map((i) => i / rfs))
      const m: MeasureResult = measure(det.yy, rfs, det.idx)
      const hrVal =
        det.idx.length > 1
          ? Math.round((60 * (det.idx.length - 1)) / ((det.idx[det.idx.length - 1] - det.idx[0]) / rfs))
          : 0
      setHr(hrVal)

      // Update the entry with stats
      entry.stats = { hr: hrVal, amp: m.amp, qrsW: m.qrsW, sdnn: m.sdnn }

      return
    }

    /* ─── HF terdeteksi → lanjut ke Stage 2 (EchoNext) ─── */

    // Get signal for display
    const { raw: rawSig, fs: rfs } = getSignal(ds, fs, lead)
    setRaw(rawSig)
    setFsUsed(rfs)

    // Preprocess for display
    const y = preprocess(rawSig, rfs)
    const det: PeakResult = detectPeaks(y, rfs)
    const peaks = det.idx
    setPeaksIdx(peaks)
    setPeaksTime(peaks.map((i) => i / rfs))
    setPre(y)
    const m: MeasureResult = measure(det.yy, rfs, peaks)
    const hrVal =
      peaks.length > 1
        ? Math.round((60 * (peaks.length - 1)) / ((peaks[peaks.length - 1] - peaks[0]) / rfs))
        : 0
    setHr(hrVal)

    /* ─── Tahap 4: Preprocessing (EchoNext) ─── */
    markStep(3, 'active')
    setStage('tahap 4/5 · preprocessing (EchoNext)')
    setProgress(44)
    await sleep(120)

    let mi: ModelInput
    try {
      mi = buildEchoNextInput(ds, fs, lead)
      modelTensorRef.current = mi.tensor
      setScal(scalFromMexh(mi.channels[mi.displayIdx].mag, MODEL_FS))
      setProgress(58)
      await sleep(120)
      markStep(3, 'done')
    } catch (err) {
      markStep(3, '')
      setProgress(35)
      setStage('gagal · preprocessing EchoNext')
      toast('Gagal preprocessing EchoNext: ' + (err instanceof Error ? err.message : String(err)), 'warn')
      return
    }

    /* ─── Tahap 5: Inferensi EchoNext ─── */
    markStep(4, 'active')
    setProgress(62)
    setStage('tahap 5/5 · inferensi EchoNext')
    await sleep(100)

    try {
      setProgress(72)
      setStage('tahap 5/5 · inferensi EchoNext…')
      const enResult: EchoNextResult = await predictEchoNext(mi.tensor)
      const enProbs: number[] = [enResult.pHFpEF, enResult.pHFrEF]
      const enKlas = enResult.pHFpEF >= 0.5 ? 'HFpEF' : 'HFrEF'
      setKlas(enKlas)

      if (gradcam) {
        setStage('tahap 5/5 · menghitung Grad-CAM…')
        computeGradCam(mi.tensor)
          .then(setCam)
          .catch(() => setCam(null))
      }

      const thumb = captureScalogramThumb(
        scalFromMexh(mi.channels[mi.displayIdx].mag, MODEL_FS),
        y,
        peaks.map((i) => i / rfs),
        enKlas,
      )

      const entry: ReportEntry = {
        id: 'CW-' + seqRef.current++,
        ts: Date.now(),
        src: ds.name,
        klas: enKlas,
        conf: Math.max(enProbs[0], enProbs[1]),
        probs: enProbs,
        stats: { hr: hrVal, amp: m.amp, qrsW: m.qrsW, sdnn: m.sdnn },
        thumb,
        hfDetectResult: hfResult,
        stage2Klas: enKlas,
        stage2Conf: Math.max(enProbs[0], enProbs[1]),
      }
      setLastEntry(entry)
      onNewEntry?.(entry)
      setProgress(100)
      setStage(
        'selesai · HF → ' +
          enKlas +
          ' (' +
          (Math.max(enProbs[0], enProbs[1]) * 100).toFixed(1).replace('.', ',') +
          '%)',
      )
      markStep(4, 'done')
      toast(
        `Analisis selesai — HF terdeteksi → ${enKlas} (${(Math.max(enProbs[0], enProbs[1]) * 100).toFixed(1).replace('.', ',')}%)`,
        'success',
      )
    } catch (err) {
      setKlas(null)
      markStep(4, '')
      setProgress(58)
      setStage('gagal · model EchoNext tidak dapat dipanggil')
      toast('Gagal menjalankan model EchoNext: ' + (err instanceof Error ? err.message : String(err)), 'warn')
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
