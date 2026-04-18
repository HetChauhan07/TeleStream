import { useNavigate } from 'react-router-dom';

export default function MediaCard({ movie, index = 0 }) {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/movie/${movie._id}`);
  };



  return (
    <div
      className="media-card"
      onClick={handleClick}
      style={{ animationDelay: `${index * 50}ms` }}
      id={`media-card-${movie._id}`}
    >
      <div className="media-card__poster-wrap">
        {movie.posterPath ? (
          <img
            className="media-card__poster"
            src={movie.posterPath}
            alt={movie.title}
            loading="lazy"
          />
        ) : (
          <div className="media-card__no-poster"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M7 3v18" /><path d="M3 7.5h4" /><path d="M3 12h18" /><path d="M3 16.5h4" /><path d="M17 3v18" /><path d="M17 7.5h4" /><path d="M17 16.5h4" /></svg></div>
        )}

        <div className="media-card__overlay">
          <div className="media-card__play-icon">
            <svg viewBox="0 0 24 24">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </div>
        </div>

      </div>

      <div className="media-card__info">
        <div className="media-card__title" title={movie.title}>
          {movie.title}
        </div>
        <div className="media-card__meta">
          {movie.releaseYear && <span>{movie.releaseYear}</span>}
          {movie.voteAverage > 0 && (
            <span className="media-card__rating"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '3px', verticalAlign: 'middle' }}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>{movie.voteAverage}</span>
          )}
        </div>
      </div>
    </div>
  );
}
