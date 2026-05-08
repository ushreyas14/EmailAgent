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
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// ─── CORS ────────────────────────────────────────────────────────────────────
// In production (same-origin on Render): CORS is not needed but kept for safety.
// In development: allows Vite dev server (localhost:5173) to talk to this server.
app.use(cors({
  origin: IS_PRODUCTION ? true : FRONTEND_URL,  // true = reflect same-origin requests
  credentials: true
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
    secure: process.env.NODE_ENV === 'production',   // HTTPS only in production
    sameSite: 'lax',                                 // same-origin on Render — lax is fine
    maxAge: 7 * 24 * 60 * 60 * 1000  // 7 days
  }
}));

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json());

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/auth', authRoutes);
app.use('/api', emailRoutes);

// ─── Serve React frontend (production only) ───────────────────────────────────
// In production, Express serves the built Vite output from frontend/dist.
// The catch-all ensures React Router handles all non-API routes.
if (IS_PRODUCTION) {
  const DIST = path.join(__dirname, '..', 'frontend', 'dist');
  app.use(express.static(DIST));
  app.get('*', (_req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

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