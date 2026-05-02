require('dotenv').config();
const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const emailRoutes = require('./routes/email');

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// ─── CORS ────────────────────────────────────────────────────────────────────
// Must be configured BEFORE session middleware so preflight OPTIONS requests
// are handled correctly and the session cookie is allowed cross-origin.
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true          // Allow cookies / session to be sent
}));

// ─── Session ─────────────────────────────────────────────────────────────────
// Using FileStore so sessions survive nodemon / server restarts.
// Sessions are stored in ./sessions/ as JSON files.
app.use(session({
  store: new FileStore({
    path: path.join(__dirname, 'sessions'),
    ttl: 7 * 24 * 60 * 60,     // 7 days (in seconds)
    retries: 1,
    logFn: () => {}             // suppress noisy session-file-store logs
  }),
  secret: process.env.SESSION_SECRET || 'fallback-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,          // Not accessible via JS — XSS protection
    secure: false,           // Set to true in production (HTTPS only)
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000  // 7 days
  }
}));

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json());

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/auth', authRoutes);
app.use('/api', emailRoutes);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  const geminiStatus = process.env.GEMINI_API_KEY ? 'configured' : 'missing_key';
  const sessionUser = req.session?.userEmail || null;

  res.json({
    message: 'Email Agent API is running (Multi-User OAuth)',
    gemini: geminiStatus,
    session: sessionUser ? `active (${sessionUser})` : 'none'
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 Frontend URL: ${FRONTEND_URL}`);
  console.log(`🔑 Gemini: ${process.env.GEMINI_API_KEY ? 'Configured' : 'Missing API Key'}`);
  console.log(`🔐 Session secret: ${process.env.SESSION_SECRET ? 'Set' : 'Using fallback!'}`);
});