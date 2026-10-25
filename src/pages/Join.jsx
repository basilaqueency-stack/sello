import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase, friendlyError } from '../supabase.js'
import { COUNTRIES, buildWhatsApp, money, savePass } from '../lib.js'
import { Banner } from '../components.jsx'

function tierDetail(t, unit) {
  return t.kind === 'unlimited'
    ? `${unit} ilimitados cada ${t.period_days} días`
    : `${t.credits_per_period} ${unit} cada ${t.period_days} días`
}

export default function Join() {
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
    if (!wa.ok) return setError(wa.error || 'Escribe tu número de WhatsApp.')
    setBusy(true)
    const { data, error } = await supabase.rpc('join_business', {
      p_slug: slug,
      p_tier_id: tier.id,
      p_name: name,
      p_phone: wa.digits,
    })
    setBusy(false)
    if (error) return setError(friendlyError(error))
    savePass(data, biz.name)
    navigate(`/pass/${data}`)
  }

  if (biz === undefined) return <main className="page"><p className="muted">Cargando…</p></main>
  if (biz === null)
    return (
      <main className="page">
        <h1 className="title">No encontramos este negocio</h1>
        <Banner kind="error">{error || 'Revisa que el enlace o el código QR esté completo.'}</Banner>
      </main>
    )

  return (
    <main className="page">
      <p className="eyebrow">{biz.name}</p>
      <h1 className="title">Elige tu membresía</h1>

      {biz.tiers.length === 0 && <p className="muted">Este negocio aún no tiene membresías disponibles.</p>}

      <div className="stack">
        {biz.tiers.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tier-card ${tier?.id === t.id ? 'selected' : ''}`}
            onClick={() => setTier(t)}
          >
            <strong>{t.name}</strong>
            <span className="mono">{money(t.price_mxn)} / {t.period_days} días</span>
            <small>{tierDetail(t, biz.unit_label)}</small>
          </button>
        ))}
      </div>

      {tier && (
        <form onSubmit={submit} className="stack form">
          <label>
            Nombre
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ana Torres" required />
          </label>
          <label>
            WhatsApp
            <div className="phone-row">
              <select value={country} onChange={(e) => setCountry(e.target.value)} aria-label="País">
                {COUNTRIES.map((c) => (
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
                  placeholder="Código"
                  inputMode="numeric"
                  aria-label="Código de país"
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
            <p className="hint">Te escribiremos por WhatsApp al {wa.display}</p>
          ) : (
            phone && <p className="hint warn">{wa.error}</p>
          )}
          <Banner kind="error">{error}</Banner>
          <button className="btn primary" disabled={busy}>
            {busy ? 'Creando tu pase…' : 'Obtener mi pase'}
          </button>
          <p className="muted small">
            Pagas en el mostrador y el personal activa tu membresía. Tu pase aparece aquí al instante.
          </p>
        </form>
      )}
    </main>
  )
}
