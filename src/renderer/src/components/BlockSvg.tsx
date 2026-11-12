import type { BlockDef, BlockShape } from '@shared/blocks'

/**
 * Miniatura SVG de um símbolo (biblioteca). Usa as mesmas formas do canvas,
 * com cores via CSS (currentColor / var(--block-fill)).
 */
export function BlockSvg({ def, size = 56 }: { def: BlockDef; size?: number }): React.JSX.Element {
  const pad = Math.max(def.width, def.height) * 0.06
  const vb = `${-pad} ${-pad} ${def.width + 2 * pad} ${def.height + 2 * pad}`
  return (
    <svg className="block-svg" width={size} height={size} viewBox={vb} preserveAspectRatio="xMidYMid meet" aria-hidden>
      {def.shapes.map((s, i) => (
        <SvgShape key={i} s={s} />
      ))}
    </svg>
  )
}

function SvgShape({ s }: { s: BlockShape }): React.JSX.Element {
  const fill = s.fill === 'fill' ? 'var(--block-fill)' : s.fill === 'ink' ? 'currentColor' : 'none'
  const weight = s.weight ?? 1
  const common = {
    fill,
    stroke: weight > 0 ? 'currentColor' : 'none',
    strokeWidth: 1.1 * weight,
    vectorEffect: 'non-scaling-stroke' as const,
    strokeDasharray: s.dash ? '3 2' : undefined,
    strokeLinejoin: 'round' as const
  }
  switch (s.kind) {
    case 'rect':
      return <rect {...common} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.r} />
    case 'ellipse':
      return <ellipse {...common} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} transform={s.rotation ? `rotate(${s.rotation} ${s.cx} ${s.cy})` : undefined} />
    case 'poly': {
      const pts = []
      for (let i = 0; i < s.points.length; i += 2) pts.push(`${s.points[i]},${s.points[i + 1]}`)
      return s.closed ? <polygon {...common} points={pts.join(' ')} /> : <polyline {...common} fill="none" points={pts.join(' ')} />
    }
    case 'arc': {
      const toXY = (deg: number): [number, number] => [s.cx + s.r * Math.cos((deg * Math.PI) / 180), s.cy + s.r * Math.sin((deg * Math.PI) / 180)]
      const [x1, y1] = toXY(s.start)
      const [x2, y2] = toXY(s.end)
      const large = Math.abs(s.end - s.start) > 180 ? 1 : 0
      const sweep = s.end > s.start ? 1 : 0
      return <path {...common} fill="none" d={`M ${x1} ${y1} A ${s.r} ${s.r} 0 ${large} ${sweep} ${x2} ${y2}`} />
    }
    case 'text':
      return (
        <text
          x={s.x}
          y={s.y + s.size}
          fontSize={s.size}
          fontWeight={600}
          textAnchor={s.align === 'center' ? 'middle' : 'start'}
          fill="currentColor"
          transform={s.rotation ? `rotate(${s.rotation} ${s.x} ${s.y})` : undefined}
        >
          {s.text}
        </text>
      )
  }
}
