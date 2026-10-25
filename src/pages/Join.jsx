import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase, friendlyError } from '../supabase.js'
import { money, savePass } from '../lib.js'
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
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
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
    setBusy(true)
    const { data, error } = await supabase.rpc('join_business', {
      p_slug: slug,
      p_tier_id: tier.id,
      p_name: name,
      p_phone: phone,
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
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="322 123 4567"
              inputMode="tel"
              required
            />
          </label>
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
