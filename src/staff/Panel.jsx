import { useCallback, useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { supabase, friendlyError } from '../supabase.js'
import { money } from '../lib.js'
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

function Team({ businessId }) {
  const { t } = useLang()
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
      </form>
    </>
  )
}

export default function Panel({ business, onSignOut }) {
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

      <Team businessId={business.id} />

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
