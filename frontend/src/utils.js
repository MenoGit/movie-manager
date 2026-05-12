const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000

/**
 * Best-effort "is the movie likely still theatrical only?" check.
 * Prefers a server-set `theatrical_only` flag (from the detail endpoint, which
 * has full release_dates + watch/providers data). For list/carousel cards
 * where we only have `release_date`, falls back to: released within the past 60 days.
 */
export function isInTheaters(movie) {
  if (movie?.theatrical_only) return true
  const rd = movie?.release_date
  if (!rd) return false
  const ts = Date.parse(rd)
  if (Number.isNaN(ts)) return false
  const age = Date.now() - ts
  return age >= 0 && age < SIXTY_DAYS_MS
}

/**
 * "Does this movie have an official Spanish version?"
 * - List/carousel cards only carry `original_language` (single iso 639-1 code).
 *   When it's 'es', the movie is originally in Spanish (e.g. Roma, Pan's Labyrinth).
 * - Detail endpoint adds `spoken_languages` array — covers multi-language films
 *   that include Spanish scenes alongside other languages.
 * Note: TMDb's spoken_languages does NOT include foreign dubs, so this doesn't
 * detect e.g. an English movie that has a Spanish dub track. For that, users
 * should look at the per-torrent ES audio badge in the modal.
 */
export function hasSpanish(movie) {
  if (!movie) return false
  if (movie.original_language === 'es') return true
  const langs = movie.spoken_languages
  if (Array.isArray(langs) && langs.some(l => l?.iso_639_1 === 'es')) return true
  return false
}

/**
 * Parse a torrent title for Spanish-audio indicators. Conservative on short
 * codes (LAT/SPA/ESP/CAS) by requiring word boundaries; MX needs an audio
 * codec nearby to count.
 */
const SPANISH_LONG = /\b(?:DUAL|MULTI|MULTi|LATINO|SPANISH|CASTELLANO|ESPA[ÑN]OL|DUBBED)\b/i
const SPANISH_SHORT = /\b(?:LAT|SPA|ESP|CAS)\b/i
const MX_WITH_AUDIO = /\bMX[._\- ](?:AC3|AAC|DTS|DDP?|EAC3|TRUEHD|FLAC)\b|(?:AC3|AAC|DTS|DDP?|EAC3|TRUEHD|FLAC)[._\- ]MX\b/i

export function hasSpanishAudio(title) {
  if (!title) return false
  return SPANISH_LONG.test(title) || SPANISH_SHORT.test(title) || MX_WITH_AUDIO.test(title)
}

/**
 * Short card label for a TV show's Plex progress. Backend list endpoints
 * only ship seasons_in_library + episodes_in_library_count (cheap, Plex-only).
 * Detail endpoints additionally have total_episodes, seasons_complete, complete —
 * those drive the modal's richer display.
 */
export function plexProgressLabel(p) {
  if (!p) return null
  if (p.complete) return '✓ Complete'
  const eps = p.episodes_in_library_count || 0
  if (eps === 0) return null
  const seasons = p.seasons_in_library || []
  let label = `${eps} ep${eps === 1 ? '' : 's'}`
  if (seasons.length === 1) label = `S${seasons[0]} · ${label}`
  else if (seasons.length > 1) {
    const lo = Math.min(...seasons)
    const hi = Math.max(...seasons)
    label = `S${lo}-S${hi} · ${label}`
  }
  // If we have totals (detail level), suffix with the fraction
  if (p.total_episodes && p.total_episodes > 0) {
    label = `${eps}/${p.total_episodes} eps`
    if (seasons.length > 1) {
      label = `S${Math.min(...seasons)}-S${Math.max(...seasons)} · ${label}`
    }
  }
  return label
}
