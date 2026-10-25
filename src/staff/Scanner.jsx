import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

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
    ).catch(() => setError('No pudimos abrir la cámara. Permite el acceso a la cámara o busca por teléfono.'))
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
        <strong>Escanear código</strong>
        <button className="link-btn light" onClick={onClose}>Cerrar</button>
      </div>
      <div id="qr-reader" />
      {error && <p className="scanner-error">{error}</p>}
    </div>
  )
}
