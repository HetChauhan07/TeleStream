import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { triggerIndex } from '../api/client';
import RequestModal from './RequestModal';

export default function Navbar({ user, onLogout }) {
  const [scrolled, setScrolled] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleIndex = useCallback(async () => {
    if (indexing) return;
    setIndexing(true);
    try {
      await triggerIndex();
      window.location.reload();
    } catch (err) {
      console.error('Indexing failed:', err);
    } finally {
      setIndexing(false);
    }
  }, [indexing]);

  return (
    <nav className={`navbar ${scrolled ? 'scrolled' : ''}`} id="main-navbar">
      <Link to="/" className="navbar__logo">
        <span className="navbar__logo-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="var(--accent-primary)" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
        </span>
        <span className="navbar__logo-text">TeleStream</span>
      </Link>

      <ul className="navbar__links">
        <li>
          <Link
            to="/"
            className={`navbar__link ${location.pathname === '/' ? 'active' : ''}`}
          >
            Home
          </Link>
        </li>
        <li>
          <Link
            to="/browse?type=movie"
            className={`navbar__link ${location.search.includes('type=movie') ? 'active' : ''}`}
          >
            Movies
          </Link>
        </li>
        <li>
          <Link
            to="/browse?type=tv"
            className={`navbar__link ${location.search.includes('type=tv') ? 'active' : ''}`}
          >
            Series
          </Link>
        </li>

        {user?.role === 'admin' && (
          <>
            <li>
              <Link
                to="/admin"
                className={`navbar__link ${location.pathname === '/admin' ? 'active' : ''}`}
              >
                Admin
              </Link>
            </li>
          </>
        )}
      </ul>

      <div className="navbar__actions">
        <Link 
          to="/browse" 
          className="navbar__search-btn"
          style={{ background: 'transparent', border: '1px solid #444', color: '#fff' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          Search
        </Link>
        {user?.role === 'admin' ? (
          <button
            className="navbar__search-btn"
            onClick={handleIndex}
            disabled={indexing}
            style={{ background: 'var(--accent-primary)', borderColor: 'var(--accent-primary)', color: 'white', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {indexing ? (
              <>
                <span className="spinner" style={{ width: '14px', height: '14px', borderTopColor: 'white' }} />
                Syncing...
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                Sync
              </>
            )}
          </button>
        ) : (
          <button 
            onClick={() => setIsRequestModalOpen(true)}
            className="navbar__search-btn"
            style={{ background: 'var(--accent-primary)', borderColor: 'var(--accent-primary)', color: 'white' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Request Media
          </button>
        )}

        {/* User menu */}
        <div className="navbar__user-menu">
          <span className="navbar__user-name" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {user?.role === 'admin' ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"></path>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
            )}
            {user?.username}
          </span>
          <button className="navbar__logout-btn" onClick={onLogout}>
            Logout
          </button>
        </div>
      </div>

      <RequestModal 
        isOpen={isRequestModalOpen} 
        onClose={() => setIsRequestModalOpen(false)} 
      />
    </nav>
  );
}
