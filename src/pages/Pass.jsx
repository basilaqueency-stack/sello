import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { supabase, friendlyError } from '../supabase.js'
import { fmtDate, fmtDateTime, money, statusLabel, savePass } from '../lib.js'
import { useLang } from '../i18n.js'
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
  const { t } = useLang()
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

  if (loading) return <main className="page"><p className="muted">{t('loading.pass')}</p></main>
  if (notFound || !pass)
    return (
      <main className="page">
        <h1 className="title">{t('pass.notFound')}</h1>
        <Banner kind="error">{error || t('pass.notFoundHelp')}</Banner>
        <Link to="/" className="btn ghost">{t('pass.home')}</Link>
      </main>
    )

  const ms = pass.membership
  const status = ms?.status
  const isActive = status === 'active'

  return (
    <main className="page">
      <Link to="/" className="back-link">{t('pass.back')}</Link>
      {offline && <Banner kind="warn">{t('pass.offline')}</Banner>}

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

      <div className={`status-pill ${status}`}>{statusLabel(status)}</div>

      {status === 'pending' && (
        <Banner kind="info">
          {t('pass.pending', { price: money(ms.price_mxn) })}
        </Banner>
      )}
      {status === 'expired' && (
        <Banner kind="error">
          {t('pass.expired', { date: fmtDate(ms.expires_at) })}
        </Banner>
      )}

      {isActive && <StampGrid membership={ms} dark />}
      {isActive && <p className="muted center">{t('pass.renews', { date: fmtDate(ms.expires_at) })}</p>}

      {pass.history?.length > 0 && (
        <>
          <h2 className="section-label">{t('pass.history')}</h2>
          <ul className="history">
            {pass.history.map((at, i) => (
              <li key={i}>
                <span>{t('pass.stamped')}</span>
                <small>{fmtDateTime(at)}</small>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="muted small center">
        {t('pass.tip')}
      </p>
    </main>
  )
}
