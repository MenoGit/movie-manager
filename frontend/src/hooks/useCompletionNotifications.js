import { useEffect, useRef } from 'react'

/**
 * Detect torrent completions from queue polling and fire browser notifications.
 *
 * A "completion" is an item that was in the previous queue with progress > 95%
 * but isn't in the current queue (the backend auto-deletes completed items).
 * The 95% threshold avoids false positives from manual deletes mid-download.
 */
export default function useCompletionNotifications(queue, label = 'Download complete') {
  const prevRef = useRef([])
  const requestedRef = useRef(false)

  // Request permission once on mount if not yet decided
  useEffect(() => {
    if (requestedRef.current) return
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission === 'default') {
      try { Notification.requestPermission() } catch {}
    }
    requestedRef.current = true
  }, [])

  useEffect(() => {
    const prev = prevRef.current
    prevRef.current = queue

    if (!('Notification' in window) || Notification.permission !== 'granted') return
    if (prev.length === 0) return // first load — nothing to compare against

    const currentHashes = new Set(queue.map(t => t.hash))
    for (const item of prev) {
      if (item.hash && !currentHashes.has(item.hash) && (item.progress || 0) >= 95) {
        try {
          new Notification(label, {
            body: item.name || 'Download finished',
            tag: item.hash,
          })
        } catch {}
      }
    }
  }, [queue, label])
}
