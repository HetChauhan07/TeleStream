import axios from 'axios';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMG_BASE = 'https://image.tmdb.org/t/p';

function getApiKey() {
  const key = process.env.TMDB_API_KEY;
  if (!key || key === 'your_tmdb_api_key_here') {
    console.warn('TMDB_API_KEY not configured — metadata lookup disabled');
    return null;
  }
  return key;
}

/**
 * Search TMDB for a movie or tv show by title (and optional year).
 */
export async function searchMedia(title, year = null, type = 'movie') {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  try {
    const params = {
      api_key: apiKey,
      query: title,
      include_adult: false,
    };
    // TMDB expects first_air_date_year for TV shows
    if (year) {
      if (type === 'tv') params.first_air_date_year = year;
      else params.year = year;
    }

    const endpoint = type === 'tv' ? '/search/tv' : '/search/movie';
    const { data } = await axios.get(`${TMDB_BASE}${endpoint}`, { params });

    if (data.results && data.results.length > 0) {
      return data.results[0]; // Best match
    }
    return null;
  } catch (err) {
    console.error(`TMDB search failed for "${title}":`, err.message);
    return null;
  }
}

/**
 * Get full movie or tv details including credits (cast/crew).
 */
export async function getMediaDetails(tmdbId, type = 'movie') {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  try {
    const endpoint = type === 'tv' ? `/tv/${tmdbId}` : `/movie/${tmdbId}`;
    const { data } = await axios.get(`${TMDB_BASE}${endpoint}`, {
      params: {
        api_key: apiKey,
        append_to_response: 'credits',
      },
    });

    // Extract top 10 cast members
    const cast = (data.credits?.cast || [])
      .slice(0, 10)
      .map((c) => c.name);

    // Extract director or creator
    let director = '';
    if (type === 'movie') {
      director = (data.credits?.crew || []).find((c) => c.job === 'Director')?.name || '';
    } else {
      director = (data.created_by && data.created_by.length > 0) ? data.created_by[0].name : '';
    }

    // Standardize title and release date fields differences between movie and tv
    const title = type === 'tv' ? data.name : data.title;
    const originalTitle = type === 'tv' ? data.original_name : data.original_title;
    const releaseDate = type === 'tv' ? data.first_air_date : data.release_date;
    const runtime = type === 'tv' ? (data.episode_run_time?.[0] || 0) : (data.runtime || 0);

    return {
      type,
      tmdbId: data.id,
      title,
      originalTitle,
      overview: data.overview || '',
      tagline: data.tagline || '',
      posterPath: data.poster_path ? `${IMG_BASE}/w500${data.poster_path}` : '',
      backdropPath: data.backdrop_path ? `${IMG_BASE}/original${data.backdrop_path}` : '',
      genres: (data.genres || []).map((g) => g.name),
      releaseDate: releaseDate || '',
      releaseYear: releaseDate ? parseInt(releaseDate.split('-')[0]) : null,
      runtime,
      voteAverage: Math.round((data.vote_average || 0) * 10) / 10,
      cast,
      director,
    };
  } catch (err) {
    console.error(`TMDB details failed for ${type} ID ${tmdbId}:`, err.message);
    return null;
  }
}

/**
 * Get specific episode details for a TV show
 */
export async function getEpisodeDetails(tmdbId, seasonNumber, episodeNumber) {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  try {
    const { data } = await axios.get(`${TMDB_BASE}/tv/${tmdbId}/season/${seasonNumber}/episode/${episodeNumber}`, {
      params: { api_key: apiKey },
    });

    return {
      episodeTitle: data.name || '',
      episodeOverview: data.overview || '',
      episodeStillPath: data.still_path ? `${IMG_BASE}/w500${data.still_path}` : '',
    };
  } catch (err) {
    console.error(`TMDB episode details failed for ID ${tmdbId} S${seasonNumber}E${episodeNumber}:`, err.message);
    return null;
  }
}

/**
 * Parse a filename to extract title, year, and TV series metadata.
 * Detects patterns like "Show Name S01E01"
 */
export function parseFileName(fileName) {
  if (!fileName) return { type: 'movie', title: 'Unknown', year: null };

  // Remove file extension
  let name = fileName.replace(/\.[^/.]+$/, '');
  
  let type = 'movie';
  let seasonNumber = null;
  let episodeNumber = null;

  // TV Series Pattern detection (S01E01 or S1E1 or S01E01-E02)
  const tvPattern = /([sS](\d{1,2})[eE](\d{1,2}))/;
  const tvMatch = name.match(tvPattern);
  
  if (tvMatch) {
    type = 'tv';
    seasonNumber = parseInt(tvMatch[2], 10);
    episodeNumber = parseInt(tvMatch[3], 10);
    // Strip everything from the S01E01 tag onwards to get just the show name
    name = name.substring(0, tvMatch.index).trim();
  }

  // Multi-Part Movie Pattern detection
  // Priority: cd/disc first (file splits), then part/pt as fallback
  let partNumber = 0;
  if (type === 'movie') {
    const cdPattern = /\b(?:cd|disc)\s*[-_]?\s*(\d{1,2})\b/i;
    const cdMatch = name.match(cdPattern);

    if (cdMatch) {
      partNumber = parseInt(cdMatch[1], 10);
      name = name.replace(cdPattern, '').trim();
    } else {
      const partPattern = /\b(?:part|pt)\s*[-_]?\s*(\d{1,2})\b/i;
      const partMatch = name.match(partPattern);
      if (partMatch) {
        partNumber = parseInt(partMatch[1], 10);
        name = name.replace(partPattern, '').trim();
      }
    }
  }

  // Remove common tags
  name = name
    .replace(/[\[\(](.*?)[\]\)]/g, (match, content) => {
      // Keep year in parentheses
      if (/^\d{4}$/.test(content.trim())) return match;
      return '';
    })
    .replace(
      /\b(1080p|720p|480p|2160p|4k|uhd|hdr|bluray|blu-ray|brrip|bdrip|webrip|web-dl|webdl|hdtv|dvdrip|x264|x265|h264|h265|hevc|aac|dts|ac3|atmos|remux|proper|repack|extended|unrated|directors\.cut|dc|theatrical|imax)\b/gi,
      ''
    )
    .replace(/[._]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Extract year
  const yearMatch = name.match(/[\(\[]?(\d{4})[\)\]]?/);
  let year = null;
  if (yearMatch) {
    const y = parseInt(yearMatch[1]);
    if (y >= 1900 && y <= 2030) {
      year = y;
      name = name.replace(yearMatch[0], '').trim();
    }
  }

  // Clean up remaining artifacts
  name = name.replace(/[-–—]\s*$/, '').replace(/\s+/g, ' ').trim();

  return { 
    type, 
    title: name || 'Unknown', 
    year, 
    seasonNumber, 
    episodeNumber,
    partNumber
  };
}
