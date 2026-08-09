import { useCallback, useRef, useState } from 'react'
import type { JSX } from 'react'
import { toastIcons } from '../lib/toastIcons'

export interface Toast {
  id: number
  msg: string
  type: string
  out?: boolean
}

export function useToasts(): { toasts: Toast[]; toast: (msg: string, type?: string) => void } {
  const [toasts, setToasts] = useState<Toast[]>([])
  const idRef = useRef(0)

  const toast = useCallback((msg: string, type = 'info') => {
    const id = ++idRef.current
    setToasts((prev) => [...prev, { id, msg, type }])
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, out: true } : t)))
    }, 3400)
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3750)
  }, [])

  return { toasts, toast }
}

export function toastTypeIcon(type: string): JSX.Element {
  return toastIcons[type] || toastIcons.info
}
