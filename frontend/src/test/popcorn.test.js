import { describe, it, expect } from 'vitest'
import { popcornPct } from '../utils'

// JS twin of backend services/omdb.popcorn_pct. The anchor table below
// mirrors backend/tests/test_omdb.py::TestPopcornCurve — the two suites
// lock the curve constants (midpoint 4.71, spread 1.5) in parity: retune
// one side and both suites fail. Same rule as the torrentScoring parity
// fixture: never edit one side to make a test pass.
describe('popcornPct', () => {
  it.each([
    [4.0, 38],
    [6.0, 70],
    [7.5, 87],
    [8.5, 93],
    [10.0, 97],
  ])('maps %f → %i%% (backend anchor)', (avg, expected) => {
    expect(popcornPct(avg)).toBe(expected)
  })

  it('is monotonic across the full range', () => {
    let prev = -1
    for (let x = 0.1; x <= 10; x += 0.1) {
      const v = popcornPct(x)
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
  })

  it('treats 0 / missing as unrated → null (badge hides)', () => {
    expect(popcornPct(0)).toBeNull()
    expect(popcornPct(null)).toBeNull()
    expect(popcornPct(undefined)).toBeNull()
  })
})
