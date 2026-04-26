const express = require('express');
const fs = require('fs');
const path = require('path');
const { getAuthUrl, getTokens, getUserEmail, oauth2Client } = require('../config/oauth');

const router = express.Router();

router.get('/google', (req, res) => {
  const url = getAuthUrl();
  res.redirect(url);
});

router.get('/google/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const tokens = await getTokens(code);
    oauth2Client.setCredentials(tokens);

    if (tokens.refresh_token) {
      // Save refresh token to .env
      const envPath = path.join(__dirname, '..', '.env');
      let envContent = fs.readFileSync(envPath, 'utf8');
      
      if (envContent.includes('GOOGLE_REFRESH_TOKEN=')) {
        envContent = envContent.replace(/GOOGLE_REFRESH_TOKEN=.*/, `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
      } else {
        envContent += `\nGOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`;
      }
      
      fs.writeFileSync(envPath, envContent);
      process.env.GOOGLE_REFRESH_TOKEN = tokens.refresh_token;
    }

    res.send(`
      <html>
        <body>
          <h1>Authentication Successful!</h1>
          <p>You can close this window now.</p>
          <script>
            window.close();
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Error during authentication callback:', error);
    res.status(500).send('Authentication failed');
  }
});

router.get('/status', async (req, res) => {
  if (!process.env.GOOGLE_REFRESH_TOKEN) {
    return res.json({ authenticated: false });
  }

  try {
    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const { token } = await oauth2Client.getAccessToken();
    
    if (!token) {
      return res.json({ authenticated: false });
    }

    // Try to get user info to verify token works
    const oauth2 = require('googleapis').google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    
    res.json({ authenticated: true, email: userInfo.data.email });
  } catch (error) {
    console.error('Error checking auth status:', error);
    res.json({ authenticated: false });
  }
});

module.exports = router;