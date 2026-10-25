import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { supabase, friendlyError } from '../supabase.js'
import { fmtDate, money, statusLabel } from '../lib.js'
import { useLang, tr } from '../i18n.js'
import { Banner, StampGrid } from '../components.jsx'

// The scanner library is large, so it loads only when "Escanear" is tapped.
const Scanner = lazy(() => import('./Scanner.jsx'))

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

function ago(iso) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return tr('ago.now')
  if (mins < 60) return tr('ago.min', { n: mins })
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return tr('ago.h', { n: hrs })
  return fmtDate(iso)
}

export default function Checkin({ business }) {
  const { t } = useLang()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [selected, setSelected] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [recent, setRecent] = useState([])
  const [notice, setNotice] = useState(null) // { kind, text }
  const [busy, setBusy] = useState(false)

  const loadRecent = useCallback(async () => {
    const { data } = await supabase.rpc('recent_checkins', { p_business: business.id })
    setRecent(data || [])
  }, [business.id])

  useEffect(() => {
    loadRecent()
  }, [loadRecent])

  async function search(text) {
    setNotice(null)
    setBusy(true)
    const { data, error } = await supabase.rpc('lookup_members', { p_business: business.id, p_query: text })
    setBusy(false)
    if (error) return setNotice({ kind: 'error', text: friendlyError(error) })
    if (data.length === 1 && /^[0-9a-f-]{36}$/i.test(text.trim())) {
      setSelected(data[0]) // scanned code: open the member straight away
      setResults(null)
    } else {
      setResults(data)
      setSelected(null)
    }
    if (data.length === 0) setNotice({ kind: 'warn', text: t('ck.none') })
  }

  async function act(fn, args, okText) {
    setNotice(null)
    setBusy(true)
    const { data, error } = await supabase.rpc(fn, args)
    setBusy(false)
    if (error) return setNotice({ kind: 'error', text: friendlyError(error) })
    setSelected(data)
    setNotice({ kind: 'ok', text: okText(data) })
    loadRecent()
  }

  const stamp = () =>
    act(
      'redeem_stamp',
      { p_membership: selected.membership.id, p_client_id: crypto.randomUUID() },
      (d) =>
        d.membership.kind === 'unlimited'
          ? t('ck.stamped')
          : t('ck.stampedLeft', { n: d.membership.credits_remaining, unit: business.unit_label })
    )

  const activate = () =>
    act('activate_membership', { p_membership: selected.membership.id }, () => t('ck.paid'))

  if (scanning)
    return (
      <Suspense fallback={<p className="muted screen-pad">{t('ck.opening')}</p>}>
        <Scanner
          onClose={() => setScanning(false)}
          onResult={(text) => {
            setScanning(false)
            search(text)
          }}
        />
      </Suspense>
    )

  // ----- One member -----
  if (selected) {
    const ms = selected.membership
    const status = ms?.status
    return (
      <div className="screen-pad">
        <button className="back-link" onClick={() => { setSelected(null); setNotice(null) }}>{t('back')}</button>
        <div className="member-card">
          <span className="avatar lg">{initials(selected.name)}</span>
          <h2>{selected.name}</h2>
          <p className="muted">{ms?.tier_name}</p>
          <div className={`status-pill ${status}`}>{statusLabel(status) || t('status.none')}</div>
        </div>

        <Banner kind={notice?.kind}>{notice?.text}</Banner>

        {status === 'active' && (
          <>
            <StampGrid membership={ms} />
            <p className="muted center">{t('ck.expires', { date: fmtDate(ms.expires_at) })}</p>
            <button className="btn primary" onClick={stamp} disabled={busy}>
              {busy ? t('ck.stamping') : t('ck.stampBtn')}
            </button>
          </>
        )}

        {status === 'pending' && (
          <>
            <Banner kind="warn">{t('ck.unpaid', { price: money(ms.price_mxn) })}</Banner>
            <button className="btn primary" onClick={activate} disabled={busy}>
              {t('ck.confirm')}
            </button>
          </>
        )}

        {status === 'expired' && (
          <>
            <Banner kind="error">{t('ck.expiredBanner', { date: fmtDate(ms.expires_at) })}</Banner>
            <button className="btn primary" onClick={activate} disabled={busy}>
              {t('ck.renew', { price: money(ms.price_mxn) })}
            </button>
          </>
        )}
      </div>
    )
  }

  // ----- Search / home -----
  return (
    <div className="screen-pad">
      <form
        className="search-row"
        onSubmit={(e) => {
          e.preventDefault()
          search(query)
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('ck.search')}
          inputMode="search"
        />
        <button type="button" className="btn scan" onClick={() => setScanning(true)}>
          {t('ck.scan')}
        </button>
      </form>

      <Banner kind={notice?.kind}>{notice?.text}</Banner>

      {results ? (
        <>
          <h2 className="section-label">{t('ck.results')}</h2>
          <div className="stack">
            {results.map((m) => (
              <button key={m.member_id} className="person-row" onClick={() => setSelected(m)}>
                <span className="avatar">{initials(m.name)}</span>
                <span className="grow">
                  <strong>{m.name}</strong>
                  <small>
                    {m.phone} · {statusLabel(m.membership?.status) || t('status.none')}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <h2 className="section-label">{t('ck.recent')}</h2>
          {recent.length === 0 ? (
            <p className="muted">{t('ck.noRecent')}</p>
          ) : (
            <div className="stack">
              {recent.map((r, i) => (
                <div key={i} className="person-row static">
                  <span className="avatar">{initials(r.name)}</span>
                  <span className="grow">
                    <strong>{r.name}</strong>
                    <small>
                      {ago(r.at)}
                      {r.credits_remaining != null ? ` · ${t('ck.left', { n: r.credits_remaining })}` : ''}
                    </small>
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
