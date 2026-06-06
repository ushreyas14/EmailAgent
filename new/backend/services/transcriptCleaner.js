'use strict';

/**
 * transcriptCleaner.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Post-processing pipeline for Google STT output, optimised for Indian English
 * speakers dictating email commands.
 *
 * Stages:
 *   1. normaliseAtSymbol()       — "at the rate" / "ate D rate" → @
 *   2. cleanTranscript()         — lowercase, typo fixes, spoken-word normalisation
 *   3. reconstructEmailAddress() — join fragmented username words, attach @domain
 *   4. fixEmail()                — final pass: spoken "at"/"dot" → symbols
 *   5. needsGeminiFallback()     — detect low-confidence transcripts
 *   6. repairWithGemini()        — ask Gemini to correct the raw transcript
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 0 — Normalise the "@" symbol from Indian English speech
// ─────────────────────────────────────────────────────────────────────────────
// In Indian English, "@" is almost universally spoken as "at the rate" or
// variations like "at d rate", "ate d rate", "at rate", etc.
// This MUST run before any other cleaning because these multi-word patterns
// get destroyed if we do word-level replacements first.

const AT_SYMBOL_PATTERNS = [
  /\bate?\s+(?:the|d|da|de|duh)\s+rate\b/gi,   // "at the rate", "ate d rate", "at d rate"
  /\bate?\s+rate\b/gi,                           // "at rate"
  /\bat\s+the\s+rate\b/gi,                       // "at the rate" (explicit)
  /\batt?\s+(?:the|d)\s+rate\b/gi,               // "att the rate"
];

/**
 * Replace all Indian English "@" speech patterns with the literal @ symbol.
 * @param {string} text
 * @returns {string}
 */
function normaliseAtSymbol(text) {
  for (const pattern of AT_SYMBOL_PATTERNS) {
    text = text.replace(pattern, ' @ ');
  }
  return text.replace(/\s{2,}/g, ' ').trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 1 — cleanTranscript
// ─────────────────────────────────────────────────────────────────────────────

const WORD_CORRECTIONS = [
  // ── Command words ──────────────────────────────────────────────────────────
  [/\band\s+mel\b/gi,    'send email'],   // "and Mel" → "send email" (very common)
  [/\band\s+mail\b/gi,   'send email'],
  [/\bsand\b/gi,         'send'],
  [/\bsend\s+a\s+mail\b/gi, 'send email'],
  [/\bsend\s+mel\b/gi,   'send email'],
  [/\bsent\b/gi,         'send'],
  [/\bdraft\s+a\b/gi,    'send'],
  [/\bcompose\b/gi,      'send email'],
  [/\bsend\s+an?\s+email\b/gi, 'send email'], // normalise "send an email" → "send email"

  // ── Prepositions / connectors ──────────────────────────────────────────────
  [/\btu\b/gi,   'to'],
  [/\btoo\b/gi,  'to'],

  // ── Email keyword ─────────────────────────────────────────────────────────
  [/\bmel\b/gi,    'email'],
  [/\bmail\b/gi,   'email'],
  [/\be-mail\b/gi, 'email'],

  // ── "saying" often means the body starts ──────────────────────────────────
  [/\bsaying\b/gi, 'message'],

  // ── Domain suffixes ────────────────────────────────────────────────────────
  [/\bgee\s*mail\b/gi,   'gmail'],
  [/\bgee\s*male\b/gi,   'gmail'],
  [/\bg\s*mail\b/gi,     'gmail'],
  [/\bhot\s*mail\b/gi,   'hotmail'],
];

/**
 * Stage 1: Clean up a raw STT transcript.
 * @param {string} raw  Raw transcript (after normaliseAtSymbol)
 * @returns {string}
 */
function cleanTranscript(raw) {
  if (!raw || typeof raw !== 'string') return '';

  let text = raw.trim();

  // First: normalise "@" from Indian English speech patterns
  text = normaliseAtSymbol(text);

  // Apply word-level corrections
  for (const [pattern, replacement] of WORD_CORRECTIONS) {
    text = text.replace(pattern, replacement);
  }

  // Collapse multiple spaces
  text = text.replace(/\s{2,}/g, ' ').trim();

  return text;
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 2 — reconstructEmailAddress
// ─────────────────────────────────────────────────────────────────────────────
// The critical insight: when a user says "send email to shreyas 14 @ gmail.com"
// STT produces separate words: ["shreyas", "14", "@", "gmail.com"]
// We need to JOIN all words between "to" and "@"/domain into one username.

const KNOWN_DOMAINS = ['gmail', 'yahoo', 'outlook', 'hotmail', 'icloud', 'proton', 'zoho', 'rediffmail'];

/**
 * Stage 2: Reconstruct a full email address from fragmented words.
 *
 * Detects the pattern:
 *   ... to <word1> <word2> ... @ <domain> dot <tld>
 *   ... to <word1> <word2> ... @ <domain.tld>
 *   ... to <word1> <word2> ... <domain.tld>          (missing @)
 *   ... to <word1> <word2> ... <domain> dot <tld>    (missing @)
 *
 * Joins the username words (removing spaces, keeping numbers).
 *
 * @param {string} text  Cleaned transcript
 * @returns {string}     Text with the reconstructed email address
 */
function reconstructEmailAddress(text) {
  if (!text) return '';

  // ── Pattern A: explicit @ present ───────────────────────────────────────
  // "send email to shreyas 14 @ gmail dot com"
  // "send email to john @ d.com"
  const atPattern = /\bto\s+(.+?)\s*@\s*(.+?)(?:\s+(?:with|saying|subject|body|message|about)|\s*[.!?]?\s*$)/i;
  let match = text.match(atPattern);

  if (match) {
    const usernameWords = match[1].trim();
    const domainPart    = match[2].trim();

    const username = joinUsername(usernameWords);
    const domain   = normaliseDomain(domainPart);

    if (username && domain) {
      const email = `${username}@${domain}`;
      const afterKeyword = text.slice(text.indexOf(match[0]) + match[0].length).trim();
      const before = text.slice(0, text.indexOf(match[0])).trim();
      // Reconstruct: keep command prefix, insert clean email, keep the body keyword
      const bodyKeyword = text.match(/\b(with message|with subject|saying|subject|body|about|message)\b/i);
      return `${before} to ${email}${bodyKeyword ? ' ' + bodyKeyword[0] : ''} ${afterKeyword}`.replace(/\s{2,}/g, ' ').trim();
    }
  }

  // ── Pattern B: no @ but a known domain appears ──────────────────────────
  // "send email to shreyas 14 gmail dot com saying hi"
  // "send email to shreyas 14 gmail.com saying hi"
  const domainJoined = KNOWN_DOMAINS.join('|');
  const domainPattern = new RegExp(
    `\\bto\\s+(.+?)\\s+(${domainJoined})(?:\\s+dot\\s+|\\.)([a-z]{2,})(?:\\s+(?:with|saying|subject|body|message|about)|\\s*[.!?]?\\s*$)`,
    'i'
  );
  match = text.match(domainPattern);

  if (match) {
    const usernameWords = match[1].trim();
    const domain        = match[2].toLowerCase();
    const tld           = match[3].toLowerCase();

    const username = joinUsername(usernameWords);
    if (username) {
      const email = `${username}@${domain}.${tld}`;
      const fullMatch = match[0];
      const afterKeyword = text.slice(text.indexOf(fullMatch) + fullMatch.length).trim();
      const before = text.slice(0, text.indexOf(fullMatch)).trim();
      const bodyKeyword = fullMatch.match(/\b(with message|with subject|saying|subject|body|about|message)\b/i);
      return `${before} to ${email}${bodyKeyword ? ' ' + bodyKeyword[0] : ''} ${afterKeyword}`.replace(/\s{2,}/g, ' ').trim();
    }
  }

  return text;
}

/**
 * Join space-separated words into a single email username.
 * "shreyas 14"      → "shreyas14"
 * "use dress"       → "usedress"  (Gemini will handle if this is still wrong)
 * Strips anything that isn't alphanumeric, underscore, dot, plus, or dash.
 */
function joinUsername(words) {
  return words
    .replace(/\s+/g, '')                     // remove all spaces → concatenate
    .replace(/[^a-z0-9._+-]/gi, '')          // strip non-email-safe chars
    .toLowerCase();
}

/**
 * Normalise a spoken domain fragment.
 * "gmail dot com"  → "gmail.com"
 * "gmail.com"      → "gmail.com"
 * "d.com"          → "d.com"
 */
function normaliseDomain(raw) {
  let d = raw.replace(/\s+dot\s+/gi, '.').replace(/\s+/g, '').toLowerCase();
  // Ensure it has at least one dot + TLD
  if (!/\.[a-z]{2,}$/.test(d)) {
    // Maybe TLD is missing; append .com as best guess
    if (/^(gmail|yahoo|outlook|hotmail|icloud|proton|zoho|rediffmail)$/.test(d)) {
      d += '.com';
    }
  }
  return d;
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 3 — fixEmail (final pass)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stage 3: Final email fix — handles any remaining "at"/"dot" fragments
 * that reconstructEmailAddress didn't cover.
 *
 * @param {string} text
 * @returns {string}
 */
function fixEmail(text) {
  if (!text) return '';

  // ── spoken "at" and "dot" inside email-looking sequences ─────────────────
  text = text.replace(
    /([a-z0-9._+-]+)\s+(?:at|@)\s+([a-z0-9-]+)\s+(?:dot|\.)\s+([a-z]{2,})/gi,
    (_m, user, domain, tld) => `${user.toLowerCase()}@${domain.toLowerCase()}.${tld.toLowerCase()}`
  );

  // ── domain.tld present but missing @ ────────────────────────────────────
  text = text.replace(
    /\b([a-z0-9._+-]{2,30})\s+([a-z0-9-]+\.[a-z]{2,})\b/gi,
    (_m, user, domainWithTld) => {
      if (user.includes('@') || domainWithTld.includes('@')) return _m;
      if (/^(gmail|yahoo|outlook|hotmail|icloud|proton|zoho)\.[a-z]{2,}$/.test(domainWithTld) ||
          /\.[a-z]{2,3}$/.test(domainWithTld)) {
        return `${user.toLowerCase()}@${domainWithTld.toLowerCase()}`;
      }
      return _m;
    }
  );

  // ── remaining "dot" between domain parts ────────────────────────────────
  text = text.replace(/([a-z0-9-]+)\s+dot\s+([a-z]{2,})/gi, '$1.$2');

  return text.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE 4 — Confidence detection & Gemini repair
// ─────────────────────────────────────────────────────────────────────────────

/** Patterns that signal a low-quality transcript even after cleaning */
const LOW_CONFIDENCE_PATTERNS = [
  /\buse\s+rate\b/i,
  /\bmel\b/i,
  /\btu\b/i,
  /\bsand\b/i,
  /\bgee\s*mail\b/i,
  /\byou\s+sir\b/i,
  /\bate?\s+(?:d|the)\s+rate\b/i,    // un-normalised "at the rate" remnant
  /\bsleeping\b/i,                    // garbled username artifact
  /\bdress\b/i,                       // garbled username artifact
  /\breverse\b/i,                     // garbled username artifact
];

/** Email regex used for validation */
const EMAIL_REGEX = /[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

/**
 * Returns true when the transcript still looks noisy and should be sent
 * to Gemini for repair.
 */
function needsGeminiFallback(text) {
  // Any low-confidence word remains
  if (LOW_CONFIDENCE_PATTERNS.some(p => p.test(text))) return true;

  // No email address found at all
  if (!EMAIL_REGEX.test(text)) return true;

  // Email was found but its username part is suspiciously long (garbled words got joined)
  const emailMatch = text.match(EMAIL_REGEX);
  if (emailMatch) {
    const localPart = emailMatch[0].split('@')[0];
    // If the username is >30 chars, it's probably garbled words concatenated
    if (localPart.length > 30) return true;
  }

  return false;
}

/**
 * Ask Gemini to interpret a noisy voice transcript and produce clean text.
 * The prompt is heavily tuned for Indian English email dictation patterns.
 */
async function repairWithGemini(rawTranscript) {
  if (!genAI) {
    console.warn('[STT] Gemini not configured — skipping repair step.');
    return rawTranscript;
  }

  const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const model = genAI.getGenerativeModel({ model: modelName });

  const prompt = `You are correcting a noisy voice-to-text transcript from an Indian English speaker using an email app.

CONTEXT: The user is dictating a command like:
"Send an email to shreyas14@gmail.com with subject Meeting saying Hi, how are you?"

COMMON INDIAN ENGLISH PATTERNS:
- "at the rate" or "ate d rate" or "at d rate" = @ (the @ symbol)
- "dot" = . (period)
- Words spoken between "to" and "at the rate"/"@" are usually a concatenated username
  Example: "Shreyas 14 at the rate gmail dot com" = shreyas14@gmail.com
- "mel" or "Mel" = "email"
- "tu" or "Tu" = "to"
- "sand" = "send"
- "saying" = the email body follows

YOUR TASK:
1. Reconstruct the email address by JOINING all words between "to" and "@"/"at the rate" into one username (remove spaces, keep numbers)
2. Fix misrecognised words
3. Output the corrected command as plain text
4. Return ONLY the corrected text — no JSON, no quotes, no explanation

EXAMPLES:
Input: "Send an Mel Tu John ate D rate gmail.com"
Output: Send an email to john@gmail.com

Input: "and Mel Tu Shreyas 14 ate D rate gmail.com saying hi"
Output: Send email to shreyas14@gmail.com with message hi

Input: "Send mail to use dress for internet gmail.com saying hi"
Output: Send email to usedressforinternet@gmail.com with message hi

Input: "send a mail to use reverse 14 saying"
Output: Send email to usereverse14@gmail.com saying

NOW CORRECT THIS TRANSCRIPT:
"${rawTranscript}"`;

  try {
    const result = await model.generateContent(prompt);
    const corrected = result.response.text().trim();
    console.log(`[STT] Gemini repaired: "${rawTranscript}" → "${corrected}"`);
    return corrected;
  } catch (err) {
    console.error('[STT] Gemini repair failed:', err.message);
    return rawTranscript;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────────────────────────────────────

function validateParsed(parsed) {
  const warnings = [];

  if (!parsed.recipient || !EMAIL_REGEX.test(parsed.recipient)) {
    warnings.push('Could not detect a valid recipient email address.');
  }
  if (!parsed.subject || parsed.subject.trim() === '') {
    warnings.push('Could not detect a subject.');
  }
  if (!parsed.body || parsed.body.trim() === '') {
    warnings.push('Could not detect the email body.');
  }

  return warnings;
}

// ─────────────────────────────────────────────────────────────────────────────
// Full pipeline
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the complete post-processing pipeline on a raw STT transcript.
 *
 * Pipeline:
 *   rawTranscript
 *     → normaliseAtSymbol()          ("ate d rate" → @)
 *     → cleanTranscript()            (typo fixes)
 *     → reconstructEmailAddress()    (join username fragments)
 *     → fixEmail()                   (final @ / dot cleanup)
 *     → needsGeminiFallback()?       (confidence check)
 *       → repairWithGemini()         (only if still noisy)
 *
 * @param {string} rawTranscript  Direct output from Google STT
 * @returns {Promise<{ cleaned: string, wasRepaired: boolean }>}
 */
async function processTranscript(rawTranscript) {
  // Stage 1-4: deterministic cleaning
  let cleaned = cleanTranscript(rawTranscript);
  cleaned = reconstructEmailAddress(cleaned);
  cleaned = fixEmail(cleaned);

  console.log(`[STT] After clean+reconstruct+fix: "${cleaned}"`);

  // Stage 5-6: Gemini fallback if still noisy
  let wasRepaired = false;
  if (needsGeminiFallback(cleaned)) {
    console.log(`[STT] Low confidence detected, sending to Gemini repair...`);
    // Feed the ORIGINAL transcript to Gemini — it has more context
    cleaned = await repairWithGemini(rawTranscript);
    // Re-run deterministic cleaning on Gemini's output
    cleaned = cleanTranscript(cleaned);
    cleaned = reconstructEmailAddress(cleaned);
    cleaned = fixEmail(cleaned);
    wasRepaired = true;
  }

  return { cleaned, wasRepaired };
}

module.exports = {
  normaliseAtSymbol,
  cleanTranscript,
  reconstructEmailAddress,
  fixEmail,
  needsGeminiFallback,
  repairWithGemini,
  validateParsed,
  processTranscript
};
