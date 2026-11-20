'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { authenticate, currentUser, signOut, updateAccount } from '../lib/auth.js'
import { changeEvent, changeRegistration, saveDraft } from '../lib/events.js'
import { Problem } from '../lib/input.js'

export async function submit(action, target, destination, previous, form) {
  let message
  let path = /^\/(?:\?view=(?:my|inbox|organize|queue|accounts)|\?event=\d+)?$/.test(destination) ? destination : '/'
  try {
    if (action === 'signup' || action === 'login') {
      message = await authenticate(form, action === 'signup')
      if (action === 'signup') {
        const eventReturn = new URLSearchParams(path.slice(2)).get('event')
        path = '/?' + new URLSearchParams({ view: 'login', ...(eventReturn ? { eventReturn } : {}) })
      }
    } else if (action === 'logout') {
      await signOut()
      path = '/'
    } else {
      const user = await currentUser()
      switch (action) {
        case 'save': {
          const id = await saveDraft(user, target, form)
          path = '/?event=' + id
          message = 'Draft saved.'
          break
        }
        case 'submit':
        case 'approve':
        case 'capacity':
          message = await changeEvent(user, target, action, form)
          break
        case 'register':
        case 'cancel':
          message = await changeRegistration(user, target, action === 'cancel')
          break
        case 'account':
          await updateAccount(user, target, form)
          message = 'Account updated.'
          break
        default:
          throw new Problem('Action unavailable.')
      }
    }
  } catch (error) {
    if (error instanceof Problem) return { error: error.message }
    console.error('Terrapin Events action failed', error.code ?? error.name)
    return { error: 'Something went wrong. Please try again.' }
  }
  revalidatePath('/')
  if (message) path += (path.includes('?') ? '&' : '?') + new URLSearchParams({ notice: message })
  redirect(path)
}
