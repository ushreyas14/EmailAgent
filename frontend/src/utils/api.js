const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export async function parseEmail(input) {
  const response = await fetch(`${API_URL}/api/parse-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to parse email');
  }

  return data;
}

export async function sendEmail(recipient, subject, body, cc, bcc) {
  const response = await fetch(`${API_URL}/api/send-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ recipient, subject, body, cc, bcc }),
  });

  const data = await response.json();

  if (!response.ok) {
    if (data.needsAuth) {
      throw { needsAuth: true, message: data.error };
    }
    throw new Error(data.error || 'Failed to send email');
  }

  return data;
}
