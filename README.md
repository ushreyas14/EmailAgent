# AI Voice Email Assistant

An AI-powered voice-to-email agent that allows users to draft and send emails using their voice. The application transcribes spoken audio, processes the transcript using advanced LLMs (Google Gemini) to format a professional email, and sends it via the Gmail API.

## Features

- **Voice Input:** Record voice directly from the browser.
- **Speech-to-Text:** Transcribes audio using Google Cloud Speech API.
- **AI Processing:** Intelligently formats and cleans up transcriptions using Google Gemini AI into professional email drafts.
- **Gmail Integration:** Authenticates users via OAuth2 to read contacts and send emails securely using the Gmail API.
- **Modern UI:** Built with React and Vite for a fast, responsive user experience.

## Tech Stack

### Frontend
- React 18
- Vite
- Lucide React (Icons)
- React Toastify (Notifications)

### Backend
- Node.js & Express
- Google Cloud Speech (`@google-cloud/speech`)
- Google Generative AI (`@google/generative-ai`)
- Gmail API (`googleapis`)
- Express Session & File Store

## Project Structure

```text
├── new/
│   ├── backend/          # Node.js Express server
│   │   ├── config/       # OAuth and token storage configurations
│   │   ├── middleware/   # Express middlewares (e.g., auth check)
│   │   ├── routes/       # API endpoints (auth, email)
│   │   ├── services/     # Core logic (Email, Speech-to-Text, Gemini Processing)
│   │   └── server.js     # Express App Entry Point
│   └── frontend/         # React Application
│       ├── public/
│       ├── src/
│       │   ├── components/  # React components (VoiceInput, EmailPreview, etc.)
│       │   ├── utils/       # Helper functions and API wrappers
│       │   └── App.jsx      # Main Application Component
```

## Setup Instructions

### Prerequisites
- Node.js (v16+)
- A Google Cloud Console project with the following APIs enabled:
  - Gmail API
  - Google Cloud Speech-to-Text API
  - Google Gemini API (Generative AI)

### 1. Environment & Credentials

1. **Google OAuth Credentials**: 
   - Download your OAuth 2.0 Web Client ID credentials from the Google Cloud Console.
   - Save it as `google-credentials.json` inside the `new/backend/` directory.

2. **Environment Variables**:
   - Create a `.env` file in the `new/backend/` directory:
     ```env
     PORT=3000
     SESSION_SECRET=your_super_secret_session_key
     GEMINI_API_KEY=your_gemini_api_key_here
     ```

### 2. Backend Setup

```bash
cd new/backend
npm install
npm run dev
```
The backend server will start at `http://localhost:3000`.

### 3. Frontend Setup

```bash
cd new/frontend
npm install
npm run dev
```
The Vite development server will start, typically accessible at `http://localhost:5173`.

## Usage
1. Open the frontend URL in your browser.
2. Click "Sign in with Google" to authenticate via OAuth.
3. Click the microphone icon to record your email message.
4. Review the AI-generated email draft.
5. Send the email directly from the app!

## License
MIT
