import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 30000,
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// If we get a 401, clear token and reload to show login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

// ─── Library ────────────────────────────────────────
export async function getLibrary(params = {}) {
  const { data } = await api.get('/library', { params });
  return data;
}

export async function getGenres() {
  const { data } = await api.get('/library/genres');
  return data;
}

export async function getMediaById(id) {
  const { data } = await api.get(`/library/${id}`);
  return data;
}

// ─── Streaming ──────────────────────────────────────
export function getStreamUrl(id) {
  const token = localStorage.getItem('token');
  const base = import.meta.env.VITE_API_URL || '/api';
  return `${base}/stream/${id}?token=${token}`;
}

// ─── Progress ───────────────────────────────────────
export async function getProgress(mediaId) {
  const { data } = await api.get(`/progress/${mediaId}`);
  return data;
}

export async function updateProgress(mediaId, currentTime, duration) {
  const { data } = await api.put(`/progress/${mediaId}`, {
    currentTime,
    duration,
  });
  return data;
}

export async function getContinueWatching() {
  const { data } = await api.get('/progress/continue');
  return data;
}

// ─── Indexing ───────────────────────────────────────
export async function triggerIndex() {
  const { data } = await api.post('/index');
  return data;
}

export async function getIndexStatus() {
  const { data } = await api.get('/index/status');
  return data;
}

export default api;
