import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { searchTmdb, createMediaRequest } from '../api/client';
import { X, Search } from 'lucide-react';
import { Spinner } from './Loader';

export default function RequestModal({ isOpen, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  
  const timerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setResults([]);
      setSuccessMsg('');
      setErrorMsg('');
      document.body.style.overflow = '';
    } else {
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      setErrorMsg('');
      try {
        const data = await searchTmdb(query);
        setResults(data);
      } catch (err) {
        console.error('TMDB Search Error:', err);
      } finally {
        setLoading(false);
      }
    }, 500);

    return () => clearTimeout(timerRef.current);
  }, [query]);

  if (!isOpen) return null;

  const handleRequest = async (media) => {
    try {
      setLoading(true);
      setErrorMsg('');
      await createMediaRequest(media);
      setSuccessMsg(`"${media.title}" has been successfully requested!`);
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Failed to request media');
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="modal-backdrop" onClick={onClose} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
      backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', 
      alignItems: 'center', justifyContent: 'center', zIndex: 9999,
      backdropFilter: 'blur(4px)'
    }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{
        background: '#141414', width: '90%', maxWidth: '600px', 
        borderRadius: '8px', padding: '24px', position: 'relative',
        border: '1px solid #333', maxHeight: '80vh', display: 'flex', flexDirection: 'column'
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: '16px', right: '16px', 
          background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer'
        }}>
          <X size={24} />
        </button>

        <h2 style={{ marginTop: 0, marginBottom: '20px', fontSize: '24px' }}>Request a Movie or TV Show</h2>
        
        {successMsg ? (
          <div style={{ background: 'rgba(34, 197, 94, 0.2)', color: '#4ade80', padding: '16px', borderRadius: '4px', textAlign: 'center', fontWeight: 'bold' }}>
            {successMsg}
          </div>
        ) : (
          <>
            <div style={{ position: 'relative', marginBottom: '20px' }}>
              <Search size={20} style={{ position: 'absolute', left: '12px', top: '12px', color: '#888' }} />
              <input
                type="text"
                placeholder="Search TMDB for movies or shows..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{
                  width: '100%', padding: '12px 12px 12px 40px',
                  background: '#222', border: '1px solid #444', 
                  borderRadius: '4px', color: '#fff', fontSize: '16px',
                  boxSizing: 'border-box'
                }}
                autoFocus
              />
            </div>

            {errorMsg && (
              <div style={{ color: '#ef4444', marginBottom: '16px' }}>{errorMsg}</div>
            )}

            <div style={{ overflowY: 'auto', flex: 1 }}>
              {loading && results.length === 0 && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}><Spinner /></div>
              )}
              
              {!loading && query.length >= 2 && results.length === 0 && (
                <div style={{ color: '#888', textAlign: 'center', padding: '20px' }}>No results found on TMDB.</div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {results.map((r) => (
                  <div key={r.tmdbId} style={{
                    display: 'flex', gap: '16px', padding: '12px', 
                    background: '#222', borderRadius: '6px', alignItems: 'center'
                  }}>
                    {r.posterPath ? (
                      <img src={r.posterPath} alt={r.title} style={{ width: '50px', height: '75px', objectFit: 'cover', borderRadius: '4px' }} />
                    ) : (
                      <div style={{ width: '50px', height: '75px', background: '#333', borderRadius: '4px' }}></div>
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 'bold', fontSize: '16px' }}>{r.title}</div>
                      <div style={{ color: '#888', fontSize: '14px' }}>
                        {r.type === 'movie' ? 'Movie' : 'TV Show'} {r.releaseYear ? `• ${r.releaseYear}` : ''}
                      </div>
                    </div>
                    <button 
                      onClick={() => handleRequest(r)}
                      disabled={loading}
                      className="btn btn--primary"
                      style={{ padding: '8px 16px', fontSize: '14px' }}
                    >
                      Request
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
