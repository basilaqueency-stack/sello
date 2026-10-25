// Small shared helpers.

export function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

export function fmtDateTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('es-MX', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function money(n) {
  return `$${Number(n || 0).toLocaleString('es-MX')} MXN`
}

export const STATUS_LABEL = {
  pending: 'Pendiente de pago',
  active: 'Activa',
  expired: 'Vencida',
  cancelled: 'Cancelada',
}

// Passes this phone has joined, so a customer can find them again.
const KEY = 'sello_passes'

export function savedPasses() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch {
    return []
  }
}

export function savePass(token, businessName) {
  try {
    const rest = savedPasses().filter((p) => p.token !== token)
    localStorage.setItem(KEY, JSON.stringify([{ token, businessName }, ...rest]))
  } catch {
    /* storage can be blocked; the pass link still works */
  }
}
