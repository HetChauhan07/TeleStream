import { useState, useEffect, useCallback } from 'react';
import { getLibrary, getGenres } from '../api/client';
import MediaGrid from '../components/MediaGrid';
import SearchBar from '../components/SearchBar';
import GenreFilter from '../components/GenreFilter';
import { SkeletonGrid, EmptyState } from '../components/Loader';

export default function BrowsePage() {
  const [movies, setMovies] = useState([]);
  const [genres, setGenresState] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedGenre, setSelectedGenre] = useState(null);
  const [sort, setSort] = useState('addedAt');
  const [sortOrder, setSortOrder] = useState('desc');

  const fetchMovies = useCallback(async () => {
    setLoading(true);
    try {
      const params = { sort, order: sortOrder };
      if (search) params.q = search;
      if (selectedGenre) params.genre = selectedGenre;

      const data = await getLibrary(params);
      setMovies(data);
    } catch (err) {
      console.error('Failed to fetch movies:', err);
    } finally {
      setLoading(false);
    }
  }, [search, selectedGenre, sort, sortOrder]);

  useEffect(() => {
    fetchMovies();
  }, [fetchMovies]);

  useEffect(() => {
    getGenres()
      .then(setGenresState)
      .catch(() => {});
  }, []);

  const handleSortChange = (e) => {
    const val = e.target.value;
    if (val === 'title-asc') {
      setSort('title');
      setSortOrder('asc');
    } else if (val === 'rating') {
      setSort('voteAverage');
      setSortOrder('desc');
    } else if (val === 'year') {
      setSort('releaseYear');
      setSortOrder('desc');
    } else {
      setSort('addedAt');
      setSortOrder('desc');
    }
  };

  return (
    <div className="browse-page" id="browse-page">
      <div className="browse-page__header">
        <h1 className="browse-page__title">Browse Library</h1>
        <div className="browse-page__controls">
          <SearchBar value={search} onChange={setSearch} />
          <select
            className="browse-page__sort"
            onChange={handleSortChange}
            value={sort === 'title' ? 'title-asc' : sort === 'voteAverage' ? 'rating' : sort === 'releaseYear' ? 'year' : 'addedAt'}
            id="sort-select"
          >
            <option value="addedAt">Recently Added</option>
            <option value="title-asc">Title A–Z</option>
            <option value="rating">Highest Rated</option>
            <option value="year">Newest Release</option>
          </select>
        </div>
      </div>

      {genres.length > 0 && (
        <GenreFilter
          genres={genres}
          selected={selectedGenre}
          onSelect={setSelectedGenre}
        />
      )}

      <div className="browse-page__results">
        {!loading && `${movies.length} movie${movies.length !== 1 ? 's' : ''} found`}
      </div>

      {loading ? (
        <SkeletonGrid count={12} />
      ) : movies.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="No results"
          subtitle={
            search
              ? `No movies found for "${search}"`
              : 'No movies match the selected filters.'
          }
        />
      ) : (
        <MediaGrid movies={movies} layout="grid" />
      )}
    </div>
  );
}
