import { describe, it, expect } from 'vitest'
import {
  parseRelease, isSeasonPack, qualityTag, runtimeBucket,
  speedScore, scoreTorrent, pickBestThree,
} from '../torrentScoring'
import { normalizeScore, letterGrade } from '../components/TorrentDetailPanel'

const GB = 1024 ** 3
const t = (title, sizeGB, seeders, leechers) => ({
  title, size: Math.round(sizeGB * GB), seeders, leechers,
})

// ─── parseRelease ───────────────────────────────────────────────────────────

describe('parseRelease', () => {
  it('detects resolution with word boundaries', () => {
    expect(parseRelease('Movie.2160p.WEB-DL').resolution).toBe('4K')
    expect(parseRelease('Movie 4K HDR').resolution).toBe('4K')
    expect(parseRelease('Movie.UHD.BluRay').resolution).toBe('4K')
    expect(parseRelease('Movie.1080p').resolution).toBe('1080p')
    expect(parseRelease('Movie.720p').resolution).toBe('720p')
    expect(parseRelease('Movie.480p').resolution).toBe('480p')
    expect(parseRelease('Movie.no.res').resolution).toBe('other')
    expect(parseRelease('Movie.X264K.fake').resolution).toBe('other')
  })

  it('detects source with CAM/TS taking priority', () => {
    expect(parseRelease('Movie.HDCAM.x264').source).toBe('CAM')
    expect(parseRelease('Movie.CAMRip').source).toBe('CAM')
    expect(parseRelease('Movie.TELESYNC').source).toBe('TS')
    expect(parseRelease('Movie.HDTS.720p').source).toBe('TS')
    expect(parseRelease('Movie.BluRay').source).toBe('BluRay')
    expect(parseRelease('Movie.BDRip').source).toBe('BluRay')
    expect(parseRelease('Movie.REMUX.2160p').source).toBe('BluRay')
    expect(parseRelease('Movie.WEB-DL').source).toBe('WEB-DL')
    expect(parseRelease('Movie.WEBDL').source).toBe('WEB-DL')
    expect(parseRelease('Movie.WEBRip').source).toBe('WEBRip')
    expect(parseRelease('Show.HDTV').source).toBe('HDTV')
    expect(parseRelease('Show.PDTV').source).toBe('HDTV')
    expect(parseRelease('Movie.1080p.x264').source).toBe('Unknown')
    expect(parseRelease('Movie.DVDRip.x264').source).toBe('Unknown')  // known quirk
  })

  it('sets isRemux flag', () => {
    expect(parseRelease('Movie.REMUX').isRemux).toBe(true)
    expect(parseRelease('Movie.BluRay').isRemux).toBe(false)
  })

  it('detects audio with priority order', () => {
    expect(parseRelease('Movie.Atmos.TrueHD').audio).toBe('Atmos')
    expect(parseRelease('Movie.TrueHD.7.1').audio).toBe('DTS-HD/TrueHD')
    expect(parseRelease('Movie.DTS-HD.MA').audio).toBe('DTS-HD/TrueHD')
    expect(parseRelease('Movie.DDP5.1').audio).toBe('DDP5.1')
    expect(parseRelease('Movie.DD+').audio).toBe('DDP5.1')
    expect(parseRelease('Movie.EAC3').audio).toBe('DDP5.1')
    expect(parseRelease('Movie.DTS.x264').audio).toBe('DTS')
    expect(parseRelease('Movie.AAC5.1').audio).toBe('AAC5.1')
    expect(parseRelease('Movie.AAC.x264').audio).toBe('AAC')
    expect(parseRelease('Movie.1080p').audio).toBe('Stereo')
  })

  it('detects HDR with DV word boundaries (DVDRip is not Dolby Vision)', () => {
    expect(parseRelease('Movie.DV.2160p').hdr).toBe('DV')
    expect(parseRelease('Movie.DoVi').hdr).toBe('DV')
    expect(parseRelease('Movie.Dolby.Vision').hdr).toBe('DV')
    expect(parseRelease('Movie.HDR10+').hdr).toBe('HDR10+')
    expect(parseRelease('Movie.HDR10').hdr).toBe('HDR10')
    expect(parseRelease('Movie.HDR').hdr).toBe('HDR10')
    expect(parseRelease('Movie.1080p').hdr).toBe('SDR')
    expect(parseRelease('Movie.DVDRip.x264').hdr).toBe('SDR')
  })

  it('detects codec', () => {
    expect(parseRelease('Movie.AV1').codec).toBe('AV1')
    expect(parseRelease('Movie.x265').codec).toBe('x265')
    expect(parseRelease('Movie.HEVC').codec).toBe('x265')
    expect(parseRelease('Movie.H.265').codec).toBe('x265')
    expect(parseRelease('Movie.x264').codec).toBe('x264')
    expect(parseRelease('Movie.H.264').codec).toBe('x264')
    expect(parseRelease('Movie.XviD').codec).toBe('MPEG')
    expect(parseRelease('Movie.1080p.BluRay').codec).toBe('unknown')
  })

  it('detects YTS variants', () => {
    expect(parseRelease('Movie.YTS.MX').isYTS).toBe(true)
    expect(parseRelease('Movie.YTS.AG').isYTS).toBe(true)
    expect(parseRelease('Movie.YTS').isYTS).toBe(true)
    expect(parseRelease('Movie.RARBG').isYTS).toBe(false)
  })

  it('returns all-default object for empty/undefined', () => {
    const expected = {
      resolution: 'other', source: 'Unknown', audio: 'Stereo',
      hdr: 'SDR', codec: 'unknown', isRemux: false, isYTS: false,
    }
    expect(parseRelease('')).toEqual(expected)
    expect(parseRelease(undefined)).toEqual(expected)
  })
})

// ─── isSeasonPack / qualityTag / runtimeBucket ──────────────────────────────

describe('isSeasonPack', () => {
  it.each([
    ['Show.S02E01.1080p', false],
    ['Show.3x01.720p', false],
    ['Show.S02.1080p', true],
    ['Show.Season.Pack', true],
    ['Show.COMPLETE', true],
    ['Anime.Batch', true],
    ['Show.Collection', true],
    ['Just.A.Movie.2024', false],
    ['', false],
  ])('%s → %s', (title, expected) => {
    expect(isSeasonPack(title)).toBe(expected)
  })

  it('episode marker overrides COMPLETE', () => {
    expect(isSeasonPack('Show.S01E01.COMPLETE.repack')).toBe(false)
  })
})

describe('qualityTag', () => {
  it('returns CAM/TS source verbatim, 4K for 4K, else source', () => {
    expect(qualityTag('Movie.CAM.x264')).toBe('CAM')
    expect(qualityTag('Movie.TS.x264')).toBe('TS')
    expect(qualityTag('Movie.2160p.BluRay')).toBe('4K')
    expect(qualityTag('Movie.1080p.WEB-DL')).toBe('WEB-DL')
    expect(qualityTag('Movie.no.markers')).toBe('Unknown')
  })
})

describe('runtimeBucket', () => {
  it.each([
    [20, 'short'], [29, 'short'],
    [30, 'standard'], [45, 'standard'],
    [46, 'long'], [75, 'long'],
    [76, 'extraLong'], [120, 'extraLong'],
  ])('%i min → %s', (min, expected) => {
    expect(runtimeBucket(min)).toBe(expected)
  })
})

// ─── speedScore ─────────────────────────────────────────────────────────────

describe('speedScore', () => {
  it('is 0 for zero/negative seeds', () => {
    expect(speedScore(0, 10)).toBe(0)
    expect(speedScore(-1, 0)).toBe(0)
  })

  it('follows the log2 curve below saturation', () => {
    expect(speedScore(1, 0)).toBeCloseTo(3.3, 9)
    expect(speedScore(3, 0)).toBeCloseTo(6.6, 9)
    expect(speedScore(7, 0)).toBeCloseTo(9.9, 9)
  })

  it('saturates at 18', () => {
    expect(speedScore(43, 0)).toBe(18)
    expect(speedScore(100, 0)).toBe(18)
    expect(speedScore(10000, 0)).toBe(18)
  })

  it('adds +2 ratio bonus only when ratio strictly > 2', () => {
    const base50 = Math.min(Math.log2(51) * 3.3, 18)
    expect(speedScore(50, 10)).toBeCloseTo(base50 + 2, 9)  // ratio 5
    expect(speedScore(50, 25)).toBeCloseTo(base50, 9)       // ratio exactly 2 → none
    expect(speedScore(50, 30)).toBeCloseTo(base50, 9)       // ratio < 2 → none
  })

  it('gives no ratio bonus when peers is 0', () => {
    expect(speedScore(100, 0)).toBe(18)
  })
})

// ─── scoreTorrent + eligibility ─────────────────────────────────────────────

describe('scoreTorrent', () => {
  it('scores a high-seed 1080p WEB-DL in the value tier', () => {
    const r = scoreTorrent(t('The.Matrix.1999.1080p.WEB-DL.DDP5.1.H.264', 8.0, 120, 10),
      { mode: 'movie' })
    expect(r.score).toBe(56.0)
    expect(r.tier).toBe('value')
    expect(r.eligible).toBe(true)
  })

  it('marks CAM and TS as never eligible', () => {
    expect(scoreTorrent(t('New.2026.HDCAM.x264', 2, 500, 5), { mode: 'movie' }).eligible).toBe(false)
    expect(scoreTorrent(t('New.2026.TS.x264', 2, 500, 5), { mode: 'movie' }).eligible).toBe(false)
  })

  it('requires at least 3 seeds for eligibility', () => {
    expect(scoreTorrent(t('Movie.1080p.WEB-DL', 8, 2, 0), { mode: 'movie' }).eligible).toBe(false)
    expect(scoreTorrent(t('Movie.1080p.WEB-DL', 8, 3, 0), { mode: 'movie' }).eligible).toBe(true)
  })

  it('gives oversize remux no tier and no size bonus', () => {
    const r = scoreTorrent(t('Movie.2160p.REMUX.Atmos.DV', 55, 40, 8), { mode: 'movie' })
    expect(r.tier).toBe(null)
    expect(r.score).toBe(58.7)
  })

  it('applies the YTS bonus', () => {
    const base = scoreTorrent(t('Movie.2023.1080p.BluRay.x264', 2.1, 80, 30), { mode: 'movie' })
    const yts = scoreTorrent(t('Movie.2023.1080p.BluRay.x264.YTS.MX', 2.1, 80, 30), { mode: 'movie' })
    expect(yts.score).toBeCloseTo(base.score + 1, 5)
  })

  it('defaults missing size/seeders to zero', () => {
    const r = scoreTorrent({ title: 'Movie.1080p' }, { mode: 'movie' })
    expect(r.sizeGB).toBe(0)
    expect(r.seeds).toBe(0)
    expect(r.tier).toBe(null)
    expect(r.eligible).toBe(false)
  })

  it('exposes ratio (Infinity when peers 0, seeds > 0)', () => {
    expect(scoreTorrent(t('Movie.1080p', 8, 10, 0), { mode: 'movie' }).ratio).toBe(Infinity)
  })

  describe('movie tier boundaries', () => {
    it.each([
      [0.69, null], [0.7, 'budget'], [3.99, 'budget'],
      [4.0, 'value'], [11.99, 'value'], [12.0, 'quality'],
      [25.0, 'quality'], [25.01, null], [55.0, null],
    ])('size %f GB → tier %s', (sizeGB, tier) => {
      expect(scoreTorrent(t('Movie.1080p.WEB-DL', sizeGB, 10, 5), { mode: 'movie' }).tier).toBe(tier)
    })
  })

  it('multiplies TV brackets in season-search mode regardless of pack title', () => {
    const r = scoreTorrent(t('Show.S01E02.1080p.WEB-DL', 20, 10, 5),
      { mode: 'tv', runtimeMin: 45, episodeCount: 10, isSeasonSearch: true })
    expect(r.tier).toBe('value')  // 20 GB lands in value (8–25) under ×10 bracket
  })
})

// ─── pickBestThree ──────────────────────────────────────────────────────────

describe('pickBestThree', () => {
  const scoredList = (items, ctx) =>
    items.map(it => ({ ...it, _score: scoreTorrent(it, ctx) }))

  it('picks the highest-scoring eligible torrent per tier', () => {
    const items = [
      t('Movie.2023.1080p.WEB-DL.DDP5.1.x264', 8, 100, 10),   // value, high
      t('Movie.2023.1080p.WEBRip.x264', 8, 5, 2),             // value, lower
      t('Movie.2023.2160p.BluRay.DV.Atmos.x265', 18, 80, 6),  // quality
      t('Movie.2023.720p.x264.YTS.MX', 2, 50, 20),            // budget
    ]
    const picks = pickBestThree(scoredList(items, { mode: 'movie' }), { mode: 'movie' })
    expect(picks.quality.title).toContain('2160p')
    expect(picks.value.title).toContain('WEB-DL')
    expect(picks.budget.title).toContain('720p')
  })

  it('excludes CAM/TS and low-seed torrents from picks', () => {
    const items = [
      t('Movie.2023.1080p.HDCAM.x264', 8, 500, 10),   // ineligible source
      t('Movie.2023.1080p.WEB-DL', 8, 2, 0),          // too few seeds
    ]
    const picks = pickBestThree(scoredList(items, { mode: 'movie' }), { mode: 'movie' })
    expect(picks.quality).toBe(null)
    expect(picks.value).toBe(null)
    expect(picks.budget).toBe(null)
  })

  it('restricts picks to season packs when isSeasonSearch is set', () => {
    const ctx = { mode: 'tv', runtimeMin: 45, episodeCount: 10, isSeasonSearch: true }
    const items = [
      t('Show.S01.Complete.1080p.WEB-DL.x265', 20, 50, 5),   // pack
      t('Show.S01E05.1080p.WEB-DL.x265', 20, 90, 5),         // single ep, higher seeds
    ]
    const picks = pickBestThree(scoredList(items, ctx), ctx)
    // Even though the episode has more seeds, only the pack can win a badge
    expect(picks.value?.title).toContain('Complete')
  })
})

// ─── normalizeScore + letterGrade ───────────────────────────────────────────

describe('normalizeScore', () => {
  it('maps raw score onto 0–100 against the empirical max of 70', () => {
    expect(normalizeScore(70)).toBe(100)
    expect(normalizeScore(35)).toBe(50)
    expect(normalizeScore(0)).toBe(0)
  })

  it('clamps to 0–100', () => {
    expect(normalizeScore(90)).toBe(100)   // over max caps at 100
    expect(normalizeScore(-10)).toBe(0)
  })
})

describe('letterGrade', () => {
  it('caps CAM/TS at F regardless of raw score', () => {
    const cam = letterGrade(58, 'CAM')
    expect(cam.letter).toBe('F')
    expect(cam.verdict).toMatch(/bad source/i)
    expect(letterGrade(60, 'TS').letter).toBe('F')
  })

  it('grades a strong release in the A range', () => {
    // raw 56 (high-seed 1080p WEB-DL) → A
    expect(letterGrade(56, 'WEB-DL').letter).toBe('A')
    expect(letterGrade(58, 'BluRay').letter).toBe('A+')
  })

  it('maps each threshold band', () => {
    expect(letterGrade(58, 'BluRay').letter).toBe('A+')
    expect(letterGrade(50, 'WEB-DL').letter).toBe('A')
    expect(letterGrade(43, 'WEB-DL').letter).toBe('B+')
    expect(letterGrade(36, 'WEBRip').letter).toBe('B')
    expect(letterGrade(29, 'HDTV').letter).toBe('C+')
    expect(letterGrade(22, 'HDTV').letter).toBe('C')
    expect(letterGrade(15, 'Unknown').letter).toBe('D')
    expect(letterGrade(14, 'Unknown').letter).toBe('F')
  })

  it('grades just below each boundary one tier lower', () => {
    expect(letterGrade(57, 'WEB-DL').letter).toBe('A')
    expect(letterGrade(49, 'WEB-DL').letter).toBe('B+')
  })
})
