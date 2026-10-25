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

// ----- WhatsApp numbers -----
// We store every number in full international form, digits only (Mexico: 52 + 10 digits),
// so reminders can later be sent to the right place. The customer picks the country
// and types the local number; we clean up common habits and show them what we saved.

export const COUNTRIES = [
  { id: 'mx', label: 'México +52' },
  { id: 'us', label: 'EE. UU. / Canadá +1' },
  { id: 'other', label: 'Otro país' },
]

const MX_2_DIGIT_AREAS = ['55', '33', '81'] // Ciudad de México, Guadalajara, Monterrey

export function buildWhatsApp(country, otherCode, raw) {
  let n = (raw || '').replace(/\D/g, '')
  if (!n) return { ok: false, error: '' } // nothing typed yet

  if (country === 'mx') {
    // Remove old mobile prefixes (044, 045), the long-distance 01, or a full +52 / +521 pasted in.
    if (/^(044|045|521)\d{10}$/.test(n)) n = n.slice(3)
    else if (/^(52|01)\d{10}$/.test(n)) n = n.slice(2)
    if (!/^\d{10}$/.test(n))
      return { ok: false, error: 'Escribe los 10 dígitos de tu número (lada + número). Ejemplo: 322 123 4567' }
    const cut = MX_2_DIGIT_AREAS.includes(n.slice(0, 2)) ? 2 : 3
    const rest = n.slice(cut)
    const display = `+52 ${n.slice(0, cut)} ${rest.slice(0, rest.length - 4)} ${rest.slice(-4)}`
    return { ok: true, digits: `52${n}`, display }
  }

  if (country === 'us') {
    if (/^1\d{10}$/.test(n)) n = n.slice(1)
    if (!/^\d{10}$/.test(n)) return { ok: false, error: 'Escribe los 10 dígitos de tu número, con código de área.' }
    return { ok: true, digits: `1${n}`, display: `+1 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}` }
  }

  const code = (otherCode || '').replace(/\D/g, '').replace(/^0+/, '')
  if (!code) return { ok: false, error: 'Escribe el código de tu país (por ejemplo 44 para Reino Unido).' }
  n = n.replace(/^0+/, '')
  const all = `${code}${n}`
  if (all.length < 8 || all.length > 15) return { ok: false, error: 'Revisa el código de país y el número.' }
  return { ok: true, digits: all, display: `+${code} ${n}` }
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
