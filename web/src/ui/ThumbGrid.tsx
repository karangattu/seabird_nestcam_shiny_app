import { memo } from 'react'
import type { ImageItem } from './App'

export const ThumbGrid = memo(function ThumbGrid(props: {
  images: ImageItem[]
  selectedIndex: number
  onSelect: (index: number) => void
}) {
  const { images, selectedIndex, onSelect } = props
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 8, marginTop: 12 }}>
      {images.map((img, i) => (
        <button key={img.id} onClick={() => onSelect(i)} style={{ padding: 0, border: selectedIndex === i ? '2px solid #6366f1' : '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden', background: '#fff' }}>
          <img src={img.url} alt={img.filename} style={{ width: '100%', height: 64, objectFit: 'cover', display: 'block' }} />
        </button>
      ))}
    </div>
  )
})
