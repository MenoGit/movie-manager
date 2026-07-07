import { useEffect, useRef } from 'react'

/**
 * Mobile bottom-sheet drag-to-dismiss.
 *
 * Attach sheetRef to the sheet element (the scrollable .modal) and
 * backdropRef to the overlay. A downward pull that STARTS while the sheet
 * is scrolled to the top grabs the sheet; while dragging, the transform is
 * written straight to the DOM node (compositor-only, no React re-render per
 * frame). Release past the distance/velocity threshold animates the sheet
 * out and calls onClose; otherwise it springs back. An upward first move is
 * treated as a scroll and never intercepted, so list scrolling stays fully
 * native. Desktop (>768px) is untouched — the hook no-ops there.
 *
 * The backdrop dims proportionally via the --sheet-dim CSS variable.
 */
export default function useSheetDrag(onClose) {
  const sheetRef = useRef(null)
  const backdropRef = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const sheet = sheetRef.current
    if (!sheet) return

    let startY = 0
    let lastY = 0
    let lastT = 0
    let dy = 0
    let velocity = 0
    let eligible = false
    let dragging = false
    let dismissed = false

    const isMobile = () => window.matchMedia('(max-width: 768px)').matches
    const setDim = (v) => backdropRef.current?.style.setProperty('--sheet-dim', String(v))

    const onStart = (e) => {
      if (dismissed || !isMobile()) return
      eligible = sheet.scrollTop <= 0
      dragging = false
      dy = 0
      startY = lastY = e.touches[0].clientY
      lastT = performance.now()
      velocity = 0
    }

    const onMove = (e) => {
      if (!eligible || dismissed) return
      const y = e.touches[0].clientY
      const delta = y - startY
      const now = performance.now()
      if (now > lastT) velocity = (y - lastY) / (now - lastT)
      lastY = y
      lastT = now

      if (!dragging) {
        if (delta > 8) {
          // Downward pull past slop → grab the sheet
          dragging = true
          sheet.style.animation = 'none'
          sheet.style.transition = 'none'
        } else if (delta < -8) {
          // Upward → it's a content scroll; stay out of the way
          eligible = false
          return
        } else {
          return
        }
      }

      dy = Math.max(0, delta)
      e.preventDefault() // we own the gesture now — no rubber-banding underneath
      sheet.style.transform = `translate3d(0, ${dy}px, 0)`
      setDim(Math.max(0.25, 1 - dy / (sheet.offsetHeight || 600)))
    }

    const onEnd = () => {
      if (!dragging || dismissed) {
        eligible = false
        return
      }
      dragging = false
      eligible = false
      const shouldDismiss = dy > 140 || (velocity > 0.55 && dy > 40)
      sheet.style.transition = 'transform 240ms cubic-bezier(0.22, 1, 0.36, 1)'
      if (shouldDismiss) {
        dismissed = true
        sheet.style.transform = 'translate3d(0, 105%, 0)'
        setDim(0)
        setTimeout(() => closeRef.current(), 230)
      } else {
        sheet.style.transform = 'translate3d(0, 0, 0)'
        setDim(1)
      }
    }

    sheet.addEventListener('touchstart', onStart, { passive: true })
    sheet.addEventListener('touchmove', onMove, { passive: false })
    sheet.addEventListener('touchend', onEnd, { passive: true })
    sheet.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      sheet.removeEventListener('touchstart', onStart)
      sheet.removeEventListener('touchmove', onMove)
      sheet.removeEventListener('touchend', onEnd)
      sheet.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  return { sheetRef, backdropRef }
}
