const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';


/** Default fetch options — always include cookies for session support */
const defaultOptions = {
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' }
};

/**
 * Parse natural-language text into structured email fields.
 * Auth not required — stateless AI parsing.
 */
export async function parseEmail(input) {
  const response = await fetch(`${API_URL}/api/parse-email`, {
    ...defaultOptions,
    method: 'POST',
    body: JSON.stringify({ input })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Failed to parse email');
  return data;
}

/**
 * Send an email using the logged-in user's Gmail account.
 * Requires an active session (user must be logged in).
 */
export async function sendEmail(recipient, subject, body, cc, bcc) {
  const response = await fetch(`${API_URL}/api/send-email`, {
    ...defaultOptions,
    method: 'POST',
    body: JSON.stringify({ recipient, subject, body, cc, bcc })
  });

  const data = await response.json();

  if (!response.ok) {
    if (data.needsAuth) throw { needsAuth: true, message: data.error };
    throw new Error(data.error || 'Failed to send email');
  }

  return data;
}

/**
 * Check the current session's auth status.
 * Returns { authenticated: boolean, email?: string }
 */
export async function getAuthStatus() {
  const response = await fetch(`${API_URL}/auth/status`, {
    ...defaultOptions,
    method: 'GET'
  });
  if (!response.ok) return { authenticated: false };
  return response.json();
}

/**
 * Log out the current user (destroys the server-side session).
 */
export async function logout() {
  const response = await fetch(`${API_URL}/auth/logout`, {
    ...defaultOptions,
    method: 'POST'
  });
  if (!response.ok) throw new Error('Logout failed');
  return response.json();
}

/**
 * Send a WAV audio Blob to the backend for Google Cloud Speech-to-Text
 * transcription and auto-parsing.
 *
 * @param {FormData} formData - Must contain an "audio" field with a WAV Blob.
 * @returns {Promise<{ success: boolean, transcript: string, parsed: object }>}
 */
export async function transcribeAudio(formData) {
  // Do NOT set Content-Type — the browser sets multipart/form-data + boundary
  const response = await fetch(`${API_URL}/api/speech-to-text`, {
    method: 'POST',
    credentials: 'include',
    body: formData
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to transcribe audio');
  }

  return data;
}
