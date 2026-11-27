import { strict as assert } from 'node:assert'
import crypto, { randomBytes } from 'node:crypto'
import { register, syncBuiltinESMExports } from 'node:module'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { database, query } from '../lib/db.js'
import { hashPassword, tokenHash } from '../lib/password.js'
import { testDatabase } from './support/database.js'
import { cookies, runRequest } from './support/request.js'

register('./support/resolve.js', import.meta.url)

test('prototype workflows with PostgreSQL', { skip: !process.env.TEST_DATABASE_URL }, async t => {
  const url = testDatabase()
  process.env.DATABASE_URL = url.href
  process.env.VERCEL = '1'
  process.env.SELF_SIGNUP_ENABLED = 'true'
  const auth = await import('../lib/auth.js')
  const { inbox } = await import('../lib/notification/service.js')
  const events = {
    ...await import('../lib/event/service.js'),
    ...await import('../lib/catalog/service.js'),
    ...await import('../lib/registration/service.js'),
    ...await import('../lib/venue/service.js')
  }

  const marker = randomBytes(3).toString('hex')
  const ip = '2001:db8::' + marker.slice(0, 4) + ':' + marker.slice(4)
  const password = 'TestPassword2026'
  const email = number => `test-${marker}-${number}@umd.edu`
  const ownerIds = []
  const queueEventIds = []
  const subjects = [tokenHash(ip)]
  let organizer
  let administrator
  let eventId

  function withSession(token, callback) {
    return runRequest(ip, () => {
      cookies().set('terrapin_session', token)
      return callback()
    })
  }

  async function session(accountId) {
    const token = randomBytes(32).toString('hex')
    await query("insert into sessions(token_hash,account_id,expires_at) values($1,$2,now()+interval '30 minutes')",
      [tokenHash(token), accountId])
    const actor = await withSession(token, () => auth.currentUser({ forWrite: true }))
    return { token, actor }
  }

  async function account(number, roles = ['attendee']) {
    const { rows: [row] } = await query('insert into accounts(name,email,password_hash,roles) values($1,$2,$3,$4) returning id',
      ['Test Account', email(number), await hashPassword(password), roles])
    ownerIds.push(row.id)
    subjects.push(tokenHash(String(row.id)))
    return (await session(row.id)).actor
  }

  async function waitForBlockedBy(blocker) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const { rows: [waiting] } = await query(`select pid from pg_stat_activity
        where datname=current_database() and wait_event_type='Lock' and $1=any(pg_blocking_pids(pid))`, [blocker])
      if (waiting) return waiting.pid
      await delay(25)
    }
    assert.fail('Expected a PostgreSQL operation to wait for the fixture lock.')
  }

  async function withBlockedWrite(lock, params, start, whileBlocked) {
    const blocker = await database().connect()
    let write
    try {
      await blocker.query('begin')
      await blocker.query(lock, params)
      write = start().catch(error => error)
      await whileBlocked(await waitForBlockedBy(blocker.processID))
    } finally {
      await blocker.query('rollback')
      blocker.release()
      await write
    }
    return write
  }

  const form = fields => {
    const data = new FormData()
    for (const [key, value] of Object.entries(fields)) data.set(key, value)
    return data
  }
  const credentials = (address, pass = password) => form({ email: address, password: pass, name: 'Test Account' })

  t.after(async () => {
    try {
      if (eventId) {
        await query('delete from notifications where event_id=$1', [eventId])
        await query('delete from registrations where event_id=$1', [eventId])
        await query('delete from events where id=$1', [eventId])
      }
      await query('delete from events where id=any($1::int[])', [queueEventIds])
      await query('delete from audit_entries where actor_id=any($1::int[]) or source_ip=$2', [ownerIds, ip])
      await query('delete from accounts where id=any($1::int[]) or email=$2', [ownerIds, email(0)])
      await query('delete from rate_limits where subject=any($1::text[])', [subjects])
    } finally {
      await database().end()
    }
  })

  await runRequest(ip, async () => {
    await t.test('FR-1–7 validates signup, locks failed logins, and expires and revokes sessions', async () => {
      await assert.rejects(auth.authenticate(credentials('guest@example.com'), true), /@umd.edu/)
      await assert.rejects(auth.authenticate(credentials(email(0), 'weak'), true), /12–128/)
      await assert.rejects(auth.authenticate(form({ email: email(0), password }), true), /full name/)
      assert.match(await auth.authenticate(credentials(email(0)), true), /Account created/)
      await assert.rejects(auth.authenticate(credentials(email(0)), true), /already exists/)
      const { rows: [created] } = await query('select id,roles from accounts where email=$1', [email(0)])
      ownerIds.push(created.id)
      assert.deepEqual(created.roles, ['attendee'])

      assert.equal(await auth.currentUser(), null)
      cookies().set('terrapin_session', 'invalid')
      assert.equal(await auth.currentUser(), null)
      for (let count = 0; count < 5; count++) {
        await assert.rejects(auth.authenticate(credentials(email(0), 'wrongPassword1'), false), /incorrect/)
      }
      await assert.rejects(auth.authenticate(credentials(email(0)), false), /temporarily locked/)
      const { rows: [lock] } = await query(`select extract(epoch from a.locked_until-l.created_at)::int as seconds
        from accounts a join audit_entries l on l.actor_id=a.id and l.action='account_lockout'
        where a.id=$1`, [created.id])
      assert.equal(lock.seconds, 15 * 60)
      await query("update accounts set locked_until=now()-interval '1 second' where id=$1", [created.id])
      await assert.rejects(auth.authenticate(credentials(email(0), 'wrongPassword1'), false), /incorrect/)
      await auth.authenticate(credentials(email(0)), false)
      const { rows: [session] } = await query(`select extract(epoch from s.expires_at-a.created_at)::int as idle_seconds,
        extract(epoch from s.absolute_expires_at-a.created_at)::int as maximum_seconds
        from sessions s join audit_entries a on a.actor_id=s.account_id and a.action='login' and a.outcome='success'
        where s.account_id=$1`, [created.id])
      assert.equal(session.idle_seconds, 30 * 60)
      assert.equal(session.maximum_seconds, 12 * 60 * 60)
      const profile = await auth.currentUser()
      assert.equal(profile.id, created.id)
      assert.equal(Object.hasOwn(profile, 'sessionHash'), false)
      const cookie = cookies().get('terrapin_session')
      assert.equal(cookie.httpOnly, true)
      assert.equal(cookie.sameSite, 'lax')
      await query("update sessions set expires_at=now()-interval '1 second' where account_id=$1", [created.id])
      assert.equal(await auth.currentUser(), null)
      await auth.authenticate(credentials(email(0)), false)
      await query("update sessions set absolute_expires_at=now()+interval '5 minutes' where account_id=$1", [created.id])
      assert.equal((await auth.currentUser()).id, created.id)
      const { rows: [capped] } = await query('select expires_at=absolute_expires_at as capped from sessions where account_id=$1', [created.id])
      assert.equal(capped.capped, true)
      await query(`update sessions set expires_at=now()+interval '5 minutes',
        absolute_expires_at=now()-interval '1 second' where account_id=$1`, [created.id])
      assert.equal(await auth.currentUser(), null)
      await auth.authenticate(credentials(email(0)), false)
      await auth.signOut()
      assert.equal(await auth.currentUser(), null)
      assert.equal((await query('select id from accounts where id=$1 and failed=0 and locked_until is null', [created.id])).rowCount, 1)
    })

    await t.test('blocks public signup when paused and limits attempts separately from sign-in', async () => {
      process.env.SELF_SIGNUP_ENABLED = 'false'
      try {
        await assert.rejects(auth.authenticate(credentials(email(9)), true), /currently unavailable/)
      } finally {
        process.env.SELF_SIGNUP_ENABLED = 'true'
      }
      assert.equal((await query('select 1 from accounts where email=$1', [email(9)])).rowCount, 0)
      await assert.rejects(auth.authenticate(credentials(email(9)), true), /Too many requests/)
      const record = await query("select 1 from audit_entries where action='signup' and outcome='rate_limited' and source_ip=$1", [ip])
      assert.equal(record.rowCount, 1)
      await auth.authenticate(credentials(email(0)), false)
      await auth.signOut()
    })

    await t.test('FR-8–9 and FR-62 enforce role management and record actor, target, and outcome', async () => {
      administrator = await account(1, ['attendee', 'administrator', 'system_admin'])
      organizer = await account(2, ['attendee'])
      const roles = form({ active: 'on', role: 'organizer' })
      await assert.rejects(auth.updateAccount(organizer, organizer.id, roles), /permission/)
      await auth.updateAccount(administrator, organizer.id, roles)
      organizer.roles = ['attendee', 'organizer']
      await auth.authenticate(credentials(organizer.email), false)
      assert.equal((await auth.currentUser()).id, organizer.id)
      await auth.updateAccount(administrator, organizer.id, form({ role: 'organizer' }))
      assert.equal(await auth.currentUser(), null)
      await auth.updateAccount(administrator, organizer.id, roles)
      organizer = (await session(organizer.id)).actor

      const { rows } = await query('select actor_id,action,outcome,source_ip from audit_entries where target=$1 and source_ip=$2',
        [String(organizer.id), ip])
      for (const [actor, action, outcome] of [
        [organizer, 'account_update', 'denied'],
        [administrator, 'role_change', 'success'],
        [administrator, 'account_deactivation', 'success'],
        [administrator, 'account_activation', 'success']
      ]) assert.ok(rows.some(row => row.actor_id === actor.id && row.action === action && row.outcome === outcome))
    })

    await t.test('NFR-11 and NFR-18 audit rejected requests and prune expired counters', async t => {
      await assert.rejects(auth.authenticate(credentials('x'.repeat(255)), false), /254 characters/)
      const expired = tokenHash('expired:' + marker)
      subjects.push(expired)
      await query(`insert into rate_limits(scope,subject,attempts,last_seen)
        values('login',$1,array[now()-interval '2 hours'],now()-interval '2 hours')`, [expired])
      await query(`update rate_limits set attempts=array_fill(now(),array[20])
        where scope='login' and subject=$1`, [tokenHash(ip)])
      const counter = t.mock.method(crypto, 'randomInt', () => 0)
      syncBuiltinESMExports()
      try {
        await assert.rejects(auth.authenticate(credentials(email(0)), false), /Too many requests/)
      } finally {
        counter.mock.restore()
        syncBuiltinESMExports()
      }
      assert.equal((await query('select 1 from rate_limits where subject=$1', [expired])).rowCount, 0)
      const { rows } = await query("select outcome from audit_entries where action='login' and source_ip=$1", [ip])
      assert.ok(rows.some(row => row.outcome === 'invalid'))
      assert.ok(rows.some(row => row.outcome === 'rate_limited'))
    })

    await t.test('FR-11–16 and FR-48/52 validate, edit, submit, and publish an owned draft', async () => {
      const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
      const venue = (await events.venues()).rows.find(row => row.name === 'Iribe Center')
      const details = {
        title: 'Test event ' + marker, description: 'Requirements verification', category: 'Academic',
        host: 'Sample organization', venue: String(venue.id), capacity: '1',
        starts: date + 'T17:00', ends: date + 'T18:00', deadline: date + 'T16:00'
      }
      for (const field of ['title', 'description', 'category', 'host']) {
        await assert.rejects(events.saveDraft(organizer, null, form({ ...details, [field]: '' })), /Complete/)
      }
      for (const field of ['venue', 'capacity']) {
        await assert.rejects(events.saveDraft(organizer, null, form({ ...details, [field]: '' })), /positive whole number/)
      }
      for (const field of ['starts', 'ends', 'deadline']) {
        await assert.rejects(events.saveDraft(organizer, null, form({ ...details, [field]: '' })), /dates and times/)
      }
      await assert.rejects(events.saveDraft(organizer, null, form({ ...details, starts: 'bad-date' })), /dates and times/)
      await assert.rejects(events.saveDraft(organizer, null, form({ ...details, capacity: '999' })), /selected venue/)
      await assert.rejects(events.saveDraft(organizer, null, form({ ...details, deadline: date + 'T18:30' })), /Eastern times/)
      await assert.rejects(events.saveDraft(organizer, null, form({ ...details, ends: details.starts })), /Eastern times/)
      await assert.rejects(events.saveDraft(organizer, null, form({
        ...details, starts: '2000-01-01T17:00', ends: '2000-01-01T18:00', deadline: '2000-01-01T16:00'
      })), /Eastern times/)
      await assert.rejects(events.saveDraft(organizer, null, form({ ...details, capacity: '0' })), /positive whole number/)
      await assert.rejects(events.saveDraft(organizer, null, form({ ...details, capacity: '1.5' })), /positive whole number/)
      eventId = await events.saveDraft(organizer, null, form(details))
      assert.equal(await events.getEvent(eventId, null), null)
      assert.equal((await events.getEvent(eventId, organizer)).status, 'draft')
      await assert.rejects(events.register(organizer, eventId), /Registration is closed/)
      assert.equal(await events.getEvent(eventId, administrator), null)
      assert.deepEqual(await events.roster(eventId, administrator), {
        event: { id: eventId, title: details.title, status: 'draft', starts_at: (await events.getEvent(eventId, organizer)).starts_at },
        rows: []
      })
      assert.equal((await events.roster(eventId, organizer)).event.status, 'draft')
      assert.equal(await events.roster(eventId, null), null)
      assert.equal(await events.roster(eventId, { id: administrator.id, roles: ['attendee', 'organizer'] }), null)
      await assert.rejects(events.rosterEvents(organizer, 1), /permission/)
      assert.ok((await events.rosterEvents(administrator, 1)).rows.some(row => row.id === eventId))
      await events.saveDraft(organizer, eventId, form({ ...details, description: 'Updated description' }))
      await assert.rejects(events.changeEvent(organizer, eventId, 'approve', form({})), /permission/)
      await events.changeEvent(organizer, eventId, 'submit', form({}))
      assert.ok((await events.approvalQueue(administrator, organizer.id)).rows.some(row => row.id === eventId))
      assert.equal((await events.getEvent(eventId, administrator)).status, 'pending')
      assert.equal((await events.roster(eventId, administrator)).event.status, 'pending')
      await assert.rejects(events.register(organizer, eventId), /Registration is closed/)
      await events.changeEvent(administrator, eventId, 'approve', form({}))
      const { rows } = await events.publicEvents({ keyword: marker.toUpperCase(), category: 'Academic', venue: venue.id, page: 1 })
      assert.equal(rows.length, 1)
      assert.equal(rows[0].description, 'Updated description')
      assert.ok((await events.organizerEvents(organizer)).rows.some(row => row.id === eventId))
    })

    await t.test('sign-out revokes a registration waiting on the event lock', async () => {
      const attendee = await account(16)
      const { token, actor } = await session(attendee.id)
      const result = await withBlockedWrite('select id from events where id=$1 for update', [eventId],
        () => events.register(actor, eventId),
        () => withSession(token, auth.signOut))

      assert.match(result.message, /session ended/)
      assert.equal((await events.registration(attendee, eventId)).rowCount, 0)
      assert.equal((await query('select 1 from notifications where account_id=$1', [attendee.id])).rowCount, 0)
      assert.equal((await query(`select 1 from audit_entries where actor_id=$1 and target=$2
        and action='registration_create' and outcome='denied'`, [attendee.id, String(eventId)])).rowCount, 1)
      assert.equal((await query('select 1 from sessions where token_hash=$1', [attendee.sessionHash])).rowCount, 1)
    })

    await t.test('sign-out waits for an authorized registration to commit', async t => {
      const attendee = await account(17)
      const { token, actor } = await session(attendee.id)
      t.after(async () => {
        await query('delete from notifications where account_id=$1', [attendee.id])
        await query('delete from registrations where account_id=$1', [attendee.id])
      })

      let loggedOut
      const result = await withBlockedWrite('lock table notifications in share mode', [],
        () => events.register(actor, eventId),
        async writerPid => {
          loggedOut = withSession(token, async () => {
            await auth.signOut()
            return (await events.registration(attendee, eventId)).rowCount
          }).catch(error => error)
          await waitForBlockedBy(writerPid)
        })

      assert.match(result.message, /seat is confirmed/)
      assert.equal(await loggedOut, 1)
      await assert.rejects(events.cancelRegistration(actor, result.id), /session ended/)
    })

    await t.test('sign-out revokes an account update waiting on its target', async () => {
      const { token, actor } = await session(administrator.id)
      const target = await account(18)
      const result = await withBlockedWrite('select id from accounts where id=$1 for no key update', [target.id],
        () => auth.updateAccount(actor, target.id, form({ active: 'on', role: 'organizer' })),
        () => withSession(token, auth.signOut))

      assert.match(result.message, /session ended/)
      assert.deepEqual((await query('select roles from accounts where id=$1', [target.id])).rows[0].roles, ['attendee'])
      assert.equal((await query(`select 1 from audit_entries where actor_id=$1 and target=$2
        and action='account_update' and outcome='denied'`, [actor.id, String(target.id)])).rowCount, 1)
    })

    await t.test('a resolved actor cannot write after either session deadline expires', async () => {
      const attendee = await account(19)
      for (const deadline of ['expires_at', 'absolute_expires_at']) {
        const { actor } = await session(attendee.id)
        await query(`update sessions set ${deadline}=now()-interval '1 second' where token_hash=$1`, [actor.sessionHash])
        await assert.rejects(events.register(actor, eventId), /session ended/)
      }
      assert.equal((await events.registration(attendee, eventId)).rowCount, 0)
    })

    await t.test('sign-in skips expired sessions locked by another transaction', async () => {
      const attendee = await account(20)
      const signinIp = ip + ':1'
      subjects.push(tokenHash(signinIp))
      await query("update sessions set expires_at=now()-interval '1 second' where token_hash=$1", [attendee.sessionHash])
      const blocker = await database().connect()
      try {
        await blocker.query('begin')
        await blocker.query('select 1 from sessions where token_hash=$1 for key share', [attendee.sessionHash])
        await runRequest(signinIp, () => auth.authenticate(credentials(administrator.email), false))
        assert.equal((await query('select 1 from sessions where token_hash=$1', [attendee.sessionHash])).rowCount, 1)
      } finally {
        await blocker.query('rollback')
        blocker.release()
      }
      await runRequest(signinIp, () => auth.authenticate(credentials(administrator.email), false))
      assert.equal((await query('select 1 from sessions where token_hash=$1', [attendee.sessionHash])).rowCount, 0)
    })

    await t.test('FR-14–15 cap concurrent submissions and order and filter the approval queue', async () => {
      const ownerA = await account(6, ['attendee', 'organizer'])
      const ownerB = await account(7, ['attendee', 'organizer'])
      const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
      const venue = (await events.venues()).rows.find(row => row.name === 'Iribe Center')
      const details = {
        description: 'Approval queue verification', category: 'Academic', host: 'Sample organization',
        venue: String(venue.id), capacity: '1', starts: date + 'T17:00', ends: date + 'T18:00', deadline: date + 'T16:00'
      }

      async function draft(owner, sequence) {
        const id = await events.saveDraft(owner, null, form({ ...details, title: `Queue ${marker} ${sequence}` }))
        queueEventIds.push(id)
        return id
      }
      const drafts = await Promise.all(Array.from({ length: 6 }, (_, index) => draft(ownerA, index)))
      const submissions = await Promise.allSettled(drafts.map(id => events.changeEvent(ownerA, id, 'submit', form({}))))
      const admitted = drafts.filter((id, index) => submissions[index].status === 'fulfilled')
      const rejected = submissions.filter(item => item.status === 'rejected')
      assert.equal(admitted.length, 5)
      assert.equal(rejected.length, 1)
      assert.match(rejected[0].reason.message, /five events awaiting approval/)
      const rejectedId = drafts[submissions.findIndex(item => item.status === 'rejected')]
      assert.equal((await events.getEvent(rejectedId, ownerA)).status, 'draft')

      const other = await draft(ownerB, 'other')
      await events.changeEvent(ownerB, other, 'submit', form({}))
      const expected = [admitted[2], admitted[1], other, admitted[4], admitted[0], admitted[3]]
      await query(`update events e
        set submitted_at=now() - interval '1 hour' + item.position * interval '1 second'
        from unnest($1::int[]) with ordinality item(id,position) where e.id=item.id`, [expected])
      const filtered = (await events.approvalQueue(administrator, ownerA.id)).rows.map(event => event.id)
      assert.deepEqual(filtered, expected.filter(id => id !== other))
      const queue = (await events.approvalQueue(administrator, null)).rows.map(event => event.id)
      assert.deepEqual(queue.filter(id => queueEventIds.includes(id)), expected)
    })

    await t.test('event writes recheck persisted permissions and retain denial audit records', async t => {
      const owner = await account(10, ['attendee', 'organizer'])
      const reviewer = await account(11, ['attendee', 'administrator'])
      const attendee = await account(12)
      const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
      const venue = (await events.venues()).rows.find(row => row.name === 'Iribe Center')
      const details = {
        title: 'Permission verification', description: 'Event permissions', category: 'Academic',
        host: 'Sample organization', venue: String(venue.id), capacity: '1',
        starts: date + 'T17:00', ends: date + 'T18:00', deadline: date + 'T16:00'
      }
      const id = await events.saveDraft(owner, null, form(details))
      queueEventIds.push(id)
      t.after(async () => {
        await query('delete from notifications where event_id=$1', [id])
        await query('delete from registrations where event_id=$1', [id])
      })

      await auth.updateAccount(administrator, owner.id, form({ active: 'on' }))
      await assert.rejects(events.saveDraft(owner, id, form({ ...details, title: 'Changed title' })), /permission/)
      assert.equal((await query('select title from events where id=$1', [id])).rows[0].title, details.title)
      await auth.updateAccount(administrator, owner.id, form({ active: 'on', role: 'organizer' }))
      await events.changeEvent(owner, id, 'submit', form({}))

      await auth.updateAccount(administrator, reviewer.id, form({ active: 'on' }))
      await assert.rejects(events.changeEvent(reviewer, id, 'approve', form({})), /permission/)
      assert.equal((await query('select status from events where id=$1', [id])).rows[0].status, 'pending')
      await auth.updateAccount(administrator, reviewer.id, form({ active: 'on', role: 'administrator' }))
      await events.changeEvent(reviewer, id, 'approve', form({}))

      await auth.updateAccount(administrator, attendee.id, form({}))
      await assert.rejects(events.register(attendee, id), /permission/)
      assert.equal((await events.registration(attendee, id)).rowCount, 0)

      const { rows } = await query(`select actor_id,action from audit_entries where target=$1 and outcome='denied'
        and action in ('draft_save', 'approve', 'registration_create') order by id`, [String(id)])
      assert.deepEqual(rows, [
        { actor_id: owner.id, action: 'draft_save' },
        { actor_id: reviewer.id, action: 'approve' },
        { actor_id: attendee.id, action: 'registration_create' }
      ])
    })

    await t.test('FR-8 applies every optional role combination in the existing session', async () => {
      const target = await account(21)
      const { token } = await session(target.id)
      const roles = ['organizer', 'administrator', 'system_admin']
      for (let mask = 0; mask < 2 ** roles.length; mask++) {
        const requestedRoles = roles.filter((_, index) => mask & (1 << index))
        const changes = form({ active: 'on' })
        for (const role of requestedRoles) changes.append('role', role)
        await auth.updateAccount(administrator, target.id, changes)
        assert.deepEqual((await withSession(token, auth.currentUser)).roles, ['attendee', ...requestedRoles])
      }
      await auth.updateAccount(administrator, target.id, form({ active: 'on' }))
      assert.deepEqual((await withSession(token, auth.currentUser)).roles, ['attendee'])
    })

    await t.test('FR-9 denies writes without the required role or event ownership and audits each denial', async () => {
      const owner = await account(22, ['attendee', 'organizer'])
      const otherOrganizer = await account(23, ['attendee', 'organizer'])
      const reviewer = await account(24, ['attendee', 'administrator'])
      const attendee = await account(25)
      const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
      const venue = (await events.venues()).rows.find(row => row.name === 'Iribe Center')
      const details = {
        title: 'Protected write verification', description: 'Access tests', category: 'Academic',
        host: 'Sample organization', venue: String(venue.id), capacity: '1',
        starts: date + 'T17:00', ends: date + 'T18:00', deadline: date + 'T16:00'
      }
      const draft = await events.saveDraft(owner, null, form(details))
      queueEventIds.push(draft)
      const pending = await events.saveDraft(owner, null, form(details))
      queueEventIds.push(pending)
      await events.changeEvent(owner, pending, 'submit', form({}))

      const cases = [
        { actor: attendee, action: 'draft_save', target: null, attempt: () => events.saveDraft(attendee, null, form(details)) },
        { actor: otherOrganizer, action: 'draft_save', target: draft, attempt: () => events.saveDraft(otherOrganizer, draft, form(details)) },
        { actor: otherOrganizer, action: 'submit', target: draft, attempt: () => events.changeEvent(otherOrganizer, draft, 'submit', form({})) },
        { actor: owner, action: 'approve', target: pending, attempt: () => events.changeEvent(owner, pending, 'approve', form({})) },
        { actor: attendee, action: 'capacity', target: eventId, attempt: () => events.updateCapacity(attendee, eventId, form({ capacity: '2' })) },
        { actor: null, action: 'registration_create', target: eventId, attempt: () => events.register(null, eventId) },
        { actor: null, action: 'registration_cancel', target: eventId, attempt: () => events.cancelRegistration(null, eventId) },
        { actor: reviewer, action: 'account_update', target: attendee.id, attempt: () => auth.updateAccount(reviewer, attendee.id, form({ active: 'on', role: 'organizer' })) }
      ]

      for (const { actor, action, target, attempt } of cases) {
        await assert.rejects(attempt, /sign in first|do not have permission|do not own this event/, action)
        const audit = await query(`select 1 from audit_entries
          where actor_id is not distinct from $1 and action=$2 and target is not distinct from $3
            and outcome='denied' and source_ip=$4`, [actor?.id ?? null, action, target === null ? null : String(target), ip])
        assert.ok(audit.rowCount > 0, action + ' was audited')
      }

      assert.equal((await events.getEvent(draft, owner)).status, 'draft')
      assert.equal((await events.getEvent(pending, reviewer)).status, 'pending')
      assert.equal((await events.getEvent(eventId, null)).capacity, 1)
      assert.deepEqual((await query('select roles from accounts where id=$1', [attendee.id])).rows[0].roles, ['attendee'])
    })

    await t.test('FR-26–35, FR-37, FR-39–40 and FR-45 keep seats and inbox records consistent', async () => {
      assert.ok(eventId)
      const users = await Promise.all([3, 4, 5].map(number => account(number)))
      await Promise.all(users.map(user => events.register(user, eventId)))
      const { rows: roster } = await events.roster(eventId, administrator)
      assert.equal(await events.roster(eventId, users[0]), null)
      const { rows: denials } = await query("select actor_id from audit_entries where action='roster_view' and outcome='denied' and target=$1", [String(eventId)])
      assert.ok(denials.some(row => row.actor_id === users[0].id))
      assert.equal(roster.filter(row => row.status === 'confirmed').length, 1)
      assert.equal(roster.filter(row => row.status === 'waitlisted').length, 2)
      const confirmed = users.find(user => user.email === roster.find(row => row.status === 'confirmed').email)
      const waiting = []
      for (const user of users) {
        const { rows: [entry] } = await events.registration(user, eventId)
        assert.ok(entry.created_at instanceof Date)
        if (entry.position) waiting[entry.position - 1] = user
      }
      await assert.rejects(events.register(confirmed, eventId), /already have/)
      await assert.rejects(events.register(waiting[0], eventId), /already have/)
      await assert.rejects(events.updateCapacity(organizer, eventId, form({ capacity: '999' })), /fit the venue/)
      const { rows: [original] } = await events.registration(confirmed, eventId)
      await events.cancelRegistration(confirmed, original.id)
      const { rows: [cancelled] } = await query('select status,cancelled_at from registrations where id=$1', [original.id])
      assert.equal(cancelled.status, 'cancelled')
      assert.ok(cancelled.cancelled_at instanceof Date)
      assert.equal((await events.registration(confirmed, eventId)).rowCount, 0)
      assert.ok(!(await events.roster(eventId, administrator)).rows.some(row => row.email === confirmed.email))
      assert.equal((await events.registrations(waiting[0])).rows[0].status, 'confirmed')
      assert.equal((await events.registration(waiting[1], eventId)).rows[0].position, 1)
      await events.updateCapacity(organizer, eventId, form({ capacity: '2' }))
      assert.equal((await events.registration(waiting[1], eventId)).rows[0].status, 'confirmed')
      await assert.rejects(events.updateCapacity(organizer, eventId, form({ capacity: '1' })), /cover all confirmed/)
      assert.equal((await events.getEvent(eventId, organizer)).capacity, 2)
      const { rows } = await query(`select kind, account_id, message, created_at, delivered_at
        from notifications where event_id=$1 order by id`, [eventId])
      const title = 'Test event ' + marker
      assert.deepEqual(rows.map(row => [row.kind, row.account_id, row.message]), [
        ['confirmed', confirmed.id, `You’re registered for ${title}.`],
        ...waiting.map((user, index) => ['waitlisted', user.id, `You joined the waitlist for ${title} at position ${index + 1}.`]),
        ['promoted', waiting[0].id, `A seat opened for ${title}. You’re confirmed.`],
        ['cancelled', confirmed.id, `Your registration for ${title} was cancelled.`],
        ['promoted', waiting[1].id, `A seat opened for ${title}. You’re confirmed.`]
      ])
      for (const row of rows) {
        assert.ok(row.created_at instanceof Date)
        assert.ok(row.delivered_at instanceof Date)
        const delayMs = row.delivered_at - row.created_at
        assert.ok(delayMs >= 0 && delayMs < 5 * 60 * 1000)
      }
      const messages = (await inbox(confirmed)).rows.filter(row => row.event_id === eventId)
      assert.deepEqual(messages.map(row => row.message), [
        `Your registration for ${title} was cancelled.`,
        `You’re registered for ${title}.`
      ])
      await events.register(confirmed, eventId)
      const { rows: [rejoined] } = await events.registration(confirmed, eventId)
      assert.equal(rejoined.status, 'waitlisted')
      assert.equal(rejoined.cancelled_at, null)
      assert.ok(rejoined.id > original.id)
      await events.cancelRegistration(confirmed, rejoined.id)
      const { rows: [cancelledAgain] } = await query('select status,cancelled_at from registrations where id=$1', [rejoined.id])
      assert.equal(cancelledAgain.status, 'cancelled')
      assert.ok(cancelledAgain.cancelled_at instanceof Date)
      assert.equal((await events.registration(confirmed, eventId)).rowCount, 0)
      assert.equal((await events.getEvent(eventId, organizer)).confirmed, 2)
      await query("update events set deadline=now()-interval '1 second' where id=$1", [eventId])
      await assert.rejects(events.register(confirmed, eventId), /closed/)
      await query("update events set starts_at=now()-interval '1 second' where id=$1", [eventId])
      const { rows: [promoted] } = await events.registration(waiting[0], eventId)
      await assert.rejects(events.cancelRegistration(waiting[0], promoted.id), /already started/)
      assert.equal((await events.registration(waiting[0], eventId)).rows[0].status, 'confirmed')
    })

    await t.test('private event and roster reads use current account permissions', async () => {
      const reviewer = await account(13, ['attendee', 'administrator'])
      const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
      const venue = (await events.venues()).rows.find(row => row.name === 'Iribe Center')
      const draft = await events.saveDraft(organizer, null, form({
        title: 'Private event', description: 'Read permissions', category: 'Academic',
        host: 'Sample organization', venue: String(venue.id), capacity: '1',
        starts: date + 'T17:00', ends: date + 'T18:00', deadline: date + 'T16:00'
      }))
      queueEventIds.push(draft)
      assert.equal((await events.getEvent(draft, organizer)).status, 'draft')
      assert.deepEqual((await events.roster(draft, organizer)).rows, [])
      await events.changeEvent(organizer, draft, 'submit', form({}))
      assert.equal((await events.getEvent(draft, reviewer)).status, 'pending')
      assert.equal((await events.roster(eventId, reviewer)).rows.length, 2)

      await auth.updateAccount(administrator, reviewer.id, form({ active: 'on' }))
      assert.equal(await events.getEvent(draft, reviewer), null)
      assert.equal(await events.roster(eventId, reviewer), null)
      assert.equal((await events.rosterEvents(reviewer, 1)).rowCount, 0)
      assert.equal((await events.getEvent(eventId, reviewer)).status, 'published')

      await auth.updateAccount(administrator, organizer.id, form({ role: 'organizer' }))
      assert.equal(await events.getEvent(draft, organizer), null)
      assert.equal(await events.roster(draft, organizer), null)
    })

    await t.test('privileged workspaces stop returning records after access is revoked', async () => {
      const reviewer = await account(14, ['attendee', 'administrator'])
      const coordinator = await account(15, ['attendee', 'system_admin'])
      await auth.updateAccount(administrator, organizer.id, form({ active: 'on', role: 'organizer' }))
      assert.ok((await events.organizerEvents(organizer)).rows.some(row => row.id === eventId))
      assert.ok((await events.approvalQueue(reviewer, organizer.id)).rows.some(row => row.owner_id === organizer.id))
      assert.ok((await events.approvalOwners(reviewer)).rows.some(row => row.id === organizer.id))
      assert.ok((await auth.accountDirectory(coordinator)).rows.some(row => row.id === reviewer.id))

      await auth.updateAccount(administrator, reviewer.id, form({ active: 'on' }))
      await auth.updateAccount(administrator, coordinator.id, form({ active: 'on' }))
      await auth.updateAccount(administrator, organizer.id, form({ active: 'on' }))
      assert.equal((await events.approvalQueue(reviewer, null)).rowCount, 0)
      assert.equal((await events.approvalOwners(reviewer)).rowCount, 0)
      assert.equal((await auth.accountDirectory(coordinator)).rowCount, 0)
      assert.equal((await events.organizerEvents(organizer)).rowCount, 0)
    })
  })
})
