import { useCallback, useRef, useState } from 'react'
import { toastIcons } from '../lib/toastIcons.jsx'

export function useToasts() {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const toast = useCallback((msg, type = 'info') => {
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

export function toastTypeIcon(type) {
  return toastIcons[type] || toastIcons.info
}
