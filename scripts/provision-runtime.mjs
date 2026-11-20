import { randomBytes } from 'node:crypto'
import { open, readFile, unlink } from 'node:fs/promises'
import { database, transaction } from '../lib/db.js'

if (!process.env.DATABASE_URL || !process.env.DATABASE_URL_UNPOOLED) {
  throw new Error('Set the application endpoint and the direct schema-owner connection before provisioning.')
}
const runtime = new URL(process.env.DATABASE_URL)
const owner = new URL(process.env.DATABASE_URL_UNPOOLED)
if (runtime.hostname.replace('-pooler.', '.') !== owner.hostname ||
    runtime.port !== owner.port || runtime.pathname !== owner.pathname) {
  throw new Error('The runtime and owner connection strings must target the same database.')
}
process.env.DATABASE_URL = owner.href

const path = process.env.RUNTIME_ENV_FILE || '.env.runtime.local'
const file = await open(path, 'wx', 0o600)
const secret = randomBytes(32).toString('hex')
runtime.username = 'terrapin_runtime'
runtime.password = secret
let saved = false

try {
  await transaction(async db => {
    // The only interpolated value is generated locally and contains only hex digits.
    await db.query(`create role terrapin_runtime login noinherit password '${secret}'`)
    await db.query(await readFile(new URL('../lib/runtime-grants.sql', import.meta.url), 'utf8'))
    const { rows: [{ excessive }] } = await db.query(`select
      has_schema_privilege('terrapin_runtime','public','CREATE')
      or has_database_privilege('terrapin_runtime',current_database(),'CREATE')
      or has_any_column_privilege('terrapin_runtime','public.audit_entries','SELECT')
      or has_any_column_privilege('terrapin_runtime','public.audit_entries','UPDATE')
      or has_table_privilege('terrapin_runtime','public.audit_entries','DELETE,TRUNCATE') as excessive`)
    if (excessive) throw new Error('The role inherits excessive permissions. Review PUBLIC or default grants before provisioning.')
    await file.writeFile('DATABASE_URL=' + runtime.href + '\n')
    saved = true
  })
  console.log('Restricted runtime role created. Its connection string is in ' + path)
} catch (error) {
  console.error('Runtime role provisioning failed:', error.code ?? error.message)
  if (saved) console.error('Verify the database role before using the saved connection string.')
  process.exitCode = 1
} finally {
  await file.close()
  if (!saved) await unlink(path)
  await database().end()
}
