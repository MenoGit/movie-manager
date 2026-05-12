/**
 * Shared torrent scoring + best-pick logic for MovieModal and TVShowModal.
 *
 * Three tiers (Quality / Value / Budget) with size brackets that vary by
 * content type:
 *   - Movies: fixed brackets
 *   - TV episodes: 4 runtime buckets (short / standard / long / extra-long)
 *   - TV season packs: per-episode bracket × episode count
 *
 * Scoring runs the same algorithm in every tier; what differs is which
 * torrents are eligible based on their size.
 */

const GB = 1024 ** 3
const MB = 1024 ** 2

// ─── Title parsing ────────────────────────────────────────────────────────

export function parseRelease(title) {
  const s = (title || '').toUpperCase()

  const resolution =
    /2160P|\b4K\b|\bUHD\b/.test(s) ? '4K' :
    /1080P/.test(s) ? '1080p' :
    /720P/.test(s) ? '720p' :
    /480P/.test(s) ? '480p' :
    'other'

  const isRemux = /\bREMUX\b/.test(s)
  const source =
    /\bHDCAM\b|\bCAM(?:RIP)?\b/.test(s) ? 'CAM' :
    /\b(?:TELESYNC|HDTS)\b|\bTS\b/.test(s) ? 'TS' :
    /BLU.?RAY|\bBDRIP\b|\bBRRIP\b|\bBDR\b|\bREMUX\b/.test(s) ? 'BluRay' :
    /\bWEB[-.]?DL\b|\bWEBDL\b/.test(s) ? 'WEB-DL' :
    /\bWEB.?RIP\b/.test(s) ? 'WEBRip' :
    /\bHDTV\b|\bPDTV\b|\bDVB\b/.test(s) ? 'HDTV' :
    'Unknown'

  const audio =
    /\bATMOS\b/.test(s) ? 'Atmos' :
    /DTS[-.]?HD|DTS[-.]?MA|TRUEHD/.test(s) ? 'DTS-HD/TrueHD' :
    /DDP5\.?1|DD\+|EAC3/.test(s) ? 'DDP5.1' :
    /\bDTS\b/.test(s) ? 'DTS' :
    /AAC5\.?1|AAC\.?5\.?1/.test(s) ? 'AAC5.1' :
    /\bAAC\b/.test(s) ? 'AAC' :
    'Stereo'

  const hdr =
    /DOLBY[\s.-]?VISION|\bDV\b|\bDOVI\b/.test(s) ? 'DV' :
    /HDR10\+|HDR10PLUS/.test(s) ? 'HDR10+' :
    /\bHDR\b|HDR10/.test(s) ? 'HDR10' :
    'SDR'

  const codec =
    /\bAV1\b/.test(s) ? 'AV1' :
    /X265|HEVC|H[\s.]?265/.test(s) ? 'x265' :
    /X264|H[\s.]?264/.test(s) ? 'x264' :
    /MPEG[-.]?[24]|\bXVID\b|\bDIVX\b/.test(s) ? 'MPEG' :
    'unknown'

  const isYTS = /\bYTS(\.MX|\.AG)?\b/.test(s)

  return { resolution, source, audio, hdr, codec, isRemux, isYTS }
}

export function isSeasonPack(title) {
  if (!title) return false
  const t = title.toUpperCase()
  // Explicit episode markers mean single episode, not pack
  if (/S\d{1,2}E\d{1,3}/.test(t)) return false
  if (/\d{1,2}X\d{1,3}/.test(t)) return false
  if (/COMPLETE|SEASON.?PACK|FULL[\s.]+SEASON|\bBATCH\b|COLLECTION/.test(t)) return true
  if (/\bS\d{1,2}\b/.test(t)) return true
  return false
}

// Cosmetic label for the quality chip in row rendering
export function qualityTag(title) {
  const p = parseRelease(title)
  if (p.source === 'CAM' || p.source === 'TS') return p.source
  if (p.resolution === '4K') return '4K'
  return p.source
}

// ─── Score weights ─────────────────────────────────────────────────────────

const SCORE_WEIGHTS = {
  resolution: { '4K': 10, '1080p': 8, '720p': 5, '480p': 2, 'other': 2 },
  source: { 'BluRay': 10, 'WEB-DL': 9, 'WEBRip': 7, 'HDTV': 5, 'TS': 1, 'CAM': 0, 'Unknown': 4 },
  audio: { 'Atmos': 10, 'DTS-HD/TrueHD': 9, 'DDP5.1': 8, 'DTS': 7, 'AAC5.1': 6, 'AAC': 4, 'Stereo': 3 },
  hdr: { 'DV': 10, 'HDR10+': 9, 'HDR10': 8, 'SDR': 3 },
  codec: { 'AV1': 10, 'x265': 8, 'x264': 5, 'MPEG': 2, 'unknown': 3 },
}

// ─── Tier brackets (sizes in GB) ───────────────────────────────────────────

const MOVIE_TIERS = {
  // Hard cap at 25 GB — files above that are excluded from Best Quality
  // entirely. Stops 40-60 GB remux files from earning the badge over a
  // well-encoded 20 GB release that's better for most users.
  quality: { min: 12, max: 25 },
  value:   { min: 4,  max: 12 },
  budget:  { min: 0.7, max: 4 },
}

// Per-episode brackets keyed by runtime bucket
const EP_BRACKETS = {
  short:     { quality: { min: 1.5, maxIdeal: 5  }, value: { min: 0.5, max: 1.5 }, budget: { min: 0.08, max: 0.5 } },
  standard:  { quality: { min: 2.5, maxIdeal: 8  }, value: { min: 0.8, max: 2.5 }, budget: { min: 0.12, max: 0.8 } },
  long:      { quality: { min: 4,   maxIdeal: 12 }, value: { min: 1.5, max: 4   }, budget: { min: 0.2,  max: 1.5 } },
  extraLong: { quality: { min: 6,   maxIdeal: 18 }, value: { min: 2,   max: 6   }, budget: { min: 0.3,  max: 2   } },
}

export function runtimeBucket(runtimeMin) {
  if (runtimeMin < 30) return 'short'
  if (runtimeMin <= 45) return 'standard'
  if (runtimeMin <= 75) return 'long'
  return 'extraLong'
}

function multiplyTiers(tiers, factor) {
  return {
    quality: { min: tiers.quality.min * factor, maxIdeal: tiers.quality.maxIdeal * factor },
    value:   { min: tiers.value.min   * factor, max:      tiers.value.max       * factor },
    budget:  { min: tiers.budget.min  * factor, max:      tiers.budget.max      * factor },
  }
}

/**
 * Determine which tier brackets to apply to a given torrent given the modal
 * context.
 *  - Movies: fixed movie brackets.
 *  - TV episodes (general/episode search): per-runtime bracket; season packs
 *    in the result list still get the multiplied bracket.
 *  - TV season search (user clicked "Search Season N"): ALL torrents get
 *    season-pack thresholds. The user asked for a season; results should be
 *    judged as season-level content regardless of whether each torrent's
 *    title happens to match the pack regex.
 */
function tiersForTorrent(torrent, ctx) {
  if (ctx.mode === 'movie') return MOVIE_TIERS
  const bucket = runtimeBucket(ctx.runtimeMin || 45)
  const base = EP_BRACKETS[bucket]
  const treatAsPack = ctx.isSeasonSearch || isSeasonPack(torrent.title)
  if (treatAsPack) {
    const count = Math.max(1, ctx.episodeCount || 1)
    return multiplyTiers(base, count)
  }
  return base
}

function tierFor(sizeGB, tiers) {
  // Quality has an optional hard `max` (movies use it; TV brackets only set
  // `maxIdeal` for soft penalty and leave `max` undefined → no hard cap).
  const q = tiers.quality
  if (sizeGB >= q.min && (q.max == null || sizeGB <= q.max)) return 'quality'
  if (sizeGB >= tiers.value.min  && sizeGB <= tiers.value.max)  return 'value'
  if (sizeGB >= tiers.budget.min && sizeGB <= tiers.budget.max) return 'budget'
  return null
}

// ─── Scoring ───────────────────────────────────────────────────────────────

function sizeFitBonus(sizeGB, tiers, tier) {
  const bracket = tiers[tier]
  if (!bracket) return 0
  const lo = bracket.min
  // Prefer hard `max` when set (movies); else fall back to `maxIdeal`
  // (TV uses this for a soft penalty above the ideal size).
  const hi = bracket.max ?? bracket.maxIdeal
  if (hi == null) return 0
  if (sizeGB > hi) return -4
  if (sizeGB < lo) return -4
  const mid = (lo + hi) / 2
  const halfRange = (hi - lo) / 2 || 1
  const dist = Math.abs(sizeGB - mid) / halfRange // 0 = center, 1 = edge
  return 2 * (1 - dist) // 2 at center, 0 at edge
}

export function scoreTorrent(t, ctx) {
  const parsed = parseRelease(t.title)
  const tiers = tiersForTorrent(t, ctx)
  const sizeGB = (t.size || 0) / GB

  const seeds = t.seeders || 0
  const peers = t.leechers || 0
  const ratio = peers === 0 ? (seeds > 0 ? Infinity : 0) : seeds / peers
  const isBadSource = parsed.source === 'CAM' || parsed.source === 'TS'
  const eligible = seeds >= 3 && !isBadSource

  // Base quality score from parsed attributes
  let score =
    (SCORE_WEIGHTS.resolution[parsed.resolution] ?? 0) +
    (SCORE_WEIGHTS.source[parsed.source]         ?? 0) +
    (SCORE_WEIGHTS.audio[parsed.audio]           ?? 0) +
    (SCORE_WEIGHTS.hdr[parsed.hdr]               ?? 0) +
    (SCORE_WEIGHTS.codec[parsed.codec]           ?? 0)

  // Seed health: log2(seeds+1), capped at 5
  if (seeds > 0) score += Math.min(Math.log2(seeds + 1), 5)
  // S/P ratio bonus
  if (ratio > 2) score += 2

  // YTS small bonus — known efficient releases (helpful in Budget tier)
  if (parsed.isYTS) score += 1

  const tier = tierFor(sizeGB, tiers)
  if (tier) score += sizeFitBonus(sizeGB, tiers, tier)

  return {
    score: Math.round(score * 10) / 10,
    parsed,
    sizeGB,
    tier,
    eligible,
    seeds,
    peers,
    ratio,
    tiers, // pass through so callers can render boundaries
  }
}

// ─── Best-pick selection ───────────────────────────────────────────────────

export function pickBestThree(scored, ctx = {}) {
  // In season-search mode, only season packs are eligible for Best Pick badges —
  // the user explicitly asked for a season, so individual episodes shouldn't
  // earn the spotlight even when they happen to fit a tier's size band.
  const restrictToPacks = ctx.isSeasonSearch === true
  const pickIn = (tier) => {
    let candidates = scored.filter(t => t._score.eligible && t._score.tier === tier)
    if (restrictToPacks) {
      candidates = candidates.filter(t => isSeasonPack(t.title))
    }
    if (candidates.length === 0) return null
    candidates.sort((a, b) => b._score.score - a._score.score)
    return candidates[0]
  }
  return {
    quality: pickIn('quality'),
    value:   pickIn('value'),
    budget:  pickIn('budget'),
  }
}

// ─── Display helpers ───────────────────────────────────────────────────────

function formatSize(sizeGB) {
  if (sizeGB >= 1) return `${sizeGB.toFixed(2)} GB`
  return `${Math.round(sizeGB * 1024)} MB`
}

export function scoreBreakdown(scoreInfo) {
  const { parsed, sizeGB, seeds } = scoreInfo
  const parts = [
    parsed.resolution,
    parsed.isRemux ? 'BluRay Remux' : parsed.source,
    parsed.audio,
    parsed.hdr,
    parsed.codec,
    formatSize(sizeGB),
    `${seeds} seeds`,
  ]
  if (parsed.isYTS) parts.push('YTS')
  return parts.join(' · ')
}

export function tierContextLabel(ctx, torrent) {
  if (ctx.mode === 'movie') {
    if (ctx.runtimeMin) {
      const h = Math.floor(ctx.runtimeMin / 60)
      const m = ctx.runtimeMin % 60
      const rt = h > 0 ? `${h}h ${m}min` : `${m}min`
      return `feature film — ${rt}`
    }
    return 'feature film'
  }
  // TV
  const bucket = runtimeBucket(ctx.runtimeMin || 45)
  const bucketLabel = {
    short: 'sitcom/anime length',
    standard: 'standard drama',
    long: 'premium/HBO length',
    extraLong: 'movie-length episode',
  }[bucket]
  const isPack = torrent ? isSeasonPack(torrent.title) : false
  // In a season-search context, scoring uses season-pack thresholds even when
  // the individual torrent isn't a pack — make the tooltip reflect that.
  if (ctx.isSeasonSearch || isPack) {
    if (ctx.episodeCount) {
      return `${ctx.episodeCount} eps × ${ctx.runtimeMin}min — season-pack scoring`
    }
    return `season-pack scoring`
  }
  return `${ctx.runtimeMin}min episode — ${bucketLabel}`
}

export const TIER_META = {
  quality: { label: 'Best Quality', icon: '⭐', color: 'gold' },
  value:   { label: 'Best Value',   icon: '⭐', color: 'green' },
  budget:  { label: 'Budget',       icon: '💰', color: 'purple' },
}
