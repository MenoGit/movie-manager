import { useEffect, useState } from 'react'

// Poster URL → dominant [r, g, b], cached for the session. Downscales the
// image onto a tiny canvas and averages the saturated mid-luminance pixels
// (falls back to a plain average for near-monochrome art). TMDb serves
// images with CORS headers, so canvas readback works with crossOrigin set;
// any failure (tainted canvas, decode error) resolves to null and callers
// fall back to the amber accent.
const cache = new Map()

export default function usePosterColor(url) {
  const [rgb, setRgb] = useState(() => cache.get(url) || null)

  useEffect(() => {
    if (!url) return
    if (cache.has(url)) { setRgb(cache.get(url)); return }
    let alive = true
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const size = 24
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(img, 0, 0, size, size)
        const data = ctx.getImageData(0, 0, size, size).data
        let r = 0, g = 0, b = 0, n = 0
        let ra = 0, ga = 0, ba = 0, na = 0
        for (let i = 0; i < data.length; i += 4) {
          const R = data[i], G = data[i + 1], B = data[i + 2]
          const mx = Math.max(R, G, B), mn = Math.min(R, G, B)
          ra += R; ga += G; ba += B; na++
          if (mx - mn > 30 && mx > 50 && mx < 240) { r += R; g += G; b += B; n++ }
        }
        const out = n > 20
          ? [r / n, g / n, b / n]
          : [ra / na, ga / na, ba / na]
        const rounded = out.map(Math.round)
        cache.set(url, rounded)
        if (alive) setRgb(rounded)
      } catch {
        cache.set(url, null)
      }
    }
    img.src = url
    return () => { alive = false }
  }, [url])

  return rgb
}
