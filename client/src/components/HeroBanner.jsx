import { Link } from 'react-router-dom';

export default function HeroBanner({ movie }) {
  if (!movie) return null;

  const backdrop = movie.backdropPath || movie.posterPath;

  return (
    <section className="hero" id="hero-banner">
      <div
        className="hero__backdrop"
        style={{
          backgroundImage: backdrop ? `url(${backdrop})` : 'none',
          backgroundColor: backdrop ? 'transparent' : 'var(--bg-secondary)',
        }}
      />

      <div className="hero__content">
        {movie.voteAverage > 0 && (
          <span className="hero__badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '4px' }}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            {movie.voteAverage} Rating
          </span>
        )}

        <h1 className="hero__title">{movie.title}</h1>

        <div className="hero__meta">
          {movie.releaseYear && (
            <span className="hero__meta-item">{movie.releaseYear}</span>
          )}
          {movie.runtime > 0 && (
            <span className="hero__meta-item">
              {Math.floor(movie.runtime / 60)}h {movie.runtime % 60}m
            </span>
          )}
          {movie.genres && movie.genres.length > 0 && (
            <span className="hero__meta-item">
              {movie.genres.slice(0, 3).join(' • ')}
            </span>
          )}
        </div>

        {movie.overview && (
          <p className="hero__overview">{movie.overview}</p>
        )}

        <div className="hero__actions">
          <Link to={`/play/${movie._id}`} className="btn btn--primary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            {movie.watchProgress && !movie.watchProgress.completed
              ? 'Resume'
              : 'Play'}
          </Link>
          <Link to={`/movie/${movie._id}`} className="btn btn--secondary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            More Info
          </Link>
        </div>
      </div>
    </section>
  );
}
