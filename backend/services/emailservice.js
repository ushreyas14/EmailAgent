const { google } = require('googleapis');
const { oauth2Client } = require('../config/oauth');

function createEmailMessage(to, subject, body, cc, bcc) {
  const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
  
  const messageParts = [
    `To: ${to}`,
    `Subject: ${utf8Subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
  ];

  if (cc) messageParts.push(`Cc: ${cc}`);
  if (bcc) messageParts.push(`Bcc: ${bcc}`);

  messageParts.push('');
  // Replace newlines with <br> for HTML email body
  messageParts.push(body.replace(/\n/g, '<br>'));

  const message = messageParts.join('\n');
  
  // base64url encode
  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sendEmail(recipient, subject, body, cc, bcc) {
  try {
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const rawMessage = createEmailMessage(recipient, subject, body, cc, bcc);

    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: rawMessage
      }
    });

    return {
      success: true,
      messageId: res.data.id,
      recipient,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    if (error.message.includes('invalid_grant') || error.code === 401) {
      return { needsAuth: true, error: 'Authentication expired or invalid.' };
    }
    throw error;
  }
}

async function getUserEmail() {
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const res = await oauth2.userinfo.get();
    return res.data.email;
  } catch (error) {
    if (error.message.includes('invalid_grant') || error.code === 401) {
      return null;
    }
    throw error;
  }
}

module.exports = {
  createEmailMessage,
  sendEmail,
  getUserEmail
};