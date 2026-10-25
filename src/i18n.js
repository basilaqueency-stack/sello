// Spanish + English. Spanish is the default for Spanish-language phones; everyone else gets English.
// The choice is remembered on the phone and can be flipped with the ES | EN switch on every screen.
import { useEffect, useState } from 'react'

const KEY = 'sello_lang'

function detect() {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'es' || saved === 'en') return saved
  } catch {
    /* storage blocked: fall through to the phone's language */
  }
  return (navigator.language || 'es').toLowerCase().startsWith('es') ? 'es' : 'en'
}

let current = detect()
const listeners = new Set()
if (typeof document !== 'undefined') document.documentElement.lang = current

export const getLang = () => current
export const locale = () => (current === 'es' ? 'es-MX' : 'en-US')

export function setLang(l) {
  current = l
  try {
    localStorage.setItem(KEY, l)
  } catch {
    /* fine: the choice just won't be remembered */
  }
  document.documentElement.lang = l
  listeners.forEach((f) => f())
}

// tr('key', { name: 'Ana' }) fills {name} in the text.
export function tr(key, vars) {
  let s = DICT[current][key] ?? DICT.es[key] ?? key
  if (vars) for (const k of Object.keys(vars)) s = s.split(`{${k}}`).join(vars[k])
  return s
}

// Any component that calls this redraws when the language is switched.
export function useLang() {
  const [, force] = useState(0)
  useEffect(() => {
    const f = () => force((n) => n + 1)
    listeners.add(f)
    return () => listeners.delete(f)
  }, [])
  return { lang: current, t: tr, setLang }
}

const DICT = {
  es: {
    loading: 'Cargando…',
    'loading.pass': 'Cargando tu pase…',
    back: '← Volver',
    'lang.label': 'Idioma',

    'status.pending': 'Pendiente de pago',
    'status.active': 'Activa',
    'status.expired': 'Vencida',
    'status.cancelled': 'Cancelada',
    'status.none': 'Sin membresía',

    'home.tagline': 'Tus membresías y puntos en un solo lugar.',
    'home.mine': 'Mis membresías',
    'home.none': 'Aún no tienes ninguna. Escanea el código del mostrador de tu negocio favorito para unirte.',
    'home.view': 'Ver pase ▸',
    'home.biz': 'Soy un negocio',

    'join.notFound': 'No encontramos este negocio',
    'join.notFoundHelp': 'Revisa que el enlace o el código QR esté completo.',
    'join.pick': 'Elige tu membresía',
    'join.noTiers': 'Este negocio aún no tiene membresías disponibles.',
    'join.name': 'Nombre',
    'join.country': 'País',
    'join.code': 'Código',
    'join.codeLabel': 'Código de país',
    'join.willWrite': 'Te escribiremos por WhatsApp al {n}',
    'join.needPhone': 'Escribe tu número de WhatsApp.',
    'join.busy': 'Creando tu pase…',
    'join.submit': 'Obtener mi pase',
    'join.payNote': 'Pagas en el mostrador y el personal activa tu membresía. Tu pase aparece aquí al instante.',
    'tier.price': '{price} / {days} días',
    'tier.unlimited': '{unit} ilimitados cada {days} días',
    'tier.limited': '{n} {unit} cada {days} días',

    'pass.back': '← Mis membresías',
    'pass.offline': 'Sin conexión. Mostrando tu último pase guardado.',
    'pass.pending': 'Muestra este código en el mostrador y paga {price} para activar tu membresía.',
    'pass.expired': 'Tu membresía venció el {date}. Renueva en el mostrador antes de tu próxima visita.',
    'pass.renews': 'Renueva el {date}',
    'pass.history': 'Historial',
    'pass.stamped': 'Sello registrado',
    'pass.tip': 'Tip: en el menú de tu navegador elige "Agregar a pantalla de inicio" para abrir tu pase más rápido.',
    'pass.notFound': 'No encontramos este pase',
    'pass.notFoundHelp': 'Revisa que el enlace esté completo.',
    'pass.home': 'Ir al inicio',

    'stamp.unlimited': 'Ilimitado',
    'stamp.used': '{used}/{total} sellados',
    'stamp.left': 'quedan {n}',

    'country.mx': 'México +52',
    'country.us': 'EE. UU. / Canadá +1',
    'country.other': 'Otro país',
    'ph.mx': 'Escribe los 10 dígitos de tu número (lada + número). Ejemplo: 322 123 4567',
    'ph.us': 'Escribe los 10 dígitos de tu número, con código de área.',
    'ph.code': 'Escribe el código de tu país (por ejemplo 44 para Reino Unido).',
    'ph.check': 'Revisa el código de país y el número.',

    'e.pendiente': 'Esta membresía aún no está pagada. Confirma el pago para activarla.',
    'e.vencida': 'La membresía está vencida. Renueva para seguir sellando.',
    'e.sin_sellos': 'No quedan sellos este periodo.',
    'e.cancelada': 'Esta membresía fue cancelada.',
    'e.sin_permiso': 'No tienes permiso para hacer esto.',
    'e.slug_en_uso': 'Ese nombre de enlace ya está en uso. Prueba con otro.',
    'e.negocio_no_existe': 'No encontramos este negocio.',
    'e.nivel_no_existe': 'Esa membresía ya no está disponible.',
    'e.nombre_invalido': 'Escribe tu nombre.',
    'e.telefono_invalido': 'Escribe un número de WhatsApp válido (solo dígitos, con lada).',
    'e.no_encontrada': 'No encontramos esa membresía.',
    'e.network': 'No se pudo conectar. Revisa tu señal e inténtalo de nuevo; tus datos siguen aquí.',
    'e.generic': 'Algo salió mal. Inténtalo de nuevo.',

    'auth.title': 'Acceso para negocios',
    'auth.email': 'Correo',
    'auth.password': 'Contraseña',
    'auth.in': 'Entrar',
    'auth.up': 'Crear cuenta',
    'auth.toUp': 'Crear una cuenta nueva',
    'auth.toIn': 'Ya tengo cuenta',
    'auth.confirm': 'Revisa tu correo y confirma tu cuenta para entrar.',

    'cb.title': 'Crea tu negocio',
    'cb.sub': 'Solo tardas un minuto. Después podrás agregar tus membresías.',
    'cb.name': 'Nombre del negocio',
    'cb.slug': 'Enlace corto (sello.app/join/…)',
    'cb.unit': '¿Qué sellas? (en plural)',
    'cb.unitPh': 'cafés, cortes, sesiones',
    'cb.unitDefault': 'cafés',
    'cb.busy': 'Creando…',
    'cb.submit': 'Crear negocio',

    'nav.home': 'Inicio',
    'nav.panel': 'Panel',

    'ck.none': 'No encontramos a nadie con ese dato.',
    'ck.stamped': '¡Sellado!',
    'ck.stampedLeft': '¡Sellado! Quedan {n} {unit}.',
    'ck.paid': 'Pago confirmado. Membresía activa.',
    'ck.opening': 'Abriendo cámara…',
    'ck.expires': 'Vence el {date}',
    'ck.stampBtn': 'Registrar 1 sello',
    'ck.stamping': 'Sellando…',
    'ck.unpaid': 'Aún no ha pagado. Cobra {price} y confirma para activar.',
    'ck.confirm': 'Confirmar pago y activar',
    'ck.expiredBanner': 'Venció el {date}. No quedan sellos disponibles.',
    'ck.renew': 'Cobrar {price} y renovar',
    'ck.search': 'Buscar por nombre o teléfono…',
    'ck.scan': '▤ Escanear',
    'ck.results': 'Resultados',
    'ck.recent': 'Check-ins recientes',
    'ck.noRecent': 'Aún no hay check-ins. Escanea el código de un cliente para empezar.',
    'ck.left': 'quedan {n}',
    'ago.now': 'ahora',
    'ago.min': 'hace {n} min',
    'ago.h': 'hace {n} h',

    'pn.title': 'Panel',
    'pn.owner': '🔒 Solo dueño',
    'pn.active': 'miembros activos',
    'pn.perMonth': 'al mes',
    'pn.expiring': 'vencen esta semana',
    'pn.tiers': 'Membresías',
    'pn.noTiers': 'Crea tu primera membresía para que tus clientes puedan unirse.',
    'pn.unlimited': 'ilimitado',
    'pn.stamps': '{n} sellos',
    'pn.days': '{n} días',
    'pn.hidden': 'oculta',
    'pn.edit': 'Editar',
    'pn.hide': 'Ocultar',
    'pn.show': 'Mostrar',
    'pn.new': '+ Nueva membresía',
    'pn.counter': 'Código para tu mostrador',
    'pn.copied': 'Copiado ✓',
    'pn.copy': 'Copiar enlace',
    'pn.print': 'Imprime este código: tus clientes lo escanean para unirse.',
    'pn.signout': 'Cerrar sesión',

    'tf.name': 'Nombre',
    'tf.namePh': '10 cafés al mes',
    'tf.price': 'Precio (MXN)',
    'tf.kind': '¿Cuántos sellos incluye?',
    'tf.limited': 'Un número limitado (ej. 10 al mes)',
    'tf.unlimited': 'Sin límite (todos los que quiera)',
    'tf.perPeriod': 'Sellos por periodo',
    'tf.renew': 'Se renueva cada (días)',
    'tf.previewUnl': 'Tus clientes podrán sellar sin límite durante {days} días.',
    'tf.previewLim': 'Tus clientes recibirán {n} sellos cada {days} días.',
    'tf.warn': 'El nombre menciona un número, pero esta membresía no tiene límite de sellos. ¿Querías elegir "Un número limitado"?',
    'tf.save': 'Guardar',
    'tf.cancel': 'Cancelar',

    'sc.title': 'Escanear código',
    'sc.close': 'Cerrar',
    'sc.error': 'No pudimos abrir la cámara. Permite el acceso a la cámara o busca por teléfono.',
    'e.correo_invalido': 'Escribe un correo válido.',
    'tm.title': 'Equipo',
    'tm.help': 'Los empleados pueden buscar, escanear y sellar. No ven el panel.',
    'tm.emailPh': 'correo del empleado',
    'tm.invite': 'Invitar',
    'tm.owner': 'Dueño',
    'tm.staff': 'Empleado',
    'tm.pending': 'Invitación pendiente',
    'tm.remove': 'Quitar',
    'tm.cancelInvite': 'Cancelar',
    'tm.added': 'Listo: {email} ya tiene acceso.',
    'tm.sent': 'Invitación guardada. Pide a {email} que cree su cuenta con ese correo y la confirme.',
    'tm.confirmRemove': '¿Quitar el acceso de {email}?',
    'cb.employee': '¿Eres empleado? Pide al dueño que te invite con {email} y luego toca el botón.',
    'cb.invited': 'Ya me invitaron',
    'cb.noInvite': 'Todavía no hay una invitación para este correo.',
    'of.banner': 'Sin señal. Puedes seguir sellando; los sellos se enviarán cuando regrese la conexión.',
    'of.pending': '{n} sellos por enviar',
    'of.stampedOffline': '¡Sellado! Se enviará cuando haya señal.',
    'of.localSearch': 'Sin señal: buscando en la lista guardada en este teléfono.',
    'of.noRoster': 'Sin señal y aún no hay lista guardada. Conéctate una vez para descargarla.',
    'of.failed': 'Estos sellos no se pudieron registrar:',
    'of.dismiss': 'Entendido',
    'of.signoutWarn': 'Hay {n} sellos sin enviar. Si cierras sesión ahora se perderán. ¿Cerrar sesión?',
    'of.needSignal': 'Necesitas señal para hacer esto.',
    'of.sent': '{n} sellos enviados.',
    'of.mode': 'Modo sin conexión',
  },
  en: {
    loading: 'Loading…',
    'loading.pass': 'Loading your pass…',
    back: '← Back',
    'lang.label': 'Language',

    'status.pending': 'Payment pending',
    'status.active': 'Active',
    'status.expired': 'Expired',
    'status.cancelled': 'Cancelled',
    'status.none': 'No membership',

    'home.tagline': 'Your memberships and points in one place.',
    'home.mine': 'My memberships',
    'home.none': "You don't have any yet. Scan the code at your favorite business's counter to join.",
    'home.view': 'View pass ▸',
    'home.biz': "I'm a business",

    'join.notFound': "We couldn't find this business",
    'join.notFoundHelp': 'Check that the link or QR code is complete.',
    'join.pick': 'Choose your membership',
    'join.noTiers': "This business doesn't have any memberships available yet.",
    'join.name': 'Name',
    'join.country': 'Country',
    'join.code': 'Code',
    'join.codeLabel': 'Country code',
    'join.willWrite': "We'll message you on WhatsApp at {n}",
    'join.needPhone': 'Enter your WhatsApp number.',
    'join.busy': 'Creating your pass…',
    'join.submit': 'Get my pass',
    'join.payNote': 'You pay at the counter and the staff activates your membership. Your pass shows up here instantly.',
    'tier.price': '{price} / {days} days',
    'tier.unlimited': 'Unlimited {unit} every {days} days',
    'tier.limited': '{n} {unit} every {days} days',

    'pass.back': '← My memberships',
    'pass.offline': 'No connection. Showing your last saved pass.',
    'pass.pending': 'Show this code at the counter and pay {price} to activate your membership.',
    'pass.expired': 'Your membership expired on {date}. Renew at the counter before your next visit.',
    'pass.renews': 'Renews on {date}',
    'pass.history': 'History',
    'pass.stamped': 'Stamp recorded',
    'pass.tip': 'Tip: in your browser menu choose "Add to Home Screen" to open your pass faster.',
    'pass.notFound': "We couldn't find this pass",
    'pass.notFoundHelp': 'Check that the link is complete.',
    'pass.home': 'Go home',

    'stamp.unlimited': 'Unlimited',
    'stamp.used': '{used}/{total} stamped',
    'stamp.left': '{n} left',

    'country.mx': 'Mexico +52',
    'country.us': 'USA / Canada +1',
    'country.other': 'Other country',
    'ph.mx': 'Enter the 10 digits of your number (area code + number). Example: 322 123 4567',
    'ph.us': 'Enter the 10 digits of your number, including the area code.',
    'ph.code': 'Enter your country code (for example 44 for the United Kingdom).',
    'ph.check': 'Check the country code and the number.',

    'e.pendiente': "This membership hasn't been paid yet. Confirm payment to activate it.",
    'e.vencida': 'This membership has expired. Renew to keep stamping.',
    'e.sin_sellos': 'No stamps left this period.',
    'e.cancelada': 'This membership was cancelled.',
    'e.sin_permiso': "You don't have permission to do this.",
    'e.slug_en_uso': 'That link name is already taken. Try another.',
    'e.negocio_no_existe': "We couldn't find this business.",
    'e.nivel_no_existe': 'That membership is no longer available.',
    'e.nombre_invalido': 'Enter your name.',
    'e.telefono_invalido': 'Enter a valid WhatsApp number (digits only, with country code).',
    'e.no_encontrada': "We couldn't find that membership.",
    'e.network': "Couldn't connect. Check your signal and try again; your information is still here.",
    'e.generic': 'Something went wrong. Please try again.',

    'auth.title': 'Business sign-in',
    'auth.email': 'Email',
    'auth.password': 'Password',
    'auth.in': 'Sign in',
    'auth.up': 'Create account',
    'auth.toUp': 'Create a new account',
    'auth.toIn': 'I already have an account',
    'auth.confirm': 'Check your email and confirm your account to sign in.',

    'cb.title': 'Create your business',
    'cb.sub': 'It only takes a minute. Then you can add your memberships.',
    'cb.name': 'Business name',
    'cb.slug': 'Short link (sello.app/join/…)',
    'cb.unit': 'What do you stamp? (plural)',
    'cb.unitPh': 'coffees, haircuts, sessions',
    'cb.unitDefault': 'coffees',
    'cb.busy': 'Creating…',
    'cb.submit': 'Create business',

    'nav.home': 'Home',
    'nav.panel': 'Dashboard',

    'ck.none': "We couldn't find anyone matching that.",
    'ck.stamped': 'Stamped!',
    'ck.stampedLeft': 'Stamped! {n} {unit} left.',
    'ck.paid': 'Payment confirmed. Membership active.',
    'ck.opening': 'Opening camera…',
    'ck.expires': 'Expires on {date}',
    'ck.stampBtn': 'Record 1 stamp',
    'ck.stamping': 'Stamping…',
    'ck.unpaid': "Hasn't paid yet. Collect {price} and confirm to activate.",
    'ck.confirm': 'Confirm payment and activate',
    'ck.expiredBanner': 'Expired on {date}. No stamps available.',
    'ck.renew': 'Collect {price} and renew',
    'ck.search': 'Search by name or phone…',
    'ck.scan': '▤ Scan',
    'ck.results': 'Results',
    'ck.recent': 'Recent check-ins',
    'ck.noRecent': "No check-ins yet. Scan a customer's code to get started.",
    'ck.left': '{n} left',
    'ago.now': 'just now',
    'ago.min': '{n} min ago',
    'ago.h': '{n} h ago',

    'pn.title': 'Dashboard',
    'pn.owner': '🔒 Owner only',
    'pn.active': 'active members',
    'pn.perMonth': 'per month',
    'pn.expiring': 'expiring this week',
    'pn.tiers': 'Memberships',
    'pn.noTiers': 'Create your first membership so your customers can join.',
    'pn.unlimited': 'unlimited',
    'pn.stamps': '{n} stamps',
    'pn.days': '{n} days',
    'pn.hidden': 'hidden',
    'pn.edit': 'Edit',
    'pn.hide': 'Hide',
    'pn.show': 'Show',
    'pn.new': '+ New membership',
    'pn.counter': 'Code for your counter',
    'pn.copied': 'Copied ✓',
    'pn.copy': 'Copy link',
    'pn.print': 'Print this code: your customers scan it to join.',
    'pn.signout': 'Sign out',

    'tf.name': 'Name',
    'tf.namePh': '10 coffees a month',
    'tf.price': 'Price (MXN)',
    'tf.kind': 'How many stamps does it include?',
    'tf.limited': 'A limited number (e.g. 10 a month)',
    'tf.unlimited': 'No limit (as many as they like)',
    'tf.perPeriod': 'Stamps per period',
    'tf.renew': 'Renews every (days)',
    'tf.previewUnl': 'Your customers can stamp without limit for {days} days.',
    'tf.previewLim': 'Your customers will get {n} stamps every {days} days.',
    'tf.warn': 'The name mentions a number, but this membership has no stamp limit. Did you mean to choose "A limited number"?',
    'tf.save': 'Save',
    'tf.cancel': 'Cancel',

    'sc.title': 'Scan code',
    'sc.close': 'Close',
    'sc.error': "We couldn't open the camera. Allow camera access or search by phone.",
    'e.correo_invalido': 'Enter a valid email.',
    'tm.title': 'Team',
    'tm.help': "Employees can search, scan and stamp. They can't see the dashboard.",
    'tm.emailPh': "employee's email",
    'tm.invite': 'Invite',
    'tm.owner': 'Owner',
    'tm.staff': 'Employee',
    'tm.pending': 'Invite pending',
    'tm.remove': 'Remove',
    'tm.cancelInvite': 'Cancel',
    'tm.added': 'Done: {email} now has access.',
    'tm.sent': 'Invite saved. Ask {email} to create an account with that email and confirm it.',
    'tm.confirmRemove': "Remove {email}'s access?",
    'cb.employee': 'Are you an employee? Ask the owner to invite {email}, then tap the button.',
    'cb.invited': "I've been invited",
    'cb.noInvite': "There's no invite for this email yet.",
    'of.banner': "No signal. You can keep stamping; stamps will be sent when you're back online.",
    'of.pending': '{n} stamps waiting to send',
    'of.stampedOffline': "Stamped! It will be sent when there's signal.",
    'of.localSearch': 'No signal: searching the list saved on this phone.',
    'of.noRoster': 'No signal and no saved list yet. Connect once to download it.',
    'of.failed': "These stamps couldn't be recorded:",
    'of.dismiss': 'Got it',
    'of.signoutWarn': '{n} stamps have not been sent. If you sign out now they will be lost. Sign out?',
    'of.needSignal': 'You need signal to do this.',
    'of.sent': '{n} stamps sent.',
    'of.mode': 'Offline mode',
  },
}
