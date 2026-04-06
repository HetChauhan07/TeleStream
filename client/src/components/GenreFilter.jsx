export default function GenreFilter({ genres, selected, onSelect }) {
  return (
    <div className="genre-filter" id="genre-filter">
      <button
        className={`genre-chip ${!selected ? 'active' : ''}`}
        onClick={() => onSelect(null)}
      >
        All
      </button>
      {genres.map((genre) => (
        <button
          key={genre}
          className={`genre-chip ${selected === genre ? 'active' : ''}`}
          onClick={() => onSelect(genre === selected ? null : genre)}
        >
          {genre}
        </button>
      ))}
    </div>
  );
}
