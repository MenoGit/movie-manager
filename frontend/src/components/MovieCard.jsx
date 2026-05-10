import { useState } from 'react'
import { Check } from 'lucide-react'

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
        <div className="movie-card-overlay">
          <div className="movie-card-rating">★ {movie.vote_average?.toFixed(1)}</div>
        </div>
      </div>
      <div className="movie-card-info">
        <div className="movie-card-title">{movie.title}</div>
        <div className="movie-card-year">
          {movie.release_date?.split('-')[0]}
        </div>
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
        .movie-card-overlay {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: linear-gradient(transparent, rgba(0,0,0,0.8));
          padding: 20px 10px 10px;
        }
        .movie-card-rating {
          font-size: 13px;
          color: var(--accent);
          font-weight: 600;
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
      `}</style>
    </div>
  )
}
