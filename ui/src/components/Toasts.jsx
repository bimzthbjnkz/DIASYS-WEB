import { toastIcons } from '../lib/toastIcons.jsx'

const ICON_COLOR = {
  success: 'text-green',
  warn: 'text-amber',
  info: 'text-primary',
}

export default function Toasts({ toasts }) {
  return (
    <div className="fixed right-[22px] bottom-[22px] z-[200] flex flex-col gap-[10px]">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast animate-toast-in ${t.out ? 'out' : ''} ${ICON_COLOR[t.type] || ICON_COLOR.info}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            {toastIcons[t.type] || toastIcons.info}
          </svg>
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  )
}
