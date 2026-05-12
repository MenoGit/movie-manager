import { useEffect, useRef } from 'react'

/**
 * Detect torrent completions from queue polling and trigger:
 *   - A browser Notification (title "Download Complete", body = torrent name,
 *     FilmVault inline SVG as icon)
 *   - A subtle chime via Web Audio (no external asset)
 *
 * A "completion" is an item present in the previous queue with progress > 95%
 * that's missing from the current queue (the backend auto-deletes finished
 * torrents). The 95% gate avoids false positives from manual deletes mid-download.
 */

// Inline lucide-style Film glyph rendered in FilmVault gold. Used as the
// notification icon. Browsers cache this once.
const FILMVAULT_ICON =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 24 24"
        fill="none" stroke="#e8a030" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
      <line x1="7" y1="2" x2="7" y2="22"/>
      <line x1="17" y1="2" x2="17" y2="22"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <line x1="2" y1="7" x2="7" y2="7"/>
      <line x1="2" y1="17" x2="7" y2="17"/>
      <line x1="17" y1="17" x2="22" y2="17"/>
      <line x1="17" y1="7" x2="22" y2="7"/>
    </svg>`
  )

let _audioCtx = null
function playChime() {
  try {
    _audioCtx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)()
    const ctx = _audioCtx
    if (ctx.state === 'suspended') ctx.resume()
    const now = ctx.currentTime
    // Two-tone chime: 880 Hz -> 1175 Hz, soft sine, quick exponential decay
    const tones = [
      { freq: 880,  start: 0,    dur: 0.18 },
      { freq: 1175, start: 0.12, dur: 0.28 },
    ]
    for (const t of tones) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = t.freq
      gain.gain.setValueAtTime(0.0001, now + t.start)
      gain.gain.exponentialRampToValueAtTime(0.12, now + t.start + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t.start + t.dur)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now + t.start)
      osc.stop(now + t.start + t.dur + 0.01)
    }
  } catch {
    // Audio context blocked (e.g., page never had a user gesture) — silent fallback
  }
}

export default function useCompletionNotifications(queue) {
  const prevRef = useRef([])

  useEffect(() => {
    const prev = prevRef.current
    prevRef.current = queue

    if (!('Notification' in window) || Notification.permission !== 'granted') return
    if (prev.length === 0) return // first load — nothing to compare against

    const currentHashes = new Set(queue.map(t => t.hash))
    for (const item of prev) {
      if (item.hash && !currentHashes.has(item.hash) && (item.progress || 0) >= 95) {
        try {
          new Notification('Download Complete', {
            body: item.name || 'Download finished',
            icon: FILMVAULT_ICON,
            tag: item.hash,
          })
        } catch {}
        playChime()
      }
    }
  }, [queue])
}
