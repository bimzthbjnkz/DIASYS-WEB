import { useEffect, useRef, useCallback } from 'react'

/* ─── tiny helpers ─── */
function $(s: string, c?: ParentNode) { return (c || document).querySelector(s) as HTMLElement | null }
function $$<T extends HTMLElement = HTMLElement>(s: string, c?: ParentNode) { return Array.from((c || document).querySelectorAll(s)) as T[] }

/* ─── mulberry PRNG ─── */
function mulberry(a: number) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0
    let t = Math.imul(a ^ a >>> 15, 1 | a)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

/* ─── ECG helpers ─── */
function g(t: number, cc: number, w: number, a: number) { return a * Math.exp(-((t - cc) * (t - cc)) / (2 * w * w)) }
function beat(t: number) { return g(t, .16, .04, .14) + g(t, .31, .012, -.14) + g(t, .34, .016, 1) + g(t, .375, .014, -.25) + g(t, .58, .06, .3) }

function fit(c: HTMLCanvasElement) {
  const r = c.getBoundingClientRect()
  const d = Math.min(2, window.devicePixelRatio || 1)
  c.width = Math.max(2, Math.round(r.width * d))
  c.height = Math.max(2, Math.round(r.height * d))
  const ctx = c.getContext('2d')!
  ctx.setTransform(d, 0, 0, d, 0, 0)
  return { ctx, w: r.width, h: r.height }
}

function drawECG(c: HTMLCanvasElement, opts?: { hr?: number; seed?: number; theme?: 'dark' | 'light'; flat?: boolean }) {
  const hr = opts?.hr || 76, seed = opts?.seed || 7, theme = opts?.theme || 'dark', flat = !!opts?.flat
  const f = fit(c), ctx = f.ctx, w = f.w, h = f.h, dark = theme === 'dark'
  ctx.fillStyle = dark ? '#081210' : '#FCFAF4'; ctx.fillRect(0, 0, w, h)
  const minor = dark ? 'rgba(46,230,168,.07)' : 'rgba(224,80,46,.08)'
  const major = dark ? 'rgba(46,230,168,.14)' : 'rgba(224,80,46,.18)'
  for (let x = 0; x < w; x += 8) { ctx.strokeStyle = (x % 40) ? minor : major; ctx.beginPath(); ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, h); ctx.stroke() }
  for (let y = 0; y < h; y += 8) { ctx.strokeStyle = (y % 40) ? minor : major; ctx.beginPath(); ctx.moveTo(0, y + .5); ctx.lineTo(w, y + .5); ctx.stroke() }
  const rnd = mulberry(seed), period = (60 / hr) * 130, mid = h * .56, amp = h * .34
  ctx.strokeStyle = dark ? '#2EE6A8' : '#0E1F19'; ctx.lineWidth = 1.8
  ctx.shadowColor = dark ? 'rgba(46,230,168,.6)' : 'transparent'; ctx.shadowBlur = dark ? 5 : 0
  ctx.beginPath()
  for (let x = 0; x <= w; x++) {
    const t = (x % period) / period
    const v = flat ? 0 : beat(t)
    const n = (rnd() - .5) * (flat ? 1.6 : 1.2)
    const yy = mid - v * amp + n
    if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy)
  }
  ctx.stroke(); ctx.shadowBlur = 0
}

const STOPS: [number, number[]][] = [[0, [8, 18, 16]], [.35, [11, 111, 96]], [.6, [46, 230, 168]], [.8, [231, 166, 58]], [1, [224, 80, 46]]]
function palette(v: number) {
  v = Math.max(0, Math.min(1, v))
  for (let i = 1; i < STOPS.length; i++) {
    if (v <= STOPS[i][0]) {
      const p0 = STOPS[i - 1][0], c0 = STOPS[i - 1][1], p1 = STOPS[i][0], c1 = STOPS[i][1], k = (v - p0) / (p1 - p0)
      return `rgb(${c0.map((c, j) => Math.round(c + (c1[j] - c) * k)).join(',')})`
    }
  }
  return 'rgb(224,80,46)'
}

function drawScalogram(c: HTMLCanvasElement, seed: number, cls: string) {
  const f = fit(c), ctx = f.ctx, w = f.w, h = f.h, rnd = mulberry(seed)
  const cell = Math.max(3, Math.round(w / 150))
  const bands: { base: number; wdt: number; amp: number; f1: number; f2: number; p1: number; p2: number; drift: number }[] = []
  const nb = cls === 'Non-HF' ? 3 : cls === 'HFrEF' ? 4 : 5
  for (let b = 0; b < nb; b++) {
    bands.push({
      base: .16 + rnd() * .62, wdt: .05 + rnd() * .09, amp: .5 + rnd() * .55,
      f1: 1 + rnd() * 3, f2: 3 + rnd() * 4, p1: rnd() * 6.28, p2: rnd() * 6.28,
      drift: cls === 'HFpEF' ? .14 : .06
    })
  }
  ctx.fillStyle = '#081210'; ctx.fillRect(0, 0, w, h)
  for (let px = 0; px < w; px += cell) {
    for (let py = 0; py < h; py += cell) {
      const x = px / w, y = py / h
      let v = 0
      for (let b = 0; b < bands.length; b++) {
        const bd = bands[b]
        const yc = bd.base + bd.drift * Math.sin(x * bd.f1 * 6.28 + bd.p1) + .05 * Math.sin(x * bd.f2 * 6.28 + bd.p2)
        v += bd.amp * Math.exp(-((y - yc) * (y - yc)) / (2 * bd.wdt * bd.wdt))
      }
      v = v * .9 + (rnd() - .5) * .18
      if (cls === 'Non-HF') v *= .85
      ctx.fillStyle = palette(v); ctx.fillRect(px, py, cell, cell)
    }
  }
  ctx.strokeStyle = 'rgba(220,240,232,.12)'; ctx.strokeRect(.5, .5, w - 1, h - 1)
  ctx.fillStyle = 'rgba(220,240,232,.4)'; ctx.font = '9px "IBM Plex Mono", monospace'; ctx.textAlign = 'left'
  ctx.fillText('t (s) →', w - 52, h - 7)
}

function drawIdle(c: HTMLCanvasElement) {
  drawECG(c, { flat: true, seed: 2, theme: 'dark' })
  const ctx = c.getContext('2d')!, r = c.getBoundingClientRect()
  ctx.fillStyle = 'rgba(157,180,169,.65)'
  ctx.font = '11px "IBM Plex Mono", monospace'; ctx.textAlign = 'center'
  ctx.fillText('PILIH SAMPEL ATAU UNGGAH SINYAL UNTUK PRATINJAU', r.width / 2, r.height / 2)
}

/* ─── RESULT / INFO tables ─── */
const RESULT: Record<string, { cls: string; hr: number; seed: number; probs: number[] }> = {
  A: { cls: 'HFpEF', hr: 82, seed: 21, probs: [6.4, 11.2, 82.4] },
  B: { cls: 'Non-HF', hr: 71, seed: 34, probs: [94.1, 3.7, 2.2] },
  C: { cls: 'HFrEF', hr: 88, seed: 47, probs: [8.9, 79.6, 11.5] },
}
const INFO: Record<string, { t: string; c: string; d: string }> = {
  'Non-HF': { t: 'Non-HF — Tidak terindikasi gagal jantung', c: 'v-non', d: 'Pola sinyal konsisten dengan kontrol sehat. Lanjutkan pemantauan rutin, terutama bila terdapat faktor risiko kardiovaskular.' },
  'HFrEF': { t: 'HFrEF — Terindikasi gagal jantung sistolik', c: 'v-hfref', d: 'Probabilitas tinggi gagal jantung dengan fraksi ejeksi menurun (reduced EF). Direkomendasikan verifikasi ekokardiografi dan evaluasi dokter spesialis jantung.' },
  'HFpEF': { t: 'HFpEF — Terindikasi gagal jantung diastolik', c: 'v-hfpef', d: 'Probabilitas tinggi gagal jantung dengan fraksi ejeksi bertahan (preserved EF). Disarankan konfirmasi klinis lanjutan, termasuk ekokardiografi.' },
}

/* ─── MAIN COMPONENT ─── */
interface LandingPageProps {
  onNavigate: (view: string) => void
}

export default function LandingPage({ onNavigate }: LandingPageProps) {
  const sourceRef = useRef<{ type: string; key: string; name?: string } | null>(null)
  const runningRef = useRef(false)
  const previewDrawRef = useRef<((c?: HTMLCanvasElement) => void) | null>(null)
  const t0Ref = useRef(performance.now())

  const ecgMiniRef = useRef<HTMLCanvasElement>(null)
  const scaloRef = useRef<HTMLCanvasElement>(null)
  const dividerRef = useRef<HTMLCanvasElement>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)
  const consoleRef = useRef<HTMLDivElement>(null)
  const runProgRef = useRef<HTMLSpanElement>(null)
  const resultBoxRef = useRef<HTMLDivElement>(null)

  const fmtT = useCallback(() => {
    const s = (performance.now() - t0Ref.current) / 1000
    return '00:' + s.toFixed(1).padStart(4, '0')
  }, [])

  const log = useCallback((txt: string, cls?: string) => {
    if (!consoleRef.current) return null
    const d = document.createElement('div')
    d.className = 'ln' + (cls ? ' ' + cls : '')
    d.innerHTML = `<span class="t">${fmtT()}</span>▸ ${txt}`
    consoleRef.current.appendChild(d)
    consoleRef.current.scrollTop = consoleRef.current.scrollHeight
    return d
  }, [fmtT])

  const hideResult = useCallback(() => {
    const rb = resultBoxRef.current
    if (!rb) return
    rb.classList.remove('show')
    setTimeout(() => { if (!rb.classList.contains('show')) rb.style.display = 'none' }, 250)
    const resetBtn = $('#resetBtn') as HTMLButtonElement
    if (resetBtn) resetBtn.classList.remove('show')
    ;['barNon', 'barHfref', 'barHfpef'].forEach(id => { const el = $('#' + id); if (el) (el as HTMLElement).style.width = '0%' })
  }, [])

  const selectSample = useCallback((key: string) => {
    sourceRef.current = { type: 'sample', key }
    $$('.sample').forEach(b => b.classList.toggle('sel', b.dataset.sample === key))
    const fi = $('#fileInput') as HTMLInputElement | null
    if (fi) fi.value = ''
    const dn = $('#dzName')
    if (dn) dn.textContent = ''
    const R = RESULT[key]
    previewDrawRef.current = (c?: HTMLCanvasElement) => drawECG(c || previewRef.current!, { theme: 'dark', hr: R.hr, seed: R.seed })
    previewDrawRef.current()
    const rb = $('#runBtn') as HTMLButtonElement | null
    if (rb) rb.disabled = false
    hideResult()
  }, [hideResult])

  const hash = useCallback((s: string) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h) }, [])

  const setFile = useCallback((f: File) => {
    const key = ['A', 'B', 'C'][hash(f.name + f.size) % 3]
    sourceRef.current = { type: 'file', key, name: f.name }
    $$('.sample').forEach(b => b.classList.remove('sel'))
    const dn = $('#dzName')
    if (dn) dn.textContent = `✓ ${f.name} (${(f.size / 1024).toFixed(1)} KB)`
    const sd = hash(f.name) % 97
    previewDrawRef.current = (c?: HTMLCanvasElement) => drawECG(c || previewRef.current!, { theme: 'dark', hr: 74, seed: sd })
    previewDrawRef.current()
    const rb = $('#runBtn') as HTMLButtonElement | null
    if (rb) rb.disabled = false
    hideResult()
  }, [hash, hideResult])

  const runDemo = useCallback(async () => {
    if (runningRef.current || !sourceRef.current) return
    runningRef.current = true
    const rb = $('#runBtn') as HTMLButtonElement | null
    if (rb) rb.disabled = true
    hideResult()
    if (consoleRef.current) consoleRef.current.innerHTML = ''
    if (runProgRef.current) runProgRef.current.style.width = '0%'
    const R = RESULT[sourceRef.current.key], info = INFO[R.cls]
    const CLS = ['Non-HF', 'HFrEF', 'HFpEF'], idx = CLS.indexOf(R.cls), conf = R.probs[idx].toFixed(1)
    const label = sourceRef.current.type === 'sample' ? `sampel S-${sourceRef.current.key}` : `berkas "${sourceRef.current.name}"`
    const seed = sourceRef.current.type === 'file' ? hash(sourceRef.current.name!) : R.seed
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
    const steps: [string, (() => void) | null, number][] = [
      [`memuat sinyal — ${label} …`, null, 600],
      ['pra-pemrosesan: filter baseline wander &amp; denoising …', null, 750],
      ['CWT (Morlet) → skalogram waktu–frekuensi 2D …', () => { previewDrawRef.current = (c?: HTMLCanvasElement) => drawScalogram(c || previewRef.current!, seed, R.cls); previewDrawRef.current() }, 1000],
      [`CNN Tahap 1 — HF vs Non-HF → <b class="ok">p(HF) = ${(100 - R.probs[0]).toFixed(1)}%</b>`, null, 950],
      ['CNN Tahap 2 — pembedaan subtipe gagal jantung …', null, 850],
      [`selesai ✓ keluaran siap — konfidensi dominan <b class="ok">${conf}%</b>`, null, 450],
    ]
    for (let i = 0; i < steps.length; i++) {
      const ln = log(steps[i][0]); if (ln) ln.classList.add('cur')
      await sleep(steps[i][2])
      if (ln) ln.classList.remove('cur')
      if (steps[i][1]) steps[i][1]()
      if (runProgRef.current) runProgRef.current.style.width = ((i + 1) / steps.length * 100) + '%'
    }
    const vt = $('#verdictTitle'), vd = $('#verdictDesc'), vn = $('#valNon'), vh = $('#valHfref'), vp = $('#valHfpef'), ps1 = $('#pStage1'), ps1b = $('#pStage1b')
    if (vt) { vt.textContent = info.t; vt.className = 'verdict ' + info.c }
    if (vd) vd.textContent = info.d
    if (vn) vn.textContent = R.probs[0].toFixed(1) + '%'
    if (vh) vh.textContent = R.probs[1].toFixed(1) + '%'
    if (vp) vp.textContent = R.probs[2].toFixed(1) + '%'
    if (ps1) ps1.textContent = (100 - R.probs[0]).toFixed(1) + '%'
    if (ps1b) ps1b.textContent = R.probs[0].toFixed(1) + '%'
    const rbx = resultBoxRef.current
    if (rbx) {
      rbx.style.display = 'block'
      requestAnimationFrame(() => requestAnimationFrame(() => {
        rbx.classList.add('show')
        const bn = $('#barNon'), bref = $('#barHfref'), bpef = $('#barHfpef')
        if (bn) bn.style.width = R.probs[0] + '%'
        if (bref) bref.style.width = R.probs[1] + '%'
        if (bpef) bpef.style.width = R.probs[2] + '%'
      }))
    }
    const resetBtn = $('#resetBtn') as HTMLButtonElement | null
    if (resetBtn) resetBtn.classList.add('show')
    runningRef.current = false
    if (rb) rb.disabled = false
  }, [hash, hideResult, log])

  /* ─── init: draw canvases + setup event listeners ─── */
  useEffect(() => {
    const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    /* draw static canvases */
    const drawStatics = () => {
      if (dividerRef.current) drawECG(dividerRef.current, { theme: 'light', hr: 72, seed: 9 })
      if (ecgMiniRef.current) drawECG(ecgMiniRef.current, { theme: 'light', hr: 76, seed: 5 })
      if (scaloRef.current) drawScalogram(scaloRef.current, 11, 'HFpEF')
      if (previewRef.current) drawIdle(previewRef.current)
    }
    drawStatics()
    let rT: ReturnType<typeof setTimeout>
    const onResize = () => { clearTimeout(rT); rT = setTimeout(drawStatics, 180) }
    window.addEventListener('resize', onResize)

    /* nav scroll */
    const nav = $('#nav')
    const bar = $('#progressBar')
    const onScroll = () => {
      if (nav) nav.classList.toggle('scrolled', window.scrollY > 10)
      const max = document.documentElement.scrollHeight - window.innerHeight
      if (bar) bar.style.width = (max > 0 ? (window.scrollY / max) * 100 : 0) + '%'
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()

    /* ticker */
    const track = $('#tickerTrack')
    if (track) while (track.scrollWidth < window.innerWidth * 2) track.innerHTML += track.innerHTML

    /* scramble */
    const scramble = (el: HTMLElement) => {
      const txt = el.dataset.text || el.textContent || ''
      if (REDUCED) { el.textContent = txt; return }
      const glyphs = '▮▯/\\+·01ACGT'
      let f = 0, total = Math.max(20, txt.length * 5)
      const iv = setInterval(() => {
        f++
        el.textContent = txt.split('').map((ch, i) => ch === ' ' ? ' ' : i < (f / total) * txt.length * 1.35 ? ch : glyphs[(Math.random() * glyphs.length) | 0]).join('')
        if (f >= total) { el.textContent = txt; clearInterval(iv) }
      }, 34)
    }

    /* counters */
    const animateCount = (el: HTMLElement) => {
      const to = +(el.dataset.count || 0), pre = el.dataset.prefix || '', suf = el.dataset.suffix || ''
      if (REDUCED) { el.textContent = pre + to + suf; return }
      const t0 = performance.now(), dur = 1500
      const step = (t: number) => {
        const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3)
        el.textContent = pre + Math.round(to * e) + suf
        if (p < 1) requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    }

    /* observers */
    const io = new IntersectionObserver((es) => es.forEach(e => {
      if (!e.isIntersecting) return
      e.target.classList.add('in')
      if (e.target.hasAttribute('data-scramble')) scramble(e.target as HTMLElement)
      if (e.target.classList.contains('count')) animateCount(e.target as HTMLElement)
      io.unobserve(e.target)
    }), { threshold: .25 })
    $$('.reveal,.lr,[data-scramble],.count').forEach(el => io.observe(el))

    /* stage index sync */
    const idxItems = $$('#stageIndex li')
    const stgIO = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) {
        idxItems.forEach(li => li.classList.toggle('active', li.dataset.i === (e.target as HTMLElement).dataset.i))
      }
    }), { rootMargin: '-42% 0px -42% 0px' })
    $$('.stage-card').forEach(c => stgIO.observe(c))
    idxItems.forEach(li => {
      li.querySelector('button')?.addEventListener('click', () => {
        const card = $(`.stage-card[data-i="${li.dataset.i}"]`)
        if (card) card.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'center' })
      })
    })

    /* HR flicker */
    const hrEl = $('#hrVal')
    let hrIv: ReturnType<typeof setInterval> | undefined
    if (!REDUCED && hrEl) hrIv = setInterval(() => { hrEl.textContent = String(72 + ((Math.random() * 8) | 0)) }, 1800)

    /* file input */
    const fi = $('#fileInput') as HTMLInputElement | null
    const dzLabel = $('#dzLabel')
    const onFiChange = () => { if (fi?.files?.[0]) setFile(fi.files[0]) }
    fi?.addEventListener('change', onFiChange)
    const onDragOver = (e: Event) => { e.preventDefault(); dzLabel?.classList.add('drag') }
    const onDragLeave = (e: Event) => { e.preventDefault(); dzLabel?.classList.remove('drag') }
    const onDrop = (e: DragEvent) => { e.preventDefault(); dzLabel?.classList.remove('drag'); if (e.dataTransfer?.files[0]) setFile(e.dataTransfer.files[0]) }
    ;['dragover', 'dragenter'].forEach(ev => dzLabel?.addEventListener(ev, onDragOver))
    ;['dragleave', 'drop'].forEach(ev => dzLabel?.addEventListener(ev, onDragLeave))
    dzLabel?.addEventListener('drop', onDrop as EventListener)

    /* sample buttons */
    $$('.sample').forEach(b => b.addEventListener('click', () => selectSample(b.dataset.sample!)))

    /* run / reset */
    const runBtn = $('#runBtn')
    const resetBtn = $('#resetBtn')
    runBtn?.addEventListener('click', runDemo)
    resetBtn?.addEventListener('click', () => {
      if (consoleRef.current) consoleRef.current.innerHTML = ''
      log('sistem di-reset — pilih sampel atau unggah sinyal.')
      hideResult()
      if (runProgRef.current) runProgRef.current.style.width = '0%'
      if (previewRef.current) drawIdle(previewRef.current)
    })

    /* FAQ */
    $$('.faq-q').forEach(btn => btn.addEventListener('click', () => {
      const item = btn.parentElement!, wasOpen = item.classList.contains('open')
      $$('.faq-item.open').forEach(o => {
        o.classList.remove('open')
        const a = o.querySelector('.faq-a') as HTMLElement | null
        if (a) a.style.maxHeight = 'null'
        o.querySelector('.faq-q')?.setAttribute('aria-expanded', 'false')
      })
      if (!wasOpen) {
        item.classList.add('open')
        const a = item.querySelector('.faq-a') as HTMLElement | null
        if (a) a.style.maxHeight = a.scrollHeight + 'px'
        btn.setAttribute('aria-expanded', 'true')
      }
    }))

    /* year */
    const yearEl = $('#year')
    if (yearEl) yearEl.textContent = String(new Date().getFullYear())

    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onScroll)
      io.disconnect()
      stgIO.disconnect()
      if (hrIv) clearInterval(hrIv)
      fi?.removeEventListener('change', onFiChange)
      ;['dragover', 'dragenter'].forEach(ev => dzLabel?.removeEventListener(ev, onDragOver))
      ;['dragleave', 'drop'].forEach(ev => dzLabel?.removeEventListener(ev, onDragLeave))
      dzLabel?.removeEventListener('drop', onDrop as EventListener)
    }
  }, [selectSample, setFile, runDemo, hideResult, log])

  return (
    <>
      {/* eslint-disable-next-line react/no-unknown-property */}
      <style>{LandingCSS}</style>

      <div className="lp-noise" aria-hidden="true" />
      <div className="lp-progress" aria-hidden="true"><span id="progressBar" /></div>
      <a className="lp-skip" href="#tentang">Lewati ke konten</a>

      {/* ─── NAV ─── */}
      <header id="nav" className="lp-nav">
        <div className="wrap nav-in">
          <a className="brand" href="#atas" aria-label="DIASYS — kembali ke atas">
            <svg width="26" height="16" viewBox="0 0 26 16" fill="none" aria-hidden="true"><path d="M0 9h5l2-5 3 10 3-13 3 11 2-3h8" stroke="#0B8A63" stroke-width="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            DIASYS <em>PROJECT</em>
          </a>
          <nav className="nav-links" aria-label="Navigasi utama">
            <a href="#tentang">Tentang</a>
            <a href="#masalah">Latar Belakang</a>
            <a href="#cara-kerja">Cara Kerja</a>
            <a href="#demo">Demo</a>
            <a href="#batasan">Batasan</a>
          </nav>
          <div className="nav-right">
            <span className="status"><i />SIAGA</span>
            <button className="btn btn-primary btn-sm" onClick={() => onNavigate('analisis')}>Coba Model <span className="arr">→</span></button>
          </div>
        </div>
      </header>

      <main>
        {/* ─── HERO ─── */}
        <section className="hero" id="atas">
          <div className="wrap">
            <div className="hero-meta-bar reveal">
              <span>REF. CDSS-DIASYS/2026</span>
              <span className="mid">Sistem Pendukung Keputusan Klinis · Klasifikasi Non-Invasif</span>
              <span>REV 08.26 · STATUS RISET</span>
            </div>
            <div className="hero-grid">
              <div>
                <h1>
                  <span className="h1-title" data-scramble data-text="DIASYS">DIASYS</span>
                  <span className="lr"><span className="lr-in h1-sub">Solusi cerdas deteksi dini gagal jantung <em className="accent">berbasis AI &amp; EKG.</em></span></span>
                </h1>
                <p className="lead reveal" style={{ '--d': '.15s' } as React.CSSProperties}>Klasifikasi non-invasif gagal jantung sistolik <b>(HFrEF)</b> dan diastolik <b>(HFpEF)</b> menggunakan <b>Two-Stage Deep Learning</b> dan <b>Continuous Wavelet Transform (CWT)</b> — langsung dari sinyal elektrokardiogram.</p>
                <div className="cta-row reveal" style={{ '--d': '.25s' } as React.CSSProperties}>
                  <button className="btn btn-primary" onClick={() => onNavigate('analisis')}>Coba Model / Unggah EKG <span className="arr">→</span></button>
                  <a className="btn btn-ghost" href="#cara-kerja">Pelajari Metodologi <span className="arr">↓</span></a>
                </div>
                <div className="hero-specs reveal" style={{ '--d': '.35s' } as React.CSSProperties}>
                  <span>INPUT — <b>EKG PERMUKAAN</b></span>
                  <span>PREPRO — <b>CWT → SKALOGRAM</b></span>
                  <span>MODEL — <b>TWO-STAGE CNN</b></span>
                  <span>LUARAN — <b>PROBABILITAS</b></span>
                </div>
              </div>

              <div className="monitor reveal" style={{ '--d': '.2s' } as React.CSSProperties} aria-label="Simulasi monitor EKG">
                <div className="mon-head">
                  <span>LEAD II · 25 mm/s · 10 mm/mV</span>
                  <span className="live"><i />LIVE</span>
                </div>
                <div className="mon-screen">
                  <svg viewBox="0 0 660 130" preserveAspectRatio="none" aria-hidden="true">
                    <path className="trace" pathLength="1000" d="M0 75 c6 -9 14 -9 20 0 l6 0 l3 5 l4 -34 l4 42 l3 -13 l8 0 c8 -13 20 -13 28 0 l34 0 c6 -9 14 -9 20 0 l6 0 l3 5 l4 -34 l4 42 l3 -13 l8 0 c8 -13 20 -13 28 0 l34 0 c6 -9 14 -9 20 0 l6 0 l3 5 l4 -34 l4 42 l3 -13 l8 0 c8 -13 20 -13 28 0 l34 0 c6 -9 14 -9 20 0 l6 0 l3 5 l4 -34 l4 42 l3 -13 l8 0 c8 -13 20 -13 28 0 l34 0 c6 -9 14 -9 20 0 l6 0 l3 5 l4 -34 l4 42 l3 -13 l8 0 c8 -13 20 -13 28 0 l30 0" />
                  </svg>
                  <div className="sweep" aria-hidden="true" />
                </div>
                <div className="mon-foot">
                  <span>HR <b className="hr-val" id="hrVal">76</b> BPM</span>
                  <span>IRAMA: SINUS</span>
                  <span>KUALITAS: 98%</span>
                  <span className="mon-chip">DIASYS · SIAGA</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="sig-strip" aria-hidden="true"><canvas ref={dividerRef} /></div>

        <div className="ticker" aria-hidden="true">
          <div className="ticker-track" id="tickerTrack">
            <span>EKG Non-Invasif <b>✚</b></span><span>Continuous Wavelet Transform <b>✚</b></span><span>Two-Stage CNN <b>✚</b></span><span>Klasifikasi HFrEF &amp; HFpEF <b>✚</b></span><span>Skrining Awal <b>✚</b></span><span>Skalograf Waktu–Frekuensi <b>✚</b></span><span>Clinical Decision Support <b>✚</b></span>
          </div>
        </div>

        {/* ─── TENTANG ─── */}
        <section className="sec" id="tentang">
          <div className="wrap">
            <div className="sec-head">
              <span className="kicker reveal">01 · Tentang Platform</span>
              <h2><span className="lr"><span className="lr-in">Apa itu <em className="accent">DIASYS?</em></span></span></h2>
            </div>
            <div className="about-grid">
              <div className="about-copy">
                <p className="intro reveal">DIASYS adalah platform berbasis web yang berfungsi sebagai sistem pendukung keputusan klinis (Clinical Decision Support System) untuk mengklasifikasikan subtipe gagal jantung secara non-invasif — hanya dari sinyal elektrokardiogram.</p>
                <p className="reveal" style={{ '--d': '.1s' } as React.CSSProperties}>Sinyal EKG pertama-tama diolah dengan <b>Continuous Wavelet Transform (CWT)</b> menjadi skalogram dua dimensi, lalu dianalisis oleh arsitektur <b>Convolutional Neural Network dua tahap (two-stage cascaded CNN)</b>: tahap pertama memisahkan kondisi gagal jantung dari non-gagal jantung, tahap kedua membedakan subtipe <b>HFrEF</b> (reduced ejection fraction, sistolik) dan <b>HFpEF</b> (preserved ejection fraction, diastolik).</p>
                <p className="reveal" style={{ '--d': '.18s' } as React.CSSProperties}>Hasilnya disajikan sebagai probabilitas yang transparan — dirancang sebagai alat bantu skrining awal dan teman berpikir klinisi, bukan pengganti penilaian medis.</p>
                <div className="audience reveal" style={{ '--d': '.26s' } as React.CSSProperties}>
                  <span className="aud-chip"><span />Dokter &amp; tenaga medis</span>
                  <span className="aud-chip"><span />FKTP &amp; wilayah minim ekokardiografi</span>
                  <span className="aud-chip"><span />Peneliti kardiovaskular</span>
                </div>
              </div>
              <aside className="spec reveal" style={{ '--d': '.15s' } as React.CSSProperties} aria-label="Spesifikasi platform">
                <h3>Spesifikasi Sistem</h3>
                <dl>
                  <div className="row"><dt>Nama</dt><dd>DIASYS Project</dd></div>
                  <div className="row"><dt>Kategori</dt><dd>Clinical Decision Support System<small>Aplikasi web (web application)</small></dd></div>
                  <div className="row"><dt>Masukan</dt><dd>Sinyal EKG permukaan<small>Non-invasif, rekaman singkat</small></dd></div>
                  <div className="row"><dt>Prepro</dt><dd>CWT → Skalogram 2D<small>Representasi waktu–frekuensi</small></dd></div>
                  <div className="row"><dt>Arsitektur</dt><dd>Two-stage cascaded CNN</dd></div>
                  <div className="row"><dt>Tahap 1</dt><dd>HF vs Non-HF</dd></div>
                  <div className="row"><dt>Tahap 2</dt><dd>HFrEF vs HFpEF</dd></div>
                  <div className="row"><dt>Luaran</dt><dd>Kelas + probabilitas<small>Dukungan keputusan klinis</small></dd></div>
                  <div className="row"><dt>Status</dt><dd>Riset &amp; pengembangan · 2026</dd></div>
                </dl>
              </aside>
            </div>
          </div>
        </section>

        {/* ─── LATAR BELAKANG ─── */}
        <section className="sec problem on-dark" id="masalah">
          <div className="wrap">
            <div className="sec-head">
              <span className="kicker reveal">02 · Latar Belakang</span>
              <h2><span className="lr"><span className="lr-in">Mengapa DIASYS dibuat?</span></span></h2>
              <p className="lead reveal" style={{ '--d': '.1s' } as React.CSSProperties}>Diagnosis subtipe gagal jantung masih mahal, tidak merata, dan sulit dilakukan dengan alat yang paling mudah diakses — EKG. Inilah celah yang DIASYS jawab.</p>
            </div>

            <div className="stats reveal">
              <div className="stat"><div className="num"><span className="count" data-count="5" data-prefix=">" data-suffix="%">&gt;0%</span></div><div className="lbl">Total populasi Indonesia yang terdampak gagal jantung — jutaan kasus di seluruh dunia.</div></div>
              <div className="stat"><div className="num"><span className="count" data-count="2">0</span></div><div className="lbl">Subtipe utama — HFrEF (sistolik) &amp; HFpEF (diastolik) — dengan strategi terapi berbeda.</div></div>
              <div className="stat"><div className="num"><span className="count" data-count="2">0</span></div><div className="lbl">Tahap kaskade CNN: deteksi gagal jantung, lalu pembedaan subtipe.</div></div>
              <div className="stat"><div className="num"><span className="count" data-count="100" data-suffix="%">0%</span></div><div className="lbl">Non-invasif — seluruh analisis berbasis sinyal EKG permukaan.</div></div>
            </div>

            <div className="prob-list">
              <article className="prob-item reveal">
                <span className="no">01</span>
                <div><h3>Beban kasus yang tinggi</h3>
                <p>Gagal jantung merupakan salah satu penyebab kematian kardiovaskular tertinggi — berdampak pada lebih dari 5% total populasi di Indonesia, dengan jutaan kasus di seluruh dunia. Deteksi dini dan pembedaan subtipe adalah kunci penanganan.</p>
                <span className="tag">Beban Penyakit</span></div>
              </article>
              <article className="prob-item reveal" style={{ '--d': '.08s' } as React.CSSProperties}>
                <span className="no">02</span>
                <div><h3>Ekokardiografi: mahal &amp; belum merata</h3>
                <p>Pembedaan subtipe HFrEF dan HFpEF selama ini sangat bergantung pada ekokardiografi — pemeriksaan yang biayanya tinggi dan ketersediaannya belum merata di fasilitas kesehatan Indonesia, terutama di luar kota besar.</p>
                <span className="tag">Kesenjangan Akses</span></div>
              </article>
              <article className="prob-item reveal" style={{ '--d': '.16s' } as React.CSSProperties}>
                <span className="no">03</span>
                <div><h3>EKG standar tidak cukup kasatmata</h3>
                <p>Meskipun EKG jauh lebih ekonomis dan mudah diakses, identifikasi subtipe gagal jantung — khususnya HFpEF — sangat sulit dilakukan secara konvensional karena gelombang EKG tidak memiliki fitur khas yang langsung terlihat mata.</p>
                <span className="tag">Fitur Tersembunyi</span></div>
              </article>
            </div>

            <div className="solution reveal">
              <p><span className="hl">Solusi yang kami bangun —</span> DIASYS hadir sebagai jembatan inovatif yang memaksimalkan potensi data EKG melalui kecerdasan buatan, agar skrining awal dan klasifikasi subtipe dapat dilakukan <span className="hl">cepat, akurat, dan non-invasif.</span></p>
              <a className="btn btn-primary" href="#cara-kerja">Lihat Cara Kerja <span className="arr">↓</span></a>
            </div>
          </div>
        </section>

        {/* ─── CARA KERJA ─── */}
        <section className="sec method" id="cara-kerja">
          <div className="wrap method-grid">
            <div className="method-left">
              <span className="kicker reveal">03 · Cara Kerja</span>
              <h2><span className="lr"><span className="lr-in">Dari sinyal menuju keputusan.</span></span></h2>
              <p className="lead reveal" style={{ '--d': '.1s' } as React.CSSProperties}>Lima langkah berurutan mengubah rekaman EKG mentah menjadi rekomendasi klasifikasi yang dapat dibaca klinisi.</p>
              <ol className="stages-index" id="stageIndex">
                <li data-i="0" class="active"><button type="button"><b>00</b> Akuisisi Sinyal</button></li>
                <li data-i="1"><button type="button"><b>01</b> CWT → Skalogram</button></li>
                <li data-i="2"><button type="button"><b>02</b> CNN Tahap 1</button></li>
                <li data-i="3"><button type="button"><b>03</b> CNN Tahap 2</button></li>
                <li data-i="4"><button type="button"><b>04</b> Luaran CDSS</button></li>
              </ol>
              <p className="method-note reveal" style={{ '--d': '.2s' } as React.CSSProperties}>GULIR UNTUK MENJELAJAHI TIAP TAHAP ↓</p>
            </div>

            <div className="stack">
              <article className="stage-card" style={{ '--i': '0' } as React.CSSProperties} data-i="0">
                <div className="stg-head"><span className="stg-no">Tahap 00</span><h3>Akuisisi &amp; Normalisasi Sinyal</h3></div>
                <p>Rekaman EKG singkat satu lead diterima sistem, lalu dinormalisasi: pembuangan baseline wander, reduksi noise, dan penyeragaman skala amplitudo agar konsisten sebelum diproses model.</p>
                <div className="viz"><canvas ref={ecgMiniRef} /><span className="cap">Sinyal EKG · domain waktu</span></div>
              </article>

              <article className="stage-card" style={{ '--i': '1' } as React.CSSProperties} data-i="1">
                <div className="stg-head"><span className="stg-no">Tahap 01</span><h3>Continuous Wavelet Transform</h3></div>
                <p>CWT memetakan sinyal 1 dimensi menjadi skalogram 2 dimensi (waktu × frekuensi) — menyingkap pola energi tersembunyi yang tidak terlihat pada tampilan EKG konvensional.</p>
                <div className="viz dark"><canvas ref={scaloRef} /><span className="cap">Skalogram waktu–frekuensi</span></div>
              </article>

              <article className="stage-card" style={{ '--i': '2' } as React.CSSProperties} data-i="2">
                <div className="stg-head"><span className="stg-no">Tahap 02</span><h3>CNN Tahap 1 — HF vs Non-HF</h3></div>
                <p>Kaskade pertama menilai keberadaan gagal jantung dari skalogram: membedakan kondisi <b>HF</b> dari <b>Non-HF</b>. Hanya sampel berprobabilitas HF tinggi yang diteruskan ke tahap berikutnya.</p>
                <div className="viz">
                  <div className="net" aria-hidden="true">
                    <div className="net-col"><div className="bars"><i style={{ '--hh': '.55', '--dd': '0' } as React.CSSProperties} /><i style={{ '--hh': '.85', '--dd': '1' } as React.CSSProperties} /><i style={{ '--hh': '1', '--dd': '2' } as React.CSSProperties} /><i style={{ '--hh': '.7', '--dd': '3' } as React.CSSProperties} /><i style={{ '--hh': '.45', '--dd': '4' } as React.CSSProperties} /></div><span className="lbl">Skalogram</span></div>
                    <span className="net-arrow">→</span>
                    <div className="net-col"><div className="layers"><i /><i /><i /></div><span className="lbl">CNN Tahap 1</span></div>
                    <span className="net-arrow">→</span>
                    <div className="tags-out"><span className="tag-out hot">HF — 93.1%</span><span className="tag-out">Non-HF — 6.9%</span></div>
                  </div>
                </div>
              </article>

              <article className="stage-card" style={{ '--i': '3' } as React.CSSProperties} data-i="3">
                <div className="stg-head"><span className="stg-no">Tahap 03</span><h3>CNN Tahap 2 — Subtipe</h3></div>
                <p>Kaskade kedua membedakan subtipe gagal jantung: <b>HFrEF</b> (sistolik, fraksi ejeksi menurun) vs <b>HFpEF</b> (diastolik, fraksi ejeksi bertahan) — dua kondisi dengan strategi terapi berbeda.</p>
                <div className="viz">
                  <div className="net" aria-hidden="true">
                    <div className="net-col"><div className="bars"><i style={{ '--hh': '.7', '--dd': '0' } as React.CSSProperties} /><i style={{ '--hh': '.5', '--dd': '1' } as React.CSSProperties} /><i style={{ '--hh': '.95', '--dd': '2' } as React.CSSProperties} /><i style={{ '--hh': '.6', '--dd': '3' } as React.CSSProperties} /><i style={{ '--hh': '.8', '--dd': '4' } as React.CSSProperties} /></div><span className="lbl">Prob. HF tinggi</span></div>
                    <span className="net-arrow">→</span>
                    <div className="net-col"><div className="layers"><i /><i /><i /></div><span className="lbl">CNN Tahap 2</span></div>
                    <span className="net-arrow">→</span>
                    <div className="tags-out"><span className="tag-out">HFrEF — 11.2%</span><span className="tag-out hot">HFpEF — 82.4%</span></div>
                  </div>
                </div>
              </article>

              <article className="stage-card" style={{ '--i': '4' } as React.CSSProperties} data-i="4">
                <div className="stg-head"><span className="stg-no">Tahap 04</span><h3>Luaran Pendukung Keputusan</h3></div>
                <p>Hasil akhir disajikan sebagai kelas prediksi beserta probabilitas setiap kelas secara transparan — membantu klinisi menentukan langkah berikutnya, misalnya merujuk pasien ke pemeriksaan ekokardiografi.</p>
                <div className="viz">
                  <div className="mock" aria-hidden="true">
                    <div className="mock-row"><span>NON-HF</span><div className="mtrack"><i style={{ width: '6%', background: 'var(--green)' }} /></div><span>6.4%</span></div>
                    <div className="mock-row"><span>HFrEF</span><div className="mtrack"><i style={{ width: '11%', background: 'var(--red)' }} /></div><span>11.2%</span></div>
                    <div className="mock-row"><span>HFpEF</span><div className="mtrack"><i style={{ width: '82%', background: 'var(--amber)' }} /></div><span>82.4%</span></div>
                    <div className="foot">Prediksi dominan: <b>HFpEF</b> · Rekomendasi: verifikasi ekokardiografi &amp; evaluasi klinisi.</div>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* ─── DEMO ─── */}
        <section className="sec demo on-dark" id="demo">
          <div className="wrap">
            <div className="sec-head">
              <span className="kicker reveal">04 · Demo Interaktif</span>
              <h2><span className="lr"><span className="lr-in">Coba model — unggah EKG.</span></span></h2>
              <p className="lead reveal" style={{ '--d': '.1s' } as React.CSSProperties}>Simulasikan alur klasifikasi DIASYS: pilih salah satu sampel sinyal atau unggah berkas Anda, lalu jalankan pipeline CWT → Two-Stage CNN dan lihat hasilnya.</p>
            </div>

            <div className="demo-grid">
              <div className="panel reveal">
                <h3>A · Pilih Sampel</h3>
                <div className="samples" role="group" aria-label="Pilih sampel EKG">
                  <button className="sample" type="button" data-sample="A"><span className="code">S-A</span><span><span className="s-name">Pasien 68 th</span><span className="s-meta">Keluhan sesak saat aktivitas</span></span><span className="dot" /></button>
                  <button className="sample" type="button" data-sample="B"><span className="code">S-B</span><span><span className="s-name">Kontrol sehat 54 th</span><span className="s-meta">Tanpa keluhan kardiovaskular</span></span><span className="dot" /></button>
                  <button className="sample" type="button" data-sample="C"><span className="code">S-C</span><span><span className="s-name">Pasien 61 th</span><span className="s-meta">Riwayat hipertensi kronis</span></span><span className="dot" /></button>
                </div>
                <div className="divider">atau unggah sinyal anda</div>
                <input type="file" id="fileInput" accept=".csv,.txt,.dat,.hea,.json,.png" hidden />
                {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
                <label className="dz" htmlFor="fileInput" id="dzLabel">Seret berkas ke sini atau <b>klik untuk memilih</b><br /><small>.csv · .txt · .dat · .json · gambar EKG</small><span className="fn" id="dzName" /></label>
                <div className="run-row">
                  <button className="btn btn-primary" id="runBtn" disabled>Jalankan Analisis <span className="arr">▸</span></button>
                  <button id="resetBtn" type="button">↺ Ulangi</button>
                </div>
                <p className="sim-note">Demo ini menjalankan <b>simulasi pipeline</b> dengan data contoh untuk memperkenalkan alur kerja sistem — bukan inferensi model produksi dan bukan hasil diagnostik.</p>
              </div>

              <div className="panel reveal" style={{ '--d': '.12s' } as React.CSSProperties}>
                <h3>B · Pratinjau &amp; Hasil</h3>
                <div className="preview-wrap">
                  <span className="badge-sim">SIMULASI</span>
                  <canvas ref={previewRef} />
                </div>
                <div className="pbar" aria-hidden="true"><span ref={runProgRef} /></div>
                <div className="console" ref={consoleRef} aria-live="polite">
                  <div className="ln"><span className="t">00:00.0</span>▸ sistem siap — pilih sampel atau unggah sinyal untuk memulai.</div>
                </div>

                <div className="result" ref={resultBoxRef}>
                  <div className="r-kicker">Hasil Klasifikasi · Two-Stage CNN</div>
                  <div className="verdict" id="verdictTitle">—</div>
                  <p className="r-desc" id="verdictDesc" />
                  <div className="r-bars">
                    <div className="r-bar c-non"><span>NON-HF</span><div className="rtrack"><span id="barNon" /></div><span id="valNon">—</span></div>
                    <div className="r-bar c-ref"><span>HFrEF</span><div className="rtrack"><span id="barHfref" /></div><span id="valHfref">—</span></div>
                    <div className="r-bar c-pef"><span>HFpEF</span><div className="rtrack"><span id="barHfpef" /></div><span id="valHfpef">—</span></div>
                  </div>
                  <div className="r-stage1">CNN TAHAP 1 · p(HF) = <b id="pStage1">—</b> · p(Non-HF) = <b id="pStage1b">—</b></div>
                  <p className="r-disc">⚠ Keluaran ini bersifat probabilistik dan merupakan simulasi — bukan diagnosis. Keputusan klinis tetap berada di tangan dokter.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── BATASAN ─── */}
        <section className="sec" id="batasan">
          <div className="wrap">
            <div className="sec-head">
              <span className="kicker reveal">05 · Batasan &amp; Penggunaan</span>
              <h2><span className="lr"><span className="lr-in">Dibaca sebelum digunakan.</span></span></h2>
            </div>
            <div className="disc-box reveal">
              <div className="disc-head">
                <span className="sign" aria-hidden="true">!</span>
                <h3>Pernyataan Batasan Penggunaan</h3>
              </div>
              <div className="disc-body">
                <ul className="disc-list">
                  <li>DIASYS dirancang sebagai <b>Clinical Decision Support System</b> — alat bantu skrining awal dan pendukung keputusan klinis, <b>bukan pengganti diagnosis mutlak</b> dari dokter spesialis.</li>
                  <li>Hasil klasifikasi bersifat probabilistik dan harus diverifikasi melalui pemeriksaan lanjutan — termasuk ekokardiografi — oleh dokter yang berwenang.</li>
                  <li>Keluaran sistem tidak boleh digunakan sebagai satu-satunya dasar pengambilan keputusan terapi, terlebih pada kondisi gawat darurat.</li>
                  <li>Gunakan data yang telah dianonimkan. Jangan mengunggah rekaman EKG yang memuat identitas pasien pada platform versi riset ini.</li>
                </ul>
                <div className="disc-cols">
                  <div className="disc-col yes">
                    <h4>✓ Direkomendasikan untuk</h4>
                    <ul><li>Skrining awal subtipe gagal jantung</li><li>Prioritisasi rujukan ekokardiografi</li><li>Edukasi &amp; riset kardiovaskular</li></ul>
                  </div>
                  <div className="disc-col no">
                    <h4>✕ Bukan untuk</h4>
                    <ul><li>Menggantikan penilaian dokter</li><li>Dasar tunggal keputusan terapi</li><li>Penanganan kondisi darurat</li></ul>
                  </div>
                </div>
              </div>
            </div>
            <p className="disc-final reveal">"Teknologi terbaik adalah yang memperluas pertimbangan klinisi — bukan yang menggantikannya."</p>
          </div>
        </section>

        {/* ─── FAQ ─── */}
        <section className="sec" id="faq" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <div className="sec-head">
              <span className="kicker reveal">06 · Pertanyaan Umum</span>
              <h2><span className="lr"><span className="lr-in">Hal yang sering ditanyakan.</span></span></h2>
            </div>
            <div className="faq-list">
              <div className="faq-item">
                <button className="faq-q" aria-expanded="false">Apakah DIASYS menggantikan ekokardiografi?<span className="pm">+</span></button>
                <div className="faq-a"><p>Tidak. DIASYS berfungsi sebagai alat skrining dan pendukung keputusan awal. Konfirmasi diagnosis dan pengukuran fraksi ejeksi tetap membutuhkan ekokardiografi serta evaluasi dokter spesialis jantung.</p></div>
              </div>
              <div className="faq-item">
                <button className="faq-q" aria-expanded="false">Data apa yang dibutuhkan sistem?<span className="pm">+</span></button>
                <div className="faq-a"><p>Rekaman sinyal EKG permukaan — misalnya Lead II dengan durasi singkat beberapa detik — dalam format digital (CSV/TXT atau hasil ekspor perangkat EKG). Sinyal akan dinormalisasi sebelum diproses.</p></div>
              </div>
              <div className="faq-item">
                <button className="faq-q" aria-expanded="false">Untuk siapa platform ini ditujukan?<span className="pm">+</span></button>
                <div className="faq-a"><p>Dokter, perawat, dan tenaga medis — khususnya di fasilitas layanan primer dengan akses ekokardiografi terbatas — serta peneliti kardiovaskular. Keputusan akhir selalu berada pada klinisi yang menangani pasien.</p></div>
              </div>
              <div className="faq-item">
                <button className="faq-q" aria-expanded="false">Bagaimana hasil harus dibaca?<span className="pm">+</span></button>
                <div className="faq-a"><p>Hasil berupa kelas prediksi beserta probabilitas setiap kelas (Non-HF, HFrEF, HFpEF). Probabilitas rendah–menengah sebaiknya ditindaklanjuti dengan pemeriksaan tambahan; probabilitas tinggi menjadi dasar prioritasi rujukan.</p></div>
              </div>
              <div className="faq-item">
                <button className="faq-q" aria-expanded="false">Apakah data pasien aman?<span className="pm">+</span></button>
                <div className="faq-a"><p>Dalam lingkup riset ini, pengguna diminta hanya mengunggah data yang telah dianonimkan. Jangan memasukkan berkas yang memuat informasi identitas pasien apa pun.</p></div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap">
          <div className="foot-grid">
            <div className="foot-brand">
              <a className="brand" href="#atas">
                <svg width="26" height="16" viewBox="0 0 26 16" fill="none" aria-hidden="true"><path d="M0 9h5l2-5 3 10 3-13 3 11 2-3h8" stroke="#2EE6A8" stroke-width="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                DIASYS <em>PROJECT</em>
              </a>
              <p>Sistem pendukung keputusan klinis untuk klasifikasi non-invasif gagal jantung sistolik dan diastolik berbasis sinyal EKG, Continuous Wavelet Transform, dan Two-Stage Deep Learning.</p>
            </div>
            <div>
              <h5>Navigasi</h5>
              <ul>
                <li><a href="#tentang">Tentang Platform</a></li>
                <li><a href="#masalah">Latar Belakang</a></li>
                <li><a href="#cara-kerja">Cara Kerja</a></li>
                <li><a href="#demo">Demo Model</a></li>
                <li><a href="#batasan">Batasan &amp; Penggunaan</a></li>
              </ul>
            </div>
            <div>
              <h5>Status</h5>
              <ul>
                <li>Versi riset · 2026</li>
                <li>CDSS — non-diagnostik</li>
                <li>HF · HFrEF · HFpEF</li>
                <li><a href="#atas">↑ Kembali ke atas</a></li>
              </ul>
            </div>
          </div>
          <div className="foot-bottom">
            <span>© <span id="year">2026</span> DIASYS PROJECT — dikembangkan untuk riset pendukung keputusan klinis kardiovaskular.</span>
            <span>EKG ✚ CWT ✚ TWO-STAGE CNN</span>
          </div>
        </div>
      </footer>
    </>
  )
}

/* ═══════════════════════════════════════════════════════════════════════ */
/*  COMPLETE CSS FOR LANDING PAGE — injected as <style>                  */
/* ═══════════════════════════════════════════════════════════════════════ */
const LandingCSS = `
/* ========== TOKENS & RESET ========== */
.lp-noise{position:fixed;inset:0;z-index:60;pointer-events:none;opacity:.05;mix-blend-mode:multiply;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E")}
.lp-progress{position:fixed;top:0;left:0;right:0;height:3px;z-index:90}
.lp-progress span{display:block;height:100%;width:0;background:linear-gradient(90deg,#0B8A63,#2EE6A8)}
.lp-skip{position:absolute;left:-999px;top:0;background:#0E1F19;color:#fff;padding:.6rem 1rem;z-index:99}
.lp-skip:focus{left:12px;top:12px}

/* ========== UTIL ========== */
.kicker{display:inline-flex;align-items:center;gap:.6rem;font-family:'IBM Plex Mono',monospace;font-size:.7rem;letter-spacing:.22em;text-transform:uppercase;color:#0B8A63;font-weight:500}
.kicker::before{content:"";width:26px;height:1px;background:#0B8A63}
.on-dark .kicker{color:#2EE6A8}.on-dark .kicker::before{background:#2EE6A8}
h1,h2,h3{font-family:'Fraunces',Georgia,serif;font-weight:600;letter-spacing:-.015em;line-height:1.08}
h2{font-size:clamp(1.9rem,3.6vw,3rem);margin:.9rem 0 1rem}
.accent{color:#0B8A63;font-style:italic;font-weight:500}
.on-dark .accent{color:#2EE6A8}
.lead{color:#54655D;max-width:62ch}
.on-dark .lead{color:#9DB4A9}
.reveal{opacity:0;transform:translateY(24px);transition:opacity .7s ease,transform .75s cubic-bezier(.2,.6,.2,1);transition-delay:var(--d,0s)}
.reveal.in{opacity:1;transform:none}
.lr{display:block;overflow:hidden}
.lr .lr-in{display:block;transform:translateY(112%);transition:transform .85s cubic-bezier(.2,.7,.2,1);transition-delay:var(--d,0s)}
.lr.in .lr-in{transform:none}
.wrap{max-width:1200px;margin:0 auto;padding:0 clamp(1.1rem,4vw,2.5rem)}

/* ========== NAV ========== */
.lp-nav{position:fixed;top:0;left:0;right:0;z-index:80;height:66px;border-bottom:1px solid transparent;transition:background .3s,border-color .3s}
.lp-nav.scrolled{background:rgba(245,243,236,.9);backdrop-filter:blur(10px);border-bottom-color:rgba(14,31,25,.15)}
.nav-in{height:66px;display:flex;align-items:center;justify-content:space-between;gap:1rem}
.brand{display:flex;align-items:center;gap:.55rem;font-family:'Fraunces',Georgia,serif;font-weight:600;font-size:1.22rem}
.brand em{font-family:'IBM Plex Mono',monospace;font-style:normal;font-size:.6rem;letter-spacing:.28em;color:#54655D;margin-top:.5rem}
.nav-links{display:flex;gap:1.5rem;font-size:.9rem;font-weight:500}
.nav-links a{position:relative;padding:.3rem 0;color:#54655D;transition:color .2s}
.nav-links a::after{content:"";position:absolute;left:0;bottom:0;width:100%;height:1.5px;background:#0B8A63;transform:scaleX(0);transform-origin:right;transition:transform .3s cubic-bezier(.2,.7,.2,1)}
.nav-links a:hover{color:#0E1F19}
.nav-links a:hover::after{transform:scaleX(1);transform-origin:left}
.nav-right{display:flex;align-items:center;gap:1rem}
.status{display:inline-flex;align-items:center;gap:.45rem;font-family:'IBM Plex Mono',monospace;font-size:.66rem;letter-spacing:.16em;color:#0B8A63}
.status i{width:8px;height:8px;border-radius:50%;background:#2EE6A8;animation:blink 1.6s ease-in-out infinite}
@keyframes blink{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(46,230,168,.5)}50%{opacity:.45;box-shadow:0 0 0 5px rgba(46,230,168,0)}}
.btn{display:inline-flex;align-items:center;gap:.6rem;padding:.85rem 1.35rem;border-radius:6px;font-weight:600;font-size:.93rem;border:1px solid transparent;transition:background .25s,color .25s,border-color .25s;line-height:1;cursor:pointer;font-family:inherit}
.btn .arr{transition:transform .25s}
.btn:hover .arr{transform:translateX(4px)}
.btn-primary{background:#0E1F19;color:#fff}
.btn-primary:hover{background:#0B8A63}
.btn-ghost{border-color:rgba(14,31,25,.15);color:#0E1F19;background:transparent}
.btn-ghost:hover{border-color:#0E1F19}
.btn-sm{padding:.6rem 1rem;font-size:.85rem}

/* ========== HERO ========== */
.hero{padding:calc(66px + clamp(1.6rem,4vh,2.8rem)) 0 clamp(2.5rem,6vh,4rem)}
.hero-meta-bar{display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;border-top:1px solid rgba(14,31,25,.15);border-bottom:1px solid rgba(14,31,25,.15);padding:.55rem .1rem;font-family:'IBM Plex Mono',monospace;font-size:.64rem;letter-spacing:.16em;text-transform:uppercase;color:#54655D;margin-bottom:clamp(2rem,5vh,3.4rem)}
.hero-meta-bar .mid{color:#0B8A63}
.hero-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:clamp(2rem,5vw,4.5rem);align-items:center}
.h1-title{display:block;font-size:clamp(3.4rem,9vw,6.4rem);line-height:.95;color:#0E1F19}
.h1-sub{font-family:'Fraunces',Georgia,serif;font-size:clamp(1.3rem,2.6vw,1.95rem);font-weight:500;line-height:1.3;margin-top:1rem;color:#0E1F19}
.hero p.lead{margin:1.4rem 0 2rem}
.cta-row{display:flex;flex-wrap:wrap;gap:.9rem}
.hero-specs{margin-top:2.3rem;display:flex;flex-wrap:wrap;gap:.4rem 1.6rem;font-family:'IBM Plex Mono',monospace;font-size:.68rem;letter-spacing:.12em;color:#54655D}
.hero-specs b{color:#0E1F19;font-weight:500}
.monitor{background:#0A1512;border:1px solid rgba(220,240,232,.11);border-radius:12px;overflow:hidden;box-shadow:0 34px 70px -38px rgba(10,21,18,.7)}
.mon-head,.mon-foot{display:flex;justify-content:space-between;align-items:center;padding:.7rem 1.1rem;font-family:'IBM Plex Mono',monospace;font-size:.64rem;letter-spacing:.14em;color:#7FA394}
.mon-head{border-bottom:1px solid rgba(220,240,232,.11)}
.mon-foot{border-top:1px solid rgba(220,240,232,.11);gap:.8rem;flex-wrap:wrap}
.live{display:inline-flex;align-items:center;gap:.45rem;color:#2EE6A8}
.live i{width:7px;height:7px;border-radius:50%;background:#2EE6A8;animation:blink 1.2s infinite}
.mon-screen{position:relative;height:210px;background:linear-gradient(rgba(46,230,168,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(46,230,168,.05) 1px,transparent 1px),linear-gradient(rgba(46,230,168,.1) 1px,transparent 1px),linear-gradient(90deg,rgba(46,230,168,.1) 1px,transparent 1px),#081210;background-size:12px 12px,12px 12px,60px 60px,60px 60px}
.mon-screen svg{width:100%;height:100%}
.trace{fill:none;stroke:#2EE6A8;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1000;filter:drop-shadow(0 0 5px rgba(46,230,168,.75));animation:traceSweep 7s linear infinite}
@keyframes traceSweep{0%{stroke-dashoffset:1000}50%{stroke-dashoffset:0}100%{stroke-dashoffset:-1000}}
.sweep{position:absolute;top:0;bottom:0;width:2px;background:linear-gradient(rgba(46,230,168,0),rgba(46,230,168,.5),rgba(46,230,168,0));animation:sweepX 7s linear infinite}
@keyframes sweepX{0%{left:0;opacity:1}48%{left:100%;opacity:1}50%{opacity:0}100%{left:100%;opacity:0}}
.hr-val{font-family:'IBM Plex Mono',monospace;color:#2EE6A8;font-size:1rem}
.mon-chip{color:#2EE6A8;border:1px solid rgba(46,230,168,.35);padding:.25rem .6rem;border-radius:99px}

/* signal divider + ticker */
.sig-strip{border-top:1px solid rgba(14,31,25,.15);border-bottom:1px solid rgba(14,31,25,.15);background:#FFFDF7}
.sig-strip canvas{display:block;width:100%;height:84px}
.ticker{border-bottom:1px solid rgba(14,31,25,.15);overflow:hidden;background:#ECE8DD}
.ticker-track{display:flex;gap:2.6rem;width:max-content;padding:.85rem 0;font-family:'IBM Plex Mono',monospace;font-size:.7rem;letter-spacing:.2em;text-transform:uppercase;color:#54655D;animation:tick 30s linear infinite}
.ticker:hover .ticker-track{animation-play-state:paused}
.ticker-track b{color:#0B8A63;font-weight:400}
@keyframes tick{to{transform:translateX(-50%)}}

/* ========== SECTIONS ========== */
.sec{padding:clamp(4rem,9vh,7rem) 0}
.sec-head{max-width:760px;margin-bottom:clamp(2rem,5vh,3.5rem)}

/* ABOUT */
.about-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:clamp(2rem,5vw,4rem);align-items:start}
.about-copy p{margin-bottom:1.1rem;color:#54655D}
.about-copy p.intro{font-family:'Fraunces',Georgia,serif;font-size:clamp(1.25rem,2vw,1.55rem);line-height:1.45;color:#0E1F19;font-weight:500}
.audience{margin-top:1.8rem;display:flex;flex-wrap:wrap;gap:.7rem}
.aud-chip{display:inline-flex;align-items:center;gap:.55rem;padding:.6rem 1rem;border:1px solid rgba(14,31,25,.15);border-radius:8px;background:#FFFDF7;font-size:.86rem;font-weight:500;transition:transform .25s,border-color .25s}
.aud-chip:hover{transform:translateY(-3px);border-color:#0B8A63}
.aud-chip span{width:9px;height:9px;background:#0B8A63;border-radius:2px}
.aud-chip:nth-child(2) span{background:#E7A63A}
.aud-chip:nth-child(3) span{background:#E0502E}
.spec{background:#FFFDF7;border:1px solid rgba(14,31,25,.15);border-radius:10px;overflow:hidden}
.spec h3{font-family:'IBM Plex Mono',monospace;font-weight:500;font-size:.66rem;letter-spacing:.22em;text-transform:uppercase;color:#54655D;padding:1rem 1.3rem;border-bottom:1px solid rgba(14,31,25,.15);background:#ECE8DD}
.spec dl{padding:.4rem 0}
.spec .row{display:grid;grid-template-columns:112px 1fr;gap:1rem;padding:.66rem 1.3rem;font-size:.88rem;border-bottom:1px dashed rgba(14,31,25,.12)}
.spec .row:last-child{border-bottom:none}
.spec dt{font-family:'IBM Plex Mono',monospace;font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:#54655D;padding-top:.15rem}
.spec dd{font-weight:500}
.spec dd small{display:block;color:#54655D;font-weight:400;font-size:.8rem}

/* PROBLEM (dark) */
.problem{background:#0A1512;color:#E6F2EC;position:relative}
.problem::before{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(rgba(46,230,168,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(46,230,168,.035) 1px,transparent 1px);background-size:56px 56px;mask-image:radial-gradient(ellipse at 72% 8%,#000 0%,transparent 70%)}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:rgba(220,240,232,.11);border:1px solid rgba(220,240,232,.11);border-radius:10px;overflow:hidden;margin-bottom:clamp(2.5rem,6vh,4rem)}
.stat{background:#0F1E19;padding:1.6rem 1.5rem;transition:background .3s}
.stat:hover{background:#14291F}
.stat .num{font-family:'Fraunces',Georgia,serif;font-size:clamp(2rem,3.6vw,2.9rem);color:#2EE6A8;font-weight:600;line-height:1}
.stat .lbl{margin-top:.55rem;font-size:.84rem;color:#9DB4A9;line-height:1.45}
.prob-list{border-top:1px solid rgba(220,240,232,.11)}
.prob-item{display:grid;grid-template-columns:90px 1fr;gap:1.5rem;padding:2rem 0;border-bottom:1px solid rgba(220,240,232,.11);transition:padding-left .35s cubic-bezier(.2,.7,.2,1)}
.prob-item:hover{padding-left:1rem}
.prob-item .no{font-family:'IBM Plex Mono',monospace;font-size:1.7rem;color:#E0502E}
.prob-item h3{font-size:clamp(1.15rem,2vw,1.5rem);margin-bottom:.5rem;color:#fff}
.prob-item p{color:#9DB4A9;max-width:64ch;font-size:.95rem}
.prob-item .tag{display:inline-block;margin-top:.8rem;font-family:'IBM Plex Mono',monospace;font-size:.6rem;letter-spacing:.2em;text-transform:uppercase;color:#E7A63A;border:1px solid rgba(231,166,58,.35);padding:.3rem .7rem;border-radius:99px}
.solution{margin-top:clamp(2.5rem,6vh,4rem);border:1px solid rgba(46,230,168,.3);border-radius:12px;padding:clamp(1.6rem,4vw,2.6rem);display:flex;flex-wrap:wrap;align-items:center;gap:1.6rem;justify-content:space-between;background:linear-gradient(120deg,rgba(46,230,168,.07),rgba(11,138,99,.02))}
.solution p{font-family:'Fraunces',Georgia,serif;font-size:clamp(1.15rem,2.1vw,1.55rem);line-height:1.45;max-width:48ch;font-weight:500}
.solution .hl{color:#2EE6A8;font-style:italic}

/* METHODOLOGY */
.method{background:linear-gradient(rgba(14,31,25,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(14,31,25,.045) 1px,transparent 1px),#F5F3EC;background-size:30px 30px,30px 30px,auto}
.method-grid{display:grid;grid-template-columns:minmax(280px,400px) 1fr;gap:clamp(2rem,5vw,4.5rem);align-items:start}
.method-left{position:sticky;top:calc(66px + 24px)}
.stages-index{list-style:none;margin:1.8rem 0;border-top:1px solid rgba(14,31,25,.15)}
.stages-index li{border-bottom:1px solid rgba(14,31,25,.15)}
.stages-index button{width:100%;display:flex;align-items:baseline;gap:1rem;padding:.85rem .2rem;background:none;border:none;font-family:'IBM Plex Mono',monospace;font-size:.78rem;letter-spacing:.08em;color:#54655D;text-align:left;transition:color .25s,padding-left .3s;cursor:pointer}
.stages-index button b{font-weight:500;color:#0B8A63}
.stages-index li.active button{color:#0E1F19;padding-left:.7rem}
.stages-index li.active button::before{content:"▸ ";color:#0B8A63}
.method-note{font-family:'IBM Plex Mono',monospace;font-size:.68rem;letter-spacing:.1em;color:#54655D}
.stack{display:grid;gap:1.4rem}
.stage-card{position:sticky;top:calc(66px + 20px + var(--i,0) * 16px);background:#FFFDF7;border:1px solid rgba(14,31,25,.15);border-radius:10px;padding:clamp(1.4rem,3vw,2.2rem);box-shadow:0 24px 50px -28px rgba(14,31,25,.35);min-height:380px;display:flex;flex-direction:column;gap:1rem}
.stg-head{display:flex;align-items:center;gap:1rem;flex-wrap:wrap}
.stg-no{font-family:'IBM Plex Mono',monospace;font-size:.62rem;letter-spacing:.22em;text-transform:uppercase;background:#0E1F19;color:#fff;padding:.35rem .7rem;border-radius:4px;transition:background .3s}
.stage-card:hover .stg-no{background:#0B8A63}
.stg-head h3{font-size:clamp(1.15rem,2vw,1.45rem)}
.stage-card>p{color:#54655D;font-size:.95rem;max-width:66ch}
.viz{flex:1;min-height:170px;border:1px solid rgba(14,31,25,.15);border-radius:8px;overflow:hidden;position:relative;background:#ECE8DD}
.viz canvas{position:absolute;inset:0;width:100%;height:100%}
.viz .cap{position:absolute;right:.7rem;bottom:.5rem;font-family:'IBM Plex Mono',monospace;font-size:.58rem;letter-spacing:.14em;text-transform:uppercase;color:rgba(14,31,25,.55);z-index:2}
.viz.dark{background:#081210;border-color:rgba(220,240,232,.11)}
.viz.dark .cap{color:rgba(230,242,236,.5)}
.net{display:flex;align-items:center;justify-content:center;gap:clamp(.8rem,2.5vw,1.8rem);height:100%;padding:1rem}
.net-col{display:flex;flex-direction:column;align-items:center;gap:.5rem}
.net-col .lbl{font-family:'IBM Plex Mono',monospace;font-size:.56rem;letter-spacing:.18em;text-transform:uppercase;color:#54655D}
.bars{display:flex;align-items:flex-end;gap:5px;height:110px}
.bars i{width:12px;height:calc(110px * var(--hh));background:#0E1F19;border-radius:2px;animation:pulseBar 2.6s ease-in-out infinite;animation-delay:calc(var(--dd) * .25s);transform-origin:bottom;display:block}
@keyframes pulseBar{0%,100%{transform:scaleY(1)}50%{transform:scaleY(.82)}}
.layers{display:flex;align-items:center;gap:7px}
.layers i{display:block;background:#F5F3EC;border:1.5px solid #0E1F19;border-radius:3px;transition:border-color .3s}
.layers i:nth-child(1){width:34px;height:96px}
.layers i:nth-child(2){width:26px;height:70px}
.layers i:nth-child(3){width:18px;height:46px}
.stage-card:hover .layers i{border-color:#0B8A63}
.net-arrow{font-family:'IBM Plex Mono',monospace;color:#0B8A63;font-size:1.2rem;animation:nudge 1.8s ease-in-out infinite}
@keyframes nudge{0%,100%{transform:translateX(0)}50%{transform:translateX(5px)}}
.tags-out{display:flex;flex-direction:column;gap:.5rem}
.tag-out{font-family:'IBM Plex Mono',monospace;font-size:.66rem;letter-spacing:.08em;padding:.45rem .8rem;border-radius:5px;border:1px solid rgba(14,31,25,.15);background:#F5F3EC;transition:transform .3s,background .3s,border-color .3s}
.tag-out.hot{background:#0E1F19;color:#fff;border-color:#0E1F19}
.stage-card:hover .tag-out.hot{background:#0B8A63;border-color:#0B8A63;transform:translateX(4px)}
.mock{padding:1.2rem;display:flex;flex-direction:column;gap:.8rem;height:100%;justify-content:center}
.mock-row{display:grid;grid-template-columns:76px 1fr 52px;gap:.8rem;align-items:center;font-family:'IBM Plex Mono',monospace;font-size:.66rem;letter-spacing:.06em;color:#54655D}
.mtrack{height:8px;background:rgba(14,31,25,.09);border-radius:99px;overflow:hidden}
.mtrack i{display:block;height:100%;border-radius:99px}
.mock .foot{font-size:.78rem;color:#54655D;border-top:1px dashed rgba(14,31,25,.15);padding-top:.8rem}
.mock .foot b{color:#E0502E}

/* DEMO (dark) */
.demo{background:#0A1512;color:#E6F2EC}
.demo-grid{display:grid;grid-template-columns:.92fr 1.08fr;gap:clamp(1.5rem,4vw,3rem);align-items:start}
.panel{background:#0F1E19;border:1px solid rgba(220,240,232,.11);border-radius:12px;padding:clamp(1.2rem,3vw,1.8rem)}
.panel h3{font-family:'IBM Plex Mono',monospace;font-weight:500;font-size:.66rem;letter-spacing:.22em;text-transform:uppercase;color:#7FA394;margin-bottom:1.1rem}
.samples{display:grid;gap:.7rem}
.sample{display:flex;align-items:center;gap:1rem;text-align:left;background:transparent;border:1px solid rgba(220,240,232,.11);border-radius:8px;padding:.9rem 1rem;color:#E6F2EC;transition:border-color .25s,background .25s,transform .25s;cursor:pointer;font-family:inherit}
.sample:hover{border-color:rgba(46,230,168,.5);transform:translateX(4px)}
.sample.sel{border-color:#2EE6A8;background:rgba(46,230,168,.07)}
.sample .code{font-family:'IBM Plex Mono',monospace;font-size:.7rem;color:#2EE6A8;border:1px solid rgba(46,230,168,.4);border-radius:4px;padding:.35rem .55rem}
.sample .s-name{font-weight:600;font-size:.92rem;display:block}
.sample .s-meta{font-size:.78rem;color:#8CA79B}
.sample .dot{margin-left:auto;width:14px;height:14px;border-radius:50%;border:2px solid rgba(220,240,232,.11);flex:none;transition:border-color .25s,background .25s}
.sample.sel .dot{border-color:#2EE6A8;background:#2EE6A8;box-shadow:inset 0 0 0 3px #0F1E19}
.divider{display:flex;align-items:center;gap:1rem;margin:1.3rem 0;font-family:'IBM Plex Mono',monospace;font-size:.6rem;letter-spacing:.24em;text-transform:uppercase;color:#7FA394}
.divider::before,.divider::after{content:"";flex:1;height:1px;background:rgba(220,240,232,.11)}
.dz{display:block;border:1.5px dashed rgba(220,240,232,.11);border-radius:8px;padding:1.3rem;text-align:center;cursor:pointer;transition:border-color .25s,background .25s;font-size:.88rem;color:#9DB4A9}
.dz:hover,.dz.drag{border-color:#2EE6A8;background:rgba(46,230,168,.05)}
.dz b{color:#E6F2EC}
.dz .fn{display:block;margin-top:.4rem;font-family:'IBM Plex Mono',monospace;font-size:.7rem;color:#2EE6A8}
.run-row{margin-top:1.4rem;display:flex;align-items:center;gap:1rem;flex-wrap:wrap}
#resetBtn{background:none;border:none;color:#7FA394;font-family:'IBM Plex Mono',monospace;font-size:.7rem;letter-spacing:.14em;text-decoration:underline;display:none;cursor:pointer}
#resetBtn.show{display:inline}
.sim-note{margin-top:1.1rem;font-size:.76rem;color:#7FA394;line-height:1.55}
.preview-wrap{position:relative;border:1px solid rgba(220,240,232,.11);border-radius:8px;overflow:hidden;aspect-ratio:2.2/1;background:#081210}
.preview-wrap canvas{position:absolute;inset:0;width:100%;height:100%}
.badge-sim{position:absolute;top:.6rem;left:.6rem;z-index:2;font-family:'IBM Plex Mono',monospace;font-size:.56rem;letter-spacing:.2em;background:rgba(231,166,58,.15);color:#E7A63A;border:1px solid rgba(231,166,58,.4);padding:.3rem .6rem;border-radius:4px}
.pbar{height:4px;background:rgba(220,240,232,.11);border-radius:99px;margin:1rem 0 .9rem;overflow:hidden}
.pbar span{display:block;height:100%;width:0;background:linear-gradient(90deg,#0B8A63,#2EE6A8);transition:width .5s ease}
.console{background:#081210;border:1px solid rgba(220,240,232,.11);border-radius:8px;height:172px;overflow-y:auto;padding:.9rem 1rem;font-family:'IBM Plex Mono',monospace;font-size:.7rem;line-height:1.9;color:#8CA79B}
.console .ln{opacity:0;animation:lnIn .35s forwards}
@keyframes lnIn{to{opacity:1}}
.console .t{color:#4E6A5D;margin-right:.6rem}
.console .ok{color:#2EE6A8}
.console .cur::after{content:"▮";animation:blink 1s infinite;color:#2EE6A8}
.result{margin-top:1.1rem;border:1px solid rgba(220,240,232,.11);border-radius:10px;padding:1.4rem;display:none;opacity:0;transform:translateY(14px);transition:opacity .6s,transform .6s}
.result.show{display:block;opacity:1;transform:none}
.result .r-kicker{font-family:'IBM Plex Mono',monospace;font-size:.6rem;letter-spacing:.24em;text-transform:uppercase;color:#7FA394}
.result .verdict{font-family:'Fraunces',Georgia,serif;font-size:clamp(1.4rem,2.6vw,1.9rem);font-weight:600;margin:.4rem 0 .5rem;line-height:1.15}
.verdict.v-non{color:#2EE6A8}.verdict.v-hfref{color:#FF7A56}.verdict.v-hfpef{color:#E7A63A}
.result .r-desc{font-size:.88rem;color:#9DB4A9;margin-bottom:1.2rem}
.r-bars{display:grid;gap:.7rem;margin-bottom:1.1rem}
.r-bar{display:grid;grid-template-columns:86px 1fr 58px;gap:.9rem;align-items:center;font-family:'IBM Plex Mono',monospace;font-size:.68rem;letter-spacing:.06em;color:#9DB4A9}
.rtrack{height:10px;background:rgba(220,240,232,.08);border-radius:99px;overflow:hidden}
.rtrack span{display:block;height:100%;width:0;border-radius:99px;transition:width 1.1s cubic-bezier(.2,.7,.2,1)}
.r-bar.c-non span{background:#2EE6A8}.r-bar.c-ref span{background:#FF7A56}.r-bar.c-pef span{background:#E7A63A}
.r-stage1{font-family:'IBM Plex Mono',monospace;font-size:.68rem;color:#7FA394;border-top:1px dashed rgba(220,240,232,.11);padding-top:.9rem}
.r-stage1 b{color:#2EE6A8;font-weight:500}
.r-disc{margin-top:.9rem;font-size:.76rem;color:#E7A63A}

/* DISCLAIMER */
.disc-box{border:1.5px solid #0E1F19;border-radius:12px;background:#FFFDF7;overflow:hidden}
.disc-head{display:flex;align-items:center;gap:.9rem;padding:1.2rem 1.6rem;border-bottom:1.5px solid #0E1F19;background:#ECE8DD}
.disc-head .sign{width:34px;height:34px;flex:none;border-radius:6px;background:#E0502E;color:#fff;display:grid;place-items:center;font-family:'IBM Plex Mono',monospace}
.disc-head h3{font-size:1.15rem}
.disc-body{padding:clamp(1.4rem,3.5vw,2.2rem) clamp(1.2rem,3.5vw,2rem);display:grid;grid-template-columns:1.1fr .9fr;gap:2rem}
.disc-list{list-style:none;display:grid;gap:.95rem}
.disc-list li{display:flex;gap:.85rem;font-size:.93rem;color:#54655D;line-height:1.55}
.disc-list li::before{content:"!";flex:none;width:20px;height:20px;border-radius:50%;border:1.5px solid #E0502E;color:#E0502E;font-family:'IBM Plex Mono',monospace;font-size:.7rem;display:grid;place-items:center;margin-top:.15rem}
.disc-cols{display:grid;grid-template-columns:1fr 1fr;gap:1.2rem;align-content:start}
.disc-col{border:1px solid rgba(14,31,25,.15);border-radius:8px;padding:1.1rem;background:#F5F3EC}
.disc-col h4{font-family:'IBM Plex Mono',monospace;font-weight:500;font-size:.6rem;letter-spacing:.22em;text-transform:uppercase;margin-bottom:.7rem}
.disc-col.yes h4{color:#0B8A63}.disc-col.no h4{color:#E0502E}
.disc-col ul{list-style:none;display:grid;gap:.45rem;font-size:.84rem;color:#54655D}
.disc-col li{padding-left:1.1rem;position:relative}
.disc-col.yes li::before{content:"✓";position:absolute;left:0;color:#0B8A63;font-size:.75rem}
.disc-col.no li::before{content:"✕";position:absolute;left:0;color:#E0502E;font-size:.75rem}
.disc-final{margin-top:1.8rem;font-family:'Fraunces',Georgia,serif;font-style:italic;font-size:1.05rem;color:#0E1F19;text-align:center}

/* FAQ */
.faq-list{max-width:820px;border-top:1px solid rgba(14,31,25,.15)}
.faq-item{border-bottom:1px solid rgba(14,31,25,.15)}
.faq-q{width:100%;display:flex;justify-content:space-between;align-items:center;gap:1.5rem;background:none;border:none;text-align:left;padding:1.3rem .2rem;font-family:'Instrument Sans',system-ui,sans-serif;font-size:1.02rem;font-weight:600;color:#0E1F19;transition:color .25s;cursor:pointer}
.faq-q:hover{color:#0B8A63}
.faq-q .pm{font-family:'IBM Plex Mono',monospace;font-size:1.1rem;color:#0B8A63;transition:transform .35s cubic-bezier(.2,.7,.2,1);flex:none}
.faq-item.open .pm{transform:rotate(45deg)}
.faq-a{max-height:0;overflow:hidden;transition:max-height .45s cubic-bezier(.2,.7,.2,1)}
.faq-a p{padding:0 .2rem 1.4rem;color:#54655D;font-size:.94rem;max-width:66ch}

/* FOOTER */
footer{background:#0A1512;color:#9DB4A9;padding:clamp(3rem,7vh,5rem) 0 2rem}
.foot-grid{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:2.5rem;padding-bottom:2.5rem;border-bottom:1px solid rgba(220,240,232,.11)}
.foot-brand .brand{color:#fff;font-size:1.4rem}
.foot-brand p{margin-top:1rem;font-size:.88rem;max-width:40ch;line-height:1.6}
footer h5{font-family:'IBM Plex Mono',monospace;font-weight:500;font-size:.62rem;letter-spacing:.24em;text-transform:uppercase;color:#7FA394;margin-bottom:1rem}
footer ul{list-style:none;display:grid;gap:.55rem;font-size:.9rem}
footer ul a{transition:color .2s}
footer ul a:hover{color:#2EE6A8}
.foot-bottom{display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap;padding-top:1.6rem;font-family:'IBM Plex Mono',monospace;font-size:.64rem;letter-spacing:.14em;color:#4E6A5D}
.foot-bottom a{color:#7FA394}.foot-bottom a:hover{color:#2EE6A8}

/* RESPONSIVE */
@media(max-width:1020px){
  .hero-grid,.about-grid,.method-grid,.demo-grid{grid-template-columns:1fr}
  .method-left{position:static}
  .stages-index{display:none}
  .stats{grid-template-columns:repeat(2,1fr)}
  .disc-body{grid-template-columns:1fr}
  .foot-grid{grid-template-columns:1fr 1fr}
}
@media(max-width:820px){.nav-links{display:none}}
@media(max-width:760px){
  .stage-card{position:static;min-height:0}
  .prob-item{grid-template-columns:1fr;gap:.4rem}
  .spec .row{grid-template-columns:96px 1fr}
  .foot-grid{grid-template-columns:1fr}
  .bars{height:80px}.bars i{height:calc(80px * var(--hh))}
  .layers i:nth-child(1){height:72px}.layers i:nth-child(2){height:54px}.layers i:nth-child(3){height:38px}
  .hero-meta-bar .mid{display:none}
}
@media(max-width:560px){.stats{grid-template-columns:1fr}.disc-cols{grid-template-columns:1fr}}

/* REDUCED MOTION */
@media(prefers-reduced-motion:reduce){
  html{scroll-behavior:auto}
  *,*::before,*::after{animation-duration:.001s!important;animation-iteration-count:1!important;transition-duration:.001s!important}
  .reveal,.lr .lr-in{opacity:1;transform:none}
  .trace{stroke-dasharray:none;animation:none}
  .sweep,.ticker-track{animation:none}
  .kb img{animation:none}
}
`
