import React, { useState } from 'react';
import { Mail, Eye, EyeOff, Send } from 'lucide-react';

export default function EmailPreview({ 
  recipient, 
  subject, 
  body, 
  cc, 
  bcc, 
  onUpdate, 
  onSend, 
  isSending 
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleUpdate = (field, value) => {
    onUpdate({
      recipient, subject, body, cc, bcc,
      [field]: value
    });
  };

  const isFormValid = recipient && recipient.trim().length > 0;

  return (
    <div className="email-preview-card">
      <div className="preview-header">
        <Mail size={20} className="icon" />
        <h2>Email Preview</h2>
      </div>

      <div className="preview-body">
        <div className="form-group">
          <label>To: <span className="required">*</span></label>
          <input 
            type="email" 
            value={recipient} 
            onChange={(e) => handleUpdate('recipient', e.target.value)}
            placeholder="recipient@example.com"
          />
        </div>

        {showAdvanced && (
          <>
            <div className="form-group">
              <label>Cc:</label>
              <input 
                type="text" 
                value={cc} 
                onChange={(e) => handleUpdate('cc', e.target.value)}
                placeholder="cc1@example.com, cc2@example.com"
              />
            </div>
            <div className="form-group">
              <label>Bcc:</label>
              <input 
                type="text" 
                value={bcc} 
                onChange={(e) => handleUpdate('bcc', e.target.value)}
                placeholder="bcc@example.com"
              />
            </div>
          </>
        )}

        <div className="advanced-toggle">
          <button 
            type="button" 
            className="text-button"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? (
              <><EyeOff size={14} /> Hide CC/BCC</>
            ) : (
              <><Eye size={14} /> Show CC/BCC</>
            )}
          </button>
        </div>

        <div className="form-group">
          <label>Subject:</label>
          <input 
            type="text" 
            value={subject} 
            onChange={(e) => handleUpdate('subject', e.target.value)}
            placeholder="Email Subject"
          />
        </div>

        <div className="form-group">
          <label>Message:</label>
          <textarea 
            value={body} 
            onChange={(e) => handleUpdate('body', e.target.value)}
            placeholder="Email body content..."
            rows={8}
          />
        </div>
      </div>

      <div className="preview-footer">
        <button 
          className="send-button"
          onClick={onSend}
          disabled={!isFormValid || isSending}
        >
          {isSending ? (
            <div className="spinner"></div>
          ) : (
            <><Send size={18} /> Send Email</>
          )}
        </button>
      </div>
    </div>
  );
}
