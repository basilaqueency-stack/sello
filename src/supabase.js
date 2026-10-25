import { createClient } from '@supabase/supabase-js'

// These two values are PUBLIC by design (they ship to every visitor's browser).
// What keeps data safe is the row-level security in supabase/schema.sql.
// NEVER put the secret / service_role key anywhere in this project.
const URL = import.meta.env.VITE_SUPABASE_URL || 'https://mevkyaucthricehhnpsn.supabase.co'
const KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_S0QhZBt55TwJF4eDOoPePQ_w_NSXX_e'

export const supabase = createClient(URL, KEY)

// Turns the short error codes raised by the database into plain Spanish.
const MESSAGES = {
  pendiente: 'Esta membresía aún no está pagada. Confirma el pago para activarla.',
  vencida: 'La membresía está vencida. Renueva para seguir sellando.',
  sin_sellos: 'No quedan sellos este periodo.',
  cancelada: 'Esta membresía fue cancelada.',
  sin_permiso: 'No tienes permiso para hacer esto.',
  slug_en_uso: 'Ese nombre de enlace ya está en uso. Prueba con otro.',
  negocio_no_existe: 'No encontramos este negocio.',
  nivel_no_existe: 'Esa membresía ya no está disponible.',
  nombre_invalido: 'Escribe tu nombre.',
  telefono_invalido: 'Escribe un número de WhatsApp válido (solo dígitos, con lada).',
  no_encontrada: 'No encontramos esa membresía.',
}

export function friendlyError(error) {
  if (!error) return ''
  const raw = (error.message || '').trim()
  if (MESSAGES[raw]) return MESSAGES[raw]
  if (/Failed to fetch|NetworkError|network/i.test(raw)) return 'Sin conexión. Revisa tu señal e inténtalo de nuevo.'
  return raw || 'Algo salió mal. Inténtalo de nuevo.'
}
