import { Link } from 'react-router-dom'
import { savedPasses } from '../lib.js'
import { useLang } from '../i18n.js'

export default function Home() {
  const { t } = useLang()
  const passes = savedPasses()
  return (
    <main className="page">
      <h1 className="wordmark">Sello</h1>
      <p className="muted">{t('home.tagline')}</p>

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

      <div className="spacer" />
      <Link to="/staff" className="btn ghost">
        {t('home.biz')}
      </Link>
    </main>
  )
}
