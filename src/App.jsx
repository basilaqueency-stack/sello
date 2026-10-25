import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home.jsx'
import Join from './pages/Join.jsx'
import Pass from './pages/Pass.jsx'
import Explore from './pages/Explore.jsx'
import { useLang } from './i18n.js'

// Staff screens (and the camera scanner) are loaded only when a business opens
// them, so customers on a weak connection download far less.
const Staff = lazy(() => import('./staff/Staff.jsx'))

function LangSwitch() {
  const { lang, setLang, t } = useLang()
  return (
    <div className="lang-bar" role="group" aria-label={t('lang.label')}>
      <button className={lang === 'es' ? 'on' : ''} onClick={() => setLang('es')}>ES</button>
      <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
    </div>
  )
}

export default function App() {
  const { t } = useLang()
  return (
    <Suspense fallback={<main className="page"><p className="muted">{t('loading')}</p></main>}>
      <LangSwitch />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/join/:slug" element={<Join />} />
        <Route path="/pass/:token" element={<Pass />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/staff" element={<Staff />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </Suspense>
  )
}
