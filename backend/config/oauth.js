require('dotenv').config();
const { google } = require('googleapis');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
];

/**
 * Create a fresh OAuth2 client (not pre-loaded with any user tokens).
 * Used for the initial auth URL generation and code exchange.
 */
function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/auth/google/callback'
  );
}

/**
 * Create a per-user OAuth2 client pre-loaded with that user's tokens.
 * Googleapis will automatically refresh the access_token using the refresh_token
 * when it expires — no manual refresh logic needed.
 *
 * @param {{ access_token: string, refresh_token: string, expiry_date?: number }} tokens
 * @returns {google.auth.OAuth2}
 */
function createUserOAuthClient(tokens) {
  const client = createOAuthClient();
  client.setCredentials(tokens);

  // Listen for automatic token refresh events and persist updated tokens
  // The caller (emailService) handles persistence via the 'tokens' event.
  return client;
}

/**
 * Generate the Google consent-screen URL.
 * access_type: 'offline' → get a refresh_token
 * prompt: 'consent'      → always show consent (ensures refresh_token is returned)
 */
function getAuthUrl() {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });
}

/**
 * Exchange an authorization code for tokens.
 * @param {string} code
 * @returns {Promise<object>} tokens
 */
async function getTokens(code) {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
}

/**
 * Get the authenticated user's email address using their access token.
 * @param {google.auth.OAuth2} authClient - a client with credentials already set
 * @returns {Promise<string>} email
 */
async function getUserEmail(authClient) {
  const oauth2 = google.oauth2({ version: 'v2', auth: authClient });
  const { data } = await oauth2.userinfo.get();
  return data.email;
}

module.exports = {
  createOAuthClient,
  createUserOAuthClient,
  getAuthUrl,
  getTokens,
  getUserEmail,
  SCOPES
};