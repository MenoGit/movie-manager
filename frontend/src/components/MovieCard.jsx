import { useState } from 'react'
import { Check, Film, Sparkles } from 'lucide-react'
import { isInTheaters, hasSpanish, plexProgressLabel } from '../utils'

const STREAMING_LOGOS = {
  8: 'Netflix',
  337: 'Disney+',
  9: 'Prime Video',
  384: 'HBO Max',
  15: 'Hulu',
  386: 'Peacock',
  2: 'Apple TV+',
}

export default function MovieCard({ movie, onClick }) {
  const [imgError, setImgError] = useState(false)

  return (
    <div className="movie-card" onClick={() => onClick(movie)}>
      <div className="movie-card-poster">
        {movie.poster_url && !imgError ? (
          <img
            src={movie.poster_url}
            alt={movie.title}
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="movie-card-no-poster">{movie.title}</div>
        )}
        {movie.in_library && (
          <div className="in-library-badge">
            <Check size={12} /> In Library
          </div>
        )}
        {!movie.in_library && movie.fresh_rip && (
          <div className="fresh-rip-badge" title="Quality WEB-DL or BluRay rip recently became available">
            <Sparkles size={11} /> New Rip
          </div>
        )}
        {!movie.in_library && !movie.fresh_rip && isInTheaters(movie) && (
          <div className="in-theaters-badge" title="Likely still in theaters — quality rips may not be available yet">
            <Film size={11} /> In Theaters
          </div>
        )}
        <div className="movie-card-overlay">
          <div className="movie-card-rating">★ {movie.vote_average?.toFixed(1)}</div>
          {hasSpanish(movie) && (
            <span className="movie-card-spanish" title="Originally Spanish-language film">ES</span>
          )}
        </div>
      </div>
      <div className="movie-card-info">
        <div className="movie-card-title">{movie.title}</div>
        <div className="movie-card-year">
          {movie.release_date?.split('-')[0]}
        </div>
        {movie.in_library && movie.plex_progress && (
          <div className={`movie-card-progress ${movie.plex_progress.complete ? 'complete' : ''}`}>
            {plexProgressLabel(movie.plex_progress)}
          </div>
        )}
      </div>

      <style>{`
        .movie-card {
          cursor: pointer;
          border-radius: var(--radius);
          overflow: hidden;
          background: var(--surface);
          border: 1px solid var(--border);
          transition: transform 0.2s, border-color 0.2s, box-shadow 0.2s;
        }
        .movie-card:hover {
          transform: translateY(-4px);
          border-color: var(--accent);
          box-shadow: 0 8px 32px rgba(232, 160, 48, 0.15);
        }
        .movie-card-poster {
          position: relative;
          aspect-ratio: 2/3;
          overflow: hidden;
          background: var(--surface2);
        }
        .movie-card-poster img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.3s;
        }
        .movie-card:hover .movie-card-poster img {
          transform: scale(1.04);
        }
        .movie-card-no-poster {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 12px;
          text-align: center;
          font-size: 13px;
          color: var(--text-muted);
        }
        .in-library-badge {
          position: absolute;
          top: 8px;
          left: 8px;
          background: var(--green);
          color: #000;
          font-size: 11px;
          font-weight: 600;
          padding: 3px 8px;
          border-radius: 20px;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .in-theaters-badge {
          position: absolute;
          top: 8px;
          right: 8px;
          background: var(--red);
          color: #fff;
          font-size: 10px;
          font-weight: 600;
          padding: 3px 7px;
          border-radius: 20px;
          display: flex;
          align-items: center;
          gap: 3px;
          letter-spacing: 0.02em;
        }
        .fresh-rip-badge {
          position: absolute;
          top: 8px;
          right: 8px;
          background: #3b82f6;
          color: #fff;
          font-size: 10px;
          font-weight: 600;
          padding: 3px 7px;
          border-radius: 20px;
          display: flex;
          align-items: center;
          gap: 3px;
          letter-spacing: 0.02em;
          box-shadow: 0 0 12px rgba(59,130,246,0.45);
        }
        .movie-card-overlay {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: linear-gradient(transparent, rgba(0,0,0,0.8));
          padding: 20px 10px 10px;
          display: flex; align-items: center; justify-content: space-between; gap: 6px;
        }
        .movie-card-rating {
          font-size: 13px;
          color: var(--accent);
          font-weight: 600;
        }
        .movie-card-spanish {
          background: #a855f7;
          color: #fff;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.05em;
          padding: 2px 5px;
          border-radius: 3px;
        }
        .movie-card-info {
          padding: 10px 12px 12px;
        }
        .movie-card-title {
          font-size: 13px;
          font-weight: 500;
          line-height: 1.3;
          margin-bottom: 4px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .movie-card-year {
          font-size: 12px;
          color: var(--text-muted);
        }
        .movie-card-progress {
          font-size: 11px;
          color: var(--accent);
          margin-top: 4px;
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .movie-card-progress.complete { color: var(--green); }
        @media (max-width: 480px) {
          .movie-card-info { padding: 8px 10px 10px; }
          .movie-card-title { font-size: 12px; }
          .movie-card-year { font-size: 11px; }
          .movie-card-rating { font-size: 12px; }
          .in-library-badge { font-size: 10px; padding: 2px 6px; }
        }
      `}</style>
    </div>
  )
}
