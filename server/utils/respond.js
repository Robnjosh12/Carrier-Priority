/**
 * Standard response envelope used by every route.
 * Success: { success: true, data: {...} }
 * Error:   { success: false, error: "message", code: 400 }
 */
export function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}

export function fail(res, error, code = 400) {
  return res.status(code).json({ success: false, error, code });
}

/**
 * Wraps an async route handler so thrown errors funnel into next(err)
 * instead of crashing the process or hanging the request.
 */
export function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
