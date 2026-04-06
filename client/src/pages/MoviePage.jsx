import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getMediaById } from '../api/client';
import { Spinner } from '../components/Loader';

export default function MoviePage() {
  const { id } = useParams();
  const [movie, setMovie] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedSeason, setSelectedSeason] = useState(1);

  useEffect(() => {
    async function fetchMovie() {
      try {
        const data = await getMediaById(id);
        setMovie(data);
        
        // Default to season 1 or the first available season
        if (data.type === 'tv' && data.episodes && data.episodes.length > 0) {
          const seasons = [...new Set(data.episodes.map(e => e.seasonNumber))].sort((a,b) => a - b);
          setSelectedSeason(seasons[0]);
        }
      } catch (err) {
        console.error('Failed to fetch movie:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchMovie();
  }, [id]);

  const uniqueSeasons = useMemo(() => {
    if (!movie || movie.type !== 'tv' || !movie.episodes) return [];
    return [...new Set(movie.episodes.map(e => e.seasonNumber))].sort((a,b) => a - b);
  }, [movie]);

  if (loading) return <Spinner />;
  if (!movie) {
    return (
      <div className="empty-state" style={{ paddingTop: 'calc(var(--navbar-height) + 4rem)' }}>
        <div className="empty-state__icon" style={{ display: 'flex', justifyContent: 'center' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>
        <h3 className="empty-state__title">Media not found</h3>
        <Link to="/" className="btn btn--secondary" style={{ marginTop: '1rem' }}>Go Home</Link>
      </div>
    );
  }

  const backdrop = movie.backdropPath || movie.posterPath;
  const progress = movie.watchProgress;
  const hasProgress = progress && progress.currentTime > 0 && !progress.completed;

  // Format time helper
  const formatTime = (seconds) => {
    if (!seconds) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  // Format file size
  const formatSize = (bytes) => {
    if (!bytes) return '';
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(0)} MB`;
  };

  const getTopAction = () => {
    // Single movie
    if (movie.type !== 'tv' && (!movie.parts || movie.parts.length === 0)) {
      return { label: hasProgress ? `Resume from ${formatTime(progress.currentTime)}` : 'Play', url: `/play/${movie._id}` };
    }

    // For Multi-part Movies
    if (movie.type !== 'tv' && movie.parts && movie.parts.length > 0) {
      let partToPlay = movie.parts[0];
      const resumePart = movie.parts.find(p => p.watchProgress && p.watchProgress.currentTime > 0 && !p.watchProgress.completed);
      if (resumePart) {
        partToPlay = resumePart;
        return { label: `Resume Part ${resumePart.partNumber}`, url: `/play/${resumePart._id}` };
      }
      const unstartedPart = movie.parts.find(p => !p.watchProgress || p.watchProgress.currentTime === 0);
      if (unstartedPart) partToPlay = unstartedPart;
      
      return { label: `Play Part ${partToPlay.partNumber}`, url: `/play/${partToPlay._id}` };
    }

    // For TV Series: Default to the first episode or resume first unwatched episode
    if (!movie.episodes || movie.episodes.length === 0) return { label: 'Play', url: `/play/${movie._id}` };

    let episodeToPlay = movie.episodes[0];
    
    // Find the furthest episode that has progress but isn't completed
    const resumeEp = movie.episodes.find(e => e.watchProgress && e.watchProgress.currentTime > 0 && !e.watchProgress.completed);
    if (resumeEp) {
      episodeToPlay = resumeEp;
      return { 
        label: `Resume S${resumeEp.seasonNumber} E${resumeEp.episodeNumber}`, 
        url: `/play/${resumeEp._id}` 
      };
    }

    // Try finding the first un-started episode
    const unstartedEp = movie.episodes.find(e => !e.watchProgress || e.watchProgress.currentTime === 0);
    if (unstartedEp) {
      episodeToPlay = unstartedEp;
    }
    
    return { 
      label: `Play S${episodeToPlay.seasonNumber} E${episodeToPlay.episodeNumber}`, 
      url: `/play/${episodeToPlay._id}` 
    };
  };

  const mainAction = getTopAction();

  return (
    <div className="movie-page" id="movie-page">
      <div
        className="movie-page__backdrop"
        style={{
          backgroundImage: backdrop ? `url(${backdrop})` : 'none',
          backgroundColor: backdrop ? 'transparent' : 'var(--bg-secondary)',
        }}
      />

      <div className="movie-page__content">
        <div className="movie-page__poster">
          {movie.posterPath ? (
            <img src={movie.posterPath} alt={movie.title} />
          ) : (
            <div className="media-card__no-poster" style={{ aspectRatio: '2/3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round">
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <path d="M7 3v18" />
                <path d="M3 7.5h4" />
                <path d="M3 12h18" />
                <path d="M3 16.5h4" />
                <path d="M17 3v18" />
                <path d="M17 7.5h4" />
                <path d="M17 16.5h4" />
              </svg>
            </div>
          )}
        </div>

        <div className="movie-page__details">
          {movie.tagline && (
            <p className="movie-page__tagline">"{movie.tagline}"</p>
          )}

          <h1 className="movie-page__title">{movie.title}</h1>

          <div className="movie-page__meta" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            {movie.voteAverage > 0 && (
              <span style={{ color: 'var(--success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
                {movie.voteAverage.toFixed(1)}/10
              </span>
            )}
            {movie.releaseYear && <span>{movie.releaseYear}</span>}
            {movie.type === 'movie' && movie.runtime > 0 && <span>{formatTime(movie.runtime * 60)}</span>}
            {movie.type === 'tv' && <span>{uniqueSeasons.length} Season{uniqueSeasons.length !== 1 ? 's' : ''}</span>}
            {movie.fileSize > 0 && movie.type === 'movie' && (
              <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>
                </svg>
                {formatSize(movie.fileSize)}
              </span>
            )}
          </div>

          {movie.genres && movie.genres.length > 0 && (
            <div className="movie-page__genres">
              {movie.genres.map((g) => (
                <span className="movie-page__genre-tag" key={g}>{g}</span>
              ))}
            </div>
          )}

          {movie.overview && (
            <p className="movie-page__overview">{movie.overview}</p>
          )}

          <div className="movie-page__actions">
            <Link to={mainAction.url} className="btn btn--primary">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white" style={{ marginRight: '8px' }}>
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              {mainAction.label}
            </Link>
            <Link to="/browse" className="btn btn--secondary">
              ← Back to Library
            </Link>
          </div>

          <div className="movie-page__info-grid">
            {movie.director && (
              <div className="movie-page__info-item">
                <span className="movie-page__info-label">Director / Creator</span>
                <span className="movie-page__info-value">{movie.director}</span>
              </div>
            )}
            {movie.cast && movie.cast.length > 0 && (
              <div className="movie-page__info-item">
                <span className="movie-page__info-label">Cast</span>
                <span className="movie-page__info-value">
                  {movie.cast.slice(0, 6).join(', ')}
                </span>
              </div>
            )}
            {movie.releaseDate && (
              <div className="movie-page__info-item">
                <span className="movie-page__info-label">{movie.type === 'tv' ? 'First Aired' : 'Release Date'}</span>
                <span className="movie-page__info-value">{movie.releaseDate}</span>
              </div>
            )}
            {movie.mimeType && movie.type === 'movie' && (
              <div className="movie-page__info-item">
                <span className="movie-page__info-label">Format</span>
                <span className="movie-page__info-value">{movie.mimeType}</span>
              </div>
            )}
          </div>

          {/* ─── Multi-Part Movies Section ─── */}
          {movie.type === 'movie' && movie.parts && movie.parts.length > 0 && (
            <div className="movie-page__episodes-section">
              <div className="movie-page__episodes-header">
                <h2>Movie Parts</h2>
              </div>

              <div className="movie-page__episodes-list">
                {movie.parts.map(part => (
                  <Link key={part._id} to={`/play/${part._id}`} className="episode-card">
                    <div className="episode-card__image">
                      {part.backdropPath || part.posterPath ? (
                        <img src={part.backdropPath || part.posterPath} alt={`Part ${part.partNumber}`} />
                      ) : (
                        <div className="episode-card__no-image">🎬</div>
                      )}
                      
                      <div className="episode-card__play-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                      </div>

                      {/* Progress Bar */}
                      {part.watchProgress && part.watchProgress.currentTime > 0 && (
                        <div className="episode-card__progress">
                          <div 
                            className="episode-card__progress-bar" 
                            style={{ width: `${(part.watchProgress.currentTime / part.watchProgress.duration) * 100}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <div className="episode-card__details">
                      <div className="episode-card__header">
                        <h4 className="episode-card__title">
                          <span className="episode-card__number">{part.partNumber}</span>
                          {movie.title} - Part {part.partNumber}
                        </h4>
                        <span className="episode-card__runtime">{part.runtime ? `${part.runtime}m` : ''}</span>
                      </div>
                      <p className="episode-card__overview">Continues playback for {movie.title}...</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* ─── Episodes Section (For TV Shows Only) ─── */}
          {movie.type === 'tv' && movie.episodes && movie.episodes.length > 0 && (
            <div className="movie-page__episodes-section">
              <div className="movie-page__episodes-header">
                <h2>Episodes</h2>
                <select 
                  value={selectedSeason} 
                  onChange={(e) => setSelectedSeason(Number(e.target.value))}
                  className="movie-page__season-select"
                >
                  {uniqueSeasons.map(s => (
                    <option key={s} value={s}>Season {s}</option>
                  ))}
                </select>
              </div>

              <div className="movie-page__episodes-list">
                {movie.episodes
                  .filter(e => e.seasonNumber === selectedSeason)
                  .map(ep => (
                  <Link key={ep._id} to={`/play/${ep._id}`} className="episode-card">
                    <div className="episode-card__image">
                      {ep.episodeStillPath ? (
                        <img src={ep.episodeStillPath} alt={ep.episodeTitle || `Episode ${ep.episodeNumber}`} />
                      ) : (
                        <div className="episode-card__no-image">🎬</div>
                      )}
                      
                      <div className="episode-card__play-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                          <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                      </div>

                      {/* Progress Bar */}
                      {ep.watchProgress && ep.watchProgress.currentTime > 0 && (
                        <div className="episode-card__progress">
                          <div 
                            className="episode-card__progress-bar" 
                            style={{ width: `${(ep.watchProgress.currentTime / ep.watchProgress.duration) * 100}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <div className="episode-card__details">
                      <div className="episode-card__header">
                        <h4 className="episode-card__title">
                          <span className="episode-card__number">{ep.episodeNumber}</span>
                          {ep.episodeTitle || `Episode ${ep.episodeNumber}`}
                        </h4>
                        <span className="episode-card__runtime">{ep.runtime ? `${ep.runtime}m` : ''}</span>
                      </div>
                      <p className="episode-card__overview">{ep.episodeOverview || 'No description available.'}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
