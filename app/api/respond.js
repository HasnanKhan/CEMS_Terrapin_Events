import { optionalId, Problem } from '../../lib/input.js'
import { SpringSessionUnavailable } from '../../lib/spring-session.js'

export function apiJson(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export function apiError(request, status, code, message) {
  return apiJson({
    timestamp: new Date().toISOString(),
    status,
    code,
    message,
    path: new URL(request.url).pathname,
    fieldErrors: {}
  }, status)
}

export function routeId(value) {
  const id = typeof value === 'string' && /^[1-9]\d{0,9}$/.test(value) ? optionalId(value) : null
  if (id === null) throw new Problem('Enter a valid positive whole number.')
  return id
}

export function apiFailure(request, error) {
  if (error instanceof Problem) return apiError(request, error.status, error.code, error.message)

  const code = typeof error?.code === 'string' ? error.code : ''
  // node-postgres can omit a SQLSTATE when a connection closes or the pool times out.
  const poolFailure = ['timeout exceeded when trying to connect', 'Connection terminated due to connection timeout',
    'Connection terminated', 'Connection terminated unexpectedly'].includes(error?.message)
  if (error instanceof SpringSessionUnavailable || /^08[A-Z0-9]{3}$/.test(code) ||
      ['55P03', '57014', '57P01', '57P02', '57P03', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(code) || poolFailure) {
    return apiError(request, 503, 'SERVICE_UNAVAILABLE', 'Could not be confirmed, please try again.')
  }

  console.error('API operation failed', code || error?.name)
  return apiError(request, 500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.')
}
