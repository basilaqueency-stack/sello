import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase, friendlyError } from '../supabase.js'
import { countries, buildWhatsApp, money, savePass } from '../lib.js'
import { useLang } from '../i18n.js'
import { Banner } from '../components.jsx'

function tierDetail(tr, t, unit) {
  return t.kind === 'unlimited'
    ? tr('tier.unlimited', { unit, days: t.period_days })
    : tr('tier.limited', { n: t.credits_per_period, unit, days: t.period_days })
}

export default function Join() {
  const { t: tr } = useLang()
  const { slug } = useParams()
  const navigate = useNavigate()
  const [biz, setBiz] = useState(undefined) // undefined = loading, null = not found
  const [tier, setTier] = useState(null)
  const [name, setName] = useState('')
  const [country, setCountry] = useState('mx')
  const [otherCode, setOtherCode] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const wa = buildWhatsApp(country, otherCode, phone)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.rpc('get_public_business', { p_slug: slug }).then(({ data, error }) => {
      if (error) setError(friendlyError(error))
      setBiz(data || null)
    })
  }, [slug])

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (!wa.ok) return setError(wa.error || tr('join.needPhone'))
    setBusy(true)
    const { data, error } = await supabase.rpc('join_business', {
      p_slug: slug,
      p_tier_id: tier.pointsOnly ? null : tier.id,
      p_name: name,
      p_phone: wa.digits,
    })
    setBusy(false)
    if (error) return setError(friendlyError(error))
    savePass(data, biz.name)
    navigate(`/pass/${data}`)
  }

  if (biz === undefined) return <main className="page"><p className="muted">{tr('loading')}</p></main>
  if (biz === null)
    return (
      <main className="page">
        <h1 className="title">{tr('join.notFound')}</h1>
        <Banner kind="error">{error || tr('join.notFoundHelp')}</Banner>
      </main>
    )

  return (
    <main className="page">
      <p className="eyebrow">
        {biz.name}
        {biz.neighborhood ? ` · ${biz.neighborhood}` : ''}
      </p>
      <h1 className="title">{tr('join.pick')}</h1>

      {biz.description && <p className="muted">{biz.description}</p>}
      {biz.tiers.length === 0 && !biz.points_enabled && <p className="muted">{tr('join.noTiers')}</p>}

      <div className="stack">
        {biz.tiers.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tier-card ${tier?.id === t.id && !tier?.pointsOnly ? 'selected' : ''}`}
            onClick={() => setTier(t)}
          >
            <strong>{t.name}</strong>
            <span className="mono">{tr('tier.price', { price: money(t.price_mxn), days: t.period_days })}</span>
            <small>{tierDetail(tr, t, biz.unit_label)}</small>
          </button>
        ))}
      </div>

      {biz.points_enabled && (
        <div className="stack" style={{ marginTop: 10 }}>
          <button
            type="button"
            className={`tier-card ${tier?.pointsOnly ? 'selected' : ''}`}
            onClick={() => setTier({ id: null, pointsOnly: true })}
          >
            <strong>{tr('join.pointsOnly')}</strong>
            <small>
              {biz.points_mode === 'spend'
                ? tr('join.pointsOnlySpend', { n: biz.points_per_100 })
                : tr('join.pointsOnlyVisit', { n: biz.points_per_visit })}
            </small>
          </button>
        </div>
      )}

      {tier && (
        <form onSubmit={submit} className="stack form">
          <label>
            {tr('join.name')}
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ana Torres" required />
          </label>
          <label>
            WhatsApp
            <div className="phone-row">
              <select value={country} onChange={(e) => setCountry(e.target.value)} aria-label={tr('join.country')}>
                {countries().map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              {country === 'other' && (
                <input
                  className="code"
                  value={otherCode}
                  onChange={(e) => setOtherCode(e.target.value)}
                  placeholder={tr('join.code')}
                  inputMode="numeric"
                  aria-label={tr('join.codeLabel')}
                />
              )}
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={country === 'mx' ? '322 123 4567' : '604 555 0123'}
                inputMode="tel"
                required
              />
            </div>
          </label>
          {wa.ok ? (
            <p className="hint">{tr('join.willWrite', { n: wa.display })}</p>
          ) : (
            phone && <p className="hint warn">{wa.error}</p>
          )}
          <Banner kind="error">{error}</Banner>
          <button className="btn primary" disabled={busy}>
            {busy ? tr('join.busy') : tr('join.submit')}
          </button>
          <p className="muted small">
            {tier.pointsOnly ? tr('join.pointsNote') : tr('join.payNote')}
          </p>
        </form>
      )}
    </main>
  )
}
