import MediaCard from './MediaCard';

export default function MediaGrid({ movies, layout = 'grid' }) {
  if (!movies || movies.length === 0) return null;

  return (
    <div className={layout === 'row' ? 'media-row' : 'media-grid'}>
      {movies.map((movie, index) => (
        <MediaCard key={movie._id} movie={movie} index={index} />
      ))}
    </div>
  );
}
