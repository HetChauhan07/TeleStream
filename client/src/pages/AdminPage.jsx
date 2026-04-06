import { useState, useEffect } from 'react';

export default function AdminPage() {
  // User Management State
  const [users, setUsers] = useState([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const token = localStorage.getItem('token');

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    try {
      const baseUrl = import.meta.env.VITE_API_URL || 'https://telestream-jgee.onrender.com/api';
      const res = await fetch(`${baseUrl}/auth/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setUsers(data.users);
    } catch (err) {
      console.error('Failed to fetch users');
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const baseUrl = import.meta.env.VITE_API_URL || 'https://telestream-jgee.onrender.com/api';
      const res = await fetch(`${baseUrl}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: username.trim(),
          password: password.trim(),
          role,
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Failed to create user');

      setSuccess(`User "${data.user.username}" created!`);
      setUsername('');
      setPassword('');
      setRole('user');
      fetchUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(userId, uname) {
    if (!window.confirm(`Delete user "${uname}"?`)) return;

    try {
      const baseUrl = import.meta.env.VITE_API_URL || 'https://telestream-jgee.onrender.com/api';
      const res = await fetch(`${baseUrl}/auth/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSuccess(`User "${uname}" deleted`);
      fetchUsers();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="admin-page">
      <div className="container">
        <h1 className="admin-page__title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect width="18" height="18" x="3" y="3" rx="2" />
            <path d="M7 7h10" />
            <path d="M7 12h10" />
            <path d="M7 17h10" />
          </svg>
          <span>Admin Panel</span>
        </h1>
        <p className="admin-page__subtitle">Manage access to your personal media server</p>

        <div className="admin-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', marginTop: '2rem' }}>
          {/* ─── Create User Form ─── */}
          <div className="admin-card">
            <h2 className="admin-card__title">Create New User</h2>

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

            {success && (
              <div className="admin-card__success animate-fadeIn" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                {success}
              </div>
            )}

            <form onSubmit={handleCreate} className="setup-form">
              <div className="setup-form__group">
                <label className="setup-form__label" htmlFor="admin-new-user">
                  Username
                </label>
                <input
                  id="admin-new-user"
                  type="text"
                  className="setup-form__input"
                  placeholder="new_username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="setup-form__group">
                <label className="setup-form__label" htmlFor="admin-new-pass">
                  Password
                </label>
                <input
                  id="admin-new-pass"
                  type="password"
                  className="setup-form__input"
                  placeholder="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div className="setup-form__group">
                <label className="setup-form__label" htmlFor="admin-role">
                  Role
                </label>
                <select
                  id="admin-role"
                  className="setup-form__input"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  disabled={loading}
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <button
                type="submit"
                className="setup-form__btn"
                disabled={loading || !username.trim() || !password.trim()}
              >
                {loading ? (
                  <>
                    <div className="setup-form__btn-spinner"></div>
                    Creating...
                  </>
                ) : (
                  <>Create User</>
                )}
              </button>
            </form>
          </div>

          {/* ─── User List ─── */}
          <div className="admin-card">
            <h2 className="admin-card__title">
              All Users <span className="admin-card__count">{users.length}</span>
            </h2>

            <div className="admin-users">
              {users.map((user) => (
                <div key={user._id} className="admin-user">
                  <div className="admin-user__info">
                    <span className="admin-user__avatar" style={{ display: 'flex', alignItems: 'center' }}>
                      {user.role === 'admin' ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"></path>
                        </svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
                          <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                      )}
                    </span>
                    <div>
                      <div className="admin-user__name">{user.username}</div>
                      <div className="admin-user__role">{user.role}</div>
                    </div>
                  </div>
                  {user.role !== 'admin' && (
                    <button
                      className="admin-user__delete"
                      onClick={() => handleDelete(user._id, user.username)}
                      title="Delete user"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M3 6h18" />
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}

              {users.length === 0 && (
                <p className="admin-users__empty">No users yet</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
