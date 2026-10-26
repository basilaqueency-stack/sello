import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, friendlyError } from '../supabase.js'
import { Banner } from '../components.jsx'
import { useLang, tr as tr0 } from '../i18n.js'
import Onboarding, { seenOnboarding } from '../Onboarding.jsx'
import {
  clearAllStaffData, getQueue, hasStoredLogin, isNetworkError, loadStaffCache, saveStaffCache, withTimeout,
} from '../offline.js'
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
  const [showPw, setShowPw] = useState(false)

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
          <span className="pw-wrap">
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
              autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            />
            <button type="button" className="pw-toggle" onClick={() => setShowPw(!showPw)} aria-pressed={showPw}>
              {showPw ? t('auth.hide') : t('auth.show')}
            </button>
          </span>
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

function CreateBusiness({ onDone, email }) {
  const { t } = useLang()
  const [checked, setChecked] = useState('')
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
      <div className="card stack">
        <p className="small" style={{ margin: 0 }}>{t('cb.employee', { email: email || '' })}</p>
        <button
          type="button"
          className="btn ghost"
          onClick={async () => {
            setChecked('')
            await onDone()
            setChecked(t('cb.noInvite'))
          }}
        >
          {t('cb.invited')}
        </button>
        <Banner kind="warn">{checked}</Banner>
      </div>
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
  const [offlineMode, setOfflineMode] = useState(false)
  const [business, setBusiness] = useState(undefined)
  const [role, setRole] = useState(null)
  const [tab, setTab] = useState('inicio')
  const [error, setError] = useState('')
  const [tour, setTour] = useState(false)

  // With no signal the login can't be refreshed. If this phone already holds a login and a saved
  // copy of the business, keep the counter open in "offline mode" instead of kicking the staff out.
  const resolve = useCallback((s) => {
    if (s) {
      setOfflineMode(false)
      setSession(s)
    } else if (hasStoredLogin() && loadStaffCache()) {
      setOfflineMode(true)
      setSession((prev) => (prev && prev.offline ? prev : { offline: true }))
    } else {
      setOfflineMode(false)
      setSession(null)
    }
  }, [])

  useEffect(() => {
    // Renewing an expired login needs signal. Don't leave the counter on "Loading…" while it tries:
    // after a few seconds (right away if the phone says it's offline) open from the saved copy.
    const wait = setTimeout(() => resolve(null), navigator.onLine ? 5000 : 1000)
    supabase.auth.getSession().then(({ data }) => {
      clearTimeout(wait)
      resolve(data.session)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => resolve(s))
    return () => {
      clearTimeout(wait)
      sub.subscription.unsubscribe()
    }
  }, [resolve])

  // In offline mode, keep trying to get the real login back as soon as there is signal.
  useEffect(() => {
    if (!offlineMode) return
    const retry = () => supabase.auth.getSession().then(({ data }) => data.session && resolve(data.session))
    const id = setInterval(retry, 15000)
    window.addEventListener('online', retry)
    return () => {
      clearInterval(id)
      window.removeEventListener('online', retry)
    }
  }, [offlineMode, resolve])

  const loadBusiness = useCallback(async () => {
    setError('')
    const cached = loadStaffCache()
    if (session?.offline) {
      if (cached) {
        setBusiness(cached.business)
        setRole(cached.role)
      }
      return
    }
    // Turn any waiting employee invitation into access (quietly ignored if it fails).
    const claim = withTimeout(supabase.rpc('claim_invites'), 6000).then(() => {}, () => {})
    if (!cached) await claim
    const { data: biz, error: e1 } = await withTimeout(
      supabase.from('businesses').select('*').order('created_at').limit(1)
    )
    if (e1) {
      if (isNetworkError(e1) && cached) {
        setBusiness(cached.business)
        setRole(cached.role)
        return
      }
      return setError(friendlyError(e1))
    }
    const b = biz?.[0] || null
    setBusiness(b)
    if (b) {
      const { data: staff } = await withTimeout(
        supabase.from('business_staff').select('role').eq('business_id', b.id).limit(1)
      )
      const r = staff?.[0]?.role || cached?.role || 'staff'
      setRole(r)
      saveStaffCache(b, r)
    }
  }, [session])

  useEffect(() => {
    if (session) loadBusiness()
    else setBusiness(undefined)
  }, [session, loadBusiness])

  useEffect(() => {
    if (business && !seenOnboarding('staff')) setTour(true)
  }, [!!business]) // eslint-disable-line react-hooks/exhaustive-deps

  // Owner: how many stamp-removal requests are waiting (shown as a dot on the Dashboard tab).
  const [waiting, setWaiting] = useState(0)
  useEffect(() => {
    if (role !== 'owner' || !business || offlineMode) return
    const check = () =>
      withTimeout(supabase.rpc('list_void_requests', { p_business: business.id })).then(
        ({ data }) => Array.isArray(data) && setWaiting(data.length),
        () => {}
      )
    check()
    const id = setInterval(check, 60000)
    return () => clearInterval(id)
  }, [role, business, offlineMode, tab])

  async function signOut() {
    const n = getQueue().length
    if (n && !window.confirm(t('of.signoutWarn', { n }))) return
    clearAllStaffData()
    await supabase.auth.signOut().catch(() => {})
    if (hasStoredLogin()) {
      // No signal: the server couldn't be told, so remove the login from this phone ourselves.
      try {
        Object.keys(localStorage).filter((k) => /^sb-.*-auth-token$/.test(k)).forEach((k) => localStorage.removeItem(k))
      } catch {
        /* ignore */
      }
    }
    setBusiness(undefined)
    resolve(null)
  }

  if (session === undefined) return <main className="page"><p className="muted">{t('loading')}</p></main>
  if (!session) return <AuthForm />
  if (error) return <main className="page"><Banner kind="error">{error}</Banner></main>
  if (business === undefined) return <main className="page"><p className="muted">{t('loading')}</p></main>
  if (business === null) return <CreateBusiness onDone={loadBusiness} email={session.user?.email} />

  const isOwner = role === 'owner'
  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">Sello</span>
        <span className="biz">
          {offlineMode && <span className="offline-tag">{t('of.mode')} · </span>}
          {business.name}
        </span>
      </header>
      <div className="shell-body">
        {tab === 'inicio' && (
          <>
            {isOwner && waiting > 0 && (
              <button className="alert" onClick={() => setTab('panel')}>
                <span>{waiting === 1 ? t('al.one') : t('al.many', { n: waiting })}</span>
                <b>{t('al.review')} ▸</b>
              </button>
            )}
            <Checkin business={business} isOwner={isOwner} />
            {!isOwner && (
              <div className="center">
                <button className="link-btn" onClick={() => setTour(true)}>{t('ob.help')}</button>
                <button className="link-btn" onClick={signOut}>{t('pn.signout')}</button>
              </div>
            )}
          </>
        )}
        {tab === 'panel' && isOwner && <Panel business={business} onSignOut={signOut} onChanged={loadBusiness} />}
      </div>
      <Onboarding
        id="staff"
        open={tour}
        onClose={() => setTour(false)}
        steps={[
          { icon: '▤', title: t('os1.title'), body: t('os1.body') },
          { icon: '✓', title: t('os2.title'), body: t('os2.body') + (isOwner ? ` ${t('os2.owner')}` : '') },
        ]}
      />
      <nav className="app-footer">
        <button className={`foot-tab ${tab === 'inicio' ? 'active' : ''}`} onClick={() => setTab('inicio')}>
          <span className="foot-icon">⌂</span>
          <span>{t('nav.home')}</span>
        </button>
        {isOwner && (
          <button className={`foot-tab ${tab === 'panel' ? 'active' : ''}`} onClick={() => setTab('panel')}>
            <span className="foot-icon">▦{waiting > 0 && <i className="badge">{waiting}</i>}</span>
            <span>{t('nav.panel')}</span>
          </button>
        )}
      </nav>
    </div>
  )
}
