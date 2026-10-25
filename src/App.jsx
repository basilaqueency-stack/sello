import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home.jsx'
import Join from './pages/Join.jsx'
import Pass from './pages/Pass.jsx'

// Staff screens (and the camera scanner) are loaded only when a business opens
// them, so customers on a weak connection download far less.
const Staff = lazy(() => import('./staff/Staff.jsx'))

export default function App() {
  return (
    <Suspense fallback={<main className="page"><p className="muted">Cargando…</p></main>}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/join/:slug" element={<Join />} />
        <Route path="/pass/:token" element={<Pass />} />
        <Route path="/staff" element={<Staff />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </Suspense>
  )
}
