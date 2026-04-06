import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import HomePage from './pages/HomePage';
import BrowsePage from './pages/BrowsePage';
import MoviePage from './pages/MoviePage';
import PlayerPage from './pages/PlayerPage';
import LoginPage from './pages/LoginPage';
import AdminPage from './pages/AdminPage';

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Check for saved token on mount
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    if (token && savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }
    setChecking(false);
  }, []);

  function handleLogin(userData) {
    setUser(userData);
  }

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }

  // Loading check
  if (checking) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#06060a',
      }}>
        <div className="loader-spinner"></div>
      </div>
    );
  }

  // Not logged in → show login
  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  // Logged in → show app
  return (
    <BrowserRouter>
      <Routes>
        {/* Player has its own full-screen layout — no navbar */}
        <Route path="/play/:id" element={<PlayerPage />} />

        {/* All other pages share the navbar */}
        <Route
          path="*"
          element={
            <>
              <Navbar user={user} onLogout={handleLogout} />
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/browse" element={<BrowsePage />} />
                <Route path="/movie/:id" element={<MoviePage />} />
                {user.role === 'admin' && (
                  <Route path="/admin" element={<AdminPage />} />
                )}
              </Routes>
            </>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
