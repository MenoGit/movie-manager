import { useEffect } from 'react'
import { X, Download, AlertTriangle, Award } from 'lucide-react'
import { hasSpanishAudio } from '../utils'
import { isSeasonPack } from '../torrentScoring'

// ─── Grade mapping ────────────────────────────────────────────────────────

// Empirical max around 60 (50 quality + 5 seeds + 2 ratio + 2 size + 1 YTS).
// Normalize to 100 with a cap.
function normalizeScore(rawScore) {
  return Math.max(0, Math.min(100, Math.round((rawScore / 60) * 100)))
}

function gradeFor(normalized) {
  if (normalized >= 90) return { letter: 'A+', color: '#22c55e', verdict: 'Excellent download' }
  if (normalized >= 80) return { letter: 'A',  color: '#22c55e', verdict: 'Great quality' }
  if (normalized >= 75) return { letter: 'B+', color: '#84cc16', verdict: 'Very good' }
  if (normalized >= 65) return { letter: 'B',  color: '#84cc16', verdict: 'Good enough' }
  if (normalized >= 60) return { letter: 'C+', color: '#eab308', verdict: 'Decent with compromises' }
  if (normalized >= 50) return { letter: 'C',  color: '#eab308', verdict: 'Below average' }
  if (normalized >= 35) return { letter: 'D',  color: '#f97316', verdict: 'Poor quality' }
  return                      { letter: 'F',  color: '#ef4444', verdict: 'Avoid this torrent' }
}

// ─── Dot ratings (out of 5) ───────────────────────────────────────────────

const RESOLUTION_DOTS  = { '4K': 5, '1080p': 4, '720p': 3, '480p': 1, 'other': 1 }
const SOURCE_DOTS      = { 'BluRay': 5, 'WEB-DL': 4, 'WEBRip': 3, 'HDTV': 2, 'TS': 1, 'CAM': 1, 'Unknown': 1 }
const AUDIO_DOTS       = { 'Atmos': 5, 'DTS-HD/TrueHD': 5, 'DDP5.1': 4, 'DTS': 4, 'AAC5.1': 3, 'AAC': 2, 'Stereo': 1 }
const HDR_DOTS         = { 'DV': 5, 'HDR10+': 4, 'HDR10': 3, 'SDR': 2 }
const CODEC_DOTS       = { 'AV1': 5, 'x265': 4, 'x264': 3, 'MPEG': 2, 'unknown': 2 }

function Dots({ filled, total = 5, color = 'var(--accent)' }) {
  return (
    <span className="dot-rating">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`dot ${i < filled ? 'on' : ''}`}
          style={i < filled ? { background: color } : undefined}
        />
      ))}
    </span>
  )
}

// ─── Display labels ───────────────────────────────────────────────────────

const RESOLUTION_LABEL = { '4K': '4K (2160p)', '1080p': '1080p', '720p': '720p', '480p': '480p', 'other': 'Unknown' }
const SOURCE_LABEL     = {
  'BluRay': 'BluRay', 'WEB-DL': 'WEB-DL', 'WEBRip': 'WEBRip',
  'HDTV': 'HDTV', 'TS': 'TeleSync', 'CAM': 'CAM', 'Unknown': 'Unknown',
}
const AUDIO_LABEL      = {
  'Atmos': 'Dolby Atmos', 'DTS-HD/TrueHD': 'DTS-HD MA / TrueHD',
  'DDP5.1': 'Dolby Digital Plus 5.1', 'DTS': 'DTS',
  'AAC5.1': 'AAC 5.1', 'AAC': 'AAC Stereo', 'Stereo': 'Stereo / Unknown',
}
const HDR_LABEL        = { 'DV': 'Dolby Vision', 'HDR10+': 'HDR10+', 'HDR10': 'HDR10', 'SDR': 'SDR (no HDR)' }
const CODEC_LABEL      = { 'AV1': 'AV1', 'x265': 'x265 / HEVC', 'x264': 'x264 / H.264', 'MPEG': 'MPEG / XviD', 'unknown': 'Unknown' }

const CODEC_NOTE = {
  'AV1':     'Next-gen codec — best compression efficiency',
  'x265':    'Excellent compression, smaller files at same quality',
  'x264':    'Standard codec, larger files than x265',
  'MPEG':    'Older codec, inefficient — large files for the quality',
  'unknown': "Couldn't detect codec from title",
}

const AUDIO_NOTE = {
  'Atmos':          'Immersive spatial audio — best with Atmos soundbar or headphones',
  'DTS-HD/TrueHD':  'Lossless surround audio — top-tier quality',
  'DDP5.1':         '5.1 surround — great for home theater setups',
  'DTS':            'Surround audio with good fidelity',
  'AAC5.1':         '5.1 surround in efficient AAC format',
  'AAC':            'Stereo AAC — basic two-channel audio',
  'Stereo':         'Basic two-channel audio',
}

// ─── Channel guess ────────────────────────────────────────────────────────

function channelLabel(title, parsedAudio) {
  if (/7\.?1/.test(title)) return '7.1 Surround'
  if (parsedAudio === 'Atmos' || parsedAudio === 'DTS-HD/TrueHD' || parsedAudio === 'DDP5.1' || parsedAudio === 'AAC5.1' || /5\.?1/.test(title)) return '5.1 Surround'
  if (parsedAudio === 'AAC' || parsedAudio === 'Stereo') return 'Stereo (2.0)'
  return 'Unknown'
}

// ─── Size context ─────────────────────────────────────────────────────────

function sizeContext(sizeGB, tiers, tier) {
  if (!tier) {
    const q = tiers.quality
    if (q?.max && sizeGB > q.max) return { label: 'Very large — possibly bloated remux', tone: 'warn' }
    if (sizeGB < (tiers.budget?.min || 0)) return { label: 'Suspiciously small — likely poor encoding', tone: 'warn' }
    return { label: "Doesn't fit a standard size tier", tone: 'warn' }
  }
  const bracket = tiers[tier]
  const lo = bracket.min
  const hi = bracket.max ?? bracket.maxIdeal
  const mid = (lo + hi) / 2
  if (Math.abs(sizeGB - mid) / ((hi - lo) / 2 || 1) < 0.3) return { label: 'Ideal size for this tier', tone: 'good' }
  if (sizeGB < lo + (hi - lo) * 0.2) return { label: 'Towards the small end of the tier', tone: 'neutral' }
  if (sizeGB > hi - (hi - lo) * 0.2) return { label: 'Towards the large end of the tier', tone: 'neutral' }
  return { label: 'Comfortably within tier range', tone: 'good' }
}

function sizeBarPosition(sizeGB, tiers) {
  // Map a torrent's size onto a 0-100 scale across budget→value→quality ranges
  const minOverall = tiers.budget.min
  const maxOverall = tiers.quality.max ?? tiers.quality.maxIdeal
  if (!maxOverall) return 50
  const clamped = Math.min(maxOverall, Math.max(minOverall, sizeGB))
  return Math.round(((clamped - minOverall) / (maxOverall - minOverall)) * 100)
}

// ─── Formatters ───────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const tb = bytes / 1099511627776
  if (tb >= 1) return `${tb.toFixed(2)} TB`
  const gb = bytes / 1073741824
  if (gb >= 1) return `${gb.toFixed(2)} GB`
  return `${(bytes / 1048576).toFixed(0)} MB`
}

function formatDuration(seconds) {
  if (!seconds || seconds < 1) return '< 1 min'
  if (seconds < 60) return `${Math.round(seconds)} sec`
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function estimateDownloadTime(sizeBytes, mbps = 50) {
  // 50 Mbps default home internet
  const bytesPerSec = (mbps * 1_000_000) / 8
  return sizeBytes / bytesPerSec
}

// ─── Warnings ─────────────────────────────────────────────────────────────

function buildWarnings(torrent, score) {
  const w = []
  const { parsed, sizeGB, tier } = score
  const seeds = torrent.seeders || 0
  if (parsed.source === 'CAM') {
    w.push({ tone: 'red', text: 'CAM Quality — filmed in a theater, very poor video and audio' })
  }
  if (parsed.source === 'TS') {
    w.push({ tone: 'red', text: 'Telesync — direct theater audio, video still poor' })
  }
  if (seeds === 0) {
    w.push({ tone: 'red', text: 'No seeds — this torrent is dead, download will not complete' })
  } else if (seeds < 10) {
    w.push({ tone: 'orange', text: `Low seeds (${seeds}) — download may be slow or stall` })
  }
  if (parsed.resolution === '4K' && sizeGB < 3) {
    w.push({ tone: 'orange', text: `Suspiciously small — ${formatBytes(torrent.size)} for a 4K release is too compressed` })
  } else if (parsed.resolution === '1080p' && sizeGB < 0.6) {
    w.push({ tone: 'orange', text: `Suspiciously small — ${formatBytes(torrent.size)} for 1080p likely means poor encoding` })
  }
  if (sizeGB > 50) {
    w.push({ tone: 'orange', text: `Very large file (${formatBytes(torrent.size)}) — possibly a raw remux, check your storage` })
  }
  if (parsed.source === 'Unknown') {
    w.push({ tone: 'orange', text: "Unknown source — couldn't detect release quality from title" })
  }
  return w
}

// ─── Score breakdown rows ─────────────────────────────────────────────────

const SCORE_WEIGHTS_MAX = {
  resolution: 10, source: 10, audio: 10, hdr: 10, codec: 10,
  seeds: 5, size: 2,
}

function buildBreakdown(score) {
  // The raw scoring sums these components. We approximate per-component max
  // from the weight tables. Numbers shown are intentionally rounded to
  // match what users intuit from a quick glance.
  const { parsed } = score
  const RES_MAP    = { '4K': 10, '1080p': 8, '720p': 5, '480p': 2, 'other': 2 }
  const SRC_MAP    = { 'BluRay': 10, 'WEB-DL': 9, 'WEBRip': 7, 'HDTV': 5, 'TS': 1, 'CAM': 0, 'Unknown': 4 }
  const AUDIO_MAP  = { 'Atmos': 10, 'DTS-HD/TrueHD': 9, 'DDP5.1': 8, 'DTS': 7, 'AAC5.1': 6, 'AAC': 4, 'Stereo': 3 }
  const HDR_MAP    = { 'DV': 10, 'HDR10+': 9, 'HDR10': 8, 'SDR': 3 }
  const CODEC_MAP  = { 'AV1': 10, 'x265': 8, 'x264': 5, 'MPEG': 2, 'unknown': 3 }
  const seeds = score.seeds || 0
  const seedScore = seeds > 0 ? Math.min(Math.log2(seeds + 1), 5) : 0
  return [
    { label: 'Resolution', got: RES_MAP[parsed.resolution] ?? 0, max: 10 },
    { label: 'Source',     got: SRC_MAP[parsed.source] ?? 0, max: 10 },
    { label: 'Audio',      got: AUDIO_MAP[parsed.audio] ?? 0, max: 10 },
    { label: 'HDR',        got: HDR_MAP[parsed.hdr] ?? 0, max: 10 },
    { label: 'Codec',      got: CODEC_MAP[parsed.codec] ?? 0, max: 10 },
    { label: 'Seeds',      got: Math.round(seedScore * 10) / 10, max: 5 },
    { label: 'Size fit',   got: score.tier ? 2 : 0, max: 2 },
  ]
}

// ─── Health verdict ───────────────────────────────────────────────────────

function healthVerdict(seeds, peers) {
  const ratio = peers === 0 ? (seeds > 0 ? Infinity : 0) : seeds / peers
  if (seeds === 0) return { color: 'red', emoji: '🔴', text: 'Dead — no seeds' }
  if (seeds < 10)  return { color: 'red', emoji: '🔴', text: 'Slow — few seeds, may stall' }
  if (seeds >= 50 && ratio >= 3) return { color: 'green', emoji: '🟢', text: 'Fast — high seeds, great ratio' }
  if (seeds >= 20) return { color: 'green', emoji: '🟢', text: 'Healthy — good seed count' }
  return { color: 'yellow', emoji: '🟡', text: 'Decent — should complete reliably' }
}

// ─── Main component ───────────────────────────────────────────────────────

export default function TorrentDetailPanel({ torrent, context, onClose, onDownload }) {
  // Esc to close
  useEffect(() => {
    function handler(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  if (!torrent || !torrent._score) return null

  const score = torrent._score
  const parsed = score.parsed
  const normalized = normalizeScore(score.score)
  const grade = gradeFor(normalized)
  const warnings = buildWarnings(torrent, score)
  const breakdown = buildBreakdown(score)
  const totalGot = breakdown.reduce((a, r) => a + r.got, 0)
  const totalMax = breakdown.reduce((a, r) => a + r.max, 0)
  const hdrColor = parsed.hdr === 'SDR' ? 'var(--text-muted)' : '#fbbf24'
  const tiers = score.tiers || {}
  const ctxLabel = sizeContext(score.sizeGB, tiers, score.tier)
  const sizeBarPos = sizeBarPosition(score.sizeGB, tiers)
  const isPack = isSeasonPack(torrent.title)
  const etaSec = estimateDownloadTime(torrent.size || 0)
  const health = healthVerdict(torrent.seeders || 0, torrent.leechers || 0)
  const spanish = hasSpanishAudio(torrent.title)

  function handleDownload() {
    onDownload && onDownload(torrent)
  }

  return (
    <div className="tdp-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="tdp-panel" role="dialog" aria-label="Torrent details">
        <header className="tdp-header">
          <button className="tdp-close" onClick={onClose} aria-label="Close"><X size={18}/></button>
          <div className="tdp-grade-row">
            <div className="tdp-grade" style={{ background: grade.color, color: '#000' }}>
              {grade.letter}
            </div>
            <div className="tdp-grade-text">
              <div className="tdp-verdict" style={{ color: grade.color }}>{grade.verdict}</div>
              <div className="tdp-score-line">Score {normalized}/100</div>
            </div>
          </div>
          <h3 className="tdp-title">{torrent.title}</h3>
          <button className="tdp-download" onClick={handleDownload}>
            <Download size={16} /> Download
          </button>
        </header>

        {/* SECTION 1: Video Quality */}
        <section className="tdp-section">
          <h4>Video Quality</h4>
          <Row label="Resolution" value={RESOLUTION_LABEL[parsed.resolution] || 'Unknown'}>
            <Dots filled={RESOLUTION_DOTS[parsed.resolution] || 1} />
          </Row>
          <Row label="Source" value={SOURCE_LABEL[parsed.source] || 'Unknown'}>
            <Dots filled={SOURCE_DOTS[parsed.source] || 1} />
          </Row>
          <Row label="Codec" value={CODEC_LABEL[parsed.codec] || 'Unknown'} note={CODEC_NOTE[parsed.codec]}>
            <Dots filled={CODEC_DOTS[parsed.codec] || 2} />
          </Row>
          <Row label="HDR" value={HDR_LABEL[parsed.hdr] || 'SDR'}>
            <Dots filled={HDR_DOTS[parsed.hdr] || 2} color={hdrColor} />
          </Row>
        </section>

        {/* SECTION 2: Audio */}
        <section className="tdp-section">
          <h4>Audio</h4>
          <Row label="Format" value={AUDIO_LABEL[parsed.audio] || 'Unknown'} note={AUDIO_NOTE[parsed.audio]}>
            <Dots filled={AUDIO_DOTS[parsed.audio] || 1} />
          </Row>
          <Row label="Channels" value={channelLabel(torrent.title, parsed.audio)} />
          {spanish && (
            <div className="tdp-spanish-badge">🇲🇽 Spanish audio likely included (DUAL / MULTI / LATINO detected)</div>
          )}
        </section>

        {/* SECTION 3: File Analysis */}
        <section className="tdp-section">
          <h4>File Analysis</h4>
          <Row label="Size" value={formatBytes(torrent.size)} note={ctxLabel.label} />
          <div className="tdp-size-bar" title="Position within size brackets">
            <div className="tdp-size-track">
              {tiers.budget && tiers.value && tiers.quality && (
                <>
                  <div className="tdp-size-seg seg-budget" />
                  <div className="tdp-size-seg seg-value" />
                  <div className="tdp-size-seg seg-quality" />
                </>
              )}
              <div className="tdp-size-marker" style={{ left: `${sizeBarPos}%` }} />
            </div>
            <div className="tdp-size-legend">
              <span>Budget</span><span>Value</span><span>Quality (ideal)</span>
            </div>
          </div>
          <Row label="Compression"
               value={parsed.codec === 'AV1' ? 'Highly efficient (AV1)' :
                      parsed.codec === 'x265' ? 'Efficient (x265 / HEVC)' :
                      parsed.codec === 'x264' ? 'Standard (x264)' : 'Unknown / older codec'} />
          {isPack && context?.episode_count > 1 && (
            <Row label="Pack" value={`Multi-episode pack (${context.episode_count} episodes × ~${context.runtime_min || 45} min)`} />
          )}
        </section>

        {/* SECTION 4: Download Health */}
        <section className="tdp-section">
          <h4>Download Health</h4>
          <Row label="Seeds" value={<strong style={{ color: (torrent.seeders||0) >= 50 ? 'var(--green)' : (torrent.seeders||0) >= 10 ? 'var(--accent)' : 'var(--red)' }}>{torrent.seeders ?? 0}</strong>} />
          <Row label="Peers" value={String(torrent.leechers ?? 0)} />
          <Row label="S/P Ratio" value={(() => {
            const s = torrent.seeders || 0, p = torrent.leechers || 0
            const r = p === 0 ? (s > 0 ? Infinity : 0) : s / p
            return r === Infinity ? '∞ (no leechers, all seeds)' : r.toFixed(1)
          })()} />
          <Row label="Est. download" value={`~${formatDuration(etaSec)} at 50 Mbps`} />
          <div className={`tdp-health tdp-health-${health.color}`}>
            <span style={{ marginRight: 6 }}>{health.emoji}</span> {health.text}
          </div>
        </section>

        {/* SECTION 5: Warnings */}
        {warnings.length > 0 && (
          <section className="tdp-section">
            <h4>Warnings</h4>
            <div className="tdp-warnings">
              {warnings.map((w, i) => (
                <div key={i} className={`tdp-warning tone-${w.tone}`}>
                  <AlertTriangle size={14} />
                  <span>{w.text}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* SECTION 6: Score Breakdown */}
        <section className="tdp-section">
          <h4><Award size={14} style={{verticalAlign:'middle', marginRight:6}}/>Score Breakdown</h4>
          <div className="tdp-breakdown">
            {breakdown.map(r => (
              <div key={r.label} className="tdp-bd-row">
                <span className="tdp-bd-label">{r.label}</span>
                <div className="tdp-bd-bar">
                  <div className="tdp-bd-fill" style={{ width: `${(r.got / r.max) * 100}%` }} />
                </div>
                <span className="tdp-bd-num">{r.got}/{r.max}</span>
              </div>
            ))}
            <div className="tdp-bd-total">
              <span className="tdp-bd-label">Raw</span>
              <span className="tdp-bd-num">{totalGot}/{totalMax}</span>
            </div>
            <div className="tdp-bd-total">
              <span className="tdp-bd-label">Normalized</span>
              <span className="tdp-bd-num" style={{ color: grade.color, fontWeight: 700 }}>{normalized}/100 → {grade.letter}</span>
            </div>
          </div>
        </section>

      <style>{`
        .tdp-backdrop {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.5);
          z-index: 110;
          animation: fade-in 0.2s ease-out;
        }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        .tdp-panel {
          position: fixed; top: 0; right: 0; bottom: 0;
          width: 380px; max-width: 95vw;
          background: var(--surface);
          border-left: 1px solid var(--border);
          box-shadow: -8px 0 32px rgba(0,0,0,0.4);
          overflow-y: auto;
          animation: slide-in-right 0.3s ease-out;
          color: var(--text);
        }
        @keyframes slide-in-right { from { transform: translateX(100%); } to { transform: translateX(0); } }
        .tdp-header {
          position: sticky; top: 0;
          background: var(--surface);
          padding: 18px 20px 14px;
          border-bottom: 1px solid var(--border);
          z-index: 2;
        }
        .tdp-close {
          position: absolute; top: 12px; right: 12px;
          background: transparent; color: var(--text-muted);
          width: 28px; height: 28px;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
        }
        .tdp-close:hover { background: var(--surface2); color: var(--text); }
        .tdp-grade-row {
          display: flex; align-items: center; gap: 14px;
          margin-bottom: 14px;
        }
        .tdp-grade {
          width: 56px; height: 56px;
          border-radius: 12px;
          display: flex; align-items: center; justify-content: center;
          font-family: 'Bebas Neue', sans-serif;
          font-size: 1.75rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          flex-shrink: 0;
        }
        .tdp-grade-text { min-width: 0; }
        .tdp-verdict { font-size: 15px; font-weight: 600; }
        .tdp-score-line { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
        .tdp-title {
          font-family: 'DM Sans', sans-serif;
          font-size: 13px;
          line-height: 1.4;
          font-weight: 500;
          color: var(--text);
          word-break: break-word;
          margin: 0 0 14px;
        }
        .tdp-download {
          width: 100%;
          display: inline-flex; align-items: center; justify-content: center; gap: 6px;
          background: var(--accent); color: #000;
          padding: 10px 14px; border-radius: 6px;
          font-size: 13px; font-weight: 600;
          transition: background 0.15s;
        }
        .tdp-download:hover { background: #f0b040; }

        .tdp-section {
          padding: 16px 20px;
          border-bottom: 1px solid var(--border);
        }
        .tdp-section h4 {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-muted);
          margin: 0 0 12px;
          font-weight: 600;
        }

        .tdp-row {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 10px; align-items: center;
          padding: 6px 0;
          font-size: 13px;
        }
        .tdp-row + .tdp-row { border-top: 1px solid rgba(42,42,58,0.6); }
        .tdp-row-label { color: var(--text-muted); font-size: 12px; }
        .tdp-row-value { font-weight: 500; }
        .tdp-row-note {
          grid-column: 1 / -1;
          font-size: 11px; color: var(--text-muted);
          margin-top: 2px; line-height: 1.4;
        }
        .tdp-row-main {
          display: flex; align-items: center; justify-content: space-between;
          gap: 10px;
        }

        .dot-rating { display: inline-flex; gap: 3px; }
        .dot {
          width: 8px; height: 8px;
          border-radius: 50%;
          background: var(--surface2);
          border: 1px solid var(--border);
        }
        .dot.on { border-color: transparent; }

        .tdp-spanish-badge {
          margin-top: 10px;
          padding: 8px 10px;
          background: rgba(168, 85, 247, 0.12);
          border: 1px solid rgba(168, 85, 247, 0.4);
          color: #c084fc;
          font-size: 12px;
          border-radius: 6px;
        }

        .tdp-size-bar { margin: 10px 0 8px; }
        .tdp-size-track {
          position: relative;
          display: flex;
          height: 8px;
          border-radius: 4px;
          overflow: visible;
          background: var(--surface2);
        }
        .tdp-size-seg { flex: 1; height: 100%; }
        .seg-budget  { background: rgba(168,85,247,0.4); border-radius: 4px 0 0 4px; }
        .seg-value   { background: rgba(62,207,142,0.5); }
        .seg-quality { background: rgba(232,160,48,0.5); border-radius: 0 4px 4px 0; }
        .tdp-size-marker {
          position: absolute;
          top: -3px; bottom: -3px;
          width: 3px;
          background: var(--text);
          border-radius: 2px;
          transform: translateX(-50%);
        }
        .tdp-size-legend {
          display: flex; justify-content: space-between;
          font-size: 10px; color: var(--text-muted);
          margin-top: 4px;
        }

        .tdp-health {
          margin-top: 10px;
          padding: 10px 12px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 500;
          display: flex; align-items: center;
        }
        .tdp-health-green  { background: rgba(62,207,142,0.10); border: 1px solid rgba(62,207,142,0.4); color: var(--green); }
        .tdp-health-yellow { background: rgba(232,160,48,0.10); border: 1px solid rgba(232,160,48,0.4); color: var(--accent); }
        .tdp-health-red    { background: rgba(220,80,80,0.10); border: 1px solid rgba(220,80,80,0.4); color: var(--red); }

        .tdp-warnings { display: flex; flex-direction: column; gap: 8px; }
        .tdp-warning {
          display: flex; align-items: flex-start; gap: 8px;
          padding: 10px 12px;
          border-radius: 6px;
          font-size: 12px; line-height: 1.45;
        }
        .tdp-warning svg { flex-shrink: 0; margin-top: 1px; }
        .tone-red    { background: rgba(220,80,80,0.10); border: 1px solid rgba(220,80,80,0.4); color: #ff9999; }
        .tone-orange { background: rgba(255,160,60,0.10); border: 1px solid rgba(255,160,60,0.45); color: #ffb872; }

        .tdp-breakdown { display: flex; flex-direction: column; gap: 6px; }
        .tdp-bd-row {
          display: grid;
          grid-template-columns: 80px 1fr 50px;
          gap: 10px;
          align-items: center;
          font-size: 12px;
        }
        .tdp-bd-label { color: var(--text-muted); }
        .tdp-bd-bar {
          height: 6px;
          background: var(--surface2);
          border-radius: 3px;
          overflow: hidden;
        }
        .tdp-bd-fill {
          height: 100%;
          background: var(--accent);
          transition: width 0.4s ease;
        }
        .tdp-bd-num {
          text-align: right;
          font-variant-numeric: tabular-nums;
          color: var(--text);
        }
        .tdp-bd-total {
          display: flex; justify-content: space-between;
          font-size: 12px;
          padding-top: 8px;
          margin-top: 4px;
          border-top: 1px solid var(--border);
        }

        @media (max-width: 640px) {
          .tdp-panel {
            top: auto; bottom: 0; left: 0; right: 0;
            width: 100%; max-width: 100%;
            height: 85vh;
            border-left: none; border-top: 1px solid var(--border);
            border-radius: 16px 16px 0 0;
            animation: slide-in-bottom 0.3s ease-out;
          }
          @keyframes slide-in-bottom { from { transform: translateY(100%); } to { transform: translateY(0); } }
        }
      `}</style>
    </aside>
    </div>
  )
}

// Small helper for label/value rows. Children render on the right side.
function Row({ label, value, note, children }) {
  return (
    <div className="tdp-row">
      <div className="tdp-row-main">
        <span className="tdp-row-label">{label}</span>
        {children ? children : <span className="tdp-row-value">{value}</span>}
      </div>
      {children && value && <span className="tdp-row-value" style={{textAlign:'right'}}>{value}</span>}
      {note && <span className="tdp-row-note">{note}</span>}
    </div>
  )
}
