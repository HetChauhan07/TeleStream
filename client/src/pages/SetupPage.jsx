import { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/auth` : 'https://telestream-jgee.onrender.com/api/auth';

export default function SetupPage({ onAuthenticated }) {
  const [step, setStep] = useState('phone'); // phone | otp | 2fa | success
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [phoneCodeHash, setPhoneCodeHash] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusText, setStatusText] = useState('');

  const handleSendCode = async (e) => {
    e.preventDefault();
    if (!phone.trim()) return;

    setLoading(true);
    setError('');
    setStatusText('Sending verification code...');

    try {
      const res = await fetch(`${API_BASE}/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to send code');

      setPhoneCodeHash(data.phoneCodeHash);
      setStep('otp');
      setStatusText('');
    } catch (err) {
      setError(err.message);
      setStatusText('');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;

    setLoading(true);
    setError('');
    setStatusText('Verifying code...');

    try {
      const res = await fetch(`${API_BASE}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone.trim(),
          code: code.trim(),
          phoneCodeHash,
          password: password || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === '2FA_REQUIRED') {
          setStep('2fa');
          setError('');
          setStatusText('');
          setLoading(false);
          return;
        }
        throw new Error(data.error || 'Verification failed');
      }

      setStep('success');
      setStatusText('');

      // Redirect after a moment
      setTimeout(() => {
        onAuthenticated();
      }, 2000);
    } catch (err) {
      setError(err.message);
      setStatusText('');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2FA = async (e) => {
    e.preventDefault();
    if (!password.trim()) return;

    setLoading(true);
    setError('');
    setStatusText('Verifying 2FA password...');

    try {
      const res = await fetch(`${API_BASE}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone.trim(),
          code: code.trim(),
          phoneCodeHash,
          password: password.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed');

      setStep('success');
      setStatusText('');

      setTimeout(() => {
        onAuthenticated();
      }, 2000);
    } catch (err) {
      setError(err.message);
      setStatusText('');
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    { key: 'phone', label: 'Phone' },
    { key: 'otp', label: 'Verify' },
    { key: 'success', label: 'Done' },
  ];

  const getStepIndex = () => {
    if (step === 'phone') return 0;
    if (step === 'otp' || step === '2fa') return 1;
    return 2;
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

        {step !== 'success' && (
          <p className="setup-card__subtitle">
            Connect your Telegram account to start streaming
          </p>
        )}

        {/* Step indicator */}
        <div className="setup-steps">
          {steps.map((s, i) => (
            <div key={s.key} className="setup-steps__item">
              <div
                className={`setup-steps__dot ${
                  i <= getStepIndex() ? 'setup-steps__dot--active' : ''
                } ${i < getStepIndex() ? 'setup-steps__dot--done' : ''}`}
              >
                {i < getStepIndex() ? '✓' : i + 1}
              </div>
              <span
                className={`setup-steps__label ${
                  i <= getStepIndex() ? 'setup-steps__label--active' : ''
                }`}
              >
                {s.label}
              </span>
              {i < steps.length - 1 && (
                <div
                  className={`setup-steps__line ${
                    i < getStepIndex() ? 'setup-steps__line--active' : ''
                  }`}
                ></div>
              )}
            </div>
          ))}
        </div>

        {/* Error message */}
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

        {/* Status text */}
        {statusText && (
          <div className="setup-card__status animate-fadeIn">
            <div className="setup-card__status-spinner"></div>
            {statusText}
          </div>
        )}

        {/* ─── Phone Step ─── */}
        {step === 'phone' && (
          <form onSubmit={handleSendCode} className="setup-form animate-fadeIn">
            <div className="setup-form__group">
              <label className="setup-form__label" htmlFor="setup-phone" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
                  <path d="M12 18h.01" />
                </svg>
                Phone Number
              </label>
              <input
                id="setup-phone"
                type="tel"
                className="setup-form__input"
                placeholder="+91 98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoFocus
                disabled={loading}
              />
              <span className="setup-form__hint">
                Include country code (e.g. +91, +1)
              </span>
            </div>
            <button
              type="submit"
              className="setup-form__btn"
              disabled={loading || !phone.trim()}
            >
              {loading ? (
                <>
                  <div className="setup-form__btn-spinner"></div>
                  Sending...
                </>
              ) : (
                <>Send Verification Code →</>
              )}
            </button>
          </form>
        )}

        {/* ─── OTP Step ─── */}
        {step === 'otp' && (
          <form onSubmit={handleVerifyCode} className="setup-form animate-fadeIn">
            <div className="setup-form__group">
              <label className="setup-form__label" htmlFor="setup-code" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                Verification Code
              </label>
              <input
                id="setup-code"
                type="text"
                className="setup-form__input setup-form__input--code"
                placeholder="12345"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoFocus
                maxLength={6}
                disabled={loading}
              />
              <span className="setup-form__hint">
                Check your Telegram app for the code
              </span>
            </div>
            <button
              type="submit"
              className="setup-form__btn"
              disabled={loading || !code.trim()}
            >
              {loading ? (
                <>
                  <div className="setup-form__btn-spinner"></div>
                  Verifying...
                </>
              ) : (
                <>Verify Code →</>
              )}
            </button>
            <button
              type="button"
              className="setup-form__back"
              onClick={() => {
                setStep('phone');
                setCode('');
                setError('');
              }}
            >
              ← Change phone number
            </button>
          </form>
        )}

        {/* ─── 2FA Step ─── */}
        {step === '2fa' && (
          <form onSubmit={handleVerify2FA} className="setup-form animate-fadeIn">
            <div className="setup-form__group">
              <label className="setup-form__label" htmlFor="setup-2fa" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Two-Factor Password
              </label>
              <input
                id="setup-2fa"
                type="password"
                className="setup-form__input"
                placeholder="Your 2FA password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                disabled={loading}
              />
              <span className="setup-form__hint">
                Your account has 2FA enabled. Enter your cloud password.
              </span>
            </div>
            <button
              type="submit"
              className="setup-form__btn"
              disabled={loading || !password.trim()}
            >
              {loading ? (
                <>
                  <div className="setup-form__btn-spinner"></div>
                  Verifying...
                </>
              ) : (
                <>Authenticate →</>
              )}
            </button>
          </form>
        )}

        {/* ─── Success Step ─── */}
        {step === 'success' && (
          <div className="setup-success animate-fadeInScale">
            <div className="setup-success__icon" style={{ display: 'flex', justifyContent: 'center' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2" strokeLinecap="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h2 className="setup-success__title">You're all set!</h2>
            <p className="setup-success__desc">
              Telegram connected successfully. Redirecting to your library...
            </p>
            <div className="setup-success__progress">
              <div className="setup-success__progress-bar"></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
