import { Link } from 'react-router-dom'
import { savedPasses } from '../lib.js'
import { useLang } from '../i18n.js'
import { hasStoredLogin, loadStaffCache } from '../offline.js'

export default function Home() {
  const { t } = useLang()
  const passes = savedPasses()
  // This phone is already signed in as staff or owner: offer to go straight back to the counter.
  const staff = hasStoredLogin() ? loadStaffCache() : null
  return (
    <main className="page">
      <h1 className="wordmark">Sello</h1>
      <p className="muted">{t('home.tagline')}</p>

      {staff && (
        <Link to="/staff" className="staff-resume">
          <strong>{t('home.staffContinue')}</strong>
          <span>{t('home.staffHint', { biz: staff.business?.name || '' })} ▸</span>
        </Link>
      )}

      <h2 className="section-label">{t('home.mine')}</h2>
      {passes.length === 0 ? (
        <p className="muted">
          {t('home.none')}
        </p>
      ) : (
        <div className="stack">
          {passes.map((p) => (
            <Link key={p.token} to={`/pass/${p.token}`} className="list-card">
              <strong>{p.businessName}</strong>
              <span>{t('home.view')}</span>
            </Link>
          ))}
        </div>
      )}

      <Link to="/explore" className="btn primary" style={{ marginTop: 18 }}>
        {t('home.explore')}
      </Link>
      <div className="spacer" />
      {!staff && (
        <>
          <Link to="/staff" className="btn ghost">
            {t('home.biz')}
          </Link>
          <p className="muted small center">{t('home.bizHelp')}</p>
        </>
      )}
    </main>
  )
}
