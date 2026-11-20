import { createHash, randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'

const secure = process.env.NODE_ENV === 'production'
const cookiePrefix = (secure ? '__Host-' : '') + 'terrapin_feedback_'
const cookieOptions = { httpOnly: true, secure, sameSite: 'lax', path: '/' }
const receiptPattern = /^[a-f0-9]{32}$/

function destinationPrefix(search) {
  const sorted = new URLSearchParams(search)
  sorted.sort()
  return createHash('sha256').update(sorted.toString()).digest('base64url') + '.'
}

export async function feedbackRedirect(path, message) {
  const receipt = randomBytes(16).toString('hex')
  const search = new URLSearchParams(path.slice(2))
  const jar = await cookies()
  const recent = jar.getAll().filter(({ name }) =>
    name.startsWith(cookiePrefix) && receiptPattern.test(name.slice(cookiePrefix.length)))
  for (const { name } of recent.slice(0, -7)) {
    jar.set(name, '', { ...cookieOptions, maxAge: 0 })
  }
  jar.set(cookiePrefix + receipt, destinationPrefix(search) + message, { ...cookieOptions, maxAge: 90 })
  search.set('feedback', receipt)
  return '/?' + search
}

export async function actionFeedback(params) {
  const receipt = params.feedback
  if (typeof receipt !== 'string' || !receiptPattern.test(receipt)) return null
  const value = (await cookies()).get(cookiePrefix + receipt)?.value
  if (!value) return null

  const search = new URLSearchParams()
  for (const [key, field] of Object.entries(params)) {
    if (key === 'feedback') continue
    if (typeof field !== 'string') return null
    search.set(key, field)
  }
  const prefix = destinationPrefix(search)
  return value.startsWith(prefix) ? value.slice(prefix.length) : null
}
