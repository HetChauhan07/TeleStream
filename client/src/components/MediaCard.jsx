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
          <div className="media-card__no-poster">🎬</div>
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
            <span className="media-card__rating">⭐ {movie.voteAverage}</span>
          )}
        </div>
      </div>
    </div>
  );
}
