import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Film, Image as ImageIcon, RotateCcw, Sparkles, Upload, CircleStop, CirclePlay } from 'lucide-react'
import { ThumbGrid } from './ThumbGrid'

export type ImageItem = {
  id: string
  url: string
  filename: string
  reviewed?: boolean
}

export type Annotation = {
  start?: boolean
  end?: boolean
  single?: boolean
  species?: string
  behavior?: string
  type?: 'Seabird' | 'Predator'
}

export function App() {
  const [images, setImages] = useState<ImageItem[]>([])
  const [idx, setIdx] = useState(0)
  const [ann, setAnn] = useState<Annotation>({})
  const [loading, setLoading] = useState(false)

  // fetch images from backend
  useEffect(() => {
    fetch('/api/images')
      .then((r) => r.json())
      .then((data: ImageItem[]) => setImages(data))
      .catch(() => setImages([]))
  }, [])

  const current = images[idx]

  const goPrev = () => setIdx((v: number) => (v > 0 ? v - 1 : v))
  const goNext = () => setIdx((v: number) => (v < images.length - 1 ? v + 1 : v))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev() }
      if (e.key === 'ArrowRight') { e.preventDefault(); goNext() }
  if (e.key.toLowerCase() === 's') setAnn((a: Annotation) => ({ ...a, start: !a.start }))
  if (e.key.toLowerCase() === 'e') setAnn((a: Annotation) => ({ ...a, end: !a.end }))
  if (e.key.toLowerCase() === 'i') setAnn((a: Annotation) => ({ ...a, single: !a.single }))
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true } as any)
  }, [])

  const markStart = () => setAnn((a: Annotation) => ({ ...a, start: !a.start }))
  const markEnd = () => setAnn((a: Annotation) => ({ ...a, end: !a.end }))
  const markSingle = () => setAnn((a: Annotation) => ({ ...a, single: !a.single }))

  const handleSync = async () => {
    if (!current) return
    setLoading(true)
    try {
      const payload = {
        annotations: [
          {
            imageId: current.id,
            filename: current.filename,
            start: !!ann.start,
            end: !!ann.end,
            single: !!ann.single,
            type: ann.type ?? null,
            species: ann.species ?? null,
            behavior: ann.behavior ?? null,
          },
        ],
      }
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      alert(`Synced ${data.count} annotation(s).`)
    } catch (e) {
      alert('Sync failed')
    } finally {
      setLoading(false)
    }
  }

  const handleClear = () => {
    setAnn({})
  }

  return (
    <div style={{ fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial', minHeight: '100vh', background: '#f6f7fb' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid #e5e7eb', background: '#fff' }}>
        <Sparkles size={18} />
        <h1 style={{ fontSize: 18, margin: 0, fontWeight: 600 }}>Seabird NestCam Annotation</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn" title="Refresh data">
            <RotateCcw size={16} /> Refresh
          </button>
          <button className="btn btn-primary" title="Sync to Google Sheets">
            <Upload size={16} /> Sync
          </button>
        </div>
      </header>

      <main style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, padding: 16 }}>
        <section style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <button className="icon-btn" onClick={goPrev} aria-label="Previous"><ChevronLeft /></button>
            <div style={{ flex: 1, textAlign: 'center', color: '#6b7280', fontSize: 12 }}>Use ←/→ to navigate • S = Start • E = End • I = Single</div>
            <button className="icon-btn" onClick={goNext} aria-label="Next"><ChevronRight /></button>
          </div>

          <div style={{ height: 520, display: 'grid', placeItems: 'center', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fafafa' }}>
            {current ? (
              <img src={current.url} alt={current.filename} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
            ) : (
              <div style={{ color: '#9ca3af' }}>No image selected</div>
            )}
          </div>

          <ThumbGrid images={images} selectedIndex={idx} onSelect={setIdx} />
        </section>

        <aside style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg,#7048e8,#9b59b6)', color: '#fff', padding: 12, borderRadius: 6 }}>
            <Film size={18} />
            <div style={{ fontWeight: 600 }}>Sequence Annotation</div>
          </div>

          <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
            <div className="card">
              <div className="card-title">Current file</div>
              <div className="card-body">{current?.filename ?? '—'}</div>
            </div>

            <div className="card">
              <div className="card-title">Mark</div>
              <div className="card-body" style={{ display: 'grid', gap: 8 }}>
                <button className={`btn ${ann.start ? 'btn-success' : ''}`} onClick={markStart}>
                  <CirclePlay size={16} /> Start <kbd className='kbd'>S</kbd>
                </button>
                <button className={`btn ${ann.end ? 'btn-warning' : ''}`} onClick={markEnd}>
                  <CircleStop size={16} /> End <kbd className='kbd'>E</kbd>
                </button>
                <button className={`btn ${ann.single ? 'btn-info' : ''}`} onClick={markSingle}>
                  <ImageIcon size={16} /> Single <kbd className='kbd'>I</kbd>
                </button>
              </div>
            </div>

            <div className="card">
              <div className="card-title">Details</div>
              <div className="card-body" style={{ display: 'grid', gap: 8 }}>
                <label className="label">Type</label>
                <select className="input" value={ann.type ?? ''} onChange={(e) => setAnn((a) => ({ ...a, type: (e.target.value || undefined) as any }))}>
                  <option value="">—</option>
                  <option>Seabird</option>
                  <option>Predator</option>
                </select>
                <label className="label">Species</label>
                <input className="input" value={ann.species ?? ''} onChange={(e) => setAnn((a) => ({ ...a, species: e.target.value || undefined }))} />
                <label className="label">Behavior</label>
                <input className="input" value={ann.behavior ?? ''} onChange={(e) => setAnn((a) => ({ ...a, behavior: e.target.value || undefined }))} />
              </div>
            </div>

            <div className="card">
              <div className="card-title">Actions</div>
              <div className="card-body" style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={handleSync} disabled={loading}>
                  <Upload size={16}/> {loading ? 'Syncing…' : 'Sync'}
                </button>
                <button className="btn" onClick={handleClear}><RotateCcw size={16}/> Clear</button>
              </div>
            </div>
          </div>
        </aside>
      </main>
    </div>
  )
}
