import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getMediaById, getStreamUrl } from '../api/client';
import mpegts from 'mpegts.js';

export default function PlayerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const bufferingTimer = useRef(null);

  const [movie, setMovie] = useState(null);
  const [loading, setLoading] = useState(true);
  const [qualityMode, setQualityMode] = useState('Auto');
  const [streamOptions, setStreamOptions] = useState({ quality: 'original', start: 0 });

  // Fetch movie and progress
  useEffect(() => {
    async function init() {
      try {
        const movieData = await getMediaById(id);
        setMovie(movieData);
      } catch (err) {
        console.error('Failed to init player:', err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [id]);



  // Setup mpegts.js if needed
  useEffect(() => {
    let player = null;
    if (movie && movie.mimeType === 'video/mp2t' && videoRef.current) {
      if (mpegts.getFeatureList().mseLivePlayback) {
        player = mpegts.createPlayer({
          type: 'm2ts',
          isLive: false,
          url: getStreamUrl(id, streamOptions),
          duration: movie.duration ? movie.duration * 1000 : undefined,
          filesize: movie.fileSize || undefined
        }, {
          enableWorker: true,
          lazyLoad: true,
          lazyLoadMaxDuration: 30,
          seekType: 'range'
        });
        player.attachMediaElement(videoRef.current);
        player.load();
        player.play();
      }
    }
    return () => {
      if (player) {
        player.destroy();
      }
    };
  }, [movie, id, streamOptions]);

  const handleQualityChange = (e) => {
    const q = e.target.value;
    setQualityMode(q);
    
    // Save current time to resume smoothly
    const currentTime = videoRef.current ? videoRef.current.currentTime : 0;
    const newOffset = streamOptions.start + currentTime;
    
    // We add a tiny delay to allow React to flush, though not strictly needed
    if (q === 'Auto') {
      setStreamOptions({ quality: 'original', start: newOffset });
    } else if (q === 'Original') {
      setStreamOptions({ quality: 'original', start: newOffset });
    } else {
      setStreamOptions({ quality: q, start: newOffset });
    }
  };

  const handleWaiting = () => {
    if (qualityMode !== 'Auto') return;
    
    if (bufferingTimer.current) clearTimeout(bufferingTimer.current);
    bufferingTimer.current = setTimeout(() => {
      const downgradeMap = {
        'original': '720',
        '1080': '720',
        '720': '480',
        '480': '360',
        '360': '360'
      };
      const currentQ = streamOptions.quality === 'original' ? 'original' : streamOptions.quality;
      const nextQ = downgradeMap[currentQ] || '360';
      
      if (nextQ !== currentQ) {
        console.log(`Auto downgrading quality to ${nextQ} due to buffering...`);
        const currentTime = videoRef.current ? videoRef.current.currentTime : 0;
        const newOffset = streamOptions.start + currentTime;
        setStreamOptions({ quality: nextQ, start: newOffset });
      }
    }, 4000); // 4 seconds of buffering triggers downgrade
  };

  const handlePlaying = () => {
    if (bufferingTimer.current) {
      clearTimeout(bufferingTimer.current);
      bufferingTimer.current = null;
    }
  };

  const handleEnded = () => {

    // Auto-play next part if it exists
    if (movie && movie.parts && movie.parts.length > 0) {
      const currentPartIndex = movie.parts.findIndex(p => p._id === id);
      if (currentPartIndex !== -1 && currentPartIndex < movie.parts.length - 1) {
        const nextPart = movie.parts[currentPartIndex + 1];
        console.log(`Transitioning to next part: ${nextPart.partNumber}`);
        navigate(`/play/${nextPart._id}`);
      }
    }
  };

  const handleBack = () => {
    
    // Determine the base movie page URL to go back to instead of going back to the individual part page.
    // If it's a part, it will go back to the single movie container for that TMDB ID.
    if (movie && movie.partNumber > 0 && movie.parts && movie.parts.length > 0) {
      // Get the ID of the very first part, since our Browse page links to the base movie ID
      navigate(`/movie/${movie.parts[0]._id}`);
    } else {
      navigate(`/movie/${id}`);
    }
  };

  // Keyboard shortcut: Escape to go back
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        handleBack();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  if (loading) {
    return (
      <div className="player-page" id="player-page">
        <div className="loader-spinner" />
      </div>
    );
  }

  const isMpegTS = movie?.mimeType === 'video/mp2t';

  return (
    <div className="player-page" id="player-page">
      <button className="player-page__back" onClick={handleBack}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        Back
      </button>

      {movie && (
        <div className="player-page__title-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="player-page__title-text">{movie.title}</span>
          <div className="player-page__quality-selector" style={{ background: 'rgba(0,0,0,0.6)', padding: '5px 10px', borderRadius: '6px', pointerEvents: 'auto' }}>
            <label style={{ color: 'white', marginRight: '8px', fontSize: '14px' }}>Quality:</label>
            <select 
              value={qualityMode} 
              onChange={handleQualityChange}
              style={{ background: 'transparent', color: 'white', border: '1px solid #555', borderRadius: '4px', padding: '2px 4px', outline: 'none', cursor: 'pointer' }}
            >
              <option value="Auto">Auto {qualityMode === 'Auto' && streamOptions.quality !== 'original' ? `(${streamOptions.quality}p)` : ''}</option>
              <option value="Original">Original</option>
              <option value="1080">1080p</option>
              <option value="720">720p</option>
              <option value="480">480p</option>
              <option value="360">360p</option>
            </select>
          </div>
        </div>
      )}

      <video
        ref={videoRef}
        className="player-page__video"
        src={isMpegTS ? undefined : getStreamUrl(id, streamOptions)}
        controls
        autoPlay
        onEnded={handleEnded}
        onWaiting={handleWaiting}
        onPlaying={handlePlaying}
      >
        {movie?.subtitles?.map((sub, i) => (
          <track
            key={sub._id}
            kind="subtitles"
            src={getStreamUrl(sub._id)}
            srcLang="en"
            label={`English ${i + 1}${sub.fileName.endsWith('.srt') ? ' (Converted)' : ''}`}
            default={i === 0}
          />
        ))}
      </video>
    </div>
  );
}
