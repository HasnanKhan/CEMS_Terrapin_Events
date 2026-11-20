'use client'

import { useActionState } from 'react'
import { submit } from './actions.js'

export default function Form({ action, target = null, destination = '/', children, label, style = 'primary', compact = false }) {
  const [state, dispatch, pending] = useActionState(submit.bind(null, action, target, destination), {})
  return <form action={dispatch} onReset={action === "save" ? event => event.preventDefault() : undefined} className={compact ? 'action compact' : 'action'}>
    {children}
    {state?.error && <p className="error" role="alert">{state.error}</p>}
    <button className={'button ' + style} disabled={pending}>{pending ? 'Working…' : label}</button>
  </form>
}
