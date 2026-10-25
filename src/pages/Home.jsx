import { Link } from 'react-router-dom'
import { savedPasses } from '../lib.js'

export default function Home() {
  const passes = savedPasses()
  return (
    <main className="page">
      <h1 className="wordmark">Sello</h1>
      <p className="muted">Tus membresías y puntos en un solo lugar.</p>

      <h2 className="section-label">Mis membresías</h2>
      {passes.length === 0 ? (
        <p className="muted">
          Aún no tienes ninguna. Escanea el código del mostrador de tu negocio favorito para unirte.
        </p>
      ) : (
        <div className="stack">
          {passes.map((p) => (
            <Link key={p.token} to={`/pass/${p.token}`} className="list-card">
              <strong>{p.businessName}</strong>
              <span>Ver pase ▸</span>
            </Link>
          ))}
        </div>
      )}

      <div className="spacer" />
      <Link to="/staff" className="btn ghost">
        Soy un negocio
      </Link>
    </main>
  )
}
