require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const emailRoutes = require('./routes/email');
const { oauth2Client } = require('./config/oauth');

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}));

app.use(express.json());

// Mount routes
app.use('/auth', authRoutes);
app.use('/api', emailRoutes);

// Health check endpoint
app.get('/', (req, res) => {
  const oauthStatus = process.env.GOOGLE_REFRESH_TOKEN ? 'configured' : 'missing_token';
  const geminiStatus = process.env.GEMINI_API_KEY ? 'configured' : 'missing_key';
  
  res.json({
    message: 'Email Agent API is running',
    oauth: oauthStatus,
    gemini: geminiStatus
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Frontend URL: ${FRONTEND_URL}`);
  console.log(`OAuth Status: ${process.env.GOOGLE_REFRESH_TOKEN ? 'Configured' : 'Missing Refresh Token'}`);
  console.log(`Gemini Status: ${process.env.GEMINI_API_KEY ? 'Configured' : 'Missing API Key'}`);
});