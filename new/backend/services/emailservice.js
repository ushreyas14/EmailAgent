/**
 * emailService.js
 *
 * Per-user Gmail sending using the logged-in user's stored OAuth tokens.
 * Token auto-refresh is handled by the googleapis library; we listen for
 * the 'tokens' event to persist any newly issued access tokens.
 */

const { google } = require('googleapis');
const { createUserOAuthClient } = require('../config/oauth');
const { getTokens, saveTokens } = require('../config/tokenStore');

/**
 * Build a base64url-encoded RFC 2822 email message.
 */
function createEmailMessage(from, to, subject, body, cc, bcc) {
  const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;

  const messageParts = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${utf8Subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
  ];

  if (cc) messageParts.push(`Cc: ${cc}`);
  if (bcc) messageParts.push(`Bcc: ${bcc}`);

  messageParts.push('');
  messageParts.push(body.replace(/\n/g, '<br>'));

  const message = messageParts.join('\n');
  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Send an email using the stored credentials of the logged-in user.
 *
 * @param {string} userEmail    - The logged-in user's email (session identity)
 * @param {string} recipient    - To: address
 * @param {string} subject      - Email subject
 * @param {string} body         - Email body (plain text or HTML)
 * @param {string} [cc]         - CC addresses (comma-separated)
 * @param {string} [bcc]        - BCC addresses (comma-separated)
 */
async function sendEmail(userEmail, recipient, subject, body, cc, bcc) {
  // 1. Load the user's tokens from the store
  const tokens = getTokens(userEmail);
  if (!tokens) {
    return { needsAuth: true, error: 'No tokens found. Please log in again.' };
  }

  if (!tokens.refresh_token) {
    return { needsAuth: true, error: 'Refresh token missing. Please log in again.' };
  }

  // 2. Create a per-user OAuth2 client with their tokens
  const authClient = createUserOAuthClient(tokens);

  // 3. Listen for token refresh events and persist the new access_token
  authClient.on('tokens', (newTokens) => {
    const merged = { ...tokens, ...newTokens };
    // Preserve the original refresh_token if the new one is not in the event
    if (!newTokens.refresh_token) {
      merged.refresh_token = tokens.refresh_token;
    }
    saveTokens(userEmail, merged);
    console.log(`🔄 Tokens auto-refreshed for: ${userEmail}`);
  });

  try {
    // 4. Send via Gmail API
    const gmail = google.gmail({ version: 'v1', auth: authClient });
    const rawMessage = createEmailMessage(userEmail, recipient, subject, body, cc, bcc);

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: rawMessage }
    });

    return {
      success: true,
      messageId: response.data.id,
      from: userEmail,
      recipient,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error(`Gmail API error for ${userEmail}:`, error.message);

    const isAuthError =
      error.message?.includes('invalid_grant') ||
      error.code === 401 ||
      error.status === 401;

    if (isAuthError) {
      return { needsAuth: true, error: 'Authentication expired. Please log in again.' };
    }

    throw error;
  }
}

module.exports = { sendEmail, createEmailMessage };