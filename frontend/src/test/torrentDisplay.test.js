import { describe, it, expect } from 'vitest'
import { formatSize, qualityRank, tagClass, ratioInfo } from '../torrentDisplay'

// Characterization tests — lock in current behavior of the display helpers.

describe('formatSize', () => {
  it('returns "?" for falsy/zero byte counts', () => {
    expect(formatSize(0)).toBe('?')
    expect(formatSize(null)).toBe('?')
    expect(formatSize(undefined)).toBe('?')
  })

  it('formats >= 1 GB with two decimals and GB suffix', () => {
    expect(formatSize(1024 ** 3)).toBe('1.00 GB')
    expect(formatSize(1.5 * 1024 ** 3)).toBe('1.50 GB')
    expect(formatSize(8 * 1024 ** 3)).toBe('8.00 GB')
  })

  it('formats < 1 GB as whole MB', () => {
    expect(formatSize(500 * 1024 ** 2)).toBe('500 MB')
    expect(formatSize(1024 ** 2)).toBe('1 MB')
    // 0.5 GB rounds to 512 MB (toFixed(0))
    expect(formatSize(0.5 * 1024 ** 3)).toBe('512 MB')
  })

  it('rounds MB to nearest whole number', () => {
    expect(formatSize(1.4 * 1024 ** 2)).toBe('1 MB')
    expect(formatSize(1.6 * 1024 ** 2)).toBe('2 MB')
  })
})

describe('qualityRank', () => {
  it('ranks by parsed quality tag', () => {
    expect(qualityRank('Movie.2160p.BluRay.x265')).toBe(5)   // 4K
    expect(qualityRank('Movie.1080p.BluRay.x264')).toBe(4)   // BluRay
    expect(qualityRank('Movie.1080p.WEB-DL')).toBe(3)        // WEB-DL
    expect(qualityRank('Movie.1080p.WEBRip')).toBe(2)        // WEBRip
    expect(qualityRank('Show.720p.HDTV.x264')).toBe(1)       // HDTV
    expect(qualityRank('Movie.CAM.x264')).toBe(0)            // CAM
    expect(qualityRank('Movie.TS.x264')).toBe(0)             // TS
  })

  it('falls back to 1 for unknown/unmapped tags', () => {
    // qualityTag returns source "Unknown" → TAG_RANK.Unknown = 1
    expect(qualityRank('Movie.with.no.markers')).toBe(1)
  })
})

describe('tagClass', () => {
  it('lowercases and strips non-alphanumerics', () => {
    expect(tagClass('WEB-DL')).toBe('webdl')
    expect(tagClass('4K')).toBe('4k')
    expect(tagClass('BluRay')).toBe('bluray')
    expect(tagClass('HDR10+')).toBe('hdr10')
    expect(tagClass('AAC5.1')).toBe('aac51')
    expect(tagClass('Unknown')).toBe('unknown')
  })
})

describe('ratioInfo', () => {
  it('computes finite ratio when peers > 0', () => {
    const r = ratioInfo({ seeders: 30, leechers: 10 })
    expect(r.ratio).toBe(3)
    expect(r.seeds).toBe(30)
    expect(r.peers).toBe(10)
  })

  it('returns Infinity ratio when peers 0 and seeds > 0', () => {
    expect(ratioInfo({ seeders: 5, leechers: 0 }).ratio).toBe(Infinity)
  })

  it('returns 0 ratio when no seeds and no peers', () => {
    expect(ratioInfo({ seeders: 0, leechers: 0 }).ratio).toBe(0)
  })

  it('treats missing seeders/leechers as 0', () => {
    const r = ratioInfo({})
    expect(r.seeds).toBe(0)
    expect(r.peers).toBe(0)
    expect(r.ratio).toBe(0)
    expect(r.bucket).toBe('slow')
  })

  describe('bucket thresholds', () => {
    it('fast requires seeds >= 20 AND ratio >= 3', () => {
      expect(ratioInfo({ seeders: 20, leechers: 5 }).bucket).toBe('fast')   // r=4
      expect(ratioInfo({ seeders: 60, leechers: 0 }).bucket).toBe('fast')   // r=Inf
      // 20 seeds but ratio < 3 → not fast
      expect(ratioInfo({ seeders: 20, leechers: 10 }).bucket).toBe('decent') // r=2
      // ratio >= 3 but < 20 seeds → not fast
      expect(ratioInfo({ seeders: 15, leechers: 1 }).bucket).toBe('decent')
    })

    it('decent requires seeds >= 5 OR ratio >= 2', () => {
      expect(ratioInfo({ seeders: 5, leechers: 100 }).bucket).toBe('decent')  // seeds rule
      expect(ratioInfo({ seeders: 3, leechers: 1 }).bucket).toBe('decent')    // ratio rule (3)
      expect(ratioInfo({ seeders: 2, leechers: 1 }).bucket).toBe('decent')    // ratio exactly 2
    })

    it('slow when below both thresholds', () => {
      expect(ratioInfo({ seeders: 4, leechers: 3 }).bucket).toBe('slow')   // 4 seeds, r≈1.33
      expect(ratioInfo({ seeders: 1, leechers: 2 }).bucket).toBe('slow')   // r=0.5
    })
  })
})
