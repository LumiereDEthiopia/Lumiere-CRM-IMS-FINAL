/**
 * DonutChart — pure SVG circle chart, no external dependencies.
 * data: [{ name, value }] — values are summed for percentage shares.
 */
import { etb } from '../lib/currency.js'

const PALETTE = ['#c9a96e', '#6366f1', '#10b981', '#f59e0b', '#ec4899', '#3b82f6', '#a855f7', '#ef4444', '#14b8a6', '#8b5cf6', '#f97316', '#06b6d4']

export default function DonutChart({ data = [], size = 190, thickness = 28, centerTitle = 'Total', money = true }) {
  const items = (data || []).filter((d) => Number(d.value) > 0)
  const total = items.reduce((s, d) => s + Number(d.value), 0)
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius

  let offset = 0
  const segments = items.map((d, i) => {
    const frac = total > 0 ? Number(d.value) / total : 0
    const seg = {
      name: d.name,
      value: Number(d.value),
      color: PALETTE[i % PALETTE.length],
      dash: frac * circumference,
      offset
    }
    offset += seg.dash
    return seg
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="circle chart">
          {/* track */}
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f0f0f0" strokeWidth={thickness} />
          {segments.map((s, i) => (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${s.dash} ${circumference - s.dash}`}
              strokeDashoffset={-s.offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              strokeLinecap="butt"
            >
              <title>{`${s.name}: ${money ? etb(s.value) : s.value} (${total > 0 ? Math.round((s.value / total) * 100) : 0}%)`}</title>
            </circle>
          ))}
          {/* center totals */}
          <text x="50%" y="47%" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: size * 0.09, fill: '#6b6b6b', fontWeight: 500 }}>
            {centerTitle}
          </text>
          <text x="50%" y="58%" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: size * 0.105, fill: '#1a1a1a', fontWeight: 600 }}>
            {money ? etb(total) : total}
          </text>
        </svg>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        {segments.map((s, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
            <span style={{ color: '#1a1a1a', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
            <span style={{ color: '#6b6b6b' }}>{total > 0 ? Math.round((s.value / total) * 100) : 0}%</span>
            <span style={{ color: '#9a9a9a', minWidth: 90, textAlign: 'right' }}>{money ? etb(s.value) : s.value}</span>
          </li>
        ))}
        {!segments.length && <li style={{ color: '#9a9a9a', fontSize: '0.85rem' }}>No data yet.</li>}
      </ul>
    </div>
  )
}