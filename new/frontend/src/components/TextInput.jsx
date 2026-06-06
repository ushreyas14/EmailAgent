import React from 'react';

export default function TextInput({ value, onChange }) {
  return (
    <div className="text-input-container">
      <label className="input-label" htmlFor="email-command">
        Or Type Your Email Command
      </label>
      <textarea
        id="email-command"
        className="text-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Send an email to john@test.com about tomorrow's meeting saying we need to reschedule."
        rows={4}
      />
    </div>
  );
}
