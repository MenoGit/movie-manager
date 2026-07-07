// Shared-element origin for the desktop poster→hero morph. The clicked card
// stashes its poster rect here; the opening modal consumes it once. A plain
// module variable — no props change hands, no behavior changes if nobody
// consumes it. Desktop only: on mobile the sheet animation owns the entrance.

import { useLayoutEffect, useRef, useState } from 'react'

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

/**
 * FLIP morph from the clicked card's poster to the modal's hero poster.
 * Attach the returned ref to the hero <img>; morphOrigin tells the modal
 * whether to enter with a pure fade (geometry must hold still while the
 * clone flies) or the fade-and-scale fallback. The clone is plain DOM
 * driven by one transform transition — compositor-only, no per-frame
 * React work. Cleans up on landing, on a safety timeout, and on unmount.
 */
export function usePosterMorph(posterUrl) {
  const [morphOrigin] = useState(consumePosterOrigin)
  const heroPosterRef = useRef(null)

  useLayoutEffect(() => {
    const target = heroPosterRef.current
    if (!morphOrigin || !target || !posterUrl) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const dest = target.getBoundingClientRect()
    if (!dest.width) return

    const clone = document.createElement('img')
    clone.src = posterUrl
    Object.assign(clone.style, {
      position: 'fixed',
      left: `${dest.left}px`,
      top: `${dest.top}px`,
      width: `${dest.width}px`,
      height: `${dest.height}px`,
      objectFit: 'cover',
      borderRadius: '10px',
      margin: '0',
      zIndex: '200',
      pointerEvents: 'none',
      transformOrigin: 'top left',
      willChange: 'transform',
      boxShadow: '0 12px 48px rgba(0,0,0,0.6)',
      transform: `translate(${morphOrigin.left - dest.left}px, ${morphOrigin.top - dest.top}px) ` +
        `scale(${morphOrigin.width / dest.width}, ${morphOrigin.height / dest.height})`,
    })
    target.style.opacity = '0'
    document.body.appendChild(clone)

    let finished = false
    const done = () => {
      if (finished) return
      finished = true
      target.style.opacity = ''
      clone.remove()
    }
    // Double rAF: paint the start frame at the card's rect, then transition
    // to identity (the poster's real spot in the hero).
    requestAnimationFrame(() => requestAnimationFrame(() => {
      clone.style.transition = 'transform 420ms cubic-bezier(0.22, 1, 0.36, 1)'
      clone.style.transform = 'translate(0px, 0px) scale(1, 1)'
    }))
    clone.addEventListener('transitionend', done, { once: true })
    const safety = setTimeout(done, 650)
    return () => { clearTimeout(safety); done() }
  }, [])

  return { morphOrigin, heroPosterRef }
}
