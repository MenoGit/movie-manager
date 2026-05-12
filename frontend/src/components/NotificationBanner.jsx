import { useState, useEffect } from 'react'
import { Bell, X } from 'lucide-react'

/**
 * Top banner prompting the user to enable browser notifications.
 * Renders only when:
 *   - Notification API is supported
 *   - permission is still 'default' (never asked / never granted)
 *   - the user hasn't explicitly dismissed it before (localStorage flag)
 */
export default function NotificationBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    let dismissed = false
    try { dismissed = localStorage.getItem('notif_banner_dismissed') === '1' } catch {}
    if (Notification.permission === 'default' && !dismissed) {
      setVisible(true)
    }
  }, [])

  async function handleAllow() {
    try {
      const result = await Notification.requestPermission()
      // Whatever the result, no point showing the banner again
      try { localStorage.setItem('notif_banner_dismissed', '1') } catch {}
      setVisible(false)
      if (result === 'granted') {
        // Confirmation toast — just a Notification to verify it works
        try {
          new Notification('FilmVault notifications enabled', {
            body: "You'll see a notification when downloads complete.",
          })
        } catch {}
      }
    } catch {
      setVisible(false)
    }
  }

  function handleDismiss() {
    try { localStorage.setItem('notif_banner_dismissed', '1') } catch {}
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="notif-banner" role="status">
      <Bell size={16} className="notif-banner-icon" />
      <span className="notif-banner-text">
        Enable notifications to know when downloads finish
      </span>
      <div className="notif-banner-actions">
        <button className="notif-allow" onClick={handleAllow}>Allow</button>
        <button className="notif-dismiss" onClick={handleDismiss} aria-label="Dismiss">
          <X size={14} />
        </button>
      </div>

      <style>{`
        .notif-banner {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 18px;
          background: rgba(59,130,246,0.10);
          border-bottom: 1px solid rgba(59,130,246,0.35);
          color: var(--text);
          font-size: 13px;
        }
        .notif-banner-icon { color: #6aa8f6; flex-shrink: 0; }
        .notif-banner-text { flex: 1; }
        .notif-banner-actions { display: flex; gap: 6px; align-items: center; flex-shrink: 0; }
        .notif-allow {
          background: #3b82f6; color: #fff;
          padding: 5px 14px; border-radius: 6px;
          font-size: 12px; font-weight: 600;
          transition: background 0.15s;
        }
        .notif-allow:hover { background: #2563eb; }
        .notif-dismiss {
          background: transparent; color: var(--text-muted);
          width: 26px; height: 26px;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
        }
        .notif-dismiss:hover { background: rgba(255,255,255,0.08); color: var(--text); }
        @media (max-width: 480px) {
          .notif-banner { padding: 8px 12px; font-size: 12px; gap: 8px; }
          .notif-banner-text { font-size: 12px; }
        }
      `}</style>
    </div>
  )
}
