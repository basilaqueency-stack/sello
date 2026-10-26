import { createClient } from '@supabase/supabase-js'
import { tr } from './i18n.js'

// These two values are PUBLIC by design (they ship to every visitor's browser).
// What keeps data safe is the row-level security in supabase/schema.sql.
// NEVER put the secret / service_role key anywhere in this project.
const URL = import.meta.env.VITE_SUPABASE_URL || 'https://mevkyaucthricehhnpsn.supabase.co'
const KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_S0QhZBt55TwJF4eDOoPePQ_w_NSXX_e'

export const supabase = createClient(URL, KEY)

// Turns the short error codes raised by the database into plain Spanish or English.
const KNOWN = [
  'pendiente', 'vencida', 'sin_sellos', 'cancelada', 'sin_permiso', 'slug_en_uso',
  'negocio_no_existe', 'nivel_no_existe', 'nombre_invalido', 'telefono_invalido', 'no_encontrada', 'correo_invalido',
  'puntos_desactivados', 'monto_invalido', 'premio_no_existe', 'puntos_insuficientes', 'tiene_membresia',
  'solicitud_existente', 'sello_anulado', 'solicitud_no_existe', 'membresia_existente',
]

export function friendlyError(error) {
  if (!error) return ''
  const raw = (error.message || '').trim()
  if (KNOWN.includes(raw)) return tr(`e.${raw}`)
  // "Load failed" is how iPhones word a request that never reached the server.
  if (/Failed to fetch|Load failed|NetworkError|network/i.test(raw))
    return tr('e.network')
  return raw || tr('e.generic')
}
