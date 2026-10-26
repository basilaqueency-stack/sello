import { useEffect, useRef, useState } from 'react'
import { useLang } from './i18n.js'

// A short welcome (max 2 cards) shown once per phone. `id` says which audience it is for.
const key = (id) => `sello_onboarded_${id}`
export const seenOnboarding = (id) => {
  try {
    return localStorage.getItem(key(id)) === '1'
  } catch {
    return true // if storage is blocked, don't nag on every visit
  }
}
const markSeen = (id) => {
  try {
    localStorage.setItem(key(id), '1')
  } catch {
    /* ignore */
  }
}

// steps: [{ icon, title, body }]. `open` lets a "How does this work?" link show it again.
export default function Onboarding({ id, steps, open, onClose }) {
  const { t } = useLang()
  const [i, setI] = useState(0)
  const btn = useRef(null)
  useEffect(() => {
    if (open) {
      setI(0)
      setTimeout(() => btn.current?.focus(), 50)
    }
  }, [open])
  if (!open) return null
  const last = i === steps.length - 1
  const close = () => {
    markSeen(id)
    onClose()
  }
  const step = steps[i]
  return (
    <div className="modal-back" role="presentation" onClick={close}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={step.title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-icon" aria-hidden="true">{step.icon}</div>
        <h2 className="title">{step.title}</h2>
        <p>{step.body}</p>
        <div className="dots" aria-hidden="true">
          {steps.map((_, n) => <i key={n} className={n === i ? 'on' : ''} />)}
        </div>
        <button ref={btn} className="btn primary" onClick={() => (last ? close() : setI(i + 1))}>
          {last ? t('ob.done') : t('ob.next')}
        </button>
        {!last && <button className="link-btn" onClick={close}>{t('ob.skip')}</button>}
      </div>
    </div>
  )
}
