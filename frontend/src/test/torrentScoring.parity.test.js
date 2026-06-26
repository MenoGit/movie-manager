import { describe, it, expect } from 'vitest'
import { parseRelease, speedScore, scoreTorrent } from '../torrentScoring'
import cases from './parity-cases.json'

// Frontend half of the cross-language parity contract. The same fixture is
// asserted by backend/tests/test_parity.py against the Python implementation.
// The fixture is generated from the Python side; if the JS port drifts, these
// fail. Don't edit the fixture to make a side pass — regenerate it deliberately
// (see /tmp gen script referenced in the suite commit) and re-run both halves.

const GB = 1024 ** 3

describe('parse_release parity', () => {
  it.each(cases.parse_cases.map(c => [c.title, c]))('%s', (_title, c) => {
    const parsed = parseRelease(c.title)
    // Fixture uses language-neutral keys: remux/yts → isRemux/isYTS in JS.
    const jsKey = { remux: 'isRemux', yts: 'isYTS' }
    for (const [key, expected] of Object.entries(c.expected)) {
      expect(parsed[jsKey[key] ?? key]).toBe(expected)
    }
  })
})

describe('speed_score parity', () => {
  it.each(cases.speed_cases.map(c => [`s${c.seeds}/p${c.peers}`, c]))('%s', (_id, c) => {
    expect(speedScore(c.seeds, c.peers)).toBeCloseTo(c.expected, 6)
  })
})

describe('score_torrent parity', () => {
  it.each(cases.score_cases.map(c => [c.title, c]))('%s', (_title, c) => {
    const r = scoreTorrent(
      { title: c.title, size: c.size_bytes, seeders: c.seeders, leechers: c.leechers },
      c.ctx,
    )
    expect(r.score).toBeCloseTo(c.expected.score, 9)
    expect(r.tier).toBe(c.expected.tier)
    expect(r.eligible).toBe(c.expected.eligible)
  })
})
