import { randomBytes } from 'node:crypto'
import { cookies, headers } from 'next/headers'
import { query, transaction } from './db.js'
import { dummyHash, hashPassword, passwordNeedsUpgrade, tokenHash, validEmail, validPassword, verifyPassword } from './password.js'
import { Problem, field, formText, integer, optionalId } from './input.js'
import { clientIp, enforceRateLimit } from './rate-limit.js'

const cookieName = 'terrapin_session'
export const extraRoles = ['organizer', 'administrator', 'system_admin']

export async function audit(db, actor, action, target, outcome) {
  const source = clientIp(await headers())
  await db.query('insert into audit_entries(actor_id,action,target,outcome,source_ip) values($1,$2,$3,$4,$5)',
    [actor?.id ?? null, action, target == null ? null : String(target), outcome, source || null])
}

export async function currentUser() {
  const token = (await cookies()).get(cookieName)?.value
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null
  const { rows: [user] } = await query(`
    update sessions s set expires_at=least(now()+interval '30 minutes',s.absolute_expires_at)
    from accounts a where s.token_hash=$1 and s.account_id=a.id and a.active
      and s.expires_at > now() and s.absolute_expires_at > now()
    returning a.id,a.name,a.email,a.roles`, [tokenHash(token)])
  return user ?? null
}

export async function requireRole(user, roles, action, target) {
  if (user && roles.some(role => user.roles.includes(role))) return
  await audit({ query }, user, action, target, 'denied')
  throw new Problem(user ? 'You do not have permission for this action.' : 'Please sign in first.')
}

export async function requireRateLimit(scope, subject, actor, action, target = null) {
  try {
    await enforceRateLimit(scope, subject)
  } catch (error) {
    if (error instanceof Problem) await audit({ query }, actor, action, target, 'rate_limited')
    throw error
  }
}

export function selfSignupEnabled() {
  const setting = process.env.SELF_SIGNUP_ENABLED
  return setting === undefined || setting === 'true'
}

export async function authenticate(form, signup) {
  if (signup && !selfSignupEnabled()) throw new Problem('Account creation is currently unavailable.')
  const action = signup ? 'signup' : 'login'
  await requireRateLimit(action, clientIp(await headers()) ?? 'unknown', null, action)
  let email
  let password
  try {
    email = field(form, 'email').toLowerCase()
    password = formText(form, 'password')
  } catch (error) {
    if (!signup && error instanceof Problem) await audit({ query }, null, 'login', null, 'invalid')
    throw error
  }
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
    if (!account?.active || !matches) {
      if (account?.active) {
        const attempts = (account.locked_until ? 0 : account.failed) + 1
        await db.query(`update accounts set failed=$2,locked_until=case when $2 >= 5 then now()+interval '15 minutes' end
          where id=$1`, [account.id, attempts])
        if (attempts >= 5) await audit(db, account, 'account_lockout', account.id, 'success')
      }
      await audit(db, account, 'login', account?.id, 'failed')
      return 'Email or password is incorrect.'
    }
    const upgraded = passwordNeedsUpgrade(account.password_hash) ? await hashPassword(password) : null
    await db.query('update accounts set failed=0,locked_until=null,password_hash=coalesce($2,password_hash) where id=$1',
      [account.id, upgraded])
    await db.query('insert into sessions(token_hash,account_id,expires_at) values($1,$2,now()+interval \'30 minutes\')', [tokenHash(token), account.id])
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

export async function updateAccount(user, targetId, form) {
  await requireRole(user, ['system_admin'], 'account_update', optionalId(targetId))
  const id = integer(targetId)
  const chosenRoles = form.getAll('role')
  if (chosenRoles.some(role => !extraRoles.includes(role))) throw new Problem('Choose valid account roles.')
  const roles = ['attendee', ...extraRoles.filter(role => chosenRoles.includes(role))]
  const activeValue = formText(form, 'active')
  if (activeValue !== '' && activeValue !== 'on') throw new Problem('Choose a valid account status.')
  const active = activeValue === 'on'
  const updated = await transaction(async db => {
    await db.query('select pg_advisory_xact_lock(215734)')
    const { rows: [target] } = await db.query('select id,roles,active from accounts where id=$1 for update', [id])
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
    if (target.roles.length !== roles.length || roles.some(role => !target.roles.includes(role))) {
      await audit(db, user, 'role_change', id, 'success')
    }
    if (target.active !== active) {
      await audit(db, user, active ? 'account_activation' : 'account_deactivation', id, 'success')
    }
    return true
  })
  if (!updated) throw new Problem('You do not have permission for this action.')
}
