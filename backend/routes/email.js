const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { parseEmailInput } = require('../services/parserservice');
const { sendEmail } = require('../services/emailservice');
const { speechToText } = require('../services/speechService');
const { processTranscript, validateParsed } = require('../services/transcriptCleaner');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

// ─── Multer — temp disk storage ───────────────────────────────────────────────
// Files land in the OS temp dir; we delete them in a finally block after use.
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const uploadDir = path.join(os.tmpdir(), 'email-agent-audio');
      fs.mkdirSync(uploadDir, { recursive: true });
      cb(null, uploadDir);
    },
    filename: (_req, _file, cb) => {
      const unique = `audio_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`;
      cb(null, unique);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (_req, file, cb) => {
    // Accept WAV and generic binary/octet-stream uploads from browsers
    const allowed = ['audio/wav', 'audio/wave', 'audio/x-wav', 'application/octet-stream'];
    if (allowed.includes(file.mimetype) || file.originalname.endsWith('.wav')) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported audio format: ${file.mimetype}`));
    }
  }
});

function isValidEmail(email) {
  if (!email) return true; // Allow empty (CC/BCC can be empty)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const emails = email.split(',').map(e => e.trim());
  return emails.every(e => e === '' || emailRegex.test(e));
}

// ─── POST /api/parse-email ────────────────────────────────────────────────────
// Parse natural-language input into structured email fields.
// Does NOT require auth — parsing is stateless.
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

    res.json({ ...parsed, warnings });
  } catch (error) {
    console.error('Error parsing email:', error);
    res.status(500).json({ error: 'Failed to parse email' });
  }
});

// ─── POST /api/speech-to-text ─────────────────────────────────────────────────
// Full pipeline:
//   WAV upload → Google STT → cleanTranscript → fixEmail
//   → confidence check → Gemini repair (if noisy) → parseEmailInput → validate
router.post('/speech-to-text', upload.single('audio'), async (req, res) => {
  const tempFilePath = req.file?.path;

  try {
    // ── 1. Validate upload ──────────────────────────────────────────────────
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No audio file received. Please send a WAV file in the "audio" field.'
      });
    }

    console.log(`[STT] Received audio: ${req.file.originalname} (${req.file.size} bytes)`);

    // ── 2. Google Speech-to-Text ─────────────────────────────────────────────
    const rawTranscript = await speechToText(tempFilePath);

    if (!rawTranscript || rawTranscript.trim().length === 0) {
      return res.status(422).json({
        success: false,
        error: 'No speech detected in the audio. Please speak clearly and try again.'
      });
    }

    console.log(`[STT] Raw transcript: "${rawTranscript}"`);

    // ── 3. Post-processing pipeline ──────────────────────────────────────────
    //   cleanTranscript → fixEmail → (Gemini repair if low-confidence)
    const { cleaned: cleanedTranscript, wasRepaired } = await processTranscript(rawTranscript);

    console.log(`[STT] Cleaned transcript (repaired=${wasRepaired}): "${cleanedTranscript}"`);

    // ── 4. Parse through existing Gemini / regex pipeline ───────────────────
    const parsed = await parseEmailInput(cleanedTranscript);

    // ── 5. Validate result ───────────────────────────────────────────────────
    const warnings = validateParsed(parsed);

    // ── 6. Return combined result ────────────────────────────────────────────
    return res.json({
      success: true,
      rawTranscript,           // original STT output (useful for debugging)
      transcript: cleanedTranscript,  // what the UI should display
      wasRepaired,             // true = Gemini had to fix the transcript
      parsed: { ...parsed, warnings }
    });

  } catch (error) {
    console.error('[STT] Error:', error.message || error);

    const isApiError = error.code && error.details;
    return res.status(500).json({
      success: false,
      error: isApiError
        ? `Google STT API error: ${error.details}`
        : (error.message || 'Failed to process audio. Please try again.')
    });

  } finally {
    // ── Always clean up temp file ─────────────────────────────────────────
    if (tempFilePath) {
      fs.unlink(tempFilePath, err => {
        if (err) console.warn('[STT] Failed to delete temp file:', tempFilePath);
      });
    }
  }
});

// ─── POST /api/send-email ─────────────────────────────────────────────────────
// Send an email using the logged-in user's Gmail account.
// requireAuth ensures req.userEmail is set.
router.post('/send-email', requireAuth, async (req, res) => {
  const { recipient, subject, body, cc, bcc } = req.body;
  const userEmail = req.userEmail; // Set by requireAuth middleware

  if (!recipient) {
    return res.status(400).json({ error: 'Recipient is required' });
  }

  if (!isValidEmail(recipient) || !isValidEmail(cc) || !isValidEmail(bcc)) {
    return res.status(400).json({ error: 'One or more email addresses are invalid' });
  }

  try {
    const result = await sendEmail(userEmail, recipient, subject || '', body || '', cc, bcc);

    if (result.needsAuth) {
      return res.status(401).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: 'Failed to send email. Please try again.' });
  }
});

module.exports = router;