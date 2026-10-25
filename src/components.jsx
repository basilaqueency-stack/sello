// Pieces shared by the customer and staff screens.
import { tr } from './i18n.js'

// The stamp card: filled circles for stamps used, empty for stamps left.
export function StampGrid({ membership, dark = false }) {
  if (!membership) return null
  if (membership.kind === 'unlimited') {
    return (
      <div className={`stamp-card ${dark ? 'on-dark' : ''}`}>
        <div className="stamp-unlimited">{tr('stamp.unlimited')}</div>
      </div>
    )
  }
  const total = membership.credits_total || 0
  const left = membership.credits_remaining ?? 0
  const used = Math.max(0, total - left)
  return (
    <div className={`stamp-card ${dark ? 'on-dark' : ''}`}>
      <div className="stamp-row">
        {Array.from({ length: total }).map((_, i) => (
          <span key={i} className={`stamp ${i < used ? 'filled' : ''}`}>
            ✓
          </span>
        ))}
      </div>
      <div className="stamp-meta">
        <span>
          {tr('stamp.used', { used, total })}
        </span>
        <span>{tr('stamp.left', { n: left })}</span>
      </div>
    </div>
  )
}

export function Banner({ kind = 'info', children }) {
  if (!children) return null
  return <div className={`banner ${kind}`}>{children}</div>
}
