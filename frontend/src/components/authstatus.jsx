import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Mail } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function AuthStatus() {
  const [authStatus, setAuthStatus] = useState({ authenticated: false, email: null });
  const [loading, setLoading] = useState(true);

  const checkStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/auth/status`);
      const data = await res.json();
      setAuthStatus(data);
    } catch (error) {
      console.error('Failed to check auth status:', error);
      setAuthStatus({ authenticated: false, email: null });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  const handleAuthenticate = () => {
    const width = 500;
    const height = 600;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    
    const authWindow = window.open(
      `${API_URL}/auth/google`,
      'GoogleAuth',
      `width=${width},height=${height},left=${left},top=${top}`
    );

    const timer = setInterval(() => {
      if (authWindow.closed) {
        clearInterval(timer);
        checkStatus();
      }
    }, 500);
  };

  if (loading) return <div className="auth-status skeleton">Loading auth status...</div>;

  if (authStatus.authenticated) {
    return (
      <div className="auth-status authenticated">
        <CheckCircle2 size={20} className="icon" />
        <span>Connected as <strong>{authStatus.email}</strong></span>
      </div>
    );
  }

  return (
    <div className="auth-status disconnected">
      <div className="status-text">
        <AlertCircle size={20} className="icon" />
        <span>Gmail not connected</span>
      </div>
      <button className="auth-button" onClick={handleAuthenticate}>
        <Mail size={16} />
        Connect Gmail
      </button>
    </div>
  );
}