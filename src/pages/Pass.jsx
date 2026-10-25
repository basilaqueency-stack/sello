import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { supabase, friendlyError } from '../supabase.js'
import { fmtDate, fmtDateTime, money, STATUS_LABEL, savePass } from '../lib.js'
import { Banner, StampGrid } from '../components.jsx'

const cacheKey = (token) => `sello_pass_${token}`

function readCache(token) {
  try {
    return JSON.parse(localStorage.getItem(cacheKey(token)) || 'null')
  } catch {
    return null
  }
}

export default function Pass() {
  const { token } = useParams()
  const [pass, setPass] = useState(() => readCache(token))
  const [offline, setOffline] = useState(false)
  const [loading, setLoading] = useState(!readCache(token))
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_pass', { p_token: token })
    setLoading(false)
    if (error) {
      // No signal: keep showing the last copy saved on this phone.
      setOffline(true)
      if (!readCache(token)) setError(friendlyError(error))
      return
    }
    if (!data) return setNotFound(true)
    setOffline(false)
    setPass(data)
    savePass(token, data.business.name)
    try {
      localStorage.setItem(cacheKey(token), JSON.stringify(data))
    } catch {
      /* storage blocked: fine, we just can't show it offline */
    }
  }, [token])

  useEffect(() => {
    load()
    const onVisible = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  if (loading) return <main className="page"><p className="muted">Cargando tu pase…</p></main>
  if (notFound || !pass)
    return (
      <main className="page">
        <h1 className="title">No encontramos este pase</h1>
        <Banner kind="error">{error || 'Revisa que el enlace esté completo.'}</Banner>
        <Link to="/" className="btn ghost">Ir al inicio</Link>
      </main>
    )

  const ms = pass.membership
  const status = ms?.status
  const isActive = status === 'active'

  return (
    <main className="page">
      <Link to="/" className="back-link">← Mis membresías</Link>
      {offline && <Banner kind="warn">Sin conexión. Mostrando tu último pase guardado.</Banner>}

      <div className="wallet-card">
        <div className="wallet-head">
          <span>{pass.business.name.toUpperCase()}</span>
          <span>{ms?.tier_name}</span>
        </div>
        <div className="qr-wrap">
          <QRCodeSVG value={token} size={176} fgColor="#12292B" />
        </div>
        <div className="wallet-name">{pass.name}</div>
      </div>

      <div className={`status-pill ${status}`}>{STATUS_LABEL[status] || ''}</div>

      {status === 'pending' && (
        <Banner kind="info">
          Muestra este código en el mostrador y paga {money(ms.price_mxn)} para activar tu membresía.
        </Banner>
      )}
      {status === 'expired' && (
        <Banner kind="error">
          Tu membresía venció el {fmtDate(ms.expires_at)}. Renueva en el mostrador antes de tu próxima visita.
        </Banner>
      )}

      {isActive && <StampGrid membership={ms} dark />}
      {isActive && <p className="muted center">Renueva el {fmtDate(ms.expires_at)}</p>}

      {pass.history?.length > 0 && (
        <>
          <h2 className="section-label">Historial</h2>
          <ul className="history">
            {pass.history.map((at, i) => (
              <li key={i}>
                <span>Sello registrado</span>
                <small>{fmtDateTime(at)}</small>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="muted small center">
        Tip: en el menú de tu navegador elige "Agregar a pantalla de inicio" para abrir tu pase más rápido.
      </p>
    </main>
  )
}
