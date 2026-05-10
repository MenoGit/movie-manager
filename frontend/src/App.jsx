import './index.css'
import { Film } from 'lucide-react'
import Home from './pages/Home'

export default function App() {
  return (
    <div>
      <header className="app-header">
        <div className="app-logo">
          <Film size={22} />
          <span>FILMVAULT</span>
        </div>
      </header>
      <main>
        <Home />
      </main>

      <style>{`
        .app-header {
          border-bottom: 1px solid var(--border);
          padding: 16px 24px;
          display: flex;
          align-items: center;
          background: rgba(10,10,15,0.9);
          backdrop-filter: blur(12px);
          position: sticky; top: 0; z-index: 50;
        }
        .app-logo {
          display: flex; align-items: center; gap: 10px;
          font-family: 'Bebas Neue', sans-serif;
          font-size: 1.5rem;
          letter-spacing: 0.1em;
          color: var(--accent);
        }
      `}</style>
    </div>
  )
}
