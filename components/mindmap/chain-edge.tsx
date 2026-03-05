'use client'

import { type EdgeProps } from '@xyflow/react'

/**
 * Chain edge — renders actual chain links along the path between nodes.
 * Alternates link orientation (parallel / perpendicular to path) for a
 * realistic chain look. The base line is kept faint; links carry the color.
 */
export default function ChainEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  style = {},
}: EdgeProps) {
  const dx = targetX - sourceX
  const dy = targetY - sourceY
  const length = Math.sqrt(dx * dx + dy * dy)
  if (length < 2) return null

  const angle = (Math.atan2(dy, dx) * 180) / Math.PI
  const strokeColor = (style as { stroke?: string }).stroke ?? '#6366f1'

  // Clear the source (root ~70px radius) and target (~48px radius) node edges
  const START_OFFSET = 76
  const END_OFFSET = 60
  const LINK_SPACING = 13
  const LINK_RX = 5.5   // half-length along path direction
  const LINK_RY = 2.8   // half-width cross direction

  const usable = length - START_OFFSET - END_OFFSET
  if (usable < LINK_SPACING) return null

  const count = Math.floor(usable / LINK_SPACING)

  const links = Array.from({ length: count }, (_, i) => {
    const t = (START_OFFSET + i * LINK_SPACING + LINK_SPACING / 2) / length
    return {
      x: sourceX + dx * t,
      y: sourceY + dy * t,
      // Even links run along the path, odd links are perpendicular
      rotation: angle + (i % 2 === 0 ? 0 : 90),
    }
  })

  // Faint guide line the full length
  const pathD = `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`

  return (
    <g>
      {/* Guide line — very faint */}
      <path
        id={id}
        d={pathD}
        stroke={strokeColor}
        strokeWidth={0.5}
        opacity={0.12}
        fill="none"
      />

      {/* Chain links */}
      {links.map((link, i) => (
        <ellipse
          key={i}
          cx={link.x}
          cy={link.y}
          rx={LINK_RX}
          ry={LINK_RY}
          fill="none"
          stroke={strokeColor}
          strokeWidth={1.6}
          opacity={0.7}
          transform={`rotate(${link.rotation} ${link.x} ${link.y})`}
        />
      ))}
    </g>
  )
}
