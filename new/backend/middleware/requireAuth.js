/**
 * requireAuth middleware
 * Validates that the request has an active session with a logged-in user.
 * Attaches req.userEmail as a convenience for downstream handlers.
 */
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userEmail) {
    return res.status(401).json({
      needsAuth: true,
      error: 'Not authenticated. Please log in with Google first.'
    });
  }
  req.userEmail = req.session.userEmail;
  next();
}

module.exports = requireAuth;
