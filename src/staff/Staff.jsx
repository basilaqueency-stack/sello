import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, friendlyError } from '../supabase.js'
import { Banner } from '../components.jsx'
import { useLang, tr as tr0 } from '../i18n.js'
import Checkin from './Checkin.jsx'
import Panel from './Panel.jsx'

function AuthForm() {
  const { t } = useLang()
  const [mode, setMode] = useState('in') // 'in' or 'up'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    const { data, error } =
      mode === 'in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password })
    setBusy(false)
    if (error) return setError(friendlyError(error))
    // With "Confirm email" turned on in Supabase, sign-up needs a click in the inbox first.
    if (mode === 'up' && !data.session) setNotice(t('auth.confirm'))
  }

  return (
    <main className="page">
      <h1 className="wordmark">Sello</h1>
      <p className="muted">{t('auth.title')}</p>
      <form onSubmit={submit} className="stack form">
        <label>
          {t('auth.email')}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label>
          {t('auth.password')}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
          />
        </label>
        <Banner kind="error">{error}</Banner>
        <Banner kind="info">{notice}</Banner>
        <button className="btn primary" disabled={busy}>
          {mode === 'in' ? t('auth.in') : t('auth.up')}
        </button>
        <button type="button" className="link-btn" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
          {mode === 'in' ? t('auth.toUp') : t('auth.toIn')}
        </button>
      </form>
      <Link to="/" className="back-link">{t('back')}</Link>
    </main>
  )
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

function CreateBusiness({ onDone }) {
  const { t } = useLang()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [unit, setUnit] = useState(() => tr0('cb.unitDefault'))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { error } = await supabase.rpc('create_business', { p_name: name, p_slug: slug, p_unit: unit })
    setBusy(false)
    if (error) return setError(friendlyError(error))
    onDone()
  }

  return (
    <main className="page">
      <h1 className="title">{t('cb.title')}</h1>
      <p className="muted">{t('cb.sub')}</p>
      <form onSubmit={submit} className="stack form">
        <label>
          {t('cb.name')}
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (!slugTouched) setSlug(slugify(e.target.value))
            }}
            placeholder="Café Salvia"
            required
          />
        </label>
        <label>
          {t('cb.slug')}
          <input
            value={slug}
            onChange={(e) => {
              setSlugTouched(true)
              setSlug(slugify(e.target.value))
            }}
            placeholder="cafe-salvia"
            required
          />
        </label>
        <label>
          {t('cb.unit')}
          <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder={t('cb.unitPh')} required />
        </label>
        <Banner kind="error">{error}</Banner>
        <button className="btn primary" disabled={busy}>
          {busy ? t('cb.busy') : t('cb.submit')}
        </button>
      </form>
    </main>
  )
}

export default function Staff() {
  const { t } = useLang()
  const [session, setSession] = useState(undefined) // undefined = still checking
  const [business, setBusiness] = useState(undefined)
  const [role, setRole] = useState(null)
  const [tab, setTab] = useState('inicio')
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const loadBusiness = useCallback(async () => {
    setError('')
    const { data: biz, error: e1 } = await supabase.from('businesses').select('*').order('created_at').limit(1)
    if (e1) return setError(friendlyError(e1))
    const b = biz?.[0] || null
    setBusiness(b)
    if (b) {
      const { data: staff } = await supabase.from('business_staff').select('role').eq('business_id', b.id).limit(1)
      setRole(staff?.[0]?.role || 'staff')
    }
  }, [])

  useEffect(() => {
    if (session) loadBusiness()
    else setBusiness(undefined)
  }, [session, loadBusiness])

  if (session === undefined) return <main className="page"><p className="muted">{t('loading')}</p></main>
  if (!session) return <AuthForm />
  if (error) return <main className="page"><Banner kind="error">{error}</Banner></main>
  if (business === undefined) return <main className="page"><p className="muted">{t('loading')}</p></main>
  if (business === null) return <CreateBusiness onDone={loadBusiness} />

  const isOwner = role === 'owner'
  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">Sello</span>
        <span className="biz">{business.name}</span>
      </header>
      <div className="shell-body">
        {tab === 'inicio' && <Checkin business={business} />}
        {tab === 'panel' && isOwner && <Panel business={business} onSignOut={() => supabase.auth.signOut()} />}
      </div>
      <nav className="app-footer">
        <button className={`foot-tab ${tab === 'inicio' ? 'active' : ''}`} onClick={() => setTab('inicio')}>
          <span className="foot-icon">⌂</span>
          <span>{t('nav.home')}</span>
        </button>
        {isOwner && (
          <button className={`foot-tab ${tab === 'panel' ? 'active' : ''}`} onClick={() => setTab('panel')}>
            <span className="foot-icon">▦</span>
            <span>{t('nav.panel')}</span>
          </button>
        )}
      </nav>
    </div>
  )
}
