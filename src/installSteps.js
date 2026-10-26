import { isStandalone, platform, canPromptInstall, promptInstall } from './install.js'

// The "add to home screen" card. Returns [] when the app is already installed.
export function installStep(t) {
  if (isStandalone()) return []
  const p = platform()
  const step = { icon: '⤓', title: t('oi.title'), body: t('oi.body') }
  if (p === 'ios') step.list = [t('oi.ios1'), t('oi.ios2'), t('oi.ios3')]
  else if (p === 'android') {
    step.list = [t('oi.and1'), t('oi.and2')]
    if (canPromptInstall()) step.action = { label: t('oi.btn'), onClick: () => promptInstall() }
  } else step.list = [t('oi.other1')]
  return [step]
}
