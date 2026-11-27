import { currentUser } from '../../../../../lib/auth.js'
import { roster } from '../../../../../lib/registration/service.js'
import { apiError, apiFailure, apiJson, routeId } from '../../../respond.js'

export const dynamic = 'force-dynamic'

export async function GET(request, { params }) {
  try {
    const id = routeId((await params).id)
    const user = await currentUser()
    const result = await roster(id, user)
    if (result) return apiJson(result)
    return user
      ? apiError(request, 403, 'ACCESS_DENIED', 'You do not have permission for this action.')
      : apiError(request, 401, 'AUTHENTICATION_REQUIRED', 'Please sign in first.')
  } catch (error) {
    return apiFailure(request, error)
  }
}
