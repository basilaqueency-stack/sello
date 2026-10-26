// Helps people put Sello on their home screen (so it opens like an app).
let deferred = null
if (typeof window !== 'undefined') {
  // Android / Chrome offers a real "install" button once the page qualifies; keep it for later.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
  })
}

export function isStandalone() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
  } catch {
    return false
  }
}

export function platform() {
  const ua = navigator.userAgent || ''
  if (/iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'other'
}

export const canPromptInstall = () => !!deferred

export async function promptInstall() {
  if (!deferred) return false
  deferred.prompt()
  const choice = await deferred.userChoice.catch(() => null)
  deferred = null
  return choice?.outcome === 'accepted'
}
