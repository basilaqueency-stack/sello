import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { supabase, friendlyError } from '../supabase.js'
import { fmtDate, fmtDateTime, money, statusLabel, savePass } from '../lib.js'
import { useLang } from '../i18n.js'
import { Banner, StampGrid } from '../components.jsx'

// "Add to Wallet" buttons appear only once the wallet accounts are set up on the server.
function WalletButtons({ token }) {
  const { t } = useLang()
  const [cfg, setCfg] = useState(null)
  useEffect(() => {
    fetch('/api/wallet?type=config')
      .then((r) => (r.ok ? r.json() : null))
      .then(setCfg)
      .catch(() => {})
  }, [])
  if (!cfg || (!cfg.google && !cfg.apple)) return null
  return (
    <div className="wallet-btns">
      {cfg.google && <a className="btn ghost" href={`/api/wallet?type=google&token=${token}`}>{t('wal.google')}</a>}
      {cfg.apple && <a className="btn ghost" href={`/api/wallet?type=apple&token=${token}`}>{t('wal.apple')}</a>}
    </div>
  )
}

function Points({ pass }) {
  const { t } = useLang()
  const label = (h) =>
    h.reason === 'redeem' ? t('pts.redeem', { name: h.reward_name || '' }) : t(`pts.${h.reason}`)
  return (
    <>
      <h2 className="section-label">{t('pts.title')}</h2>
      <div className="card center">
        <div className="points-big">{t('pts.balance', { n: pass.points })}</div>
      </div>
      {pass.rewards?.length > 0 && (
        <>
          <h2 className="section-label">{t('pts.rewards')}</h2>
          <div className="stack">
            {pass.rewards.map((r) => {
              const pct = Math.min(100, Math.round((pass.points / r.cost_points) * 100))
              return (
                <div key={r.id} className="card">
                  <div className="reward-row">
                    <strong>{r.name}</strong>
                    <span className="mono small">{t('pts.cost', { n: r.cost_points })}</span>
                  </div>
                  <div className="bar"><i style={{ width: `${pct}%` }} /></div>
                  <small className="muted">
                    {pass.points >= r.cost_points ? t('pts.ready') : t('pts.need', { n: r.cost_points - pass.points })}
                  </small>
                </div>
              )
            })}
          </div>
          <p className="muted small center">{t('pts.show')}</p>
        </>
      )}
      {pass.points_history?.length > 0 && (
        <>
          <h2 className="section-label">{t('pts.history')}</h2>
          <ul className="history">
            {pass.points_history.map((h, i) => (
              <li key={i}>
                <span>{label(h)}</span>
                <small>
                  {h.delta > 0 ? '+' : ''}{h.delta} · {fmtDateTime(h.at)}
                </small>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

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
      <WalletButtons token={token} />

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

      {pass.business.points_enabled && <Points pass={pass} />}

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
