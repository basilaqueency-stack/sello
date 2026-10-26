import { useCallback, useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase, friendlyError } from '../supabase.js'
import { fmtDateTime, money } from '../lib.js'
import { Banner } from '../components.jsx'
import { useLang } from '../i18n.js'

const EMPTY = { id: null, name: '', price_mxn: '', kind: 'credits', credits_per_period: 10, period_days: 30 }

function TierForm({ businessId, tier, onDone, onCancel }) {
  const { t } = useLang()
  const [f, setF] = useState(tier)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const row = {
      name: f.name.trim(),
      price_mxn: Number(f.price_mxn),
      kind: f.kind,
      credits_per_period: f.kind === 'credits' ? Number(f.credits_per_period) : null,
      period_days: Number(f.period_days),
    }
    const { error } = f.id
      ? await supabase.from('tiers').update(row).eq('id', f.id)
      : await supabase.from('tiers').insert({ ...row, business_id: businessId })
    setBusy(false)
    if (error) return setError(friendlyError(error))
    onDone()
  }

  return (
    <form onSubmit={submit} className="stack form card">
      <label>
        {t('tf.name')}
        <input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder={t('tf.namePh')} required />
      </label>
      <label>
        {t('tf.price')}
        <input type="number" min="0" value={f.price_mxn} onChange={(e) => set('price_mxn', e.target.value)} required />
      </label>
      <label>
        {t('tf.kind')}
        <select value={f.kind} onChange={(e) => set('kind', e.target.value)}>
          <option value="credits">{t('tf.limited')}</option>
          <option value="unlimited">{t('tf.unlimited')}</option>
        </select>
      </label>
      {f.kind === 'credits' && (
        <label>
          {t('tf.perPeriod')}
          <input
            type="number"
            min="1"
            value={f.credits_per_period}
            onChange={(e) => set('credits_per_period', e.target.value)}
            required
          />
        </label>
      )}
      <label>
        {t('tf.renew')}
        <input type="number" min="1" value={f.period_days} onChange={(e) => set('period_days', e.target.value)} required />
      </label>
      <Banner kind="info">
        {f.kind === 'unlimited'
          ? t('tf.previewUnl', { days: f.period_days || '…' })
          : t('tf.previewLim', { n: f.credits_per_period || '…', days: f.period_days || '…' })}
      </Banner>
      {f.kind === 'unlimited' && /\d/.test(f.name) && (
        <Banner kind="warn">{t('tf.warn')}</Banner>
      )}
      <Banner kind="error">{error}</Banner>
      <div className="row">
        <button className="btn primary" disabled={busy}>{t('tf.save')}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>{t('tf.cancel')}</button>
      </div>
    </form>
  )
}

// The message an owner sends to a new employee (Sello doesn't send emails yet; WhatsApp is how people reach each other here).
function ShareInvite({ biz, email }) {
  const { t } = useLang()
  const [copied, setCopied] = useState(false)
  const text = t('tm.shareText', { biz, url: `${window.location.origin}/staff`, email })
  return (
    <span className="row" style={{ gap: 4 }}>
      <a className="link-btn" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer">
        {t('tm.whatsapp')}
      </a>
      <button
        type="button"
        className="link-btn"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          } catch {
            /* clipboard blocked: the WhatsApp button still works */
          }
        }}
      >
        {copied ? t('tm.copiedMsg') : t('tm.copyMsg')}
      </button>
    </span>
  )
}

function Team({ businessId, businessName }) {
  const { t } = useLang()
  const [sent, setSent] = useState(null)
  const [data, setData] = useState(null)
  const [email, setEmail] = useState('')
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('list_staff', { p_business: businessId })
    if (!error) setData(data)
  }, [businessId])

  useEffect(() => {
    load()
  }, [load])

  async function invite(e) {
    e.preventDefault()
    setNotice(null)
    setBusy(true)
    const { data: r, error } = await supabase.rpc('invite_staff', { p_business: businessId, p_email: email })
    setBusy(false)
    if (error) return setNotice({ kind: 'error', text: friendlyError(error) })
    setNotice({ kind: 'ok', text: r?.added ? t('tm.added', { email }) : t('tm.sent', { email }) })
    setSent(r?.added ? null : email.trim().toLowerCase())
    setEmail('')
    load()
  }

  async function remove(user) {
    if (!window.confirm(t('tm.confirmRemove', { email: user.email }))) return
    await supabase.rpc('remove_staff', { p_business: businessId, p_user: user.user_id })
    load()
  }

  async function cancel(addr) {
    await supabase.rpc('cancel_invite', { p_business: businessId, p_email: addr })
    load()
  }

  return (
    <>
      <h2 className="section-label">{t('tm.title')}</h2>
      <p className="muted small">{t('tm.help')}</p>
      <div className="stack">
        {data?.staff.map((u) => (
          <div key={u.user_id} className="tier-row">
            <span className="grow">
              <strong className="break">{u.email}</strong>
              <small>{u.role === 'owner' ? t('tm.owner') : t('tm.staff')}</small>
            </span>
            {u.role !== 'owner' && (
              <button className="link-btn" onClick={() => remove(u)}>{t('tm.remove')}</button>
            )}
          </div>
        ))}
        {data?.invites.map((addr) => (
          <div key={addr} className="tier-row off">
            <span className="grow">
              <strong className="break">{addr}</strong>
              <small>{t('tm.pending')}</small>
              <ShareInvite biz={businessName} email={addr} />
            </span>
            <button className="link-btn" onClick={() => cancel(addr)}>{t('tm.cancelInvite')}</button>
          </div>
        ))}
      </div>
      <form onSubmit={invite} className="form stack" style={{ marginTop: 10 }}>
        <div className="search-row" style={{ marginBottom: 0 }}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('tm.emailPh')}
            autoComplete="off"
            required
          />
          <button className="btn scan" disabled={busy}>{t('tm.invite')}</button>
        </div>
        <Banner kind={notice?.kind}>{notice?.text}</Banner>
        {sent && <ShareInvite biz={businessName} email={sent} />}
      </form>
    </>
  )
}

// Owner: stamp-removal requests from staff, waiting for a yes or no.
function VoidRequests({ businessId }) {
  const { t } = useLang()
  const [list, setList] = useState([])
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('list_void_requests', { p_business: businessId })
    if (!error) setList(data || [])
  }, [businessId])
  useEffect(() => {
    load()
  }, [load])
  async function decide(id, approve) {
    setError('')
    const { error } = await supabase.rpc('decide_void', { p_request: id, p_approve: approve })
    if (error) setError(friendlyError(error))
    load()
  }
  if (list.length === 0 && !error) return null
  return (
    <>
      <h2 className="section-label">{t('vr.panelTitle')}</h2>
      <Banner kind="error">{error}</Banner>
      <div className="stack">
        {list.map((r) => (
          <div key={r.id} className="card stack">
            <strong>{r.member}</strong>
            <small className="muted">
              {t('vr.stampOf', { when: fmtDateTime(r.stamp_at) })} · {t('vr.by', { who: r.by || '—' })}
            </small>
            {r.reason && <p className="small" style={{ margin: 0 }}>“{r.reason}”</p>}
            <div className="row">
              <button className="btn primary" onClick={() => decide(r.id, true)}>{t('vr.approve')}</button>
              <button className="btn ghost" onClick={() => decide(r.id, false)}>{t('vr.reject')}</button>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

// Saves a few columns of the business row and reloads it.
function useSaveBusiness(business, onChanged) {
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function save(patch) {
    setError('')
    setBusy(true)
    const { error } = await supabase.from('businesses').update(patch).eq('id', business.id)
    setBusy(false)
    if (error) return setError(friendlyError(error))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    onChanged()
  }
  return { save, saved, error, busy }
}

function PointsSettings({ business, onChanged }) {
  const { t } = useLang()
  const [f, setF] = useState({
    points_enabled: business.points_enabled,
    points_mode: business.points_mode,
    points_per_visit: business.points_per_visit,
    points_per_100: business.points_per_100,
  })
  const { save, saved, error, busy } = useSaveBusiness(business, onChanged)
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))
  return (
    <form
      className="stack form card"
      onSubmit={(e) => {
        e.preventDefault()
        save({
          points_enabled: f.points_enabled,
          points_mode: f.points_mode,
          points_per_visit: Number(f.points_per_visit),
          points_per_100: Number(f.points_per_100),
        })
      }}
    >
      <label className="check">
        <input type="checkbox" checked={f.points_enabled} onChange={(e) => set('points_enabled', e.target.checked)} />
        {t('pp.enable')}
      </label>
      {f.points_enabled && (
        <>
          <label>
            {t('pp.mode')}
            <select value={f.points_mode} onChange={(e) => set('points_mode', e.target.value)}>
              <option value="visit">{t('pp.visit')}</option>
              <option value="spend">{t('pp.spend')}</option>
            </select>
          </label>
          {f.points_mode === 'visit' ? (
            <>
              <label>
                {t('pp.perVisit')}
                <input type="number" min="1" value={f.points_per_visit} onChange={(e) => set('points_per_visit', e.target.value)} required />
              </label>
              <Banner kind="info">{t('pp.previewVisit', { n: f.points_per_visit || '…' })}</Banner>
            </>
          ) : (
            <>
              <label>
                {t('pp.per100')}
                <input type="number" min="1" value={f.points_per_100} onChange={(e) => set('points_per_100', e.target.value)} required />
              </label>
              <Banner kind="info">
                {t('pp.previewSpend', { n: Math.floor(((Number(f.points_per_100) || 0) * 250) / 100) })}
              </Banner>
            </>
          )}
        </>
      )}
      <Banner kind="error">{error}</Banner>
      <button className="btn primary" disabled={busy}>{saved ? t('pp.saved') : t('tf.save')}</button>
    </form>
  )
}

function RewardForm({ businessId, reward, onDone, onCancel }) {
  const { t } = useLang()
  const [f, setF] = useState(reward)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const row = { name: f.name.trim(), cost_points: Number(f.cost_points) }
    const { error } = f.id
      ? await supabase.from('rewards').update(row).eq('id', f.id)
      : await supabase.from('rewards').insert({ ...row, business_id: businessId })
    setBusy(false)
    if (error) return setError(friendlyError(error))
    onDone()
  }
  return (
    <form onSubmit={submit} className="stack form card">
      <label>
        {t('rw.name')}
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={t('rw.namePh')} required />
      </label>
      <label>
        {t('rw.cost')}
        <input type="number" min="1" value={f.cost_points} onChange={(e) => setF({ ...f, cost_points: e.target.value })} required />
      </label>
      <Banner kind="error">{error}</Banner>
      <div className="row">
        <button className="btn primary" disabled={busy}>{t('tf.save')}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>{t('tf.cancel')}</button>
      </div>
    </form>
  )
}

function Rewards({ businessId }) {
  const { t } = useLang()
  const [rewards, setRewards] = useState([])
  const [editing, setEditing] = useState(null)
  const load = useCallback(async () => {
    const { data } = await supabase.from('rewards').select('*').eq('business_id', businessId).order('cost_points')
    setRewards(data || [])
  }, [businessId])
  useEffect(() => {
    load()
  }, [load])

  if (editing)
    return (
      <RewardForm
        businessId={businessId}
        reward={editing}
        onCancel={() => setEditing(null)}
        onDone={() => {
          setEditing(null)
          load()
        }}
      />
    )
  return (
    <>
      <div className="stack">
        {rewards.length === 0 && <p className="muted">{t('rw.none')}</p>}
        {rewards.map((r) => (
          <div key={r.id} className={`tier-row ${r.active ? '' : 'off'}`}>
            <span className="grow">
              <strong>{r.name}</strong>
              <small>{t('pts.cost', { n: r.cost_points })}{r.active ? '' : ` · ${t('pn.hidden')}`}</small>
            </span>
            <button className="link-btn" onClick={() => setEditing(r)}>{t('pn.edit')}</button>
            <button
              className="link-btn"
              onClick={async () => {
                await supabase.from('rewards').update({ active: !r.active }).eq('id', r.id)
                load()
              }}
            >
              {r.active ? t('pn.hide') : t('pn.show')}
            </button>
            <button
              className="link-btn"
              onClick={async () => {
                if (!window.confirm(t('rw.confirmDelete', { name: r.name }))) return
                await supabase.from('rewards').delete().eq('id', r.id)
                load()
              }}
            >
              {t('rw.delete')}
            </button>
          </div>
        ))}
      </div>
      <button className="btn ghost" onClick={() => setEditing({ id: null, name: '', cost_points: 100 })}>{t('rw.new')}</button>
    </>
  )
}

function DirectoryProfile({ business, onChanged }) {
  const { t } = useLang()
  const [f, setF] = useState({
    listed: business.listed,
    category: business.category || 'other',
    neighborhood: business.neighborhood || '',
    description: business.description || '',
  })
  const { save, saved, error, busy } = useSaveBusiness(business, onChanged)
  return (
    <form
      className="stack form card"
      onSubmit={(e) => {
        e.preventDefault()
        save({
          listed: f.listed,
          category: f.category,
          neighborhood: f.neighborhood.trim() || null,
          description: f.description.trim() || null,
        })
      }}
    >
      <label className="check">
        <input type="checkbox" checked={f.listed} onChange={(e) => setF({ ...f, listed: e.target.checked })} />
        {t('dr.listed')}
      </label>
      <label>
        {t('dr.category')}
        <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
          {['cafe', 'beauty', 'restaurant', 'other'].map((c) => (
            <option key={c} value={c}>{t(`cat.${c}`)}</option>
          ))}
        </select>
      </label>
      <label>
        {t('dr.neighborhood')}
        <input value={f.neighborhood} maxLength={60} onChange={(e) => setF({ ...f, neighborhood: e.target.value })} placeholder={t('dr.neighborhoodPh')} />
      </label>
      <label>
        {t('dr.description')}
        <input value={f.description} maxLength={240} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder={t('dr.descPh')} />
      </label>
      <p className="muted small" style={{ margin: 0 }}>{t('dr.hint')}</p>
      <Banner kind="error">{error}</Banner>
      <button className="btn primary" disabled={busy}>{saved ? t('pp.saved') : t('tf.save')}</button>
    </form>
  )
}

export default function Panel({ business, onSignOut, onChanged }) {
  const { t } = useLang()
  const [stats, setStats] = useState(null)
  const [tiers, setTiers] = useState([])
  const [editing, setEditing] = useState(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  const joinUrl = `${window.location.origin}/join/${business.slug}`

  const load = useCallback(async () => {
    const [s, t] = await Promise.all([
      supabase.rpc('get_stats', { p_business: business.id }),
      supabase.from('tiers').select('*').eq('business_id', business.id).order('price_mxn'),
    ])
    if (s.error) setError(friendlyError(s.error))
    else setStats(s.data)
    if (!t.error) setTiers(t.data)
  }, [business.id])

  useEffect(() => {
    load()
  }, [load])

  async function toggleActive(t) {
    await supabase.from('tiers').update({ active: !t.active }).eq('id', t.id)
    load()
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(joinUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard can be blocked; the link is visible to copy by hand */
    }
  }

  return (
    <div className="screen-pad">
      <div className="topline">
        <h2 className="title small">{t('pn.title')}</h2>
        <span className="mono small">{t('pn.owner')}</span>
      </div>
      <Banner kind="error">{error}</Banner>

      <VoidRequests businessId={business.id} />

      {stats && (
        <div className="stat-grid">
          <div className="stat wide">
            <strong>{stats.active_members}</strong>
            <span>{t('pn.active')}</span>
          </div>
          <div className="stat">
            <strong>{money(stats.monthly_mxn)}</strong>
            <span>{t('pn.perMonth')}</span>
          </div>
          <div className="stat">
            <strong>{stats.expiring_week}</strong>
            <span>{t('pn.expiring')}</span>
          </div>
        </div>
      )}

      <h2 className="section-label">{t('pn.tiers')}</h2>
      {editing ? (
        <TierForm
          businessId={business.id}
          tier={editing}
          onCancel={() => setEditing(null)}
          onDone={() => {
            setEditing(null)
            load()
          }}
        />
      ) : (
        <>
          <div className="stack">
            {tiers.length === 0 && <p className="muted">{t('pn.noTiers')}</p>}
            {tiers.map((tier) => (
              <div key={tier.id} className={`tier-row ${tier.active ? '' : 'off'}`}>
                <span className="grow">
                  <strong>{tier.name}</strong>
                  <small>
                    {money(tier.price_mxn)} · {tier.kind === 'unlimited' ? t('pn.unlimited') : t('pn.stamps', { n: tier.credits_per_period })} · {t('pn.days', { n: tier.period_days })}
                    {tier.active ? '' : ` · ${t('pn.hidden')}`}
                  </small>
                </span>
                <button className="link-btn" onClick={() => setEditing(tier)}>{t('pn.edit')}</button>
                <button className="link-btn" onClick={() => toggleActive(tier)}>{tier.active ? t('pn.hide') : t('pn.show')}</button>
              </div>
            ))}
          </div>
          <button className="btn ghost" onClick={() => setEditing(EMPTY)}>{t('pn.new')}</button>
        </>
      )}

      <h2 className="section-label">{t('pp.title')}</h2>
      <PointsSettings key={`${business.points_enabled}${business.points_mode}${business.points_per_visit}${business.points_per_100}`} business={business} onChanged={onChanged} />
      {business.points_enabled && (
        <>
          <h2 className="section-label">{t('rw.title')}</h2>
          <Rewards businessId={business.id} />
        </>
      )}

      <h2 className="section-label">{t('dr.title')}</h2>
      <DirectoryProfile business={business} onChanged={onChanged} />

      <Team businessId={business.id} businessName={business.name} />

      <h2 className="section-label">{t('pn.counter')}</h2>
      <div className="card center">
        <div className="qr-wrap">
          <QRCodeSVG value={joinUrl} size={160} fgColor="#12292B" />
        </div>
        <p className="mono small break">{joinUrl}</p>
        <button className="btn ghost" onClick={copy}>{copied ? t('pn.copied') : t('pn.copy')}</button>
        <p className="muted small">{t('pn.print')}</p>
      </div>

      <button className="link-btn" onClick={onSignOut}>{t('pn.signout')}</button>
    </div>
  )
}
