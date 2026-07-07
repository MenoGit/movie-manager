// Shared-element origin for the desktop poster→hero morph. The clicked card
// stashes its poster rect here; the opening modal consumes it once. A plain
// module variable — no props change hands, no behavior changes if nobody
// consumes it. Desktop only: on mobile the sheet animation owns the entrance.

let origin = null

export function rememberPosterOrigin(el) {
  if (!el || !window.matchMedia('(min-width: 769px)').matches) {
    origin = null
    return
  }
  origin = el.getBoundingClientRect()
}

export function consumePosterOrigin() {
  const o = origin
  origin = null
  return o
}
