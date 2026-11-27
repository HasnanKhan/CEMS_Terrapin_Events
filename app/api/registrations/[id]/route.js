import { auditAccessDenied, currentUser } from '../../../../lib/auth.js'
import { cancelRegistration } from '../../../../lib/registration/service.js'
import { apiError, apiFailure, apiJson, routeId } from '../../respond.js'

export const dynamic = 'force-dynamic'

export async function DELETE(request, { params }) {
  try {
    const id = routeId((await params).id)
    if (request.headers.get('origin') !== new URL(request.url).origin) {
      await auditAccessDenied(null, 'registration_cancel', id)
      return apiError(request, 403, 'ACCESS_DENIED', 'Use a same-origin request to cancel.')
    }

    const user = await currentUser({ forWrite: true })
    const { id: registrationId, status } = await cancelRegistration(user, id)
    return apiJson({ id: registrationId, status })
  } catch (error) {
    return apiFailure(request, error)
  }
}
