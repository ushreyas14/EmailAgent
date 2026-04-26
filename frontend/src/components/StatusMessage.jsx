import React from 'react';
import { AlertCircle, CheckCircle, Info } from 'lucide-react';

export default function StatusMessage({ type, message }) {
  if (!message) return null;

  const icons = {
    error: <AlertCircle size={18} />,
    success: <CheckCircle size={18} />,
    info: <Info size={18} />
  };

  return (
    <div className={`status-message ${type}`}>
      {icons[type]}
      <span>{message}</span>
    </div>
  );
}
