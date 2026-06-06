import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { Moon, Sun, Clock, FileText, Send } from 'lucide-react';
import AuthStatus from './components/AuthStatus';
import VoiceInput from './components/VoiceInput';
import TextInput from './components/TextInput';
import EmailPreview from './components/EmailPreview';
import StatusMessage from './components/StatusMessage';
import { parseEmail, sendEmail } from './utils/api';

const TEMPLATES = [
  { name: 'Meeting Request', template: 'Send an email to [email] to schedule a meeting next week to discuss the project.' },
  { name: 'Follow Up', template: 'Draft a follow up email to [email] regarding our previous conversation.' },
  { name: 'Thank You', template: 'Send a thank you email to [email] for their time today.' }
];

function App() {
  const [textInput, setTextInput] = useState('');
  const [emailData, setEmailData] = useState({ recipient: '', subject: '', body: '', cc: '', bcc: '' });
  const [isSending, setIsSending] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [emailHistory, setEmailHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ type: '', text: '' });
  const [isAuthenticated, setIsAuthenticated] = useState(false);  // NEW

  useEffect(() => {
    // Restore dark mode preference
    const savedDarkMode = localStorage.getItem('darkMode') === 'true';
    setDarkMode(savedDarkMode);
    if (savedDarkMode) document.body.classList.add('dark-mode');

    // Restore email history
    const savedHistory = JSON.parse(localStorage.getItem('emailHistory') || '[]');
    setEmailHistory(savedHistory);

    // Handle OAuth callback: detect ?auth=success or ?auth=error in the URL.
    // This runs in the POPUP window after Google redirects back.
    // We use localStorage to signal the parent window because Google's
    // Cross-Origin-Opener-Policy severs window.opener, making postMessage impossible.
    const params = new URLSearchParams(window.location.search);
    const authResult = params.get('auth');

    if (authResult) {
      if (authResult === 'success') {
        // Signal the parent window via localStorage (immune to COOP)
        localStorage.setItem('oauth_result', JSON.stringify({
          type: 'AUTH_SUCCESS',
          timestamp: Date.now()
        }));
      } else {
        const reason = params.get('reason') || 'unknown';
        localStorage.setItem('oauth_result', JSON.stringify({
          type: 'AUTH_ERROR',
          reason,
          timestamp: Date.now()
        }));
        toast.error(`Authentication failed: ${reason}`);
      }

      // Clean the URL
      window.history.replaceState({}, '', '/');

      // Try to close the popup. If this is a full-page redirect (not a popup),
      // window.close() will be silently ignored by the browser.
      window.close();
    }
  }, []);

  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    localStorage.setItem('darkMode', newMode);
    if (newMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  };

  const handleVoiceTranscript = (transcript) => {
    const currentText = textInput ? `${textInput} ${transcript}` : transcript;
    setTextInput(currentText);
    handleParse(currentText);
  };

  const handleParse = async (input = textInput) => {
    if (!input || input.trim().length < 5) {
      toast.warn('Please provide a longer command.');
      return;
    }

    setIsParsing(true);
    setStatusMsg({ type: 'info', text: 'Parsing your request...' });

    try {
      const data = await parseEmail(input);
      
      setEmailData({
        recipient: data.recipient || emailData.recipient,
        subject: data.subject || emailData.subject,
        body: data.body || emailData.body,
        cc: emailData.cc,
        bcc: emailData.bcc
      });

      if (data.warnings && data.warnings.length > 0) {
        data.warnings.forEach(w => toast.warn(w));
        setStatusMsg({ type: 'error', text: 'Parsed with some missing fields. Please review.' });
      } else {
        toast.success(`Successfully parsed using ${data.method === 'gemini' ? 'AI' : 'fallback'}`);
        setStatusMsg({ type: 'success', text: 'Ready to send!' });
      }
    } catch (error) {
      toast.error(error.message || 'Failed to parse email');
      setStatusMsg({ type: 'error', text: 'Failed to parse. Please manually edit below.' });
    } finally {
      setIsParsing(false);
    }
  };

  const handleSendEmail = async () => {
    if (!isAuthenticated) {
      toast.error('Please login with Google first.');
      return;
    }

    if (!emailData.recipient) {
      toast.error('Recipient is required');
      return;
    }

    setIsSending(true);
    setStatusMsg({ type: 'info', text: 'Sending email...' });

    try {
      const res = await sendEmail(
        emailData.recipient,
        emailData.subject,
        emailData.body,
        emailData.cc,
        emailData.bcc
      );

      toast.success('Email sent successfully!');
      setStatusMsg({ type: 'success', text: `Email sent from your account! ✅` });

      const newHistory = [
        { ...emailData, id: res.messageId, timestamp: res.timestamp, from: res.from },
        ...emailHistory
      ].slice(0, 20);
      
      setEmailHistory(newHistory);
      localStorage.setItem('emailHistory', JSON.stringify(newHistory));

      setTimeout(() => {
        setEmailData({ recipient: '', subject: '', body: '', cc: '', bcc: '' });
        setTextInput('');
        setStatusMsg({ type: '', text: '' });
      }, 2000);

    } catch (error) {
      if (error.needsAuth) {
        toast.error('Session expired. Please login again.');
        setIsAuthenticated(false);
        setStatusMsg({ type: 'error', text: 'Authentication required. Please login again.' });
      } else {
        toast.error(error.message || 'Failed to send email');
        setStatusMsg({ type: 'error', text: 'Failed to send email.' });
      }
    } finally {
      setIsSending(false);
    }
  };

  const loadHistoryItem = (item) => {
    setEmailData({
      recipient: item.recipient,
      subject: item.subject,
      body: item.body,
      cc: item.cc || '',
      bcc: item.bcc || ''
    });
    setShowHistory(false);
    toast.info('Loaded email from history');
  };

  const loadTemplate = (templateStr) => {
    setTextInput(templateStr);
    setShowTemplates(false);
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-title">
          <Send size={24} className="logo-icon" />
          <h1>AI Email Agent</h1>
        </div>
        <div className="header-actions">
          <button className="icon-button" onClick={() => setShowTemplates(!showTemplates)} title="Templates">
            <FileText size={20} />
          </button>
          <button className="icon-button" onClick={() => setShowHistory(!showHistory)} title="History">
            <Clock size={20} />
          </button>
          <button className="icon-button" onClick={toggleDarkMode} title="Toggle Dark Mode">
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
      </header>

      <main className="app-main">
        <div className="auth-section">
          {/* Pass onAuthChange so App knows when user logs in/out */}
          <AuthStatus onAuthChange={setIsAuthenticated} />
        </div>

        {showTemplates && (
          <div className="panel templates-panel">
            <h3>Quick Templates</h3>
            <div className="template-list">
              {TEMPLATES.map((t, idx) => (
                <button key={idx} className="template-item" onClick={() => loadTemplate(t.template)}>
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {showHistory && (
          <div className="panel history-panel">
            <h3>Recent Emails</h3>
            {emailHistory.length === 0 ? (
              <p className="empty-text">No recent emails.</p>
            ) : (
              <div className="history-list">
                {emailHistory.map((item, idx) => (
                  <div key={idx} className="history-item" onClick={() => loadHistoryItem(item)}>
                    <div className="history-to">To: {item.recipient}</div>
                    <div className="history-sub">{item.subject || '(No Subject)'}</div>
                    <div className="history-time">{new Date(item.timestamp).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <section className="input-section">
          <VoiceInput onTranscript={handleVoiceTranscript} />
          
          <TextInput 
            value={textInput} 
            onChange={setTextInput} 
          />

          <button 
            className="parse-button"
            onClick={() => handleParse()}
            disabled={isParsing || !textInput}
          >
            {isParsing ? 'Parsing...' : 'Parse Command'}
          </button>

          <StatusMessage type={statusMsg.type} message={statusMsg.text} />
        </section>

        <section className="preview-section">
          <EmailPreview 
            recipient={emailData.recipient}
            subject={emailData.subject}
            body={emailData.body}
            cc={emailData.cc}
            bcc={emailData.bcc}
            onUpdate={setEmailData}
            onSend={handleSendEmail}
            isSending={isSending}
            isAuthenticated={isAuthenticated}
          />
        </section>
      </main>
    </div>
  );
}

export default App;
