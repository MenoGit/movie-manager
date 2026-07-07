import { useState } from 'react'
import { Check, Film, Sparkles } from 'lucide-react'
import { isInTheaters, hasSpanish, libraryProgressLabel } from '../utils'
import { rememberPosterOrigin } from '../heroMorph'

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
  const [imgLoaded, setImgLoaded] = useState(false)

  return (
    <div
      className="movie-card"
      onClick={(e) => {
        rememberPosterOrigin(e.currentTarget.querySelector('.movie-card-poster'))
        onClick(movie)
      }}
    >
      <div className="movie-card-poster">
        {movie.poster_url && !imgError ? (
          <>
            {!imgLoaded && <div className="movie-card-skeleton skeleton" />}
            <img
              src={movie.poster_url}
              alt={movie.title}
              className={imgLoaded ? 'loaded' : ''}
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
            />
          </>
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
        {movie.in_library && movie.library_progress && (
          <div className={`movie-card-progress ${movie.library_progress.complete ? 'complete' : ''}`}>
            {libraryProgressLabel(movie.library_progress)}
          </div>
        )}
      </div>

      <style>{`
        .movie-card {
          cursor: pointer;
          transition: transform var(--dur) var(--ease);
        }
        .movie-card:hover {
          transform: translateY(-6px) scale(1.02);
        }
        .movie-card-poster {
          position: relative;
          aspect-ratio: 2/3;
          overflow: hidden;
          background: var(--surface);
          border-radius: var(--radius);
          box-shadow: var(--shadow-1);
          transition: box-shadow var(--dur) var(--ease);
        }
        .movie-card:hover .movie-card-poster {
          box-shadow: var(--shadow-lift);
        }
        .movie-card-poster img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          opacity: 0;
          transition: transform var(--dur-slow) var(--ease), opacity var(--dur-slow) var(--ease);
        }
        .movie-card-poster img.loaded { opacity: 1; }
        .movie-card:hover .movie-card-poster img {
          transform: scale(1.06);
        }
        .movie-card-skeleton {
          position: absolute;
          inset: 0;
          border-radius: var(--radius);
        }
        .movie-card-no-poster {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          text-align: center;
          font-family: 'Bebas Neue', sans-serif;
          font-size: 18px;
          letter-spacing: 0.05em;
          line-height: 1.2;
          color: var(--text-faint);
          background:
            radial-gradient(120% 90% at 50% 0%, var(--surface2), var(--surface) 75%);
        }
        .in-library-badge {
          position: absolute;
          top: 8px;
          left: 8px;
          background: rgba(20, 50, 38, 0.72);
          color: var(--green);
          border: 1px solid rgba(62, 207, 142, 0.45);
          backdrop-filter: blur(6px);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
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
          background: rgba(58, 18, 18, 0.72);
          color: #ff8f8f;
          border: 1px solid rgba(232, 85, 85, 0.45);
          backdrop-filter: blur(6px);
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          padding: 3px 7px;
          border-radius: 20px;
          display: flex;
          align-items: center;
          gap: 3px;
          letter-spacing: 0.06em;
        }
        .fresh-rip-badge {
          position: absolute;
          top: 8px;
          right: 8px;
          background: rgba(16, 34, 66, 0.72);
          color: #7db4ff;
          border: 1px solid rgba(59, 130, 246, 0.5);
          backdrop-filter: blur(6px);
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          padding: 3px 7px;
          border-radius: 20px;
          display: flex;
          align-items: center;
          gap: 3px;
          letter-spacing: 0.06em;
          box-shadow: 0 0 14px rgba(59, 130, 246, 0.35);
        }
        .movie-card-overlay {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: linear-gradient(transparent, rgba(4, 4, 8, 0.85));
          padding: 28px 10px 9px;
          display: flex; align-items: center; justify-content: space-between; gap: 6px;
          opacity: 0.9;
          transition: opacity var(--dur) var(--ease);
        }
        .movie-card:hover .movie-card-overlay { opacity: 1; }
        .movie-card-rating {
          font-size: 12.5px;
          color: var(--accent-bright);
          font-weight: 700;
          letter-spacing: 0.02em;
          text-shadow: 0 1px 4px rgba(0,0,0,0.8);
        }
        .movie-card-spanish {
          background: rgba(88, 28, 135, 0.75);
          border: 1px solid rgba(168, 85, 247, 0.5);
          color: #d8b4fe;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.08em;
          padding: 2px 5px;
          border-radius: 4px;
        }
        .movie-card-info {
          padding: 10px 4px 12px;
        }
        .movie-card-title {
          font-size: 13.5px;
          font-weight: 600;
          line-height: 1.3;
          letter-spacing: 0.005em;
          margin-bottom: 3px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          transition: color var(--dur-fast) var(--ease);
        }
        .movie-card:hover .movie-card-title { color: var(--accent-bright); }
        .movie-card-year {
          font-size: 12px;
          color: var(--text-muted);
          letter-spacing: 0.03em;
        }
        .movie-card-progress {
          font-size: 11px;
          color: var(--accent);
          margin-top: 4px;
          font-weight: 600;
          letter-spacing: 0.02em;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .movie-card-progress.complete { color: var(--green); }
        @media (max-width: 480px) {
          .movie-card-info { padding: 8px 2px 10px; }
          .movie-card-title { font-size: 12px; }
          .movie-card-year { font-size: 11px; }
          .movie-card-rating { font-size: 12px; }
          .in-library-badge { font-size: 9px; padding: 2px 6px; }
        }
      `}</style>
    </div>
  )
}
