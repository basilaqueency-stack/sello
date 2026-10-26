import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { supabase, friendlyError } from '../supabase.js'
import { fmtDate, fmtDateTime, money, statusLabel } from '../lib.js'
import { useLang, tr } from '../i18n.js'
import {
  clearFailed, flushQueue, getFailed, getQueue, isNetworkError, queuePoints, queueStamp, refreshRoster, searchRoster, sendStamp, withTimeout,
} from '../offline.js'
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

function spendPreview(business, amount, t) {
  if (business.points_mode !== 'spend' || !(Number(amount) > 0)) return null
  const n = Math.floor((Number(amount) * business.points_per_100) / 100)
  return <p className="muted small">{t('ck.earnPreview', { n })}</p>
}

export default function Checkin({ business, isOwner }) {
  const { t } = useLang()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [selected, setSelected] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [recent, setRecent] = useState([])
  const [notice, setNotice] = useState(null) // { kind, text }
  const [busy, setBusy] = useState(false)
  const [down, setDown] = useState(!navigator.onLine) // true when requests are failing for lack of signal
  const [pending, setPending] = useState(() => getQueue().length)
  const [failed, setFailed] = useState(() => getFailed())
  const [amount, setAmount] = useState('')
  const [rewards, setRewards] = useState([])
  const [stamps, setStamps] = useState([])
  const [tiers, setTiers] = useState([])

  useEffect(() => {
    supabase
      .from('tiers')
      .select('*')
      .eq('business_id', business.id)
      .eq('active', true)
      .order('price_mxn')
      .then(({ data }) => setTiers(data || []))
  }, [business.id])

  // The customer's latest stamps, so a stamp made by mistake can be removed.
  const loadStamps = useCallback(async (memberId) => {
    const { data, error } = await withTimeout(supabase.rpc('member_stamps', { p_member: memberId }))
    setStamps(!error && Array.isArray(data) ? data : [])
  }, [])
  useEffect(() => {
    setStamps([])
    if (selected?.member_id) loadStamps(selected.member_id)
  }, [selected?.member_id, loadStamps])

  useEffect(() => {
    if (!business.points_enabled) return
    supabase
      .from('rewards')
      .select('*')
      .eq('business_id', business.id)
      .eq('active', true)
      .order('cost_points')
      .then(({ data }) => setRewards(data || []))
  }, [business.id, business.points_enabled])

  const loadRecent = useCallback(async () => {
    const { data, error } = await withTimeout(supabase.rpc('recent_checkins', { p_business: business.id }))
    if (!error) {
      setRecent(data || [])
      setDown(false)
    } else if (isNetworkError(error)) setDown(true)
  }, [business.id])

  // Sends any stamps taken without signal, then refreshes what the screen shows.
  const sync = useCallback(async () => {
    if (getQueue().length > 0) {
      const r = await flushQueue()
      setPending(r.left)
      setFailed(getFailed())
      if (r.sent > 0) {
        setNotice({ kind: 'ok', text: tr('of.sent', { n: r.sent }) })
        loadRecent()
        refreshRoster(business.id)
      }
      setDown(r.left > 0 && r.sent === 0)
    }
  }, [business.id, loadRecent])

  useEffect(() => {
    loadRecent()
    refreshRoster(business.id) // save the member list on this phone for when the signal drops
    sync()
    import('./Scanner.jsx') // download the camera scanner now, while there is signal
    const onOnline = () => {
      setDown(false)
      sync()
      loadRecent()
      refreshRoster(business.id)
    }
    const onOffline = () => setDown(true)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    const fast = setInterval(sync, 20000)
    const slow = setInterval(() => refreshRoster(business.id), 10 * 60 * 1000)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      clearInterval(fast)
      clearInterval(slow)
    }
  }, [business.id, loadRecent, sync])

  function showResults(data, text) {
    if (data.length === 1 && /^[0-9a-f-]{36}$/i.test(text.trim())) {
      setSelected(data[0]) // scanned code: open the member straight away
      setResults(null)
    } else {
      setResults(data)
      setSelected(null)
    }
  }

  async function search(text) {
    setNotice(null)
    setBusy(true)
    const { data, error } = await withTimeout(supabase.rpc('lookup_members', { p_business: business.id, p_query: text }))
    setBusy(false)
    if (isNetworkError(error)) {
      // No signal: search the member list saved on this phone.
      setDown(true)
      const local = searchRoster(business.id, text)
      if (local === null) return setNotice({ kind: 'error', text: t('of.noRoster') })
      showResults(local, text)
      return setNotice({ kind: local.length === 0 ? 'warn' : 'info', text: local.length === 0 ? t('ck.none') : t('of.localSearch') })
    }
    if (error) return setNotice({ kind: 'error', text: friendlyError(error) })
    setDown(false)
    showResults(data, text)
    if (data.length === 0) setNotice({ kind: 'warn', text: t('ck.none') })
  }

  async function activate() {
    setNotice(null)
    setBusy(true)
    const { data, error } = await withTimeout(supabase.rpc('activate_membership', { p_membership: selected.membership.id }))
    setBusy(false)
    if (error) return setNotice({ kind: 'error', text: isNetworkError(error) ? t('of.needSignal') : friendlyError(error) })
    setSelected(data)
    setNotice({ kind: 'ok', text: t('ck.paid') })
    loadRecent()
    refreshRoster(business.id)
  }

  async function stamp() {
    setNotice(null)
    setBusy(true)
    // One id and one time per tap: if the answer gets lost on a weak signal, the retry can't double-stamp.
    const client_id = crypto.randomUUID()
    const at = new Date().toISOString()
    const { data, error } = await sendStamp(selected.membership.id, client_id, at)
    setBusy(false)
    if (isNetworkError(error)) {
      setDown(true)
      const q = queueStamp(business, selected, client_id, at)
      if (q.error) return setNotice({ kind: 'error', text: friendlyError({ message: q.error }) })
      setPending(getQueue().length)
      return finish(selected.name, t('of.stampedOffline'))
    }
    if (error) return setNotice({ kind: 'error', text: friendlyError(error) })
    setDown(false)
    finish(
      selected.name,
      data.membership.kind === 'unlimited'
        ? t('ck.stamped')
        : t('ck.stampedLeft', { n: data.membership.credits_remaining, unit: business.unit_label })
    )
    loadRecent()
  }

  async function addMembership(tier) {
    setNotice(null)
    setBusy(true)
    const { data, error } = await withTimeout(supabase.rpc('add_membership', { p_member: selected.member_id, p_tier: tier.id }))
    setBusy(false)
    if (error) return setNotice({ kind: 'error', text: isNetworkError(error) ? t('of.needSignal') : friendlyError(error) })
    setSelected(data)
    setNotice({ kind: 'ok', text: t('ck.membershipAdded', { price: money(tier.price_mxn) }) })
    refreshRoster(business.id)
  }

  // Staff ask the owner to remove a stamp; when the owner does it, it happens right away.
  async function removeStamp(st) {
    let reason = null
    if (isOwner) {
      if (!window.confirm(t('vr.confirmOwner'))) return
    } else {
      reason = window.prompt(t('vr.reasonPrompt'), '')
      if (reason === null) return // cancelled
    }
    setNotice(null)
    setBusy(true)
    const { data, error } = await withTimeout(supabase.rpc('request_stamp_void', { p_redemption: st.id, p_reason: reason }))
    setBusy(false)
    if (error) return setNotice({ kind: 'error', text: isNetworkError(error) ? t('of.needSignal') : friendlyError(error) })
    if (data?.applied) {
      setSelected(data.member)
      loadRecent()
      refreshRoster(business.id)
      setNotice({ kind: 'ok', text: t('vr.removed') })
    } else {
      setNotice({ kind: 'ok', text: t('vr.requested') })
    }
    loadStamps(selected.member_id)
  }

  // Visit points are added automatically with each stamp; this adds points for a bill, or for a visit with no stamp.
  // After a stamp, points or a reward, go straight back to the start so the same customer can't be stamped twice by accident.
  function finish(who, text) {
    setSelected(null)
    setResults(null)
    setQuery('')
    setAmount('')
    setNotice({ kind: 'ok', text: `${who} · ${text}` })
  }

  async function addPoints() {
    const spend = business.points_mode === 'spend'
    const value = spend ? Number(amount) : null
    if (spend && !(value > 0)) return setNotice({ kind: 'error', text: friendlyError({ message: 'monto_invalido' }) })
    setNotice(null)
    setBusy(true)
    const client_id = crypto.randomUUID()
    const at = new Date().toISOString()
    const { data, error } = await withTimeout(
      supabase.rpc('award_points', { p_member: selected.member_id, p_amount: value, p_client_id: client_id, p_at: at })
    )
    setBusy(false)
    if (isNetworkError(error)) {
      setDown(true)
      const gain = spend ? Math.floor((value * business.points_per_100) / 100) : business.points_per_visit
      if (gain < 1) return setNotice({ kind: 'error', text: friendlyError({ message: 'monto_invalido' }) })
      queuePoints(business, selected, value, client_id, at)
      setPending(getQueue().length)
      return finish(selected.name, t('ck.pointsQueued'))
    }
    if (error) return setNotice({ kind: 'error', text: friendlyError(error) })
    setDown(false)
    finish(selected.name, t('ck.pointsAdded', { n: data.points }))
  }

  async function redeemReward(r) {
    if (!window.confirm(t('ck.confirmRedeem', { name: r.name, cost: r.cost_points }))) return
    setNotice(null)
    setBusy(true)
    const { data, error } = await withTimeout(
      supabase.rpc('redeem_reward', { p_member: selected.member_id, p_reward: r.id, p_client_id: crypto.randomUUID() })
    )
    setBusy(false)
    if (error) return setNotice({ kind: 'error', text: isNetworkError(error) ? t('of.needSignal') : friendlyError(error) })
    finish(selected.name, t('ck.redeemed', { name: r.name }))
    loadRecent()
  }

  const statusBanners = (
    <>
      {down && <Banner kind="warn">{t('of.banner')}</Banner>}
      {pending > 0 && <Banner kind="info">{t('of.pending', { n: pending })}</Banner>}
      {failed.length > 0 && (
        <Banner kind="error">
          <strong>{t('of.failed')}</strong>
          <ul style={{ margin: '6px 0', paddingLeft: 18 }}>
            {failed.map((f) => (
              <li key={f.client_id}>
                {f.name} · {fmtDateTime(f.at)} · {friendlyError({ message: f.code })}
              </li>
            ))}
          </ul>
          <button
            className="link-btn"
            onClick={() => {
              clearFailed()
              setFailed([])
            }}
          >
            {t('of.dismiss')}
          </button>
        </Banner>
      )}
    </>
  )

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

        {statusBanners}
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

        {(!ms || status === 'cancelled') && tiers.length > 0 && (
          <>
            <h2 className="section-label">{t('ck.addMembership')}</h2>
            <div className="stack">
              {tiers.map((tr) => (
                <button key={tr.id} className="person-row" disabled={busy} onClick={() => addMembership(tr)}>
                  <span className="grow">
                    <strong>{tr.name}</strong>
                    <small>{money(tr.price_mxn)} / {t('pn.days', { n: tr.period_days })}</small>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {stamps.length > 0 && (
          <>
            <h2 className="section-label">{t('vr.title')}</h2>
            <div className="stack">
              {stamps.map((st) => (
                <div key={st.id} className="person-row static">
                  <span className="grow">
                    <strong>{fmtDateTime(st.at)}</strong>
                    {st.pending && <small>{t('vr.pending')}</small>}
                  </span>
                  {!st.pending && (
                    <button className="btn scan" disabled={busy} onClick={() => removeStamp(st)}>
                      {isOwner ? t('vr.remove') : t('vr.ask')}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {business.points_enabled && (status !== 'active' || (selected.points || 0) > 0) && (
          <>
            <h2 className="section-label">{t('ck.points')}</h2>
            <div className="card center">
              <div className="points-big">{t('ck.pointsBal', { n: selected.points || 0 })}</div>
            </div>
            {status === 'active' ? (
              <p className="muted small">{t('ck.noPointsMember')}</p>
            ) : business.points_mode === 'spend' ? (
              <div className="search-row" style={{ marginTop: 10 }}>
                <input
                  type="number"
                  min="1"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={t('ck.amount')}
                />
                <button className="btn scan" onClick={addPoints} disabled={busy}>{t('ck.addSpend')}</button>
              </div>
            ) : (
              <button className="btn ghost" style={{ marginTop: 10 }} onClick={addPoints} disabled={busy}>
                {t('ck.addVisit', { n: business.points_per_visit })}
              </button>
            )}
            {spendPreview(business, amount, t)}

            <h2 className="section-label">{t('ck.redeemTitle')}</h2>
            {rewards.length === 0 ? (
              <p className="muted small">{t('ck.noRewards')}</p>
            ) : (
              <div className="stack">
                {rewards.map((r) => (
                  <div key={r.id} className="person-row static">
                    <span className="grow">
                      <strong>{r.name}</strong>
                      <small>{t('pts.cost', { n: r.cost_points })}</small>
                    </span>
                    <button
                      className="btn scan"
                      disabled={busy || (selected.points || 0) < r.cost_points}
                      onClick={() => redeemReward(r)}
                    >
                      {t('ck.redeem')}
                    </button>
                  </div>
                ))}
              </div>
            )}
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

      {statusBanners}
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
              {recent.map((r, i) => {
                const body = (
                  <>
                    <span className="avatar">{initials(r.name)}</span>
                    <span className="grow">
                      <strong>{r.name}</strong>
                      <small>
                        {ago(r.at)}
                        {r.credits_remaining != null ? ` · ${t('ck.left', { n: r.credits_remaining })}` : ''}
                      </small>
                    </span>
                  </>
                )
                // Tap a check-in to open that customer (older server versions don't send the profile).
                return r.member ? (
                  <button key={i} className="person-row" onClick={() => { setNotice(null); setSelected(r.member) }}>
                    {body}
                  </button>
                ) : (
                  <div key={i} className="person-row static">{body}</div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
