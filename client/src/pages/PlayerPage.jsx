import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getMediaById, getStreamUrl, getProgress, updateProgress } from '../api/client';
import mpegts from 'mpegts.js';

export default function PlayerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const saveTimerRef = useRef(null);

  const [movie, setMovie] = useState(null);
  const [loading, setLoading] = useState(true);

  // Fetch movie and progress
  useEffect(() => {
    async function init() {
      try {
        const [movieData, progressData] = await Promise.all([
          getMediaById(id),
          getProgress(id),
        ]);
        setMovie(movieData);

        // Set initial time after video loads
        if (videoRef.current && progressData.currentTime > 0) {
          videoRef.current.currentTime = progressData.currentTime;
        }
      } catch (err) {
        console.error('Failed to init player:', err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [id]);

  // Save progress periodically
  const saveProgress = useCallback(async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    if (video.currentTime > 0 && video.duration > 0) {
      try {
        await updateProgress(id, video.currentTime, video.duration);
      } catch (err) {
        // Silently fail
      }
    }
  }, [id]);

  // Auto-save every 10 seconds
  useEffect(() => {
    saveTimerRef.current = setInterval(saveProgress, 10000);
    return () => {
      saveProgress(); // Save on unmount
      clearInterval(saveTimerRef.current);
    };
  }, [saveProgress]);

  // Restore position when video metadata loads
  const handleLoadedMetadata = async () => {
    try {
      const progress = await getProgress(id);
      if (progress.currentTime > 0 && videoRef.current) {
        videoRef.current.currentTime = progress.currentTime;
      }
    } catch (err) {
      // Ignore
    }
  };

  // Setup mpegts.js if needed
  useEffect(() => {
    let player = null;
    if (movie && movie.mimeType === 'video/mp2t' && videoRef.current) {
      if (mpegts.getFeatureList().mseLivePlayback) {
        player = mpegts.createPlayer({
          type: 'm2ts',
          isLive: false,
          url: getStreamUrl(id),
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
  }, [movie, id]);

  // Save progress on pause/end
  const handlePause = () => saveProgress();
  const handleEnded = () => {
    if (videoRef.current) {
      updateProgress(id, videoRef.current.duration, videoRef.current.duration).catch(() => {});
    }

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
    saveProgress();
    
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
        <div className="player-page__title-bar">
          <span className="player-page__title-text">{movie.title}</span>
        </div>
      )}

      <video
        ref={videoRef}
        className="player-page__video"
        src={isMpegTS ? undefined : getStreamUrl(id)}
        controls
        autoPlay
        onLoadedMetadata={handleLoadedMetadata}
        onPause={handlePause}
        onEnded={handleEnded}
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
