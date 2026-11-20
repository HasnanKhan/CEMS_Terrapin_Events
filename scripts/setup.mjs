import { readFile } from 'node:fs/promises'
import { database, transaction } from '../lib/db.js'
import { hashPassword, validEmail, validPassword } from '../lib/password.js'

// Neon provides a direct connection for schema changes and a pooled one for app traffic.
if (process.env.DATABASE_URL_UNPOOLED) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED
}

const email = process.env.BOOTSTRAP_EMAIL?.trim().toLowerCase()
const password = process.env.BOOTSTRAP_PASSWORD || ''
if ((email || password) && (!validEmail(email || '') || !validPassword(password))) {
  throw new Error('Set a fictional @umd.edu email and a password with 12–128 characters, a letter, and a number.')
}
if (process.env.SEED_DEMO === 'true' && !email) throw new Error('Set a bootstrap account before seeding events.')

try {
  await transaction(async db => {
    await db.query(await readFile(new URL('../lib/schema.sql', import.meta.url), 'utf8'))
    if (!email) return
    const { rows: [account] } = await db.query(
      "insert into accounts(name,email,password_hash,roles) values ('Demo Coordinator',$1,$2,array['attendee','organizer','administrator','system_admin']) on conflict(email) do nothing returning id",
      [email, await hashPassword(password)]
    )
    if (!account) console.log('Bootstrap email already exists. Existing credentials and roles were preserved.')
    if (!account || process.env.SEED_DEMO !== 'true') return
    const samples = [
      ['Build Night at Iribe', 'Technology', 'Terrapin Makers', 'Iribe Center', 2, 2,
        'Bring a project, find a teammate, or start something new. Drop in for a hands-on evening with student builders from across campus.'],
      ['Printmaking Open Studio', 'Arts & Culture', 'Student Arts Collective', 'Stamp Student Union', 24, 4,
        'Make your own block print in a guided open studio. Materials are supplied and all experience levels are welcome.'],
      ['Study Break Social', 'Community', 'Campus Life', 'Hornbake Library', 40, 6,
        'Take a break between classes and meet fellow Terps over board games and light refreshments.'],
      ['Research Poster Workshop', 'Academic', 'Student Research Forum', 'McKeldin Library', 30, 8,
        'Get practical feedback on the layout and story of your research poster before your next presentation.']
    ]
    for (const [title, category, host, venue, capacity, days, description] of samples) {
      await db.query(`insert into events(owner_id,venue_id,title,category,host,capacity,description,starts_at,ends_at,deadline,status)
        select $1,id,$2,$3,$4,$5,$6,slot,slot + interval '2 hours',slot - interval '1 hour','published'
        from venues cross join lateral (select ((now() at time zone 'America/New_York')::date + $8::integer + time '17:00') at time zone 'America/New_York' as slot) schedule
        where name=$7`, [account.id, title, category, host, capacity, description, venue, days])
    }
  })
  console.log('Database setup complete.')
} finally {
  await database().end()
}
