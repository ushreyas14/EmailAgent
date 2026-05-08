import React, { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Mail, LogOut, Loader2 } from 'lucide-react';
import { getAuthStatus, logout } from '../utils/api';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/**
 * AuthStatus component
 *
 * Shows current login state and provides:
 *  - "Login with Google" button when unauthenticated
 *  - Logged-in email + "Logout" button when authenticated
 *
 * Auth flow:
 *  1. User clicks "Login with Google"
 *  2. A popup opens pointing to /auth/google
 *  3. Google → backend callback → backend redirects popup to FRONTEND_URL/?auth=success
 *  4. The popup page detects ?auth=success and calls window.opener.postMessage
 *  5. This component listens for that message and re-checks auth status
 */
export default function AuthStatus({ onAuthChange }) {
  const [authStatus, setAuthStatus] = useState({ authenticated: false, email: null });
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  const checkStatus = useCallback(async () => {
    try {
      const data = await getAuthStatus();
      setAuthStatus(data);
      if (onAuthChange) onAuthChange(data.authenticated);
    } catch {
      setAuthStatus({ authenticated: false, email: null });
      if (onAuthChange) onAuthChange(false);
    } finally {
      setLoading(false);
    }
  }, [onAuthChange]);

  useEffect(() => {
    checkStatus();

    // Listen for localStorage changes from the OAuth popup.
    // The popup writes to 'oauth_result' after Google redirects back.
    // The 'storage' event fires across windows and is immune to COOP.
    const handleStorage = (event) => {
      if (event.key !== 'oauth_result' || !event.newValue) return;

      try {
        const data = JSON.parse(event.newValue);
        if (data.type === 'AUTH_SUCCESS') {
          checkStatus();
        } else if (data.type === 'AUTH_ERROR') {
          setAuthStatus({ authenticated: false, email: null });
          if (onAuthChange) onAuthChange(false);
        }
      } catch {
        // Malformed data, ignore
      }

      // Clean up the signal
      localStorage.removeItem('oauth_result');
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [checkStatus]);

  const handleLogin = () => {
    const width = 520;
    const height = 640;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    window.open(
      `${API_URL}/auth/google`,
      'GoogleOAuth',
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`
    );

    // No popup.closed polling needed — localStorage 'storage' event handles it.
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      setAuthStatus({ authenticated: false, email: null });
      if (onAuthChange) onAuthChange(false);
    } catch {
      // Still clear UI state even if server logout fails
      setAuthStatus({ authenticated: false, email: null });
      if (onAuthChange) onAuthChange(false);
    } finally {
      setLoggingOut(false);
    }
  };

  if (loading) {
    return (
      <div className="auth-status skeleton">
        <Loader2 size={16} className="spin" />
        <span>Checking authentication…</span>
      </div>
    );
  }

  if (authStatus.authenticated) {
    return (
      <div className="auth-status authenticated">
        <div className="auth-user">
          <CheckCircle2 size={18} className="icon" />
          <span>
            Sending as <strong>{authStatus.email}</strong>
          </span>
        </div>
        <button
          className="logout-button"
          onClick={handleLogout}
          disabled={loggingOut}
          title="Logout"
        >
          {loggingOut ? <Loader2 size={14} className="spin" /> : <LogOut size={14} />}
          {loggingOut ? 'Logging out…' : 'Logout'}
        </button>
      </div>
    );
  }

  return (
    <div className="auth-status disconnected">
      <div className="status-text">
        <AlertCircle size={18} className="icon" />
        <span>Not logged in — connect your Gmail to send emails</span>
      </div>
      <button className="auth-button" onClick={handleLogin}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Login with Google
      </button>
    </div>
  );
}