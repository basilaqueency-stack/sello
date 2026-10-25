// Keeps the counter working with weak or no signal.
//
// While there IS signal, the staff app downloads a "roster" (members with a live membership)
// and saves it on the phone. With no signal it searches that saved list, and every stamp is
// put in a queue. The queue is sent automatically when signal returns. Each stamp carries its
// own random id, so sending it twice can never stamp a customer twice.
import { supabase } from './supabase.js'

const K = {
  cache: 'sello_staff_cache', // { business, role }
  roster: (id) => `sello_roster_${id}`, // { at, members }
  queue: 'sello_queue', // stamps waiting to be sent
  failed: 'sello_failed', // stamps the server refused
}

function read(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null')
    return v ?? fallback
  } catch {
    return fallback
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage full or blocked: the app still works online */
  }
}

// ----- Is this a "no signal" failure (as opposed to the server saying no)? -----
export function isNetworkError(error) {
  if (!error) return false
  const m = `${error.name || ''} ${error.message || ''}`
  return /Failed to fetch|Load failed|NetworkError|network|AbortError|TimeoutError|aborted|timed out/i.test(m)
}

// Gives up on a request after a few seconds so a weak signal doesn't leave the counter hanging.
export function withTimeout(builder, ms = 8000) {
  return builder.abortSignal(AbortSignal.timeout(ms))
}

// ----- Saved business + role (so the app can open with no signal) -----
export const saveStaffCache = (business, role) => write(K.cache, { business, role })
export const loadStaffCache = () => read(K.cache, null)

export function hasStoredLogin() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (/^sb-.*-auth-token$/.test(k) && localStorage.getItem(k)) return true
    }
  } catch {
    /* ignore */
  }
  return false
}

// ----- Roster -----
export const saveRoster = (businessId, members) => write(K.roster(businessId), { at: Date.now(), members })
export const loadRoster = (businessId) => read(K.roster(businessId), null)

export async function refreshRoster(businessId) {
  const { data, error } = await withTimeout(supabase.rpc('staff_roster', { p_business: businessId }), 15000)
  if (!error && Array.isArray(data)) saveRoster(businessId, data)
  return !error
}

// Search the saved list the same way the server does: pass code, name, or phone digits.
export function searchRoster(businessId, text) {
  const r = loadRoster(businessId)
  if (!r) return null
  const q = text.trim()
  if (!q) return []
  const queued = getQueue()
  const adjust = (m) => {
    const n = queued.filter((s) => s.kind !== 'points' && s.membership_id === m.membership?.id).length
    if (!n || !m.membership || m.membership.credits_remaining == null) return m
    return { ...m, membership: { ...m.membership, credits_remaining: Math.max(0, m.membership.credits_remaining - n) } }
  }
  if (/^[0-9a-f-]{36}$/i.test(q)) return r.members.filter((m) => m.pass_token === q.toLowerCase()).map(adjust)
  const digits = q.replace(/\D/g, '')
  return r.members
    .filter((m) => m.name.toLowerCase().includes(q.toLowerCase()) || (digits.length >= 3 && (m.phone || '').includes(digits)))
    .slice(0, 20)
    .map(adjust)
}

// ----- Queue -----
export const getQueue = () => read(K.queue, [])
export const getFailed = () => read(K.failed, [])
export const clearFailed = () => write(K.failed, [])

// Queues points to give (visit points or a bill amount) for when there is signal.
export function queuePoints(business, member, amount, client_id = crypto.randomUUID(), at = new Date().toISOString()) {
  write(K.queue, [
    ...getQueue(),
    { kind: 'points', client_id, member_id: member.member_id, business_id: business.id, name: member.name, amount: amount ?? null, at },
  ])
}

// Checks the saved copy of the membership, then queues the stamp. Returns { error } or { member }.
export function queueStamp(business, member, client_id = crypto.randomUUID(), at = new Date().toISOString()) {
  const ms = member.membership
  if (!ms) return { error: 'no_encontrada' }
  if (ms.status === 'pending') return { error: 'pendiente' }
  if (ms.status === 'cancelled') return { error: 'cancelada' }
  if (ms.status === 'expired' || !ms.expires_at || new Date(ms.expires_at) < new Date()) return { error: 'vencida' }
  const left = ms.credits_remaining
  if (ms.kind === 'credits' && (left ?? 0) <= 0) return { error: 'sin_sellos' }
  const item = {
    client_id,
    membership_id: ms.id,
    business_id: business.id,
    name: member.name,
    at,
  }
  write(K.queue, [...getQueue(), item])
  const gives = business.points_enabled && business.points_mode === 'visit' ? business.points_per_visit : 0
  const updated = {
    ...member,
    points: (member.points || 0) + gives,
    membership: { ...ms, credits_remaining: ms.kind === 'credits' ? left - 1 : ms.credits_remaining },
  }
  return { member: updated }
}

// Sends one stamp. If the database hasn't had the newest update yet (no p_at), retry the old way,
// so the app keeps working in the meantime.
export async function sendStamp(membership, client_id, at, ms = 8000) {
  let res = await withTimeout(supabase.rpc('redeem_stamp', { p_membership: membership, p_client_id: client_id, p_at: at }), ms)
  if (res.error?.code === 'PGRST202')
    res = await withTimeout(supabase.rpc('redeem_stamp', { p_membership: membership, p_client_id: client_id }), ms)
  return res
}

let flushing = false

// Sends queued stamps oldest-first. Stops at the first "no signal"; refused stamps move to `failed`.
export async function flushQueue() {
  if (flushing) return { sent: 0, left: getQueue().length }
  flushing = true
  let sent = 0
  try {
    for (;;) {
      const queue = getQueue()
      if (queue.length === 0) break
      const item = queue[0]
      // After a long time offline the login has expired: renew it first, and wait if that isn't possible yet.
      const { data: auth } = await supabase.auth.getSession()
      if (!auth.session) break
      const { error } =
        item.kind === 'points'
          ? await withTimeout(
              supabase.rpc('award_points', {
                p_member: item.member_id, p_amount: item.amount, p_client_id: item.client_id, p_at: item.at,
              }),
              10000
            )
          : await sendStamp(item.membership_id, item.client_id, item.at, 10000)
      if (isNetworkError(error) || error?.code === 'PGRST301' || /JWT|token/i.test(error?.message || '')) break
      write(K.queue, getQueue().filter((q) => q.client_id !== item.client_id))
      if (error) write(K.failed, [...getFailed(), { ...item, code: (error.message || '').trim() }])
      else sent += 1
    }
  } finally {
    flushing = false
  }
  return { sent, left: getQueue().length }
}

export function clearAllStaffData() {
  try {
    const keys = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && (k.startsWith('sello_roster_') || [K.cache, K.queue, K.failed].includes(k))) keys.push(k)
    }
    keys.forEach((k) => localStorage.removeItem(k))
  } catch {
    /* ignore */
  }
}
