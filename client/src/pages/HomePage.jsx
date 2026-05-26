import { useState, useEffect } from 'react';
import { getLibrary, getContinueWatching, getWatchlist } from '../api/client';
import HeroBanner from '../components/HeroBanner';
import MediaGrid from '../components/MediaGrid';
import { SkeletonRow, EmptyState } from '../components/Loader';

export default function HomePage() {
  const [movies, setMovies] = useState([]);

  const [loading, setLoading] = useState(true);
  const [heroMovie, setHeroMovie] = useState(null);
  const [watchlist, setWatchlist] = useState([]);
  const [continueWatching, setContinueWatching] = useState([]);

  useEffect(() => {
    async function fetchData() {
      try {
        const library = await getLibrary({ sort: 'addedAt', order: 'desc' });

        setMovies(library);

        // Pick a random movie with a backdrop for the hero
        const candidates = library.filter((m) => m.backdropPath);
        if (candidates.length > 0) {
          setHeroMovie(candidates[Math.floor(Math.random() * candidates.length)]);
        } else if (library.length > 0) {
          setHeroMovie(library[0]);
        }

        try {
          const cw = await getContinueWatching();
          setContinueWatching(cw);
        } catch(e) {}
        
        try {
          const wl = await getWatchlist();
          setWatchlist(wl);
        } catch(e) {}
      } catch (err) {
        console.error('Failed to fetch library:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  // Group movies by genre
  const genreGroups = {};
  movies.forEach((movie) => {
    (movie.genres || []).forEach((genre) => {
      if (!genreGroups[genre]) genreGroups[genre] = [];
      if (genreGroups[genre].length < 15) {
        genreGroups[genre].push(movie);
      }
    });
  });

  // Get recently added
  const recentlyAdded = movies.slice(0, 15);

  // Get top rated
  const topRated = [...movies]
    .sort((a, b) => (b.voteAverage || 0) - (a.voteAverage || 0))
    .slice(0, 15);

  if (loading) {
    return (
      <div>
        <div className="hero" style={{ background: 'var(--bg-secondary)' }}>
          <div className="hero__content">
            <div className="skeleton" style={{ width: 120, height: 24, marginBottom: 16 }} />
            <div className="skeleton" style={{ width: 400, height: 48, marginBottom: 16 }} />
            <div className="skeleton" style={{ width: 300, height: 16, marginBottom: 8 }} />
            <div className="skeleton" style={{ width: 500, height: 60, marginBottom: 24 }} />
          </div>
        </div>
        <div className="section">
          <div className="section__header">
            <div className="skeleton" style={{ width: 200, height: 24 }} />
          </div>
          <SkeletonRow />
        </div>
      </div>
    );
  }

  if (movies.length === 0) {
    return (
      <div style={{ paddingTop: 'var(--navbar-height)' }}>
        <EmptyState
          icon={
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 20h.01" />
              <path d="M2 8.82a15 15 0 0 1 20 0" />
              <path d="M5 12.86a10 10 0 0 1 14 0" />
              <path d="M8.5 16.43a5 5 0 0 1 7 0" />
            </svg>
          }
          title="No movies yet"
          subtitle='Upload movies to your Telegram channel, then click "Sync" in the navbar to index them.'
        />
      </div>
    );
  }

  return (
    <div id="home-page">
      <HeroBanner movie={heroMovie} />

      {/* Continue Watching */}
      {continueWatching.length > 0 && (
        <section className="section">
          <div className="section__header">
            <h2 className="section__title">
              Continue <span>Watching</span>
            </h2>
          </div>
          <MediaGrid movies={continueWatching} layout="row" />
        </section>
      )}

      {/* Watchlist */}
      {watchlist.length > 0 && (
        <section className="section">
          <div className="section__header">
            <h2 className="section__title">
              My <span>List</span>
            </h2>
          </div>
          <MediaGrid movies={watchlist} layout="row" />
        </section>
      )}      {/* Recently Added */}
      {recentlyAdded.length > 0 && (
        <section className="section">
          <div className="section__header">
            <h2 className="section__title">
              Recently <span>Added</span>
            </h2>
          </div>
          <MediaGrid movies={recentlyAdded} layout="row" />
        </section>
      )}

      {/* Top Rated */}
      {topRated.length > 0 && (
        <section className="section">
          <div className="section__header">
            <h2 className="section__title">
              Top <span>Rated</span>
            </h2>
          </div>
          <MediaGrid movies={topRated} layout="row" />
        </section>
      )}

      {/* Genre Rows */}
      {Object.entries(genreGroups)
        .sort(([, a], [, b]) => b.length - a.length)
        .slice(0, 6)
        .map(([genre, genreMovies]) => (
          <section className="section" key={genre}>
            <div className="section__header">
              <h2 className="section__title">{genre}</h2>
            </div>
            <MediaGrid movies={genreMovies} layout="row" />
          </section>
        ))}
    </div>
  );
}
