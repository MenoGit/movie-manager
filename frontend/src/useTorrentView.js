import { useState, useMemo } from 'react'
import { hasSpanishAudio, readPrefs, prefsActive } from './utils'
import { scoreTorrent, pickBestThree, qualityTag } from './torrentScoring'
import { qualityRank } from './torrentDisplay'

// Shared torrent view-state for MovieModal and TVShowModal: scoring, Best
// Picks, the filter/sort/Spanish pipeline, and tier pinning. The hook is
// domain-agnostic — callers express domain rules (e.g. MovieModal's
// other-year/edition handling) via the exclude predicates:
//
//   excludeFromView(t)  → torrent is hidden from the rendered rows
//   excludeFromPicks(t) → torrent can never receive a Best Pick badge
export default function useTorrentView(torrents, scoringContext, opts = {}) {
  const { excludeFromView = null, excludeFromPicks = null } = opts

  const [filterText, setFilterText] = useState('')
  const [sortKey, setSortKey] = useState('smart')
  const [spanishOnly, setSpanishOnly] = useState(false)
  // Read prefs at mount; no need to react to changes mid-modal since closing
  // the SettingsOverlay and reopening a modal re-reads on next mount.
  const prefs = useMemo(() => readPrefs(), [])
  const prefsOn = useMemo(() => prefsActive(prefs), [prefs])

  const scored = useMemo(
    () => torrents.map(t => ({ ...t, _score: scoreTorrent(t, scoringContext) })),
    [torrents, scoringContext]
  )

  const viewScored = useMemo(
    () => excludeFromView ? scored.filter(t => !excludeFromView(t)) : scored,
    [scored, excludeFromView]
  )
  const pickableScored = useMemo(
    () => excludeFromPicks ? scored.filter(t => !excludeFromPicks(t)) : scored,
    [scored, excludeFromPicks]
  )

  const bestPicks = useMemo(
    () => pickBestThree(pickableScored, scoringContext),
    [pickableScored, scoringContext]
  )
  // Quick title lookup for row rendering
  const pickTitleMap = useMemo(() => {
    const m = new Map()
    if (bestPicks.quality) m.set(bestPicks.quality.title, 'quality')
    if (bestPicks.value)   m.set(bestPicks.value.title, 'value')
    if (bestPicks.budget)  m.set(bestPicks.budget.title, 'budget')
    return m
  }, [bestPicks])

  const showLowQualityWarning = useMemo(() => {
    if (torrents.length === 0) return false
    const topBySeeds = [...torrents]
      .sort((a, b) => (b.seeders || 0) - (a.seeders || 0))
      .slice(0, 5)
    return topBySeeds.filter(t => {
      const q = qualityTag(t.title)
      return q === 'CAM' || q === 'TS'
    }).length >= 2
  }, [torrents])

  const visibleTorrents = useMemo(() => {
    let arr = viewScored
    if (filterText.trim()) {
      const q = filterText.toLowerCase()
      arr = arr.filter(t => (t.title || '').toLowerCase().includes(q))
    }
    if (spanishOnly) arr = arr.filter(t => hasSpanishAudio(t.title))
    const sorter = (a, b) => {
      switch (sortKey) {
        case 'smart': return b._score.score - a._score.score
        case 'seeds': return (b.seeders || 0) - (a.seeders || 0)
        case 'size-asc': return (a.size || 0) - (b.size || 0)
        case 'size-desc': return (b.size || 0) - (a.size || 0)
        case 'quality': return qualityRank(b.title) - qualityRank(a.title)
        default: return 0
      }
    }
    const sorted = [...arr].sort(sorter)
    // If user has a preferred tier, pin it FIRST then the rest in default order
    const tierOrder = prefs.preferredTier && prefs.preferredTier !== 'any'
      ? [prefs.preferredTier, ...['quality', 'value', 'budget'].filter(x => x !== prefs.preferredTier)]
      : ['quality', 'value', 'budget']
    const pinned = tierOrder
      .map(tier => bestPicks[tier])
      .filter(Boolean)
      .map(pick => sorted.find(t => t.title === pick.title))
      .filter(Boolean)
    const rest = sorted.filter(t => !pickTitleMap.has(t.title))
    return [...pinned, ...rest]
  }, [viewScored, filterText, sortKey, spanishOnly, bestPicks, pickTitleMap, prefs.preferredTier])

  return {
    filterText, setFilterText,
    sortKey, setSortKey,
    spanishOnly, setSpanishOnly,
    prefs, prefsOn,
    scored, bestPicks, pickTitleMap,
    visibleTorrents, showLowQualityWarning,
  }
}
