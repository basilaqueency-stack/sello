import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, friendlyError } from '../supabase.js'
import { money } from '../lib.js'
import { Banner } from '../components.jsx'
import { useLang } from '../i18n.js'

const CATEGORIES = ['cafe', 'beauty', 'restaurant', 'other']

// Public directory: every business that uses Sello and has a membership to join.
export default function Explore() {
  const { t } = useLang()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [list, setList] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    // Wait a moment after typing so we don't ask the server on every letter.
    const id = setTimeout(async () => {
      const { data, error } = await supabase.rpc('directory_list', { p_query: query, p_category: category })
      if (error) setError(friendlyError(error))
      else {
        setError('')
        setList(data)
      }
    }, 250)
    return () => clearTimeout(id)
  }, [query, category])

  return (
    <main className="page">
      <h1 className="title">{t('ex.title')}</h1>
      <p className="muted">{t('ex.sub')}</p>

      <div className="stack form">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('ex.search')} inputMode="search" />
      </div>
      <div className="chips">
        {['', ...CATEGORIES].map((c) => (
          <button key={c || 'all'} className={`chip ${category === c ? 'on' : ''}`} onClick={() => setCategory(c)}>
            {c ? t(`cat.${c}`) : t('ex.all')}
          </button>
        ))}
      </div>

      <Banner kind="error">{error}</Banner>
      {list === null && !error && <p className="muted">{t('loading')}</p>}
      {list?.length === 0 && <p className="muted">{t('ex.none')}</p>}
      <div className="stack">
        {list?.map((b) => (
          <Link key={b.slug} to={`/join/${b.slug}`} className="tier-card">
            <strong>{b.name}</strong>
            <span className="mono small">
              {t(`cat.${b.category}`)}
              {b.neighborhood ? ` · ${b.neighborhood}` : ''}
              {b.from_price != null ? ` · ${t('ex.from', { price: money(b.from_price) })}` : ''}
            </span>
            {b.description && <small>{b.description}</small>}
            <small>
              {b.points_enabled ? `${t('ex.points')} · ` : ''}
              {t('ex.view')}
            </small>
          </Link>
        ))}
      </div>
    </main>
  )
}
