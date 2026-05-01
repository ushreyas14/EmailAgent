const express = require('express');
const { getAuthUrl, getTokens, createUserOAuthClient, getUserEmail } = require('../config/oauth');
const { saveTokens, getTokens: loadTokens, deleteTokens } = require('../config/tokenStore');

const router = express.Router();

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// ─── GET /auth/google ─────────────────────────────────────────────────────────
// Redirect user to Google's consent screen.
router.get('/google', (req, res) => {
  const url = getAuthUrl();
  res.redirect(url);
});

// ─── GET /auth/google/callback ────────────────────────────────────────────────
// Google redirects here after user consents.
// Exchange code → tokens, fetch user email, persist tokens, set session.
router.get('/google/callback', async (req, res) => {
  const { code, error } = req.query;

  // User denied access
  if (error) {
    console.error('OAuth error from Google:', error);
    return res.redirect(`${FRONTEND_URL}/?auth=error&reason=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return res.redirect(`${FRONTEND_URL}/?auth=error&reason=no_code`);
  }

  try {
    // 1. Exchange authorization code for tokens
    const tokens = await getTokens(code);

    if (!tokens.refresh_token) {
      // This can happen if the user has previously authorized and we didn't use prompt:'consent'
      // Check if we already have a refresh token stored for this user
      // We need access_token to get email first
      const tempClient = createUserOAuthClient(tokens);
      const email = await getUserEmail(tempClient);
      const existingTokens = loadTokens(email);

      if (!existingTokens || !existingTokens.refresh_token) {
        console.error('No refresh token received and none stored. Re-directing to force consent.');
        return res.redirect(`${FRONTEND_URL}/?auth=error&reason=no_refresh_token`);
      }

      // Merge: keep the existing refresh_token, update access_token
      const mergedTokens = { ...existingTokens, ...tokens, refresh_token: existingTokens.refresh_token };
      saveTokens(email, mergedTokens);
      req.session.userEmail = email;
      console.log(`✅ Auth refreshed for existing user: ${email}`);
      return res.redirect(`${FRONTEND_URL}/?auth=success`);
    }

    // 2. Create a client with the new tokens to fetch the user's email
    const authClient = createUserOAuthClient(tokens);
    const email = await getUserEmail(authClient);

    // 3. Persist tokens to token store (keyed by email)
    saveTokens(email, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date || null,
      token_type: tokens.token_type || 'Bearer',
      scope: tokens.scope || ''
    });

    // 4. Set session
    req.session.userEmail = email;
    console.log(`✅ New user authenticated: ${email}`);

    // 5. Redirect back to frontend with success signal
    res.redirect(`${FRONTEND_URL}/?auth=success`);

  } catch (err) {
    console.error('OAuth callback error:', err);
    res.redirect(`${FRONTEND_URL}/?auth=error&reason=${encodeURIComponent(err.message || 'unknown')}`);
  }
});

// ─── GET /auth/status ─────────────────────────────────────────────────────────
// Returns current session state. Frontend polls this to check login.
router.get('/status', async (req, res) => {
  const email = req.session?.userEmail;

  if (!email) {
    return res.json({ authenticated: false });
  }

  const tokens = loadTokens(email);
  if (!tokens) {
    // Session exists but tokens were deleted — clear the session
    req.session.destroy(() => {});
    return res.json({ authenticated: false });
  }

  res.json({ authenticated: true, email });
});

// ─── POST /auth/logout ────────────────────────────────────────────────────────
// Destroy session. Tokens are kept in store (user can re-login without re-consenting).
router.post('/logout', (req, res) => {
  const email = req.session?.userEmail;
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destroy error:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.clearCookie('connect.sid');
    console.log(`👋 User logged out: ${email}`);
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

// ─── DELETE /auth/revoke ──────────────────────────────────────────────────────
// Fully revoke: destroy session + delete tokens (forces re-consent on next login).
router.delete('/revoke', (req, res) => {
  const email = req.session?.userEmail;
  if (email) {
    deleteTokens(email);
    console.log(`🗑️  Tokens revoked for: ${email}`);
  }
  req.session.destroy(() => {});
  res.clearCookie('connect.sid');
  res.json({ success: true, message: 'Access revoked and session cleared' });
});

module.exports = router;