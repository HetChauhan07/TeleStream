import { useState } from 'react';

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password: password.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      // Save token and user info
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="setup-page">
      {/* Animated background orbs */}
      <div className="setup-page__orb setup-page__orb--1"></div>
      <div className="setup-page__orb setup-page__orb--2"></div>
      <div className="setup-page__orb setup-page__orb--3"></div>

      <div className="setup-card animate-fadeInScale">
        {/* Logo */}
        <div className="setup-card__logo">
          <span className="setup-card__logo-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="var(--accent-primary)" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
          </span>
          <span className="setup-card__logo-text">TeleStream</span>
        </div>

        <p className="setup-card__subtitle">
          Sign in to start watching
        </p>

        {/* Error */}
        {error && (
          <div className="setup-card__error animate-fadeIn" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="setup-form animate-fadeIn">
          <div className="setup-form__group">
            <label className="setup-form__label" htmlFor="login-username" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              Username
            </label>
            <input
              id="login-username"
              type="text"
              className="setup-form__input"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              disabled={loading}
              autoComplete="username"
            />
          </div>

          <div className="setup-form__group">
            <label className="setup-form__label" htmlFor="login-password" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              Password
            </label>
            <input
              id="login-password"
              type="password"
              className="setup-form__input"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="setup-form__btn"
            disabled={loading || !username.trim() || !password.trim()}
          >
            {loading ? (
              <>
                <div className="setup-form__btn-spinner"></div>
                Signing in...
              </>
            ) : (
              <>Sign In →</>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
