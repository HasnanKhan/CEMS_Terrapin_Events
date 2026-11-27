'use client'

import { useActionState, useEffect, useRef } from 'react'
import { submit } from './actions.js'

export function ActionNotice({ message }) {
  const noticeRef = useRef(null)
  useEffect(() => {
    if (message) noticeRef.current?.focus()
  }, [message])

  return <p className="notice" role="status" tabIndex={-1} ref={noticeRef}>{message}</p>
}

export default function Form({ action, target = null, destination = '/', children, label, accessibleLabel, style = 'primary', compact = false }) {
  const [state, dispatch, pending] = useActionState(submit.bind(null, action, target, destination), {})
  const errorRef = useRef(null)
  useEffect(() => {
    if (state?.error) errorRef.current?.focus()
  }, [state])

  function handleReset(event) {
    if (action === 'save') event.preventDefault()
    if (action === 'login' || action === 'signup') {
      event.preventDefault()
      event.currentTarget.elements.namedItem('password').value = ''
    }
  }

  return <form action={dispatch} data-action={action} onReset={handleReset} className={compact ? 'action compact' : 'action'}>
    {children}
    {state?.error && <p className="error" role="alert" tabIndex={-1} ref={errorRef}>{state.error}</p>}
    <button className={'button ' + style} disabled={pending} aria-label={pending ? undefined : accessibleLabel}>{pending ? 'Working…' : label}</button>
  </form>
}
