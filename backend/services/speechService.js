'use strict';

const path = require('path');
const fs = require('fs');
const { SpeechClient } = require('@google-cloud/speech');

// ─── Client ──────────────────────────────────────────────────────────────────
const speechClient = new SpeechClient({
  keyFilename: path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS)
});

// ─── Recognition config ───────────────────────────────────────────────────────
// boost: 20.0 strongly biases the model toward these domain-specific phrases,
// which dramatically improves recognition of email commands spoken with an
// Indian accent (en-IN).
const RECOGNITION_CONFIG = {
  encoding: 'LINEAR16',
  sampleRateHertz: 16000,
  languageCode: 'en-IN',
  enableAutomaticPunctuation: true,
  maxAlternatives: 3,           // request 3 alternatives so callers can pick the best
  speechContexts: [
    {
      boost: 20.0,
      phrases: [
        // ── Command intents ────────────────────────────────────────────────
        'send email',
        'send mail',
        'send an email',
        'send an email to',
        'compose email',
        'draft email',
        // ── Email field labels ─────────────────────────────────────────────
        'to',
        'subject',
        'body',
        'recipient',
        'saying',
        'message',
        'with subject',
        'with message',
        // ── Email address fragments ────────────────────────────────────────
        'at the rate',        // Indian English for @
        'at d rate',          // common en-IN variant
        'at',
        'dot',
        'dot com',
        '@',
        // ── Popular email domains ──────────────────────────────────────────
        'gmail',
        'gmail.com',
        'gmail dot com',
        'yahoo.com',
        'outlook.com',
        'hotmail.com',
        'icloud.com',
        // ── Commonly misrecognised words in en-IN ──────────────────────────
        'user',
        'username',
        'email',
        'email address',
      ]
    }
  ]
};

/**
 * Transcribe an audio file using Google Cloud Speech-to-Text.
 * Returns the best alternative transcript string, or '' if nothing detected.
 *
 * @param {string} filePath  Absolute path to a LINEAR16 16kHz mono WAV file.
 * @returns {Promise<string>}
 */
async function speechToText(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Audio file not found: ${filePath}`);
  }

  const fileStats = fs.statSync(filePath);
  if (fileStats.size === 0) {
    throw new Error('Audio file is empty');
  }

  const audioBase64 = fs.readFileSync(filePath).toString('base64');

  const [response] = await speechClient.recognize({
    audio: { content: audioBase64 },
    config: RECOGNITION_CONFIG
  });

  if (!response.results || response.results.length === 0) {
    return '';
  }

  // Pick the highest-confidence alternative across all result chunks.
  // When maxAlternatives > 1, alternatives[0] is always the best per chunk,
  // but we log confidence for debugging.
  const transcript = response.results
    .map(result => {
      const best = result.alternatives[0];
      if (best) {
        console.log(`[STT] chunk confidence=${(best.confidence * 100).toFixed(1)}%  "${best.transcript}"`);
      }
      return best?.transcript || '';
    })
    .join(' ')
    .trim();

  return transcript;
}

module.exports = { speechToText };
