import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { tr } from '../i18n.js'

// Full-screen camera view that reads a customer's QR code.
export default function Scanner({ onResult, onClose }) {
  const done = useRef(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const qr = new Html5Qrcode('qr-reader')
    qr.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: 230 },
      (text) => {
        if (done.current) return
        done.current = true
        onResult(text)
      },
      () => {}
    ).catch(() => setError(tr('sc.error')))
    return () => {
      qr.stop()
        .then(() => qr.clear())
        .catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="scanner">
      <div className="scanner-top">
        <strong>{tr('sc.title')}</strong>
        <button className="link-btn light" onClick={onClose}>{tr('sc.close')}</button>
      </div>
      <div id="qr-reader" />
      {error && <p className="scanner-error">{error}</p>}
    </div>
  )
}
