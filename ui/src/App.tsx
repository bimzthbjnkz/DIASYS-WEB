import { useEffect, useMemo, useState } from 'react'
import TopNav from './components/TopNav'
import LandingPage from './components/LandingPage'
import AnalisisView from './components/AnalisisView'
import RiwayatView from './components/RiwayatView'
import ModelView from './components/ModelView'
import Modal from './components/Modal'
import Toasts from './components/Toasts'
import { useToasts } from './hooks/useToasts'
import { useAnalysis } from './hooks/useAnalysis'
import { downloadReport } from './lib/report'
import { fmtPct } from './lib/format'
import type { ReportEntry } from './lib/report'

interface SeedEntry {
  id: string
  ts: number
  src: string
  klas: string
  conf: number
  probs: number[]
  stats: {
    hr: number
    amp: number
    qrsW: number
    sdnn: number
  }
  thumb: string | null
  hfDetectResult: { isHF: boolean; pHF: number; pNonHF: number }
  stage2Klas: string | null
  stage2Conf: number | null
}

export default function App() {
  const [view, setView] = useState('landing')
  const [history, setHistory] = useState<SeedEntry[]>([])
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const [modalEntry, setModalEntry] = useState<ReportEntry | null>(null)
  const { toasts, toast } = useToasts()

  const onNewEntry = useMemo(
    () => (entry: ReportEntry) => setHistory((prev) => [entry, ...prev]),
    [],
  )

  const a = useAnalysis({ toast, onNewEntry })

  useEffect(() => {
    if (view !== 'analisis') window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [view])

  const stats = useMemo(() => {
    const p = history.filter((e) => e.klas === 'HFpEF').length
    const total = history.length
    const avg = total
      ? history.reduce((s, e) => s + e.conf, 0) / total
      : 0
    return { p, f: total - p, total, avg: fmtPct(avg) }
  }, [history])

  const deleteEntry = (e: ReportEntry) => {
    setHistory((prev) => prev.filter((x) => x.id !== e.id))
    toast('Entri ' + e.id + ' dihapus.', 'info')
  }

  return (
    <>
      {view !== 'landing' && <TopNav view={view} setView={setView} histCount={history.length} />}

      {view === 'landing' && <LandingPage onNavigate={setView} />}

      {view !== 'landing' && (
        <main className="lp-main mx-auto max-w-[1240px] px-6 pt-7 pb-[60px]">
          {view === 'analisis' && <AnalisisView a={a} stats={stats} onOpenModal={setModalEntry} />}
          {view === 'riwayat' && (
            <RiwayatView
              history={history}
              filter={filter}
              setFilter={setFilter}
              q={q}
              setQ={setQ}
              onView={setModalEntry}
              onDelete={deleteEntry}
            />
          )}
          {view === 'model' && <ModelView />}
        </main>
      )}

      <Modal entry={modalEntry} onClose={() => setModalEntry(null)} onDownload={downloadReport} />
      <Toasts toasts={toasts} />
    </>
  )
}
