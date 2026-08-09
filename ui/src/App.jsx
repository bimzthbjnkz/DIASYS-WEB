import { useEffect, useMemo, useState } from 'react'
import TopNav from './components/TopNav.jsx'
import AnalisisView from './components/AnalisisView.jsx'
import RiwayatView from './components/RiwayatView.jsx'
import ModelView from './components/ModelView.jsx'
import Modal from './components/Modal.jsx'
import Toasts from './components/Toasts.jsx'
import { useToasts } from './hooks/useToasts.jsx'
import { useAnalysis } from './hooks/useAnalysis.js'
import { downloadReport } from './lib/report.js'
import { fmtPct } from './lib/format.js'

const DAY = 864e5

function seedHistory() {
  const now = Date.now()
  const mk = (id, d, src, klas, conf, hr, amp, w, sd) => ({
    id,
    ts: now - d,
    src,
    klas,
    conf,
    probs: klas === 'HFrEF' ? [1 - conf, conf] : [conf, 1 - conf],
    stats: { hr, amp, qrsW: w, sdnn: sd },
    thumb: null,
  })
  return [
    mk('CW-5012', 1.1 * DAY, 'RS Cipto — lead II · PS-0142', 'HFrEF', 0.931, 86, 0.71, 138, 41),
    mk('CW-5011', 2.3 * DAY, 'Contoh — Simulasi HFpEF', 'HFpEF', 0.908, 73, 1.28, 96, 28),
    mk('CW-5010', 3.5 * DAY, 'RS Sardjito — lead II · PS-0098', 'HFrEF', 0.884, 91, 0.66, 142, 52),
    mk('CW-5009', 4.7 * DAY, 'Klinik Jantung Medika · PS-0077', 'HFpEF', 0.952, 70, 1.34, 92, 24),
    mk('CW-5008', 6.2 * DAY, 'RS Cipto — lead II · PS-0131', 'HFrEF', 0.917, 88, 0.69, 135, 47),
  ]
}

export default function App() {
  const [view, setView] = useState('analisis')
  const [history, setHistory] = useState(seedHistory)
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const [modalEntry, setModalEntry] = useState(null)
  const { toasts, toast } = useToasts()

  const onNewEntry = useMemo(
    () => (entry) => setHistory((prev) => [entry, ...prev]),
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

  const deleteEntry = (e) => {
    setHistory((prev) => prev.filter((x) => x.id !== e.id))
    toast('Entri ' + e.id + ' dihapus.', 'info')
  }

  return (
    <>
      <TopNav view={view} setView={setView} histCount={history.length} />

      <main className="mx-auto max-w-[1240px] px-6 pt-7 pb-[60px]">
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

      <Modal entry={modalEntry} onClose={() => setModalEntry(null)} onDownload={downloadReport} />
      <Toasts toasts={toasts} />
    </>
  )
}
