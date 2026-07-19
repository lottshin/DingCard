/** Integration-only ports. Keep these away from the user's live preview/API. */
export const BACKEND_PORT = 5310
export const FRONTEND_PORT = 5273
export const API_BASE = `http://localhost:${BACKEND_PORT}`
export const FRONTEND_ORIGIN = `http://localhost:${FRONTEND_PORT}`
