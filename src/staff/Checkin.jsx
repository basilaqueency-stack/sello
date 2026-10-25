import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { supabase, friendlyError } from '../supabase.js'
import { fmtDate, money, STATUS_LABEL } from '../lib.js'
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
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins} min`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `hace ${hrs} h`
  return fmtDate(iso)
}

export default function Checkin({ business }) {
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
    if (data.length === 0) setNotice({ kind: 'warn', text: 'No encontramos a nadie con ese dato.' })
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
          ? '¡Sellado!'
          : `¡Sellado! Quedan ${d.membership.credits_remaining} ${business.unit_label}.`
    )

  const activate = () =>
    act('activate_membership', { p_membership: selected.membership.id }, () => 'Pago confirmado. Membresía activa.')

  if (scanning)
    return (
      <Suspense fallback={<p className="muted screen-pad">Abriendo cámara…</p>}>
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
        <button className="back-link" onClick={() => { setSelected(null); setNotice(null) }}>← Volver</button>
        <div className="member-card">
          <span className="avatar lg">{initials(selected.name)}</span>
          <h2>{selected.name}</h2>
          <p className="muted">{ms?.tier_name}</p>
          <div className={`status-pill ${status}`}>{STATUS_LABEL[status] || 'Sin membresía'}</div>
        </div>

        <Banner kind={notice?.kind}>{notice?.text}</Banner>

        {status === 'active' && (
          <>
            <StampGrid membership={ms} />
            <p className="muted center">Vence el {fmtDate(ms.expires_at)}</p>
            <button className="btn primary" onClick={stamp} disabled={busy}>
              {busy ? 'Sellando…' : 'Registrar 1 sello'}
            </button>
          </>
        )}

        {status === 'pending' && (
          <>
            <Banner kind="warn">Aún no ha pagado. Cobra {money(ms.price_mxn)} y confirma para activar.</Banner>
            <button className="btn primary" onClick={activate} disabled={busy}>
              Confirmar pago y activar
            </button>
          </>
        )}

        {status === 'expired' && (
          <>
            <Banner kind="error">Venció el {fmtDate(ms.expires_at)}. No quedan sellos disponibles.</Banner>
            <button className="btn primary" onClick={activate} disabled={busy}>
              Cobrar {money(ms.price_mxn)} y renovar
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
          placeholder="Buscar por nombre o teléfono…"
          inputMode="search"
        />
        <button type="button" className="btn scan" onClick={() => setScanning(true)}>
          ▤ Escanear
        </button>
      </form>

      <Banner kind={notice?.kind}>{notice?.text}</Banner>

      {results ? (
        <>
          <h2 className="section-label">Resultados</h2>
          <div className="stack">
            {results.map((m) => (
              <button key={m.member_id} className="person-row" onClick={() => setSelected(m)}>
                <span className="avatar">{initials(m.name)}</span>
                <span className="grow">
                  <strong>{m.name}</strong>
                  <small>
                    {m.phone} · {STATUS_LABEL[m.membership?.status] || 'Sin membresía'}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <h2 className="section-label">Check-ins recientes</h2>
          {recent.length === 0 ? (
            <p className="muted">Aún no hay check-ins. Escanea el código de un cliente para empezar.</p>
          ) : (
            <div className="stack">
              {recent.map((r, i) => (
                <div key={i} className="person-row static">
                  <span className="avatar">{initials(r.name)}</span>
                  <span className="grow">
                    <strong>{r.name}</strong>
                    <small>
                      {ago(r.at)}
                      {r.credits_remaining != null ? ` · quedan ${r.credits_remaining}` : ''}
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
