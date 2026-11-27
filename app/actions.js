'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { authenticate, currentUser, signOut, updateAccount } from '../lib/auth.js'
import { changeEvent, saveDraft } from '../lib/event/service.js'
import { cancelRegistration, register, updateCapacity } from '../lib/registration/service.js'
import { formText, optionalId, Problem } from '../lib/input.js'
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
      const user = await currentUser({ forWrite: true })
      switch (action) {
        case 'save': {
          const id = await saveDraft(user, target, form)
          path = '/?event=' + id
          message = 'Draft saved.'
          break
        }
        case 'submit':
        case 'approve':
          message = await changeEvent(user, target, action)
          break
        case 'capacity':
          message = await updateCapacity(user, target, form)
          break
        case 'register':
          message = (await register(user, target)).message
          break
        case 'cancel': {
          const expectedStatus = formText(form, 'registrationStatus')
          if (expectedStatus !== 'confirmed' && expectedStatus !== 'waitlisted') {
            throw new Problem('Refresh the page and try again.')
          }
          message = (await cancelRegistration(user, target, expectedStatus)).message
          break
        }
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
