import { qualityTag } from './torrentScoring'

// Display-only helpers shared by MovieModal and TVShowModal. Scoring + tier
// logic lives in ./torrentScoring; these are trivial presentation utilities.

export function formatSize(bytes) {
  if (!bytes) return '?'
  const gb = bytes / 1024 / 1024 / 1024
  return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(bytes / 1024 / 1024).toFixed(0)} MB`
}

const TAG_RANK = { '4K': 5, 'BluRay': 4, 'WEB-DL': 3, 'WEBRip': 2, 'HDTV': 1, 'Unknown': 1, 'TS': 0, 'CAM': 0 }
export function qualityRank(title) { return TAG_RANK[qualityTag(title)] ?? 1 }
export function tagClass(tag) { return tag.toLowerCase().replace(/[^a-z0-9]/g, '') }

export function ratioInfo(t) {
  const s = t.seeders || 0
  const p = t.leechers || 0
  const r = p === 0 ? (s > 0 ? Infinity : 0) : s / p
  let bucket
  if (s >= 20 && r >= 3) bucket = 'fast'
  else if (s >= 5 || r >= 2) bucket = 'decent'
  else bucket = 'slow'
  return { ratio: r, bucket, seeds: s, peers: p }
}

export const SORTS = [
  { id: 'smart', label: 'Smart' },
  { id: 'seeds', label: 'Seeders' },
  { id: 'size-desc', label: 'Size ↓' },
  { id: 'size-asc', label: 'Size ↑' },
  { id: 'quality', label: 'Quality' },
]
