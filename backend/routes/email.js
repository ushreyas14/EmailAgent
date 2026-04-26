const express = require('express');
const { parseEmailInput } = require('../services/parserService');
const { sendEmail } = require('../services/emailService');

const router = express.Router();

function isValidEmail(email) {
  if (!email) return true; // allow empty because CC/BCC might be empty
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  // If multiple emails separated by commas
  const emails = email.split(',').map(e => e.trim());
  return emails.every(e => e === '' || emailRegex.test(e));
}

router.post('/parse-email', async (req, res) => {
  const { input } = req.body;

  if (!input || input.trim().length === 0) {
    return res.status(400).json({ error: 'Input text is required' });
  }

  try {
    const parsed = await parseEmailInput(input);
    const warnings = [];

    if (!parsed.recipient) warnings.push('Could not detect a recipient email address.');
    if (!parsed.subject) warnings.push('Could not detect a subject.');
    if (!parsed.body || parsed.body.trim() === '') warnings.push('Could not detect the email body.');

    res.json({
      ...parsed,
      warnings
    });
  } catch (error) {
    console.error('Error parsing email:', error);
    res.status(500).json({ error: 'Failed to parse email' });
  }
});

router.post('/send-email', async (req, res) => {
  const { recipient, subject, body, cc, bcc } = req.body;

  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    return res.status(401).json({ needsAuth: true, error: 'Gmail not authenticated' });
  }

  if (!recipient) {
    return res.status(400).json({ error: 'Recipient is required' });
  }

  if (!isValidEmail(recipient) || !isValidEmail(cc) || !isValidEmail(bcc)) {
    return res.status(400).json({ error: 'One or more email addresses are invalid' });
  }

  try {
    const result = await sendEmail(recipient, subject || '', body || '', cc, bcc);
    
    if (result.needsAuth) {
      return res.status(401).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

module.exports = router;