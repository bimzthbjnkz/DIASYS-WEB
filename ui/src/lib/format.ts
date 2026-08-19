export const fmtPct = (v: number): string => (v * 100).toFixed(1).replace('.', ',') + '%'

export const fmtDate = (ts: number): string =>
  new Date(ts).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })

export const fmtTime = (ts: number): string =>
  new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })

export const fmtFullDate = (ts: number): string =>
  new Date(ts).toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

export const toNum = (c: unknown): number => {
  if (c === undefined || c === null || String(c).trim() === '') return NaN
  return Number(c)
}

export const toLocaleId = (n: number): string => n.toLocaleString('id-ID')
