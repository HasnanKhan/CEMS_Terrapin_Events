'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { authenticate, currentUser, signOut, updateAccount } from '../lib/auth.js'
import { changeEvent, changeRegistration, saveDraft } from '../lib/events.js'
import { optionalId, Problem } from '../lib/input.js'
import { feedbackRedirect } from './feedback.js'
import { actionDestination, authPath, browseFilters } from './navigation.js'

export async function submit(action, target, destination, previous, form) {
  let message
  let path = actionDestination(destination)
  try {
    if (action === 'signup' || action === 'login') {
      message = await authenticate(form, action === 'signup')
      if (action === 'signup') {
        const params = Object.fromEntries(new URLSearchParams(path.slice(2)))
        path = authPath('login', optionalId(params.event), browseFilters(params))
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
  redirect(message ? await feedbackRedirect(path, message) : path)
}
