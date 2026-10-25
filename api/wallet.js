// "Add to Wallet" for a customer's pass. One function, three jobs (?type=...):
//   config  -> tells the app which wallet buttons to show (only the ones that are set up)
//   google  -> sends the customer to Google Wallet with their pass
//   apple   -> returns an Apple Wallet .pkpass file
// Needs secrets set in Vercel (see README, "Wallet passes"). Without them, no buttons are shown.
import crypto from 'node:crypto'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://mevkyaucthricehhnpsn.supabase.co'
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_S0QhZBt55TwJF4eDOoPePQ_w_NSXX_e'
const PLUM = '#741b47'

const env = (k) => (process.env[k] || '').trim()
export const googleReady = () =>
  !!(env('GOOGLE_WALLET_ISSUER_ID') && env('GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL') && env('GOOGLE_WALLET_PRIVATE_KEY'))
export const appleReady = () =>
  !!(env('APPLE_PASS_TYPE_ID') && env('APPLE_TEAM_ID') && env('APPLE_SIGNER_CERT') && env('APPLE_SIGNER_KEY') && env('APPLE_WWDR_CERT'))

const b64url = (x) => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url')
const fromB64 = (v) => (v.includes('BEGIN') ? v : Buffer.from(v, 'base64').toString('utf8')).replace(/\\n/g, '\n')

async function getPass(token) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_pass`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_token: token }),
  })
  if (!r.ok) return null
  return r.json()
}

export function googleSaveUrl(pass, token, origin) {
  const issuer = env('GOOGLE_WALLET_ISSUER_ID')
  const email = env('GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL')
  const key = fromB64(env('GOOGLE_WALLET_PRIVATE_KEY'))
  const classId = `${issuer}.sello_${crypto.createHash('sha1').update(pass.business.name).digest('hex').slice(0, 16)}`
  const ms = pass.membership
  const object = {
    id: `${issuer}.${token}`,
    classId,
    state: 'ACTIVE',
    accountId: token,
    accountName: pass.name,
    barcode: { type: 'QR_CODE', value: token },
    textModulesData: ms ? [{ id: 'plan', header: ms.tier_name, body: ms.status }] : [],
  }
  if (pass.business.points_enabled) object.loyaltyPoints = { label: 'Puntos', balance: { int: pass.points || 0 } }
  const claims = {
    iss: email,
    aud: 'google',
    typ: 'savetowallet',
    iat: Math.floor(Date.now() / 1000),
    origins: [origin],
    payload: {
      loyaltyClasses: [
        {
          id: classId,
          issuerName: 'Sello',
          programName: pass.business.name,
          programLogo: { sourceUri: { uri: `${origin}/icon-512.png` }, contentDescription: { defaultValue: { language: 'es', value: 'Sello' } } },
          hexBackgroundColor: PLUM,
          reviewStatus: 'UNDER_REVIEW',
        },
      ],
      loyaltyObjects: [object],
    },
  }
  const unsigned = `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url(claims)}`
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(key).toString('base64url')
  return `https://pay.google.com/gp/v/save/${unsigned}.${sig}`
}

export async function applePkpass(pass, token, origin) {
  const { PKPass } = await import('passkit-generator')
  const icon = Buffer.from(await (await fetch(`${origin}/icon-192.png`)).arrayBuffer())
  const logo = Buffer.from(await (await fetch(`${origin}/icon-512.png`)).arrayBuffer())
  const p = new PKPass(
    { 'icon.png': icon, 'icon@2x.png': icon, 'logo.png': icon, 'logo@2x.png': logo },
    {
      wwdr: fromB64(env('APPLE_WWDR_CERT')),
      signerCert: fromB64(env('APPLE_SIGNER_CERT')),
      signerKey: fromB64(env('APPLE_SIGNER_KEY')),
      signerKeyPassphrase: env('APPLE_SIGNER_KEY_PASSPHRASE') || undefined,
    },
    {
      formatVersion: 1,
      passTypeIdentifier: env('APPLE_PASS_TYPE_ID'),
      teamIdentifier: env('APPLE_TEAM_ID'),
      organizationName: 'Sello',
      description: `${pass.business.name} · Sello`,
      serialNumber: token,
      logoText: pass.business.name,
      backgroundColor: 'rgb(116, 27, 71)',
      foregroundColor: 'rgb(255, 255, 255)',
      labelColor: 'rgb(255, 255, 255)',
    }
  )
  p.type = 'storeCard'
  const ms = pass.membership
  if (pass.business.points_enabled) p.primaryFields.push({ key: 'points', label: 'PUNTOS', value: pass.points || 0 })
  p.secondaryFields.push({ key: 'name', label: 'NOMBRE', value: pass.name })
  if (ms) p.secondaryFields.push({ key: 'plan', label: 'MEMBRESÍA', value: ms.tier_name })
  p.setBarcodes({ message: token, format: 'PKBarcodeFormatQR', messageEncoding: 'iso-8859-1' })
  return p.getAsBuffer()
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host}`)
  const type = url.searchParams.get('type')
  const origin = `https://${req.headers.host}`.replace('https://localhost', 'http://localhost')

  if (type === 'config') {
    res.setHeader('Cache-Control', 'public, max-age=300')
    return res.status(200).json({ google: googleReady(), apple: appleReady() })
  }

  const token = url.searchParams.get('token') || ''
  if (!UUID.test(token)) return res.status(400).send('Bad pass link')
  if ((type === 'google' && !googleReady()) || (type === 'apple' && !appleReady()) || !['google', 'apple'].includes(type))
    return res.status(501).send('Wallet is not set up yet')

  try {
    const pass = await getPass(token)
    if (!pass) return res.status(404).send('Pass not found')
    if (type === 'google') {
      res.setHeader('Cache-Control', 'no-store')
      return res.redirect(302, googleSaveUrl(pass, token, origin))
    }
    const buf = await applePkpass(pass, token, origin)
    res.setHeader('Content-Type', 'application/vnd.apple.pkpass')
    res.setHeader('Content-Disposition', 'attachment; filename="sello.pkpass"')
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).send(buf)
  } catch (e) {
    console.error('wallet error', e)
    return res.status(500).send('Could not create the wallet pass')
  }
}
