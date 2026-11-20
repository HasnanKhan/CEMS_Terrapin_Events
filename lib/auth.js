import { randomBytes } from 'node:crypto'
import { cookies, headers } from 'next/headers'
import { query, transaction } from './db.js'
import { hashPassword, tokenHash, validEmail, validPassword, verifyPassword } from './password.js'
import { Problem, field } from './input.js'
import { clientIp, enforceRateLimit } from './rate-limit.js'

const cookieName = 'terrapin_session'
const dummyHash = 'demo-constant-salt:' + '00'.repeat(64)
export const extraRoles = ['organizer', 'administrator', 'system_admin']

export async function audit(db, actor, action, target, outcome) {
  const source = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim().slice(0, 100)
  await db.query('insert into audit_entries(actor_id,action,target,outcome,source_ip) values($1,$2,$3,$4,$5)',
    [actor?.id ?? null, action, target == null ? null : String(target), outcome, source || null])
}

export async function currentUser() {
  const token = (await cookies()).get(cookieName)?.value
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null
  const { rows: [user] } = await query(`
    update sessions s set expires_at=now()+interval '30 minutes'
    from accounts a where s.token_hash=$1 and s.account_id=a.id and a.active and s.expires_at > now()
    returning a.id,a.name,a.email,a.roles`, [tokenHash(token)])
  return user ?? null
}

export async function requireRole(user, roles, action, target) {
  if (user && roles.some(role => user.roles.includes(role))) return
  await audit({ query }, user, action, target, 'denied')
  throw new Problem(user ? 'You do not have permission for this action.' : 'Please sign in first.')
}

export async function authenticate(form, signup) {
  if (!signup) await enforceRateLimit('login', clientIp(await headers()) ?? 'unknown')
  const email = field(form, 'email').toLowerCase()
  const password = String(form.get('password') ?? '')
  if (signup) {
    if (!validEmail(email)) throw new Problem('Use an @umd.edu email address.')
    if (!validPassword(password)) throw new Problem('Use 12–128 characters with at least one letter and one number.')
    const name = field(form, 'name', 100)
    if (!name) throw new Problem('Enter your full name.')
    const result = await query('insert into accounts(name,email,password_hash) values($1,$2,$3) on conflict(email) do nothing',
      [name, email, await hashPassword(password)])
    if (!result.rowCount) throw new Problem('An account with this email already exists.')
    return 'Account created. You can now sign in.'
  }

  const token = randomBytes(32).toString('hex')
  const result = await transaction(async db => {
    const { rows: [account] } = await db.query(
      'select *, locked_until > now() as locked from accounts where email=$1 for update', [email.slice(0, 254)])
    if (account?.locked) {
      await audit(db, account, 'login', account.id, 'locked')
      return 'This account is temporarily locked. Try again in 15 minutes.'
    }
    const matches = await verifyPassword(password, account?.password_hash ?? dummyHash)
    if (!account?.active || !matches || password.length > 128) {
      if (account?.active) {
        const attempts = (account.locked_until ? 0 : account.failed) + 1
        await db.query(`update accounts set failed=$2,locked_until=case when $2 >= 5 then now()+interval '15 minutes' end
          where id=$1`, [account.id, attempts])
        if (attempts >= 5) await audit(db, account, 'account_lockout', account.id, 'success')
      }
      await audit(db, account, 'login', account?.id, 'failed')
      return 'Email or password is incorrect.'
    }
    await db.query('update accounts set failed=0,locked_until=null where id=$1', [account.id])
    await db.query('insert into sessions values($1,$2,now()+interval \'30 minutes\')', [tokenHash(token), account.id])
    await db.query('delete from sessions where expires_at <= now()')
    await audit(db, account, 'login', account.id, 'success')
    return null
  })

  if (result) throw new Problem(result)
  const jar = await cookies()
  jar.set(cookieName, token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/'
  })
  return 'Signed in.'
}

export async function signOut() {
  const jar = await cookies()
  const token = jar.get(cookieName)?.value
  if (token) await query('delete from sessions where token_hash=$1', [tokenHash(token)])
  jar.delete(cookieName)
}

export async function updateAccount(user, id, form) {
  await requireRole(user, ['system_admin'], 'account_update', id)
  const roles = ['attendee', ...extraRoles.filter(role => form.getAll('role').includes(role))]
  const active = form.get('active') === 'on'
  const updated = await transaction(async db => {
    await db.query('select pg_advisory_xact_lock(215734)')
    const { rows: [target] } = await db.query('select id from accounts where id=$1 for update', [id])
    if (!target) throw new Problem('Account does not exist.')
    const { rows: [actor] } = await db.query('select active,roles from accounts where id=$1', [user.id])
    if (!actor?.active || !actor.roles.includes('system_admin')) {
      await audit(db, user, 'account_update', id, 'denied')
      return false
    }
    if (!active || !roles.includes('system_admin')) {
      const { rowCount } = await db.query("select 1 from accounts where id<>$1 and active and 'system_admin'=any(roles) limit 1", [id])
      if (!rowCount) throw new Problem('Keep at least one active system administrator.')
    }
    await db.query('update accounts set roles=$2,active=$3 where id=$1', [id, roles, active])
    if (!active) await db.query('delete from sessions where account_id=$1', [id])
    await audit(db, user, 'account_update', id, 'success')
    return true
  })
  if (!updated) throw new Problem('You do not have permission for this action.')
}
