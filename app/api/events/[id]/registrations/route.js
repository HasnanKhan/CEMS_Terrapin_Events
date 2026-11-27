import { auditAccessDenied, currentUser } from '../../../../../lib/auth.js'
import { register } from '../../../../../lib/registration/service.js'
import { apiError, apiFailure, apiJson, routeId } from '../../../respond.js'

export const dynamic = 'force-dynamic'

export async function POST(request, { params }) {
  try {
    const id = routeId((await params).id)
    if (request.headers.get('origin') !== new URL(request.url).origin) {
      await auditAccessDenied(null, 'registration_create', id)
      return apiError(request, 403, 'ACCESS_DENIED', 'Use a same-origin request to register.')
    }

    const user = await currentUser({ forWrite: true })
    const { id: registrationId, status, position } = await register(user, id)
    return apiJson({ id: registrationId, status, ...(position === undefined ? {} : { position }) }, 201)
  } catch (error) {
    return apiFailure(request, error)
  }
}
